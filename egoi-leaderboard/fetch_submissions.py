"""
Fetches all submissions from the Cuttle admin panel for a specific test/contest,
then writes data.json listing which users solved which problems (full score only).

Configuration is via environment variables (set as GitHub Actions secrets):
  CUTTLE_SESSION   - value of the 'cuttle_admin' cookie
  CUTTLE_PHPSESSID - value of the 'PHPSESSID' cookie
  CUTTLE_STATUS    - value of the 'cuttle_admin_STATUS' cookie (usually "1")
  CONTEST_ID       - the numeric value from the Test dropdown in the admin panel
                     (look at the HTML option value, e.g. 33 for "Zomer 2026 Advent of Code")
"""

import os
import json
import time
import requests
from collections import defaultdict

BASE_URL = "https://informatica.cuttle.org/admin/event"

CONTEST_ID     = os.environ["CONTEST_ID"]      # e.g. "39" (the option *value* in the dropdown)
CUTTLE_SESSION = os.environ["CUTTLE_SESSION"]
PHPSESSID      = os.environ["CUTTLE_PHPSESSID"]
STATUS         = os.environ.get("CUTTLE_STATUS", "1")

COOKIES = {
    "cuttle_admin_STATUS": STATUS,
    "cuttle_admin":        CUTTLE_SESSION,
    "PHPSESSID":           PHPSESSID,
}

HEADERS = {
    "Accept":           "text/javascript, application/javascript, */*; q=0.01",
    "Content-Type":     "application/x-www-form-urlencoded; charset=UTF-8",
    "X-Requested-With": "XMLHttpRequest",
    "Origin":           "https://informatica.cuttle.org",
    "Referer":          "https://informatica.cuttle.org/admin/",
}

PAGE_SIZE = 40  # matches the default page size we observed


def fetch_page(page: int) -> dict:
    """
    The admin panel sends a POST with a widget-path payload.
    We replicate the exact fields the browser sends for the submissions list.
    The 'page' field in the paginator path controls which page we get.
    """
    data = {
        # Section / widget identifiers (from the HTML source)
        "submenu_detail":                               "",
        # Filter: select the contest by its numeric ID
        "submenu_detail.d2f4881d64f0f22869beb47a5d5d234c": CONTEST_ID,
        # Filter: submission status = Full score (value 10 in the dropdown)
        "submenu_detail.8ddfce6070740ee2b1a33682637d318b": "10",
        # Paginator: which page to fetch (1-indexed)
        "submenu_detail.84ef0331d87c3a378d1f919c0c4752c6.page": str(page),
        # Keep all other filters at "All" (value 1 = unfiltered)
        "submenu_detail.921de33d93967fc1b79329b1b0d07a28": "1",  # user type
        "submenu_detail.2441ac359bc12a10e13a0b04f2d3c952": "1",  # official
        "submenu_detail.ce7f695bcbcb2f7bee5ee2018fc1f0ce": "1",  # suspicious
        "submenu_detail.7eb067c35372b63b3b206696eafb9609": "1",  # compiler
        # Action that was triggered
        "action":    "submenu_detail.7f9a76124348b6f9b224a244f6ec5216",
        "actionData": "",
    }

    resp = requests.post(BASE_URL, headers=HEADERS, cookies=COOKIES, data=data, timeout=20)
    resp.raise_for_status()

    # The response is a JS snippet, not JSON. We need to parse the HTML table
    # embedded in the Framework.loadPage() call.
    return resp.text


def parse_rows(js_text: str) -> tuple[list[dict], int]:
    """
    Extract rows from the JS response. Each row contains:
      - username (or "Preview" / blank for anonymous)
      - problem name
      - status (we only care about "Full score" but we filter server-side)
      - date created

    Also extracts totalItems from the paginator info call.
    """
    from html.parser import HTMLParser

    # Pull out the HTML string embedded in Framework.loadPage(...)
    start = js_text.find('"submenu_detail"')
    # The HTML is the second argument to loadPage, a big quoted string
    html_start = js_text.find(', "', start) + 3
    # Find the closing `");` — but the string uses escaped quotes
    # Easier: extract via known table markers
    table_start = js_text.find("<table ")
    table_end   = js_text.find("</table>") + len("</table>")
    if table_start == -1:
        return [], 0

    table_html = js_text[table_start:table_end]
    # Unescape the JS-encoded HTML (backslash-escaped quotes, \/, etc.)
    table_html = table_html.replace('\\"', '"').replace("\\/", "/").replace("\\n", "\n")

    # Also extract totalItems from the paginator setInfo call
    total_items = 0
    ti_marker = "totalItems:"
    ti_pos = js_text.find(ti_marker)
    if ti_pos != -1:
        ti_val = js_text[ti_pos + len(ti_marker):ti_pos + len(ti_marker) + 10].strip().split(",")[0].strip()
        try:
            total_items = int(ti_val)
        except ValueError:
            pass

    class TableParser(HTMLParser):
        def __init__(self):
            super().__init__()
            self.rows     = []
            self.cur_row  = []
            self.cur_cell = ""
            self.in_td    = False
            self.in_tbody = False
            self.depth    = 0

        def handle_starttag(self, tag, attrs):
            if tag == "tbody":
                self.in_tbody = True
            if self.in_tbody:
                if tag == "td":
                    self.in_td = True
                    self.cur_cell = ""
                    self.depth = 0
                elif tag in ("div", "span") and self.in_td:
                    self.depth += 1

        def handle_endtag(self, tag):
            if tag == "tbody":
                self.in_tbody = False
            if self.in_tbody and tag == "td":
                self.in_td = False
                self.cur_row.append(self.cur_cell.strip())
            if self.in_tbody and tag == "tr":
                if len(self.cur_row) >= 6:
                    self.rows.append(self.cur_row[:])
                self.cur_row = []

        def handle_data(self, data):
            if self.in_td:
                d = data.strip()
                if d:
                    if self.cur_cell:
                        self.cur_cell += " "
                    self.cur_cell += d

    parser = TableParser()
    parser.feed(table_html)

    rows = []
    for raw in parser.rows:
        # Column order (from the HTML): UUID/ID | Date created | Date resubmitted | User | Question | Status | Suspicious | Official
        # After our cell extraction, text content merges sub-cells so:
        #   raw[0] = ID + UUID (two text nodes merged)
        #   raw[1] = date + time
        #   raw[2] = resubmit date (often empty)
        #   raw[3] = username (blank for preview/anon)
        #   raw[4] = problem name + compiler
        #   raw[5] = status
        if len(raw) < 6:
            continue
        username    = raw[3].strip()
        problem_raw = raw[4].strip()
        status      = raw[5].strip()
        date_raw    = raw[1].strip()

        # problem_raw contains "ProblemName CompilerName" merged; split on last word
        # Compiler names start with "GNU", "Java", "Python", "PHP", etc.
        compiler_prefixes = ("GNU", "Java", "Python", "PHP", "C#", "Go ", "Haskell", "Javascript",
                             "Kotlin", "Pascal", "Perl", "Ruby", "Rust", "Visual", "Swift", "Lisp", "C11", "C23")
        problem_name = problem_raw
        for prefix in compiler_prefixes:
            idx = problem_raw.find(prefix)
            if idx != -1:
                problem_name = problem_raw[:idx].strip()
                break

        if not username or username in ("Preview", ""):
            username = "(preview/anonymous)"

        rows.append({
            "username":     username,
            "problem_name": problem_name,
            "status":       status,
            "date":         date_raw,
        })

    return rows, total_items


def fetch_all_full_score_submissions() -> list[dict]:
    """Paginate through all pages and collect full-score submissions."""
    all_rows = []
    page = 1

    while True:
        print(f"  Fetching page {page}...")
        js_text = fetch_page(page)
        rows, total_items = parse_rows(js_text)

        if not rows:
            break

        all_rows.extend(rows)
        print(f"    Got {len(rows)} rows, total so far: {len(all_rows)} / {total_items}")

        if len(all_rows) >= total_items:
            break

        page += 1
        time.sleep(0.5)  # be polite

    return all_rows


def build_leaderboard(submissions: list[dict]) -> dict:
    """
    Build a leaderboard dict:
      {
        "problems": ["Problem A", "Problem B", ...],   # sorted
        "users": {
          "alice": {"Problem A": "28-06-2026 21:56:16", "Problem B": null, ...},
          ...
        },
        "updated": "2026-06-28T22:00:00Z"
      }
    """
    from datetime import datetime, timezone

    # First solve date per (user, problem)
    first_solve: dict[tuple, str] = {}
    for row in submissions:
        if row["status"] != "Full score":
            continue
        key = (row["username"], row["problem_name"])
        existing = first_solve.get(key)
        if existing is None or row["date"] < existing:
            first_solve[key] = row["date"]

    # Collect all unique users and problems (excluding preview/anon)
    users    = sorted({u for (u, _) in first_solve if u != "(preview/anonymous)"})
    problems = sorted({p for (_, p) in first_solve})

    user_data = {}
    for user in users:
        user_data[user] = {
            prob: first_solve.get((user, prob))
            for prob in problems
        }

    return {
        "problems": problems,
        "users":    user_data,
        "updated":  datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


if __name__ == "__main__":
    print(f"Fetching full-score submissions for contest ID {CONTEST_ID}...")
    submissions = fetch_all_full_score_submissions()
    print(f"Total full-score submissions fetched: {len(submissions)}")

    leaderboard = build_leaderboard(submissions)
    print(f"Problems found: {leaderboard['problems']}")
    print(f"Users found:    {list(leaderboard['users'].keys())}")

    with open("data.json", "w", encoding="utf-8") as f:
        json.dump(leaderboard, f, ensure_ascii=False, indent=2)

    print("data.json written successfully.")
