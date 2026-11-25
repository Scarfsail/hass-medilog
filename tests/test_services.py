"""Service calls fail with translated errors instead of reporting success."""

from __future__ import annotations

import asyncio
import copy
from unittest.mock import patch

import pytest

from homeassistant.exceptions import HomeAssistantError, ServiceValidationError

from custom_components.medilog import json_file
from custom_components.medilog.const import DOMAIN

RECORD = {"person_id": "person.alice", "datetime": "2026-11-25T08:00:00"}


async def _call(hass, service, data=None, **kwargs):
    return await hass.services.async_call(
        DOMAIN, service, data or {}, blocking=True, **kwargs
    )


async def _add_medication(hass, name) -> str:
    await _call(hass, "add_or_update_medication", {"name": name})
    medications = await _call(hass, "get_medications", return_response=True)
    return next(m["id"] for m in medications["medications"] if m["name"] == name)


@pytest.mark.parametrize(
    ("service", "data", "translation_key", "placeholders"),
    [
        ("get_records", {"person_id": "person.carol"}, "unknown_person", {"person_id": "person.carol"}),
        ("add_or_update_record", {**RECORD, "person_id": "person.carol"}, "unknown_person", {"person_id": "person.carol"}),
        ("delete_record", {"person_id": "person.carol", "id": "x"}, "unknown_person", {"person_id": "person.carol"}),
        ("add_or_update_record", {**RECORD, "medication_id": "nope"}, "unknown_medication", {"medication_id": "nope"}),
        ("delete_record", {"person_id": "person.alice", "id": "nope"}, "record_not_found", {"record_id": "nope"}),
        ("add_or_update_medication", {"id": "nope", "name": "X"}, "medication_not_found", {"medication_id": "nope"}),
        ("delete_medication", {"id": "nope"}, "medication_not_found", {"medication_id": "nope"}),
        ("get_medication", {"id": "nope"}, "medication_not_found", {"medication_id": "nope"}),
        ("add_or_update_medication", {"name": "Paralen"}, "duplicate_medication_name", {"name": "Paralen"}),
    ],
)
def test_service_error_raises_with_translation_key(
    hass_core, medilog_entry, service, data, translation_key, placeholders
) -> None:
    async def scenario() -> None:
        async with hass_core() as hass:
            await hass.config_entries.async_add(medilog_entry("person.alice"))
            await hass.async_block_till_done()
            await _add_medication(hass, "Paralen")

            with pytest.raises(ServiceValidationError) as err:
                await _call(hass, service, data, return_response=service.startswith("get_"))

            assert err.value.translation_domain == DOMAIN
            assert err.value.translation_key == translation_key
            assert err.value.translation_placeholders == placeholders

    asyncio.run(scenario())


def test_deleting_a_medication_in_use_fails_and_keeps_it(hass_core, medilog_entry) -> None:
    async def scenario() -> None:
        async with hass_core() as hass:
            await hass.config_entries.async_add(medilog_entry("person.alice", "person.bob"))
            await hass.async_block_till_done()
            medication_id = await _add_medication(hass, "Paralen")
            for person_id in ("person.alice", "person.bob"):
                await _call(
                    hass,
                    "add_or_update_record",
                    {**RECORD, "person_id": person_id, "medication_id": medication_id},
                )

            with pytest.raises(ServiceValidationError) as err:
                await _call(hass, "delete_medication", {"id": medication_id})

            assert err.value.translation_key == "medication_in_use"
            assert err.value.translation_placeholders == {"count": "2"}
            medication = await _call(
                hass, "get_medication", {"id": medication_id}, return_response=True
            )
            assert medication["medication"]["name"] == "Paralen"

    asyncio.run(scenario())


def test_services_fail_when_no_entry_is_loaded(hass_core, medilog_entry) -> None:
    async def scenario() -> None:
        async with hass_core() as hass:
            entry = medilog_entry("person.alice")
            await hass.config_entries.async_add(entry)
            await hass.async_block_till_done()
            await hass.config_entries.async_unload(entry.entry_id)

            with pytest.raises(ServiceValidationError) as err:
                await _call(hass, "get_person_list", return_response=True)

            assert err.value.translation_key == "not_loaded"

    asyncio.run(scenario())


def test_failed_write_raises_home_assistant_error(hass_core, medilog_entry, tmp_path) -> None:
    async def scenario() -> None:
        async with hass_core() as hass:
            await hass.config_entries.async_add(medilog_entry("person.alice"))
            await hass.async_block_till_done()
            (tmp_path / ".storage" / DOMAIN).chmod(0o500)
            try:
                with pytest.raises(HomeAssistantError) as err:
                    await _call(hass, "add_or_update_record", RECORD)
            finally:
                (tmp_path / ".storage" / DOMAIN).chmod(0o700)

            assert err.value.translation_key == "save_failed"

    asyncio.run(scenario())


def test_failed_save_leaves_the_data_unchanged(hass_core, medilog_entry) -> None:
    async def scenario() -> None:
        async with hass_core() as hass:
            await hass.config_entries.async_add(medilog_entry("person.alice"))
            await hass.async_block_till_done()
            await _call(hass, "add_or_update_record", RECORD)
            await _add_medication(hass, "Paralen")
            # Copies: the responses share the storages' lists.
            records = copy.deepcopy(
                await _call(hass, "get_records", {"person_id": "person.alice"}, return_response=True)
            )
            medications = copy.deepcopy(await _call(hass, "get_medications", return_response=True))

            with patch.object(json_file, "write_utf8_file_atomic", side_effect=OSError("disk full")):
                for service, data in (
                    ("add_or_update_record", {**RECORD, "note": "lost"}),
                    ("delete_record", {"person_id": "person.alice", "id": records["records"][0]["id"]}),
                    ("add_or_update_medication", {"name": "Ibalgin"}),
                ):
                    with pytest.raises(HomeAssistantError) as err:
                        await _call(hass, service, data)
                    assert err.value.translation_key == "save_failed"

            assert await _call(hass, "get_records", {"person_id": "person.alice"}, return_response=True) == records
            assert await _call(hass, "get_medications", return_response=True) == medications

    asyncio.run(scenario())
