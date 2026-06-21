"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AirConditionerAccessory = void 0;
const settings_1 = require("./settings");
class AirConditionerAccessory {
    platform;
    accessory;
    device;
    service;
    state = {
        isOn: false,
        mode: settings_1.AC_MODE.COOL,
        currentTempC: 22,
        targetTempC: 22,
        windStrength: 'AUTO',
        swingUpDown: false,
    };
    constructor(platform, accessory, device) {
        this.platform = platform;
        this.accessory = accessory;
        this.device = device;
        const { Service, Characteristic } = platform;
        this.accessory.getService(Service.AccessoryInformation)
            .setCharacteristic(Characteristic.Manufacturer, 'LG')
            .setCharacteristic(Characteristic.Model, device.modelName || 'AC')
            .setCharacteristic(Characteristic.SerialNumber, device.deviceId);
        this.service = this.accessory.getService(Service.HeaterCooler)
            ?? this.accessory.addService(Service.HeaterCooler);
        this.service.setCharacteristic(Characteristic.Name, device.alias);
        this.service.getCharacteristic(Characteristic.Active)
            .onGet(() => this.state.isOn ? Characteristic.Active.ACTIVE : Characteristic.Active.INACTIVE)
            .onSet(async (value) => {
            this.state.isOn = value === Characteristic.Active.ACTIVE;
            await this.platform.thinqApi.controlDevice(device.deviceId, {
                operation: { airConOperationMode: this.state.isOn ? settings_1.AC_OPERATION.ON : settings_1.AC_OPERATION.OFF },
            });
        });
        this.service.getCharacteristic(Characteristic.CurrentHeaterCoolerState)
            .onGet(() => this.currentHcState());
        this.service.getCharacteristic(Characteristic.TargetHeaterCoolerState)
            .onGet(() => {
            switch (this.state.mode) {
                case settings_1.AC_MODE.HEAT: return Characteristic.TargetHeaterCoolerState.HEAT;
                case settings_1.AC_MODE.AUTO: return Characteristic.TargetHeaterCoolerState.AUTO;
                default: return Characteristic.TargetHeaterCoolerState.COOL;
            }
        })
            .onSet(async (value) => {
            switch (value) {
                case Characteristic.TargetHeaterCoolerState.HEAT:
                    this.state.mode = settings_1.AC_MODE.HEAT;
                    break;
                case Characteristic.TargetHeaterCoolerState.AUTO:
                    this.state.mode = settings_1.AC_MODE.AUTO;
                    break;
                default: this.state.mode = settings_1.AC_MODE.COOL;
            }
            await this.platform.thinqApi.controlDevice(device.deviceId, {
                airConJobMode: { currentJobMode: this.state.mode },
            });
            this.service.updateCharacteristic(Characteristic.CurrentHeaterCoolerState, this.currentHcState());
        });
        this.service.getCharacteristic(Characteristic.CurrentTemperature)
            .onGet(() => this.state.currentTempC);
        this.service.getCharacteristic(Characteristic.CoolingThresholdTemperature)
            .setProps({ minValue: settings_1.TEMPERATURE_MIN_C, maxValue: settings_1.TEMPERATURE_MAX_C, minStep: 1 })
            .onGet(() => this.state.targetTempC)
            .onSet(async (value) => {
            this.state.targetTempC = value;
            await this.platform.thinqApi.controlDevice(device.deviceId, {
                temperature: { targetTemperature: value },
            });
        });
        this.service.getCharacteristic(Characteristic.HeatingThresholdTemperature)
            .setProps({ minValue: settings_1.TEMPERATURE_MIN_C, maxValue: settings_1.TEMPERATURE_MAX_C, minStep: 1 })
            .onGet(() => this.state.targetTempC)
            .onSet(async (value) => {
            this.state.targetTempC = value;
            await this.platform.thinqApi.controlDevice(device.deviceId, {
                temperature: { targetTemperature: value },
            });
        });
        this.service.getCharacteristic(Characteristic.RotationSpeed)
            .setProps({ minValue: 0, maxValue: 100, minStep: 1 })
            .onGet(() => settings_1.WIND_STRENGTH_TO_PCT[this.state.windStrength] ?? 100)
            .onSet(async (value) => {
            const strength = (0, settings_1.pctToWindStrength)(value);
            this.state.windStrength = strength;
            await this.platform.thinqApi.controlDevice(device.deviceId, {
                airFlow: { windStrength: strength },
            });
        });
        this.service.getCharacteristic(Characteristic.SwingMode)
            .onGet(() => this.state.swingUpDown
            ? Characteristic.SwingMode.SWING_ENABLED
            : Characteristic.SwingMode.SWING_DISABLED)
            .onSet(async (value) => {
            this.state.swingUpDown = value === Characteristic.SwingMode.SWING_ENABLED;
            await this.platform.thinqApi.controlDevice(device.deviceId, {
                windDirection: { windRotateUpDown: this.state.swingUpDown },
            });
        });
        this.refreshState();
    }
    currentHcState() {
        const { Characteristic } = this.platform;
        if (!this.state.isOn)
            return Characteristic.CurrentHeaterCoolerState.INACTIVE;
        if (this.state.mode === settings_1.AC_MODE.HEAT)
            return Characteristic.CurrentHeaterCoolerState.HEATING;
        if (this.state.mode === settings_1.AC_MODE.COOL)
            return Characteristic.CurrentHeaterCoolerState.COOLING;
        return Characteristic.CurrentHeaterCoolerState.IDLE;
    }
    async refreshState() {
        try {
            const state = await this.platform.thinqApi.getDeviceStatus(this.device.deviceId);
            this.updateState(state);
        }
        catch (err) {
            this.platform.log.debug(`[${this.device.deviceId}] Initial state fetch failed:`, err.message);
        }
    }
    updateState(data) {
        const { Characteristic } = this.platform;
        const jobMode = nested(data, 'airConJobMode', 'currentJobMode');
        const operation = nested(data, 'operation', 'airConOperationMode');
        const currentTemp = nested(data, 'temperature', 'currentTemperature');
        const targetTemp = nested(data, 'temperature', 'targetTemperature');
        const windStrength = nested(data, 'airFlow', 'windStrength');
        const swingUpDown = nested(data, 'windDirection', 'windRotateUpDown');
        if (operation !== undefined) {
            this.state.isOn = operation === settings_1.AC_OPERATION.ON;
            this.service.updateCharacteristic(Characteristic.Active, this.state.isOn ? Characteristic.Active.ACTIVE : Characteristic.Active.INACTIVE);
        }
        if (jobMode !== undefined) {
            this.state.mode = jobMode;
            this.service.updateCharacteristic(Characteristic.CurrentHeaterCoolerState, this.currentHcState());
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
            this.service.updateCharacteristic(Characteristic.RotationSpeed, settings_1.WIND_STRENGTH_TO_PCT[windStrength] ?? 100);
        }
        if (swingUpDown !== undefined) {
            this.state.swingUpDown = swingUpDown === true;
            this.service.updateCharacteristic(Characteristic.SwingMode, this.state.swingUpDown
                ? Characteristic.SwingMode.SWING_ENABLED
                : Characteristic.SwingMode.SWING_DISABLED);
        }
    }
}
exports.AirConditionerAccessory = AirConditionerAccessory;
function nested(obj, ...keys) {
    let cur = obj;
    for (const k of keys) {
        if (cur == null || typeof cur !== 'object')
            return undefined;
        cur = cur[k];
    }
    return cur;
}
//# sourceMappingURL=accessory.js.map