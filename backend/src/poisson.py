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


def score_matrix(lam: float, mu: float, max_goals: int = MAX_GOALS) -> np.ndarray:
    n = max_goals + 1
    mat = np.zeros((n, n))
    for x in range(n):
        for y in range(n):
            p_x = math.exp(-lam) * lam**x / math.factorial(x)
            p_y = math.exp(-mu) * mu**y / math.factorial(y)
            mat[x, y] = p_x * p_y * dc_correction(x, y, lam, mu)
    # renormalise to account for truncation
    mat /= mat.sum()
    return mat


def match_probs(lam: float, mu: float) -> dict[str, float]:
    mat = score_matrix(lam, mu)
    home_win = float(np.tril(mat, -1).sum())
    away_win = float(np.triu(mat, 1).sum())
    draw = float(np.trace(mat))
    return {"home_win": home_win, "draw": draw, "away_win": away_win}
