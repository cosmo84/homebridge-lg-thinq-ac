import {
  PlatformAccessory,
  Service,
  CharacteristicValue,
} from 'homebridge';
import { LgThinQAcPlatform } from './platform';
import { DeviceInfo, controlErrorDetail } from './api';
import {
  AC_MODE,
  AC_OPERATION,
  TEMPERATURE_MIN_C,
  TEMPERATURE_MAX_C,
  WIND_STRENGTH_TO_PCT,
  buildWindStrengthPctTable,
  pctToWindStrength,
  windStrengthMinStep,
} from './settings';

interface AcState {
  isOn: boolean;
  mode: string;
  /** Last HEAT/COOL/AUTO selection. Distinct from `mode`, which the device may
   * also report as FAN or AIR_DRY when set from its remote or the LG app —
   * neither of which HomeKit's HeaterCooler can represent. */
  lastConventionalMode: string;
  currentTempC: number;
  targetTempC: number;
  windStrength: string;
  swingUpDown: boolean;
}

/** Writable bounds of a `type: "range"` profile field. */
interface TempRange {
  min: number;
  max: number;
  step: number;
}

/**
 * Which optional features the device actually supports, derived from its
 * profile. We only expose (and send control commands for) supported features,
 * so unsupported ones (e.g. swing on a model without it) can't fail and drag
 * the whole accessory into "No Response" in HomeKit. When no profile is
 * available we fall back to exposing everything, matching prior behaviour.
 */
interface Capabilities {
  hasProfile: boolean;
  /**
   * The windDirection field HomeKit's single SwingMode toggle drives, or
   * undefined when the device has no controllable swing. Devices can expose
   * `rotateUpDown` and `rotateLeftRight` independently; HomeKit has only one
   * switch, so we bind it to the vertical axis (what SwingMode conventionally
   * means) and leave the other axis to the LG app rather than overwriting a
   * setting the user never touched here.
   */
  swingField?: 'rotateUpDown' | 'rotateLeftRight';
  windStrength: boolean;
  windStrengthValues?: string[];
  modes?: Set<string>;
  heatTempRange?: TempRange;
  coolTempRange?: TempRange;
  autoTempRange?: TempRange;
}

export class AirConditionerAccessory {
  private readonly service: Service;
  private readonly caps: Capabilities;
  private readonly windStrengthPct: Record<string, number>;
  /** Chains sendControl() calls so only one is ever in flight — see sendControl(). */
  private controlQueue: Promise<void> = Promise.resolve();
  private state: AcState = {
    isOn: false,
    mode: AC_MODE.COOL,
    lastConventionalMode: AC_MODE.COOL,
    currentTempC: 22,
    targetTempC: 22,
    windStrength: 'AUTO',
    swingUpDown: false,
  };

  constructor(
    private readonly platform: LgThinQAcPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly device: DeviceInfo,
    profile?: Record<string, unknown>,
  ) {
    const { Service, Characteristic } = platform;
    const caps = parseCapabilities(profile);
    this.caps = caps;
    this.windStrengthPct = caps.windStrengthValues
      ? buildWindStrengthPctTable(caps.windStrengthValues)
      : WIND_STRENGTH_TO_PCT;

    this.platform.log.info(
      `[${device.alias}] Capabilities: swing=${caps.swingField ?? 'none'}, `
      + `windStrength=${caps.windStrength ? Object.keys(this.windStrengthPct).join('/') : 'no'}, `
      + `modes=${caps.modes ? [...caps.modes].join('/') : 'unknown'}`
      + (caps.hasProfile ? '' : ' (no profile — exposing all features)'),
    );

    this.accessory.getService(Service.AccessoryInformation)!
      .setCharacteristic(Characteristic.Manufacturer, 'LG')
      .setCharacteristic(Characteristic.Model, device.modelName || 'AC')
      .setCharacteristic(Characteristic.SerialNumber, device.deviceId);

    this.service = this.accessory.getService(Service.HeaterCooler)
      ?? this.accessory.addService(Service.HeaterCooler);

    this.service.setCharacteristic(Characteristic.Name, device.alias);

    this.service.getCharacteristic(Characteristic.Active)
      .onGet(() =>
        this.state.isOn ? Characteristic.Active.ACTIVE : Characteristic.Active.INACTIVE,
      )
      .onSet(async (value: CharacteristicValue) => {
        this.state.isOn = value === Characteristic.Active.ACTIVE;
        await this.sendControl('Power', {
          operation: { airConOperationMode: this.state.isOn ? AC_OPERATION.ON : AC_OPERATION.OFF },
        });
      });

    this.service.getCharacteristic(Characteristic.CurrentHeaterCoolerState)
      .onGet(() => this.currentHcState());

    const targetModeChar = this.service.getCharacteristic(Characteristic.TargetHeaterCoolerState);
    const validModes = this.homekitTargetModes(caps.modes);
    if (validModes && validModes.length > 0) {
      targetModeChar.setProps({ validValues: validModes });
    }
    targetModeChar
      .onGet(() => this.targetModeCharValue(this.state.lastConventionalMode))
      .onSet(async (value: CharacteristicValue) => {
        switch (value) {
          case Characteristic.TargetHeaterCoolerState.HEAT: this.state.mode = AC_MODE.HEAT; break;
          case Characteristic.TargetHeaterCoolerState.AUTO: this.state.mode = AC_MODE.AUTO; break;
          default: this.state.mode = AC_MODE.COOL;
        }
        this.state.lastConventionalMode = this.state.mode;
        await this.sendControl('Mode', {
          airConJobMode: { currentJobMode: this.state.mode },
        });
        this.applyTempRangeProps(this.state.mode);
        this.service.updateCharacteristic(
          Characteristic.CurrentHeaterCoolerState, this.currentHcState(),
        );
      });

    this.service.getCharacteristic(Characteristic.CurrentTemperature)
      .onGet(() => this.state.currentTempC);

    for (const char of [
      Characteristic.CoolingThresholdTemperature,
      Characteristic.HeatingThresholdTemperature,
    ]) {
      this.service.getCharacteristic(char)
        .onGet(() => this.state.targetTempC)
        .onSet(async (value: CharacteristicValue) => {
          this.state.targetTempC = value as number;
          await this.sendControl('Temperature', {
            temperature: { targetTemperature: value },
          });
        });
    }

    // Temperature bounds depend on the selected mode (a live profile reports Heat
    // 16-30°C, Cool/Auto 18-30°C, 0.5° steps). Seed them for the starting mode;
    // onSet and updateState() re-apply them whenever the mode changes.
    this.applyTempRangeProps(this.state.mode);

    // 0.1.8-beta.1 briefly added StatusFault here, which HAP does not list as a
    // characteristic of HeaterCooler. It persists in the accessory cache, so it has
    // to be taken off accessories restored from cache — no longer adding it leaves
    // existing installations unchanged.
    this.removeCharacteristicIfPresent(Characteristic.StatusFault);

    // RotationSpeed and SwingMode are optional characteristics: only expose them
    // when the device supports them, and strip them from cached accessories that
    // no longer (or never did) support them so stale controls stop erroring.
    if (caps.windStrength) {
      // minStep snaps the slider to the device's named speeds (e.g. 25 for a
      // LOW/MID/HIGH/AUTO device) instead of a 1-100 range we'd only round anyway.
      this.service.getCharacteristic(Characteristic.RotationSpeed)
        .setProps({ minValue: 0, maxValue: 100, minStep: windStrengthMinStep(this.windStrengthPct) })
        .onGet(() => this.windStrengthPct[this.state.windStrength] ?? 100)
        .onSet(async (value: CharacteristicValue) => {
          const strength = pctToWindStrength(value as number, this.windStrengthPct);
          this.state.windStrength = strength;
          await this.sendControl('WindStrength', {
            airFlow: { windStrength: strength },
          });
        });
    } else {
      this.removeCharacteristicIfPresent(Characteristic.RotationSpeed);
    }

    const swingField = caps.swingField;
    if (swingField) {
      this.service.getCharacteristic(Characteristic.SwingMode)
        .onGet(() =>
          this.state.swingUpDown
            ? Characteristic.SwingMode.SWING_ENABLED
            : Characteristic.SwingMode.SWING_DISABLED,
        )
        .onSet(async (value: CharacteristicValue) => {
          this.state.swingUpDown = value === Characteristic.SwingMode.SWING_ENABLED;
          await this.sendControl('SwingMode', {
            windDirection: { [swingField]: this.state.swingUpDown },
          });
        });
    } else {
      this.removeCharacteristicIfPresent(Characteristic.SwingMode);
    }

    this.refreshState();
  }

  /**
   * Sends a control command and logs LG's actual error detail on failure.
   *
   * Calls are serialized per device via `controlQueue`. A HomeKit Scene sets
   * several characteristics at once (power, both temperature thresholds, swing,
   * fan speed), and hap-nodejs fires all those onSet handlers simultaneously.
   * Overlapping requests to LG's API get rejected with a generic "Fail device
   * control" even though each one is individually valid. A single tap only ever
   * changes one characteristic, which is why this never showed up interactively.
   */
  private sendControl(label: string, body: Record<string, unknown>): Promise<void> {
    const run = async () => {
      try {
        await this.platform.thinqApi.controlDevice(this.device.deviceId, body);
      } catch (err) {
        this.platform.log.error(
          `[${this.device.alias}] ${label} control failed: ${controlErrorDetail(err)}`,
        );
        throw err; // let HomeKit surface "No Response" for this characteristic
      }
    };
    const result = this.controlQueue.then(run, run);
    // The queue tail must never reject, or nothing after a failure would ever run.
    this.controlQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private removeCharacteristicIfPresent(char: any) {
    if (this.service.testCharacteristic(char)) {
      this.service.removeCharacteristic(this.service.getCharacteristic(char));
    }
  }

  /** Maps the device's writable job modes to the HomeKit TargetHeaterCoolerState values. */
  private homekitTargetModes(modes?: Set<string>): number[] | undefined {
    if (!modes) return undefined;
    const { Characteristic } = this.platform;
    const values = new Set<number>();
    for (const m of modes) {
      if (m === AC_MODE.HEAT) values.add(Characteristic.TargetHeaterCoolerState.HEAT);
      else if (m === AC_MODE.AUTO) values.add(Characteristic.TargetHeaterCoolerState.AUTO);
      else if (m === AC_MODE.COOL) values.add(Characteristic.TargetHeaterCoolerState.COOL);
    }
    // If none of the modes map to a HomeKit state, don't restrict (avoid empty validValues).
    // Sorted because the set's iteration order follows the device's profile, and
    // validValues is conventionally ascending.
    return values.size > 0 ? [...values].sort((a, b) => a - b) : undefined;
  }

  /** Maps a HEAT/AUTO/COOL mode to its HomeKit TargetHeaterCoolerState value. */
  private targetModeCharValue(mode: string): number {
    const { Characteristic } = this.platform;
    switch (mode) {
      case AC_MODE.HEAT: return Characteristic.TargetHeaterCoolerState.HEAT;
      case AC_MODE.AUTO: return Characteristic.TargetHeaterCoolerState.AUTO;
      default:           return Characteristic.TargetHeaterCoolerState.COOL;
    }
  }

  /** The device's writable temperature bounds for `mode`, falling back to the
   * generic constants when the profile carries no range for it. */
  private tempRangeForMode(mode: string): { minValue: number; maxValue: number; minStep: number } {
    const range = mode === AC_MODE.HEAT ? this.caps.heatTempRange
      : mode === AC_MODE.AUTO ? this.caps.autoTempRange
        : this.caps.coolTempRange;
    return range
      ? { minValue: range.min, maxValue: range.max, minStep: range.step }
      : { minValue: TEMPERATURE_MIN_C, maxValue: TEMPERATURE_MAX_C, minStep: 1 };
  }

  /**
   * Applies the device's own temperature bounds to both threshold characteristics.
   *
   * HAP caps HeatingThresholdTemperature at 25 °C, below the 30 °C LG units accept,
   * so the upper bound deliberately exceeds it. Clamping to 25 was tried and gives
   * up a usable part of the heating range for no observable benefit: the Home app
   * renders and controls these accessories correctly either way.
   */
  private applyTempRangeProps(mode: string) {
    const { Characteristic } = this.platform;
    const props = this.tempRangeForMode(mode);
    // Push the current value first so hap-nodejs' own value/props reconciliation
    // inside setProps() never has to clamp a stale default against new bounds.
    this.service.updateCharacteristic(Characteristic.CoolingThresholdTemperature, this.state.targetTempC);
    this.service.updateCharacteristic(Characteristic.HeatingThresholdTemperature, this.state.targetTempC);
    this.service.getCharacteristic(Characteristic.CoolingThresholdTemperature).setProps(props);
    this.service.getCharacteristic(Characteristic.HeatingThresholdTemperature).setProps(props);
  }

  private currentHcState(): number {
    const { Characteristic } = this.platform;
    if (!this.state.isOn) return Characteristic.CurrentHeaterCoolerState.INACTIVE;
    if (this.state.mode === AC_MODE.HEAT) return Characteristic.CurrentHeaterCoolerState.HEATING;
    if (this.state.mode === AC_MODE.COOL) return Characteristic.CurrentHeaterCoolerState.COOLING;
    return Characteristic.CurrentHeaterCoolerState.IDLE;
  }

  private async refreshState() {
    try {
      const state = await this.platform.thinqApi.getDeviceStatus(this.device.deviceId);
      this.updateState(state);
    } catch (err) {
      this.platform.log.error(
        `[${this.device.deviceId}] Initial state fetch failed:`, (err as Error).message,
      );
    }
  }

  updateState(data: Record<string, unknown>) {
    const { Characteristic } = this.platform;

    const jobMode      = nested(data, 'airConJobMode', 'currentJobMode') as string | undefined;
    const operation    = nested(data, 'operation', 'airConOperationMode') as string | undefined;
    const currentTemp  = nested(data, 'temperature', 'currentTemperature') as number | undefined;
    const targetTemp   = nested(data, 'temperature', 'targetTemperature') as number | undefined;
    const windStrength = nested(data, 'airFlow', 'windStrength') as string | undefined;
    const swingUpDown  = this.caps.swingField
      ? nested(data, 'windDirection', this.caps.swingField) as boolean | undefined
      : undefined;

    if (operation !== undefined) {
      this.state.isOn = operation === AC_OPERATION.ON;
      this.service.updateCharacteristic(
        Characteristic.Active,
        this.state.isOn ? Characteristic.Active.ACTIVE : Characteristic.Active.INACTIVE,
      );
    }
    if (jobMode !== undefined) {
      this.state.mode = jobMode;
      // FAN and AIR_DRY have no HeaterCooler equivalent, so only a conventional
      // mode updates what HomeKit shows as the target state.
      if (jobMode === AC_MODE.HEAT || jobMode === AC_MODE.COOL || jobMode === AC_MODE.AUTO) {
        if (this.state.lastConventionalMode !== jobMode) {
          this.state.lastConventionalMode = jobMode;
          this.service.updateCharacteristic(
            Characteristic.TargetHeaterCoolerState, this.targetModeCharValue(jobMode),
          );
        }
        this.applyTempRangeProps(jobMode);
      }
      this.service.updateCharacteristic(
        Characteristic.CurrentHeaterCoolerState, this.currentHcState(),
      );
    }
    if (currentTemp !== undefined) {
      this.state.currentTempC = currentTemp;
      this.service.updateCharacteristic(Characteristic.CurrentTemperature, currentTemp);
    }
    if (targetTemp !== undefined) {
      this.state.targetTempC = targetTemp;
      this.service.updateCharacteristic(Characteristic.CoolingThresholdTemperature, targetTemp);
      this.service.updateCharacteristic(Characteristic.HeatingThresholdTemperature, targetTemp);
    }
    if (windStrength !== undefined && this.service.testCharacteristic(Characteristic.RotationSpeed)) {
      this.state.windStrength = windStrength;
      this.service.updateCharacteristic(
        Characteristic.RotationSpeed, this.windStrengthPct[windStrength] ?? 100,
      );
    }
    if (swingUpDown !== undefined && this.service.testCharacteristic(Characteristic.SwingMode)) {
      this.state.swingUpDown = swingUpDown === true;
      this.service.updateCharacteristic(
        Characteristic.SwingMode,
        this.state.swingUpDown
          ? Characteristic.SwingMode.SWING_ENABLED
          : Characteristic.SwingMode.SWING_DISABLED,
      );
    }
  }
}

function nested(obj: Record<string, unknown>, ...keys: string[]): unknown {
  let cur: unknown = obj;
  for (const k of keys) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

/** Flattens a device profile's `property` (object, or array for multi-unit devices). */
function properties(profile?: Record<string, unknown>): Record<string, unknown> {
  const p = profile?.['property'];
  if (Array.isArray(p)) {
    return Object.assign({}, ...p.filter(x => x && typeof x === 'object'));
  }
  if (p && typeof p === 'object') {
    return p as Record<string, unknown>;
  }
  return {};
}

/** Returns whether `property.<resource>.<field>` is writable, plus its writable enum values. */
function writable(
  props: Record<string, unknown>, resource: string, field: string,
): { isWritable: boolean; wValues?: string[] } {
  const res = props[resource];
  const f = res && typeof res === 'object'
    ? (res as Record<string, unknown>)[field]
    : undefined;
  if (!f || typeof f !== 'object') return { isWritable: false };
  const mode = (f as Record<string, unknown>)['mode'];
  const isWritable = Array.isArray(mode) && mode.includes('w');
  const wValuesRaw = ((f as Record<string, unknown>)['value'] as Record<string, unknown> | undefined)?.['w'];
  const wValues = Array.isArray(wValuesRaw) ? wValuesRaw.map(String) : undefined;
  return { isWritable, wValues };
}

/** Returns the writable {min,max,step} bounds of a `type: "range"` profile field, if any. */
function writableRange(
  props: Record<string, unknown>, resource: string, field: string,
): TempRange | undefined {
  const res = props[resource];
  const f = res && typeof res === 'object'
    ? (res as Record<string, unknown>)[field]
    : undefined;
  if (!f || typeof f !== 'object') return undefined;
  const w = ((f as Record<string, unknown>)['value'] as Record<string, unknown> | undefined)?.['w'];
  if (!w || typeof w !== 'object' || typeof (w as Record<string, unknown>)['min'] !== 'number') {
    return undefined;
  }
  const { min, max, step } = w as { min: number; max: number; step?: number };
  return { min, max, step: step ?? 0.5 };
}

function parseCapabilities(profile?: Record<string, unknown>): Capabilities {
  const props = properties(profile);
  // No usable profile → expose everything, preserving the previous behaviour.
  if (Object.keys(props).length === 0) {
    return { hasProfile: false, swingField: 'rotateUpDown', windStrength: true };
  }
  // Prefer the vertical axis; a device that only swings horizontally still gets
  // a working SwingMode toggle bound to that axis instead of none at all.
  const swingField = writable(props, 'windDirection', 'rotateUpDown').isWritable ? 'rotateUpDown'
    : writable(props, 'windDirection', 'rotateLeftRight').isWritable ? 'rotateLeftRight'
      : undefined;
  const windStrength = writable(props, 'airFlow', 'windStrength');
  const jobModes = writable(props, 'airConJobMode', 'currentJobMode').wValues;
  return {
    hasProfile: true,
    swingField,
    windStrength: windStrength.isWritable,
    windStrengthValues: windStrength.wValues,
    modes: jobModes ? new Set(jobModes) : undefined,
    heatTempRange: writableRange(props, 'temperature', 'heatTargetTemperature'),
    coolTempRange: writableRange(props, 'temperature', 'coolTargetTemperature'),
    autoTempRange: writableRange(props, 'temperature', 'autoTargetTemperature'),
  };
}
