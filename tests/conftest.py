"""Shared fixtures: a bare, real Home Assistant core, as hass-helman's tests build one."""

from __future__ import annotations

from collections.abc import AsyncIterator, Callable
from contextlib import AbstractAsyncContextManager, asynccontextmanager
from unittest.mock import AsyncMock, Mock

import pytest

from homeassistant import loader
from homeassistant.helpers import frame
from homeassistant.config_entries import ConfigEntries
from homeassistant.core import HomeAssistant


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
