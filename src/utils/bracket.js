// Mirror of the official FIFA 2026 R32 bracket in src/simulate.py
// (_R32_FIXED, _THIRD_SLOT_ELIGIBILITY, _assign_thirds, _build_r32).
import { FIFA_2026_GROUPS } from './groups'

// 8 fixed matches (no third-place teams involved) — matches 73-88 schedule.
const R32_FIXED = [
  ['2A', '2B'], ['1F', '2C'], ['1C', '2F'], ['2E', '2I'],
  ['2K', '2L'], ['1H', '2J'], ['1J', '2H'], ['2D', '2G'],
]

// 8 slots where group winners play third-place teams; values list the
// eligible groups a qualifying third can come from (FIFA Annex C grid).
const THIRD_SLOT_ELIGIBILITY = {
  '1E': 'ABCDF',
  '1I': 'CDFGH',
  '1A': 'CEFHI',
  '1L': 'EHIJK',
  '1D': 'BEFIJ',
  '1G': 'AEHIJ',
  '1B': 'EFGIJ',
  '1K': 'DEIJL',
}

// Match 8 qualifying third-place groups to the 8 official slots via backtracking.
function assignThirds(qualifyingGroups) {
  const slotsOrder = Object.keys(THIRD_SLOT_ELIGIBILITY)
  const assignment = {}
  const remaining = new Set(qualifyingGroups)

  function backtrack(idx) {
    if (idx === slotsOrder.length) return true
    const slot = slotsOrder[idx]
    for (const grp of [...remaining].sort()) {
      if (THIRD_SLOT_ELIGIBILITY[slot].includes(grp)) {
        assignment[slot] = grp
        remaining.delete(grp)
        if (backtrack(idx + 1)) return true
        remaining.add(grp)
      }
    }
    return false
  }

  backtrack(0)
  return assignment
}

// standings: {gid: [{team, expectedPts, gd?, gf?}, ...]} rows in finishing order.
// Returns 16 [a, b] pairs in official bracket order.
export function buildOfficialR32(standings) {
  const slots = {}
  Object.keys(FIFA_2026_GROUPS).forEach(gid => {
    slots[`1${gid}`] = standings[gid][0].team
    slots[`2${gid}`] = standings[gid][1].team
  })

  // Best 8 thirds (pts, then GD/GF when real results exist, then group letter)
  const thirds = Object.keys(FIFA_2026_GROUPS)
    .map(gid => ({ gid, ...standings[gid][2] }))
    .sort((a, b) =>
      b.expectedPts - a.expectedPts ||
      (b.gd ?? 0) - (a.gd ?? 0) ||
      (b.gf ?? 0) - (a.gf ?? 0) ||
      a.gid.localeCompare(b.gid))
    .slice(0, 8)
  const thirdByGroup = Object.fromEntries(thirds.map(t => [t.gid, t.team]))

  const pairs = R32_FIXED.map(([a, b]) => [slots[a], slots[b]])
  const slotToGroup = assignThirds(Object.keys(thirdByGroup))
  Object.keys(THIRD_SLOT_ELIGIBILITY).forEach(slot => {
    pairs.push([slots[slot], thirdByGroup[slotToGroup[slot]]])
  })
  return pairs
}
