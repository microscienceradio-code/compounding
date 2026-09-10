import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { todayString } from '../lib/dates'
import { useAuth } from '../hooks/useAuth'

export default function QuickLogCard({ onLogged }: { onLogged: () => void }) {
  const { user } = useAuth()
  const [dwu, setDwu] = useState(0)
  const [sleepHours, setSleepHours] = useState('')
  const [moved, setMoved] = useState(false)
  const [shipped, setShipped] = useState(false)
  const [shippedNote, setShippedNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    if (shipped && !shippedNote.trim()) {
      setError('Add a one-line note on what shipped.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const { error } = await supabase.from('daily_logs').insert({
        user_id: user.id,
        log_date: todayString(),
        dwu,
        sleep_hours: sleepHours === '' ? null : Number(sleepHours),
        moved,
        shipped,
        shipped_note: shipped ? shippedNote.trim() : null,
        floor_mode: false,
      })
      if (error) throw error
      onLogged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save today’s log')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-4">
      <h2 className="text-lg">Log today</h2>

      <div className="flex items-center justify-between">
        <label className="field-label mb-0" htmlFor="dwu">Deep Work Units</label>
        <div className="flex gap-1">
          {[0, 1, 2, 3, 4].map((n) => (
            <button
              type="button"
              key={n}
              onClick={() => setDwu(n)}
              className={`w-9 h-9 rounded text-sm font-mono ${
                dwu === n ? 'bg-moss-600 text-paper-100' : 'bg-ink-700 text-paper-300'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <label className="field-label mb-0" htmlFor="sleep">Sleep (hrs)</label>
        <input
          id="sleep"
          type="number"
          step="0.5"
          min={0}
          max={24}
          className="w-24 text-right"
          value={sleepHours}
          onChange={(e) => setSleepHours(e.target.value)}
        />
      </div>

      <label className="flex items-center justify-between cursor-pointer">
        <span>Moved 20+ min</span>
        <input type="checkbox" checked={moved} onChange={(e) => setMoved(e.target.checked)} />
      </label>

      <label className="flex items-center justify-between cursor-pointer">
        <span>Shipped something</span>
        <input type="checkbox" checked={shipped} onChange={(e) => setShipped(e.target.checked)} />
      </label>

      {shipped && (
        <input
          className="w-full"
          placeholder="What shipped? (one line)"
          value={shippedNote}
          onChange={(e) => setShippedNote(e.target.value)}
        />
      )}

      {error && <p className="text-rose-500 text-sm">{error}</p>}

      <button type="submit" disabled={busy} className="btn-primary w-full">
        {busy ? 'Saving…' : 'Save today’s log'}
      </button>
    </form>
  )
}
