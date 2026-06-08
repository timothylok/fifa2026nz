import { useState, useEffect, useRef, useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'
import html2canvas from 'html2canvas'

const TEAM_COLORS = ['#60a5fa', '#f87171', '#34d399', '#fbbf24', '#a78bfa', '#fb923c']
const DEFAULT_TEAMS = ['Spain', 'France', 'England', 'Germany', 'Argentina', 'Brazil']
const MAX_TEAMS = 6

const TOURNAMENTS = [
  { month: '2018-06', label: 'WC 2018' },
  { month: '2021-06', label: 'Euro 2020' },
  { month: '2022-11', label: 'WC 2022' },
  { month: '2024-06', label: 'Euro 2024' },
]

const YEARS = Array.from({ length: 9 }, (_, i) => 2018 + i)

function buildChartData(historyData, teams, startYear, endYear) {
  const months = []
  const now = new Date()
  for (let y = startYear; y <= endYear; y++) {
    const maxMonth = y < now.getFullYear() ? 12 : now.getMonth() + 1
    for (let m = 1; m <= maxMonth; m++) {
      months.push(`${y}-${String(m).padStart(2, '0')}`)
    }
  }

  const teamSeries = {}
  for (const team of teams) {
    const events = (historyData[team] || []).slice().sort((a, b) => (a.date < b.date ? -1 : 1))
    let lastElo = null
    let ei = 0
    const series = {}
    for (const month of months) {
      while (ei < events.length && events[ei].date.slice(0, 7) <= month) {
        lastElo = events[ei].elo
        ei++
      }
      if (lastElo !== null) series[month] = lastElo
    }
    teamSeries[team] = series
  }

  return months.map(month => {
    const point = { month }
    for (const team of teams) {
      if (teamSeries[team][month] !== undefined) point[team] = teamSeries[team][month]
    }
    return point
  })
}

export default function EloTrajectories() {
  const [historyData, setHistoryData] = useState(null)
  const [error, setError] = useState(null)
  const [selectedTeams, setSelectedTeams] = useState(DEFAULT_TEAMS)
  const [startYear, setStartYear] = useState(2018)
  const [endYear, setEndYear] = useState(2026)
  const chartRef = useRef(null)

  useEffect(() => {
    fetch('/data/elo_history.json')
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(setHistoryData)
      .catch(e => setError(e.message))
  }, [])

  const allTeams = useMemo(
    () => (historyData ? Object.keys(historyData).sort() : []),
    [historyData]
  )

  const chartData = useMemo(
    () => (historyData ? buildChartData(historyData, selectedTeams, startYear, endYear) : []),
    [historyData, selectedTeams, startYear, endYear]
  )

  const visibleTournaments = TOURNAMENTS.filter(t => {
    const y = parseInt(t.month.slice(0, 4))
    return y >= startYear && y <= endYear
  })

  function toggleTeam(team) {
    setSelectedTeams(prev => {
      if (prev.includes(team)) return prev.filter(t => t !== team)
      if (prev.length >= MAX_TEAMS) return prev
      return [...prev, team]
    })
  }

  function handleDownload() {
    if (!chartRef.current) return
    html2canvas(chartRef.current, { backgroundColor: '#1a1a2e' }).then(canvas => {
      const link = document.createElement('a')
      link.download = 'elo-trajectories.png'
      link.href = canvas.toDataURL('image/png')
      link.click()
    })
  }

  if (error) return (
    <div className="text-center py-12">
      <p className="text-red-400 text-sm">Failed to load Elo history: {error}</p>
      <p className="text-[var(--muted)] text-xs mt-2">Run python run.py first to generate elo_history.json.</p>
    </div>
  )

  if (!historyData) return (
    <div className="flex items-center justify-center py-16">
      <div className="text-3xl animate-spin inline-block">⚽</div>
    </div>
  )

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold mb-0.5">Elo Rating Trajectories</h2>
        <p className="text-[var(--muted)] text-xs">
          Select up to {MAX_TEAMS} teams · Dashed lines mark major tournaments
        </p>
      </div>

      {/* Team selector */}
      <div className="bg-[var(--surface)] rounded-lg border border-[var(--border)] p-4">
        <div className="text-xs text-[var(--muted)] mb-2">
          Teams ({selectedTeams.length}/{MAX_TEAMS} selected)
        </div>
        <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
          {allTeams.map(team => {
            const isSelected = selectedTeams.includes(team)
            const colorIdx = selectedTeams.indexOf(team)
            const isDisabled = !isSelected && selectedTeams.length >= MAX_TEAMS
            return (
              <button
                key={team}
                onClick={() => toggleTeam(team)}
                disabled={isDisabled}
                className={`px-2 py-0.5 rounded text-xs font-medium transition-colors border ${
                  isSelected
                    ? 'border-transparent text-black'
                    : isDisabled
                    ? 'border-[var(--border)] text-[var(--muted)] opacity-40 cursor-not-allowed'
                    : 'border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]'
                }`}
                style={isSelected ? { backgroundColor: TEAM_COLORS[colorIdx] } : {}}
              >
                {team}
              </button>
            )
          })}
        </div>
      </div>

      {/* Controls row */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-[var(--muted)] text-xs">From</span>
        <select
          value={startYear}
          onChange={e => setStartYear(Number(e.target.value))}
          className="bg-[var(--surface)] border border-[var(--border)] rounded px-2 py-1 text-sm text-[var(--text)]"
        >
          {YEARS.filter(y => y <= endYear).map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <span className="text-[var(--muted)] text-xs">To</span>
        <select
          value={endYear}
          onChange={e => setEndYear(Number(e.target.value))}
          className="bg-[var(--surface)] border border-[var(--border)] rounded px-2 py-1 text-sm text-[var(--text)]"
        >
          {YEARS.filter(y => y >= startYear).map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <button
          onClick={handleDownload}
          className="ml-auto px-3 py-1 text-xs border border-[var(--border)] rounded hover:text-[var(--text)] text-[var(--muted)] transition-colors"
        >
          Download PNG
        </button>
      </div>

      {/* Chart */}
      <div ref={chartRef} className="bg-[var(--surface)] rounded-lg border border-[var(--border)] p-4">
        {selectedTeams.length === 0 ? (
          <div className="flex items-center justify-center h-64 text-[var(--muted)] text-sm">
            Select at least one team above
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={chartData} margin={{ top: 8, right: 24, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11, fill: 'var(--muted)' }}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={['auto', 'auto']}
                tick={{ fontSize: 11, fill: 'var(--muted)' }}
                width={52}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  fontSize: '12px',
                }}
                formatter={(value, name) => [Math.round(value), name]}
                labelFormatter={label => label}
              />
              <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
              {selectedTeams.map((team, i) => (
                <Line
                  key={team}
                  type="monotone"
                  dataKey={team}
                  stroke={TEAM_COLORS[i]}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              ))}
              {visibleTournaments.map(t => (
                <ReferenceLine
                  key={t.label}
                  x={t.month}
                  stroke="#6b7280"
                  strokeDasharray="4 3"
                  label={{
                    value: t.label,
                    fontSize: 10,
                    fill: '#9ca3af',
                    angle: -90,
                    position: 'insideTopRight',
                    offset: 4,
                  }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
