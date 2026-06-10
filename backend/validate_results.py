"""Validation gate for results.json.

Runs in update.yml right after the simulation step. Exits 1 with a list of
problems if the output is malformed, which fails the workflow before the
commit step — so the site keeps serving the last known-good data.

Usage: python validate_results.py ../public/data/results.json
"""

import argparse
import json
import math
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from src.simulate import FIFA_2026_GROUPS

WC_TEAMS = {team for teams in FIFA_2026_GROUPS.values() for team in teams}
N_GROUP_MATCHES = sum(len(t) * (len(t) - 1) // 2 for t in FIFA_2026_GROUPS.values())

MIN_BYTES = 10_000
MAX_BYTES = 5_000_000


def validate(path: str) -> list[str]:
    errors: list[str] = []
    p = Path(path)

    if not p.exists():
        return [f"file not found: {path}"]
    size = p.stat().st_size
    if not (MIN_BYTES <= size <= MAX_BYTES):
        errors.append(f"file size {size} bytes outside sane range [{MIN_BYTES}, {MAX_BYTES}]")

    try:
        data = json.loads(p.read_text(encoding="utf-8-sig"))
    except Exception as exc:
        return errors + [f"invalid JSON: {exc}"]

    try:
        datetime.fromisoformat(data.get("generated_at", ""))
    except ValueError:
        errors.append(f"generated_at missing or not ISO format: {data.get('generated_at')!r}")

    if not isinstance(data.get("n_simulations"), int) or data.get("n_simulations", 0) < 1000:
        errors.append(f"n_simulations missing or < 1000: {data.get('n_simulations')!r}")

    teams = data.get("teams", [])
    names = {t.get("name") for t in teams}
    missing = WC_TEAMS - names
    if missing:
        errors.append(f"missing {len(missing)} WC teams: {sorted(missing)}")

    for key in ("win_pct", "raw_win_pct"):
        vals = [t.get(key) for t in teams]
        if any(v is None or not math.isfinite(v) or not (0 <= v <= 100) for v in vals):
            errors.append(f"{key} contains missing/non-finite/out-of-range values")
        else:
            total = sum(vals)
            if not (98.0 <= total <= 102.0):
                errors.append(f"{key} sums to {total:.2f}, expected ~100")

    gmp = data.get("group_match_probs", [])
    if len(gmp) != N_GROUP_MATCHES:
        errors.append(f"group_match_probs has {len(gmp)} rows, expected {N_GROUP_MATCHES}")
    for row in gmp:
        probs = [row.get("home_win"), row.get("draw"), row.get("away_win")]
        if any(v is None or not math.isfinite(v) for v in probs) or not (0.98 <= sum(probs) <= 1.02):
            errors.append(f"bad match probs for {row.get('home')} vs {row.get('away')}: {probs}")
            break  # one example is enough to fail the gate

    return errors


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate results.json before commit")
    parser.add_argument("path", nargs="?", default="../public/data/results.json")
    args = parser.parse_args()

    errors = validate(args.path)
    if errors:
        print(f"VALIDATION FAILED for {args.path}:")
        for e in errors:
            print(f"  - {e}")
        sys.exit(1)
    print(f"Validation passed: {args.path}")


if __name__ == "__main__":
    main()
