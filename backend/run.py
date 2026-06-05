import argparse
import json
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))

from src.elo import build_ratings
from src.export import to_json
from src.poisson import fit_rho, lambda_from_elo, match_probs
from src.simulate import FIFA_2026_GROUPS, run_simulations


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
    args = parser.parse_args()

    print(f"Loading match data from {args.data} ...")
    df = pd.read_csv(args.data)
    df["date"] = pd.to_datetime(df["date"])

    print("Building Elo ratings ...")
    ratings = build_ratings(df)
    print(f"  {len(ratings)} teams rated. Top 5:")
    for team, elo in sorted(ratings.items(), key=lambda x: -x[1])[:5]:
        print(f"    {team}: {elo:.0f}")

    print("Fitting Dixon-Coles rho ...")
    rho = fit_rho(df, ratings)
    print(f"  rho = {rho}")

    print(f"Running {args.sims:,} simulations ...")
    win_counts = run_simulations(ratings, n=args.sims, n_jobs=args.jobs, rho=rho)

    print("Computing group match probabilities ...")
    gmp = build_group_match_probs(ratings, rho=rho)

    print(f"Writing results to {args.output} ...")
    to_json(win_counts, ratings, gmp, args.output, args.sims)

    # Print top 10
    total = sum(win_counts.values())
    ranked = sorted(win_counts.items(), key=lambda x: -x[1])
    print("\nTop 10 championship probabilities:")
    for team, count in ranked[:10]:
        print(f"  {team:<20} {100*count/total:.1f}%")

    print(f"\nDone. Results saved to {args.output}")


if __name__ == "__main__":
    main()
