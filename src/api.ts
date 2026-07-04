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

  async controlDevice(deviceId: string, body: Record<string, unknown>): Promise<void> {
    await this.http.post(`/devices/${deviceId}/control`, body, { headers: this.h() });
  }
}
