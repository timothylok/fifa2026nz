"""Accuracy ledger (Fable5 Phase 5).

Run after fetch_data.py and BEFORE run.py overwrites results.json:
  1. Scores newly played group matches (multiclass Brier) against the
     prediction stored before the match was played.
  2. Refreshes stored predictions for still-unplayed fixtures from the
     current results.json (the latest pre-match forecast wins).

Writes public/data/accuracy.json. Pure Python, no AI, no new dependencies.

Usage:
  python score_predictions.py --results ../public/data/results.json \
      --data data/historical_matches.csv --accuracy ../public/data/accuracy.json
  python score_predictions.py --accuracy ../public/data/accuracy.json --report
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from src.tournament_state import extract_results, load_played_matches

OUTCOMES = ("home_win", "draw", "away_win")
UNIFORM_BRIER = round((2 / 3) ** 2 + 2 * (1 / 3) ** 2, 4)  # 0.6667


def brier(probs: dict, outcome: str) -> float:
    """Multiclass Brier: sum over outcomes of (p - actual)^2."""
    return round(sum((probs[o] - (1.0 if o == outcome else 0.0)) ** 2 for o in OUTCOMES), 4)


def _empty_ledger() -> dict:
    return {"predictions": {}, "scored": [], "summary": {}}


def load_ledger(path: Path) -> dict | None:
    """Existing ledger, a fresh one if absent, or None if corrupted.

    A corrupted ledger is left untouched (scored history can't be
    regenerated) — caller should warn and exit without writing.
    """
    if not path.exists():
        return _empty_ledger()
    try:
        ledger = json.loads(path.read_text(encoding="utf-8-sig"))
        if not isinstance(ledger.get("predictions"), dict) or not isinstance(
            ledger.get("scored"), list
        ):
            return None
        return ledger
    except Exception:
        return None


def score_new_matches(ledger: dict, group_matches: dict) -> int:
    """Score played group matches with a stored pre-match prediction."""
    scored_pairs = {frozenset((r["home"], r["away"])) for r in ledger["scored"]}
    n_new = 0
    for matches in group_matches.values():
        for m in matches:
            if frozenset((m.home, m.away)) in scored_pairs:
                continue
            pred, key = _find_prediction(ledger["predictions"], m.home, m.away)
            if key is None:
                print(f"  No stored prediction for {m.home} vs {m.away} — not scored.")
                continue
            # Orient the real result to the prediction's home/away
            if pred["home"] == m.home:
                hg, ag = m.home_goals, m.away_goals
            else:
                hg, ag = m.away_goals, m.home_goals
            outcome = "home_win" if hg > ag else ("away_win" if ag > hg else "draw")
            probs = {o: pred[o] for o in OUTCOMES}
            ledger["scored"].append(
                {
                    "key": key,
                    "group": pred["group"],
                    "home": pred["home"],
                    "away": pred["away"],
                    "date": m.date,
                    "home_goals": hg,
                    "away_goals": ag,
                    "outcome": outcome,
                    **probs,
                    "brier": brier(probs, outcome),
                    "predicted_at": pred["as_of"],
                }
            )
            del ledger["predictions"][key]
            n_new += 1
    ledger["scored"].sort(key=lambda r: (r["date"], r["key"]))
    return n_new


def _pair_keys(team_a: str, team_b: str) -> tuple[str, str]:
    return f"{team_a}|{team_b}", f"{team_b}|{team_a}"


def _find_prediction(predictions: dict, home: str, away: str):
    """Stored prediction for an unordered team pair, or (None, None)."""
    for key in _pair_keys(home, away):
        full = [k for k in predictions if k.split("|", 1)[1] == key]
        if full:
            return predictions[full[0]], full[0]
    return None, None


def update_predictions(
    ledger: dict, group_match_probs: list[dict], generated_at: str, played_pairs: set
) -> int:
    """Store/refresh predictions for fixtures not yet played or scored."""
    n_updated = 0
    for row in group_match_probs:
        if frozenset((row["home"], row["away"])) in played_pairs:
            continue
        key = f"{row['group']}|{row['home']}|{row['away']}"
        ledger["predictions"][key] = {
            "group": row["group"],
            "home": row["home"],
            "away": row["away"],
            "home_win": row["home_win"],
            "draw": row["draw"],
            "away_win": row["away_win"],
            "as_of": generated_at,
        }
        n_updated += 1
    return n_updated


def update_summary(ledger: dict) -> None:
    scored = ledger["scored"]
    ledger["summary"] = {
        "n_scored": len(scored),
        "mean_brier": round(sum(r["brier"] for r in scored) / len(scored), 4) if scored else None,
        "baseline_uniform": UNIFORM_BRIER,
    }


def print_report(ledger: dict) -> None:
    """End-of-tournament calibration report."""
    scored = ledger["scored"]
    if not scored:
        print("No scored predictions yet.")
        return
    update_summary(ledger)
    s = ledger["summary"]
    print(f"Scored matches:    {s['n_scored']}")
    print(f"Mean Brier:        {s['mean_brier']}  (lower is better)")
    print(f"Uniform baseline:  {s['baseline_uniform']}  (1/3-1/3-1/3 every match)")
    hit = sum(1 for r in scored if max(OUTCOMES, key=lambda o: r[o]) == r["outcome"])
    print(f"Favourite won:     {hit}/{len(scored)} ({100 * hit / len(scored):.0f}%)")
    print("\nCalibration (all outcome probabilities, 5 bins):")
    print(f"  {'bin':<12} {'n':>4} {'predicted':>10} {'observed':>9}")
    for lo in (0.0, 0.2, 0.4, 0.6, 0.8):
        hi = lo + 0.2
        cell = [
            (r[o], 1.0 if r["outcome"] == o else 0.0)
            for r in scored
            for o in OUTCOMES
            if lo <= r[o] < hi or (hi == 1.0 and r[o] == 1.0)
        ]
        if cell:
            pred = sum(p for p, _ in cell) / len(cell)
            obs = sum(y for _, y in cell) / len(cell)
            print(f"  {lo:.1f}–{hi:.1f}      {len(cell):>4} {pred:>10.3f} {obs:>9.3f}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Score group-match predictions (Brier ledger)")
    parser.add_argument("--results", default="../public/data/results.json")
    parser.add_argument("--data", default="data/historical_matches.csv")
    parser.add_argument("--accuracy", default="../public/data/accuracy.json")
    parser.add_argument("--report", action="store_true",
                        help="Print calibration report from the ledger and exit.")
    args = parser.parse_args()

    accuracy_path = Path(args.accuracy)
    ledger = load_ledger(accuracy_path)
    if ledger is None:
        print(f"WARNING: {accuracy_path} is corrupted — left untouched, nothing scored.")
        return 1

    if args.report:
        print_report(ledger)
        return 0

    results = json.loads(Path(args.results).read_text(encoding="utf-8-sig"))
    group_matches, _ = extract_results(load_played_matches(args.data))
    played_pairs = {
        frozenset((m.home, m.away)) for ms in group_matches.values() for m in ms
    }

    n_scored = score_new_matches(ledger, group_matches)
    n_updated = update_predictions(
        ledger, results["group_match_probs"], results["generated_at"], played_pairs
    )
    update_summary(ledger)

    accuracy_path.write_text(
        json.dumps(ledger, indent=1, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(
        f"Accuracy ledger: {n_scored} newly scored, {n_updated} predictions refreshed, "
        f"{ledger['summary']['n_scored']} total scored "
        f"(mean Brier {ledger['summary']['mean_brier']})."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
