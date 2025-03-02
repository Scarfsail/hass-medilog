"""Config flow for the Alarmo component."""

import secrets

from homeassistant import config_entries
import voluptuous as vol

from .const import DOMAIN, NAME, CONF_PERSON_LIST
from homeassistant.helpers import selector


class MedilogFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Config flow for MediLog."""

    VERSION = "1.0.0"
    CONNECTION_CLASS = config_entries.CONN_CLASS_LOCAL_POLL

    async def async_step_user(self, user_input=None):
        """Handle a flow initialized by the user."""

        # Only a single instance of the integration
        if self._async_current_entries():
            return self.async_abort(reason="single_instance_allowed")

        id = secrets.token_hex(6)

        await self.async_set_unique_id(id)
        self._abort_if_unique_id_configured(updates=user_input)

        return self.async_create_entry(title=NAME, data={})

    @staticmethod
    def async_get_options_flow(config_entry):
        """Get the options flow."""
        return OptionsFlowHandler(config_entry)


class OptionsFlowHandler(config_entries.OptionsFlow):
    """Handle options flow."""

    def __init__(self, config_entry):
        """Initialize options flow."""
        self.config_entry = config_entry

    async def async_step_init(self, user_input=None):
        """Manage the options."""
        errors = {}

        if user_input is not None:
            # Use config_entry.options instead of config_entry.data for defaults
            return self.async_create_entry(
                title="",
                # Merge existing options with new user input
                data=self.config_entry.options | user_input,
            )

        return self.async_show_form(
            step_id="init",
            # Use config_entry.options instead of config_entry.data for defaults
            data_schema=vol.Schema(
                {
                    vol.Required(
                        CONF_PERSON_LIST,
                        default=self.config_entry.options.get(CONF_PERSON_LIST, []),
                    ): selector.EntitySelector(
                        selector.EntitySelectorConfig(domain="person", multiple=True)
                    ),
                }
            ),
        )
