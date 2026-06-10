import { useMemo } from 'react'
import { matchProbs } from '../utils/elo'
import { flag, FlagIcon } from '../utils/flags.jsx'
import { computeHybridStandings } from '../utils/groups'
import { buildOfficialR32 } from '../utils/bracket'

const ROUND_LABELS = ['Round of 32', 'Round of 16', 'Quarter-Finals', 'Semi-Finals', 'Final']

function makeMatch(a, b, eloMap, koByPair) {
  if (!b || a === b) return { a, b: null, probs: null, winner: a }
  const real = koByPair[[a, b].sort().join('|')]
  if (real && (real.winner === a || real.winner === b)) {
    const ga = real.home === a ? real.home_goals : real.away_goals
    const gb = real.home === a ? real.away_goals : real.home_goals
    return { a, b, probs: null, winner: real.winner, played: true, ga, gb }
  }
  const eloA = eloMap[a] ?? 1500
  const eloB = eloMap[b] ?? 1500
  const probs = matchProbs(eloA, eloB)
  return { a, b, probs, winner: probs.homeWin >= probs.awayWin ? a : b }
}

function buildRounds(r32Pairs, eloMap, koByPair) {
  const rounds = [r32Pairs.map(([a, b]) => makeMatch(a, b, eloMap, koByPair))]
  while (rounds.at(-1).length > 1) {
    const prev = rounds.at(-1)
    const winners = prev.map(m => m.winner)
    const next = []
    for (let i = 0; i < winners.length; i += 2) {
      next.push(makeMatch(winners[i], winners[i + 1], eloMap, koByPair))
    }
    rounds.push(next)
  }
  return rounds
}

function MatchCard({ match, isChampion }) {
  const { a, b, probs, winner, played, ga, gb } = match
  if (!b) {
    return (
      <div className={`rounded-lg border p-2.5 ${isChampion ? 'border-[#f5c542]/50 bg-[#f5c542]/5' : 'border-[var(--border)] bg-[var(--surface)]'}`}>
        <TeamRow name={a} prob={1} isWinner />
        <div className="text-[10px] text-[var(--muted)] text-center mt-1">bye</div>
      </div>
    )
  }
  return (
    <div
      className={`rounded-lg border bg-[var(--surface)] p-2.5 ${played ? 'border-[var(--accent)]/40' : 'border-[var(--border)]'}`}
      data-played={played ? 'true' : undefined}
    >
      <TeamRow name={a} prob={probs?.homeWin ?? 0.5} score={played ? ga : null} isWinner={winner === a} />
      <div className="border-t border-[var(--border)] my-1.5" />
      <TeamRow name={b} prob={probs?.awayWin ?? 0.5} score={played ? gb : null} isWinner={winner === b} />
      {played && <div className="text-[10px] text-[var(--muted)] text-center mt-1">FT</div>}
    </div>
  )
}

function TeamRow({ name, prob, score, isWinner }) {
  return (
    <div className={`flex items-center gap-1.5 rounded px-1 py-0.5 ${isWinner ? 'bg-[var(--accent)]/10' : ''}`}>
      <span className="text-sm leading-none shrink-0"><FlagIcon name={name} /></span>
      <span className={`text-[11px] font-medium flex-1 truncate ${isWinner ? 'text-[var(--text)]' : 'text-[var(--muted)]'}`}>
        {name}
      </span>
      <span className={`text-[11px] font-mono shrink-0 ${isWinner ? 'text-[var(--accent)]' : 'text-[var(--muted)]'}`}>
        {score != null ? score : `${(prob * 100).toFixed(0)}%`}
      </span>
    </div>
  )
}

export default function Bracket({ teams, groupMatchProbs, completedMatches = [] }) {
  const eloMap = useMemo(() => Object.fromEntries(teams.map(t => [t.name, t.elo])), [teams])
  const standings = useMemo(
    () => computeHybridStandings(groupMatchProbs, completedMatches),
    [groupMatchProbs, completedMatches]
  )
  // Real knockout results by unordered pair (3RD playoff and penalty-undecided
  // matches excluded — they must not lock a bracket winner)
  const koByPair = useMemo(() => {
    const map = {}
    completedMatches.forEach(m => {
      if (m.stage !== 'group' && m.stage !== '3RD' && m.winner) {
        map[[m.home, m.away].sort().join('|')] = m
      }
    })
    return map
  }, [completedMatches])

  const rounds = useMemo(() => {
    const r32 = buildOfficialR32(standings)
    return buildRounds(r32, eloMap, koByPair)
  }, [standings, eloMap, koByPair])

  const finalMatch = rounds.at(-1)?.[0]
  const champion = finalMatch?.winner

  // Total height budget: space each column equally so R32 matches align naturally
  const CARD_H = 76  // px per match card (approx)
  const GAP = 8
  const totalH = rounds[0].length * CARD_H + (rounds[0].length - 1) * GAP

  return (
    <div>
      <p className="text-[var(--muted)] text-sm mb-4">
        Official FIFA 2026 bracket. Played knockout matches show real scores; unresolved
        slots show the most-likely team, with each round advancing the higher-probability side.
      </p>

      {champion && (
        <div className="mb-6 inline-flex items-center gap-3 px-4 py-2.5 rounded-xl border border-[#f5c542]/40 bg-[#f5c542]/5">
          <span className="text-2xl"><FlagIcon name={champion} /></span>
          <div>
            <div className="text-[11px] text-[var(--muted)] uppercase tracking-wider">
              {finalMatch?.played ? 'World Champion' : 'Predicted Champion'}
            </div>
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
              <div key={ri} className="flex flex-col shrink-0" style={{ width: 180, height: totalH }} data-round={ri}>
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
