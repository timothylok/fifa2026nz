import { useState, useEffect, useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts'

const LINE_COLORS = ['#60a5fa', '#f87171', '#34d399', '#fbbf24', '#a78bfa', '#fb923c', '#22d3ee', '#f472b6']
const MAX_LINES = 8

// "Title race over time" — daily championship probability snapshots
// written by run.py to prob_history.json (one entry per day, top 20 teams).
export default function TitleRace() {
  const [history, setHistory] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch('/data/prob_history.json')
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(setHistory)
      .catch(e => setError(e.message))
  }, [])

  const { chartData, topTeams } = useMemo(() => {
    if (!history || history.length === 0) return { chartData: [], topTeams: [] }
    const latest = history[history.length - 1].probs
    const topTeams = Object.entries(latest)
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_LINES)
      .map(([team]) => team)
    const chartData = history.map(({ date, probs }) => ({
      date,
      ...Object.fromEntries(topTeams.map(t => [t, probs[t]])),
    }))
    return { chartData, topTeams }
  }, [history])

  if (error || !history || chartData.length === 0) return null

  return (
    <div className="mb-6 bg-[var(--surface)] rounded-lg border border-[var(--border)] p-4" data-testid="title-race">
      <h3 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-2">
        Title Race Over Time
      </h3>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={chartData} margin={{ top: 8, right: 24, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--muted)' }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} width={44} unit="%" />
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              fontSize: '12px',
            }}
            formatter={(value, name) => [`${value}%`, name]}
          />
          <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
          {topTeams.map((team, i) => (
            <Line
              key={team}
              type="monotone"
              dataKey={team}
              stroke={LINE_COLORS[i]}
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      <p className="text-[10px] text-[var(--muted)] mt-1">
        Daily blended win-probability snapshots · top {MAX_LINES} teams
      </p>
    </div>
  )
}
