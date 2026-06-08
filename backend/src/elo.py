import math

import pandas as pd

DEFAULT_RATING = 1500.0
HALF_LIFE_YEARS = 4

_TOURNAMENT_CLASS = {
    'FIFA World Cup': 'wc', 'WC2022': 'wc', 'WC2018': 'wc',
    'UEFA Euro': 'continental', 'Copa América': 'continental',
    'African Cup of Nations': 'continental', 'AFC Asian Cup': 'continental',
    'Gold Cup': 'continental',
    'UEFA Nations League': 'nations_league', 'UEFANationsLeague': 'nations_league',
    'CONCACAF Nations League': 'nations_league',
    'EAFF Championship': 'nations_league', 'WAFF Championship': 'nations_league',
    'COSAFA Cup': 'nations_league', 'Arab Cup': 'nations_league', 'Gulf Cup': 'nations_league',
    'Friendly': 'friendlies', 'FIFA Series': 'friendlies',
    'Kirin Challenge Cup': 'friendlies', 'Kirin Cup': 'friendlies',
}

K_BY_CLASS = {
    'wc': 40,
    'continental': 30,
    'nations_league': 30,
    'qualifiers': 40,
    'friendlies': 25,
}

_SHRINKAGE_BY_CLASS = {
    'wc': 0.20,
    'continental': 0.15,
    'nations_league': 0.10,
    'qualifiers': 0.0,
    'friendlies': 0.0,
}


def _classify(tournament: str) -> str:
    t = tournament or ''
    cls = _TOURNAMENT_CLASS.get(t)
    if cls:
        return cls
    t_lower = t.lower()
    if 'qualif' in t_lower or 'q2026' in t_lower or t in ('CONCACAFQ', 'CONMEBOLQ'):
        return 'qualifiers'
    if 'friendly' in t_lower:
        return 'friendlies'
    return 'qualifiers'


def expected_score(r_a: float, r_b: float) -> float:
    return 1.0 / (1.0 + 10.0 ** ((r_b - r_a) / 400.0))


def goal_diff_multiplier(gd: int) -> float:
    gd = abs(gd)
    if gd <= 1:
        return 1.0
    if gd == 2:
        return 1.5
    if gd == 3:
        return 1.75
    return 2.0


def update_rating(
    r_a: float, r_b: float, goals_a: int, goals_b: int, k: float = K_BY_CLASS['qualifiers']
) -> tuple[float, float]:
    e_a = expected_score(r_a, r_b)
    if goals_a > goals_b:
        s_a = 1.0
    elif goals_a == goals_b:
        s_a = 0.5
    else:
        s_a = 0.0
    mult = goal_diff_multiplier(goals_a - goals_b)
    delta = k * mult * (s_a - e_a)
    return r_a + delta, r_b - delta


def build_ratings(matches_df: pd.DataFrame) -> tuple[dict[str, float], dict[str, list]]:
    ratings: dict[str, float] = {}
    history: dict[str, list] = {}
    df = matches_df.sort_values("date").reset_index(drop=True)
    dates = pd.to_datetime(df["date"])
    ref_date = dates.max()
    for (_, row), match_date in zip(df.iterrows(), dates):
        delta_years = (ref_date - match_date).days / 365.25
        cls = _classify(row.get('tournament', ''))
        lam = _SHRINKAGE_BY_CLASS.get(cls, 0.0)
        k = K_BY_CLASS.get(cls, K_BY_CLASS['qualifiers']) * 0.5 ** (delta_years / HALF_LIFE_YEARS) * (1 - lam)
        home, away = row["home_team"], row["away_team"]
        r_h = ratings.get(home, DEFAULT_RATING)
        r_a = ratings.get(away, DEFAULT_RATING)
        new_h, new_a = update_rating(r_h, r_a, int(row["home_goals"]), int(row["away_goals"]), k=k)
        ratings[home] = new_h
        ratings[away] = new_a
        date_str = match_date.strftime("%Y-%m-%d")
        history.setdefault(home, []).append({"date": date_str, "elo": round(new_h, 2)})
        history.setdefault(away, []).append({"date": date_str, "elo": round(new_a, 2)})
    return ratings, history
