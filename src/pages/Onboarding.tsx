import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'

export default function Onboarding() {
  const { user, profile, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '')
  const [flagship, setFlagship] = useState(profile?.flagship_priority ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      navigate('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <h1 className="text-3xl mb-2">Set up your profile</h1>
        <p className="text-paper-300 mb-8">
          Four starter sprint targets are already waiting for you on the Targets page — edit or
          replace them any time.
        </p>

        <form onSubmit={handleSave} className="card space-y-4">
          <div>
            <label className="field-label" htmlFor="name">Display name</label>
            <input
              id="name"
              required
              className="w-full"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="What your accountability partner will see"
            />
          </div>
          <div>
            <label className="field-label" htmlFor="flagship">Flagship priority</label>
            <input
              id="flagship"
              className="w-full"
              value={flagship}
              onChange={(e) => setFlagship(e.target.value)}
              placeholder="The one thing your Deep Work Units count toward"
            />
          </div>

          {error && <p className="text-rose-500 text-sm">{error}</p>}

          <button type="submit" disabled={busy || !displayName.trim()} className="btn-primary w-full">
            {busy ? 'Saving…' : 'Continue'}
          </button>
        </form>

        <p className="text-sm text-paper-300 mt-4">
          Want an accountability partner? You can invite one any time from the Partner tab.
        </p>
      </div>
    </div>
  )
}
