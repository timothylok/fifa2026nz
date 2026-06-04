from __future__ import annotations

import numpy as np
from joblib import Parallel, delayed

from .elo import DEFAULT_RATING
from .poisson import lambda_from_elo, score_matrix

# Official FIFA 2026 group draw
FIFA_2026_GROUPS = {
    "A": ["Mexico", "South Africa", "Korea Republic", "Czechia"],
    "B": ["Canada", "Bosnia and Herzegovina", "Qatar", "Switzerland"],
    "C": ["Haiti", "Scotland", "Brazil", "Morocco"],
    "D": ["Australia", "Türkiye", "USA", "Paraguay"],
    "E": ["Côte d'Ivoire", "Ecuador", "Germany", "Curaçao"],
    "F": ["Netherlands", "Japan", "Sweden", "Tunisia"],
    "G": ["IR Iran", "New Zealand", "Belgium", "Egypt"],
    "H": ["Saudi Arabia", "Uruguay", "Spain", "Cabo Verde"],
    "I": ["France", "Senegal", "Iraq", "Norway"],
    "J": ["Argentina", "Algeria", "Austria", "Jordan"],
    "K": ["Portugal", "Congo DR", "Uzbekistan", "Colombia"],
    "L": ["Ghana", "Panama", "England", "Croatia"],
}

# Bracket seeding: position codes for each advancing slot
# Each group sends 1st and 2nd place into the R32 bracket.
# 8 best 3rd-place teams also advance (positions 1A..12C in official rules).
# For simulation we use a simplified seeded bracket pairing.
BRACKET_PAIRS = [
    ("1A", "2B"), ("1C", "2D"), ("1E", "2F"), ("1G", "2H"),
    ("1I", "2J"), ("1K", "2L"), ("1B", "2A"), ("1D", "2C"),
    ("1F", "2E"), ("1H", "2G"), ("1J", "2I"), ("1L", "2K"),
    # 8 third-place slots filled into remaining R32 spots
    ("3ABC", "bye1"), ("3DEF", "bye2"), ("3GHI", "bye3"), ("3JKL", "bye4"),
]


def _draw_score(lam: float, mu: float, rng: np.random.Generator) -> tuple[int, int]:
    mat = score_matrix(lam, mu)
    flat = mat.flatten()
    idx = rng.choice(len(flat), p=flat)
    x, y = divmod(idx, mat.shape[1])
    return int(x), int(y)


def simulate_match(
    team_a: str,
    team_b: str,
    ratings: dict[str, float],
    rng: np.random.Generator,
    allow_draw: bool = True,
) -> tuple[int, int]:
    r_a = ratings.get(team_a, DEFAULT_RATING)
    r_b = ratings.get(team_b, DEFAULT_RATING)
    lam, mu = lambda_from_elo(r_a, r_b)
    goals_a, goals_b = _draw_score(lam, mu, rng)
    if not allow_draw and goals_a == goals_b:
        # 50/50 extra-time / penalties coin flip
        if rng.random() < 0.5:
            goals_a += 1
        else:
            goals_b += 1
    return goals_a, goals_b


def simulate_group(
    group_teams: list[str],
    ratings: dict[str, float],
    rng: np.random.Generator,
) -> list[dict]:
    records: dict[str, dict] = {
        t: {"team": t, "pts": 0, "gd": 0, "gf": 0} for t in group_teams
    }
    for i, home in enumerate(group_teams):
        for away in group_teams[i + 1 :]:
            gh, ga = simulate_match(home, away, ratings, rng, allow_draw=True)
            records[home]["gf"] += gh
            records[away]["gf"] += ga
            records[home]["gd"] += gh - ga
            records[away]["gd"] += ga - gh
            if gh > ga:
                records[home]["pts"] += 3
            elif gh == ga:
                records[home]["pts"] += 1
                records[away]["pts"] += 1
            else:
                records[away]["pts"] += 3

    standings = sorted(
        records.values(),
        key=lambda r: (r["pts"], r["gd"], r["gf"], rng.random()),
        reverse=True,
    )
    for rank, row in enumerate(standings, 1):
        row["rank"] = rank
    return standings


def _third_place_score(row: dict) -> tuple:
    return (row["pts"], row["gd"], row["gf"])


def simulate_groups(
    ratings: dict[str, float],
    rng: np.random.Generator,
) -> dict[str, list[dict]]:
    return {
        gid: simulate_group(teams, ratings, rng)
        for gid, teams in FIFA_2026_GROUPS.items()
    }


def get_qualifiers(
    group_results: dict[str, list[dict]],
) -> tuple[dict[str, str], list[str]]:
    """Returns (slot_to_team mapping, list of all third-place teams for reference)."""
    slots: dict[str, str] = {}
    third_place: list[dict] = []
    for gid, standings in group_results.items():
        slots[f"1{gid}"] = standings[0]["team"]
        slots[f"2{gid}"] = standings[1]["team"]
        third_place.append({"group": gid, **standings[2]})

    # Best 8 third-place teams advance (sorted by pts, gd, gf)
    best_thirds = sorted(third_place, key=_third_place_score, reverse=True)[:8]
    for i, row in enumerate(best_thirds, 1):
        slots[f"3rd_{i}"] = row["team"]

    return slots, [r["team"] for r in third_place]


def _build_r32(slots: dict[str, str]) -> list[tuple[str, str]]:
    """Pair 32 qualifiers into 16 R32 matchups using simplified bracket seeding."""
    group_ids = list(FIFA_2026_GROUPS.keys())
    # 24 group qualifiers (top 2 per group)
    first_place = [slots[f"1{g}"] for g in group_ids]
    second_place = [slots[f"2{g}"] for g in group_ids]
    # 8 best third-place
    thirds = [slots[f"3rd_{i}"] for i in range(1, 9)]

    # Pair: 1st of group n vs 2nd of group n+1 (circular), then thirds vs 1sts
    pairs: list[tuple[str, str]] = []
    for i in range(12):
        pairs.append((first_place[i], second_place[(i + 1) % 12]))
    for i in range(8):
        pairs.append((first_place[i % 12], thirds[i]))

    # We now have 20 pairs — trim to 16 by keeping first 16 unique teams per side
    seen: set[str] = set()
    r32: list[tuple[str, str]] = []
    for a, b in pairs:
        if a not in seen and b not in seen:
            r32.append((a, b))
            seen.update([a, b])
        if len(r32) == 16:
            break
    return r32


def play_knockout(
    teams: list[tuple[str, str]],
    ratings: dict[str, float],
    rng: np.random.Generator,
) -> str:
    """Single-elimination: list of (team_a, team_b) pairs → winner of tournament."""
    while len(teams) > 1:
        next_round: list[tuple[str, str]] = []
        for a, b in teams:
            ga, gb = simulate_match(a, b, ratings, rng, allow_draw=False)
            winner = a if ga > gb else b
            next_round.append((winner, winner))  # placeholder pairing
        # Re-pair winners sequentially
        winners = [pair[0] for pair in next_round]
        teams = [(winners[i], winners[i + 1]) for i in range(0, len(winners) - 1, 2)]
        if len(winners) % 2 == 1:
            # bye — last team advances automatically
            teams.append((winners[-1], winners[-1]))
    return teams[0][0] if teams else ""


def simulate_tournament(
    ratings: dict[str, float],
    rng: np.random.Generator,
) -> str:
    group_results = simulate_groups(ratings, rng)
    slots, _ = get_qualifiers(group_results)
    r32 = _build_r32(slots)
    return play_knockout(r32, ratings, rng)


def _batch(ratings: dict[str, float], n: int, seed: int) -> dict[str, int]:
    rng = np.random.default_rng(seed)
    counts: dict[str, int] = {}
    for _ in range(n):
        winner = simulate_tournament(ratings, rng)
        counts[winner] = counts.get(winner, 0) + 1
    return counts


def run_simulations(
    ratings: dict[str, float],
    n: int = 10_000,
    n_jobs: int = -1,
) -> dict[str, int]:
    n_cpu = __import__("os").cpu_count() or 4
    workers = n_cpu if n_jobs == -1 else max(1, n_jobs)
    batch_size = max(1, n // workers)
    batches = [batch_size] * workers
    batches[-1] += n - sum(batches)  # absorb remainder

    results = Parallel(n_jobs=workers)(
        delayed(_batch)(ratings, b, seed=i * 999983)
        for i, b in enumerate(batches)
    )

    totals: dict[str, int] = {}
    for partial in results:
        for team, count in partial.items():
            totals[team] = totals.get(team, 0) + count
    return totals
