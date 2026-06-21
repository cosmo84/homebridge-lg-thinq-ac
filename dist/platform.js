"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LgThinQAcPlatform = void 0;
const uuid_1 = require("uuid");
const settings_1 = require("./settings");
const accessory_1 = require("./accessory");
const api_1 = require("./api");
const AC_DEVICE_TYPE = 'DEVICE_AIR_CONDITIONER';
const POLL_INTERVAL_MS = 60_000;
class LgThinQAcPlatform {
    log;
    config;
    api;
    Service;
    Characteristic;
    thinqApi;
    cachedAccessories = new Map();
    deviceAccessories = new Map();
    pollTimer;
    constructor(log, config, api) {
        this.log = log;
        this.config = config;
        this.api = api;
        this.Service = api.hap.Service;
        this.Characteristic = api.hap.Characteristic;
        this.thinqApi = new api_1.ThinQApi(config['accessToken'], config['countryCode'] ?? 'DE', (0, uuid_1.v4)());
        this.api.on('didFinishLaunching', () => this.initialize());
        this.api.on('shutdown', () => {
            if (this.pollTimer) {
                clearInterval(this.pollTimer);
            }
        });
    }
    configureAccessory(accessory) {
        this.cachedAccessories.set(accessory.UUID, accessory);
    }
    async initialize() {
        await this.discoverDevices();
        if (this.deviceAccessories.size > 0) {
            this.pollTimer = setInterval(() => this.pollAllDevices(), POLL_INTERVAL_MS);
        }
    }
    async discoverDevices() {
        let devices;
        try {
            const all = await this.thinqApi.getDevices();
            devices = all.filter(d => d.deviceType === AC_DEVICE_TYPE);
        }
        catch (err) {
            this.log.error('Failed to fetch device list:', err.message);
            return;
        }
        this.log.info(`Found ${devices.length} LG AC device(s)`);
        for (const device of devices) {
            const uuid = this.api.hap.uuid.generate(device.deviceId);
            const existingAccessory = this.cachedAccessories.get(uuid);
            const accessory = existingAccessory
                ?? new this.api.platformAccessory(device.alias || device.deviceId, uuid);
            accessory.context['device'] = device;
            const acAccessory = new accessory_1.AirConditionerAccessory(this, accessory, device);
            this.deviceAccessories.set(device.deviceId, acAccessory);
            if (existingAccessory) {
                this.api.updatePlatformAccessories([existingAccessory]);
            }
            else {
                this.api.registerPlatformAccessories(settings_1.PLUGIN_NAME, settings_1.PLATFORM_NAME, [accessory]);
                this.cachedAccessories.set(uuid, accessory);
            }
            this.log.info(`[${device.alias}] Registered`);
        }
    }
    async pollAllDevices() {
        for (const [deviceId, accessory] of this.deviceAccessories) {
            try {
                const state = await this.thinqApi.getDeviceStatus(deviceId);
                accessory.updateState(state);
            }
            catch (err) {
                this.log.debug(`[${deviceId}] Poll failed:`, err.message);
            }
        }
    }
}
exports.LgThinQAcPlatform = LgThinQAcPlatform;
//# sourceMappingURL=platform.js.map