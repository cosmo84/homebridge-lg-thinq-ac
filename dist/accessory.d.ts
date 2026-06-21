import { PlatformAccessory } from 'homebridge';
import { LgThinQAcPlatform } from './platform';
import { DeviceInfo } from './api';
export declare class AirConditionerAccessory {
    private readonly platform;
    private readonly accessory;
    private readonly device;
    private readonly service;
    private state;
    constructor(platform: LgThinQAcPlatform, accessory: PlatformAccessory, device: DeviceInfo);
    private currentHcState;
    private refreshState;
    updateState(data: Record<string, unknown>): void;
}
//# sourceMappingURL=accessory.d.ts.map