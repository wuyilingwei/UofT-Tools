"""
Scrape UTM course timetable from TTB API and output static JSON files.
Outputs: public/planner/data/timetable-{session}.json  (one file per session)
"""

import json
import sys
import time
from pathlib import Path

import requests

SCRIPT_DIR  = Path(__file__).parent
OUTPUT_DIR  = SCRIPT_DIR.parent / "public" / "planner" / "data"
REFERENCE   = "https://api.easi.utoronto.ca/ttb/reference-data"
COURSES_API = "https://api.easi.utoronto.ca/ttb/getPageableCourses"
UTM_DIV     = "ERIN"
PAGE_SIZE   = 100

SESSION = requests.Session()
SESSION.headers.update({
    "User-Agent": "Mozilla/5.0 (compatible; UofT-Tools/1.0)",
    "Accept":     "application/json",
    "Referer":    "https://ttb.utoronto.ca/",
})


def get_sessions() -> list[dict]:
    resp = SESSION.get(REFERENCE, timeout=15)
    resp.raise_for_status()
    items = resp.json()["payload"]["currentSessions"]
    # Keep only non-header real sessions (have a 5-digit+ code)
    return [s for s in items if not s.get("header") and len(s["value"]) >= 5]


def fetch_all_courses(session_code: str) -> list[dict]:
    courses: list[dict] = []
    page = 1
    while True:
        payload = {
            "courseCodeAndTitleProps": {
                "courseCode": "", "courseTitle": "", "courseSectionCode": ""
            },
            "departmentProps": [],
            "campuses": [],
            "sessions": [session_code],
            "requirementProps": [],
            "instructor": "",
            "courseLevels": [],
            "deliveryModes": [],
            "dayPreferences": [],
            "timePreferences": [],
            "divisions": [UTM_DIV],
            "creditWeights": [],
            "availableSpace": False,
            "waitListable": False,
            "page": page,
            "pageSize": PAGE_SIZE,
            "direction": "asc",
        }
        resp = SESSION.post(COURSES_API, json=payload, timeout=20)
        if resp.status_code == 404:
            print(f"  404 — session not yet published, skipping")
            return []
        resp.raise_for_status()
        data   = resp.json()["payload"]["pageableCourse"]
        batch  = data.get("courses", [])
        total  = data.get("total", 0)
        courses.extend(batch)
        print(f"  page {page}: {len(batch)} courses (total so far: {len(courses)}/{total})")
        if len(courses) >= total or not batch:
            break
        page += 1
        time.sleep(0.3)
    return courses


def simplify_course(raw: dict) -> dict:
    sections = []
    for sec in raw.get("sections", []):
        times = []
        for mt in sec.get("meetingTimes", []):
            start = mt.get("start", {})
            end   = mt.get("end", {})
            bld   = mt.get("building", {})
            times.append({
                "day":       start.get("day"),
                "startMs":   start.get("millisofday"),
                "endMs":     end.get("millisofday"),
                "room":      (bld.get("buildingCode", "") + " " + bld.get("buildingRoomNumber", "")).strip(),
            })
        sections.append({
            "name":          sec.get("name"),
            "type":          sec.get("teachMethod"),  # LEC, TUT, PRA
            "sectionNumber": sec.get("sectionNumber"),
            "times":         times,
        })
    return {
        "code":        raw["code"],
        "name":        raw["name"],
        "sectionCode": raw.get("sectionCode"),   # F / S / Y
        "sections":    sections,
    }


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    print("Fetching available sessions...")
    sessions = get_sessions()
    print(f"Found {len(sessions)} sessions: {[s['value'] for s in sessions]}")

    for s in sessions:
        code  = s["value"]
        label = s["label"]
        print(f"\nScraping {label} ({code})...")
        raw_courses = fetch_all_courses(code)
        simplified  = [simplify_course(c) for c in raw_courses]

        out = {
            "session":       code,
            "sessionLabel":  label,
            "courseCount":   len(simplified),
            "courses":       simplified,
        }
        dest = OUTPUT_DIR / f"utm-timetable-{code}.json"
        dest.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
        print(f"  -> {dest} ({len(simplified)} courses)")

    # Write a session index so the frontend knows which files exist
    index = [{"value": s["value"], "label": s["label"]} for s in sessions]
    (OUTPUT_DIR / "utm-sessions.json").write_text(
        json.dumps(index, ensure_ascii=False, separators=(",", ":"))
    )
    print("\nDone. utm-sessions.json written.")


if __name__ == "__main__":
    main()
