"""Load and save the JSON files of both storages.

Every save first copies the current file to ``<file>.<timestamp>``, so each
change stays reversible, then writes the new content atomically and keeps
only the newest ``BACKUPS_TO_KEEP`` copies of that file.
"""

import asyncio
import datetime
import json
import logging
from pathlib import Path
import re
import shutil
from typing import Any

from homeassistant.exceptions import ConfigEntryError, HomeAssistantError
from homeassistant.util.file import WriteError, write_utf8_file_atomic

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)

BACKUPS_TO_KEEP = 100

# The suffix is ``datetime.isoformat()`` with ":" replaced by "-", as every
# MediLog version has named its copies; microseconds are absent when zero.
_TIMESTAMP = r"\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}(?:\.\d{6})?"

# One lock per file, kept at module level so it outlives entry reloads: saves
# and loads of the same file run one at a time, in the order they were made.
_LOCKS: dict[Path, asyncio.Lock] = {}


def _backups(path: Path) -> list[Path]:
    """Return the backup copies of ``path``, oldest first."""
    pattern = re.compile(re.escape(path.name) + r"\." + _TIMESTAMP)
    # Fixed-width ISO timestamps sort chronologically as strings.
    return sorted(
        backup for backup in path.parent.iterdir() if pattern.fullmatch(backup.name)
    )


def _load(path: Path) -> Any | None:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except ValueError as err:
        backups = _backups(path)
        _LOGGER.error(
            "%s is not valid JSON; restore it from the newest backup: %s",
            path,
            backups[-1] if backups else "none found",
        )
        raise ConfigEntryError(
            translation_domain=DOMAIN,
            translation_key="corrupt_file",
            translation_placeholders={
                "file": path.name,
                "backup": backups[-1].name if backups else "none",
            },
        ) from err


def _save(path: Path, content: str) -> None:
    if path.exists():
        suffix = datetime.datetime.now().isoformat().replace(":", "-")
        shutil.copy2(path, f"{path}.{suffix}")
    write_utf8_file_atomic(str(path), content)
    for backup in _backups(path)[:-BACKUPS_TO_KEEP]:
        backup.unlink()


async def async_load(path: Path) -> Any | None:
    """Return the parsed content of ``path``, or None when it does not exist.

    Invalid JSON is logged, naming the newest backup, and raised as
    ConfigEntryError.
    """
    async with _LOCKS.setdefault(path, asyncio.Lock()):
        return await asyncio.to_thread(_load, path)


async def async_save(path: Path, data: Any) -> None:
    """Back up ``path``, write ``data`` to it atomically and prune old copies."""
    async with _LOCKS.setdefault(path, asyncio.Lock()):
        # Serialized here, on the event loop, so no service call changes the data mid-dump.
        content = json.dumps(data, indent=2)
        try:
            await asyncio.to_thread(_save, path, content)
        except (OSError, WriteError) as err:
            raise HomeAssistantError(
                translation_domain=DOMAIN,
                translation_key="save_failed",
                translation_placeholders={"file": path.name, "error": str(err)},
            ) from err
