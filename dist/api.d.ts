export interface DeviceInfo {
    deviceId: string;
    deviceType: string;
    modelName: string;
    alias: string;
    reportable: boolean;
}
export declare class ThinQApi {
    private readonly http;
    constructor(accessToken: string, countryCode: string, clientId: string);
    private h;
    getDevices(): Promise<DeviceInfo[]>;
    getDeviceStatus(deviceId: string): Promise<Record<string, unknown>>;
    controlDevice(deviceId: string, body: Record<string, unknown>): Promise<void>;
}
//# sourceMappingURL=api.d.ts.map