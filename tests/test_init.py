"""Setting up and unloading the MediLog config entry on a real Home Assistant core."""

from __future__ import annotations

import asyncio

from homeassistant.config_entries import ConfigEntry, ConfigEntryState

from custom_components.medilog.const import CONF_PERSON_LIST, DOMAIN

SERVICES = {
    "add_or_update_record",
    "delete_record",
    "get_records",
    "get_person_list",
    "add_or_update_medication",
    "delete_medication",
    "get_medications",
    "get_medication",
}


def test_entry_with_two_persons_sets_up_registers_services_and_unloads(hass_core) -> None:
    async def scenario() -> None:
        async with hass_core() as hass:
            entry = ConfigEntry(
                discovery_keys={},
                domain=DOMAIN,
                data={},
                minor_version=1,
                options={CONF_PERSON_LIST: ["person.alice", "person.bob"]},
                source="user",
                subentries_data=None,
                title="MediLog",
                unique_id=None,
                version="1.0.0",
            )
            await hass.config_entries.async_add(entry)
            await hass.async_block_till_done()
            assert entry.state is ConfigEntryState.LOADED
            assert set(hass.services.async_services_for_domain(DOMAIN)) == SERVICES

            persons = await hass.services.async_call(
                DOMAIN, "get_person_list", blocking=True, return_response=True
            )
            assert [person["entity"] for person in persons["persons"]] == [
                "person.alice",
                "person.bob",
            ]

            assert await hass.config_entries.async_unload(entry.entry_id)
            assert entry.state is ConfigEntryState.NOT_LOADED

    asyncio.run(scenario())
