# homebridge-lg-thinqconnect-ac

[![verified-by-homebridge](https://img.shields.io/badge/homebridge-verified-blueviolet?color=%23491F59&style=for-the-badge&logoColor=%23FFFFFF&logo=homebridge)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)

Homebridge plugin for LG ThinQ air conditioners using the official [LG ThinQ Connect API](https://connect-pat.lgthinq.com).

## Requirements

- Homebridge v1.8.0 or v2.0.0+
- An LG ThinQ account with at least one air conditioner
- A Personal Access Token from the LG ThinQ Connect Developer Portal

## Getting a Personal Access Token

1. Go to [connect-pat.lgthinq.com](https://connect-pat.lgthinq.com)
2. Sign in with your LG ThinQ account
3. Create a new Personal Access Token
4. Copy the token — you will need it during plugin configuration

## Installation

Install via the **Homebridge UI**:

1. Open the Homebridge UI
2. Go to **Plugins**
3. Search for `homebridge-lg-thinqconnect-ac`
4. Click **Install**

## Configuration

After installation, configure the plugin via the Homebridge UI plugin settings:

| Field | Description | Example |
|-------|-------------|---------|
| Personal Access Token | Token from connect-pat.lgthinq.com | `eyJ...` |
| Country Code | Your two-letter country code | `DE`, `US`, `KR` |

Restart Homebridge after saving the configuration. Your air conditioners will appear automatically in HomeKit.

## Supported Features

- Power on/off
- Mode selection (Cool, Heat, Auto)
- Target temperature
- Current temperature (read-only)
- Fan speed
- Vertical swing

## How It Works

The plugin polls the LG ThinQ Connect API every 60 seconds to sync device state to HomeKit. Commands sent from HomeKit are forwarded to LG immediately.

## Supported Regions

| Region | Countries |
|--------|-----------|
| Europe | DE, AT, CH, FR, GB, IT, ES, NL, PL, and most European countries |
| Americas | US, CA, MX, BR, CL, CO, AR |
| Asia/Pacific | KR, JP, AU, NZ, TW, SG, TH, MY, ID, PH, VN, IN, CN |

## Troubleshooting

**No devices found:** Check that your Personal Access Token is valid and that your LG ThinQ account has air conditioners registered.

**Commands not working:** Ensure your country code matches the region where your LG account is registered.
