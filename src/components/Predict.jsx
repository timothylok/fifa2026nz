import { useState, useMemo, useEffect } from 'react'
import { FIFA_2026_GROUPS, computeGroupStandings } from '../utils/groups'
import { flag } from '../utils/flags'

const STORAGE_KEY = 'fifa2026_picks'

function loadPicks() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {} }
  catch { return {} }
}

export default function Predict({ teams, groupMatchProbs }) {
  const [picks, setPicks] = useState(loadPicks)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(picks))
  }, [picks])

  const teamsMap = useMemo(
    () => Object.fromEntries(teams.map(t => [t.name, t])),
    [teams]
  )

  const modelStandings = useMemo(
    () => computeGroupStandings(groupMatchProbs),
    [groupMatchProbs]
  )

  function handlePick(group, team) {
    setPicks(prev => {
      const cur = prev[group] || []
      if (cur[0] === team) {
        // Deselect 1st → shift 2nd up
        return { ...prev, [group]: cur[1] ? [cur[1]] : [] }
      }
      if (cur[1] === team) {
        // Deselect 2nd
        return { ...prev, [group]: [cur[0]] }
      }
      if (cur.length === 0) return { ...prev, [group]: [team] }
      if (cur.length === 1) return { ...prev, [group]: [cur[0], team] }
      // Already have 2 — replace 2nd
      return { ...prev, [group]: [cur[0], team] }
    })
  }

  function clearAll() {
    setPicks({})
  }

  const groupIds = Object.keys(FIFA_2026_GROUPS)
  const totalGroups = groupIds.length
  const completedGroups = groupIds.filter(g => (picks[g] || []).length === 2).length

  // Score: compare user picks vs model's top-2
  const score = useMemo(() => {
    let pts = 0, possible = 0
    groupIds.forEach(g => {
      const userPicks = picks[g] || []
      const modelTop2 = (modelStandings[g] || []).slice(0, 2).map(r => r.team)
      possible += 2
      if (userPicks[0] && modelTop2.includes(userPicks[0])) pts++
      if (userPicks[1] && modelTop2.includes(userPicks[1])) pts++
    })
    return { pts, possible }
  }, [picks, modelStandings, groupIds])

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">Group Stage Predictor</h2>
          <p className="text-[var(--muted)] text-sm mt-0.5">
            Pick the top 2 teams from each group. Compare your picks vs the model.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-[var(--muted)]">
            {completedGroups}/{totalGroups} groups done
          </span>
          <button
            onClick={clearAll}
            className="px-3 py-1.5 text-xs border border-[var(--border)] rounded-md
                       text-[var(--muted)] hover:text-[var(--text)] bg-[var(--surface)]
                       hover:border-[var(--accent)]/50 transition-colors"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Score summary */}
      {completedGroups > 0 && (
        <div className="mb-6 bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4
                        flex items-center gap-4 flex-wrap">
          <div className="text-center">
            <div className="text-3xl font-bold text-[var(--accent)]">{score.pts}</div>
            <div className="text-[10px] uppercase tracking-wider text-[var(--muted)] mt-0.5">
              matches model
            </div>
          </div>
          <div className="text-[var(--muted)] text-sm">
            out of <strong className="text-[var(--text)]">{completedGroups * 2}</strong> picks entered
            {' '}·{' '}
            <strong className="text-[var(--text)]">{Math.round(score.pts / Math.max(completedGroups * 2, 1) * 100)}%</strong> agreement
          </div>
          <div className="flex-1 bg-[var(--border)]/40 rounded-full h-2 overflow-hidden min-w-[80px]">
            <div
              className="h-full rounded-full bg-[var(--accent)] transition-all duration-500"
              style={{ width: `${score.pts / Math.max(completedGroups * 2, 1) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Groups grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {groupIds.map(gid => {
          const members = FIFA_2026_GROUPS[gid]
          const userPicks = picks[gid] || []
          const modelTop2 = (modelStandings[gid] || []).slice(0, 2).map(r => r.team)

          return (
            <div key={gid} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
              {/* Group header */}
              <div className="px-4 py-2.5 border-b border-[var(--border)] flex items-center justify-between">
                <span className="font-bold text-sm text-[var(--accent)]">Group {gid}</span>
                {userPicks.length === 2 && (
                  <span className="text-[10px] text-[var(--muted)]">
                    {userPicks.every(p => modelTop2.includes(p))
                      ? '✓ Matches model'
                      : userPicks.some(p => modelTop2.includes(p))
                        ? '~ Partial match'
                        : '✗ Differs from model'}
                  </span>
                )}
              </div>

              {/* Teams */}
              <div className="p-2 space-y-1">
                {members.map(name => {
                  const pickIndex = userPicks.indexOf(name) // -1, 0, or 1
                  const isModelTop = modelTop2.includes(name)
                  const teamData = teamsMap[name]
                  return (
                    <button
                      key={name}
                      onClick={() => handlePick(gid, name)}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left
                                  transition-all text-sm
                                  ${pickIndex === 0
                                    ? 'bg-[#f5c542]/15 border border-[#f5c542]/60 text-[var(--text)]'
                                    : pickIndex === 1
                                      ? 'bg-[#8892a4]/15 border border-[#8892a4]/60 text-[var(--text)]'
                                      : 'border border-transparent hover:bg-[var(--border)]/30 text-[var(--text)]'}`}
                    >
                      <span className="text-base leading-none">{flag(name)}</span>
                      <span className="flex-1 truncate">{name}</span>
                      {teamData && (
                        <span className="text-[10px] font-mono text-[var(--muted)] shrink-0">
                          {Math.round(teamData.elo)}
                        </span>
                      )}
                      {pickIndex === 0 && (
                        <span className="text-[10px] font-bold text-[#f5c542] shrink-0">1st</span>
                      )}
                      {pickIndex === 1 && (
                        <span className="text-[10px] font-bold text-[#8892a4] shrink-0">2nd</span>
                      )}
                    </button>
                  )
                })}
              </div>

              {/* Model expected */}
              <div className="px-4 py-2 border-t border-[var(--border)]/50">
                <div className="text-[9px] uppercase tracking-wider text-[var(--muted)] mb-1">Model expects</div>
                <div className="flex gap-2">
                  {modelTop2.map((name, i) => (
                    <span key={name} className="flex items-center gap-1 text-xs text-[var(--muted)]">
                      <span>{flag(name)}</span>
                      <span className={userPicks[i] === name ? 'text-[var(--accent)]' : ''}>{name}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {completedGroups === 0 && (
        <p className="text-center text-[var(--muted)] text-sm mt-6">
          Click teams above to pick your 1st and 2nd place finishers for each group.
        </p>
      )}
    </div>
  )
}
