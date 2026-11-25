"""Service definitions for Medilog custom component."""

from typing import Any

import voluptuous as vol

from homeassistant.core import HomeAssistant, ServiceCall, SupportsResponse, callback
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers import config_validation as cv

from .const import DOMAIN
from .data import MedilogConfigEntry, MedilogData
from .storage import MedilogStorage

SERVICE_ADD_UPDATE = "add_or_update_record"
SERVICE_DELETE = "delete_record"
SERVICE_GET_RECORDS = "get_records"
SERVICE_GET_PERSON_LIST = "get_person_list"

# Medication services
SERVICE_ADD_UPDATE_MEDICATION = "add_or_update_medication"
SERVICE_DELETE_MEDICATION = "delete_medication"
SERVICE_GET_MEDICATIONS = "get_medications"
SERVICE_GET_MEDICATION = "get_medication"

SERVICE_ADD_UPDATE_SCHEMA = vol.Schema(
    {
        vol.Required("person_id"): cv.string,
        vol.Optional("id"): cv.string,
        vol.Required("datetime"): cv.string,
        vol.Optional("temperature"): vol.Coerce(float),
        vol.Optional("medication_id"): cv.string,
        vol.Optional("medication_amount"): vol.Coerce(float),
        vol.Optional("note"): cv.string,
    }
)

SERVICE_DELETE_SCHEMA = vol.Schema(
    {
        vol.Required("person_id"): cv.string,
        vol.Required("id"): cv.string,
    }
)

SERVICE_GET_RECORDS_SCHEMA = vol.Schema(
    {
        vol.Required("person_id"): cv.string,
    }
)

SERVICE_GET_PERSON_LIST_SCHEMA = vol.Schema({})

# Medication service schemas
SERVICE_ADD_UPDATE_MEDICATION_SCHEMA = vol.Schema(
    {
        vol.Optional("id"): cv.string,
        vol.Required("name"): cv.string,
        vol.Optional("units"): cv.string,
        vol.Optional("is_antipyretic"): cv.boolean,
        vol.Optional("active_ingredient"): cv.string,
    }
)

SERVICE_DELETE_MEDICATION_SCHEMA = vol.Schema(
    {
        vol.Required("id"): cv.string,
    }
)

SERVICE_GET_MEDICATIONS_SCHEMA = vol.Schema({})

SERVICE_GET_MEDICATION_SCHEMA = vol.Schema(
    {
        vol.Required("id"): cv.string,
    }
)


def _error(translation_key: str, **placeholders: Any) -> ServiceValidationError:
    return ServiceValidationError(
        translation_domain=DOMAIN,
        translation_key=translation_key,
        translation_placeholders={k: str(v) for k, v in placeholders.items()},
    )


def _get_data(call: ServiceCall) -> MedilogData:
    """Return the runtime data of the loaded entry."""
    entries: list[MedilogConfigEntry] = call.hass.config_entries.async_loaded_entries(
        DOMAIN
    )
    if not entries:
        raise _error("not_loaded")
    return entries[0].runtime_data


def _get_storage(call: ServiceCall) -> MedilogStorage:
    person_id = call.data["person_id"]
    storage = _get_data(call).get_storage(person_id)
    if storage is None:
        raise _error("unknown_person", person_id=person_id)
    return storage


async def handle_add_or_update(call: ServiceCall) -> None:
    """Add a record, or update the one with the given ID."""
    medication_id = call.data.get("medication_id")
    if medication_id and not _get_data(call).medication_storage.medication_exists(
        medication_id
    ):
        raise _error("unknown_medication", medication_id=medication_id)

    storage = _get_storage(call)
    await storage.async_add_or_update_record(
        call.data.get("id"),
        call.data["datetime"],
        call.data.get("temperature"),
        medication_id,
        call.data.get("medication_amount", 1.0),
        call.data.get("note"),
    )


async def handle_delete_record(call: ServiceCall) -> None:
    """Delete a record by ID."""
    storage = _get_storage(call)
    record_id = call.data["id"]
    try:
        await storage.async_delete_record(record_id)
    except ValueError as err:
        raise _error("record_not_found", record_id=record_id) from err


async def handle_get_records(call: ServiceCall) -> dict[str, Any]:
    """Return all records of a person."""
    return {"records": _get_storage(call).get_records()}


async def handle_get_person_list(call: ServiceCall) -> dict[str, Any]:
    """Return the persons with their most recent records."""
    return {"persons": _get_data(call).get_person_list()}


async def handle_add_or_update_medication(call: ServiceCall) -> None:
    """Add a medication, or update the one with the given ID."""
    med_storage = _get_data(call).medication_storage
    medication_id = call.data.get("id")
    name = call.data["name"]
    if medication_id and not med_storage.medication_exists(medication_id):
        raise _error("medication_not_found", medication_id=medication_id)
    if not med_storage.is_medication_name_unique(name, exclude_id=medication_id):
        raise _error("duplicate_medication_name", name=name)

    await med_storage.async_add_or_update_medication(
        medication_id,
        name,
        call.data.get("units"),
        call.data.get("is_antipyretic", False),
        call.data.get("active_ingredient"),
    )


async def handle_delete_medication(call: ServiceCall) -> None:
    """Delete a medication that no record references."""
    data = _get_data(call)
    medication_id = call.data["id"]
    if not data.medication_storage.medication_exists(medication_id):
        raise _error("medication_not_found", medication_id=medication_id)
    if count := data.medication_usage_count(medication_id):
        raise _error("medication_in_use", count=count)

    await data.medication_storage.async_delete_medication(medication_id)


async def handle_get_medications(call: ServiceCall) -> dict[str, Any]:
    """Return all medications."""
    return {"medications": _get_data(call).medication_storage.get_medications()}


async def handle_get_medication(call: ServiceCall) -> dict[str, Any]:
    """Return one medication by ID."""
    medication_id = call.data["id"]
    medication = _get_data(call).medication_storage.get_medication(medication_id)
    if medication is None:
        raise _error("medication_not_found", medication_id=medication_id)
    return {"medication": medication}


@callback
def async_setup_services(hass: HomeAssistant) -> None:
    """Register the MediLog services."""
    for service, handler, schema in (
        (SERVICE_ADD_UPDATE, handle_add_or_update, SERVICE_ADD_UPDATE_SCHEMA),
        (SERVICE_DELETE, handle_delete_record, SERVICE_DELETE_SCHEMA),
        (
            SERVICE_ADD_UPDATE_MEDICATION,
            handle_add_or_update_medication,
            SERVICE_ADD_UPDATE_MEDICATION_SCHEMA,
        ),
        (
            SERVICE_DELETE_MEDICATION,
            handle_delete_medication,
            SERVICE_DELETE_MEDICATION_SCHEMA,
        ),
    ):
        hass.services.async_register(DOMAIN, service, handler, schema=schema)

    for service, handler, schema in (
        (SERVICE_GET_RECORDS, handle_get_records, SERVICE_GET_RECORDS_SCHEMA),
        (SERVICE_GET_PERSON_LIST, handle_get_person_list, SERVICE_GET_PERSON_LIST_SCHEMA),
        (SERVICE_GET_MEDICATIONS, handle_get_medications, SERVICE_GET_MEDICATIONS_SCHEMA),
        (SERVICE_GET_MEDICATION, handle_get_medication, SERVICE_GET_MEDICATION_SCHEMA),
    ):
        hass.services.async_register(
            DOMAIN,
            service,
            handler,
            schema=schema,
            supports_response=SupportsResponse.ONLY,
        )
