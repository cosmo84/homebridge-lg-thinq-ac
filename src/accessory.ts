import {
  PlatformAccessory,
  Service,
  CharacteristicValue,
} from 'homebridge';
import { LgThinQAcPlatform } from './platform';
import { DeviceInfo } from './api';
import {
  AC_MODE,
  AC_OPERATION,
  TEMPERATURE_MIN_C,
  TEMPERATURE_MAX_C,
  WIND_STRENGTH_TO_PCT,
  pctToWindStrength,
} from './settings';

interface AcState {
  isOn: boolean;
  mode: string;
  currentTempC: number;
  targetTempC: number;
  windStrength: string;
  swingUpDown: boolean;
}

export class AirConditionerAccessory {
  private readonly service: Service;
  private state: AcState = {
    isOn: false,
    mode: AC_MODE.COOL,
    currentTempC: 22,
    targetTempC: 22,
    windStrength: 'AUTO',
    swingUpDown: false,
  };

  constructor(
    private readonly platform: LgThinQAcPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly device: DeviceInfo,
  ) {
    const { Service, Characteristic } = platform;

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
        await this.platform.thinqApi.controlDevice(device.deviceId, {
          operation: { airConOperationMode: this.state.isOn ? AC_OPERATION.ON : AC_OPERATION.OFF },
        });
      });

    this.service.getCharacteristic(Characteristic.CurrentHeaterCoolerState)
      .onGet(() => this.currentHcState());

    this.service.getCharacteristic(Characteristic.TargetHeaterCoolerState)
      .onGet(() => {
        switch (this.state.mode) {
          case AC_MODE.HEAT: return Characteristic.TargetHeaterCoolerState.HEAT;
          case AC_MODE.AUTO: return Characteristic.TargetHeaterCoolerState.AUTO;
          default:           return Characteristic.TargetHeaterCoolerState.COOL;
        }
      })
      .onSet(async (value: CharacteristicValue) => {
        switch (value) {
          case Characteristic.TargetHeaterCoolerState.HEAT: this.state.mode = AC_MODE.HEAT; break;
          case Characteristic.TargetHeaterCoolerState.AUTO: this.state.mode = AC_MODE.AUTO; break;
          default: this.state.mode = AC_MODE.COOL;
        }
        await this.platform.thinqApi.controlDevice(device.deviceId, {
          airConJobMode: { currentJobMode: this.state.mode },
        });
        this.service.updateCharacteristic(
          Characteristic.CurrentHeaterCoolerState, this.currentHcState(),
        );
      });

    this.service.getCharacteristic(Characteristic.CurrentTemperature)
      .onGet(() => this.state.currentTempC);

    this.service.getCharacteristic(Characteristic.CoolingThresholdTemperature)
      .setProps({ minValue: TEMPERATURE_MIN_C, maxValue: TEMPERATURE_MAX_C, minStep: 1 })
      .onGet(() => this.state.targetTempC)
      .onSet(async (value: CharacteristicValue) => {
        this.state.targetTempC = value as number;
        await this.platform.thinqApi.controlDevice(device.deviceId, {
          temperature: { targetTemperature: value },
        });
      });

    this.service.getCharacteristic(Characteristic.HeatingThresholdTemperature)
      .setProps({ minValue: TEMPERATURE_MIN_C, maxValue: TEMPERATURE_MAX_C, minStep: 1 })
      .onGet(() => this.state.targetTempC)
      .onSet(async (value: CharacteristicValue) => {
        this.state.targetTempC = value as number;
        await this.platform.thinqApi.controlDevice(device.deviceId, {
          temperature: { targetTemperature: value },
        });
      });

    this.service.getCharacteristic(Characteristic.RotationSpeed)
      .setProps({ minValue: 0, maxValue: 100, minStep: 1 })
      .onGet(() => WIND_STRENGTH_TO_PCT[this.state.windStrength] ?? 100)
      .onSet(async (value: CharacteristicValue) => {
        const strength = pctToWindStrength(value as number);
        this.state.windStrength = strength;
        await this.platform.thinqApi.controlDevice(device.deviceId, {
          airFlow: { windStrength: strength },
        });
      });

    this.service.getCharacteristic(Characteristic.SwingMode)
      .onGet(() =>
        this.state.swingUpDown
          ? Characteristic.SwingMode.SWING_ENABLED
          : Characteristic.SwingMode.SWING_DISABLED,
      )
      .onSet(async (value: CharacteristicValue) => {
        this.state.swingUpDown = value === Characteristic.SwingMode.SWING_ENABLED;
        await this.platform.thinqApi.controlDevice(device.deviceId, {
          windDirection: { windRotateUpDown: this.state.swingUpDown },
        });
      });

    this.refreshState();
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
    const swingUpDown  = nested(data, 'windDirection', 'windRotateUpDown') as boolean | undefined;

    if (operation !== undefined) {
      this.state.isOn = operation === AC_OPERATION.ON;
      this.service.updateCharacteristic(
        Characteristic.Active,
        this.state.isOn ? Characteristic.Active.ACTIVE : Characteristic.Active.INACTIVE,
      );
    }
    if (jobMode !== undefined) {
      this.state.mode = jobMode;
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
    if (windStrength !== undefined) {
      this.state.windStrength = windStrength;
      this.service.updateCharacteristic(
        Characteristic.RotationSpeed, WIND_STRENGTH_TO_PCT[windStrength] ?? 100,
      );
    }
    if (swingUpDown !== undefined) {
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
