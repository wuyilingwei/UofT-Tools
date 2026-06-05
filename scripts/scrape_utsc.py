#!/usr/bin/env python3
"""
UTSC Important Dates Calendar Scraper
=======================================
Fetches important academic dates from the University of Toronto Scarborough
Registrar's Office and generates a standards-compliant ICS calendar file.

Data source : https://www.utsc.utoronto.ca/registrar/academic-dates
Technique   : requests + BeautifulSoup (dates are in static HTML tables)
Output      : public/ics/utsc.ics  (all-day VEVENT entries)

NOT AN OFFICIAL UNIVERSITY OF TORONTO / UTSC PRODUCT.
This is a student convenience tool. Always verify dates with the official page.

User-Agent  : U-of-T-Calendar-Bot/1.0 (Contact: sy.lei@mail.utoronto.ca; Student Project)
"""

from __future__ import annotations

import argparse
import hashlib
import logging
import re
import sys
from datetime import date, datetime, timedelta
from pathlib import Path
from urllib.parse import urljoin

import pytz
import requests
from bs4 import BeautifulSoup
from icalendar import Calendar, Event

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

USER_AGENT = (
    "U-of-T-Calendar-Bot/1.0"
    " (Contact: sy.lei@mail.utoronto.ca; Student Project)"
)
UTSC_HUB_URL = "https://www.utsc.utoronto.ca/registrar/academic-dates"
TORONTO_TZ = pytz.timezone("America/Toronto")

SCRIPT_DIR = Path(__file__).parent
OUTPUT_DIR = SCRIPT_DIR.parent / "public" / "calendar"
OUTPUT_FILE = OUTPUT_DIR / "utsc.ics"

# Session sub-page URL patterns (relative path portion):
_SESSION_URL_RE = re.compile(
    r"/registrar/("
    r"(?:fall-\d{4}-\w+-\d{4})"  # e.g. fall-2025-winter-2026
    r"|(?:summer-\d{4})"          # e.g. summer-2026
    r"|(?:winter-\d{4})"          # e.g. winter-2026
    r"|(?:spring-\d{4})"          # e.g. spring-2026
    r")-academic-dates",
    re.IGNORECASE,
)

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Month mapping (handles both full names and 3-letter abbreviations)
# ---------------------------------------------------------------------------

MONTH_MAP: dict[str, int] = {
    "jan": 1,  "january": 1,
    "feb": 2,  "february": 2,
    "mar": 3,  "march": 3,
    "apr": 4,  "april": 4,
    "may": 5,
    "jun": 6,  "june": 6,
    "jul": 7,  "july": 7,
    "aug": 8,  "august": 8,
    "sep": 9,  "sept": 9,  "september": 9,
    "oct": 10, "october": 10,
    "nov": 11, "november": 11,
    "dec": 12, "december": 12,
}

# Date range regex: handles both full month names and abbreviations
# Examples: "Sep 2", "Oct 27 - 31", "Dec 24 - Jan 2", "Sep 2 - Dec 2"
_MON_PAT = (
    r"(?:January|February|March|April|May|June|July|August|September|October|November|December"
    r"|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)"
)
_DATE_RANGE_RE = re.compile(
    rf"({_MON_PAT})\.?\s+(\d{{1,2}})\b"    # start: month + 1-2 digit day
    rf"(?:\s*[-\u2013]\s*"                  # optional range (hyphen or en-dash)
    rf"(?:({_MON_PAT})\.?\s+)?(\d{{1,2}})\b)?",  # end: optional month + day
    re.IGNORECASE,
)

# Matches a session label like "FALL 2025-WINTER 2026", "SUMMER 2026", etc.
_SESSION_LABEL_RE = re.compile(
    r"(?:"
    r"FALL\s+\d{4}-WINTER\s+\d{4}"
    r"|FALL\s+\d{4}-SPRING\s+\d{4}"
    r"|SUMMER\s+\d{4}"
    r"|WINTER\s+\d{4}"
    r"|FALL\s+\d{4}"
    r"|SPRING\s+\d{4}"
    r")",
)


# ---------------------------------------------------------------------------
# Year / session helpers
# ---------------------------------------------------------------------------

def _session_label_from_url(path: str) -> str:
    """
    Convert a URL path segment to a canonical session label.

    ``fall-2025-winter-2026`` → ``FALL 2025-WINTER 2026``
    ``summer-2026``           → ``SUMMER 2026``
    """
    slug = path.lower()
    m_cross = re.match(r"fall-(\d{4})-(\w+)-(\d{4})", slug)
    m_single = re.match(r"(summer|winter|spring|fall)-(\d{4})", slug)
    if m_cross:
        term2 = m_cross.group(2).upper()
        return f"FALL {m_cross.group(1)}-{term2} {m_cross.group(3)}"
    if m_single:
        return f"{m_single.group(1).upper()} {m_single.group(2)}"
    # Last-resort: just uppercase and replace hyphens
    return slug.replace("-", " ").upper()


def _infer_year(month_num: int, session: str) -> int:
    """
    Infer the 4-digit calendar year for a month within a session label.

    Cross-year sessions (FALL YYYY-WINTER YYYY+1):
      months ≥ 8 (Aug-Dec) → fall year
      months < 8 (Jan-Jul) → winter/spring year
    Single-year sessions (SUMMER YYYY, WINTER YYYY, etc.):
      → return the year embedded in the session label
    """
    if ("FALL" in session) and ("WINTER" in session or "SPRING" in session):
        fall_m = re.search(r"FALL\s+(\d{4})", session)
        sec_m  = re.search(r"(?:WINTER|SPRING)\s+(\d{4})", session)
        if not fall_m or not sec_m:
            first_yr = re.search(r"\d{4}", session)
            return int(first_yr.group(0)) if first_yr else datetime.now().year
        fall_yr   = int(fall_m.group(1))
        second_yr = int(sec_m.group(1))
        return fall_yr if month_num >= 8 else second_yr

    m = re.search(r"\d{4}", session)
    return int(m.group(0)) if m else datetime.now().year


def _parse_date_range(
    start_mon: str,
    start_day: str,
    end_mon: str | None,
    end_day: str | None,
    session: str,
) -> tuple[date, date | None]:
    """Return (start_date, end_date) from regex match groups."""
    s_mon = MONTH_MAP[start_mon.lower()]
    s_yr  = _infer_year(s_mon, session)
    start = date(s_yr, s_mon, int(start_day))

    if end_day is None:
        return start, None

    if end_mon:
        e_mon = MONTH_MAP[end_mon.lower()]
    else:
        e_mon = s_mon  # same month as start

    e_yr = _infer_year(e_mon, session)
    end  = date(e_yr, e_mon, int(end_day))
    return start, end


# ---------------------------------------------------------------------------
# Hub page discovery
# ---------------------------------------------------------------------------

def _http_session() -> requests.Session:
    s = requests.Session()
    s.headers["User-Agent"] = USER_AGENT
    return s


def discover_session_urls(hub_url: str = UTSC_HUB_URL) -> list[tuple[str, str]]:
    """
    Fetch the UTSC academic dates hub page and return a list of
    ``(session_label, full_url)`` tuples for individual session sub-pages.
    """
    log.info("Fetching UTSC hub page: %s", hub_url)
    resp = _http_session().get(hub_url, timeout=30)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "lxml")

    discovered: list[tuple[str, str]] = []
    seen_urls: set[str] = set()

    for a in soup.find_all("a", href=True):
        href: str = a["href"]
        m = _SESSION_URL_RE.search(href)
        if m:
            full_url = urljoin(hub_url, href)
            if full_url in seen_urls:
                continue
            seen_urls.add(full_url)
            slug = m.group(1)
            label = _session_label_from_url(slug)
            discovered.append((label, full_url))
            log.info("  Found session: %s → %s", label, full_url)

    if not discovered:
        log.error("No session sub-pages found on hub page %s", hub_url)

    return discovered


# ---------------------------------------------------------------------------
# HTML table parsing
# ---------------------------------------------------------------------------

_HEADER_SKIP_RE = re.compile(
    r"^(?:f[- ]?(?:section|session)|y[- ]?(?:section|session)|s[- ]?(?:section|session)"
    r"|f-section|y-section|s-section|section|session|semester|term"
    r"|fall\s+only|winter\s+only|full\s+year|course\s+type)$",
    re.IGNORECASE,
)


def _cell_text(cell) -> str:
    """Extract clean text from a BeautifulSoup table cell."""
    return re.sub(r"\s+", " ", cell.get_text(separator=" ")).strip()


def _is_header_row(row) -> bool:
    """Return True if this row is a column-header row (all <th>)."""
    cells = row.find_all(["th", "td"])
    if not cells:
        return True
    # All <th> → header
    if all(c.name == "th" for c in cells):
        return True
    # First cell empty or whitespace-only → likely structural row
    first_text = _cell_text(cells[0])
    if not first_text:
        return True
    return False


def parse_session_tables(soup: BeautifulSoup, session: str) -> list[dict]:
    """
    Extract calendar events from all HTML tables on a UTSC session page.

    For each non-header row:
      - first cell  → event description (summary)
      - other cells → date ranges via ``_DATE_RANGE_RE``

    Duplicate (summary, start_date) pairs are silently dropped.
    """
    events: list[dict] = []
    seen: set[tuple[str, str]] = set()

    for table in soup.find_all("table"):
        for row in table.find_all("tr"):
            if _is_header_row(row):
                continue

            cells = row.find_all(["td", "th"])
            if len(cells) < 2:
                continue

            description = _cell_text(cells[0])
            if not description or len(description) < 4:
                continue
            # Skip rows whose first cell looks like a column header
            if _HEADER_SKIP_RE.match(description):
                continue

            # Extract dates from all non-first cells
            for cell in cells[1:]:
                cell_text = _cell_text(cell)
                for m in _DATE_RANGE_RE.finditer(cell_text):
                    s_mon, s_day, e_mon, e_day = m.groups()
                    try:
                        start, end = _parse_date_range(s_mon, s_day, e_mon, e_day, session)
                    except (ValueError, KeyError) as exc:
                        log.debug("Skipping unparseable date in %r: %s", cell_text, exc)
                        continue

                    summary = _build_summary(description)
                    dedup_key = (summary, start.isoformat())
                    if dedup_key in seen:
                        continue
                    seen.add(dedup_key)

                    events.append(
                        {
                            "start_date":  start,
                            "end_date":    end,
                            "session":     session,
                            "summary":     summary,
                            "description": description,
                        }
                    )

    log.info("  Parsed %d events from session %s", len(events), session)
    return events


def _build_summary(description: str, max_len: int = 75) -> str:
    """Return a concise SUMMARY string, truncated at a sentence boundary."""
    desc = re.sub(r"\s+", " ", description).strip()
    if len(desc) <= max_len:
        return desc
    truncated = desc[:max_len]
    last_period = truncated.rfind(".")
    if last_period > max_len // 2:
        return truncated[:last_period + 1]
    return truncated.rstrip() + "…"


# ---------------------------------------------------------------------------
# ICS generation
# ---------------------------------------------------------------------------

def generate_ics(events: list[dict], output_path: Path) -> None:
    """
    Write a VCALENDAR ICS file with one all-day VEVENT per event.

    DTEND is exclusive (day after the inclusive end date) per RFC 5545.
    UIDs are SHA-256 stable so repeated runs produce idempotent output.
    """
    cal = Calendar()
    cal.add("prodid", "-//U-of-T-Calendar-Bot//UTSC Important Dates//EN")
    cal.add("version", "2.0")
    cal.add("calscale", "GREGORIAN")
    cal.add("method", "PUBLISH")
    cal.add("x-wr-calname", "UTSC Important Dates")
    cal.add("x-wr-timezone", "America/Toronto")
    cal.add("x-wr-caldesc", "Generated by UofT calendar Bot")
    # Suggest clients refresh once per day (RFC 7986 + Apple compat)
    cal.add("refresh-interval", timedelta(days=1))
    cal.add("x-published-ttl", "P1D")

    now_utc = datetime.now(pytz.utc)

    for evt in events:
        vevent = Event()
        vevent.add("summary", evt["summary"])
        vevent.add("dtstart", evt["start_date"])

        inclusive_end = evt["end_date"] if evt["end_date"] else evt["start_date"]
        vevent.add("dtend", inclusive_end + timedelta(days=1))

        uid_src = (
            f"{evt['start_date'].isoformat()}"
            f"|{evt['session']}"
            f"|{evt['description'][:120]}"
        )
        uid_hex = hashlib.sha256(uid_src.encode()).hexdigest()[:24]
        vevent.add("uid", f"{uid_hex}@utsc-calendar-bot.github.io")

        vevent.add("dtstamp", now_utc)
        vevent.add(
            "description",
            (
                f"Session: {evt['session']}\n"
                f"{evt['description']}\n\n"
                f"Source: {UTSC_HUB_URL}\n"
                "Generated by U-of-T-Calendar-Bot "
                "(student project — not affiliated with the University of Toronto)"
            ),
        )
        vevent.add("url", UTSC_HUB_URL)
        cal.add_component(vevent)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(cal.to_ical())
    log.info("Wrote %d events → %s", len(events), output_path)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def _build_argparser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="Scrape UTSC important dates and produce an ICS calendar file."
    )
    p.add_argument(
        "--output",
        metavar="PATH",
        type=Path,
        default=OUTPUT_FILE,
        help=f"Output ICS file path (default: {OUTPUT_FILE})",
    )
    p.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Enable DEBUG-level logging.",
    )
    return p


def main(argv: list[str] | None = None) -> None:
    args = _build_argparser().parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)-8s %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S",
        stream=sys.stderr,
    )

    http = _http_session()

    # 1. Discover session sub-pages
    try:
        sessions = discover_session_urls()
    except Exception as exc:
        log.error("Failed to discover UTSC session pages: %s", exc)
        sys.exit(1)

    if not sessions:
        log.error("No session pages found — aborting")
        sys.exit(1)

    # 2. Parse each session page
    all_events: list[dict] = []
    for session_label, session_url in sessions:
        log.info("Fetching session page: %s", session_url)
        try:
            resp = http.get(session_url, timeout=30)
            resp.raise_for_status()
        except Exception as exc:
            log.warning("Failed to fetch %s: %s — skipping", session_url, exc)
            continue
        soup = BeautifulSoup(resp.text, "lxml")
        all_events.extend(parse_session_tables(soup, session_label))

    if not all_events:
        log.error("No events parsed from any UTSC session page — aborting")
        sys.exit(1)

    log.info("Total events parsed: %d", len(all_events))

    # 3. Write ICS
    generate_ics(all_events, args.output)
    log.info("Done ✓")


if __name__ == "__main__":
    main()
