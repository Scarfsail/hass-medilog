# Home Assistant's MediLog Card

## About
A custom Lovelace card for the [MediLog Integration](https://github.com/Scarfsail/hass-medilog). This card provides an intuitive interface to manage medical log for each person in Home Assistant.

## Installation
### Preferred Installation: HACS
Install via [HACS](https://hacs.xyz/) by adding this repository as a custom repository. Then, search for and install "Medilog Card" from HACS.

### Manual Installation
1. Copy the card files into your Home Assistant configuration directory (e.g., `/config/www/hass-medilog-card/`).
2. Add the following to your Lovelace resources:
   ```yaml
   resources:
     - url: /local/hass-medilog-card/hass-medilog-card.js
       type: module
   ```

## Configuration
Add the card to your Lovelace dashboard with your preferred settings:
```yaml
type: 'custom:hass-medilog-card'
title: Medilog
# ...other configuration options...
```

## Usage
Customize the card further by overriding available options. Ensure your sensor entity matches the one configured in this card.


## License
Licensed under the MIT License.

