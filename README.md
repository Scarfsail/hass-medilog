# MediLog

MediLog is a Home Assistant integration for tracking medication schedules, health metrics, and
medical-related events for each person in your household. It ships its own Lovelace card
(`custom:medilog-card`) — no separate card install required.

## Features

- Body temperature recording and visualization
- Pills intake tracking
- Notes on any record
- `medilog-card` Lovelace card auto-registers itself on setup — no manual resource step

## Installation

### HACS (recommended)

1. Make sure [HACS](https://hacs.xyz/) is installed.
2. Add this repository as a custom repository in HACS, category **Integration**.
3. Search for "MediLog" in HACS and install it.
4. Restart Home Assistant.
5. Add the integration via **Settings → Devices & Services → Add Integration → MediLog**.

The `medilog-card` Lovelace resource is registered automatically when the integration sets up
(UI/storage-mode dashboards only — see [Migrating from the standalone card](#migrating-from-the-standalone-card)).

### Manual Installation

1. Download the `medilog.zip` release asset (or the `custom_components/medilog` folder from this
   repository) and extract it into your Home Assistant `custom_components/medilog` directory.
2. Restart Home Assistant.

## Using the card

Add the card to your Lovelace dashboard:

```yaml
type: custom:medilog-card
title: Medilog
# ...other configuration options...
```

## Migrating from the standalone card

Prior to this integration serving its own card, `hass-medilog-card` was installed separately via
HACS. If you have it installed:

1. Remove the `hass-medilog-card` HACS Lovelace entry.
2. Remove any manually-added `/hacsfiles/hass-medilog-card/...` Lovelace resource, to avoid a
   duplicate resource pointing at the old card.
3. Install/update this integration — the card element name (`custom:medilog-card`) is unchanged, so
   existing dashboard cards keep working without edits.

## Development

Frontend source (TypeScript) lives in `frontend/` and is not shipped to users — it's built in CI
into `custom_components/medilog/frontend_compiled/` and bundled into the release zip.

```bash
git submodule update --init frontend/hass-frontend
npm --prefix frontend install
npm --prefix frontend run build      # or: npm --prefix frontend run watch
```

## License

Licensed under the MIT License.
