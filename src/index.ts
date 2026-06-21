import type { API } from 'homebridge';
import { LgThinQAcPlatform } from './platform';
import { PLUGIN_NAME, PLATFORM_NAME } from './settings';

export default (api: API) => {
  api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, LgThinQAcPlatform);
};
