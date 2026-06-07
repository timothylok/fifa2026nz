from __future__ import annotations

import numpy as np
from joblib import Parallel, delayed

from .elo import DEFAULT_RATING
from .poisson import RHO, lambda_from_elo, score_matrix

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

# Official FIFA 2026 R32 bracket — 8 fixed matches (no third-place teams involved).
# Source: FIFA 2026 Competition Regulations match schedule (matches 73-88).
_R32_FIXED = [
    ("2A", "2B"), ("1F", "2C"), ("1C", "2F"), ("2E", "2I"),
    ("2K", "2L"), ("1H", "2J"), ("1J", "2H"), ("2D", "2G"),
]

# 8 slots where group winners play third-place teams.
# Each frozenset lists the eligible groups a qualifying third can come from
# (ensures no same-group R32 rematch). Source: FIFA Annex C eligibility grid.
_THIRD_SLOT_ELIGIBILITY: dict[str, frozenset] = {
    "1E": frozenset("ABCDF"),
    "1I": frozenset("CDFGH"),
    "1A": frozenset("CEFHI"),
    "1L": frozenset("EHIJK"),
    "1D": frozenset("BEFIJ"),
    "1G": frozenset("AEHIJ"),
    "1B": frozenset("EFGIJ"),
    "1K": frozenset("DEIJL"),
}

# Host nations receive a home-advantage Elo boost (tournament played in North America).
HOST_NATIONS = {"USA", "Canada", "Mexico"}
HOME_ELO_BOOST = 75


def _draw_score(lam: float, mu: float, rng: np.random.Generator, rho: float = RHO) -> tuple[int, int]:
    mat = score_matrix(lam, mu, rho=rho)
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
    rho: float = RHO,
) -> tuple[int, int]:
    r_a = ratings.get(team_a, DEFAULT_RATING)
    r_b = ratings.get(team_b, DEFAULT_RATING)
    a_host = team_a in HOST_NATIONS
    b_host = team_b in HOST_NATIONS
    if a_host and not b_host:
        r_a += HOME_ELO_BOOST
    elif b_host and not a_host:
        r_b += HOME_ELO_BOOST
    lam, mu = lambda_from_elo(r_a, r_b)
    goals_a, goals_b = _draw_score(lam, mu, rng, rho=rho)
    if not allow_draw and goals_a == goals_b:
        if rng.random() < 0.5:
            goals_a += 1
        else:
            goals_b += 1
    return goals_a, goals_b


def simulate_group(
    group_teams: list[str],
    ratings: dict[str, float],
    rng: np.random.Generator,
    rho: float = RHO,
) -> list[dict]:
    records: dict[str, dict] = {
        t: {"team": t, "pts": 0, "gd": 0, "gf": 0} for t in group_teams
    }
    for i, home in enumerate(group_teams):
        for away in group_teams[i + 1 :]:
            gh, ga = simulate_match(home, away, ratings, rng, allow_draw=True, rho=rho)
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
    rho: float = RHO,
) -> dict[str, list[dict]]:
    return {
        gid: simulate_group(teams, ratings, rng, rho=rho)
        for gid, teams in FIFA_2026_GROUPS.items()
    }


def get_qualifiers(
    group_results: dict[str, list[dict]],
) -> tuple[dict[str, str], dict[str, str]]:
    """Returns (slot_to_team, third_by_group) where third_by_group maps group → team for the 8 qualifying thirds."""
    slots: dict[str, str] = {}
    third_place: list[dict] = []
    for gid, standings in group_results.items():
        slots[f"1{gid}"] = standings[0]["team"]
        slots[f"2{gid}"] = standings[1]["team"]
        third_place.append({"group": gid, **standings[2]})

    best_thirds = sorted(third_place, key=_third_place_score, reverse=True)[:8]
    third_by_group = {row["group"]: row["team"] for row in best_thirds}
    return slots, third_by_group


def _assign_thirds(qualifying_groups: set[str]) -> dict[str, str]:
    """Match 8 qualifying third-place groups to the 8 official slots via backtracking."""
    slots_order = list(_THIRD_SLOT_ELIGIBILITY.keys())
    assignment: dict[str, str] = {}
    remaining = set(qualifying_groups)

    def backtrack(idx: int) -> bool:
        if idx == len(slots_order):
            return True
        slot = slots_order[idx]
        for grp in sorted(remaining):
            if grp in _THIRD_SLOT_ELIGIBILITY[slot]:
                assignment[slot] = grp
                remaining.discard(grp)
                if backtrack(idx + 1):
                    return True
                remaining.add(grp)
                del assignment[slot]
        return False

    backtrack(0)
    return assignment


def _build_r32(slots: dict[str, str], third_by_group: dict[str, str]) -> list[tuple[str, str]]:
    """Pair 32 qualifiers into 16 R32 matchups using the official FIFA 2026 bracket."""
    pairs: list[tuple[str, str]] = [(slots[a], slots[b]) for a, b in _R32_FIXED]

    slot_to_group = _assign_thirds(set(third_by_group.keys()))
    for winner_slot, grp in slot_to_group.items():
        pairs.append((slots[winner_slot], third_by_group[grp]))

    return pairs  # exactly 16 matchups


def play_knockout(
    teams: list[tuple[str, str]],
    ratings: dict[str, float],
    rng: np.random.Generator,
    rho: float = RHO,
) -> str:
    """Single-elimination: list of (team_a, team_b) pairs → winner of tournament."""
    while len(teams) > 1:
        next_round: list[tuple[str, str]] = []
        for a, b in teams:
            ga, gb = simulate_match(a, b, ratings, rng, allow_draw=False, rho=rho)
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
    rho: float = RHO,
) -> str:
    group_results = simulate_groups(ratings, rng, rho=rho)
    slots, third_by_group = get_qualifiers(group_results)
    r32 = _build_r32(slots, third_by_group)
    return play_knockout(r32, ratings, rng, rho=rho)


def _batch(ratings: dict[str, float], n: int, seed: int, rho: float = RHO) -> dict[str, int]:
    rng = np.random.default_rng(seed)
    counts: dict[str, int] = {}
    for _ in range(n):
        winner = simulate_tournament(ratings, rng, rho=rho)
        counts[winner] = counts.get(winner, 0) + 1
    return counts


def run_simulations(
    ratings: dict[str, float],
    n: int = 10_000,
    n_jobs: int = -1,
    rho: float = RHO,
) -> dict[str, int]:
    n_cpu = __import__("os").cpu_count() or 4
    workers = n_cpu if n_jobs == -1 else max(1, n_jobs)
    batch_size = max(1, n // workers)
    batches = [batch_size] * workers
    batches[-1] += n - sum(batches)  # absorb remainder

    results = Parallel(n_jobs=workers)(
        delayed(_batch)(ratings, b, seed=i * 999983, rho=rho)
        for i, b in enumerate(batches)
    )

    totals: dict[str, int] = {}
    for partial in results:
        for team, count in partial.items():
            totals[team] = totals.get(team, 0) + count
    return totals
