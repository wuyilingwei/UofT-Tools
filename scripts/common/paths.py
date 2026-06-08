"""Shared filesystem paths, resolved from the repository root.

Centralising the repo-root computation means individual scrapers no longer
hard-code ``Path(__file__).parent`` chains and keep working regardless of which
``scripts/`` sub-directory they live in.
"""

from __future__ import annotations

from pathlib import Path

# This file lives at scripts/common/paths.py → parents[2] is the repo root.
REPO_ROOT = Path(__file__).resolve().parents[2]

PUBLIC_DIR = REPO_ROOT / "public"
CALENDAR_DIR = PUBLIC_DIR / "calendar"
PLANNER_DATA_DIR = PUBLIC_DIR / "planner" / "data"
