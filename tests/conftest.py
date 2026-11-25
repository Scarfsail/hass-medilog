"""Shared fixtures: a bare, real Home Assistant core, as hass-helman's tests build one."""

from __future__ import annotations

from collections.abc import AsyncIterator, Callable
from contextlib import AbstractAsyncContextManager, asynccontextmanager
from unittest.mock import AsyncMock, Mock

import pytest

from homeassistant import loader
from homeassistant.helpers import frame
from homeassistant.config_entries import ConfigEntries, ConfigEntry
from homeassistant.core import HomeAssistant

from custom_components.medilog.const import CONF_PERSON_LIST, DOMAIN


@pytest.fixture
def hass_core(tmp_path) -> Callable[[], AbstractAsyncContextManager[HomeAssistant]]:
    """Start a Home Assistant core in ``tmp_path`` that loads this repo's custom integrations.

    Like a real config directory it has a ``.storage`` folder. ``http`` and
    ``frontend`` count as loaded, with a mocked ``hass.http``, so no
    web server starts. Used as ``async with hass_core() as hass:`` inside the
    test's own event loop.
    """

    @asynccontextmanager
    async def _core() -> AsyncIterator[HomeAssistant]:
        (tmp_path / ".storage").mkdir(exist_ok=True)
        hass = HomeAssistant(str(tmp_path))
        frame.async_setup(hass)
        loader.async_setup(hass)
        hass.config_entries = ConfigEntries(hass, {})
        await hass.config_entries.async_initialize()
        hass.config.components.update({"http", "frontend"})
        hass.http = Mock(async_register_static_paths=AsyncMock())
        await hass.async_start()
        try:
            yield hass
        finally:
            await hass.async_stop(force=True)

    return _core


@pytest.fixture
def medilog_entry() -> Callable[..., ConfigEntry]:
    """Build a MediLog entry tracking the given persons.

    It is stored with version "1.0.0", as every existing install's entry is.
    """

    def _entry(*persons: str) -> ConfigEntry:
        return ConfigEntry(
            discovery_keys={},
            domain=DOMAIN,
            data={},
            minor_version=1,
            options={CONF_PERSON_LIST: list(persons)},
            source="user",
            subentries_data=None,
            title="MediLog",
            unique_id=None,
            version="1.0.0",
        )

    return _entry
