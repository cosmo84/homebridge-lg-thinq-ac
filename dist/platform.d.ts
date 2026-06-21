import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';
import { ThinQApi } from './api';
export declare class LgThinQAcPlatform implements DynamicPlatformPlugin {
    readonly log: Logger;
    readonly config: PlatformConfig;
    readonly api: API;
    readonly Service: typeof Service;
    readonly Characteristic: typeof Characteristic;
    readonly thinqApi: ThinQApi;
    private readonly cachedAccessories;
    private readonly deviceAccessories;
    private pollTimer?;
    constructor(log: Logger, config: PlatformConfig, api: API);
    configureAccessory(accessory: PlatformAccessory): void;
    private initialize;
    private discoverDevices;
    private pollAllDevices;
}
//# sourceMappingURL=platform.d.ts.map