#!/usr/bin/env python3
"""
Phase 3 data pipeline: fetch international football results from the
martj42/international_results public dataset and merge with our CSV.

Usage:
    python fetch_data.py                  # update data/historical_matches.csv
    python fetch_data.py --dry-run        # preview row counts, no file write
"""

import argparse
import io
import sys
from pathlib import Path

import pandas as pd
import requests

SOURCE_URL = (
    "https://raw.githubusercontent.com/martj42/international_results"
    "/master/results.csv"
)
SHOOTOUTS_URL = (
    "https://raw.githubusercontent.com/martj42/international_results"
    "/master/shootouts.csv"
)
DATA_PATH = Path("data/historical_matches.csv")
SHOOTOUTS_PATH = Path("data/shootouts.csv")
MIN_DATE = "2018-01-01"  # two full World Cup cycles
WC_START_DATE = "2026-06-11"  # shootouts only matter for the WC knockout tracker

# martj42 naming → our naming (must match FIFA_2026_GROUPS in simulate.py)
# shootouts.csv uses some legacy names ("Czech Republic") that results.csv doesn't
TEAM_NAME_MAP = {
    "South Korea": "Korea Republic",
    "Turkey": "Türkiye",
    "United States": "USA",
    "Ivory Coast": "Côte d'Ivoire",
    "Iran": "IR Iran",
    "Cape Verde": "Cabo Verde",
    "DR Congo": "Congo DR",
    "Czech Republic": "Czechia",
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


def fetch_remote() -> pd.DataFrame:
    print(f"Fetching {SOURCE_URL} ...")
    resp = requests.get(SOURCE_URL, timeout=60)
    resp.raise_for_status()
    return pd.read_csv(io.StringIO(resp.text))


def transform(df: pd.DataFrame) -> pd.DataFrame:
    df = df.rename(columns={"home_score": "home_goals", "away_score": "away_goals"})
    df["home_team"] = df["home_team"].replace(TEAM_NAME_MAP)
    df["away_team"] = df["away_team"].replace(TEAM_NAME_MAP)
    df["date"] = pd.to_datetime(df["date"])
    df = df[df["date"] >= MIN_DATE].copy()
    mask = df["home_team"].isin(FIFA_2026_TEAMS) | df["away_team"].isin(FIFA_2026_TEAMS)
    df = df[mask].dropna(subset=["home_goals", "away_goals"])
    df["home_goals"] = df["home_goals"].astype(int)
    df["away_goals"] = df["away_goals"].astype(int)
    df = df[["date", "home_team", "away_team", "home_goals", "away_goals", "tournament"]].copy()
    df["date"] = df["date"].dt.strftime("%Y-%m-%d")
    return df.sort_values("date").reset_index(drop=True)


def transform_shootouts(df: pd.DataFrame) -> pd.DataFrame:
    """WC 2026 shootout rows with our team naming: date, home_team, away_team, winner."""
    for col in ("home_team", "away_team", "winner"):
        df[col] = df[col].replace(TEAM_NAME_MAP)
    df["date"] = pd.to_datetime(df["date"])
    df = df[df["date"] >= WC_START_DATE].copy()
    df["date"] = df["date"].dt.strftime("%Y-%m-%d")
    return df[["date", "home_team", "away_team", "winner"]].sort_values("date").reset_index(drop=True)


def update_shootouts(dry_run: bool) -> None:
    """Fetch shootouts.csv (fail-soft: keep/create existing file on error)."""
    try:
        resp = requests.get(SHOOTOUTS_URL, timeout=60)
        resp.raise_for_status()
        shootouts = transform_shootouts(pd.read_csv(io.StringIO(resp.text)))
    except Exception as exc:
        print(f"WARNING: shootouts fetch failed ({exc}) — keeping existing file.", file=sys.stderr)
        if not dry_run and not SHOOTOUTS_PATH.exists():
            SHOOTOUTS_PATH.parent.mkdir(exist_ok=True)
            SHOOTOUTS_PATH.write_text("date,home_team,away_team,winner\n", encoding="utf-8")
        return
    print(f"  WC 2026 shootout rows: {len(shootouts)}")
    if not dry_run:
        SHOOTOUTS_PATH.parent.mkdir(exist_ok=True)
        shootouts.to_csv(SHOOTOUTS_PATH, index=False)
        print(f"  Saved -> {SHOOTOUTS_PATH}")


def merge_with_existing(new_df: pd.DataFrame, path: Path) -> pd.DataFrame:
    """Prefer remote data; keep existing rows not present in remote (manual additions)."""
    if not path.exists():
        return new_df
    existing = pd.read_csv(path, dtype=str)
    new_keys = set(zip(new_df["date"], new_df["home_team"], new_df["away_team"]))
    manual_only = existing[
        ~existing.apply(
            lambda r: (r["date"], r["home_team"], r["away_team"]) in new_keys, axis=1
        )
    ]
    if not manual_only.empty:
        print(f"  Preserving {len(manual_only)} manually-added rows not in remote data.")
        manual_only = manual_only[
            ["date", "home_team", "away_team", "home_goals", "away_goals", "tournament"]
        ].copy()
        manual_only["home_goals"] = manual_only["home_goals"].astype(int)
        manual_only["away_goals"] = manual_only["away_goals"].astype(int)
        return (
            pd.concat([new_df, manual_only], ignore_index=True)
            .sort_values("date")
            .reset_index(drop=True)
        )
    return new_df


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Print stats, skip file write")
    args = parser.parse_args()

    try:
        remote = fetch_remote()
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)

    print(f"  Downloaded {len(remote):,} raw rows.")
    transformed = transform(remote)
    print(f"  Filtered to {len(transformed):,} rows (FIFA 2026 teams, {MIN_DATE}+).")
    merged = merge_with_existing(transformed, DATA_PATH)

    teams_covered = set(merged["home_team"]) | set(merged["away_team"])
    wc_covered = FIFA_2026_TEAMS & teams_covered
    missing = FIFA_2026_TEAMS - teams_covered
    print(f"  Total rows: {len(merged):,} | FIFA 2026 teams covered: {len(wc_covered)}/48")
    if missing:
        print(f"  Teams with NO data: {', '.join(sorted(missing))}")

    if args.dry_run:
        print("Dry run — no file written.")
    else:
        DATA_PATH.parent.mkdir(exist_ok=True)
        merged.to_csv(DATA_PATH, index=False)
        print(f"  Saved -> {DATA_PATH}")

    update_shootouts(args.dry_run)


if __name__ == "__main__":
    main()
