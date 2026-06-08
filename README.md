# UofT-Tools – Utility Suite for University of Toronto Students

A collection of open-source tools designed to make student life at the University of Toronto easier.

> **NOT AN OFFICIAL UNIVERSITY PRODUCT.**
> This is an independent student project, not affiliated with or endorsed by the University of Toronto.
> Always verify important information at the official university websites.

---

## Website

Visit **[uoft.wuyilingwei.com](https://uoft.wuyilingwei.com)** to access all tools and features.

---

## Available Tools

### 📅 Academic Calendar Subscriptions
Automatically-updated calendar feeds (.ics files) for three University of Toronto campuses:
- **St. George (Arts & Science)**
- **Mississauga (UTM)**
- **Scarborough (UTSC)**

Calendars are synchronized daily via GitHub Actions with the latest course schedules and important academic dates.

[View Calendar Feeds](https://uoft.wuyilingwei.com/calendar/)

### 📋 UTM Course Planner
Browse UTM programs, see required courses and structured requirements, track your progress, and build a weekly schedule from TTB timetable data.

[Open Planner](https://uoft.wuyilingwei.com/planner/)

---

## Technical Overview

- **Frontend**: Vue 3 + Vite multi-page app (`src/pages/*`), built to static assets and hosted on Cloudflare Pages
- **Backend**: Python web scrapers (Playwright + BeautifulSoup), organised by module under `scripts/{calendar,planner,common}/`, run on a schedule via GitHub Actions
- **Deployment**: `npm run build` outputs to `dist/` (the Cloudflare Pages publish directory); scraper-generated `*.ics` and planner data JSON live in `public/` and are copied into the build verbatim
- **Updates**: Automatic calendar sync every 24 hours

### Local development

```bash
npm install
npm run dev      # Vite dev server (all pages)
npm run build    # production build → dist/
npm test         # Vitest unit + component tests
```

---

## Disclaimer

This project is **not** affiliated with, sponsored by, or endorsed by the University of Toronto or any of its campuses, staff, or departments. All tools are provided as-is for student convenience. Always verify official information through the University of Toronto's official registrar and administrative websites.
