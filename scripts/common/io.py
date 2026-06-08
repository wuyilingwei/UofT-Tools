"""Shared file-output helpers for the planner data scrapers."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def write_json(path: Path, data: Any, *, compact: bool = True) -> None:
    """Write ``data`` as UTF-8 JSON.

    ``compact`` (default) uses ``(",", ":")`` separators with no spaces —
    matching the existing pre-scraped data files byte-for-byte.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    if compact:
        text = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    else:
        text = json.dumps(data, ensure_ascii=False, indent=2)
    path.write_text(text, encoding="utf-8")
