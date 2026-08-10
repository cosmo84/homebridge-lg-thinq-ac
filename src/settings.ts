export const PLUGIN_NAME = 'homebridge-lg-thinqconnect-ac';
export const PLATFORM_NAME = 'LgThinQAc';

// Verified against a live device profile: airConJobMode.currentJobMode
// enumerates AIR_DRY/HEAT/COOL/AUTO/FAN.
export const AC_MODE = {
  COOL: 'COOL',
  HEAT: 'HEAT',
  FAN:  'FAN',
  DRY:  'AIR_DRY',
  AUTO: 'AUTO',
} as const;
export type AcMode = typeof AC_MODE[keyof typeof AC_MODE];

// Verified against a live device profile: operation.airConOperationMode.
export const AC_OPERATION = {
  ON:  'POWER_ON',
  OFF: 'POWER_OFF',
} as const;

// The full set of wind strengths the API defines. An individual device declares
// which of these it actually accepts in its profile (airFlow.windStrength), and
// that subset is what we map onto HomeKit — see buildWindStrengthPctTable().
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

// Canonical low→high ordering of the non-AUTO wind strengths. AUTO sits at the
// top of the HomeKit slider, since that's where users expect "let the device decide".
const WIND_STRENGTH_ORDER: AcWindStrength[] = [
  AC_WIND_STRENGTH.LOW,
  AC_WIND_STRENGTH.LOW_MID,
  AC_WIND_STRENGTH.MID,
  AC_WIND_STRENGTH.MID_HIGH,
  AC_WIND_STRENGTH.HIGH,
];

/**
 * Maps wind strength enum → HomeKit RotationSpeed percentage, built from the
 * values a device declares writable so we never send an enum it rejects.
 *
 * Each step gets an even 1/N share of 0-100, so a LOW/MID/HIGH/AUTO device maps
 * to 25/50/75/100 — the device's real, named speeds rather than an arbitrary
 * continuous range that silently rounds to whatever is nearest.
 */
export function buildWindStrengthPctTable(writableValues: string[]): Record<string, number> {
  const steps = WIND_STRENGTH_ORDER.filter(v => writableValues.includes(v));
  const ordered = writableValues.includes(AC_WIND_STRENGTH.AUTO)
    ? [...steps, AC_WIND_STRENGTH.AUTO]
    : steps;
  const table: Record<string, number> = {};
  ordered.forEach((v, i) => {
    table[v] = Math.round(((i + 1) / ordered.length) * 100);
  });
  return table;
}

// Fallback table for devices whose profile we couldn't fetch: expose the full range.
export const WIND_STRENGTH_TO_PCT: Record<string, number> =
  buildWindStrengthPctTable(Object.values(AC_WIND_STRENGTH));

/** Finds the wind strength in `table` whose percentage sits closest to `pct`. */
export function pctToWindStrength(pct: number, table: Record<string, number>): AcWindStrength {
  const entries = Object.entries(table);
  let best = entries[0];
  for (const entry of entries) {
    if (Math.abs(entry[1] - pct) < Math.abs(best[1] - pct)) {
      best = entry;
    }
  }
  return best[0] as AcWindStrength;
}

/**
 * The RotationSpeed minStep that makes HomeKit's slider snap to exactly the named
 * speeds in `table` (e.g. 25 for a four-step device), so a drag always lands on a
 * real speed instead of an in-between value we'd have to round anyway.
 */
export function windStrengthMinStep(table: Record<string, number>): number {
  const count = Object.keys(table).length;
  return count > 0 ? Math.round(100 / count) : 1;
}
