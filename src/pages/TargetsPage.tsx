import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import type { SprintTarget } from '../types'

export default function TargetsPage() {
  const { user } = useAuth()
  const [targets, setTargets] = useState<SprintTarget[]>([])
  const [newDescription, setNewDescription] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!user) return
    const { data } = await supabase
      .from('sprint_targets')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
    setTargets((data as SprintTarget[]) ?? [])
  }, [user])

  useEffect(() => {
    load()
  }, [load])

  async function toggle(t: SprintTarget) {
    setTargets((prev) => prev.map((x) => (x.id === t.id ? { ...x, completed: !x.completed } : x)))
    await supabase.from('sprint_targets').update({ completed: !t.completed }).eq('id', t.id)
  }

  async function addTarget(e: React.FormEvent) {
    e.preventDefault()
    if (!user || !newDescription.trim()) return
    setBusy(true)
    const { error } = await supabase
      .from('sprint_targets')
      .insert({ user_id: user.id, description: newDescription.trim(), completed: false })
    setBusy(false)
    if (!error) {
      setNewDescription('')
      await load()
    }
  }

  async function updateDescription(t: SprintTarget, description: string) {
    setTargets((prev) => prev.map((x) => (x.id === t.id ? { ...x, description } : x)))
  }

  async function saveDescription(t: SprintTarget) {
    await supabase.from('sprint_targets').update({ description: t.description }).eq('id', t.id)
  }

  async function remove(id: string) {
    setTargets((prev) => prev.filter((x) => x.id !== id))
    await supabase.from('sprint_targets').delete().eq('id', id)
  }

  const complete = targets.filter((t) => t.completed).length

  return (
    <div className="max-w-md space-y-6">
      <div>
        <h1 className="text-2xl">Sprint targets</h1>
        <p className="text-paper-300 text-sm">{complete}/{targets.length} complete</p>
        <div className="w-full bg-ink-700 rounded-full h-2 mt-2">
          <div
            className="bg-moss-500 h-2 rounded-full transition-all"
            style={{ width: `${targets.length ? (complete / targets.length) * 100 : 0}%` }}
          />
        </div>
      </div>

      <div className="space-y-2">
        {targets.map((t) => (
          <div key={t.id} className="card flex items-center gap-3 py-3">
            <input type="checkbox" checked={t.completed} onChange={() => toggle(t)} />
            <input
              className={`flex-1 bg-transparent border-none px-0 ${t.completed ? 'line-through text-paper-300' : ''}`}
              value={t.description}
              onChange={(e) => updateDescription(t, e.target.value)}
              onBlur={() => saveDescription(t)}
            />
            <button
              onClick={() => remove(t.id)}
              className="text-paper-300 hover:text-rose-500 text-sm"
              aria-label="Remove target"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <form onSubmit={addTarget} className="card flex gap-2">
        <input
          className="flex-1"
          placeholder="Add a new sprint target"
          value={newDescription}
          onChange={(e) => setNewDescription(e.target.value)}
        />
        <button type="submit" disabled={busy || !newDescription.trim()} className="btn-secondary">
          Add
        </button>
      </form>
    </div>
  )
}
