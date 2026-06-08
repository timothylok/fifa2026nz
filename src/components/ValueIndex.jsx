import { useState, useEffect, useMemo } from 'react'
import { LineChart, Line, ResponsiveContainer } from 'recharts'
import { FlagIcon } from '../utils/flags.jsx'

// Confederation membership for all 48 WC2026 teams
const CONFED_MAP = {
  // UEFA (16)
  'Czechia': 'UEFA', 'Bosnia and Herzegovina': 'UEFA', 'Switzerland': 'UEFA',
  'Scotland': 'UEFA', 'Germany': 'UEFA', 'Türkiye': 'UEFA',
  'Netherlands': 'UEFA', 'Sweden': 'UEFA', 'Belgium': 'UEFA',
  'Spain': 'UEFA', 'France': 'UEFA', 'Norway': 'UEFA',
  'Austria': 'UEFA', 'Portugal': 'UEFA', 'England': 'UEFA', 'Croatia': 'UEFA',
  // CONMEBOL (6)
  'Brazil': 'CONMEBOL', 'Ecuador': 'CONMEBOL', 'Paraguay': 'CONMEBOL',
  'Uruguay': 'CONMEBOL', 'Argentina': 'CONMEBOL', 'Colombia': 'CONMEBOL',
  // AFC (9)
  'Korea Republic': 'AFC', 'Qatar': 'AFC', 'Australia': 'AFC',
  'Japan': 'AFC', 'IR Iran': 'AFC', 'Saudi Arabia': 'AFC',
  'Iraq': 'AFC', 'Jordan': 'AFC', 'Uzbekistan': 'AFC',
  // CAF (10)
  'South Africa': 'CAF', 'Morocco': 'CAF', "Côte d'Ivoire": 'CAF',
  'Tunisia': 'CAF', 'Egypt': 'CAF', 'Senegal': 'CAF',
  'Algeria': 'CAF', 'Congo DR': 'CAF', 'Cabo Verde': 'CAF', 'Ghana': 'CAF',
  // CONCACAF (6)
  'Mexico': 'CONCACAF', 'Canada': 'CONCACAF', 'Haiti': 'CONCACAF',
  'USA': 'CONCACAF', 'Curaçao': 'CONCACAF', 'Panama': 'CONCACAF',
  // OFC (1)
  'New Zealand': 'OFC',
}

function valueColor(vi) {
  if (vi > 0.02)  return '#3ecf6e'
  if (vi > 0)     return '#a8d8b0'
  if (vi > -0.02) return '#e09055'
  return '#e05555'
}

function fmt(n, decimals = 1) {
  return (n * 100).toFixed(decimals) + '%'
}

function computeOverrounds(oddsData) {
  const rounds = {}
  for (const bk of oddsData.bookmakers) rounds[bk] = 0
  for (const entry of oddsData.teams) {
    for (const [bk, dec] of Object.entries(entry.odds)) {
      if (dec > 0) rounds[bk] = (rounds[bk] || 0) + 1 / dec
    }
  }
  return rounds
}

function computeFairImplied(oddsData, overrounds) {
  const result = {}
  for (const entry of oddsData.teams) {
    const bkData = {}
    let bestFair = 0, bestBk = null, bestDecimal = 0, bestRawImplied = 0
    for (const [bk, dec] of Object.entries(entry.odds)) {
      if (dec <= 0 || !overrounds[bk]) continue
      const raw  = 1 / dec
      const fair = raw / overrounds[bk]
      bkData[bk] = { decimal: dec, rawImplied: raw, fairImplied: fair }
      if (fair > bestFair) {
        bestFair = fair; bestBk = bk
        bestDecimal = dec; bestRawImplied = raw
      }
    }
    result[entry.name] = { ...bkData, bestFairImplied: bestFair, bestBk, bestDecimal, bestRawImplied }
  }
  return result
}

function buildValueRows(teams, fairData) {
  const rows = []
  for (const t of teams) {
    if (t.win_pct <= 0) continue
    const modelProb = t.win_pct / 100
    const fd = fairData[t.name]
    if (!fd) {
      rows.push({ name: t.name, modelProb, bestFairImplied: null, bestBk: null,
                  bestDecimal: null, bestRawImplied: null,
                  valueIndex: null, expectedRoi: null, bookmakerDetail: [] })
      continue
    }
    const { bestFairImplied, bestBk, bestDecimal, bestRawImplied, ...bks } = fd
    const valueIndex  = modelProb - bestFairImplied
    const expectedRoi = bestFairImplied > 0 ? (valueIndex / bestFairImplied) * 100 : null
    const bookmakerDetail = Object.entries(bks).map(([bk, d]) => ({ bk, ...d }))
    rows.push({ name: t.name, modelProb, bestFairImplied, bestBk, bestDecimal, bestRawImplied,
                valueIndex, expectedRoi, bookmakerDetail })
  }
  rows.sort((a, b) => {
    if (a.valueIndex == null && b.valueIndex == null) return 0
    if (a.valueIndex == null) return 1
    if (b.valueIndex == null) return -1
    return b.valueIndex - a.valueIndex
  })
  return rows
}

// 7-day Elo window; probDrift converts Elo delta → approximate win-probability change
function getEloTrend(team, eloHistory, modelProb) {
  const entries = eloHistory?.[team]
  if (!entries || entries.length === 0) return { delta: null, sparkline: [], direction: 'flat', probDrift: null }

  const sparkline = entries.slice(-12).map(e => ({ elo: e.elo }))

  const lastEntry = entries[entries.length - 1]
  const targetDate = new Date(lastEntry.date)
  targetDate.setDate(targetDate.getDate() - 7)

  let refElo = entries[0].elo
  for (const e of entries) {
    if (new Date(e.date) <= targetDate) refElo = e.elo
    else break
  }

  const delta = Math.round(lastEntry.elo - refElo)
  const direction = delta > 2 ? 'up' : delta < -2 ? 'down' : 'flat'

  // linearised ELO → probability shift: ΔP ≈ P(1−P) · ΔElo · ln10 / 400
  const p = modelProb
  const probDrift = (p != null && delta !== 0)
    ? p * (1 - p) * delta * Math.LN10 / 400
    : 0

  return { delta, sparkline, direction, probDrift }
}

function getConfidence(vi) {
  if (vi == null || vi <= 0) return null
  if (vi > 0.03) return 'High'
  if (vi > 0.01) return 'Medium'
  return 'Low'
}

// ── Sub-components ────────────────────────────────────────────────

function BookmakerPanel({ detail, bestBk }) {
  return (
    <div className="border border-t-0 border-[var(--accent)]/60 rounded-b-lg bg-[var(--surface)]/60 px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider text-[var(--muted)] mb-2 font-semibold">
        Market detail
      </div>
      <div className="space-y-1">
        <div className="flex gap-2 text-[10px] text-[var(--muted)] font-semibold mb-1">
          <span className="w-36 shrink-0">Source</span>
          <span className="w-16 text-right shrink-0">Decimal</span>
          <span className="w-20 text-right shrink-0">Market Implied</span>
        </div>
        {detail.map(({ bk, decimal, rawImplied }) => (
          <div
            key={bk}
            className={`flex gap-2 text-xs rounded px-1 py-0.5 ${bk === bestBk ? 'bg-[var(--accent)]/10' : ''}`}
          >
            <span className={`w-36 shrink-0 font-medium ${bk === bestBk ? 'text-[var(--accent)]' : 'text-[var(--text)]'}`}>
              {bk}
            </span>
            <span className="w-16 text-right shrink-0 font-mono text-[var(--muted)]">
              {decimal.toFixed(2)}x
            </span>
            <span className="w-20 text-right shrink-0 font-mono font-semibold text-[var(--text)]">
              {fmt(rawImplied)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ConfidenceBadge({ level }) {
  if (!level) return null
  const cls = {
    High:   'bg-green-500/15 text-green-400 border-green-500/30',
    Medium: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
    Low:    'bg-gray-500/15 text-[var(--muted)] border-[var(--border)]',
  }[level]
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${cls}`}>
      {level}
    </span>
  )
}

function EloSparkline({ data, color }) {
  if (!data || data.length < 3) return null
  return (
    <ResponsiveContainer width="100%" height={32}>
      <LineChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
        <Line type="monotone" dataKey="elo" stroke={color} strokeWidth={1.5}
              dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}

function SortBtn({ col, label, sortCol, sortDir, onSort, className }) {
  const active = col === sortCol
  return (
    <button
      onClick={() => onSort(col)}
      className={`flex items-center gap-0.5 transition-colors leading-tight ${
        active ? 'text-[var(--accent)]' : 'text-[var(--muted)] hover:text-[var(--text)]'
      } ${className}`}
    >
      {label}
      <span className="text-[9px] opacity-60 ml-0.5 shrink-0">
        {active ? (sortDir === 'desc' ? '↓' : '↑') : '↕'}
      </span>
    </button>
  )
}

// ── Main export ───────────────────────────────────────────────────

export default function ValueIndex({ teams }) {
  const [oddsData, setOddsData]     = useState(null)
  const [oddsError, setOddsError]   = useState(null)
  const [eloHistory, setEloHistory] = useState(null)
  const [expanded, setExpanded]     = useState(null)
  const [sortCol, setSortCol]       = useState('value')
  const [sortDir, setSortDir]       = useState('desc')
  const [confedFilter, setConfed]   = useState('All')
  const [tierFilter, setTier]       = useState('All')

  useEffect(() => {
    fetch('/data/market_odds.json')
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(setOddsData)
      .catch(e => setOddsError(e.message))
    fetch('/data/elo_history.json')
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(setEloHistory)
      .catch(() => {})
  }, [])

  const overrounds = useMemo(() => oddsData ? computeOverrounds(oddsData) : null, [oddsData])
  const fairData   = useMemo(
    () => (oddsData && overrounds) ? computeFairImplied(oddsData, overrounds) : null,
    [oddsData, overrounds]
  )

  const rows = useMemo(() => {
    if (!teams || !fairData) return []
    return buildValueRows(teams, fairData).map((r, i) => ({ ...r, valueRank: i + 1 }))
  }, [teams, fairData])

  const eloTrends = useMemo(() => {
    if (!eloHistory || rows.length === 0) return {}
    return Object.fromEntries(rows.map(r => [r.name, getEloTrend(r.name, eloHistory, r.modelProb)]))
  }, [eloHistory, rows])

  const eloMovers = useMemo(() => {
    if (!eloHistory) return null
    const withDelta = Object.keys(CONFED_MAP)
      .map(team => ({ team, delta: getEloTrend(team, eloHistory, null).delta }))
      .filter(t => t.delta !== null)
    return {
      risers:  [...withDelta].sort((a, b) => b.delta - a.delta).slice(0, 5),
      fallers: [...withDelta].sort((a, b) => a.delta - b.delta).slice(0, 5),
    }
  }, [eloHistory])

  const visibleRows = useMemo(() => {
    const filtered = rows
      .filter(r => confedFilter === 'All' || CONFED_MAP[r.name] === confedFilter)
      .filter(r => {
        if (tierFilter === 'All') return true
        if (tierFilter === 'Top 10') return r.valueRank <= 10
        if (tierFilter === 'Mid (11–30)') return r.valueRank >= 11 && r.valueRank <= 30
        if (tierFilter === 'Longshots (31+)') return r.valueRank >= 31
        return true
      })

    return [...filtered].sort((a, b) => {
      let av, bv
      if      (sortCol === 'model')  { av = a.modelProb;              bv = b.modelProb }
      else if (sortCol === 'market') { av = a.bestFairImplied;         bv = b.bestFairImplied }
      else if (sortCol === 'drift')  { av = eloTrends[a.name]?.probDrift; bv = eloTrends[b.name]?.probDrift }
      else if (sortCol === 'conf')   {
        const o = { High: 3, Medium: 2, Low: 1 }
        av = o[getConfidence(a.valueIndex)] ?? 0
        bv = o[getConfidence(b.valueIndex)] ?? 0
      }
      else { av = a.valueIndex; bv = b.valueIndex }

      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      return sortDir === 'desc' ? bv - av : av - bv
    })
  }, [rows, confedFilter, tierFilter, sortCol, sortDir, eloTrends])

  function handleSort(col) {
    if (col === sortCol) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortCol(col); setSortDir('desc') }
  }

  // ── Loading / error states ──────────────────────────────────────

  if (oddsError) return (
    <div className="text-center py-16">
      <div className="text-3xl mb-3">⚠️</div>
      <p className="text-red-400 text-sm font-mono mb-1">Failed to load market_odds.json</p>
      <p className="text-[var(--muted)] text-xs">{oddsError}</p>
    </div>
  )

  if (!oddsData) return (
    <div className="flex items-center justify-center py-24">
      <div className="text-center">
        <div className="text-3xl mb-3 animate-spin inline-block">⚽</div>
        <p className="text-[var(--muted)] text-sm">Loading odds…</p>
      </div>
    </div>
  )

  // ── Derived UI values ───────────────────────────────────────────

  const topPicks = rows.filter(r => r.valueIndex > 0).slice(0, 3)
  const CONFEDS  = ['All', 'UEFA', 'CONMEBOL', 'AFC', 'CAF', 'CONCACAF', 'OFC']
  const TIERS    = ['All', 'Top 10', 'Mid (11–30)', 'Longshots (31+)']

  const pillCls = (active) =>
    `px-3 py-1 rounded-full text-xs border transition-colors whitespace-nowrap ${
      active
        ? 'bg-[var(--accent)] border-[var(--accent)] text-white'
        : 'border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]'
    }`

  const trendArrow = (direction) =>
    direction === 'up' ? '↑' : direction === 'down' ? '↓' : '→'

  const trendColor = (direction) =>
    direction === 'up' ? '#3ecf6e' : direction === 'down' ? '#e05555' : '#8892a4'

  const fmtDrift = (trend) => {
    if (!trend || trend.probDrift == null) return '—'
    const pct = Math.abs(trend.probDrift * 100).toFixed(1)
    return `${trendArrow(trend.direction)}${pct}%`
  }

  // ── Render ──────────────────────────────────────────────────────

  return (
    <div className="space-y-8">

      {/* ── 1. Hero: Top Value Picks ── */}
      <div>
        <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
          <h2 className="text-sm font-semibold">Top Value Picks</h2>
          <span className="text-[10px] text-[var(--muted)]">
            Odds updated {new Date(oddsData.updated_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
            {' · '}Polymarket overround{' '}
            {overrounds['Polymarket'] != null
              ? (overrounds['Polymarket'] * 100).toFixed(1) + '%'
              : '—'}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {topPicks.map(row => {
            const vi    = row.valueIndex
            const color = valueColor(vi)
            const conf  = getConfidence(vi)
            const trend = eloTrends[row.name]
            return (
              <div
                key={row.name}
                className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 space-y-2"
              >
                {/* Name row */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xl leading-none shrink-0"><FlagIcon name={row.name} /></span>
                    <span className="text-sm font-semibold truncate">{row.name}</span>
                  </div>
                  <ConfidenceBadge level={conf} />
                </div>

                {/* Value index */}
                <div className="text-2xl font-bold font-mono" style={{ color }}>
                  {vi >= 0 ? '+' : ''}{fmt(vi)}
                </div>

                {/* Market / Model */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <div className="text-[10px] text-[var(--muted)] mb-0.5">Market (Decimal)</div>
                    <div className="font-mono font-medium text-[var(--text)]">
                      {row.bestRawImplied != null ? fmt(row.bestRawImplied) : '—'}
                      {row.bestDecimal != null && (
                        <span className="text-[var(--muted)] ml-1 text-[10px]">({row.bestDecimal.toFixed(2)}x)</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-[var(--muted)] mb-0.5">Model Implied</div>
                    <div className="font-mono font-medium text-[var(--text)]">{fmt(row.modelProb)}</div>
                  </div>
                </div>

                {/* Sparkline */}
                {trend?.sparkline?.length >= 3 && (
                  <EloSparkline data={trend.sparkline} color={color} />
                )}

                {/* Drift + Source */}
                <div className="flex items-center justify-between text-[11px]">
                  <span style={{ color: trend ? trendColor(trend.direction) : '#8892a4' }}>
                    Drift {fmtDrift(trend)} <span className="text-[10px] text-[var(--muted)]">(7d)</span>
                  </span>
                  <span className="text-[var(--muted)]">
                    Source: {row.bestBk ?? '—'}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── 2. Filters ── */}
      <div className="space-y-2">
        <div className="flex gap-1.5 flex-wrap">
          {CONFEDS.map(c => (
            <button key={c} onClick={() => setConfed(c)} className={pillCls(confedFilter === c)}>{c}</button>
          ))}
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {TIERS.map(t => (
            <button key={t} onClick={() => setTier(t)} className={pillCls(tierFilter === t)}>{t}</button>
          ))}
        </div>
      </div>

      {/* ── 3. Value table ── */}
      <div>
        <p className="text-xs text-[var(--muted)] mb-2">
          {visibleRows.length} teams
          {confedFilter !== 'All' && ` · ${confedFilter}`}
          {tierFilter !== 'All' && ` · ${tierFilter}`}
          {' · '}click a row for market detail
        </p>

        {/* Column headers */}
        <div className="flex items-center gap-2 px-3 mb-1 text-[9px] uppercase tracking-wider font-semibold select-none">
          <span className="w-5 shrink-0 text-[var(--muted)]">#</span>
          <span className="w-5 shrink-0" />
          <span className="w-24 shrink-0 text-[var(--muted)]">Team</span>
          <SortBtn col="model"  label="Model Implied"       sortCol={sortCol} sortDir={sortDir} onSort={handleSort} className="w-16 text-right shrink-0 justify-end" />
          <SortBtn col="market" label="Market (Decimal)"    sortCol={sortCol} sortDir={sortDir} onSort={handleSort} className="w-24 text-right shrink-0 justify-end" />
          <SortBtn col="value"  label="Value (Model−Mkt)"   sortCol={sortCol} sortDir={sortDir} onSort={handleSort} className="w-20 text-right shrink-0 justify-end" />
          <SortBtn col="drift"  label="Drift (7d)"          sortCol={sortCol} sortDir={sortDir} onSort={handleSort} className="w-16 text-right shrink-0 justify-end" />
          <span className="flex-1 text-right text-[var(--muted)] text-[9px] uppercase tracking-wider font-semibold">Source</span>
        </div>

        <div className="space-y-1">
          {visibleRows.map(row => {
            const isOpen = expanded === row.name
            const vi     = row.valueIndex
            const color  = vi != null ? valueColor(vi) : '#8892a4'
            const conf   = getConfidence(vi)
            const trend  = eloTrends[row.name]

            return (
              <div key={row.name}>
                <div
                  onClick={() => setExpanded(isOpen ? null : row.name)}
                  className={`flex items-center gap-2 bg-[var(--surface)] border rounded-lg px-3 py-2.5
                              cursor-pointer transition-colors select-none
                              ${isOpen
                                ? 'border-[var(--accent)]/60 rounded-b-none'
                                : 'border-[var(--border)] hover:border-[var(--accent)]/40'}`}
                >
                  {/* Rank */}
                  <span className="text-[var(--muted)] text-xs font-mono w-5 text-right shrink-0">
                    {row.valueRank}
                  </span>

                  {/* Flag */}
                  <span className="text-lg leading-none shrink-0 w-5"><FlagIcon name={row.name} /></span>

                  {/* Team + badge */}
                  <div className="w-24 shrink-0 flex items-center gap-1.5 min-w-0">
                    <span className="text-sm font-medium truncate">{row.name}</span>
                  </div>

                  {/* Model Implied */}
                  <span className="text-xs font-mono w-16 text-right shrink-0 text-[var(--text)]">
                    {fmt(row.modelProb)}
                  </span>

                  {/* Market (Decimal) — implied% + decimal */}
                  <span className="text-xs font-mono w-24 text-right shrink-0 text-[var(--muted)]">
                    {row.bestRawImplied != null
                      ? <>{fmt(row.bestRawImplied)}<span className="text-[10px] opacity-60 ml-0.5">({row.bestDecimal?.toFixed(2)}x)</span></>
                      : '—'}
                  </span>

                  {/* Value (Model − Market) */}
                  <span className="text-sm font-mono font-semibold w-20 text-right shrink-0" style={{ color }}>
                    {vi != null ? (vi >= 0 ? '+' : '') + fmt(vi) : '—'}
                  </span>

                  {/* Drift (7d) */}
                  <span className="text-xs font-mono w-16 text-right shrink-0"
                        style={{ color: trend ? trendColor(trend.direction) : '#8892a4' }}>
                    {trend ? fmtDrift(trend) : '—'}
                  </span>

                  {/* Source + confidence badge */}
                  <div className="flex-1 flex items-center justify-end gap-2">
                    <span className="text-[11px] text-[var(--muted)] hidden sm:inline">
                      {row.bestBk ?? '—'}
                    </span>
                    <ConfidenceBadge level={conf} />
                  </div>

                  <span className="text-[var(--muted)] text-xs w-3 shrink-0 text-center">
                    {isOpen ? '▲' : '▼'}
                  </span>
                </div>

                {isOpen && row.bookmakerDetail.length > 0 && (
                  <BookmakerPanel detail={row.bookmakerDetail} bestBk={row.bestBk} />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── 4. Elo Movers ── */}
      {eloMovers && (
        <div>
          <h3 className="text-sm font-semibold mb-3">Elo Momentum — last 7 days</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
              <div className="text-xs font-semibold text-green-400 mb-3">↑ Rising</div>
              <div className="space-y-2.5">
                {eloMovers.risers.map(({ team, delta }) => (
                  <div key={team} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-base leading-none shrink-0"><FlagIcon name={team} /></span>
                      <span className="text-xs truncate">{team}</span>
                    </div>
                    <span className="text-xs font-mono text-green-400 shrink-0">+{delta}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
              <div className="text-xs font-semibold text-red-400 mb-3">↓ Falling</div>
              <div className="space-y-2.5">
                {eloMovers.fallers.map(({ team, delta }) => (
                  <div key={team} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-base leading-none shrink-0"><FlagIcon name={team} /></span>
                      <span className="text-xs truncate">{team}</span>
                    </div>
                    <span className="text-xs font-mono text-red-400 shrink-0">{delta}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
