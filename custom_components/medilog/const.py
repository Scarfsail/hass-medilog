"""Constants for the MediLog integration."""

DOMAIN = "medilog"
NAME = "MediLog"


COORDINATOR = "coordinator"

CONF_PERSON_LIST = "person_list"

# Storage file names
MEDICATIONS_STORAGE_FILE = "medications.json"

# Migration flag
MIGRATION_COMPLETE_FLAG = ".migration_complete"

# Frontend / card serving
FRONTEND_COMPILED_FOLDER = "frontend_compiled"
FRONTEND_URL_BASE = "/medilog_frontend"
CARD_FILENAME = "medilog-card.js"
CARD_URL = f"{FRONTEND_URL_BASE}/{CARD_FILENAME}"
