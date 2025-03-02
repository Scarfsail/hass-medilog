import logging

import voluptuous as vol

from homeassistant.core import HomeAssistant, SupportsResponse
from homeassistant.helpers import config_validation as cv

from .const import DOMAIN
from .coordinator import MedilogCoordinator

_LOGGER = logging.getLogger(__name__)

SERVICE_ADD_UPDATE = "add_or_update_record"
SERVICE_DELETE = "delete_record"
SERVICE_GET_RECORDS = "get_records"
SERVICE_GET_PERSON_LIST = "get_person_list"

SERVICE_ADD_UPDATE_SCHEMA = vol.Schema(
    {
        vol.Required("person_id"): cv.string,
        vol.Required("datetime"): cv.string,
        vol.Optional("temperature"): vol.Coerce(float),
        vol.Optional("pill"): cv.string,
        vol.Optional("note"): cv.string,
    }
)

SERVICE_DELETE_SCHEMA = vol.Schema(
    {
        vol.Required("person_id"): cv.string,
        vol.Required("datetime"): cv.string,
    }
)

SERVICE_GET_RECORDS_SCHEMA = vol.Schema(
    {
        vol.Required("person_id"): cv.string,
    }
)

SERVICE_GET_PERSON_LIST_SCHEMA = vol.Schema({})


async def async_setup_services(hass: HomeAssistant, coordinator: MedilogCoordinator):
    """Set up medilog services."""

    async def handle_add_or_update(call):
        person_id = call.data["person_id"]
        record_datetime = call.data["datetime"]
        temperature = call.data.get("temperature")
        pill = call.data.get("pill")
        note = call.data.get("note")

        storage = coordinator.get_storage(person_id)
        if storage is None:
            _LOGGER.error("No storage found for person: %s", person_id)
            return

        try:
            storage.add_or_update_record(record_datetime, temperature, pill, note)
            _LOGGER.info(
                "Record added/updated for %s at %s", person_id, record_datetime
            )
        except Exception as err:
            _LOGGER.error("Error adding/updating record for %s: %s", person_id, err)

    async def handle_delete_record(call):
        person_id = call.data["person_id"]
        record_datetime = call.data["datetime"]

        storage = coordinator.get_storage(person_id)
        if storage is None:
            _LOGGER.error("No storage found for person: %s", person_id)
            return

        try:
            storage.delete_record(record_datetime)
            _LOGGER.info("Record deleted for %s at %s", person_id, record_datetime)
        except Exception as err:
            _LOGGER.error("Error deleting record for %s: %s", person_id, err)

    async def handle_get_records(call):
        person_id = call.data["person_id"]
        storage = coordinator.get_storage(person_id)
        if storage is None:
            _LOGGER.error("No storage found for person: %s", person_id)
            return

        records = storage.get_records()
        return {"records:": records}

    async def handle_get_person_list(call):
        try:
            person_list = coordinator.get_person_list()
            return {"persons": person_list}
        except Exception as err:
            _LOGGER.error("Error retrieving person list: %s", err)
            return {"persons": []}

    hass.services.async_register(
        domain=DOMAIN,
        service=SERVICE_ADD_UPDATE,
        service_func=handle_add_or_update,
        schema=SERVICE_ADD_UPDATE_SCHEMA,
    )

    hass.services.async_register(
        domain=DOMAIN,
        service=SERVICE_DELETE,
        service_func=handle_delete_record,
        schema=SERVICE_DELETE_SCHEMA,
    )

    hass.services.async_register(
        domain=DOMAIN,
        service=SERVICE_GET_RECORDS,
        service_func=handle_get_records,
        schema=SERVICE_GET_RECORDS_SCHEMA,
        supports_response=SupportsResponse.ONLY,
    )

    hass.services.async_register(
        domain=DOMAIN,
        service=SERVICE_GET_PERSON_LIST,
        service_func=handle_get_person_list,
        schema=SERVICE_GET_PERSON_LIST_SCHEMA,
        supports_response=SupportsResponse.ONLY,
    )

    return True
