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
