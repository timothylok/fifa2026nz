import { useEffect, useState } from 'react'
import ChampionshipOdds from './components/ChampionshipOdds'
import GroupStage from './components/GroupStage'
import Bracket from './components/Bracket'
import EloSandbox from './components/EloSandbox'
import Predict from './components/Predict'

const TABS = [
  { id: 'odds',    label: 'Championship' },
  { id: 'groups',  label: 'Groups' },
  { id: 'bracket', label: 'Bracket' },
  { id: 'sandbox', label: 'Elo Sandbox' },
  { id: 'predict', label: 'Predict' },
]

export default function App() {
  const [data, setData]  = useState(null)
  const [error, setError] = useState(null)
  const [tab, setTab]    = useState('odds')

  useEffect(() => {
    fetch('/data/results.json')
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(setData)
      .catch(e => setError(e.message))
  }, [])

  if (error) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center p-8">
        <div className="text-4xl mb-4">⚠️</div>
        <p className="text-red-400 font-mono text-sm mb-2">Failed to load results.json</p>
        <p className="text-[var(--muted)] text-xs">{error}</p>
        <p className="text-[var(--muted)] text-xs mt-4">
          Run <code className="bg-[var(--surface)] px-2 py-0.5 rounded">python run.py --sims 10000</code> first.
        </p>
      </div>
    </div>
  )

  if (!data) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="text-3xl mb-3 animate-spin inline-block">⚽</div>
        <p className="text-[var(--muted)] text-sm">Loading simulation data…</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen">
      <header className="border-b border-[var(--border)] bg-[var(--surface)] sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 pt-4 pb-0 flex items-start justify-between gap-4 flex-wrap">
          <div className="pb-1">
            <h1 className="text-xl font-bold tracking-tight">⚽ FIFA 2026</h1>
            <p className="text-[var(--muted)] text-xs mt-0.5">
              {data.n_simulations.toLocaleString()} Monte-Carlo sims · Elo + Dixon-Coles/Poisson
            </p>
          </div>
          <div className="text-right text-[10px] text-[var(--muted)] pb-1">
            <div>Updated</div>
            <div className="font-mono">{new Date(data.generated_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-5xl mx-auto px-6 flex gap-0 overflow-x-auto">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                tab === t.id
                  ? 'border-[var(--accent)] text-[var(--accent)]'
                  : 'border-transparent text-[var(--muted)] hover:text-[var(--text)]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {tab === 'odds'    && <ChampionshipOdds teams={data.teams} groupMatchProbs={data.group_match_probs} />}
        {tab === 'groups'  && <GroupStage groupMatchProbs={data.group_match_probs} teams={data.teams} />}
        {tab === 'bracket' && <Bracket teams={data.teams} groupMatchProbs={data.group_match_probs} />}
        {tab === 'sandbox' && <EloSandbox teams={data.teams} />}
        {tab === 'predict' && <Predict teams={data.teams} groupMatchProbs={data.group_match_probs} />}
      </main>
    </div>
  )
}
