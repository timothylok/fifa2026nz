import { useState, useEffect, useMemo } from 'react'
import { flag } from '../utils/flags'

function valueColor(vi) {
  if (vi > 0.02)  return '#3ecf6e'
  if (vi > 0)     return '#a8d8b0'
  if (vi > -0.02) return '#e09055'
  return '#e05555'
}

function fmt(n, decimals = 1) {
  return (n * 100).toFixed(decimals) + '%'
}

// Sum of 1/decimal for each team in the JSON per bookmaker
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

// { [teamName]: { [bk]: fairImplied, bestFairImplied, bestBk } }
function computeFairImplied(oddsData, overrounds) {
  const result = {}
  for (const entry of oddsData.teams) {
    const bkData = {}
    let bestFair = 0
    let bestBk = null
    for (const [bk, dec] of Object.entries(entry.odds)) {
      if (dec <= 0 || !overrounds[bk]) continue
      const raw  = 1 / dec
      const fair = raw / overrounds[bk]
      bkData[bk] = { decimal: dec, rawImplied: raw, fairImplied: fair }
      if (fair > bestFair) { bestFair = fair; bestBk = bk }
    }
    result[entry.name] = { ...bkData, bestFairImplied: bestFair, bestBk }
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
                  valueIndex: null, expectedRoi: null, bookmakerDetail: [] })
      continue
    }
    const { bestFairImplied, bestBk, ...bks } = fd
    const valueIndex  = modelProb - bestFairImplied
    const expectedRoi = bestFairImplied > 0 ? (valueIndex / bestFairImplied) * 100 : null
    const bookmakerDetail = Object.entries(bks).map(([bk, d]) => ({ bk, ...d }))
    rows.push({ name: t.name, modelProb, bestFairImplied, bestBk, valueIndex, expectedRoi, bookmakerDetail })
  }
  rows.sort((a, b) => {
    if (a.valueIndex == null && b.valueIndex == null) return 0
    if (a.valueIndex == null) return 1
    if (b.valueIndex == null) return -1
    return b.valueIndex - a.valueIndex
  })
  return rows
}

function BookmakerPanel({ detail, bestBk }) {
  return (
    <div className="border border-t-0 border-[var(--accent)]/60 rounded-b-lg
                    bg-[var(--surface)]/60 px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider text-[var(--muted)] mb-2 font-semibold">
        Bookmaker breakdown
      </div>
      <div className="space-y-1">
        <div className="flex gap-2 text-[10px] text-[var(--muted)] font-semibold mb-1">
          <span className="w-24 shrink-0">Book</span>
          <span className="w-16 text-right shrink-0">Decimal</span>
          <span className="w-16 text-right shrink-0">Implied</span>
          <span className="w-20 text-right shrink-0">Fair implied</span>
        </div>
        {detail.map(({ bk, decimal, rawImplied, fairImplied }) => (
          <div
            key={bk}
            className={`flex gap-2 text-xs rounded px-1 py-0.5 ${bk === bestBk ? 'bg-[var(--accent)]/10' : ''}`}
          >
            <span className={`w-24 shrink-0 font-medium ${bk === bestBk ? 'text-[var(--accent)]' : 'text-[var(--text)]'}`}>
              {bk === bestBk && '★ '}{bk}
            </span>
            <span className="w-16 text-right shrink-0 font-mono text-[var(--muted)]">
              {decimal.toFixed(2)}x
            </span>
            <span className="w-16 text-right shrink-0 font-mono text-[var(--muted)]">
              {fmt(rawImplied)}
            </span>
            <span className={`w-20 text-right shrink-0 font-mono font-semibold ${bk === bestBk ? 'text-[var(--accent)]' : 'text-[var(--text)]'}`}>
              {fmt(fairImplied)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function ValueIndex({ teams }) {
  const [oddsData, setOddsData] = useState(null)
  const [oddsError, setOddsError] = useState(null)
  const [showAll, setShowAll] = useState(false)
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    fetch('/data/market_odds.json')
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(setOddsData)
      .catch(e => setOddsError(e.message))
  }, [])

  const overrounds = useMemo(() => oddsData ? computeOverrounds(oddsData) : null, [oddsData])
  const fairData   = useMemo(() => (oddsData && overrounds) ? computeFairImplied(oddsData, overrounds) : null, [oddsData, overrounds])
  const rows       = useMemo(() => (teams && fairData) ? buildValueRows(teams, fairData) : [], [teams, fairData])

  const visible = showAll ? rows : rows.slice(0, 20)

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

  const bookmakers = oddsData.bookmakers

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
        <div>
          <p className="text-[var(--muted)] text-sm">
            {rows.length} teams · sorted by value index (model − market)
          </p>
          <p className="text-[var(--muted)] text-xs mt-1">
            Overround:{' '}
            {bookmakers.map((bk, i) => (
              <span key={bk}>
                {i > 0 && ' · '}
                <span className="text-[var(--text)]">{bk}</span>{' '}
                {overrounds[bk] != null ? (overrounds[bk] * 100).toFixed(1) + '%' : '—'}
              </span>
            ))}
          </p>
        </div>
        <div className="text-xs text-[var(--muted)] text-right">
          <div>Odds updated</div>
          <div className="font-mono">{new Date(oddsData.updated_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}</div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-4 mb-5 text-xs text-[var(--muted)] flex-wrap">
        <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#3ecf6e]" /> Strong value (&gt;+2%)</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#a8d8b0]" /> Mild value</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#e09055]" /> Mild overpriced</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#e05555]" /> Overpriced (&gt;−2%)</span>
      </div>

      {/* Column headers */}
      <div className="flex items-center gap-3 px-4 mb-1 text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold select-none">
        <span className="w-5 shrink-0" />
        <span className="w-5 shrink-0" />
        <span className="w-32 shrink-0">Team</span>
        <span className="w-14 text-right shrink-0">Model</span>
        <span className="w-14 text-right shrink-0">Mkt fair</span>
        <span className="w-16 text-right shrink-0">Value</span>
        <span className="w-14 text-right shrink-0">ROI</span>
        <span className="flex-1 text-right">Best book</span>
      </div>

      {/* Rows */}
      <div className="space-y-1">
        {visible.map((row, idx) => {
          const isOpen = expanded === row.name
          const vi     = row.valueIndex
          const color  = vi != null ? valueColor(vi) : '#8892a4'

          return (
            <div key={row.name}>
              <div
                onClick={() => setExpanded(isOpen ? null : row.name)}
                className={`flex items-center gap-3 bg-[var(--surface)] border rounded-lg px-4 py-2.5
                            cursor-pointer transition-colors select-none
                            ${isOpen
                              ? 'border-[var(--accent)]/60 rounded-b-none'
                              : 'border-[var(--border)] hover:border-[var(--accent)]/40'}`}
              >
                <span className="text-[var(--muted)] text-xs font-mono w-5 text-right shrink-0">
                  {idx + 1}
                </span>
                <span className="text-lg leading-none shrink-0">{flag(row.name)}</span>
                <span className="text-sm font-medium w-32 shrink-0 truncate">{row.name}</span>
                <span className="text-xs font-mono w-14 text-right shrink-0 text-[var(--text)]">
                  {fmt(row.modelProb)}
                </span>
                <span className="text-xs font-mono w-14 text-right shrink-0 text-[var(--muted)]">
                  {row.bestFairImplied != null ? fmt(row.bestFairImplied) : '—'}
                </span>
                <span className="text-sm font-mono font-semibold w-16 text-right shrink-0" style={{ color }}>
                  {vi != null ? (vi >= 0 ? '+' : '') + fmt(vi) : '—'}
                </span>
                <span className="text-xs font-mono w-14 text-right shrink-0" style={{ color }}>
                  {row.expectedRoi != null ? (row.expectedRoi >= 0 ? '+' : '') + row.expectedRoi.toFixed(1) + '%' : '—'}
                </span>
                <span className="flex-1 text-right text-xs text-[var(--muted)] truncate">
                  {row.bestBk ?? '—'}
                </span>
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

      {rows.length > 20 && (
        <button
          onClick={() => setShowAll(v => !v)}
          className="mt-4 w-full py-2.5 rounded-lg border border-[var(--border)] text-sm
                     text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--accent)]/50
                     transition-colors bg-[var(--surface)]"
        >
          {showAll ? '↑ Show fewer' : `↓ Show all ${rows.length} teams (${rows.length - 20} more)`}
        </button>
      )}
    </div>
  )
}
