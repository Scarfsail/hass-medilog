"""Storage management for Medication database in Medilog component."""

import copy
from pathlib import Path
import uuid

from . import json_file


class MedicationStorage:
    """Storage class for managing Medication database."""

    def __init__(self, file_path: Path) -> None:
        """Initialize Medication storage.

        Args:
            file_path: Path to the medications storage file

        """
        self.file_path = file_path
        self.data = {"medications": []}
        # The data as last loaded or saved; a failed save restores it.
        self._saved = copy.deepcopy(self.data)

    async def async_load(self) -> None:
        """Load medications from storage file."""
        loaded_data = await json_file.async_load(self.file_path)
        # Validate structure
        if isinstance(loaded_data, dict) and "medications" in loaded_data:
            self.data = loaded_data
            self._saved = copy.deepcopy(loaded_data)

    async def async_save(self) -> None:
        """Save medications to storage file with backup."""
        try:
            await json_file.async_save(self.file_path, self.data)
        except Exception:
            # Drop the unsaved change, so it is neither returned nor saved later.
            self.data = copy.deepcopy(self._saved)
            raise
        self._saved = copy.deepcopy(self.data)

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

    async def async_delete_medication(self, medication_id: str) -> None:
        """Delete a medication by ID.

        Args:
            medication_id: ID of the medication to delete

        Raises:
            ValueError: If medication not found

        """
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
