import { useMemo } from 'react'
import { matchProbs } from '../utils/elo'
import { flag } from '../utils/flags'
import { FIFA_2026_GROUPS, computeGroupStandings } from '../utils/groups'

const ROUND_LABELS = ['Round of 32', 'Round of 16', 'Quarter-Finals', 'Semi-Finals', 'Final']

// Mirrors _build_r32 from src/simulate.py
function buildR32(standings) {
  const groupIds = Object.keys(FIFA_2026_GROUPS)
  const first  = groupIds.map(g => standings[g][0].team)
  const second = groupIds.map(g => standings[g][1].team)
  const thirds = groupIds
    .map(g => standings[g][2])
    .sort((a, b) => b.expectedPts - a.expectedPts)
    .slice(0, 8)
    .map(t => t.team)

  const candidates = []
  for (let i = 0; i < 12; i++) candidates.push([first[i], second[(i + 1) % 12]])
  for (let i = 0; i < 8; i++) candidates.push([first[i % 12], thirds[i]])

  const seen = new Set()
  const r32 = []
  for (const [a, b] of candidates) {
    if (!seen.has(a) && !seen.has(b)) {
      r32.push([a, b])
      seen.add(a)
      seen.add(b)
    }
    if (r32.length === 16) break
  }
  return r32
}

function makeMatch(a, b, eloMap) {
  if (!b || a === b) return { a, b: null, probs: null, winner: a }
  const eloA = eloMap[a] ?? 1500
  const eloB = eloMap[b] ?? 1500
  const probs = matchProbs(eloA, eloB)
  return { a, b, probs, winner: probs.homeWin >= probs.awayWin ? a : b }
}

function buildRounds(r32Pairs, eloMap) {
  const rounds = [r32Pairs.map(([a, b]) => makeMatch(a, b, eloMap))]
  while (rounds.at(-1).length > 1) {
    const prev = rounds.at(-1)
    const winners = prev.map(m => m.winner)
    const next = []
    for (let i = 0; i < winners.length; i += 2) {
      next.push(makeMatch(winners[i], winners[i + 1], eloMap))
    }
    rounds.push(next)
  }
  return rounds
}

function MatchCard({ match, isChampion }) {
  const { a, b, probs, winner } = match
  if (!b) {
    return (
      <div className={`rounded-lg border p-2.5 ${isChampion ? 'border-[#f5c542]/50 bg-[#f5c542]/5' : 'border-[var(--border)] bg-[var(--surface)]'}`}>
        <TeamRow name={a} prob={1} isWinner />
        <div className="text-[10px] text-[var(--muted)] text-center mt-1">bye</div>
      </div>
    )
  }
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2.5">
      <TeamRow name={a} prob={probs?.homeWin ?? 0.5} isWinner={winner === a} />
      <div className="border-t border-[var(--border)] my-1.5" />
      <TeamRow name={b} prob={probs?.awayWin ?? 0.5} isWinner={winner === b} />
    </div>
  )
}

function TeamRow({ name, prob, isWinner }) {
  return (
    <div className={`flex items-center gap-1.5 rounded px-1 py-0.5 ${isWinner ? 'bg-[var(--accent)]/10' : ''}`}>
      <span className="text-sm leading-none shrink-0">{flag(name)}</span>
      <span className={`text-[11px] font-medium flex-1 truncate ${isWinner ? 'text-[var(--text)]' : 'text-[var(--muted)]'}`}>
        {name}
      </span>
      <span className={`text-[11px] font-mono shrink-0 ${isWinner ? 'text-[var(--accent)]' : 'text-[var(--muted)]'}`}>
        {(prob * 100).toFixed(0)}%
      </span>
    </div>
  )
}

export default function Bracket({ teams, groupMatchProbs }) {
  const eloMap = useMemo(() => Object.fromEntries(teams.map(t => [t.name, t.elo])), [teams])
  const standings = useMemo(() => computeGroupStandings(groupMatchProbs), [groupMatchProbs])

  const rounds = useMemo(() => {
    const r32 = buildR32(standings)
    return buildRounds(r32, eloMap)
  }, [standings, eloMap])

  const champion = rounds.at(-1)?.[0]?.winner

  // Total height budget: space each column equally so R32 matches align naturally
  const CARD_H = 76  // px per match card (approx)
  const GAP = 8
  const totalH = rounds[0].length * CARD_H + (rounds[0].length - 1) * GAP

  return (
    <div>
      <p className="text-[var(--muted)] text-sm mb-4">
        Expected bracket based on Elo ratings. Group finishers determined by match probabilities;
        each round advances the higher-probability team.
      </p>

      {champion && (
        <div className="mb-6 inline-flex items-center gap-3 px-4 py-2.5 rounded-xl border border-[#f5c542]/40 bg-[#f5c542]/5">
          <span className="text-2xl">{flag(champion)}</span>
          <div>
            <div className="text-[11px] text-[var(--muted)] uppercase tracking-wider">Predicted Champion</div>
            <div className="text-sm font-bold text-[#f5c542]">{champion}</div>
          </div>
        </div>
      )}

      <div className="overflow-x-auto pb-4">
        <div className="flex gap-3" style={{ minWidth: `${rounds.length * 188}px` }}>
          {rounds.map((matches, ri) => {
            // Each match in round ri occupies (2^ri) slots from round 0
            const slotsPerMatch = Math.pow(2, ri)
            const slotH = CARD_H + GAP
            const matchH = slotsPerMatch * slotH - GAP  // card height within its slot
            const topPad = ((slotsPerMatch - 1) * slotH) / 2

            return (
              <div key={ri} className="flex flex-col shrink-0" style={{ width: 180, height: totalH }}>
                <div className="text-[10px] font-semibold text-[var(--muted)] uppercase tracking-wider mb-2 text-center">
                  {ROUND_LABELS[ri] ?? `R${ri + 1}`}
                </div>
                <div className="relative flex-1">
                  {matches.map((match, mi) => (
                    <div
                      key={mi}
                      className="absolute w-full"
                      style={{
                        top: mi * slotsPerMatch * slotH + topPad,
                        height: matchH,
                      }}
                    >
                      <MatchCard match={match} isChampion={ri === rounds.length - 1} />
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
