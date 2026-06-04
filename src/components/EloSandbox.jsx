import { useState, useMemo } from 'react'
import { matchProbs } from '../utils/elo'
import { flag } from '../utils/flags'

function ProbRow({ label, prob, color, max }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-[var(--muted)] w-28 shrink-0">{label}</span>
      <div className="flex-1 bg-[var(--border)]/40 rounded-full h-2.5 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-150"
          style={{ width: `${(prob / max) * 100}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-sm font-mono font-bold w-12 text-right shrink-0" style={{ color }}>
        {(prob * 100).toFixed(1)}%
      </span>
    </div>
  )
}

function TeamPanel({ label, teamName, baseElo, adjust, onTeamChange, onAdjust, allTeams }) {
  const adjustedElo = Math.round((baseElo ?? 1500) + adjust)
  const sign = adjust > 0 ? '+' : ''

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 flex flex-col gap-3">
      <div className="text-[10px] font-semibold text-[var(--muted)] uppercase tracking-wider">{label}</div>

      {/* Team select */}
      <div className="relative">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-base pointer-events-none leading-none">
          {flag(teamName)}
        </span>
        <select
          value={teamName}
          onChange={e => { onTeamChange(e.target.value); onAdjust(0) }}
          className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-md pl-9 pr-3 py-2
                     text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]
                     appearance-none cursor-pointer transition-colors"
        >
          {allTeams.map(t => (
            <option key={t.name} value={t.name}>{t.name}</option>
          ))}
        </select>
      </div>

      {/* Elo slider */}
      <div>
        <div className="flex justify-between mb-1.5">
          <span className="text-[11px] text-[var(--muted)]">Elo adjustment</span>
          <span className="text-[11px] font-mono text-[var(--accent)]">
            {sign}{adjust} &rarr; <strong>{adjustedElo}</strong>
          </span>
        </div>
        <input
          type="range" min={-300} max={300} step={10} value={adjust}
          onChange={e => onAdjust(Number(e.target.value))}
          className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
          style={{ accentColor: 'var(--accent)' }}
        />
        <div className="flex justify-between text-[10px] text-[var(--muted)] mt-0.5">
          <span>−300</span>
          <span>base {Math.round(baseElo ?? 1500)}</span>
          <span>+300</span>
        </div>
      </div>

      {adjust !== 0 && (
        <button
          onClick={() => onAdjust(0)}
          className="text-[11px] text-[var(--muted)] hover:text-[var(--text)] transition-colors text-left"
        >
          Reset
        </button>
      )}
    </div>
  )
}

export default function EloSandbox({ teams }) {
  const sorted = useMemo(() => [...teams].sort((a, b) => a.name.localeCompare(b.name)), [teams])

  const [nameA, setNameA] = useState('Spain')
  const [nameB, setNameB] = useState('France')
  const [adjA, setAdjA] = useState(0)
  const [adjB, setAdjB] = useState(0)

  const dataA = teams.find(t => t.name === nameA) ?? { elo: 1500 }
  const dataB = teams.find(t => t.name === nameB) ?? { elo: 1500 }
  const eloA = Math.round(dataA.elo + adjA)
  const eloB = Math.round(dataB.elo + adjB)

  const probs = useMemo(() => matchProbs(eloA, eloB), [eloA, eloB])
  const maxProb = Math.max(probs.homeWin, probs.draw, probs.awayWin)

  const swap = () => {
    const [pA, pB] = [nameA, nameB]
    const [dA, dB] = [adjA, adjB]
    setNameA(pB); setAdjA(dB)
    setNameB(pA); setAdjB(dA)
  }

  return (
    <div className="max-w-2xl">
      <p className="text-[var(--muted)] text-sm mb-6">
        Adjust Elo ratings to see live probability shifts — recalculated with the same
        Dixon-Coles/Poisson model used in the simulation. ±300 Elo is roughly the gap
        between a top-5 and a bottom-10 team.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <TeamPanel
          label="Team A (Home)" teamName={nameA} baseElo={dataA.elo} adjust={adjA}
          onTeamChange={setNameA} onAdjust={setAdjA} allTeams={sorted}
        />
        <TeamPanel
          label="Team B (Away)" teamName={nameB} baseElo={dataB.elo} adjust={adjB}
          onTeamChange={setNameB} onAdjust={setAdjB} allTeams={sorted}
        />
      </div>

      {/* Result card */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
        {/* Header */}
        <div className="flex items-center mb-6">
          <div className="flex-1 text-center">
            <div className="text-2xl mb-1">{flag(nameA)}</div>
            <div className="text-sm font-semibold">{nameA}</div>
            <div className="text-[11px] font-mono text-[var(--muted)] mt-0.5">Elo {eloA}</div>
          </div>
          <button
            onClick={swap}
            className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-[var(--muted)]
                       hover:text-[var(--text)] hover:border-[var(--accent)]/50 transition-colors
                       text-xs font-mono mx-2"
            title="Swap teams"
          >
            ⇄
          </button>
          <div className="flex-1 text-center">
            <div className="text-2xl mb-1">{flag(nameB)}</div>
            <div className="text-sm font-semibold">{nameB}</div>
            <div className="text-[11px] font-mono text-[var(--muted)] mt-0.5">Elo {eloB}</div>
          </div>
        </div>

        {/* Probability bars */}
        <div className="space-y-3 mb-4">
          <ProbRow label={`${nameA} wins`} prob={probs.homeWin} color="#4f8ef7" max={maxProb} />
          <ProbRow label="Draw"            prob={probs.draw}    color="#8892a4" max={maxProb} />
          <ProbRow label={`${nameB} wins`} prob={probs.awayWin} color="#3ecf6e" max={maxProb} />
        </div>

        {/* Stacked bar */}
        <div className="flex h-2 rounded-full overflow-hidden">
          <div className="rounded-l-full transition-all duration-150"
               style={{ width: `${probs.homeWin * 100}%`, background: '#4f8ef7' }} />
          <div className="transition-all duration-150"
               style={{ width: `${probs.draw * 100}%`, background: '#8892a4' }} />
          <div className="rounded-r-full transition-all duration-150"
               style={{ width: `${probs.awayWin * 100}%`, background: '#3ecf6e' }} />
        </div>

        {/* Elo diff note */}
        <p className="text-[10px] text-[var(--muted)] mt-3 text-center">
          Elo gap: {eloA > eloB ? '+' : ''}{eloA - eloB} · neutral venue · Dixon-Coles ρ=−0.1
        </p>
      </div>
    </div>
  )
}
