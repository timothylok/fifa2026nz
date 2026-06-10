"""Tournament state engine (Fable5 Phase 1).

Builds the real FIFA 2026 tournament state from played matches in
historical_matches.csv: result extraction, FIFA-tiebreak group standings,
third-place selection, and knockout tracking. 100% deterministic — no AI,
no new dependencies.
"""

from __future__ import annotations

import csv
import logging
from dataclasses import dataclass, field

from .simulate import FIFA_2026_GROUPS, _build_r32

logger = logging.getLogger(__name__)

# martj42 label for WC 2026 rows — confirm the exact string on the first
# real data day (flagged in Fable5.html risks).
WC_TOURNAMENT_LABEL = "FIFA World Cup"
WC_START_DATE = "2026-06-11"

ALL_TEAMS = frozenset(t for teams in FIFA_2026_GROUPS.values() for t in teams)

# Unordered team pair -> group id, for every group-stage fixture.
_PAIR_TO_GROUP: dict[frozenset, str] = {
    frozenset((a, b)): gid
    for gid, teams in FIFA_2026_GROUPS.items()
    for i, a in enumerate(teams)
    for b in teams[i + 1 :]
}

_ROUND_SIZES = [("R32", 16), ("R16", 8), ("QF", 4), ("SF", 2), ("F", 1)]


@dataclass(frozen=True)
class PlayedMatch:
    date: str
    home: str
    away: str
    home_goals: int
    away_goals: int


@dataclass
class TournamentState:
    group_matches: dict[str, list[PlayedMatch]]
    ko_matches: list[PlayedMatch]
    standings: dict[str, list[dict]]
    groups_complete: bool
    slots: dict[str, str] = field(default_factory=dict)
    third_by_group: dict[str, str] = field(default_factory=dict)
    r32_pairs: list[tuple[str, str]] = field(default_factory=list)
    ko_results: list[dict] = field(default_factory=list)
    alive: set[str] = field(default_factory=lambda: set(ALL_TEAMS))
    eliminated: set[str] = field(default_factory=set)


def load_played_matches(
    csv_path,
    start_date: str = WC_START_DATE,
    label: str = WC_TOURNAMENT_LABEL,
) -> list[PlayedMatch]:
    """WC 2026 rows from historical_matches.csv, sorted by date."""
    matches: list[PlayedMatch] = []
    with open(csv_path, newline="", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            if row["tournament"] != label or row["date"] < start_date:
                continue
            home, away = row["home_team"], row["away_team"]
            if home not in ALL_TEAMS or away not in ALL_TEAMS:
                logger.warning("WC row with unknown team skipped: %s vs %s", home, away)
                continue
            matches.append(
                PlayedMatch(row["date"], home, away, int(row["home_goals"]), int(row["away_goals"]))
            )
    matches.sort(key=lambda m: m.date)
    return matches


def extract_results(
    matches: list[PlayedMatch],
) -> tuple[dict[str, list[PlayedMatch]], list[PlayedMatch]]:
    """Split WC matches into (group_matches by group id, knockout matches).

    A match is a group match if its unordered team pair is a group fixture
    not yet seen; a second meeting of the same pair is a knockout match.
    """
    group_matches: dict[str, list[PlayedMatch]] = {gid: [] for gid in FIFA_2026_GROUPS}
    ko_matches: list[PlayedMatch] = []
    seen_pairs: set[frozenset] = set()
    for m in matches:
        pair = frozenset((m.home, m.away))
        gid = _PAIR_TO_GROUP.get(pair)
        if gid is not None and pair not in seen_pairs:
            seen_pairs.add(pair)
            group_matches[gid].append(m)
        else:
            ko_matches.append(m)
    return group_matches, ko_matches


def _apply_result(row: dict, gf: int, ga: int) -> None:
    row["played"] += 1
    row["gf"] += gf
    row["ga"] += ga
    row["gd"] += gf - ga
    if gf > ga:
        row["pts"] += 3
    elif gf == ga:
        row["pts"] += 1


def _break_tie_h2h(
    cluster: list[dict], matches: list[PlayedMatch], gid: str, complete: bool
) -> list[dict]:
    """Order teams tied on (pts, gd, gf) by head-to-head mini-table among them."""
    tied = {r["team"] for r in cluster}
    mini = {t: {"team": t, "played": 0, "pts": 0, "gf": 0, "ga": 0, "gd": 0} for t in tied}
    for m in matches:
        if m.home in tied and m.away in tied:
            _apply_result(mini[m.home], m.home_goals, m.away_goals)
            _apply_result(mini[m.away], m.away_goals, m.home_goals)

    def h2h_key(r: dict) -> tuple:
        s = mini[r["team"]]
        return (-s["pts"], -s["gd"], -s["gf"], r["team"])

    ordered = sorted(cluster, key=h2h_key)
    # Only warn when the group is complete — provisional ties (e.g. 0 pts
    # before kickoff) are expected and would spam every pipeline run.
    for a, b in zip(ordered, ordered[1:]) if complete else []:
        sa, sb = mini[a["team"]], mini[b["team"]]
        if (sa["pts"], sa["gd"], sa["gf"]) == (sb["pts"], sb["gd"], sb["gf"]):
            logger.warning(
                "Group %s: %s and %s still tied after head-to-head; "
                "fair play skipped, falling back to alphabetical order",
                gid, a["team"], b["team"],
            )
    return ordered


def _rank_group(
    rows: list[dict], matches: list[PlayedMatch], gid: str, complete: bool
) -> list[dict]:
    """FIFA tiebreaks: pts -> gd -> gf -> head-to-head -> alphabetical (logged)."""
    rows.sort(key=lambda r: (-r["pts"], -r["gd"], -r["gf"], r["team"]))
    ranked: list[dict] = []
    i = 0
    while i < len(rows):
        key = (rows[i]["pts"], rows[i]["gd"], rows[i]["gf"])
        j = i
        while j < len(rows) and (rows[j]["pts"], rows[j]["gd"], rows[j]["gf"]) == key:
            j += 1
        cluster = rows[i:j]
        if len(cluster) > 1:
            cluster = _break_tie_h2h(cluster, matches, gid, complete)
        ranked.extend(cluster)
        i = j
    for rank, row in enumerate(ranked, 1):
        row["rank"] = rank
    return ranked


def compute_standings(group_matches: dict[str, list[PlayedMatch]]) -> dict[str, list[dict]]:
    """Ranked standings per group from played matches (partial groups fine)."""
    standings: dict[str, list[dict]] = {}
    for gid, teams in FIFA_2026_GROUPS.items():
        rows = {
            t: {"team": t, "played": 0, "pts": 0, "gf": 0, "ga": 0, "gd": 0} for t in teams
        }
        played = group_matches.get(gid, [])
        for m in played:
            _apply_result(rows[m.home], m.home_goals, m.away_goals)
            _apply_result(rows[m.away], m.away_goals, m.home_goals)
        standings[gid] = _rank_group(list(rows.values()), played, gid, complete=len(played) == 6)
    return standings


def _select_thirds(standings: dict[str, list[dict]]) -> dict[str, str]:
    """Rank the 12 third-placed teams, return the best 8 as {group: team}."""
    thirds = [{"group": gid, **ranked[2]} for gid, ranked in standings.items()]
    thirds.sort(key=lambda r: (-r["pts"], -r["gd"], -r["gf"], r["team"]))
    cut, first_out = thirds[7], thirds[8]
    if (cut["pts"], cut["gd"], cut["gf"]) == (first_out["pts"], first_out["gd"], first_out["gf"]):
        logger.warning(
            "Third-place cutoff tie between %s and %s; "
            "fair play skipped, alphabetical order decided qualification",
            cut["team"], first_out["team"],
        )
    return {r["group"]: r["team"] for r in thirds[:8]}


def _track_knockouts(
    ko_matches: list[PlayedMatch],
    qualified: set[str],
    r32_pairs: list[tuple[str, str]],
) -> tuple[list[dict], set[str], set[str]]:
    """Advance winners / eliminate losers round by round.

    Rounds are inferred from match count in chronological order (16 R32,
    8 R16, 4 QF, 2 SF, 1 F); a match between two already-eliminated teams
    is the third-place playoff. Draws (decided on penalties, which the CSV
    does not record) leave both teams alive with a logged warning.
    """
    alive = set(qualified)
    eliminated = set(ALL_TEAMS) - alive
    r32_pair_set = {frozenset(p) for p in r32_pairs}
    ko_results: list[dict] = []
    round_idx = 0
    in_round = 0
    for m in ko_matches:
        if m.home in eliminated and m.away in eliminated:
            rnd = "3RD"
        else:
            rnd = _ROUND_SIZES[round_idx][0]
            in_round += 1
            if in_round == _ROUND_SIZES[round_idx][1] and round_idx < len(_ROUND_SIZES) - 1:
                round_idx += 1
                in_round = 0
            if rnd == "R32" and frozenset((m.home, m.away)) not in r32_pair_set:
                logger.warning(
                    "R32 match %s vs %s not in computed bracket "
                    "(FIFA third-place slotting may differ from ours)",
                    m.home, m.away,
                )
        if m.home_goals > m.away_goals:
            winner = m.home
        elif m.away_goals > m.home_goals:
            winner = m.away
        else:
            winner = None
            logger.warning(
                "Knockout draw %s %d-%d %s: winner decided on penalties, "
                "not in CSV — neither team marked eliminated",
                m.home, m.home_goals, m.away_goals, m.away,
            )
        if winner is not None and rnd != "3RD":
            loser = m.away if winner == m.home else m.home
            alive.discard(loser)
            eliminated.add(loser)
        ko_results.append(
            {
                "round": rnd,
                "date": m.date,
                "home": m.home,
                "away": m.away,
                "home_goals": m.home_goals,
                "away_goals": m.away_goals,
                "winner": winner,
            }
        )
    return ko_results, alive, eliminated


def build_state_from_matches(matches: list[PlayedMatch]) -> TournamentState:
    """Full tournament state from a chronological list of played WC matches."""
    group_matches, ko_matches = extract_results(matches)
    standings = compute_standings(group_matches)
    groups_complete = all(len(ms) == 6 for ms in group_matches.values())

    state = TournamentState(
        group_matches=group_matches,
        ko_matches=ko_matches,
        standings=standings,
        groups_complete=groups_complete,
    )
    if not groups_complete:
        if ko_matches:
            logger.warning(
                "%d knockout-classified match(es) before group stage complete — "
                "possible duplicate or bad data; knockout tracking skipped",
                len(ko_matches),
            )
        return state

    for gid, ranked in standings.items():
        state.slots[f"1{gid}"] = ranked[0]["team"]
        state.slots[f"2{gid}"] = ranked[1]["team"]
    state.third_by_group = _select_thirds(standings)
    state.r32_pairs = _build_r32(state.slots, state.third_by_group)

    qualified = {t for pair in state.r32_pairs for t in pair}
    state.ko_results, state.alive, state.eliminated = _track_knockouts(
        ko_matches, qualified, state.r32_pairs
    )
    return state


def build_state(csv_path) -> TournamentState:
    """Tournament state from historical_matches.csv (empty state if no WC rows)."""
    return build_state_from_matches(load_played_matches(csv_path))
