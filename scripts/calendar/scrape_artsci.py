#!/usr/bin/env python3
"""
ArtsCI Important Dates Calendar Scraper
=========================================
Fetches important academic dates from the University of Toronto
Faculty of Arts & Science Registrar and generates a standards-compliant
ICS calendar file.

Data source : https://www.artsci.utoronto.ca/current/dates-deadlines/academic-dates
Technique   : Playwright headless Chromium + BeautifulSoup
              (dates are inside click-to-expand Bootstrap panels)
Output      : public/ics/artsci.ics  (all-day VEVENT entries)

NOT AN OFFICIAL UNIVERSITY OF TORONTO / ARTSCI PRODUCT.
This is a student convenience tool.  Always verify dates with the official page.

User-Agent  : U-of-T-Calendar-Bot/1.0 (Contact: sy.lei@mail.utoronto.ca; Student Project)
"""

from __future__ import annotations

import argparse
import logging
import re
import sys
from datetime import date
from pathlib import Path

from bs4 import BeautifulSoup
from playwright.sync_api import TimeoutError as PlaywrightTimeout
from playwright.sync_api import sync_playwright

# Make the shared ``common`` package importable when run as a script.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from common.http import CALENDAR_BOT_UA
from common.ics import write_all_day_calendar
from common.paths import CALENDAR_DIR

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

ARTSCI_URL = "https://www.artsci.utoronto.ca/current/dates-deadlines/academic-dates"

OUTPUT_FILE = CALENDAR_DIR / "artsci.ics"

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Month mapping
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

# ---------------------------------------------------------------------------
# Date regex
# ---------------------------------------------------------------------------
# ArtsCI dates always include a 4-digit year, e.g.:
#   "July 1, 2025"
#   "July 7 – July 23, 2025"
#   "March 2 – 8, 2026"
#   "December 22, 2025 – January 2, 2026"   (cross-year, year at each date)
# ---------------------------------------------------------------------------

_MON_PAT = (
    r"(?:January|February|March|April|May|June|July|August|September"
    r"|October|November|December)"
)
# Primary format: "MONTH DAY[, YEAR]  [DASH  [MONTH] DAY[, YEAR]]"
_ARTSCI_DATE_RE = re.compile(
    rf"({_MON_PAT})\s+(\d{{1,2}})"           # start month + day
    rf"(?:,?\s*(\d{{4}}))?"                   # optional start year (e.g. cross-year ranges)
    rf"(?:\s*[–\-]\s*"                        # optional range separator
    rf"(?:({_MON_PAT})\s+)?(\d{{1,2}})"       # end: optional month + day
    rf",?\s*(\d{{4}}))?"                       # end year (required when range present)
    ,
    re.IGNORECASE,
)


def _parse_artsci_cell(date_text: str) -> tuple[date, date | None] | None:
    """
    Parse an ArtsCI date cell string into ``(start_date, end_date | None)``.

    Handles:
    * ``July 1, 2025``              → single date
    * ``July 7 – July 23, 2025``    → range, implied same year
    * ``March 2 – 8, 2026``         → range, same month
    * ``December 22, 2025 – January 2, 2026``  → cross-year range
    """
    # Normalise non-breaking spaces and en-dashes to ASCII equivalents
    cleaned = date_text.replace("\xa0", " ").replace("\u2013", "-").strip()

    m = _ARTSCI_DATE_RE.search(cleaned)
    if not m:
        return None

    s_mon_str, s_day_str, s_year_str, e_mon_str, e_day_str, e_year_str = m.groups()

    # When a single year is present (no range), it follows the only date
    # e.g. "July 1, 2025" → s_year_str="2025", e_* all None
    if e_day_str is None:
        # Single date
        if not s_year_str:
            return None  # No year at all — cannot place this date
        year = int(s_year_str)
        s_mon = MONTH_MAP[s_mon_str.lower()]
        try:
            return date(year, s_mon, int(s_day_str)), None
        except ValueError:
            return None

    # Range date
    if e_year_str is None and s_year_str is None:
        return None  # Cannot determine year

    e_year = int(e_year_str) if e_year_str else int(s_year_str)  # type: ignore[arg-type]
    s_year = int(s_year_str) if s_year_str else e_year

    s_mon = MONTH_MAP[s_mon_str.lower()]
    e_mon = MONTH_MAP[e_mon_str.lower()] if e_mon_str else s_mon

    # If no explicit start year and start month > end month → cross-year, decrement
    if not s_year_str and s_mon > e_mon:
        s_year = e_year - 1

    try:
        start = date(s_year, s_mon, int(s_day_str))
        end   = date(e_year, e_mon, int(e_day_str))
        return start, end
    except ValueError:
        return None


def _build_summary(description: str, max_len: int = 75) -> str:
    desc = re.sub(r"\s+", " ", description).strip()
    if len(desc) <= max_len:
        return desc
    truncated = desc[:max_len]
    last_period = truncated.rfind(".")
    if last_period > max_len // 2:
        return truncated[:last_period + 1]
    return truncated.rstrip() + "…"


# ---------------------------------------------------------------------------
# Playwright fetch
# ---------------------------------------------------------------------------

def fetch_panels_html(debug_out: Path | None = None) -> str:
    """
    Launch headless Chromium, navigate to the ArtsCI dates page, click all
    Bootstrap panel-title headers to trigger their AJAX content load, then
    return the fully-rendered page HTML.
    """
    log.info("Launching headless Chromium …")
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        ctx = browser.new_context(
            user_agent=CALENDAR_BOT_UA,
            locale="en-CA",
            timezone_id="America/Toronto",
        )
        page = ctx.new_page()

        log.info("Navigating to %s", ARTSCI_URL)
        page.goto(ARTSCI_URL, wait_until="networkidle", timeout=60_000)

        # Click every panel-title h2 to trigger lazy AJAX content load
        h2_handles = page.query_selector_all("h2.panel-title")
        log.info("Found %d panel-title headers to expand", len(h2_handles))
        for h2 in h2_handles:
            try:
                title_text = h2.inner_text()
                log.info("  Expanding: %s", title_text.strip()[:40])
                h2.click()
                # Wait for the panel's AJAX response to arrive
                page.wait_for_timeout(2_000)
            except Exception as exc:
                log.warning("Could not click panel header: %s", exc)

        # Brief extra wait to ensure all responses have settled
        page.wait_for_timeout(1_000)

        if debug_out:
            html = page.content()
            debug_out.write_text(html, encoding="utf-8")
            log.info("Saved debug HTML → %s", debug_out)

        html = page.content()
        browser.close()

    return html


# ---------------------------------------------------------------------------
# HTML parsing
# ---------------------------------------------------------------------------

def parse_panels(html: str) -> list[dict]:
    """
    Parse Bootstrap ``.panel`` divs from the rendered ArtsCI page HTML.

    Each panel has a ``.panel-title`` (session name) and a ``.panel-body``
    containing a two-column table: Date | Activity.
    """
    soup = BeautifulSoup(html, "lxml")
    events: list[dict] = []
    seen: set[tuple[str, str]] = set()  # (summary, start_date) dedup

    for panel in soup.select(".panel"):
        title_el = panel.select_one(".panel-title")
        body_el  = panel.select_one(".panel-body")
        if not title_el or not body_el:
            continue

        session_name = title_el.get_text(strip=True).replace("\xa0", " ")

        for row in body_el.select("tr"):
            cells = row.find_all(["td", "th"])
            if len(cells) < 2:
                continue

            date_cell = cells[0].get_text(separator=" ", strip=True).replace("\xa0", " ")
            activity  = cells[1].get_text(separator=" ", strip=True).replace("\xa0", " ")
            activity  = re.sub(r"\s+", " ", activity).strip()

            # Skip header rows
            if date_cell.strip().lower() == "date":
                continue

            result = _parse_artsci_cell(date_cell)
            if result is None:
                log.debug("Could not parse date cell: %r", date_cell)
                continue

            start, end = result
            summary = _build_summary(activity)

            dedup_key = (summary, start.isoformat())
            if dedup_key in seen:
                continue
            seen.add(dedup_key)

            events.append(
                {
                    "start_date":   start,
                    "end_date":     end,
                    "session":      session_name,
                    "summary":      summary,
                    "description":  activity,
                }
            )

    log.info("Parsed %d events", len(events))
    return events


# ---------------------------------------------------------------------------
# ICS generation
# ---------------------------------------------------------------------------

def generate_ics(events: list[dict], output_path: Path) -> None:
    """Write a VCALENDAR ICS file with one all-day VEVENT per event."""
    write_all_day_calendar(
        events,
        output_path,
        prodid="-//U-of-T-Calendar-Bot//ArtsCI Important Dates//EN",
        calname="ArtsCI Important Dates",
        uid_domain="artsci-calendar-bot.github.io",
        source_url=ARTSCI_URL,
    )
    log.info("Wrote %d events → %s", len(events), output_path)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def _build_argparser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="Scrape ArtsCI important dates and produce an ICS calendar file."
    )
    p.add_argument(
        "--debug",
        metavar="PATH",
        type=Path,
        default=None,
        help="Save the fully-rendered page HTML to PATH for inspection.",
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

    # 1. Fetch rendered HTML with all panels expanded
    try:
        html = fetch_panels_html(debug_out=args.debug)
    except Exception as exc:
        log.error("Failed to fetch ArtsCI page: %s", exc)
        sys.exit(1)

    # 2. Parse panels
    events = parse_panels(html)
    if not events:
        log.error("No events parsed — check the page structure")
        sys.exit(1)

    # 3. Write ICS
    generate_ics(events, args.output)
    log.info("Done ✓")


if __name__ == "__main__":
    main()
