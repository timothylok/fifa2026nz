import { useState, useMemo } from 'react'
import { FIFA_2026_GROUPS } from '../utils/groups'
import { flag, FlagIcon } from '../utils/flags.jsx'

const HOST_NATIONS = new Set(['USA', 'Canada', 'Mexico'])

function barColor(rank, total) {
  const pct = 1 - rank / total
  if (pct > 0.85) return '#f5c542'
  if (pct > 0.60) return '#4f8ef7'
  if (pct > 0.30) return '#3ecf6e'
  return '#8892a4'
}

function WinBar({ prob, color, max }) {
  return (
    <div className="flex-1 bg-[var(--border)]/40 rounded-full h-1.5 overflow-hidden">
      <div className="h-full rounded-full" style={{ width: `${(prob / max) * 100}%`, backgroundColor: color }} />
    </div>
  )
}

export default function ChampionshipOdds({ teams, groupMatchProbs }) {
  const [query, setQuery]       = useState('')
  const [showAll, setShowAll]   = useState(false)
  const [expanded, setExpanded] = useState(null)
  const [copied, setCopied]     = useState(false)

  const simTeams = useMemo(() => teams.filter(t => t.win_pct > 0), [teams])

  // Lookup maps
  const teamsMap = useMemo(() => Object.fromEntries(simTeams.map(t => [t.name, t])), [simTeams])

  const eloRanks = useMemo(() => {
    const sorted = [...simTeams].sort((a, b) => b.elo - a.elo)
    return Object.fromEntries(sorted.map((t, i) => [t.name, i + 1]))
  }, [simTeams])

  const teamToGroup = useMemo(() => {
    const map = {}
    Object.entries(FIFA_2026_GROUPS).forEach(([gid, members]) =>
      members.forEach(name => { map[name] = gid })
    )
    return map
  }, [])

  // Index match probs by pair for fast lookup
  const matchIndex = useMemo(() => {
    const idx = {}
    if (!groupMatchProbs) return idx
    groupMatchProbs.forEach(m => {
      idx[`${m.home}|${m.away}`] = m
    })
    return idx
  }, [groupMatchProbs])

  const filtered = useMemo(() => {
    if (!query.trim()) return simTeams
    const q = query.toLowerCase()
    return simTeams.filter(t => t.name.toLowerCase().includes(q))
  }, [simTeams, query])

  const visible = showAll || query ? filtered : filtered.slice(0, 20)
  const maxPct  = simTeams[0]?.win_pct ?? 1

  function getMatchProb(teamName, opponentName) {
    const m = matchIndex[`${teamName}|${opponentName}`] || matchIndex[`${opponentName}|${teamName}`]
    if (!m) return null
    const isHome = m.home === teamName
    return {
      win:  isHome ? m.home_win  : m.away_win,
      draw: m.draw,
      lose: isHome ? m.away_win  : m.home_win,
    }
  }

  function handleShare() {
    const lines = [
      '🏆 FIFA 2026 Championship Odds (10k Monte-Carlo sims)',
      '',
      ...simTeams.slice(0, 10).map((t, i) =>
        `${i + 1}. ${flag(t.name)} ${t.name}: ${t.win_pct.toFixed(1)}%`
      ),
      '',
      'fifa2026nz.vercel.app',
    ]
    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div>
      {/* Header row */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <input
          type="text"
          placeholder="Search team…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="bg-[var(--surface)] border border-[var(--border)] rounded-md px-3 py-2
                     text-sm text-[var(--text)] placeholder-[var(--muted)] outline-none
                     focus:border-[var(--accent)] w-52 transition-colors"
        />
        <span className="text-[var(--muted)] text-sm flex-1">
          {simTeams.length} teams · sorted by win probability
        </span>
        <button
          onClick={handleShare}
          className={`px-4 py-2 rounded-lg text-sm font-bold shrink-0 transition-all duration-200
                     ${copied
                       ? 'bg-green-500 text-white scale-95 shadow-none'
                       : 'bg-[var(--accent)] text-[#0f172a] shadow-[0_0_16px_2px_rgba(34,211,238,0.45)] hover:shadow-[0_0_24px_4px_rgba(34,211,238,0.6)] hover:scale-105 active:scale-95'
                     }`}
        >
          {copied ? '✓ Copied!' : '📤 Share Top 10'}
        </button>
      </div>

      {/* Legend */}
      <div className="flex gap-4 mb-5 text-xs text-[var(--muted)]">
        <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#f5c542]" /> Top contenders</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#4f8ef7]" /> Strong chances</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#3ecf6e]" /> Outsiders</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#8892a4]" /> Longshots</span>
      </div>

      {/* Rows */}
      <div className="space-y-1">
        {visible.map((team) => {
          const rank    = filtered.indexOf(team)
          const barW    = (team.win_pct / maxPct) * 100
          const color   = barColor(rank, simTeams.length)
          const isOpen  = expanded === team.name
          const gid     = teamToGroup[team.name]
          const opponents = gid
            ? FIFA_2026_GROUPS[gid].filter(n => n !== team.name).map(name => ({
                name,
                elo: teamsMap[name]?.elo ?? 1500,
                ...getMatchProb(team.name, name),
              }))
            : []
          const avgOppElo = opponents.length
            ? Math.round(opponents.reduce((s, o) => s + o.elo, 0) / opponents.length)
            : null
          const isHost = HOST_NATIONS.has(team.name)

          return (
            <div key={team.name}>
              {/* Main row */}
              <div
                onClick={() => setExpanded(isOpen ? null : team.name)}
                className={`flex items-center gap-3 bg-[var(--surface)] border rounded-lg px-4 py-2.5
                            cursor-pointer transition-colors select-none
                            ${isOpen
                              ? 'border-[var(--accent)]/60 rounded-b-none'
                              : 'border-[var(--border)] hover:border-[var(--accent)]/40'}`}
              >
                <span className="text-[var(--muted)] text-xs font-mono w-5 text-right shrink-0">
                  {rank + 1}
                </span>
                <span className="text-lg leading-none shrink-0"><FlagIcon name={team.name} /></span>
                <span className="text-sm font-medium w-32 shrink-0 truncate">{team.name}</span>
                <div className="flex-1 bg-[var(--border)]/40 rounded-full h-2 overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${barW}%`, backgroundColor: color }} />
                </div>
                <span className="text-sm font-mono font-semibold w-12 text-right shrink-0" style={{ color }}>
                  {team.win_pct.toFixed(1)}%
                </span>
                <span className="text-[var(--muted)] text-xs font-mono w-14 text-right shrink-0">
                  {Math.round(team.elo)}
                </span>
                <span className="text-[var(--muted)] text-xs w-3 shrink-0 text-center">
                  {isOpen ? '▲' : '▼'}
                </span>
              </div>

              {/* Explain card */}
              {isOpen && (
                <div className="border border-t-0 border-[var(--accent)]/60 rounded-b-lg
                                bg-[var(--surface)]/60 px-4 py-3 space-y-3">
                  {/* Meta row */}
                  <div className="flex items-center gap-3 flex-wrap text-xs">
                    <span className="bg-[var(--border)] text-[var(--text)] font-mono px-2 py-0.5 rounded font-semibold">
                      Group {gid}
                    </span>
                    <span className="text-[var(--muted)]">
                      Elo <span className="text-[var(--text)] font-semibold">{Math.round(team.elo)}</span>
                      {' '}·{' '}rank
                      <span className="text-[var(--text)] font-semibold"> #{eloRanks[team.name]}</span>
                      {' '}of {simTeams.length}
                    </span>
                    {avgOppElo && (
                      <span className="text-[var(--muted)]">
                        Avg opponent Elo{' '}
                        <span className="text-[var(--text)] font-semibold">{avgOppElo}</span>
                      </span>
                    )}
                    {isHost && (
                      <span className="bg-[#f5c542]/15 text-[#f5c542] px-2 py-0.5 rounded font-semibold">
                        🏠 Host nation +75 Elo
                      </span>
                    )}
                  </div>

                  {/* Group matchups */}
                  {opponents.length > 0 && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-[var(--muted)] mb-1.5 font-semibold">
                        Group stage matchups
                      </div>
                      <div className="space-y-1.5">
                        {opponents.map(opp => (
                          <div key={opp.name} className="flex items-center gap-2 text-xs">
                            <span className="text-base leading-none"><FlagIcon name={opp.name} /></span>
                            <span className="w-28 truncate text-[var(--text)]">{opp.name}</span>
                            <span className="text-[var(--muted)] font-mono w-10 shrink-0">{Math.round(opp.elo)}</span>
                            {opp.win != null && (
                              <>
                                <WinBar prob={opp.win} color="#3ecf6e" max={1} />
                                <span className="font-mono text-[#3ecf6e] w-8 text-right shrink-0">
                                  {(opp.win * 100).toFixed(0)}%
                                </span>
                                <span className="text-[var(--muted)] font-mono w-6 text-center shrink-0">
                                  {(opp.draw * 100).toFixed(0)}%
                                </span>
                                <span className="text-[#e05555] font-mono w-8 text-right shrink-0">
                                  {(opp.lose * 100).toFixed(0)}%
                                </span>
                                <span className="text-[var(--muted)] hidden sm:flex gap-3 text-[9px] w-24 justify-end shrink-0">
                                  <span>W</span><span>D</span><span>L</span>
                                </span>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Show more / less */}
      {!query && filtered.length > 20 && (
        <button
          onClick={() => setShowAll(v => !v)}
          className="mt-4 w-full py-2.5 rounded-lg border border-[var(--border)] text-sm
                     text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--accent)]/50
                     transition-colors bg-[var(--surface)]"
        >
          {showAll ? '↑ Show fewer' : `↓ Show all ${filtered.length} teams (${filtered.length - 20} more)`}
        </button>
      )}

      {filtered.length === 0 && (
        <p className="text-center text-[var(--muted)] py-12 text-sm">No teams match "{query}"</p>
      )}
    </div>
  )
}
