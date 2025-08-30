import logging

from .coordinator import MedilogCoordinator
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from . import const
from .const import DOMAIN
from .services import async_setup_services

_LOGGER = logging.getLogger(__name__)


# If your integration supports config entries, you need to define async_setup_entry.
async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry):
    """Set up the MediLog integration."""

    # Save config entry data if needed.
    coordinator = MedilogCoordinator(hass, entry)
    await coordinator.async_setup()
    await coordinator.async_config_entry_first_refresh()
    hass.data.setdefault(DOMAIN, {})[const.COORDINATOR] = coordinator

    # Forward setup for the sensor platform
    await async_setup_services(hass, coordinator)
    _LOGGER.info("MediLog integration has been set up")
    return True


# Optionally, define async_unload_entry if you want to support unloading config entries.
async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry):
    """Unload a config entry."""
    # Remove any services or clean up resources if needed.

    _LOGGER.info("MediLog integration has been unloaded")

    return True
