// Client-side port of src/poisson.py — Dixon-Coles corrected Poisson model
const MAX_GOALS = 8

function poissonPmf(k, lambda) {
  let logP = k * Math.log(lambda) - lambda
  for (let i = 1; i <= k; i++) logP -= Math.log(i)
  return Math.exp(logP)
}

function dcTau(i, j, lam, mu, rho = -0.1) {
  if (i === 0 && j === 0) return 1 - lam * mu * rho
  if (i === 0 && j === 1) return 1 + lam * rho
  if (i === 1 && j === 0) return 1 + mu * rho
  if (i === 1 && j === 1) return 1 - rho
  return 1
}

export function matchProbs(eloA, eloB) {
  const delta = eloA - eloB
  const lam = 1.35 * Math.exp(0.4 * delta / 400)
  const mu  = 1.35 * Math.exp(-0.4 * delta / 400)
  let hw = 0, d = 0, aw = 0, total = 0
  for (let i = 0; i <= MAX_GOALS; i++) {
    for (let j = 0; j <= MAX_GOALS; j++) {
      const p = poissonPmf(i, lam) * poissonPmf(j, mu) * dcTau(i, j, lam, mu)
      total += p
      if (i > j) hw += p
      else if (i === j) d += p
      else aw += p
    }
  }
  return { homeWin: hw / total, draw: d / total, awayWin: aw / total }
}
