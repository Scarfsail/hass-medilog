"""Storage management for Medication database in Medilog component."""

import asyncio
import contextlib
import datetime
import json
from pathlib import Path
import shutil
import uuid


class MedicationStorage:
    """Storage class for managing Medication database."""

    def __init__(self, file_path: str, on_change_callback=None) -> None:
        """Initialize Medication storage.

        Args:
            file_path: Path to the medications storage file
            on_change_callback: Optional callback function when data changes

        """
        self.file_path = Path(file_path)
        self.on_change_callback = on_change_callback
        self.data = {"medications": []}

    async def async_load(self) -> None:
        """Load medications from storage file."""
        if self.file_path.exists():
            try:
                # Use asyncio.to_thread for file operations to avoid blocking
                def load_data():
                    with self.file_path.open(encoding="utf-8") as f:
                        return json.load(f)

                loaded_data = await asyncio.to_thread(load_data)
                # Validate structure
                if isinstance(loaded_data, dict) and "medications" in loaded_data:
                    self.data = loaded_data
            except (json.JSONDecodeError, FileNotFoundError):
                self.data = {"medications": []}
        else:
            self.data = {"medications": []}

    async def async_save(self) -> None:
        """Save medications to storage file with backup."""
        # First, create a backup of the existing file if it exists
        if self.file_path.exists():
            backup_suffix = datetime.datetime.now().isoformat().replace(":", "-")
            backup_path = Path(f"{self.file_path}.{backup_suffix}")
            # Use contextlib.suppress for backup failure
            with contextlib.suppress(OSError):
                await asyncio.to_thread(shutil.copy2, self.file_path, backup_path)

        # Then save the current data using asyncio.to_thread
        def save_data():
            # Ensure parent directory exists
            self.file_path.parent.mkdir(parents=True, exist_ok=True)
            with self.file_path.open("w", encoding="utf-8") as f:
                json.dump(self.data, f, indent=2)

        await asyncio.to_thread(save_data)

        if self.on_change_callback:
            self.on_change_callback()

    def get_medications(self) -> list:
        """Get all medications.

        Returns:
            List of medication records

        """
        return self.data["medications"]

    def get_medication(self, medication_id: str) -> dict | None:
        """Get a medication by ID.

        Args:
            medication_id: ID of the medication

        Returns:
            Medication record or None if not found

        """
        for medication in self.data["medications"]:
            if medication.get("id") == medication_id:
                return medication
        return None

    def medication_exists(self, medication_id: str) -> bool:
        """Check if a medication exists by ID.

        Args:
            medication_id: ID of the medication

        Returns:
            True if medication exists, False otherwise

        """
        return self.get_medication(medication_id) is not None

    def is_medication_name_unique(
        self, name: str, exclude_id: str | None = None
    ) -> bool:
        """Check if a medication name is unique.

        Args:
            name: Name to check
            exclude_id: Optional ID to exclude from check (for updates)

        Returns:
            True if name is unique, False otherwise

        """
        for medication in self.data["medications"]:
            if medication.get("name") == name and medication.get("id") != exclude_id:
                return False
        return True

    async def async_add_or_update_medication(
        self,
        id: str | None,
        name: str,
        units: str | None = None,
        is_antipyretic: bool = False,
        active_ingredient: str | None = None,
    ) -> dict:
        """Add a new medication or update an existing one.

        Args:
            id: Medication ID (None for new medications)
            name: Medication name (must be unique)
            units: Optional units (e.g., "tablets", "ml", "sprays")
            is_antipyretic: Whether the medication is antipyretic
            active_ingredient: Optional active ingredient

        Returns:
            The created or updated medication record

        Raises:
            ValueError: If name is not unique or medication ID not found for update

        """
        # Check for unique name
        if not self.is_medication_name_unique(name, exclude_id=id):
            raise ValueError(f"Medication with name '{name}' already exists.")

        updated = False
        result = None

        if id:
            # Update existing medication
            for medication in self.data["medications"]:
                if medication.get("id") == id:
                    medication["name"] = name
                    medication["units"] = units
                    medication["is_antipyretic"] = is_antipyretic
                    medication["active_ingredient"] = active_ingredient
                    updated = True
                    result = medication
                    break

            if not updated:
                raise ValueError(f"Medication with ID '{id}' not found.")
        else:
            # Create new medication
            new_medication = {
                "id": uuid.uuid4().hex,
                "name": name,
                "units": units,
                "is_antipyretic": is_antipyretic,
                "active_ingredient": active_ingredient,
            }
            self.data["medications"].append(new_medication)
            result = new_medication

        await self.async_save()

        if result is None:
            raise ValueError("Failed to create or update medication")

        return result

    async def async_delete_medication(
        self, medication_id: str, check_usage_callback=None
    ) -> None:
        """Delete a medication by ID.

        Args:
            medication_id: ID of the medication to delete
            check_usage_callback: Optional callback to check if medication is in use

        Raises:
            ValueError: If medication not found or is in use

        """
        # Check if medication is in use
        if check_usage_callback and check_usage_callback(medication_id):
            raise ValueError(
                f"Cannot delete medication with ID '{medication_id}' because it is referenced by one or more records."
            )

        original_count = len(self.data["medications"])
        self.data["medications"] = [
            med for med in self.data["medications"] if med.get("id") != medication_id
        ]

        if len(self.data["medications"]) == original_count:
            raise ValueError(f"Medication with ID '{medication_id}' not found.")

        await self.async_save()

    async def async_create_medication_from_name(self, name: str) -> str:
        """Create a medication from a name string (used during migration).

        Args:
            name: Medication name

        Returns:
            The ID of the created medication

        """
        # Check if medication with this name already exists
        for medication in self.data["medications"]:
            if medication.get("name") == name:
                return medication.get("id")

        # Create new medication
        result = await self.async_add_or_update_medication(
            id=None,
            name=name,
            units=None,
            is_antipyretic=False,
            active_ingredient=None,
        )
        return result["id"]
