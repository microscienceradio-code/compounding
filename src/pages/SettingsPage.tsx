import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { useLocalReminder } from '../hooks/useLocalReminder'
import { toCsv, downloadCsv } from '../lib/csv'
import { DEFAULT_SCORING_WEIGHTS, type ScoringSettings } from '../types'

export default function SettingsPage() {
  const { user, profile, refreshProfile, signOut } = useAuth()
  const navigate = useNavigate()
  const { reminderTime, setReminderTime, permission, requestPermission } = useLocalReminder(true)
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '')
  const [flagship, setFlagship] = useState(profile?.flagship_priority ?? '')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState<'logs' | 'ledger' | null>(null)
  const [weights, setWeights] = useState(DEFAULT_SCORING_WEIGHTS)
  const [weightsEnabled, setWeightsEnabled] = useState(false)
  const [weightsSaving, setWeightsSaving] = useState(false)
  const [weightsSaved, setWeightsSaved] = useState(false)
  const [weightsError, setWeightsError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    supabase
      .from('scoring_settings')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        const row = data as ScoringSettings | null
        if (row) {
          setWeightsEnabled(row.enabled)
          setWeights({
            e_weight: row.e_weight,
            a_weight: row.a_weight,
            s_weight: row.s_weight,
            g_weight: row.g_weight,
            o_weight: row.o_weight,
          })
        }
      })
  }, [user])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    setBusy(true)
    setError(null)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ display_name: displayName.trim(), flagship_priority: flagship.trim() || null })
        .eq('id', user.id)
      if (error) throw error
      await refreshProfile()
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  async function exportLogs() {
    if (!user) return
    setExporting('logs')
    try {
      const { data, error } = await supabase
        .from('daily_logs')
        .select('log_date,dwu,sleep_hours,moved,shipped,shipped_note,floor_mode')
        .eq('user_id', user.id)
        .order('log_date', { ascending: true })
      if (error) throw error
      const csv = toCsv(data ?? [], ['log_date', 'dwu', 'sleep_hours', 'moved', 'shipped', 'shipped_note', 'floor_mode'])
      downloadCsv(`daily-logs-${new Date().toISOString().slice(0, 10)}.csv`, csv)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not export logs')
    } finally {
      setExporting(null)
    }
  }

  async function exportLedger() {
    if (!user) return
    setExporting('ledger')
    try {
      const { data, error } = await supabase
        .from('ledger_entries')
        .select('week_start,category,description,points,created_at')
        .eq('user_id', user.id)
        .order('week_start', { ascending: true })
      if (error) throw error
      const csv = toCsv(data ?? [], ['week_start', 'category', 'description', 'points', 'created_at'])
      downloadCsv(`ledger-entries-${new Date().toISOString().slice(0, 10)}.csv`, csv)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not export ledger')
    } finally {
      setExporting(null)
    }
  }

  async function saveWeights(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    const sum = weights.e_weight + weights.a_weight + weights.s_weight
    if (Math.abs(sum - 1) > 0.01) {
      setWeightsError(`G_day weights must add up to 1.0 (currently ${sum.toFixed(2)}).`)
      return
    }
    const wcsSum = weights.g_weight + weights.o_weight
    if (Math.abs(wcsSum - 1) > 0.01) {
      setWeightsError(`WCS weights must add up to 1.0 (currently ${wcsSum.toFixed(2)}).`)
      return
    }
    setWeightsSaving(true)
    setWeightsError(null)
    try {
      const { error } = await supabase.from('scoring_settings').upsert(
        { user_id: user.id, enabled: weightsEnabled, ...weights, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      )
      if (error) throw error
      setWeightsSaved(true)
      setTimeout(() => setWeightsSaved(false), 2000)
    } catch (err) {
      setWeightsError(err instanceof Error ? err.message : 'Could not save')
    } finally {
      setWeightsSaving(false)
    }
  }

  async function handleDeleteData() {
    if (!user) return
    setBusy(true)
    try {
      // Deletes cascade from profiles via FK on delete cascade, but we don't
      // have permission to delete the auth.users row from the client (no
      // service role key here by design). We remove all app data the user
      // owns directly, then sign out. To fully remove the login itself,
      // note in-app that they should contact support or delete via Supabase.
      await Promise.all([
        supabase.from('daily_logs').delete().eq('user_id', user.id),
        supabase.from('ledger_entries').delete().eq('user_id', user.id),
        supabase.from('sprint_targets').delete().eq('user_id', user.id),
        supabase
          .from('partnerships')
          .delete()
          .or(`requester_id.eq.${user.id},partner_id.eq.${user.id}`),
      ])
      await signOut()
      navigate('/login')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete data')
      setBusy(false)
    }
  }

  return (
    <div className="max-w-md space-y-6">
      <h1 className="text-2xl">Settings</h1>

      <form onSubmit={handleSave} className="card space-y-4">
        <div>
          <label className="field-label" htmlFor="name">Display name</label>
          <input id="name" className="w-full" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </div>
        <div>
          <label className="field-label" htmlFor="flagship">Flagship priority</label>
          <input id="flagship" className="w-full" value={flagship} onChange={(e) => setFlagship(e.target.value)} />
        </div>
        {error && <p className="text-rose-500 text-sm">{error}</p>}
        {saved && <p className="text-moss-400 text-sm">Saved.</p>}
        <button type="submit" disabled={busy} className="btn-primary w-full">
          {busy ? 'Saving…' : 'Save changes'}
        </button>
      </form>

      <div className="card">
        <p className="text-paper-300 text-sm mb-2">Signed in as {user?.email}</p>
        <button onClick={() => signOut()} className="btn-secondary w-full">
          Sign out
        </button>
      </div>

      <div className="card space-y-3">
        <h2 className="text-lg">Evening reminder</h2>
        <p className="text-sm text-paper-300">
          A browser notification while this app is open in a tab — not a true push notification, since
          that needs a backend this project doesn't have. It won't fire if every tab is closed.
        </p>
        {permission !== 'granted' && (
          <button onClick={requestPermission} className="btn-secondary w-full">
            Enable browser notifications
          </button>
        )}
        {permission === 'granted' && (
          <div className="flex items-center gap-2">
            <label className="field-label mb-0 flex-1" htmlFor="reminder-time">Remind me at</label>
            <input
              id="reminder-time"
              type="time"
              value={reminderTime}
              onChange={(e) => setReminderTime(e.target.value)}
              className="w-32"
            />
            {reminderTime && (
              <button onClick={() => setReminderTime('')} className="text-sm text-paper-300 hover:text-rose-500">
                Off
              </button>
            )}
          </div>
        )}
        {permission === 'denied' && (
          <p className="text-xs text-rose-500">
            Notifications are blocked for this site in your browser settings — re-enable them there to use this.
          </p>
        )}
      </div>

      <div className="card space-y-3">
        <h2 className="text-lg">Export</h2>
        <p className="text-sm text-paper-300">Download your raw data as CSV — handy for your own backups or analysis.</p>
        <div className="flex gap-2">
          <button onClick={exportLogs} disabled={exporting !== null} className="btn-secondary flex-1">
            {exporting === 'logs' ? 'Exporting…' : 'Daily logs (.csv)'}
          </button>
          <button onClick={exportLedger} disabled={exporting !== null} className="btn-secondary flex-1">
            {exporting === 'ledger' ? 'Exporting…' : 'Ledger (.csv)'}
          </button>
        </div>
      </div>

      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg">Advanced: scoring weights</h2>
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input type="checkbox" checked={weightsEnabled} onChange={(e) => setWeightsEnabled(e.target.checked)} />
            Custom
          </label>
        </div>
        <p className="text-sm text-paper-300">
          Off by default — everyone gets the standard weights (0.55 / 0.20 / 0.25 for G_day, 0.60 / 0.40
          for WCS). Turning this on lets you re-balance what your own score rewards. Each group must
          still add up to 1.0.
        </p>

        {weightsEnabled && (
          <form onSubmit={saveWeights} className="space-y-4">
            <div>
              <p className="text-sm text-paper-300 mb-2">G_day: Execution / Anchors / Shipped</p>
              <div className="grid grid-cols-3 gap-2">
                {(['e_weight', 'a_weight', 's_weight'] as const).map((k) => (
                  <input
                    key={k}
                    type="number"
                    step="0.05"
                    min={0}
                    max={1}
                    value={weights[k]}
                    onChange={(e) => setWeights((w) => ({ ...w, [k]: Number(e.target.value) }))}
                  />
                ))}
              </div>
            </div>
            <div>
              <p className="text-sm text-paper-300 mb-2">WCS: G_day average / O_week</p>
              <div className="grid grid-cols-2 gap-2">
                {(['g_weight', 'o_weight'] as const).map((k) => (
                  <input
                    key={k}
                    type="number"
                    step="0.05"
                    min={0}
                    max={1}
                    value={weights[k]}
                    onChange={(e) => setWeights((w) => ({ ...w, [k]: Number(e.target.value) }))}
                  />
                ))}
              </div>
            </div>
            {weightsError && <p className="text-rose-500 text-sm">{weightsError}</p>}
            {weightsSaved && <p className="text-moss-400 text-sm">Saved.</p>}
            <button type="submit" disabled={weightsSaving} className="btn-secondary w-full">
              {weightsSaving ? 'Saving…' : 'Save weights'}
            </button>
          </form>
        )}
        {!weightsEnabled && (
          <button onClick={saveWeights} disabled={weightsSaving} className="btn-secondary w-full">
            {weightsSaving ? 'Saving…' : 'Save (use standard weights)'}
          </button>
        )}
      </div>

      <div className="card border-rose-500/30 space-y-3">
        <h2 className="text-lg text-rose-500">Delete account data</h2>
        <p className="text-sm text-paper-300">
          Permanently removes your daily logs, ledger entries, sprint targets, and partnerships. This
          cannot be undone.
        </p>
        {!confirmDelete ? (
          <button onClick={() => setConfirmDelete(true)} className="btn-secondary w-full border-rose-500/50 text-rose-500">
            Delete my data
          </button>
        ) : (
          <div className="flex gap-2">
            <button onClick={() => setConfirmDelete(false)} className="btn-secondary flex-1">
              Cancel
            </button>
            <button onClick={handleDeleteData} disabled={busy} className="btn-primary flex-1 bg-rose-500 hover:bg-rose-500/80">
              {busy ? 'Deleting…' : 'Confirm delete'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
