"""Service definitions for Medilog custom component."""

import logging
from typing import Any

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


def _create_record_handlers(coordinator: MedilogCoordinator):
    """Create record-related service handlers."""

    async def handle_add_or_update(call):
        person_id = call.data["person_id"]
        record_id = call.data.get("id")
        record_datetime = call.data["datetime"]
        temperature = call.data.get("temperature")
        medication_id = call.data.get("medication_id")
        medication_amount = call.data.get("medication_amount", 1.0)
        note = call.data.get("note")

        # Validate medication_id if provided
        if medication_id:
            med_storage = coordinator.get_medication_storage()
            if not med_storage:
                _LOGGER.error("Medication storage not initialized")
                return
            if not med_storage.medication_exists(medication_id):
                _LOGGER.error(
                    "Medication with ID '%s' not found. Please create the medication first",
                    medication_id,
                )
                return

        storage = coordinator.get_storage(person_id)
        if storage is None:
            _LOGGER.error("No storage found for person: %s", person_id)
            return

        try:
            await storage.async_add_or_update_record(
                record_id,
                record_datetime,
                temperature,
                medication_id,
                medication_amount,
                note,
            )
            _LOGGER.info(
                "Record added/updated for %s at %s with ID %s",
                person_id,
                record_datetime,
                record_id,
            )
        except OSError as err:
            _LOGGER.error("Error adding/updating record for %s: %s", person_id, err)

    async def handle_delete_record(call):
        person_id = call.data["person_id"]
        record_id = call.data["id"]

        storage = coordinator.get_storage(person_id)
        if storage is None:
            _LOGGER.error("No storage found for person: %s", person_id)
            return

        try:
            await storage.async_delete_record(record_id)
            _LOGGER.info("Record deleted for %s with ID %s", person_id, record_id)
        except (ValueError, OSError) as err:
            _LOGGER.error(
                "Error deleting record for %s with ID %s: %s", person_id, record_id, err
            )

    async def handle_get_records(call) -> dict[str, Any]:
        """Handle get records service call."""
        person_id = call.data["person_id"]
        storage = coordinator.get_storage(person_id)
        if storage is None:
            _LOGGER.error("No storage found for person: %s", person_id)
            return {"records": []}

        records = storage.get_records()
        return {"records": records}

    async def handle_get_person_list(call) -> dict[str, Any]:
        """Handle get person list service call."""
        try:
            person_list = coordinator.get_person_list()
        except OSError as err:
            _LOGGER.error("Error retrieving person list: %s", err)
            return {"persons": []}
        else:
            return {"persons": person_list}

    return (
        handle_add_or_update,
        handle_delete_record,
        handle_get_records,
        handle_get_person_list,
    )


def _create_medication_handlers(coordinator: MedilogCoordinator):
    """Create medication-related service handlers."""

    async def handle_add_or_update_medication(call):
        """Handle add or update medication service call."""
        medication_id = call.data.get("id")
        name = call.data["name"]
        units = call.data.get("units")
        is_antipyretic = call.data.get("is_antipyretic", False)
        active_ingredient = call.data.get("active_ingredient")

        med_storage = coordinator.get_medication_storage()
        if med_storage is None:
            _LOGGER.error("Medication storage not initialized")
            return

        try:
            result = await med_storage.async_add_or_update_medication(
                medication_id,
                name,
                units,
                is_antipyretic,
                active_ingredient,
            )
            _LOGGER.info(
                "Medication %s: %s (ID: %s)",
                "updated" if medication_id else "created",
                name,
                result["id"],
            )
        except ValueError as err:
            _LOGGER.error("Error adding/updating medication: %s", err)
        except OSError as err:
            _LOGGER.error("Error saving medication: %s", err)

    async def handle_delete_medication(call):
        """Handle delete medication service call."""
        medication_id = call.data["id"]

        med_storage = coordinator.get_medication_storage()
        if med_storage is None:
            _LOGGER.error("Medication storage not initialized")
            return

        # Check if medication is in use
        def check_usage(med_id):
            return coordinator.is_medication_in_use(med_id)

        try:
            await med_storage.async_delete_medication(medication_id, check_usage)
            _LOGGER.info("Medication deleted with ID: %s", medication_id)
        except ValueError as err:
            _LOGGER.error("Error deleting medication: %s", err)
        except OSError as err:
            _LOGGER.error("Error saving medication storage: %s", err)

    async def handle_get_medications(call) -> dict[str, Any]:
        """Handle get medications service call."""
        med_storage = coordinator.get_medication_storage()
        if med_storage is None:
            _LOGGER.error("Medication storage not initialized")
            return {"medications": []}

        medications = med_storage.get_medications()
        return {"medications": medications}

    async def handle_get_medication(call) -> dict[str, Any]:
        """Handle get medication service call."""
        medication_id = call.data["id"]

        med_storage = coordinator.get_medication_storage()
        if med_storage is None:
            _LOGGER.error("Medication storage not initialized")
            return {"medication": None}

        medication = med_storage.get_medication(medication_id)
        if medication is None:
            _LOGGER.warning("Medication with ID '%s' not found", medication_id)

        return {"medication": medication}

    return (
        handle_add_or_update_medication,
        handle_delete_medication,
        handle_get_medications,
        handle_get_medication,
    )


async def async_setup_services(hass: HomeAssistant, coordinator: MedilogCoordinator):
    """Set up medilog services."""
    # Create handlers
    (
        handle_add_or_update,
        handle_delete_record,
        handle_get_records,
        handle_get_person_list,
    ) = _create_record_handlers(coordinator)

    (
        handle_add_or_update_medication,
        handle_delete_medication,
        handle_get_medications,
        handle_get_medication,
    ) = _create_medication_handlers(coordinator)

    # Register services

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

    # Register medication services
    hass.services.async_register(
        domain=DOMAIN,
        service=SERVICE_ADD_UPDATE_MEDICATION,
        service_func=handle_add_or_update_medication,
        schema=SERVICE_ADD_UPDATE_MEDICATION_SCHEMA,
    )

    hass.services.async_register(
        domain=DOMAIN,
        service=SERVICE_DELETE_MEDICATION,
        service_func=handle_delete_medication,
        schema=SERVICE_DELETE_MEDICATION_SCHEMA,
    )

    hass.services.async_register(
        domain=DOMAIN,
        service=SERVICE_GET_MEDICATIONS,
        service_func=handle_get_medications,
        schema=SERVICE_GET_MEDICATIONS_SCHEMA,
        supports_response=SupportsResponse.ONLY,
    )

    hass.services.async_register(
        domain=DOMAIN,
        service=SERVICE_GET_MEDICATION,
        service_func=handle_get_medication,
        schema=SERVICE_GET_MEDICATION_SCHEMA,
        supports_response=SupportsResponse.ONLY,
    )

    return True
