"""Shared HTTP helpers for the scrapers."""

from __future__ import annotations

import requests

# Calendar scrapers identify with a descriptive contact User-Agent.
CALENDAR_BOT_UA = (
    "U-of-T-Calendar-Bot/1.0"
    " (Contact: sy.lei@mail.utoronto.ca; Student Project)"
)

# Planner / API scrapers use a generic browser-compatible User-Agent.
PLANNER_UA = "Mozilla/5.0 (compatible; UofT-Tools/1.0)"


def make_session(user_agent: str, extra_headers: dict | None = None) -> requests.Session:
    """Return a ``requests.Session`` pre-configured with a User-Agent.

    ``extra_headers`` (e.g. ``Accept`` / ``Referer``) are merged on top.
    """
    session = requests.Session()
    session.headers["User-Agent"] = user_agent
    if extra_headers:
        session.headers.update(extra_headers)
    return session
