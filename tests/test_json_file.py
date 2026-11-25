"""Saving and loading the storages' JSON files: backups, atomic writes, pruning, old layouts."""

from __future__ import annotations

import asyncio
import json
import logging
from unittest.mock import patch

import pytest

from homeassistant.exceptions import ConfigEntryError
from homeassistant.util import file as ha_file

from custom_components.medilog import json_file
from custom_components.medilog.const import DOMAIN


def test_save_backs_up_the_current_file_and_writes_atomically(tmp_path) -> None:
    path = tmp_path / "medications.json"
    path.write_text('{"medications": []}', encoding="utf-8")
    new = {"medications": [{"id": "a", "name": "Paralen"}]}

    with patch.object(
        json_file, "write_utf8_file_atomic", wraps=ha_file.write_utf8_file_atomic
    ) as atomic:
        asyncio.run(json_file.async_save(path, new))

    atomic.assert_called_once_with(str(path), json.dumps(new, indent=2))
    assert json.loads(path.read_text(encoding="utf-8")) == new
    [backup] = [p for p in tmp_path.iterdir() if p != path]
    assert backup.name.startswith("medications.json.20")
    assert backup.read_text(encoding="utf-8") == '{"medications": []}'


def test_the_101st_save_prunes_to_the_newest_100_copies(tmp_path) -> None:
    path = tmp_path / "medications.json"
    path.write_text('{"medications": []}', encoding="utf-8")
    # 100 earlier copies, in both formats older versions wrote (with and
    # without microseconds), oldest first.
    old = [f"medications.json.2025-01-01T00-00-{s:02d}" for s in range(50)] + [
        f"medications.json.2025-01-01T00-01-{s:02d}.000123" for s in range(50)
    ]
    unrelated = [
        "medications.json.bak",
        "medications.json.2025-01-01T00-00-00.tmp",
        "medilog_person_alice.json.2024-01-01T00-00-00",
        "medilog_person_alice.json",
    ]
    for name in old + unrelated:
        (tmp_path / name).write_text("{}", encoding="utf-8")

    asyncio.run(json_file.async_save(path, {"medications": []}))

    backups = sorted(p.name for p in tmp_path.glob("medications.json.20*"))
    backups.remove("medications.json.2025-01-01T00-00-00.tmp")
    assert len(backups) == 100
    assert old[0] not in backups
    assert backups[:-1] == old[1:]
    for name in unrelated:
        assert (tmp_path / name).exists()


def test_corrupt_file_is_logged_with_the_newest_backup_and_raised(
    tmp_path, caplog
) -> None:
    path = tmp_path / "medications.json"
    path.write_text('{"medications": [', encoding="utf-8")
    (tmp_path / "medications.json.2025-01-01T00-00-00").write_text("{}")
    (tmp_path / "medications.json.2025-01-02T00-00-00").write_text("{}")

    with caplog.at_level(logging.ERROR), pytest.raises(ConfigEntryError) as err:
        asyncio.run(json_file.async_load(path))

    assert err.value.translation_domain == DOMAIN
    assert err.value.translation_key == "corrupt_file"
    assert err.value.translation_placeholders == {
        "file": "medications.json",
        "backup": "medications.json.2025-01-02T00-00-00",
    }
    assert "medications.json.2025-01-02T00-00-00" in caplog.text
    assert path.read_text(encoding="utf-8") == '{"medications": ['


def test_concurrent_saves_of_one_file_all_succeed_in_order(tmp_path) -> None:
    path = tmp_path / "medications.json"
    path.write_text("{}", encoding="utf-8")
    for s in range(100):
        (tmp_path / f"medications.json.2025-01-01T00-{s // 60:02d}-{s % 60:02d}").write_text("{}")

    async def scenario() -> None:
        for n in range(20):
            await asyncio.gather(
                *(json_file.async_save(path, {"n": n, "w": w}) for w in range(3))
            )
            assert json.loads(path.read_text(encoding="utf-8")) == {"n": n, "w": 2}

    asyncio.run(scenario())

    assert len(json_file._backups(path)) == 100


def test_existing_files_and_backups_load_unchanged(
    hass_core, medilog_entry, tmp_path
) -> None:
    storage = tmp_path / ".storage" / DOMAIN
    storage.mkdir(parents=True)
    record = {
        "id": "r1",
        "datetime": "2025-02-25T14:30:00",
        "temperature": 38.2,
        "medication_id": "m1",
        "medication_amount": 1.0,
        "note": None,
    }
    medication = {
        "id": "m1",
        "name": "Paralen",
        "units": "tablets",
        "is_antipyretic": True,
        "active_ingredient": None,
    }
    person_file = storage / "medilog_person_alice.json"
    person_file.write_text(
        json.dumps({"entity": "person.alice", "records": [record]}, indent=2)
    )
    (storage / "medications.json").write_text(
        json.dumps({"medications": [medication]}, indent=2)
    )
    (storage / ".migration_complete").touch()
    old_backup = storage / "medilog_person_alice.json.2025-02-25T14-30-00.123456"
    old_backup.write_text("{}")

    async def scenario() -> None:
        async with hass_core() as hass:
            await hass.config_entries.async_add(medilog_entry("person.alice"))
            await hass.async_block_till_done()

            records = await hass.services.async_call(
                DOMAIN,
                "get_records",
                {"person_id": "person.alice"},
                blocking=True,
                return_response=True,
            )
            assert records == {"records": [record]}
            medications = await hass.services.async_call(
                DOMAIN, "get_medications", blocking=True, return_response=True
            )
            assert medications == {"medications": [medication]}

            for _ in range(2):
                await hass.services.async_call(
                    DOMAIN,
                    "add_or_update_record",
                    {"person_id": "person.alice", "id": "r1", "datetime": "2025-02-25T15:00:00"},
                    blocking=True,
                )

    asyncio.run(scenario())

    # Two saves, two new copies, next to the old one.
    assert len(list(storage.glob("medilog_person_alice.json.20*"))) == 3
    assert old_backup.exists()
