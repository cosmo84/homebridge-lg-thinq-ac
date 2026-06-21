"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WIND_STRENGTH_TO_PCT = exports.TEMPERATURE_MAX_C = exports.TEMPERATURE_MIN_C = exports.AC_WIND_STRENGTH = exports.AC_OPERATION = exports.AC_MODE = exports.PLATFORM_NAME = exports.PLUGIN_NAME = void 0;
exports.pctToWindStrength = pctToWindStrength;
exports.PLUGIN_NAME = 'homebridge-lg-thinqconnect-ac';
exports.PLATFORM_NAME = 'LgThinQAc';
// TODO: verify these enum values against a live asyncGetDeviceStatus() response
exports.AC_MODE = {
    COOL: 'COOL',
    HEAT: 'HEAT',
    FAN: 'FAN',
    DRY: 'DRY',
    AUTO: 'AUTO',
};
// TODO: verify operation enum values (might be 'POWER_ON'/'POWER_OFF' or 'ON'/'OFF')
exports.AC_OPERATION = {
    ON: 'POWER_ON',
    OFF: 'POWER_OFF',
};
// TODO: verify wind strength enum values
exports.AC_WIND_STRENGTH = {
    AUTO: 'AUTO',
    LOW: 'LOW',
    LOW_MID: 'LOW_MID',
    MID: 'MID',
    MID_HIGH: 'MID_HIGH',
    HIGH: 'HIGH',
};
exports.TEMPERATURE_MIN_C = 18;
exports.TEMPERATURE_MAX_C = 30;
// Maps wind strength enum → HomeKit RotationSpeed percentage
exports.WIND_STRENGTH_TO_PCT = {
    [exports.AC_WIND_STRENGTH.AUTO]: 100,
    [exports.AC_WIND_STRENGTH.HIGH]: 80,
    [exports.AC_WIND_STRENGTH.MID_HIGH]: 65,
    [exports.AC_WIND_STRENGTH.MID]: 50,
    [exports.AC_WIND_STRENGTH.LOW_MID]: 35,
    [exports.AC_WIND_STRENGTH.LOW]: 20,
};
function pctToWindStrength(pct) {
    if (pct >= 90)
        return exports.AC_WIND_STRENGTH.AUTO;
    if (pct >= 70)
        return exports.AC_WIND_STRENGTH.HIGH;
    if (pct >= 55)
        return exports.AC_WIND_STRENGTH.MID_HIGH;
    if (pct >= 40)
        return exports.AC_WIND_STRENGTH.MID;
    if (pct >= 25)
        return exports.AC_WIND_STRENGTH.LOW_MID;
    return exports.AC_WIND_STRENGTH.LOW;
}
//# sourceMappingURL=settings.js.map