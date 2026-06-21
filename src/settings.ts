export const PLUGIN_NAME = 'homebridge-lg-thinqconnect-ac';
export const PLATFORM_NAME = 'LgThinQAc';

// TODO: verify these enum values against a live asyncGetDeviceStatus() response
export const AC_MODE = {
  COOL: 'COOL',
  HEAT: 'HEAT',
  FAN:  'FAN',
  DRY:  'DRY',
  AUTO: 'AUTO',
} as const;
export type AcMode = typeof AC_MODE[keyof typeof AC_MODE];

// TODO: verify operation enum values (might be 'POWER_ON'/'POWER_OFF' or 'ON'/'OFF')
export const AC_OPERATION = {
  ON:  'POWER_ON',
  OFF: 'POWER_OFF',
} as const;

// TODO: verify wind strength enum values
export const AC_WIND_STRENGTH = {
  AUTO:     'AUTO',
  LOW:      'LOW',
  LOW_MID:  'LOW_MID',
  MID:      'MID',
  MID_HIGH: 'MID_HIGH',
  HIGH:     'HIGH',
} as const;
export type AcWindStrength = typeof AC_WIND_STRENGTH[keyof typeof AC_WIND_STRENGTH];

export const TEMPERATURE_MIN_C = 18;
export const TEMPERATURE_MAX_C = 30;

// Maps wind strength enum → HomeKit RotationSpeed percentage
export const WIND_STRENGTH_TO_PCT: Record<string, number> = {
  [AC_WIND_STRENGTH.AUTO]:     100,
  [AC_WIND_STRENGTH.HIGH]:      80,
  [AC_WIND_STRENGTH.MID_HIGH]:  65,
  [AC_WIND_STRENGTH.MID]:       50,
  [AC_WIND_STRENGTH.LOW_MID]:   35,
  [AC_WIND_STRENGTH.LOW]:       20,
};

export function pctToWindStrength(pct: number): AcWindStrength {
  if (pct >= 90) return AC_WIND_STRENGTH.AUTO;
  if (pct >= 70) return AC_WIND_STRENGTH.HIGH;
  if (pct >= 55) return AC_WIND_STRENGTH.MID_HIGH;
  if (pct >= 40) return AC_WIND_STRENGTH.MID;
  if (pct >= 25) return AC_WIND_STRENGTH.LOW_MID;
  return AC_WIND_STRENGTH.LOW;
}
