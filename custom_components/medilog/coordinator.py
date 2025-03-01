import json
import logging
import os
from pathlib import Path

from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator

from .const import DOMAIN
from .storage import MedilogStorage

_LOGGER = logging.getLogger(__name__)


class MedilogCoordinator(DataUpdateCoordinator):
    def __init__(
        self,
        hass,
    ):
        self.hass = hass
        self.storage_directory = Path(hass.config.path(".storage", DOMAIN))
        self.storage_directory.mkdir(exist_ok=True)
        self.person_storages: dict[str, MedilogStorage] = {}
        self._setup_person_storages()
        # No periodic polling needed, so update_interval is None.
        super().__init__(
            hass,
            _LOGGER,
            name="MedilogCoordinator",
            update_interval=None,
        )

    def _on_storage_changed(self, entity_id: str):
        # Trigger an update for the specific person.
        # Here, we could dispatch a signal or call async_set_updated_data.

        self.async_set_updated_data({entity_id: self.person_storages[entity_id]})

    def _setup_person_storages(self):
        person_states = self.hass.states.async_all("person")
        for state in person_states:
            entity_id = state.entity_id
            file_name = f"medilog_{entity_id.replace('.', '_')}.json"
            file_path = os.path.join(self.storage_directory, file_name)
            storage = MedilogStorage(
                entity=entity_id,
                file_path=file_path,
                on_change_callback=self._on_storage_changed,
            )
            self.person_storages[entity_id] = storage

    async def _async_update_data(self):
        """
        Since there's no polling, this method could simply return the current state
        of all storages. You could also leave it empty if you're triggering updates externally.
        """

        return self.person_storages

    def get_storage(self, person_id: str):
        """
        Retrieve the storage for a specific person ID.
        """
        return self.person_storages.get(person_id)
