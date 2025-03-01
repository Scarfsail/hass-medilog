import os
import json
import asyncio
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator
from homeassistant.helpers.dispatcher import async_dispatcher_send


class MedilogStorage:
    def __init__(self, entity: str, file_path: str, on_change_callback=None):
        self.entity = entity
        self.file_path = file_path
        self.on_change_callback = on_change_callback
        self.data = {"entity": self.entity, "records": []}
        self.load()

    def load(self):
        if os.path.exists(self.file_path):
            try:
                with open(self.file_path, "r") as f:
                    loaded_data = json.load(f)
                    if loaded_data.get("entity") == self.entity:
                        self.data = loaded_data
            except json.JSONDecodeError:
                self.data = {"entity": self.entity, "records": []}
        else:
            self.data = {"entity": self.entity, "records": []}

    def save(self):
        with open(self.file_path, "w") as f:
            json.dump(self.data, f, indent=2)
        if self.on_change_callback:
            self.on_change_callback(self.entity)

    def get_records(self):
        return self.data["records"]

    def add_or_update_record(
        self,
        record_datetime: str,
        temperature: float = None,
        pill: str = None,
        note: str = None,
    ):
        updated = False
        for record in self.data["records"]:
            if record.get("datetime") == record_datetime:
                if temperature is not None:
                    record["temperature"] = temperature
                if pill is not None:
                    record["pill"] = pill
                if note is not None:
                    record["note"] = note
                updated = True
                break

        if not updated:
            new_record = {
                "datetime": record_datetime,
                "temperature": temperature,
                "pill": pill,
                "note": note,
            }
            self.data["records"].append(new_record)

        self.save()

    def delete_record(self, record_datetime: str):
        original_count = len(self.data["records"])
        self.data["records"] = [
            record
            for record in self.data["records"]
            if record.get("datetime") != record_datetime
        ]
        if len(self.data["records"]) == original_count:
            raise ValueError("Record with the specified datetime not found.")
        self.save()
