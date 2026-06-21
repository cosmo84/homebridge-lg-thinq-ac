"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ThinQApi = void 0;
const axios_1 = __importDefault(require("axios"));
const uuid_1 = require("uuid");
const API_KEY = 'v6GFvkweNo7DK7yD3ylIZ9w52aKBU0eJ7wLXkSR3';
function regionUrl(countryCode) {
    if (['US', 'CA', 'MX', 'BR', 'CL', 'CO', 'AR'].includes(countryCode)) {
        return 'https://api-aic.lgthinq.com';
    }
    if (['KR', 'JP', 'AU', 'NZ', 'TW', 'SG', 'TH', 'MY', 'ID', 'PH', 'VN', 'IN', 'CN'].includes(countryCode)) {
        return 'https://api-kic.lgthinq.com';
    }
    return 'https://api-eic.lgthinq.com';
}
function msgId() {
    const bytes = Buffer.from((0, uuid_1.v4)().replace(/-/g, ''), 'hex');
    return bytes.toString('base64url').slice(0, 22);
}
class ThinQApi {
    http;
    constructor(accessToken, countryCode, clientId) {
        this.http = axios_1.default.create({
            baseURL: regionUrl(countryCode),
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'x-country': countryCode,
                'x-client-id': clientId,
                'x-api-key': API_KEY,
            },
        });
    }
    h() {
        return { 'x-message-id': msgId() };
    }
    async getDevices() {
        const res = await this.http.get('/devices', { headers: this.h() });
        const items = (res.data?.response ?? []);
        return items.map(d => {
            const info = d['deviceInfo'];
            return {
                deviceId: d['deviceId'],
                deviceType: info['deviceType'] ?? '',
                modelName: info['modelName'] ?? '',
                alias: info['alias'] ?? '',
                reportable: info['reportable'] ?? true,
            };
        });
    }
    async getDeviceStatus(deviceId) {
        const res = await this.http.get(`/devices/${deviceId}/state`, { headers: this.h() });
        return (res.data?.response ?? {});
    }
    async controlDevice(deviceId, body) {
        await this.http.post(`/devices/${deviceId}/control`, body, { headers: this.h() });
    }
}
exports.ThinQApi = ThinQApi;
//# sourceMappingURL=api.js.map