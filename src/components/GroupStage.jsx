import { useState, useMemo } from 'react'
import { flag, FlagIcon } from '../utils/flags.jsx'
import { FIFA_2026_GROUPS, computeGroupStandings } from '../utils/groups'

function ProbBar({ homeWin, draw, awayWin }) {
  return (
    <div className="flex h-1.5 rounded-full overflow-hidden mt-2">
      <div style={{ width: `${homeWin * 100}%`, background: '#4f8ef7' }} />
      <div style={{ width: `${draw * 100}%`, background: 'var(--border)' }} />
      <div style={{ width: `${awayWin * 100}%`, background: '#3ecf6e' }} />
    </div>
  )
}

function MatchCard({ match }) {
  const { home, away, home_win, draw, away_win } = match
  const hFav = home_win > away_win
  const aFav = away_win > home_win

  return (
    <div className="bg-[var(--bg)] border border-[var(--border)] rounded-lg p-3">
      <div className="flex items-center gap-2">
        {/* Home */}
        <div className="flex-1 flex items-center gap-1.5">
          <span className="text-base leading-none"><FlagIcon name={home} /></span>
          <span className={`text-xs font-medium truncate ${hFav ? 'text-[var(--text)]' : 'text-[var(--muted)]'}`}>
            {home}
          </span>
        </div>
        {/* Probs */}
        <div className="flex gap-2 shrink-0 text-center">
          <div>
            <div className={`text-sm font-mono font-bold ${hFav ? 'text-[#4f8ef7]' : 'text-[var(--muted)]'}`}>
              {(home_win * 100).toFixed(0)}%
            </div>
            <div className="text-[10px] text-[var(--muted)]">W</div>
          </div>
          <div>
            <div className="text-sm font-mono font-bold text-[var(--muted)]">
              {(draw * 100).toFixed(0)}%
            </div>
            <div className="text-[10px] text-[var(--muted)]">D</div>
          </div>
          <div>
            <div className={`text-sm font-mono font-bold ${aFav ? 'text-[#3ecf6e]' : 'text-[var(--muted)]'}`}>
              {(away_win * 100).toFixed(0)}%
            </div>
            <div className="text-[10px] text-[var(--muted)]">W</div>
          </div>
        </div>
        {/* Away */}
        <div className="flex-1 flex items-center gap-1.5 justify-end">
          <span className={`text-xs font-medium truncate text-right ${aFav ? 'text-[var(--text)]' : 'text-[var(--muted)]'}`}>
            {away}
          </span>
          <span className="text-base leading-none"><FlagIcon name={away} /></span>
        </div>
      </div>
      <ProbBar homeWin={home_win} draw={draw} awayWin={away_win} />
    </div>
  )
}

export default function GroupStage({ groupMatchProbs, teams }) {
  const [sel, setSel] = useState('A')
  const groupIds = Object.keys(FIFA_2026_GROUPS)

  const standings = useMemo(() => computeGroupStandings(groupMatchProbs), [groupMatchProbs])
  const eloMap = useMemo(() => Object.fromEntries(teams.map(t => [t.name, t.elo])), [teams])
  const groupMatches = useMemo(() => groupMatchProbs.filter(m => m.group === sel), [groupMatchProbs, sel])
  const groupTeams = standings[sel] ?? []

  return (
    <div>
      {/* Group tabs */}
      <div className="flex flex-wrap gap-2 mb-6">
        {groupIds.map(gid => (
          <button
            key={gid}
            onClick={() => setSel(gid)}
            className={`px-3 py-1.5 rounded-md text-sm font-semibold transition-colors ${
              gid === sel
                ? 'bg-[var(--accent)] text-white'
                : 'bg-[var(--surface)] border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]'
            }`}
          >
            Group {gid}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Expected standings */}
        <div>
          <h3 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-3">
            Group {sel} — Expected Standings
          </h3>
          <div className="space-y-2">
            {groupTeams.map(({ team, expectedPts }, i) => {
              const qual = i < 2
              return (
                <div
                  key={team}
                  className={`flex items-center gap-3 rounded-lg px-4 py-2.5 border ${
                    qual
                      ? 'bg-[var(--surface)] border-[var(--accent)]/30'
                      : 'bg-[var(--surface)] border-[var(--border)]'
                  }`}
                >
                  <span className={`text-xs font-mono w-4 shrink-0 ${qual ? 'text-[var(--accent)]' : 'text-[var(--muted)]'}`}>
                    {i + 1}
                  </span>
                  <span className="text-base leading-none shrink-0"><FlagIcon name={team} /></span>
                  <span className="text-sm font-medium flex-1 truncate">{team}</span>
                  {qual && (
                    <span className="text-[10px] text-[var(--accent)] font-bold bg-[var(--accent)]/10 px-1.5 py-0.5 rounded shrink-0">
                      Q
                    </span>
                  )}
                  <span className="text-xs font-mono text-[var(--muted)] shrink-0">
                    {expectedPts.toFixed(1)} pts
                  </span>
                  <span className="text-xs font-mono text-[var(--muted)] shrink-0">
                    {Math.round(eloMap[team] ?? 1500)}
                  </span>
                </div>
              )
            })}
          </div>
          <p className="text-[10px] text-[var(--muted)] mt-2 ml-1">
            Expected pts from match probabilities · Q = expected qualifier
          </p>
        </div>

        {/* Match cards */}
        <div>
          <h3 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-3">
            Matches
          </h3>
          <div className="space-y-2">
            {groupMatches.map((match, i) => (
              <MatchCard key={i} match={match} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
