"""Storage management for Medilog custom component."""

import copy
from pathlib import Path
import uuid

from . import json_file


class MedilogStorage:
    """Storage class for managing Medilog records."""

    def __init__(self, entity: str, file_path: Path) -> None:
        """Initialize Medilog storage.

        Args:
            entity: Entity identifier
            file_path: Path to the storage file

        """
        self.entity = entity
        self.file_path = file_path
        self.data = {"entity": self.entity, "records": []}
        # The data as last loaded or saved; a failed save restores it.
        self._saved = copy.deepcopy(self.data)

    async def async_load(self) -> None:
        """Load records from storage file."""
        loaded_data = await json_file.async_load(self.file_path)
        if loaded_data is not None and loaded_data.get("entity") == self.entity:
            self.data = loaded_data
            self._saved = copy.deepcopy(loaded_data)

    async def async_save(self) -> None:
        """Save records to storage file with backup."""
        try:
            await json_file.async_save(self.file_path, self.data)
        except Exception:
            # Drop the unsaved change, so it is neither returned nor saved later.
            self.data = copy.deepcopy(self._saved)
            raise
        self._saved = copy.deepcopy(self.data)

    def get_records(self) -> list:
        """Get all records.

        Returns:
            List of records

        """
        return self.data["records"]

    async def async_add_or_update_record(
        self,
        id: str | None,
        record_datetime: str,
        temperature: float | None = None,
        medication_id: str | None = None,
        medication_amount: float = 1.0,
        note: str | None = None,
    ) -> None:
        """Add a new record or update an existing one.

        Args:
            id: Record ID (None for new records)
            record_datetime: ISO datetime string
            temperature: Body temperature value
            medication_id: Medication ID reference
            medication_amount: Medication dosage amount
            note: Additional notes

        """
        updated = False
        for record in self.data["records"]:
            if record.get("id") == id:
                record["datetime"] = record_datetime
                record["temperature"] = temperature
                record["medication_id"] = medication_id
                record["medication_amount"] = medication_amount
                record["note"] = note
                updated = True
                break

        if not updated:
            new_record = {
                "id": uuid.uuid4().hex,
                "datetime": record_datetime,
                "temperature": temperature,
                "medication_id": medication_id,
                "medication_amount": medication_amount,
                "note": note,
            }
            self.data["records"].insert(0, new_record)

        await self.async_save()

    async def async_delete_record(self, record_id: str) -> None:
        """Delete a record by ID.

        Args:
            record_id: ID of the record to delete

        Raises:
            ValueError: If record with specified ID not found

        """
        original_count = len(self.data["records"])
        self.data["records"] = [
            record for record in self.data["records"] if record.get("id") != record_id
        ]
        if len(self.data["records"]) == original_count:
            raise ValueError("Record with the specified id not found.")
        await self.async_save()
