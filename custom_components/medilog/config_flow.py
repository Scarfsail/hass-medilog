"""Config flow for the Medilog component."""

import secrets

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.core import callback
from homeassistant.helpers import selector

from .const import CONF_PERSON_LIST, DOMAIN, NAME


class MedilogFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Config flow for MediLog."""

    # Stays the string "1.0.0": existing entries store it, and Home Assistant
    # compares `entry.version > handler.VERSION` before calling any migration,
    # so an int here raises TypeError ("1.0.0" > 1) and breaks every install.
    VERSION = "1.0.0"

    async def async_step_user(self, user_input=None):
        """Handle a flow initialized by the user."""
        unique_id = secrets.token_hex(6)

        await self.async_set_unique_id(unique_id)
        self._abort_if_unique_id_configured(updates=user_input)

        return self.async_create_entry(title=NAME, data={})

    @staticmethod
    @callback
    def async_get_options_flow(config_entry):
        """Get the options flow."""
        return OptionsFlowHandler()


class OptionsFlowHandler(config_entries.OptionsFlowWithReload):
    """Handle options flow; the entry reloads when the options change."""

    async def async_step_init(self, user_input=None):
        """Manage the options."""
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
