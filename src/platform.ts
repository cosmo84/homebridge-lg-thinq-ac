import {
  API,
  DynamicPlatformPlugin,
  Logger,
  PlatformAccessory,
  PlatformConfig,
  Service,
  Characteristic,
} from 'homebridge';
import { v4 as uuidv4 } from 'uuid';
import { PLUGIN_NAME, PLATFORM_NAME } from './settings';
import { AirConditionerAccessory } from './accessory';
import { ThinQApi, DeviceInfo } from './api';

const AC_DEVICE_TYPE = 'DEVICE_AIR_CONDITIONER';
const POLL_INTERVAL_MS = 60_000;

export class LgThinQAcPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;
  public readonly thinqApi: ThinQApi;

  private readonly cachedAccessories = new Map<string, PlatformAccessory>();
  private readonly deviceAccessories = new Map<string, AirConditionerAccessory>();
  private pollTimer?: ReturnType<typeof setInterval>;

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;

    this.thinqApi = new ThinQApi(
      config['accessToken'] as string,
      (config['countryCode'] as string | undefined) ?? 'DE',
      uuidv4(),
    );

    this.api.on('didFinishLaunching', () => this.initialize());
    this.api.on('shutdown', () => {
      if (this.pollTimer) {
        clearInterval(this.pollTimer);
      }
    });
  }

  configureAccessory(accessory: PlatformAccessory) {
    this.cachedAccessories.set(accessory.UUID, accessory);
  }

  private async initialize() {
    await this.discoverDevices();
    if (this.deviceAccessories.size > 0) {
      this.pollTimer = setInterval(() => this.pollAllDevices(), POLL_INTERVAL_MS);
    }
  }

  private async discoverDevices() {
    let devices: DeviceInfo[];
    try {
      const all = await this.thinqApi.getDevices();
      devices = all.filter(d => d.deviceType === AC_DEVICE_TYPE);
    } catch (err) {
      this.log.error('Failed to fetch device list:', (err as Error).message);
      return;
    }

    this.log.info(`Found ${devices.length} LG AC device(s)`);

    for (const device of devices) {
      const uuid = this.api.hap.uuid.generate(device.deviceId);
      const existingAccessory = this.cachedAccessories.get(uuid);
      const accessory = existingAccessory
        ?? new this.api.platformAccessory(device.alias || device.deviceId, uuid);

      accessory.context['device'] = device;

      const acAccessory = new AirConditionerAccessory(this, accessory, device);
      this.deviceAccessories.set(device.deviceId, acAccessory);

      if (existingAccessory) {
        this.api.updatePlatformAccessories([existingAccessory]);
      } else {
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        this.cachedAccessories.set(uuid, accessory);
      }

      this.log.info(`[${device.alias}] Registered`);
    }
  }

  private async pollAllDevices() {
    for (const [deviceId, accessory] of this.deviceAccessories) {
      try {
        const state = await this.thinqApi.getDeviceStatus(deviceId);
        accessory.updateState(state);
      } catch (err) {
        this.log.debug(`[${deviceId}] Poll failed:`, (err as Error).message);
      }
    }
  }
}
