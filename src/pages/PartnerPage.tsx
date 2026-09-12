import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { formatShortDate } from '../lib/dates'
import type { Partnership, PartnerSummaryRow, PartnerMessage, ShareLevel } from '../types'

interface PartnershipView extends Partnership {
  otherName: string | null
}

export default function PartnerPage() {
  const { user } = useAuth()
  const [partnerships, setPartnerships] = useState<PartnershipView[]>([])
  const [redeemCode, setRedeemCode] = useState('')
  const [generatedCode, setGeneratedCode] = useState<string | null>(null)
  const [summary, setSummary] = useState<PartnerSummaryRow[]>([])
  const [messages, setMessages] = useState<PartnerMessage[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [sendingMessage, setSendingMessage] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!user) return
    const { data, error: partnershipsError } = await supabase
      .from('partnerships')
      .select('*')
      .or(`requester_id.eq.${user.id},partner_id.eq.${user.id}`)
      .order('created_at', { ascending: false })

    if (partnershipsError) {
      console.error('partnerships select failed:', partnershipsError)
      setError(`Could not load partnerships: ${partnershipsError.message}`)
      return
    }

    const rows = (data as Partnership[]) ?? []
    const withNames: PartnershipView[] = await Promise.all(
      rows.map(async (p) => {
        if (!p.partner_id) return { ...p, otherName: null }
        const { data: name, error: nameError } = await supabase.rpc('get_partnership_display_name', {
          partnership_id: p.id,
        })
        if (nameError) console.error('get_partnership_display_name failed:', nameError)
        return { ...p, otherName: (name as string) ?? null }
      })
    )
    setPartnerships(withNames)

    const accepted = withNames.find((p) => p.status === 'accepted')
    if (accepted) {
      const otherId = accepted.requester_id === user.id ? accepted.partner_id : accepted.requester_id
      if (otherId) {
        const { data: summaryRows, error: summaryError } = await supabase.rpc('get_partner_summary', {
          target_user: otherId,
        })
        if (summaryError) {
          console.error('get_partner_summary failed:', summaryError)
          setError(`Could not load partner summary: ${summaryError.message}`)
        }
        setSummary((summaryRows as PartnerSummaryRow[]) ?? [])
      }
      const { data: messageRows, error: messagesError } = await supabase
        .from('partner_messages')
        .select('*')
        .eq('partnership_id', accepted.id)
        .order('created_at', { ascending: true })
        .limit(50)
      if (messagesError) console.error('partner_messages select failed:', messagesError)
      setMessages((messageRows as PartnerMessage[]) ?? [])
    } else {
      setSummary([])
      setMessages([])
    }
  }, [user])

  useEffect(() => {
    load()
  }, [load])

  async function handleGenerate() {
    setBusy(true)
    setError(null)
    try {
      const { data, error } = await supabase.rpc('create_partner_invite')
      if (error) throw error
      setGeneratedCode(data?.[0]?.invite_code ?? null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate invite')
    } finally {
      setBusy(false)
    }
  }

  async function handleRedeem(e: React.FormEvent) {
    e.preventDefault()
    if (!redeemCode.trim()) return
    setBusy(true)
    setError(null)
    setInfo(null)
    try {
      const { error } = await supabase.rpc('redeem_partner_invite', { code: redeemCode.trim() })
      if (error) throw error
      setRedeemCode('')
      setInfo('Code redeemed — waiting on acceptance.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not redeem code')
    } finally {
      setBusy(false)
    }
  }

  async function updateStatus(id: string, status: 'accepted' | 'declined') {
    await supabase.from('partnerships').update({ status }).eq('id', id)
    await load()
  }

  async function updateShareLevel(id: string, share_level: ShareLevel) {
    await supabase.from('partnerships').update({ share_level }).eq('id', id)
    await load()
  }

  async function sendMessage(e: React.FormEvent, partnershipId: string) {
    e.preventDefault()
    if (!user || !newMessage.trim()) return
    setSendingMessage(true)
    try {
      const { error } = await supabase.from('partner_messages').insert({
        partnership_id: partnershipId,
        sender_id: user.id,
        body: newMessage.trim(),
      })
      if (error) throw error
      setNewMessage('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send nudge')
    } finally {
      setSendingMessage(false)
    }
  }

  const accepted = partnerships.find((p) => p.status === 'accepted')
  const pending = partnerships.filter((p) => p.status === 'pending')

  return (
    <div className="max-w-md space-y-6">
      <h1 className="text-2xl">Accountability partner</h1>

      {error && <p className="text-rose-500 text-sm">{error}</p>}
      {info && <p className="text-moss-400 text-sm">{info}</p>}

      {accepted ? (
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg">{accepted.otherName ?? 'Your partner'}</h2>
            <button
              onClick={() => updateStatus(accepted.id, 'declined')}
              className="text-sm text-paper-300 hover:text-rose-500"
            >
              End partnership
            </button>
          </div>

          <div>
            <label className="field-label">Share level</label>
            <div className="flex gap-2">
              {(['summary_only', 'full_daily'] as ShareLevel[]).map((level) => (
                <button
                  key={level}
                  onClick={() => updateShareLevel(accepted.id, level)}
                  className={`px-3 py-1.5 rounded text-sm ${
                    accepted.share_level === level ? 'bg-moss-600 text-paper-100' : 'bg-ink-700 text-paper-300'
                  }`}
                >
                  {level === 'summary_only' ? 'Weekly summary only' : 'Full daily detail'}
                </button>
              ))}
            </div>
            <p className="text-xs text-paper-300 mt-1">
              This controls what your partner can see of your data — not the other way around.
            </p>
          </div>

          <div>
            <h3 className="text-sm text-paper-300 mb-2">Their weekly scores</h3>
            {summary.length === 0 ? (
              <p className="text-sm text-paper-300">No data shared yet.</p>
            ) : (
              <div className="space-y-1">
                {summary.slice(0, 6).map((s) => (
                  <div key={s.week_start} className="flex justify-between text-sm">
                    <span className="text-paper-300">{formatShortDate(s.week_start)}</span>
                    <span className="stat-number">{s.wcs}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-ink-700 pt-4">
            <h3 className="text-sm text-paper-300 mb-2">Nudges</h3>
            <div className="space-y-2 max-h-48 overflow-y-auto mb-3">
              {messages.length === 0 && <p className="text-sm text-paper-300">No nudges yet.</p>}
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`text-sm rounded px-3 py-2 max-w-[85%] ${
                    m.sender_id === user?.id ? 'bg-moss-700/40 ml-auto' : 'bg-ink-700'
                  }`}
                >
                  {m.body}
                </div>
              ))}
            </div>
            <form onSubmit={(e) => sendMessage(e, accepted.id)} className="flex gap-2">
              <input
                className="flex-1"
                placeholder="Send a quick nudge…"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
              />
              <button type="submit" disabled={sendingMessage || !newMessage.trim()} className="btn-secondary">
                Send
              </button>
            </form>
          </div>
        </div>
      ) : (
        <div className="card">
          <p className="text-paper-300 text-sm">
            No partner connected yet. Generate a code to invite someone, or enter a code they gave you.
          </p>
        </div>
      )}

      {pending.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-lg">Pending</h2>
          {pending.map((p) => {
            const iAmRequester = p.requester_id === user?.id
            const waitingOnMe = !iAmRequester ? true : Boolean(p.partner_id) // requester waits once redeemed
            return (
              <div key={p.id} className="card flex items-center justify-between">
                <div>
                  <p>{p.otherName ?? (p.partner_id ? 'Someone redeemed your code' : 'Invite sent — no one yet')}</p>
                  {!p.partner_id && iAmRequester && (
                    <p className="text-xs text-paper-300 font-mono">code: {p.invite_code}</p>
                  )}
                </div>
                {p.partner_id && waitingOnMe && (
                  <div className="flex gap-2">
                    <button onClick={() => updateStatus(p.id, 'accepted')} className="btn-secondary text-sm px-3 py-1">
                      Accept
                    </button>
                    <button onClick={() => updateStatus(p.id, 'declined')} className="text-sm text-paper-300 hover:text-rose-500">
                      Decline
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {!accepted && (
        <div className="grid gap-4">
          <div className="card space-y-3">
            <h2 className="text-lg">Generate an invite code</h2>
            <p className="text-sm text-paper-300">Share this code with the person you want as a partner.</p>
            <button onClick={handleGenerate} disabled={busy} className="btn-primary w-full">
              {busy ? 'Working…' : 'Generate code'}
            </button>
            {generatedCode && (
              <p className="text-center font-mono text-xl tracking-widest text-moss-400">{generatedCode}</p>
            )}
          </div>

          <div className="card space-y-3">
            <h2 className="text-lg">Enter a code</h2>
            <form onSubmit={handleRedeem} className="flex gap-2">
              <input
                className="flex-1 uppercase"
                placeholder="ABCD123"
                value={redeemCode}
                onChange={(e) => setRedeemCode(e.target.value)}
              />
              <button type="submit" disabled={busy || !redeemCode.trim()} className="btn-secondary">
                Redeem
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
