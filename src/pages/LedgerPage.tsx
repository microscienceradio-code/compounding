import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { currentWeekStart, formatShortDate } from '../lib/dates'
import {
  CATEGORY_LABEL, CATEGORY_POINTS, CATEGORY_WEEKLY_CAP, type LedgerCategory,
} from '../types'
import type { LedgerEntry, WeeklyLedgerTotals } from '../types'

const categories: LedgerCategory[] = ['skill', 'asset', 'opportunity', 'positioning']

export default function LedgerPage() {
  const { user } = useAuth()
  const weekStart = currentWeekStart()
  const [entries, setEntries] = useState<LedgerEntry[]>([])
  const [totals, setTotals] = useState<WeeklyLedgerTotals | null>(null)
  const [category, setCategory] = useState<LedgerCategory>('skill')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!user) return
    const [{ data: entryRows }, { data: totalRow }] = await Promise.all([
      supabase
        .from('ledger_entries')
        .select('*')
        .eq('user_id', user.id)
        .eq('week_start', weekStart)
        .order('created_at', { ascending: false }),
      supabase
        .from('weekly_ledger')
        .select('*')
        .eq('user_id', user.id)
        .eq('week_start', weekStart)
        .maybeSingle(),
    ])
    setEntries((entryRows as LedgerEntry[]) ?? [])
    setTotals((totalRow as WeeklyLedgerTotals) ?? null)
  }, [user, weekStart])

  useEffect(() => {
    load()
  }, [load])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!user || !description.trim()) return
    setBusy(true)
    setError(null)
    try {
      const { error } = await supabase.from('ledger_entries').insert({
        user_id: user.id,
        week_start: weekStart,
        category,
        description: description.trim(),
        points: CATEGORY_POINTS[category],
      })
      if (error) throw error
      setDescription('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add entry')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(id: string) {
    await supabase.from('ledger_entries').delete().eq('id', id)
    await load()
  }

  const subtotalFor = (c: LedgerCategory) =>
    (totals?.[`${c}_subtotal` as keyof WeeklyLedgerTotals] as number | null) ?? 0

  return (
    <div className="max-w-md space-y-6">
      <div>
        <h1 className="text-2xl">Optionality ledger</h1>
        <p className="text-paper-300 text-sm">Week of {formatShortDate(weekStart)}</p>
      </div>

      <div className="card">
        <div className="flex items-baseline justify-between mb-3">
          <span className="text-paper-300">O_week</span>
          <span className="stat-number text-3xl text-moss-400">{totals?.o_week ?? 0}<span className="text-base text-paper-300">/100</span></span>
        </div>
        <div className="space-y-2">
          {categories.map((c) => {
            const val = subtotalFor(c)
            const cap = CATEGORY_WEEKLY_CAP[c]
            return (
              <div key={c}>
                <div className="flex justify-between text-sm mb-0.5">
                  <span>{CATEGORY_LABEL[c]}</span>
                  <span className="stat-number text-paper-300">{val}/{cap}</span>
                </div>
                <div className="w-full bg-ink-700 rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full ${val >= cap ? 'bg-ember-500' : 'bg-moss-500'}`}
                    style={{ width: `${Math.min(100, (val / cap) * 100)}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <form onSubmit={handleAdd} className="card space-y-3">
        <h2 className="text-lg">Add entry</h2>
        <div className="flex gap-2 flex-wrap">
          {categories.map((c) => (
            <button
              type="button"
              key={c}
              onClick={() => setCategory(c)}
              className={`px-3 py-1.5 rounded text-sm ${
                category === c ? 'bg-moss-600 text-paper-100' : 'bg-ink-700 text-paper-300'
              }`}
            >
              {CATEGORY_LABEL[c]} · {CATEGORY_POINTS[c]}pt
            </button>
          ))}
        </div>
        <input
          className="w-full"
          placeholder="What did you do?"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        {error && <p className="text-rose-500 text-sm">{error}</p>}
        <button type="submit" disabled={busy || !description.trim()} className="btn-primary w-full">
          {busy ? 'Adding…' : 'Add entry'}
        </button>
      </form>

      <div className="space-y-2">
        <h2 className="text-lg">This week’s entries</h2>
        {entries.length === 0 && <p className="text-paper-300 text-sm">Nothing logged yet this week.</p>}
        {entries.map((e) => (
          <div key={e.id} className="card flex items-center justify-between py-3">
            <div>
              <p className="text-sm text-paper-300">{CATEGORY_LABEL[e.category]} · +{e.points}</p>
              <p>{e.description}</p>
            </div>
            <button
              onClick={() => handleDelete(e.id)}
              className="text-paper-300 hover:text-rose-500 text-sm px-2"
              aria-label="Delete entry"
            >
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
