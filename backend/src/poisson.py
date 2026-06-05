import math
import numpy as np

BASE_LAMBDA = 1.35
ELO_SCALE = 400.0
RHO = -0.1  # Dixon-Coles low-score correlation
MAX_GOALS = 8


def lambda_from_elo(elo_a: float, elo_b: float) -> tuple[float, float]:
    diff = (elo_a - elo_b) / ELO_SCALE
    lam = BASE_LAMBDA * math.exp(0.4 * diff)
    mu = BASE_LAMBDA * math.exp(-0.4 * diff)
    return max(0.05, lam), max(0.05, mu)


def dc_correction(x: int, y: int, lam: float, mu: float, rho: float = RHO) -> float:
    if x == 0 and y == 0:
        return 1.0 - lam * mu * rho
    if x == 1 and y == 0:
        return 1.0 + mu * rho
    if x == 0 and y == 1:
        return 1.0 + lam * rho
    if x == 1 and y == 1:
        return 1.0 - rho
    return 1.0


def score_matrix(lam: float, mu: float, max_goals: int = MAX_GOALS, rho: float = RHO) -> np.ndarray:
    n = max_goals + 1
    mat = np.zeros((n, n))
    for x in range(n):
        for y in range(n):
            p_x = math.exp(-lam) * lam**x / math.factorial(x)
            p_y = math.exp(-mu) * mu**y / math.factorial(y)
            mat[x, y] = p_x * p_y * dc_correction(x, y, lam, mu, rho)
    # renormalise to account for truncation
    mat /= mat.sum()
    return mat


def match_probs(lam: float, mu: float, rho: float = RHO) -> dict[str, float]:
    mat = score_matrix(lam, mu, rho=rho)
    home_win = float(np.tril(mat, -1).sum())
    away_win = float(np.triu(mat, 1).sum())
    draw = float(np.trace(mat))
    return {"home_win": home_win, "draw": draw, "away_win": away_win}


def fit_rho(matches_df, ratings: dict) -> float:
    """Find ρ that maximises Dixon-Coles log-likelihood over historical matches."""
    from scipy.optimize import minimize_scalar

    rows = [
        (int(row["home_goals"]), int(row["away_goals"]),
         *lambda_from_elo(ratings.get(row["home_team"], 1500.0),
                          ratings.get(row["away_team"], 1500.0)))
        for _, row in matches_df.iterrows()
    ]

    def neg_ll(rho):
        total = 0.0
        for x, y, lam, mu in rows:
            tau = dc_correction(x, y, lam, mu, rho)
            if tau <= 0:
                return 1e10
            total += math.log(tau)
        return -total

    result = minimize_scalar(neg_ll, bounds=(-0.5, 0.5), method="bounded")
    return round(float(result.x), 4)
