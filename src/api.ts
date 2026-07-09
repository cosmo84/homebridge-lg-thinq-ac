import axios, { AxiosInstance } from 'axios';
import { v4 as uuidv4 } from 'uuid';

const API_KEY = 'v6GFvkweNo7DK7yD3ylIZ9w52aKBU0eJ7wLXkSR3';

function regionUrl(countryCode: string): string {
  if (['US', 'CA', 'MX', 'BR', 'CL', 'CO', 'AR'].includes(countryCode)) {
    return 'https://api-aic.lgthinq.com';
  }
  if (['KR', 'JP', 'AU', 'NZ', 'TW', 'SG', 'TH', 'MY', 'ID', 'PH', 'VN', 'IN', 'CN'].includes(countryCode)) {
    return 'https://api-kic.lgthinq.com';
  }
  return 'https://api-eic.lgthinq.com';
}

function msgId(): string {
  const bytes = Buffer.from(uuidv4().replace(/-/g, ''), 'hex');
  return bytes.toString('base64url').slice(0, 22);
}

/** Returns the HTTP status code of an Axios error, or undefined for network/timeout errors. */
export function httpStatus(err: unknown): number | undefined {
  return axios.isAxiosError(err) ? err.response?.status : undefined;
}

/**
 * Builds a human-readable one-line description of a failed control request,
 * including the HTTP status and LG's response body (which carries the real
 * reason, e.g. `{"error":{"code":"...","message":"..."}}`). Axios' own message
 * only says "Request failed with status code 400" and hides that detail.
 */
export function controlErrorDetail(err: unknown): string {
  const status = httpStatus(err);
  const data = axios.isAxiosError(err) ? err.response?.data : undefined;
  const body = data !== undefined ? ` body=${JSON.stringify(data)}` : '';
  return `${status ?? 'network error'}: ${(err as Error).message}${body}`;
}

/**
 * A failure is transient when it usually clears on its own: rate limiting (416/429),
 * server-side errors (5xx), or a network/timeout error with no response at all.
 */
export function isTransient(err: unknown): boolean {
  const status = httpStatus(err);
  return status === undefined || status === 416 || status === 429 || status >= 500;
}

/** Retries fn on transient failures with short exponential backoff; rethrows anything else. */
async function withRetry<T>(fn: () => Promise<T>, attempts = 3, baseDelayMs = 500): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!isTransient(err) || attempt >= attempts - 1) {
        throw err;
      }
      const delay = baseDelayMs * 2 ** attempt + Math.floor(Math.random() * 250);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

export interface DeviceInfo {
  deviceId: string;
  deviceType: string;
  modelName: string;
  alias: string;
  reportable: boolean;
}

export class ThinQApi {
  private readonly http: AxiosInstance;

  constructor(accessToken: string, countryCode: string, clientId: string) {
    this.http = axios.create({
      baseURL: regionUrl(countryCode),
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'x-country': countryCode,
        'x-client-id': clientId,
        'x-api-key': API_KEY,
      },
    });
  }

  private h() {
    return { 'x-message-id': msgId() };
  }

  async getDevices(): Promise<DeviceInfo[]> {
    const res = await this.http.get('/devices', { headers: this.h() });
    const items = (res.data?.response ?? []) as Record<string, unknown>[];
    return items.map(d => {
      const info = d['deviceInfo'] as Record<string, unknown>;
      return {
        deviceId: d['deviceId'] as string,
        deviceType: (info['deviceType'] as string | undefined) ?? '',
        modelName: (info['modelName'] as string | undefined) ?? '',
        alias: (info['alias'] as string | undefined) ?? '',
        reportable: (info['reportable'] as boolean | undefined) ?? true,
      };
    });
  }

  async getDeviceStatus(deviceId: string): Promise<Record<string, unknown>> {
    const res = await this.http.get(`/devices/${deviceId}/state`, { headers: this.h() });
    return (res.data?.response ?? {}) as Record<string, unknown>;
  }

  /**
   * Fetches the device profile, which describes every property the device
   * exposes and whether it is readable ('r') and/or writable ('w'). We use it
   * to only expose HomeKit characteristics the device actually supports, so we
   * never send control commands (e.g. swing) that LG rejects with an error.
   */
  async getDeviceProfile(deviceId: string): Promise<Record<string, unknown>> {
    const res = await this.http.get(`/devices/${deviceId}/profile`, { headers: this.h() });
    return (res.data?.response ?? {}) as Record<string, unknown>;
  }

  async controlDevice(deviceId: string, body: Record<string, unknown>): Promise<void> {
    // Control is user-initiated and low-volume, so retry transient failures (e.g. LG
    // rate-limiting with 416/429) instead of surfacing them to HomeKit as "No Response".
    await withRetry(() => this.http.post(`/devices/${deviceId}/control`, body, { headers: this.h() }));
  }
}
