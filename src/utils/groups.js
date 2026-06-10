// Mirror of FIFA_2026_GROUPS in src/simulate.py
export const FIFA_2026_GROUPS = {
  A: ['Mexico', 'South Africa', 'Korea Republic', 'Czechia'],
  B: ['Canada', 'Bosnia and Herzegovina', 'Qatar', 'Switzerland'],
  C: ['Haiti', 'Scotland', 'Brazil', 'Morocco'],
  D: ['Australia', 'Türkiye', 'USA', 'Paraguay'],
  E: ["Côte d'Ivoire", 'Ecuador', 'Germany', 'Curaçao'],
  F: ['Netherlands', 'Japan', 'Sweden', 'Tunisia'],
  G: ['IR Iran', 'New Zealand', 'Belgium', 'Egypt'],
  H: ['Saudi Arabia', 'Uruguay', 'Spain', 'Cabo Verde'],
  I: ['France', 'Senegal', 'Iraq', 'Norway'],
  J: ['Argentina', 'Algeria', 'Austria', 'Jordan'],
  K: ['Portugal', 'Congo DR', 'Uzbekistan', 'Colombia'],
  L: ['Ghana', 'Panama', 'England', 'Croatia'],
}

// Compute real standings per group from results.json completed_matches.
// Tiebreaks: pts → GD → GF → alphabetical (backend h2h mini-table not mirrored;
// authoritative order comes from the backend once a group completes).
export function computeRealStandings(completedMatches) {
  const table = {}
  Object.entries(FIFA_2026_GROUPS).forEach(([gid, teams]) => {
    table[gid] = Object.fromEntries(
      teams.map(t => [t, { team: t, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0 }])
    )
  })
  completedMatches.forEach(m => {
    if (m.stage !== 'group') return
    const g = table[m.group]
    if (!g || !g[m.home] || !g[m.away]) return
    const h = g[m.home], a = g[m.away]
    h.played += 1; a.played += 1
    h.gf += m.home_goals; h.ga += m.away_goals
    a.gf += m.away_goals; a.ga += m.home_goals
    if (m.home_goals > m.away_goals) { h.won += 1; a.lost += 1 }
    else if (m.home_goals < m.away_goals) { a.won += 1; h.lost += 1 }
    else { h.drawn += 1; a.drawn += 1 }
  })
  const result = {}
  Object.entries(table).forEach(([gid, teams]) => {
    result[gid] = Object.values(teams)
      .map(r => ({ ...r, gd: r.gf - r.ga, pts: r.won * 3 + r.drawn }))
      .sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || x.team.localeCompare(y.team))
  })
  return result
}

// Compute expected points per team in each group from group_match_probs
export function computeGroupStandings(groupMatchProbs) {
  const pts = {}
  Object.entries(FIFA_2026_GROUPS).forEach(([gid, teams]) => {
    pts[gid] = Object.fromEntries(teams.map(t => [t, 0]))
  })
  groupMatchProbs.forEach(({ group, home, away, home_win, draw, away_win }) => {
    if (!pts[group]) return
    pts[group][home] += home_win * 3 + draw
    pts[group][away] += away_win * 3 + draw
  })
  const result = {}
  Object.entries(pts).forEach(([gid, teamPts]) => {
    result[gid] = Object.entries(teamPts)
      .sort((a, b) => b[1] - a[1])
      .map(([team, expectedPts]) => ({ team, expectedPts }))
  })
  return result
}
