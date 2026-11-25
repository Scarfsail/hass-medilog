import logging

from homeassistant.core import HomeAssistant
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.typing import ConfigType

from .const import CONF_PERSON_LIST, DOMAIN
from .data import MedilogConfigEntry, MedilogData
from .frontend import async_register_frontend, async_unregister_card_resource
from .services import async_setup_services

_LOGGER = logging.getLogger(__name__)

CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Register the services once; they act on whichever entry is loaded."""
    async_setup_services(hass)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: MedilogConfigEntry) -> bool:
    """Set up the MediLog integration."""
    entry.runtime_data = await MedilogData.async_load(
        hass, entry.options.get(CONF_PERSON_LIST, [])
    )
    await async_register_frontend(hass)
    _LOGGER.info("MediLog integration has been set up")
    return True


async def async_unload_entry(hass: HomeAssistant, entry: MedilogConfigEntry) -> bool:
    """Unload a config entry."""
    await async_unregister_card_resource(hass)

    _LOGGER.info("MediLog integration has been unloaded")

    return True
