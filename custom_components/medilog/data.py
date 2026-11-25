"""Runtime data of the loaded MediLog entry: the person and medication storages."""

import asyncio
import logging
from pathlib import Path

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .const import DOMAIN, MEDICATIONS_STORAGE_FILE, MIGRATION_COMPLETE_FLAG
from .medication_storage import MedicationStorage
from .storage import MedilogStorage

_LOGGER = logging.getLogger(__name__)


class MedilogData:
    """The storages of every configured person and the shared medication storage."""

    def __init__(self, storage_directory: Path) -> None:
        """Initialize empty storages; ``async_load`` fills them."""
        self.storage_directory = storage_directory
        self.medication_storage = MedicationStorage(
            storage_directory / MEDICATIONS_STORAGE_FILE
        )
        self.person_storages: dict[str, MedilogStorage] = {}

    @classmethod
    async def async_load(
        cls, hass: HomeAssistant, person_list: list[str]
    ) -> "MedilogData":
        """Create the storage directory, load every storage and migrate old records."""
        data = cls(Path(hass.config.path(".storage", DOMAIN)))
        await asyncio.to_thread(data.storage_directory.mkdir, exist_ok=True)
        await data.medication_storage.async_load()
        for entity_id in person_list:
            file_name = f"medilog_{entity_id.replace('.', '_')}.json"
            storage = MedilogStorage(entity_id, data.storage_directory / file_name)
            await storage.async_load()
            data.person_storages[entity_id] = storage
        await data._async_migrate_medications()
        return data

    def get_person_list(self):
        """Get list of persons with their most recent records."""
        result = []
        for entity_id, storage in self.person_storages.items():
            recent_record = None
            if storage.data and len(storage.data) > 0:
                # Get the most recent record based on timestamp
                records = storage.data.get("records", [])
                recent_record = (
                    max(
                        records,
                        key=lambda x: x.get("datetime", 0),
                        default=None,
                    )
                    if records
                    else None
                )
            result.append({"entity": entity_id, "recent_record": recent_record})
        return result

    def get_storage(self, person_id: str) -> MedilogStorage | None:
        """Retrieve the storage for a specific person ID."""
        return self.person_storages.get(person_id)

    def medication_usage_count(self, medication_id: str) -> int:
        """Return how many records of all persons reference the medication."""
        return sum(
            record.get("medication_id") == medication_id
            for storage in self.person_storages.values()
            for record in storage.get_records()
        )

    async def _async_migrate_medications(self):
        """Migrate old medication string fields to medication_id references."""
        migration_flag = self.storage_directory / MIGRATION_COMPLETE_FLAG

        # Skip if migration already complete
        if await asyncio.to_thread(migration_flag.exists):
            _LOGGER.debug("Medication migration already complete")
            return

        _LOGGER.info("Starting medication migration")
        migration_count = 0

        # Collect all unique medication names from all person storages
        medication_names = set()
        for storage in self.person_storages.values():
            for record in storage.get_records():
                if record.get("medication"):
                    medication_names.add(record["medication"])

        # Create medication entries for each unique name
        medication_map = {}  # old_name -> new_id
        for name in medication_names:
            med_id = await self.medication_storage.async_create_medication_from_name(
                name
            )
            medication_map[name] = med_id
            _LOGGER.debug("Created medication: %s -> %s", name, med_id)

        # Update all records to use medication_id
        for storage in self.person_storages.values():
            needs_save = False
            for record in storage.get_records():
                if "medication" in record:
                    old_name = record["medication"]
                    if old_name and old_name in medication_map:
                        record["medication_id"] = medication_map[old_name]
                        migration_count += 1
                    else:
                        record["medication_id"] = None
                    # Remove old medication field
                    del record["medication"]
                    needs_save = True

            if needs_save:
                await storage.async_save()

        # Create migration flag file
        await asyncio.to_thread(migration_flag.touch)

        _LOGGER.info(
            "Medication migration complete. Migrated %d records", migration_count
        )


type MedilogConfigEntry = ConfigEntry[MedilogData]
