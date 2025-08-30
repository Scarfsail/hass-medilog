import os
import json
import asyncio
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator
from homeassistant.helpers.dispatcher import async_dispatcher_send
import uuid
import datetime
import shutil


class MedilogStorage:
    def __init__(self, entity: str, file_path: str, on_change_callback=None):
        self.entity = entity
        self.file_path = file_path
        self.on_change_callback = on_change_callback
        self.data = {"entity": self.entity, "records": []}

    async def async_load(self):
        if os.path.exists(self.file_path):
            try:
                # Use asyncio.to_thread for file operations to avoid blocking
                def load_data():
                    with open(self.file_path, "r") as f:
                        return json.load(f)
                
                loaded_data = await asyncio.to_thread(load_data)
                if loaded_data.get("entity") == self.entity:
                    self.data = loaded_data
            except (json.JSONDecodeError, FileNotFoundError):
                self.data = {"entity": self.entity, "records": []}
        else:
            self.data = {"entity": self.entity, "records": []}

    async def async_save(self):
        # First, create a backup of the existing file if it exists
        if os.path.exists(self.file_path):
            backup_suffix = datetime.datetime.now().isoformat().replace(":", "-")
            backup_path = f"{self.file_path}.{backup_suffix}"
            try:
                # Use asyncio.to_thread for the synchronous backup operation
                await asyncio.to_thread(shutil.copy2, self.file_path, backup_path)
            except Exception:
                pass  # Continue even if backup fails

        # Then save the current data using asyncio.to_thread
        def save_data():
            with open(self.file_path, "w") as f:
                json.dump(self.data, f, indent=2)
        
        await asyncio.to_thread(save_data)
        
        if self.on_change_callback:
            self.on_change_callback(self.entity)

    def get_records(self):
        return self.data["records"]

    async def async_add_or_update_record(
        self,
        id: str | None,
        record_datetime: str,
        temperature: float = None,
        medication: str = None,
        note: str = None,
    ):
        updated = False
        for record in self.data["records"]:
            if record.get("id") == id:
                record["datetime"] = record_datetime
                record["temperature"] = temperature
                record["medication"] = medication
                record["note"] = note
                updated = True
                break

        if not updated:
            new_record = {
                "id": uuid.uuid4().hex,
                "datetime": record_datetime,
                "temperature": temperature,
                "medication": medication,
                "note": note,
            }
            self.data["records"].insert(0, new_record)

        await self.async_save()

    async def async_delete_record(self, record_id: str):
        original_count = len(self.data["records"])
        self.data["records"] = [
            record for record in self.data["records"] if record.get("id") != record_id
        ]
        if len(self.data["records"]) == original_count:
            raise ValueError("Record with the specified id not found.")
        await self.async_save()
