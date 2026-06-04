import pandas as pd

DEFAULT_RATING = 1500.0
K = 30


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
    r_a: float, r_b: float, goals_a: int, goals_b: int, k: float = K
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


def build_ratings(matches_df: pd.DataFrame) -> dict[str, float]:
    ratings: dict[str, float] = {}
    df = matches_df.sort_values("date").reset_index(drop=True)
    for _, row in df.iterrows():
        home, away = row["home_team"], row["away_team"]
        r_h = ratings.get(home, DEFAULT_RATING)
        r_a = ratings.get(away, DEFAULT_RATING)
        new_h, new_a = update_rating(r_h, r_a, int(row["home_goals"]), int(row["away_goals"]))
        ratings[home] = new_h
        ratings[away] = new_a
    return ratings
