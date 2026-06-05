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

[View Calendar Feeds](https://uoft.wuyilingwei.com/ics)

---

## Technical Overview

- **Frontend**: Pure HTML/CSS/JavaScript (no frameworks), hosted on Cloudflare Pages
- **Backend**: Python web scraper (Playwright + BeautifulSoup), runs daily via GitHub Actions
- **Deployment**: Static site at `docs/` directory, deployed to Cloudflare Pages
- **Updates**: Automatic calendar sync every 24 hours

---

## Disclaimer

This project is **not** affiliated with, sponsored by, or endorsed by the University of Toronto or any of its campuses, staff, or departments. All tools are provided as-is for student convenience. Always verify official information through the University of Toronto's official registrar and administrative websites.
