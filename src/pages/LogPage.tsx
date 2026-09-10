import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { todayString } from '../lib/dates'
import type { DailyLog } from '../types'

const empty = {
  dwu: 0,
  sleep_hours: '',
  moved: false,
  shipped: false,
  shipped_note: '',
  floor_mode: false,
}

export default function LogPage() {
  const { user } = useAuth()
  const [logDate, setLogDate] = useState(todayString())
  const [form, setForm] = useState(empty)
  const [existing, setExisting] = useState<DailyLog | null>(null)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    setSaved(false)
    setError(null)
    supabase
      .from('daily_logs')
      .select('*')
      .eq('user_id', user.id)
      .eq('log_date', logDate)
      .maybeSingle()
      .then(({ data }) => {
        const row = data as DailyLog | null
        setExisting(row)
        setForm(
          row
            ? {
                dwu: row.dwu,
                sleep_hours: row.sleep_hours?.toString() ?? '',
                moved: row.moved,
                shipped: row.shipped,
                shipped_note: row.shipped_note ?? '',
                floor_mode: row.floor_mode,
              }
            : empty
        )
      })
  }, [user, logDate])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    if (form.shipped && !form.shipped_note.trim()) {
      setError('Add a one-line note on what shipped.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const payload = {
        user_id: user.id,
        log_date: logDate,
        dwu: form.dwu,
        sleep_hours: form.sleep_hours === '' ? null : Number(form.sleep_hours),
        moved: form.moved,
        shipped: form.shipped,
        shipped_note: form.shipped ? form.shipped_note.trim() : null,
        floor_mode: form.floor_mode,
      }
      const { error } = await supabase.from('daily_logs').upsert(payload, { onConflict: 'user_id,log_date' })
      if (error) throw error
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-md space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl">Daily pulse</h1>
        <input
          type="date"
          max={todayString()}
          value={logDate}
          onChange={(e) => setLogDate(e.target.value)}
          className="text-sm"
        />
      </div>
      {existing && <p className="text-xs text-paper-300">Editing an existing entry for this date.</p>}

      <form onSubmit={handleSubmit} className="card space-y-5">
        <div>
          <label className="field-label">Deep Work Units (90-min blocks on your flagship priority)</label>
          <div className="flex gap-2">
            {[0, 1, 2, 3, 4, 5, 6].map((n) => (
              <button
                type="button"
                key={n}
                onClick={() => setForm((f) => ({ ...f, dwu: n }))}
                className={`w-10 h-10 rounded font-mono text-sm ${
                  form.dwu === n ? 'bg-moss-600 text-paper-100' : 'bg-ink-700 text-paper-300'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <p className="text-xs text-paper-300 mt-1">Scoring caps at 4; raw count is still stored.</p>
        </div>

        <div>
          <label className="field-label" htmlFor="sleep">Sleep (hours)</label>
          <input
            id="sleep"
            type="number"
            step="0.25"
            min={0}
            max={24}
            className="w-full"
            value={form.sleep_hours}
            onChange={(e) => setForm((f) => ({ ...f, sleep_hours: e.target.value }))}
          />
        </div>

        <label className="flex items-center justify-between cursor-pointer">
          <span>Moved 20+ minutes</span>
          <input
            type="checkbox"
            checked={form.moved}
            onChange={(e) => setForm((f) => ({ ...f, moved: e.target.checked }))}
          />
        </label>

        <label className="flex items-center justify-between cursor-pointer">
          <span>Shipped something tangible</span>
          <input
            type="checkbox"
            checked={form.shipped}
            onChange={(e) => setForm((f) => ({ ...f, shipped: e.target.checked }))}
          />
        </label>

        {form.shipped && (
          <div>
            <label className="field-label" htmlFor="note">What shipped?</label>
            <input
              id="note"
              className="w-full"
              value={form.shipped_note}
              onChange={(e) => setForm((f) => ({ ...f, shipped_note: e.target.value }))}
              placeholder="One line is enough"
            />
          </div>
        )}

        <label className="flex items-center justify-between cursor-pointer border-t border-ink-700 pt-4">
          <span>
            Floor mode
            <span className="block text-xs text-paper-300">Sick, travel, etc. Kept off the rolling average.</span>
          </span>
          <input
            type="checkbox"
            checked={form.floor_mode}
            onChange={(e) => setForm((f) => ({ ...f, floor_mode: e.target.checked }))}
          />
        </label>

        {error && <p className="text-rose-500 text-sm">{error}</p>}
        {saved && <p className="text-moss-400 text-sm">Saved.</p>}

        <button type="submit" disabled={busy} className="btn-primary w-full">
          {busy ? 'Saving…' : existing ? 'Update log' : 'Save log'}
        </button>
      </form>
    </div>
  )
}
