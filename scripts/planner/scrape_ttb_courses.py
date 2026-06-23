"""
Scrape UTM course timetable from TTB API and output static JSON files.
Outputs:
  planner/data/utm-timetable-{session}.json  (UTM / ERIN — one per session)
  planner/data/stg-timetable-{session}.json  (St. George / Arts & Sci — only
      courses whose subject+number+weight also exist at UTM, so a student can
      schedule the downtown "H1" twin of a UTM course as a cross-campus pill)
"""

import re
import sys
import time
from pathlib import Path

# Make the shared ``common`` package importable when run as a script.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from common.http import PLANNER_UA, make_session
from common.io import write_json
from common.paths import PLANNER_DATA_DIR as OUTPUT_DIR

REFERENCE   = "https://api.easi.utoronto.ca/ttb/reference-data"
COURSES_API = "https://api.easi.utoronto.ca/ttb/getPageableCourses"
UTM_DIV     = "ERIN"
# St. George divisions to also pull (Faculty of Arts & Science is where UTM
# students cross-register). Add more division codes here to widen coverage.
STG_DIVS    = ["ARTSC"]
PAGE_SIZE   = 100

SESSION = make_session(PLANNER_UA, {
    "Accept":  "application/json",
    "Referer": "https://ttb.utoronto.ca/",
})


def get_sessions() -> list[dict]:
    resp = SESSION.get(REFERENCE, timeout=15)
    resp.raise_for_status()
    items = resp.json()["payload"]["currentSessions"]
    # Keep only non-header real sessions (have a 5-digit+ code)
    return [s for s in items if not s.get("header") and len(s["value"]) >= 5]


def fetch_all_courses(session_code: str, divisions: list[str]) -> list[dict]:
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
            "divisions": divisions,
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
        instructors_raw = sec.get("instructors", []) or []
        instructors = [
            {"firstName": i.get("firstName", ""), "lastName": i.get("lastName", "")}
            for i in instructors_raw
        ]
        sections.append({
            "name":          sec.get("name"),
            "type":          sec.get("teachMethod"),  # LEC, TUT, PRA
            "sectionNumber": sec.get("sectionNumber"),
            "times":         times,
            "instructors":   instructors,
        })
    return {
        "code":        raw["code"],
        "name":        raw["name"],
        "sectionCode": raw.get("sectionCode"),   # F / S / Y
        "sections":    sections,
    }


def base_code(code: str) -> str:
    """Subject+number+weight key shared by a course's campus variants
    (CSC108H5 → 'CSC108H'); the trailing campus digit is what differs."""
    return re.sub(r"(\d)$", "", code or "")


def write_timetable(prefix: str, code: str, label: str, courses: list[dict]) -> None:
    out = {
        "session":      code,
        "sessionLabel": label,
        "courseCount":  len(courses),
        "courses":      courses,
    }
    dest = OUTPUT_DIR / f"{prefix}-timetable-{code}.json"
    write_json(dest, out)
    print(f"  -> {dest} ({len(courses)} courses)")


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    print("Fetching available sessions...")
    sessions = get_sessions()
    print(f"Found {len(sessions)} sessions: {[s['value'] for s in sessions]}")

    for s in sessions:
        code  = s["value"]
        label = s["label"]
        print(f"\nScraping UTM {label} ({code})...")
        utm = [simplify_course(c) for c in fetch_all_courses(code, [UTM_DIV])]
        write_timetable("utm", code, label, utm)

        # St. George: keep only the same-named twins of UTM courses, so the file
        # stays small and matches the "extra H1 pill on a UTM course" feature.
        print(f"Scraping St. George {label} ({code})...")
        utm_bases = {base_code(c["code"]) for c in utm}
        stg_all   = [simplify_course(c) for c in fetch_all_courses(code, STG_DIVS)]
        stg       = [c for c in stg_all if base_code(c["code"]) in utm_bases]
        print(f"  filtered {len(stg_all)} St. George courses → {len(stg)} cross-listed with UTM")
        write_timetable("stg", code, label, stg)

    # Write a session index so the frontend knows which files exist
    index = [{"value": s["value"], "label": s["label"]} for s in sessions]
    write_json(OUTPUT_DIR / "utm-sessions.json", index)
    print("\nDone. utm-sessions.json written.")


if __name__ == "__main__":
    main()
