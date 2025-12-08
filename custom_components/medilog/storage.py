"""Storage management for Medilog custom component."""

import asyncio
import contextlib
import datetime
import json
from pathlib import Path
import shutil
import uuid


class MedilogStorage:
    """Storage class for managing Medilog records."""

    def __init__(self, entity: str, file_path: str, on_change_callback=None) -> None:
        """Initialize Medilog storage.

        Args:
            entity: Entity identifier
            file_path: Path to the storage file
            on_change_callback: Optional callback function when data changes

        """
        self.entity = entity
        self.file_path = Path(file_path)
        self.on_change_callback = on_change_callback
        self.data = {"entity": self.entity, "records": []}

    async def async_load(self) -> None:
        """Load records from storage file."""
        if self.file_path.exists():
            try:
                # Use asyncio.to_thread for file operations to avoid blocking
                def load_data():
                    with self.file_path.open(encoding="utf-8") as f:
                        return json.load(f)

                loaded_data = await asyncio.to_thread(load_data)
                if loaded_data.get("entity") == self.entity:
                    self.data = loaded_data
            except (json.JSONDecodeError, FileNotFoundError):
                self.data = {"entity": self.entity, "records": []}
        else:
            self.data = {"entity": self.entity, "records": []}

    async def async_save(self) -> None:
        """Save records to storage file with backup."""
        # First, create a backup of the existing file if it exists
        if self.file_path.exists():
            backup_suffix = datetime.datetime.now().isoformat().replace(":", "-")
            backup_path = Path(f"{self.file_path}.{backup_suffix}")
            # Use contextlib.suppress for backup failure
            with contextlib.suppress(OSError):
                await asyncio.to_thread(shutil.copy2, self.file_path, backup_path)

        # Then save the current data using asyncio.to_thread
        def save_data():
            with self.file_path.open("w", encoding="utf-8") as f:
                json.dump(self.data, f, indent=2)

        await asyncio.to_thread(save_data)

        if self.on_change_callback:
            self.on_change_callback(self.entity)

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
