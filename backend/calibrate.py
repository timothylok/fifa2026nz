"""
K-factor grid search via match-level Brier score.
Finds optimal per-class K values by evaluating prediction accuracy on
historical tournament matches (WC 2022, Euro 2020, Euro 2024).

Usage: python calibrate.py [--data path/to/historical_matches.csv]
"""
import sys
import argparse
import numpy as np
import pandas as pd
from itertools import product
from joblib import Parallel, delayed

from src.elo import expected_score, goal_diff_multiplier, DEFAULT_RATING, HALF_LIFE_YEARS

_EXPLICIT_CLASS = {
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

SHRINKAGE = {
    'wc': 0.20, 'continental': 0.15, 'nations_league': 0.10,
    'qualifiers': 0.0, 'friendlies': 0.0,
}

EVAL_WINDOWS = [
    {'name': 'WC 2022',   'start': '2022-11-20', 'end': '2022-12-18',
     'tournament': 'FIFA World Cup', 'weight': 0.50},
    {'name': 'Euro 2020', 'start': '2021-06-11', 'end': '2021-07-11',
     'tournament': 'UEFA Euro',      'weight': 0.25},
    {'name': 'Euro 2024', 'start': '2024-06-14', 'end': '2024-07-14',
     'tournament': 'UEFA Euro',      'weight': 0.25},
]


def classify(tournament: str) -> str:
    t = tournament or ''
    cls = _EXPLICIT_CLASS.get(t)
    if cls:
        return cls
    t_lower = t.lower()
    if 'qualif' in t_lower or 'q2026' in t_lower or t in ('CONCACAFQ', 'CONMEBOLQ'):
        return 'qualifiers'
    if 'friendly' in t_lower:
        return 'friendlies'
    return 'qualifiers'


def build_ratings_calibration(train_df: pd.DataFrame, k_by_class: dict) -> dict:
    ratings: dict = {}
    df = train_df.sort_values('date').reset_index(drop=True)
    dates = pd.to_datetime(df['date'])
    ref_date = dates.max()
    for (_, row), match_date in zip(df.iterrows(), dates):
        delta_years = (ref_date - match_date).days / 365.25
        cls = classify(row.get('tournament', ''))
        lam = SHRINKAGE.get(cls, 0.0)
        k = k_by_class.get(cls, k_by_class['qualifiers']) * 0.5 ** (delta_years / HALF_LIFE_YEARS) * (1 - lam)
        home, away = row['home_team'], row['away_team']
        r_h = ratings.get(home, DEFAULT_RATING)
        r_a = ratings.get(away, DEFAULT_RATING)
        e_h = expected_score(r_h, r_a)
        s_h = 1.0 if row['home_goals'] > row['away_goals'] else (0.5 if row['home_goals'] == row['away_goals'] else 0.0)
        mult = goal_diff_multiplier(int(row['home_goals']) - int(row['away_goals']))
        delta = k * mult * (s_h - e_h)
        ratings[home] = r_h + delta
        ratings[away] = r_a - delta
    return ratings


def match_brier(eval_df: pd.DataFrame, ratings: dict) -> float:
    scores = []
    for _, row in eval_df.iterrows():
        r_h = ratings.get(row['home_team'], DEFAULT_RATING)
        r_a = ratings.get(row['away_team'], DEFAULT_RATING)
        p = expected_score(r_h, r_a)
        o = 1.0 if row['home_goals'] > row['away_goals'] else (0.5 if row['home_goals'] == row['away_goals'] else 0.0)
        scores.append((p - o) ** 2)
    return float(np.mean(scores)) if scores else 0.0


def evaluate_combo(K_wc: int, K_cont: int, K_qual: int, K_friendly: int, df: pd.DataFrame) -> float:
    k_by_class = {
        'wc': K_wc,
        'continental': K_cont,
        'nations_league': K_cont,
        'qualifiers': K_qual,
        'friendlies': K_friendly,
    }
    dates = pd.to_datetime(df['date'])
    total_brier = 0.0
    total_weight = 0.0
    for w in EVAL_WINDOWS:
        win_start = pd.Timestamp(w['start'])
        win_end = pd.Timestamp(w['end'])
        train = df[dates < win_start]
        eval_mask = (dates >= win_start) & (dates <= win_end) & (df['tournament'] == w['tournament'])
        eval_df = df[eval_mask]
        if len(train) == 0 or len(eval_df) == 0:
            continue
        ratings = build_ratings_calibration(train, k_by_class)
        brier = match_brier(eval_df, ratings)
        total_brier += brier * w['weight']
        total_weight += w['weight']
    return total_brier / total_weight if total_weight > 0 else float('inf')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--data', default='data/historical_matches.csv')
    args = parser.parse_args()

    print(f"Loading data from {args.data} ...")
    df = pd.read_csv(args.data)
    df['date'] = pd.to_datetime(df['date'])

    for w in EVAL_WINDOWS:
        mask = (df['date'] >= w['start']) & (df['date'] <= w['end']) & (df['tournament'] == w['tournament'])
        print(f"  {w['name']}: {mask.sum()} eval matches (weight={w['weight']})")

    K_WC_RANGE = range(40, 75, 5)
    K_CONT_RANGE = range(30, 55, 5)
    K_QUAL_RANGE = range(20, 45, 5)
    K_FRIENDLY_RANGE = range(10, 30, 5)

    combos = list(product(K_WC_RANGE, K_CONT_RANGE, K_QUAL_RANGE, K_FRIENDLY_RANGE))
    print(f"\nGrid searching {len(combos)} K-combos (parallel) ...")

    brier_scores = Parallel(n_jobs=-1)(
        delayed(evaluate_combo)(K_wc, K_cont, K_qual, K_friendly, df)
        for K_wc, K_cont, K_qual, K_friendly in combos
    )

    ranked = sorted(zip(brier_scores, combos), key=lambda x: x[0])

    print(f"\nTop 10 K-factor combinations (lowest Brier = best):")
    print(f"{'Rank':>4} {'K_wc':>6} {'K_cont':>7} {'K_qual':>7} {'K_friend':>9} {'Brier':>10}")
    print("-" * 50)
    for rank, (brier, (K_wc, K_cont, K_qual, K_friendly)) in enumerate(ranked[:10], 1):
        print(f"{rank:>4} {K_wc:>6} {K_cont:>7} {K_qual:>7} {K_friendly:>9} {brier:>10.5f}")

    best_brier, (K_wc, K_cont, K_qual, K_friendly) = ranked[0]
    print(f"\nBest: K_wc={K_wc}, K_cont={K_cont}, K_qual={K_qual}, K_friendly={K_friendly}  ->  Brier={best_brier:.5f}")
    print(f"\nApply these values to src/elo.py K_BY_CLASS after reviewing the results.")


if __name__ == '__main__':
    main()
