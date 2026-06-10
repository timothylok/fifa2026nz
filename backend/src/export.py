import json
import os
import shutil
from datetime import datetime, timezone

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_WEB_PUBLIC = os.path.join(_ROOT, "web", "public", "data", "results.json")
_WEB_ELO_HISTORY = os.path.join(_ROOT, "web", "public", "data", "elo_history.json")
_WEB_PROB_HISTORY = os.path.join(_ROOT, "web", "public", "data", "prob_history.json")


def to_json(
    win_counts: dict[str, int],
    ratings: dict[str, float],
    group_match_probs: list[dict],
    output_path: str,
    n_simulations: int,
    raw_win_pcts: dict[str, float] | None = None,
    state=None,
) -> None:
    total = sum(win_counts.values())
    teams = sorted(
        [
            {
                "name": team,
                "win_pct": round(100.0 * win_counts.get(team, 0) / total, 2),
                "raw_win_pct": round(raw_win_pcts[team], 2) if raw_win_pcts else round(100.0 * win_counts.get(team, 0) / total, 2),
                "elo": round(ratings.get(team, 1500.0), 1),
            }
            for team in ratings
        ],
        key=lambda t: t["win_pct"],
        reverse=True,
    )
    # Live-tournament fields (Fable5 P2) — empty/None when not running --live
    # so the frontend sees a stable schema either way.
    completed: list[dict] = []
    eliminated: list[str] = []
    if state is not None:
        for gid, ms in state.group_matches.items():
            for m in ms:
                completed.append(
                    {"stage": "group", "group": gid, "date": m.date, "home": m.home,
                     "away": m.away, "home_goals": m.home_goals, "away_goals": m.away_goals}
                )
        for r in state.ko_results:
            completed.append(
                {"stage": r["round"], "date": r["date"], "home": r["home"], "away": r["away"],
                 "home_goals": r["home_goals"], "away_goals": r["away_goals"], "winner": r["winner"]}
            )
        completed.sort(key=lambda c: c["date"])
        eliminated = sorted(state.eliminated)

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "n_simulations": n_simulations,
        "as_of": completed[-1]["date"] if completed else None,
        "completed_matches": completed,
        "eliminated": eliminated,
        "teams": teams,
        "group_match_probs": group_match_probs,
    }
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)

    # Mirror to web/public/data/ for local dev — skipped in CI where the dir doesn't exist
    web_dir = os.path.dirname(_WEB_PUBLIC)
    if (
        os.path.dirname(os.path.abspath(_WEB_PUBLIC)) != os.path.dirname(os.path.abspath(output_path))
        and os.path.isdir(web_dir)
    ):
        shutil.copy2(output_path, _WEB_PUBLIC)


def append_prob_history(
    win_pcts: dict[str, float],
    results_output_path: str,
    run_date: str | None = None,
    top_n: int = 20,
) -> None:
    """Append today's win_pct snapshot (top teams, 1dp) to prob_history.json
    next to results.json. One entry per day: a same-date re-run replaces that
    day's entry. A corrupted history file is left untouched (snapshot skipped)
    so it stays recoverable — history cannot be backfilled."""
    history_path = os.path.join(
        os.path.dirname(os.path.abspath(results_output_path)), "prob_history.json"
    )
    date = run_date or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    top = sorted(win_pcts.items(), key=lambda kv: kv[1], reverse=True)[:top_n]
    entry = {"date": date, "probs": {team: round(pct, 1) for team, pct in top}}

    history: list = []
    if os.path.exists(history_path):
        try:
            with open(history_path, encoding="utf-8") as f:
                history = json.load(f)
            if not isinstance(history, list):
                raise ValueError("prob_history.json root is not a list")
        except (ValueError, OSError) as exc:
            print(
                f"  WARNING: could not read {history_path} ({exc}) — "
                "file left untouched, snapshot skipped."
            )
            return

    history = [e for e in history if e.get("date") != date]
    history.append(entry)
    with open(history_path, "w", encoding="utf-8") as f:
        json.dump(history, f, separators=(",", ":"))

    web_dir = os.path.dirname(_WEB_PROB_HISTORY)
    if (
        os.path.dirname(os.path.abspath(_WEB_PROB_HISTORY)) != os.path.dirname(os.path.abspath(history_path))
        and os.path.isdir(web_dir)
    ):
        shutil.copy2(history_path, _WEB_PROB_HISTORY)


def write_elo_history(history: dict, output_path: str) -> None:
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(history, f, separators=(",", ":"))

    web_dir = os.path.dirname(_WEB_ELO_HISTORY)
    if (
        os.path.dirname(os.path.abspath(_WEB_ELO_HISTORY)) != os.path.dirname(os.path.abspath(output_path))
        and os.path.isdir(web_dir)
    ):
        shutil.copy2(output_path, _WEB_ELO_HISTORY)
