"""Shared filesystem paths, resolved from the repository root.

Centralising the repo-root computation means individual scrapers no longer
hard-code ``Path(__file__).parent`` chains and keep working regardless of which
``scripts/`` sub-directory they live in.
"""

from __future__ import annotations

from pathlib import Path

# This file lives at scripts/common/paths.py → parents[2] is the repo root.
REPO_ROOT = Path(__file__).resolve().parents[2]

# Scraper output lives in data/ (copied into the web build output by
# copy-data.mjs). It is intentionally separate from the web/ app sources.
DATA_DIR = REPO_ROOT / "data"
CALENDAR_DIR = DATA_DIR / "calendar"
PLANNER_DATA_DIR = DATA_DIR / "planner" / "data"
