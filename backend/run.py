import argparse
import json
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))

from src.elo import build_ratings
from src.export import append_prob_history, to_json, write_elo_history
from src.poisson import fit_rho, lambda_from_elo, match_probs
from src.simulate import FIFA_2026_GROUPS, run_simulations


def blend_with_market(raw_pcts: dict[str, float], output_path: str, alpha: float) -> dict[str, float]:
    """Blend raw model probabilities with Polymarket-implied probabilities.

    Returns a new dict of {team: blended_pct} summing to ~100.
    Falls back to raw_pcts unchanged if market_odds.json is missing or empty.
    """
    market_path = Path(output_path).parent / "market_odds.json"
    if not market_path.exists():
        print("  market_odds.json not found — skipping market blend.")
        return dict(raw_pcts)

    try:
        odds_data = json.loads(market_path.read_text(encoding="utf-8"))
    except Exception as exc:
        print(f"  Could not read market_odds.json: {exc} — skipping blend.")
        return dict(raw_pcts)

    # Build {team: decimal_odds} from Polymarket column only
    market_decimal: dict[str, float] = {}
    for entry in odds_data.get("teams", []):
        pm_odds = entry.get("odds", {}).get("Polymarket")
        if pm_odds and pm_odds > 0:
            market_decimal[entry["name"]] = pm_odds

    if not market_decimal:
        print("  No Polymarket entries in market_odds.json — skipping blend.")
        return dict(raw_pcts)

    # Implied prob = 1/decimal; normalize across all listed teams to remove overround
    implied = {team: 1.0 / dec for team, dec in market_decimal.items()}
    total_implied = sum(implied.values())
    mkt_pct = {team: 100.0 * imp / total_implied for team, imp in implied.items()}

    blended: dict[str, float] = {}
    for team, raw in raw_pcts.items():
        mkt = mkt_pct.get(team, 0.0)
        blended[team] = alpha * raw + (1 - alpha) * mkt

    # Renormalize to exactly 100 (floating-point safety)
    total_blended = sum(blended.values())
    if total_blended > 0:
        blended = {t: 100.0 * v / total_blended for t, v in blended.items()}

    print(f"  Market blend applied (alpha={alpha:.2f}): {len(market_decimal)} teams with Polymarket data.")
    return blended


def build_group_match_probs(ratings: dict, rho: float = -0.1) -> list[dict]:
    rows = []
    for gid, teams in FIFA_2026_GROUPS.items():
        for i, home in enumerate(teams):
            for away in teams[i + 1 :]:
                r_h = ratings.get(home, 1500.0)
                r_a = ratings.get(away, 1500.0)
                lam, mu = lambda_from_elo(r_h, r_a)
                probs = match_probs(lam, mu, rho=rho)
                rows.append(
                    {
                        "group": gid,
                        "home": home,
                        "away": away,
                        "home_win": round(probs["home_win"], 4),
                        "draw": round(probs["draw"], 4),
                        "away_win": round(probs["away_win"], 4),
                    }
                )
    return rows


def main() -> None:
    parser = argparse.ArgumentParser(description="FIFA 2026 Monte-Carlo simulator")
    parser.add_argument("--data", default="data/historical_matches.csv")
    parser.add_argument("--sims", type=int, default=10_000)
    parser.add_argument("--jobs", type=int, default=-1)
    parser.add_argument("--output", default="results/results.json")
    parser.add_argument("--alpha", type=float, default=0.4,
                        help="Model weight in market blend (0=pure market, 1=pure model). Default 0.4.")
    args = parser.parse_args()

    print(f"Loading match data from {args.data} ...")
    df = pd.read_csv(args.data)
    df["date"] = pd.to_datetime(df["date"])

    print("Building Elo ratings ...")
    ratings, elo_history = build_ratings(df)
    print(f"  {len(ratings)} teams rated. Top 5:")
    for team, elo in sorted(ratings.items(), key=lambda x: -x[1])[:5]:
        print(f"    {team}: {elo:.0f}")

    print("Fitting Dixon-Coles rho ...")
    rho = fit_rho(df, ratings)
    print(f"  rho = {rho}")

    print(f"Running {args.sims:,} simulations ...")
    win_counts = run_simulations(ratings, n=args.sims, n_jobs=args.jobs, rho=rho)

    # Raw model probabilities (before market blending)
    total_sims = sum(win_counts.values())
    raw_pcts = {team: 100.0 * win_counts.get(team, 0) / total_sims for team in ratings}

    # Market calibration: blend raw model with Polymarket-implied probs
    print("Applying market calibration ...")
    blended_pcts = blend_with_market(raw_pcts, args.output, args.alpha)

    # Rebuild win_counts from blended_pcts so export sorts correctly
    # We pass blended as win_counts (scaled to original total) and raw separately
    blended_counts = {team: int(round(pct / 100.0 * total_sims)) for team, pct in blended_pcts.items()}

    print("Computing group match probabilities ...")
    gmp = build_group_match_probs(ratings, rho=rho)

    print(f"Writing results to {args.output} ...")
    to_json(blended_counts, ratings, gmp, args.output, total_sims, raw_win_pcts=raw_pcts)

    print("Appending probability history ...")
    append_prob_history(blended_pcts, args.output)

    elo_history_path = str(Path(args.output).parent / "elo_history.json")
    print(f"Writing Elo history to {elo_history_path} ...")
    write_elo_history(elo_history, elo_history_path)

    # Print top 10 (blended)
    ranked = sorted(blended_pcts.items(), key=lambda x: -x[1])
    print("\nTop 10 championship probabilities (blended):")
    for team, pct in ranked[:10]:
        print(f"  {team:<20} {pct:.1f}%  (raw: {raw_pcts.get(team, 0):.1f}%)")

    print(f"\nDone. Results saved to {args.output}")


if __name__ == "__main__":
    main()
