"""Serve the MediLog Lovelace card and auto-register it as a Lovelace resource."""

import logging
import os

from homeassistant.components.http import StaticPathConfig
from homeassistant.core import HomeAssistant
from homeassistant.loader import async_get_integration

from .const import CARD_URL, DOMAIN, FRONTEND_COMPILED_FOLDER, FRONTEND_URL_BASE

_LOGGER = logging.getLogger(__name__)

_CARD_RESOURCE_ID = "card_resource_id"


async def async_register_frontend(hass: HomeAssistant) -> None:
    """Serve frontend_compiled/ and register the card as a Lovelace resource."""
    compiled_dir = os.path.join(os.path.dirname(__file__), FRONTEND_COMPILED_FOLDER)
    await hass.http.async_register_static_paths(
        [StaticPathConfig(FRONTEND_URL_BASE, compiled_dir, False)]
    )
    await _async_register_card_resource(hass)


def _get_storage_resources(hass: HomeAssistant):
    """Return the Lovelace storage resource collection, or None in YAML mode."""
    lovelace = hass.data.get("lovelace")
    resources = getattr(lovelace, "resources", None)
    if resources is None or not hasattr(resources, "async_create_item"):
        return None
    return resources


async def _async_register_card_resource(hass: HomeAssistant) -> None:
    """Create or update the Lovelace resource entry pointing at the compiled card."""
    resources = _get_storage_resources(hass)
    if resources is None:
        _LOGGER.debug("Lovelace storage mode not available; skipping card resource registration")
        return

    integration = await async_get_integration(hass, DOMAIN)
    versioned_url = f"{CARD_URL}?v={integration.version}"

    # ResourceStorageCollection lazy-loads from storage; async_items() is empty
    # until async_get_info() forces the load, so this must run first.
    await resources.async_get_info()
    existing = next(
        (item for item in resources.async_items() if item["url"].startswith(CARD_URL)),
        None,
    )
    if existing is not None:
        if existing["url"] != versioned_url:
            await resources.async_update_item(existing["id"], {"url": versioned_url})
        hass.data[DOMAIN][_CARD_RESOURCE_ID] = existing["id"]
    else:
        created = await resources.async_create_item(
            {"res_type": "module", "url": versioned_url}
        )
        hass.data[DOMAIN][_CARD_RESOURCE_ID] = created["id"]


async def async_unregister_card_resource(hass: HomeAssistant) -> None:
    """Best-effort removal of the registered Lovelace resource on unload."""
    resource_id = hass.data.get(DOMAIN, {}).pop(_CARD_RESOURCE_ID, None)
    if resource_id is None:
        return

    resources = _get_storage_resources(hass)
    if resources is None:
        return

    try:
        await resources.async_delete_item(resource_id)
    except Exception:  # noqa: BLE001 - best-effort cleanup
        _LOGGER.debug("Failed to remove MediLog card resource %s", resource_id, exc_info=True)
