#!/usr/bin/env python3
"""
Fetch FIFA 2026 outright winner odds and write public/data/market_odds.json.

Sources (in order of priority):
  1. Polymarket prediction market — free, no auth, live 24/7
  2. TheOddsAPI — requires ODDS_API_KEY; outrights need a paid plan (currently 422)

Usage:
    python fetch_odds.py                  # ODDS_API_KEY env var optional
    python fetch_odds.py --dry-run        # print JSON, skip file write
    python fetch_odds.py --key <KEY>      # explicit TheOddsAPI key override
"""

import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import requests

OUTPUT_PATH = Path(__file__).resolve().parent.parent / "public" / "data" / "market_odds.json"

# ── Polymarket ────────────────────────────────────────────────────────────────
POLYMARKET_URL = "https://gamma-api.polymarket.com/events"
POLYMARKET_SLUG = "world-cup-winner"
_PM_RE = re.compile(r"Will (.+) win the 2026 FIFA World Cup\?")

# ── TheOddsAPI (future use — outrights require paid plan) ─────────────────────
ODDS_API_SPORTS_URL = "https://api.the-odds-api.com/v4/sports/?apiKey={key}"
ODDS_API_ODDS_URL = (
    "https://api.the-odds-api.com/v4/sports/{sport}/odds/"
    "?apiKey={key}&regions=eu&markets=outrights&oddsFormat=decimal"
)
_DEFAULT_SPORT_KEY = "soccer_fifa_world_cup"
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

# ── Name normalisation ────────────────────────────────────────────────────────
TEAM_NAME_MAP = {
    "South Korea":            "Korea Republic",
    "Turkey":                 "Türkiye",
    "Turkiye":                "Türkiye",   # Polymarket uses no umlaut
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


# ── Polymarket ────────────────────────────────────────────────────────────────

def fetch_polymarket() -> dict:
    """Return {canonical_team: decimal_odds} from Polymarket. No auth required."""
    try:
        resp = requests.get(POLYMARKET_URL, params={"slug": POLYMARKET_SLUG, "limit": 1}, timeout=15)
        print(f"  Polymarket: HTTP {resp.status_code}")
        if not resp.ok:
            return {}

        data = resp.json()
        if not data:
            print("  Polymarket: world-cup-winner event not found.")
            return {}

        markets = data[0].get("markets", [])
        result = {}
        for m in markets:
            match = _PM_RE.match(m.get("question", ""))
            if not match:
                continue
            team_raw = match.group(1)

            op = m.get("outcomePrices")
            if op is None:
                continue
            prices = json.loads(op) if isinstance(op, str) else op
            yes_price = float(prices[0])

            if yes_price < 0.0002:
                continue  # skip near-zero markets (no meaningful price)

            canonical = normalise(team_raw)
            if canonical is None:
                print(f"  WARN unmapped team (Polymarket): {team_raw!r}")
                continue

            result[canonical] = round(1.0 / yes_price, 2)

        print(f"  Polymarket: {len(result)} teams parsed.")
        return result

    except Exception as exc:
        print(f"  Polymarket fetch failed: {exc}")
        return {}


# ── TheOddsAPI ────────────────────────────────────────────────────────────────

def _discover_wc_sport_key(key: str) -> str | None:
    resp = requests.get(ODDS_API_SPORTS_URL.format(key=key), timeout=15)
    if not resp.ok:
        return None
    sports = resp.json()
    for sport in sports:
        sk = sport.get("key", "").lower()
        title = sport.get("title", "").lower()
        if any(w in sk or w in title for w in ("world_cup", "worldcup", "fifa", "wc2026")):
            print(f"  Found sport key: {sport['key']} — {sport.get('title', '')}")
            return sport["key"]
    soccer = [s["key"] for s in sports if "soccer" in s.get("key", "")]
    print(f"  Available soccer keys: {soccer}")
    return None


def fetch_theoddsapi(key: str) -> dict:
    """Return {canonical_team: {BookmakerName: decimal_odds}}."""
    sport = _DEFAULT_SPORT_KEY
    resp = requests.get(ODDS_API_ODDS_URL.format(sport=sport, key=key), timeout=30)
    remaining = resp.headers.get("x-requests-remaining", "?")
    used = resp.headers.get("x-requests-used", "?")
    print(f"  TheOddsAPI ({sport}): HTTP {resp.status_code} | used={used} remaining={remaining}")

    if resp.status_code in (404, 422):
        print("  Searching for correct sport key ...")
        sport = _discover_wc_sport_key(key)
        if not sport:
            print("  No World Cup sport found on TheOddsAPI.")
            return {}
        resp = requests.get(ODDS_API_ODDS_URL.format(sport=sport, key=key), timeout=30)
        remaining = resp.headers.get("x-requests-remaining", "?")
        used = resp.headers.get("x-requests-used", "?")
        print(f"  TheOddsAPI ({sport}): HTTP {resp.status_code} | used={used} remaining={remaining}")

    if not resp.ok:
        print(f"  TheOddsAPI error body: {resp.text[:400]}")
        return {}

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
                    entry[bm_name] = max(entry.get(bm_name, 0.0), float(outcome.get("price", 0.0)))

    print(f"  TheOddsAPI: {len(result)} teams parsed.")
    return result


# ── Output builder ────────────────────────────────────────────────────────────

def build_output(theoddsapi_data: dict, polymarket_data: dict) -> dict:
    active_bms = [
        THEODDSAPI_BOOKMAKER_MAP[k]
        for k in PREFERRED_BOOKMAKERS
        if any(THEODDSAPI_BOOKMAKER_MAP[k] in v for v in theoddsapi_data.values())
    ]
    if polymarket_data:
        active_bms.append("Polymarket")

    all_teams = set(theoddsapi_data) | set(polymarket_data)
    teams_list = []
    for team in all_teams:
        odds = {}
        for bm in active_bms:
            if bm == "Polymarket":
                val = polymarket_data.get(team)
            else:
                val = theoddsapi_data.get(team, {}).get(bm)
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


# ── Entry point ───────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--key", default=os.environ.get("ODDS_API_KEY", ""))
    args = parser.parse_args()

    print("Fetching Polymarket ...")
    polymarket_data = fetch_polymarket()

    theoddsapi_data = {}
    if args.key:
        print("Fetching TheOddsAPI ...")
        try:
            theoddsapi_data = fetch_theoddsapi(args.key)
        except Exception as exc:
            print(f"  TheOddsAPI error: {exc}")
    else:
        print("Skipping TheOddsAPI (no ODDS_API_KEY set).")

    if not theoddsapi_data and not polymarket_data:
        print("WARNING: all sources empty — keeping existing market_odds.json.")
        sys.exit(0)

    output = build_output(theoddsapi_data, polymarket_data)
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
