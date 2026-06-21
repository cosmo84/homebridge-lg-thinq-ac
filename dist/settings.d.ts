export declare const PLUGIN_NAME = "homebridge-lg-thinqconnect-ac";
export declare const PLATFORM_NAME = "LgThinQAc";
export declare const AC_MODE: {
    readonly COOL: "COOL";
    readonly HEAT: "HEAT";
    readonly FAN: "FAN";
    readonly DRY: "DRY";
    readonly AUTO: "AUTO";
};
export type AcMode = typeof AC_MODE[keyof typeof AC_MODE];
export declare const AC_OPERATION: {
    readonly ON: "POWER_ON";
    readonly OFF: "POWER_OFF";
};
export declare const AC_WIND_STRENGTH: {
    readonly AUTO: "AUTO";
    readonly LOW: "LOW";
    readonly LOW_MID: "LOW_MID";
    readonly MID: "MID";
    readonly MID_HIGH: "MID_HIGH";
    readonly HIGH: "HIGH";
};
export type AcWindStrength = typeof AC_WIND_STRENGTH[keyof typeof AC_WIND_STRENGTH];
export declare const TEMPERATURE_MIN_C = 18;
export declare const TEMPERATURE_MAX_C = 30;
export declare const WIND_STRENGTH_TO_PCT: Record<string, number>;
export declare function pctToWindStrength(pct: number): AcWindStrength;
//# sourceMappingURL=settings.d.ts.map