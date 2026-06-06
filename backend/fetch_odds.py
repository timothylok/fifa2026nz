#!/usr/bin/env python3
"""
Fetch FIFA 2026 outright winner odds from TheOddsAPI (primary) and HKJC (secondary),
then write public/data/market_odds.json in the schema ValueIndex.jsx expects.

Usage:
    python fetch_odds.py                  # requires ODDS_API_KEY env var
    python fetch_odds.py --dry-run        # print JSON, skip file write
    python fetch_odds.py --key <KEY>      # explicit key override
"""

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import requests

OUTPUT_PATH = Path(__file__).resolve().parent.parent / "public" / "data" / "market_odds.json"

ODDS_API_SPORTS_URL = "https://api.the-odds-api.com/v4/sports/?apiKey={key}"
ODDS_API_ODDS_URL = (
    "https://api.the-odds-api.com/v4/sports/{sport}/odds/"
    "?apiKey={key}&regions=eu&markets=outrights&oddsFormat=decimal"
)
_DEFAULT_SPORT_KEY = "soccer_fifa_world_cup"

HKJC_URL = (
    "https://bet.hkjc.com/football/getJSON.aspx"
    "?jsontype=odds_tournament&pool=CH&matchid=50000118"
)

# TheOddsAPI bookmaker key → display name (order defines preference)
THEODDSAPI_BOOKMAKER_MAP = {
    "pinnacle":    "Pinnacle",
    "bet365":      "Bet365",
    "fanduel":     "FanDuel",
    "draftkings":  "DraftKings",
    "betfair":     "Betfair",
    "williamhill": "William Hill",
    "unibet_eu":   "Unibet",
}
PREFERRED_BOOKMAKERS = ["pinnacle", "bet365", "fanduel"]

TEAM_NAME_MAP = {
    "South Korea":            "Korea Republic",
    "Turkey":                 "Türkiye",
    "United States":          "USA",
    "Ivory Coast":            "Côte d'Ivoire",
    "Iran":                   "IR Iran",
    "Cape Verde":             "Cabo Verde",
    "DR Congo":               "Congo DR",
    "Czech Republic":         "Czechia",
    "Bosnia & Herzegovina":   "Bosnia and Herzegovina",
    "Bosnia-Herzegovina":     "Bosnia and Herzegovina",
    "Curacao":                "Curaçao",
}

FIFA_2026_TEAMS = {
    "Mexico", "South Africa", "Korea Republic", "Czechia",
    "Canada", "Bosnia and Herzegovina", "Qatar", "Switzerland",
    "Haiti", "Scotland", "Brazil", "Morocco",
    "Australia", "Türkiye", "USA", "Paraguay",
    "Côte d'Ivoire", "Ecuador", "Germany", "Curaçao",
    "Netherlands", "Japan", "Sweden", "Tunisia",
    "IR Iran", "New Zealand", "Belgium", "Egypt",
    "Saudi Arabia", "Uruguay", "Spain", "Cabo Verde",
    "France", "Senegal", "Iraq", "Norway",
    "Argentina", "Algeria", "Austria", "Jordan",
    "Portugal", "Congo DR", "Uzbekistan", "Colombia",
    "Ghana", "Panama", "England", "Croatia",
}


def normalise(name: str):
    canonical = TEAM_NAME_MAP.get(name.strip(), name.strip())
    return canonical if canonical in FIFA_2026_TEAMS else None


def _discover_wc_sport_key(key: str) -> str | None:
    """Search /sports for any World Cup / FIFA key."""
    resp = requests.get(ODDS_API_SPORTS_URL.format(key=key), timeout=15)
    if not resp.ok:
        return None
    for sport in resp.json():
        sk = sport.get("key", "").lower()
        title = sport.get("title", "").lower()
        if any(w in sk or w in title for w in ("world_cup", "worldcup", "fifa", "wc2026")):
            print(f"  Found sport key: {sport['key']} — {sport.get('title', '')}")
            return sport["key"]
    # Log what soccer sports ARE available to help diagnose
    soccer = [s["key"] for s in resp.json() if "soccer" in s.get("key", "")]
    print(f"  Available soccer keys: {soccer}")
    return None


def fetch_theoddsapi(key: str) -> dict:
    """Return {canonical_team: {BookmakerName: decimal_odds}}."""
    sport = _DEFAULT_SPORT_KEY
    url = ODDS_API_ODDS_URL.format(sport=sport, key=key)
    resp = requests.get(url, timeout=30)
    remaining = resp.headers.get("x-requests-remaining", "?")
    used = resp.headers.get("x-requests-used", "?")
    print(f"  TheOddsAPI ({sport}): HTTP {resp.status_code} | used={used} remaining={remaining}")

    if resp.status_code in (404, 422):
        print("  Searching for correct sport key ...")
        sport = _discover_wc_sport_key(key)
        if not sport:
            print("  No World Cup sport found on TheOddsAPI.")
            return {}
        url = ODDS_API_ODDS_URL.format(sport=sport, key=key)
        resp = requests.get(url, timeout=30)
        remaining = resp.headers.get("x-requests-remaining", "?")
        used = resp.headers.get("x-requests-used", "?")
        print(f"  TheOddsAPI ({sport}): HTTP {resp.status_code} | used={used} remaining={remaining}")

    if not resp.ok:
        # Log body so we can see the exact error reason
        print(f"  TheOddsAPI error body: {resp.text[:400]}")
        resp.raise_for_status()

    events = resp.json()
    if not events:
        print("  TheOddsAPI: no events returned.")
        return {}

    result = {}
    for event in events:
        for bm in event.get("bookmakers", []):
            bm_key = bm.get("key", "")
            if bm_key not in PREFERRED_BOOKMAKERS:
                continue
            bm_name = THEODDSAPI_BOOKMAKER_MAP[bm_key]
            for market in bm.get("markets", []):
                if market.get("key") != "outrights":
                    continue
                for outcome in market.get("outcomes", []):
                    team_raw = outcome.get("name", "")
                    canonical = normalise(team_raw)
                    if canonical is None:
                        print(f"  WARN unmapped team (TheOddsAPI): {team_raw!r}")
                        continue
                    entry = result.setdefault(canonical, {})
                    # Keep best (highest) odds when team appears in multiple events
                    entry[bm_name] = max(entry.get(bm_name, 0.0), float(outcome.get("price", 0.0)))

    print(f"  TheOddsAPI: {len(result)} teams parsed.")
    return result


def fetch_hkjc() -> dict:
    """Return {canonical_team: decimal_odds}. Returns {} on any error.

    NOTE: The HKJC getJSON.aspx endpoint serves the SPA HTML shell to server-side
    requests (no session cookie). Kept here for future investigation; currently a no-op.
    """
    print("  HKJC: skipped — endpoint requires browser session cookie.")
    return {}


def build_output(theoddsapi_data: dict, hkjc_data: dict) -> dict:
    active_bms = [
        THEODDSAPI_BOOKMAKER_MAP[k]
        for k in PREFERRED_BOOKMAKERS
        if any(THEODDSAPI_BOOKMAKER_MAP[k] in v for v in theoddsapi_data.values())
    ]
    if hkjc_data:
        active_bms.append("HKJC")

    all_teams = set(theoddsapi_data) | set(hkjc_data)
    teams_list = []
    for team in all_teams:
        odds = {}
        for bm in active_bms:
            val = hkjc_data.get(team) if bm == "HKJC" else theoddsapi_data.get(team, {}).get(bm)
            if val is not None:
                odds[bm] = val
        if odds:
            teams_list.append({"name": team, "odds": odds})

    teams_list.sort(key=lambda e: min(e["odds"].values()))

    return {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "bookmakers": active_bms,
        "teams": teams_list,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--key", default=os.environ.get("ODDS_API_KEY", ""))
    args = parser.parse_args()

    if not args.key:
        print("ERROR: ODDS_API_KEY not set. Pass --key or set the env var.", file=sys.stderr)
        sys.exit(1)

    print("Fetching TheOddsAPI ...")
    try:
        theoddsapi_data = fetch_theoddsapi(args.key)
    except Exception as exc:
        print(f"  TheOddsAPI error: {exc}")
        theoddsapi_data = {}

    print("Fetching HKJC ...")
    hkjc_data = fetch_hkjc()

    if not theoddsapi_data and not hkjc_data:
        print("WARNING: both sources empty — keeping existing market_odds.json.")
        sys.exit(0)

    output = build_output(theoddsapi_data, hkjc_data)
    json_str = json.dumps(output, indent=2, ensure_ascii=False)

    if args.dry_run:
        print(json_str)
        print(f"\nDry run — {len(output['teams'])} teams, bookmakers: {output['bookmakers']}")
        return

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json_str, encoding="utf-8")
    print(f"Wrote {len(output['teams'])} teams → {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
