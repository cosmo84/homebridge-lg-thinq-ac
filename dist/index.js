"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const platform_1 = require("./platform");
const settings_1 = require("./settings");
exports.default = (api) => {
    api.registerPlatform(settings_1.PLUGIN_NAME, settings_1.PLATFORM_NAME, platform_1.LgThinQAcPlatform);
};
//# sourceMappingURL=index.js.map