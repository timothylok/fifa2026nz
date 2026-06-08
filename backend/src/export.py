import json
import os
import shutil
from datetime import datetime, timezone

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_WEB_PUBLIC = os.path.join(_ROOT, "web", "public", "data", "results.json")
_WEB_ELO_HISTORY = os.path.join(_ROOT, "web", "public", "data", "elo_history.json")


def to_json(
    win_counts: dict[str, int],
    ratings: dict[str, float],
    group_match_probs: list[dict],
    output_path: str,
    n_simulations: int,
    raw_win_pcts: dict[str, float] | None = None,
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
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "n_simulations": n_simulations,
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
