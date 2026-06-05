"""
Scrape UTM Academic Calendar program requirements.
Outputs: public/planner/data/programs.json
"""

import json
import re
import time
from pathlib import Path

import requests
from bs4 import BeautifulSoup

SCRIPT_DIR   = Path(__file__).parent
OUTPUT_DIR   = SCRIPT_DIR.parent / "public" / "planner" / "data"
CALENDAR_URL = "https://utm.calendar.utoronto.ca"
SECTION_URL  = f"{CALENDAR_URL}/section/"

COURSE_RE    = re.compile(r"\b([A-Z]{2,4}\d{3}[YH][0-9])\b")
PROGRAM_TYPE_RE = re.compile(r"\b(Specialist|Major|Minor|Certificate)\b", re.IGNORECASE)

SESSION = requests.Session()
SESSION.headers.update({
    "User-Agent": "Mozilla/5.0 (compatible; UofT-Tools/1.0)",
    "Accept":     "text/html,application/xhtml+xml",
})


def fetch_html(url: str) -> BeautifulSoup:
    resp = SESSION.get(url, timeout=15)
    resp.raise_for_status()
    return BeautifulSoup(resp.text, "html.parser")


def get_sections() -> list[dict]:
    """Return list of {slug, name} for all 60 sections."""
    # The section listing page renders links server-side in the menu
    # but the main content list needs JS. Use the known URL pattern directly
    # by fetching the main page and finding /section/ links in the HTML.
    soup = fetch_html(SECTION_URL)
    seen = set()
    sections = []
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if href.startswith("/section/") and href != "/section/":
            slug = href[len("/section/"):]
            if slug and slug not in seen:
                seen.add(slug)
                sections.append({"slug": slug, "name": a.get_text(strip=True)})
    return sections


def get_program_links(section_slug: str) -> list[str]:
    """Return list of /program/{id} paths for a section."""
    soup = fetch_html(f"{CALENDAR_URL}/section/{section_slug}")
    hrefs = []
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if href.startswith("/program/"):
            hrefs.append(href)
    return list(dict.fromkeys(hrefs))  # deduplicate, preserve order


def parse_program(path: str) -> dict | None:
    """Fetch a program page and extract structured data."""
    url  = CALENDAR_URL + path
    soup = fetch_html(url)

    # The first <h1> is the global site "Academic Calendar" header.
    # The <title> tag has the real name: "Anthropology - Major (Science) - ERMAJ0105 | Academic Calendar"
    title_el = soup.find("title")
    if not title_el:
        return None
    title = title_el.get_text(strip=True).removesuffix(" | Academic Calendar")

    # Parse: "Anthropology - Major (Science) - ERMAJ0105"
    # or "Biology for Health Sciences - Major (Science) - ERMAJ0123"
    parts = [p.strip() for p in title.rsplit(" - ", 2)]
    if len(parts) == 3:
        name, type_part, code = parts
        m = PROGRAM_TYPE_RE.search(type_part)
        prog_type = m.group(1).capitalize() if m else "Program"
    else:
        name = title
        prog_type = "Program"
        code = path.lstrip("/program/")

    # Main content text
    main = soup.find(id="main-content") or soup.find("main") or soup.find("body")
    text = main.get_text(separator="\n") if main else ""

    # Extract all course codes mentioned anywhere in the page
    course_codes = sorted(set(COURSE_RE.findall(text)))

    # Extract the program ID from path (/program/ermaj1688 → ermaj1688)
    prog_id = path.lstrip("/program/")

    return {
        "id":       prog_id,
        "path":     path,
        "name":     name,
        "type":     prog_type,
        "code":     code,
        "courses":  course_codes,
    }


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    print("Fetching section list...")
    sections = get_sections()
    print(f"Found {len(sections)} sections")

    # If calendar page didn't yield links (JS-only rendering), fall back to known list
    if len(sections) < 10:
        print("Warning: few sections found via static HTML, using known slug list")
        slugs = [
            "Anthropology","Arabic","Art","Astronomy","Bioinformatics","Biology",
            "Biomedical-Communications","Business,-Science-and-Entrepreneurship",
            "Canadian-Studies","Chemistry","Chinese","Cinema-Studies",
            "Classical-Civilization","Combined-Degree-Programs","Commerce",
            "Communication,-Culture,-Information-and-Technology","Computer-Science",
            "Co~op-Internship-Program","Criminology,-Law-and-Society",
            "Diaspora-and-Transnational-Studies","Earth-Science","Economics",
            "Education-Studies","English","Environmental-Management",
            "Environmental-Science","Exceptionality-in-Human-Learning",
            "Forensic-Sciences","French","GeoSpatial-Data-Science","Geography",
            "German","Greek","Hindi","History","History-of-Religions",
            "International-Affairs","Italian","Language-Studies",
            "Language-Teaching-and-Learning","Latin",
            "Latin-American-and-Caribbean-Studies","Linguistics","Management",
            "Management-and-Innovation","Mathematical-Sciences","Neuroscience",
            "Persian","Philosophy","Physics","Political-Science","Psychology",
            "Sociology","South-Asian-Humanities","Spanish","Statistics,-Applied",
            "Study-of-University-Pedagogy",
            "Theatre,-Drama-and-Performance-Studies",
            "Visual-Culture-and-Communication",
            "Women,-Gender-and-Sexuality-Studies",
        ]
        sections = [{"slug": s, "name": s.replace("-", " ").replace(",", "")} for s in slugs]

    result_sections = []
    for sec in sections:
        slug = sec["slug"]
        print(f"  {slug} ...", end=" ", flush=True)
        try:
            prog_paths = get_program_links(slug)
            print(f"{len(prog_paths)} programs")
        except Exception as e:
            print(f"ERROR: {e}")
            result_sections.append({"slug": slug, "name": sec["name"], "programs": []})
            continue

        programs = []
        for path in prog_paths:
            try:
                prog = parse_program(path)
                if prog:
                    programs.append(prog)
                time.sleep(0.15)
            except Exception as e:
                print(f"    {path} ERROR: {e}")

        result_sections.append({
            "slug":     slug,
            "name":     sec["name"] or slug.replace("-", " "),
            "programs": programs,
        })
        time.sleep(0.2)

    output = {
        "sections": result_sections,
        "totalPrograms": sum(len(s["programs"]) for s in result_sections),
    }
    dest = OUTPUT_DIR / "utm-programs.json"
    dest.write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")))
    print(f"\nDone → {dest} ({output['totalPrograms']} programs)")


if __name__ == "__main__":
    main()
