"""Coordinator for managing Medilog data and medications."""

import logging
from pathlib import Path

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator

from .const import CONF_PERSON_LIST, DOMAIN
from .medication_storage import MedicationStorage
from .storage import MedilogStorage

_LOGGER = logging.getLogger(__name__)


class MedilogCoordinator(DataUpdateCoordinator):
    """Coordinator for managing Medilog data and medications."""

    def __init__(self, hass: HomeAssistant, config_entry: ConfigEntry) -> None:
        """Initialize the coordinator."""
        self.hass = hass
        self.config_entry = config_entry
        self.storage_directory = Path(hass.config.path(".storage", DOMAIN))
        self.storage_directory.mkdir(exist_ok=True)
        self.person_storages: dict[str, MedilogStorage] = {}
        self.medication_storage: MedicationStorage | None = None
        # No periodic polling needed, so update_interval is None.
        super().__init__(
            hass,
            _LOGGER,
            name="MedilogCoordinator",
            update_interval=None,
        )

    async def async_setup(self):
        """Setup the coordinator and load storage files."""
        # Setup medication storage first
        medications_file = self.storage_directory / "medications.json"
        self.medication_storage = MedicationStorage(
            file_path=str(medications_file),
            on_change_callback=self._on_medication_storage_changed,
        )
        await self.medication_storage.async_load()

        # Setup person storages
        await self._async_setup_person_storages()

        # Perform migration if needed
        await self._async_migrate_medications()

    def _on_medication_storage_changed(self):
        """Handle medication storage changes."""
        # Trigger an update when medications change
        self.async_set_updated_data({"medications": self.medication_storage})

    def _on_storage_changed(self, entity_id: str):
        # Trigger an update for the specific person.
        # Here, we could dispatch a signal or call async_set_updated_data.

        self.async_set_updated_data({entity_id: self.person_storages[entity_id]})

    async def _async_setup_person_storages(self):
        """Setup storage for each person."""
        person_list = self.config_entry.options.get(CONF_PERSON_LIST, [])
        for entity_id in person_list:
            file_name = f"medilog_{entity_id.replace('.', '_')}.json"
            file_path = self.storage_directory / file_name
            storage = MedilogStorage(
                entity=entity_id,
                file_path=str(file_path),
                on_change_callback=self._on_storage_changed,
            )
            await storage.async_load()
            self.person_storages[entity_id] = storage

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

    async def _async_update_data(self):
        """Update data.

        Since there's no polling, this method simply returns the current state
        of all storages.
        """
        return self.person_storages

    def get_storage(self, person_id: str):
        """Retrieve the storage for a specific person ID."""
        return self.person_storages.get(person_id)

    def get_medication_storage(self) -> MedicationStorage | None:
        """Get the medication storage instance."""
        return self.medication_storage

    def is_medication_in_use(self, medication_id: str) -> bool:
        """Check if a medication is referenced by any records.

        Args:
            medication_id: ID of the medication to check

        Returns:
            True if medication is in use, False otherwise

        """
        for storage in self.person_storages.values():
            for record in storage.get_records():
                if record.get("medication_id") == medication_id:
                    return True
        return False

    async def _async_migrate_medications(self):
        """Migrate old medication string fields to medication_id references."""
        migration_flag = self.storage_directory / ".migration_complete"

        # Skip if migration already complete
        if migration_flag.exists():
            _LOGGER.debug("Medication migration already complete")
            return

        _LOGGER.info("Starting medication migration")
        migration_count = 0

        if not self.medication_storage:
            _LOGGER.error("Medication storage not initialized")
            return

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
        migration_flag.touch()

        _LOGGER.info(
            "Medication migration complete. Migrated %d records", migration_count
        )
