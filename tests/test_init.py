"""Setting up, reloading and unloading the MediLog config entry on a real Home Assistant core."""

from __future__ import annotations

import asyncio

from homeassistant.config_entries import ConfigEntryState

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


def test_entry_with_two_persons_sets_up_registers_services_and_unloads(
    hass_core, medilog_entry
) -> None:
    async def scenario() -> None:
        async with hass_core() as hass:
            entry = medilog_entry("person.alice", "person.bob")
            assert entry.version == "1.0.0"
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
            # Services are registered once, in async_setup, and outlive the entry.
            assert set(hass.services.async_services_for_domain(DOMAIN)) == SERVICES

    asyncio.run(scenario())


def test_options_change_of_persons_reloads_the_entry(hass_core, medilog_entry, tmp_path) -> None:
    async def scenario() -> None:
        async with hass_core() as hass:
            entry = medilog_entry("person.alice")
            await hass.config_entries.async_add(entry)
            await hass.async_block_till_done()
            data_before = entry.runtime_data

            flow = await hass.config_entries.options.async_init(entry.entry_id)
            await hass.config_entries.options.async_configure(
                flow["flow_id"], {CONF_PERSON_LIST: ["person.alice", "person.bob"]}
            )
            await hass.async_block_till_done()

            assert entry.state is ConfigEntryState.LOADED
            assert entry.runtime_data is not data_before
            assert entry.runtime_data.get_storage("person.bob") is not None
            await hass.services.async_call(
                DOMAIN,
                "add_or_update_record",
                {"person_id": "person.bob", "datetime": "2026-11-25T08:00:00"},
                blocking=True,
            )
            assert (tmp_path / ".storage" / DOMAIN / "medilog_person_bob.json").is_file()

    asyncio.run(scenario())
