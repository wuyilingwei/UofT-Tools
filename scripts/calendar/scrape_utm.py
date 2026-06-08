#!/usr/bin/env python3
"""
UTM Important Dates Calendar Scraper
=====================================
Fetches important academic dates from the University of Toronto Mississauga
Registrar's Office and generates a standards-compliant ICS calendar file.

Data source : https://www.utm.utoronto.ca/registrar/dates
Technique   : Playwright headless Chromium (dates are rendered by an Elfsight
              JavaScript widget and are not present in the raw HTML)
Output      : public/ics/utm.ics  (all-day VEVENT entries)

NOT AN OFFICIAL UNIVERSITY OF TORONTO / UTM PRODUCT.
This is a student convenience tool.  Always verify dates with the official page.

User-Agent  : U-of-T-Calendar-Bot/1.0 (Contact: sy.lei@mail.utoronto.ca; Student Project)
"""

from __future__ import annotations

import argparse
import logging
import re
import sys
from datetime import date, datetime
from pathlib import Path

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

UTM_URL = "https://www.utm.utoronto.ca/registrar/dates"

# Elfsight widget CSS class that contains all date content
ELFSIGHT_APP_CLASS = "elfsight-app-f242be0e-1d36-4aef-8bbf-d260c4c8f05e"

OUTPUT_FILE = CALENDAR_DIR / "utm.ics"

# ---------------------------------------------------------------------------
# Date / session helpers
# ---------------------------------------------------------------------------

MONTH_ABBR: dict[str, int] = {
    "JAN": 1, "FEB": 2, "MAR": 3, "APR": 4, "MAY": 5, "JUN": 6,
    "JUL": 7, "AUG": 8, "SEP": 9, "OCT": 10, "NOV": 11, "DEC": 12,
}

_ABBR_PAT = r"(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)"
_DATE_PAT = rf"{_ABBR_PAT}\s+\d{{1,2}}"
_SESSION_PAT = (
    r"(?:"
    r"FALL\s+\d{4}-WINTER\s+\d{4}"
    r"|FALL\s+\d{4}-SPRING\s+\d{4}"
    r"|SUMMER\s+\d{4}"
    r"|WINTER\s+\d{4}"
    r"|FALL\s+\d{4}"
    r"|SPRING\s+\d{4}"
    r")"
)

# Matches one event header: [date] [optional date] [session]
_EVENT_HEADER_RE = re.compile(
    rf"({_DATE_PAT})"              # group 1: start date token
    rf"(?:\s+({_DATE_PAT}))?"      # group 2: optional end date token
    rf"\s+({_SESSION_PAT})",       # group 3: session label
)

log = logging.getLogger(__name__)


def _infer_year(month_num: int, session: str) -> int:
    """
    Determine the four-digit year for a date given its month and the session
    label (e.g. 'FALL 2025-WINTER 2026', 'SUMMER 2026').

    For cross-year sessions (FALL YYYY-WINTER YYYY+1):
      - months Aug–Dec  → fall year (YYYY)
      - months Jan–Jul  → winter year (YYYY+1)
    """
    if "FALL" in session and ("WINTER" in session or "SPRING" in session):
        fall_m  = re.search(r"FALL\s+(\d{4})", session)
        sec_m   = re.search(r"(?:WINTER|SPRING)\s+(\d{4})", session)
        if not fall_m or not sec_m:
            # Malformed session label — fall back to the first 4-digit year found
            first_yr = re.search(r"\d{4}", session)
            return int(first_yr.group(0)) if first_yr else datetime.now().year
        fall_yr   = int(fall_m.group(1))
        second_yr = int(sec_m.group(1))
        return fall_yr if month_num >= 8 else second_yr

    m = re.search(r"\d{4}", session)
    return int(m.group(0)) if m else datetime.now().year


def _parse_date_token(token: str, session: str) -> date:
    """Convert 'APR 3' → datetime.date using session for year inference."""
    parts = token.strip().split()
    mon, day = parts[0].upper(), int(parts[1])
    month_num = MONTH_ABBR[mon]
    year = _infer_year(month_num, session)
    return date(year, month_num, day)


# ---------------------------------------------------------------------------
# Web scraping
# ---------------------------------------------------------------------------


def fetch_widget_text(debug_out: Path | None = None) -> str:
    """
    Launch headless Chromium, navigate to the UTM registrar dates page, wait
    for the Elfsight widget to finish rendering, then return the widget's
    plain-text content.

    Parameters
    ----------
    debug_out
        If provided, save the full rendered page HTML to this path for
        debugging (``--debug`` flag).
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

        log.info("Navigating to %s", UTM_URL)
        page.goto(UTM_URL, wait_until="domcontentloaded", timeout=45_000)

        # Wait for the Elfsight widget to populate with actual content.
        # The widget starts as <div>…&nbsp;…</div>; we wait until it has
        # substantial text (> 100 chars) indicating the calendar has loaded.
        widget_selector = f".{ELFSIGHT_APP_CLASS}"
        try:
            page.wait_for_function(
                f"""() => {{
                    const el = document.querySelector('{widget_selector}');
                    return el && el.innerText.replace(/\\s/g, '').length > 100;
                }}""",
                timeout=45_000,
            )
            log.info("Elfsight widget loaded")
        except PlaywrightTimeout:
            log.warning("Widget load timed out — attempting extraction anyway")

        if debug_out:
            debug_out.write_text(page.content(), encoding="utf-8")
            log.info("Saved rendered HTML to %s", debug_out)

        # Extract text from the widget container only to avoid nav/footer noise
        try:
            text = page.locator(widget_selector).inner_text(timeout=10_000)
        except Exception:
            # Fallback: grab the whole page body text
            log.warning("Widget selector failed; falling back to full body text")
            text = page.locator("body").inner_text()

        log.info("Extracted %d characters from widget", len(text))
        browser.close()

    return text


# ---------------------------------------------------------------------------
# Parsing
# ---------------------------------------------------------------------------


def parse_events(raw_text: str) -> list[dict]:
    """
    Parse the widget's plain text and return a list of event dicts::

        {
          "start_date": datetime.date,
          "end_date":   datetime.date | None,   # inclusive
          "session":    str,
          "summary":    str,
          "description": str,
        }
    """
    # ---- Normalise whitespace & strip link artefacts --------------------
    text = re.sub(r"\r\n|\r", "\n", raw_text)
    text = re.sub(r"\[LEARN MORE\][^\n]*", " ", text)
    text = re.sub(r"\[.*?\]\(.*?\)", " ", text, flags=re.DOTALL)
    # Remove standalone month-year headers (e.g. "April 2026", "March 2026")
    # that Elfsight inserts as section separators — they must not bleed into descriptions
    _MONTH_HEADER_RE = re.compile(
        r"\b(?:January|February|March|April|May|June|July|August|September"
        r"|October|November|December)\s+\d{4}\b"
    )
    text = _MONTH_HEADER_RE.sub(" ", text)
    # Strip "Filters" UI label and "Past Dates" section separator
    text = re.sub(r"\bFilters\b", " ", text)
    text = re.sub(r"\bPast\s+Dates\b", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"[ \t]+", " ", text)        # collapse horizontal whitespace
    text = re.sub(r"\n{2,}", "\n", text)        # collapse blank lines
    text = text.strip()

    events: list[dict] = []
    matches = list(_EVENT_HEADER_RE.finditer(text))

    if not matches:
        log.error("No events matched in text (first 500 chars):\n%s", text[:500])
        return []

    for idx, m in enumerate(matches):
        start_tok = m.group(1).strip()
        end_tok   = m.group(2).strip() if m.group(2) else None
        session   = m.group(3).strip()

        # Description = text between the end of the session label and the
        # start of the *next* event header (or end of string)
        desc_start = m.end()
        desc_end   = matches[idx + 1].start() if idx + 1 < len(matches) else len(text)
        description = text[desc_start:desc_end].strip()

        # Collapse remaining whitespace
        description = re.sub(r"\s+", " ", description).strip()
        if not description:
            description = "See UTM Registrar for details"

        try:
            start_date = _parse_date_token(start_tok, session)
        except (ValueError, KeyError) as exc:
            log.warning("Could not parse start date %r: %s", start_tok, exc)
            continue

        end_date: date | None = None
        if end_tok:
            try:
                end_date = _parse_date_token(end_tok, session)
            except (ValueError, KeyError) as exc:
                log.warning("Could not parse end date %r: %s", end_tok, exc)

        events.append(
            {
                "start_date":  start_date,
                "end_date":    end_date,
                "session":     session,
                "summary":     _build_summary(description),
                "description": description,
            }
        )

    log.info("Parsed %d events", len(events))
    return events


def _build_summary(description: str, max_len: int = 75) -> str:
    """Return a concise SUMMARY string truncated at a sentence boundary."""
    desc = description.strip()
    if len(desc) <= max_len:
        return desc
    truncated = desc[:max_len]
    # Prefer breaking at a sentence end
    last_period = truncated.rfind(".")
    if last_period > max_len // 2:
        return truncated[: last_period + 1]
    return truncated.rstrip() + "…"


# ---------------------------------------------------------------------------
# ICS generation
# ---------------------------------------------------------------------------


def generate_ics(events: list[dict], output_path: Path) -> None:
    """Write a VCALENDAR ICS file with one all-day VEVENT per event."""
    write_all_day_calendar(
        events,
        output_path,
        prodid="-//U-of-T-Calendar-Bot//UTM Important Dates//EN",
        calname="UTM Important Dates",
        uid_domain="utm-calendar-bot.github.io",
        source_url=UTM_URL,
    )
    log.info("Wrote %d events → %s", len(events), output_path)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def _build_argparser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="Scrape UTM important dates and produce an ICS calendar file."
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

    # 1. Fetch rendered content
    try:
        text = fetch_widget_text(debug_out=args.debug)
    except Exception as exc:
        log.error("Failed to fetch page: %s", exc)
        sys.exit(1)

    if not text or len(text.strip()) < 50:
        log.error("Extracted text is too short (%d chars) — aborting", len(text.strip()))
        sys.exit(1)

    # 2. Parse events
    events = parse_events(text)
    if not events:
        log.error("No events parsed — check the page structure or widget selector")
        sys.exit(1)

    # 3. Write ICS
    generate_ics(events, args.output)
    log.info("Done ✓")


if __name__ == "__main__":
    main()
