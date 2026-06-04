import { useState, useMemo } from 'react'

const FLAGS = {
  // Official FIFA 2026 team names
  Argentina: '🇦🇷', France: '🇫🇷', Brazil: '🇧🇷', Spain: '🇪🇸', Portugal: '🇵🇹',
  England: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', Germany: '🇩🇪', Netherlands: '🇳🇱', Belgium: '🇧🇪', Croatia: '🇭🇷',
  Uruguay: '🇺🇾', Japan: '🇯🇵', Morocco: '🇲🇦', Colombia: '🇨🇴', Senegal: '🇸🇳',
  Mexico: '🇲🇽', USA: '🇺🇸', Switzerland: '🇨🇭', Austria: '🇦🇹', Ecuador: '🇪🇨',
  Australia: '🇦🇺', Algeria: '🇩🇿', Egypt: '🇪🇬', Canada: '🇨🇦', 'Saudi Arabia': '🇸🇦',
  Ghana: '🇬🇭', Qatar: '🇶🇦', Iraq: '🇮🇶', Scotland: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', Paraguay: '🇵🇾',
  Jordan: '🇯🇴', 'New Zealand': '🇳🇿', Panama: '🇵🇦', Sweden: '🇸🇪', Tunisia: '🇹🇳',
  'South Africa': '🇿🇦', Norway: '🇳🇴',
  // Official renamed names
  'Korea Republic': '🇰🇷',
  'Türkiye': '🇹🇷',
  'IR Iran': '🇮🇷',
  'Congo DR': '🇨🇩',
  'Bosnia and Herzegovina': '🇧🇦',
  'Czechia': '🇨🇿',
  // New qualifiers
  "Côte d'Ivoire": '🇨🇮',
  'Curaçao': '🇨🇼',
  'Cabo Verde': '🇨🇻',
  'Haiti': '🇭🇹',
  'Uzbekistan': '🇺🇿',
}

const flag = name => FLAGS[name] ?? '🏳️'

function barColor(rank, total) {
  const pct = 1 - rank / total
  if (pct > 0.85) return '#f5c542'   // gold — top few
  if (pct > 0.60) return '#4f8ef7'   // blue
  if (pct > 0.30) return '#3ecf6e'   // green
  return '#8892a4'                    // muted
}

export default function ChampionshipOdds({ teams }) {
  const [query, setQuery] = useState('')
  const [showAll, setShowAll] = useState(false)

  // Only show 48 sim teams (win_pct > 0 or name in our groups)
  const simTeams = useMemo(
    () => teams.filter(t => t.win_pct > 0),
    [teams]
  )

  const filtered = useMemo(() => {
    if (!query.trim()) return simTeams
    const q = query.toLowerCase()
    return simTeams.filter(t => t.name.toLowerCase().includes(q))
  }, [simTeams, query])

  const visible = showAll || query ? filtered : filtered.slice(0, 20)
  const maxPct = simTeams[0]?.win_pct ?? 1

  return (
    <div>
      {/* Search + meta */}
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
        <span className="text-[var(--muted)] text-sm">
          {simTeams.length} teams · sorted by win probability
        </span>
      </div>

      {/* Legend */}
      <div className="flex gap-4 mb-5 text-xs text-[var(--muted)]">
        <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#f5c542]" /> Top contenders</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#4f8ef7]" /> Strong chances</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#3ecf6e]" /> Outsiders</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#8892a4]" /> Longshots</span>
      </div>

      {/* Rows */}
      <div className="space-y-1.5">
        {visible.map((team, i) => {
          const rank = filtered.indexOf(team)
          const barW = (team.win_pct / maxPct) * 100
          const color = barColor(rank, simTeams.length)
          return (
            <div
              key={team.name}
              className="group flex items-center gap-3 bg-[var(--surface)] border border-[var(--border)]
                         rounded-lg px-4 py-2.5 hover:border-[var(--accent)]/50 transition-colors"
            >
              {/* Rank */}
              <span className="text-[var(--muted)] text-xs font-mono w-5 text-right shrink-0">
                {rank + 1}
              </span>

              {/* Flag + name */}
              <span className="text-lg leading-none shrink-0">{flag(team.name)}</span>
              <span className="text-sm font-medium w-32 shrink-0 truncate">{team.name}</span>

              {/* Bar */}
              <div className="flex-1 bg-[var(--border)]/40 rounded-full h-2 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${barW}%`, backgroundColor: color }}
                />
              </div>

              {/* Win % */}
              <span
                className="text-sm font-mono font-semibold w-12 text-right shrink-0"
                style={{ color }}
              >
                {team.win_pct.toFixed(1)}%
              </span>

              {/* Elo */}
              <span className="text-[var(--muted)] text-xs font-mono w-14 text-right shrink-0
                               opacity-0 group-hover:opacity-100 transition-opacity">
                {Math.round(team.elo)}
              </span>
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
          {showAll
            ? '↑ Show fewer'
            : `↓ Show all ${filtered.length} teams (${filtered.length - 20} more)`}
        </button>
      )}

      {filtered.length === 0 && (
        <p className="text-center text-[var(--muted)] py-12 text-sm">No teams match "{query}"</p>
      )}
    </div>
  )
}
