import { useCallback, useEffect, useState } from 'react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from 'recharts'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { lastNDates, lastNWeekStarts, formatShortDate, todayString } from '../lib/dates'
import QuickLogCard from '../components/QuickLogCard'
import type { DailyScore, WeeklyScore, WeeklyLedgerTotals, SprintTarget, Partnership } from '../types'
import { CATEGORY_LABEL, CATEGORY_WEEKLY_CAP, type LedgerCategory } from '../types'

export default function Dashboard() {
  const { user, profile } = useAuth()
  const [loggedToday, setLoggedToday] = useState<boolean | null>(null)
  const [dailyScores, setDailyScores] = useState<DailyScore[]>([])
  const [weeklyScores, setWeeklyScores] = useState<WeeklyScore[]>([])
  const [weekLedger, setWeekLedger] = useState<WeeklyLedgerTotals | null>(null)
  const [targets, setTargets] = useState<SprintTarget[]>([])
  const [streak, setStreak] = useState(0)
  const [partnership, setPartnership] = useState<Partnership | null>(null)
  const [partnerName, setPartnerName] = useState<string | null>(null)
  const [partnerStreak, setPartnerStreak] = useState<number | null>(null)
  const [partnerWcs, setPartnerWcs] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)

    const dates = lastNDates(14)
    const weekStarts = lastNWeekStarts(8)
    const currentWeek = weekStarts[weekStarts.length - 1]

    const [{ data: daily }, { data: weekly }, { data: ledger }, { data: targetRows }] = await Promise.all([
      supabase
        .from('daily_scores')
        .select('*')
        .eq('user_id', user.id)
        .gte('log_date', dates[0])
        .order('log_date', { ascending: true }),
      supabase
        .from('weekly_scores')
        .select('*')
        .eq('user_id', user.id)
        .gte('week_start', weekStarts[0])
        .order('week_start', { ascending: true }),
      supabase
        .from('weekly_ledger')
        .select('*')
        .eq('user_id', user.id)
        .eq('week_start', currentWeek)
        .maybeSingle(),
      supabase.from('sprint_targets').select('*').eq('user_id', user.id).order('created_at'),
    ])

    setDailyScores((daily as DailyScore[]) ?? [])
    setWeeklyScores((weekly as WeeklyScore[]) ?? [])
    setWeekLedger((ledger as WeeklyLedgerTotals) ?? null)
    setTargets((targetRows as SprintTarget[]) ?? [])
    setLoggedToday(((daily as DailyScore[]) ?? []).some((d) => d.log_date === todayString()))

    // streak: count backward from today (or yesterday if today not logged yet)
    const byDate = new Map(((daily as DailyScore[]) ?? []).map((d) => [d.log_date, d]))
    let s = 0
    const cursor = new Date()
    if (!byDate.has(todayString())) cursor.setDate(cursor.getDate() - 1)
    // widen lookup beyond the 14-day window if needed
    const { data: fullHistory } = await supabase
      .from('daily_logs')
      .select('log_date')
      .eq('user_id', user.id)
      .order('log_date', { ascending: false })
    const historySet = new Set((fullHistory ?? []).map((r: { log_date: string }) => r.log_date))
    while (true) {
      const key = cursor.toISOString().slice(0, 10)
      if (!historySet.has(key)) break
      s += 1
      cursor.setDate(cursor.getDate() - 1)
    }
    setStreak(s)

    // partnership (accepted, either direction)
    const { data: partnerships } = await supabase
      .from('partnerships')
      .select('*')
      .eq('status', 'accepted')
      .or(`requester_id.eq.${user.id},partner_id.eq.${user.id}`)
      .limit(1)
    const p = (partnerships?.[0] as Partnership) ?? null
    setPartnership(p)
    if (p) {
      const otherId = p.requester_id === user.id ? p.partner_id : p.requester_id
      if (otherId) {
        const [{ data: profSummary }, { data: weekSummary }] = await Promise.all([
          supabase.rpc('get_partner_profile_summary', { target_user: otherId }),
          supabase.rpc('get_partner_summary', { target_user: otherId }),
        ])
        const prof = profSummary?.[0]
        setPartnerName(prof?.display_name ?? null)
        setPartnerStreak(prof?.current_streak ?? null)
        setPartnerWcs(weekSummary?.[0]?.wcs ?? null)
      }
    }

    setLoading(false)
  }, [user])

  useEffect(() => {
    load()
  }, [load])

  if (loading) {
    return <p className="text-paper-300">Loading your dashboard…</p>
  }

  const sparkData = lastNDates(14).map((d) => {
    const row = dailyScores.find((s) => s.log_date === d)
    return {
      date: d,
      label: formatShortDate(d),
      g_day: row ? row.g_day : null,
      floor_mode: row?.floor_mode ?? false,
    }
  })

  const wcsData = weeklyScores.map((w) => ({
    label: formatShortDate(w.week_start),
    wcs: w.wcs,
  }))

  const ledgerBars: { category: string; value: number; cap: number }[] = weekLedger
    ? (['skill', 'asset', 'opportunity', 'positioning'] as LedgerCategory[]).map((c) => ({
        category: CATEGORY_LABEL[c],
        value:
          (weekLedger[`${c}_subtotal` as keyof WeeklyLedgerTotals] as number | null) ?? 0,
        cap: CATEGORY_WEEKLY_CAP[c],
      }))
    : []

  const targetsComplete = targets.filter((t) => t.completed).length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl">Hey, {profile?.display_name ?? 'there'}</h1>
        <p className="text-paper-300">
          {streak > 0 ? `${streak}-day streak. Keep it going.` : 'No streak yet — today is a good day to start.'}
        </p>
      </div>

      {!profile?.flagship_priority && (
        <div className="card border-moss-500/30 flex items-center justify-between">
          <p className="text-sm text-paper-300">Set your flagship priority to get the most out of Deep Work Units.</p>
          <Link to="/onboarding" className="btn-secondary text-sm whitespace-nowrap">Finish setup</Link>
        </div>
      )}

      {loggedToday === false && <QuickLogCard onLogged={load} />}

      <div className="card">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-lg">Daily score — last 14 days</h2>
          <span className="stat-number text-paper-300 text-sm">streak {streak}</span>
        </div>
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={sparkData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2B302A" />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#B8B4A5' }} interval={1} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#B8B4A5' }} width={30} />
            <Tooltip
              contentStyle={{ background: '#20241F', border: '1px solid #2B302A', fontSize: 12 }}
              labelStyle={{ color: '#EFEDE6' }}
            />
            <Line
              type="monotone"
              dataKey="g_day"
              stroke="#5B8C71"
              strokeWidth={2}
              connectNulls
              dot={(props: any) => {
                const { cx, cy, payload, index } = props
                if (payload.g_day == null) return <g key={index} />
                return payload.floor_mode ? (
                  <circle key={index} cx={cx} cy={cy} r={4} fill="#181B18" stroke="#5B8C71" strokeWidth={2} />
                ) : (
                  <circle key={index} cx={cx} cy={cy} r={4} fill="#5B8C71" />
                )
              }}
            />
          </LineChart>
        </ResponsiveContainer>
        <p className="text-xs text-paper-300 mt-1">Hollow points are floor-mode days (excluded from averages).</p>
      </div>

      <div className="card">
        <h2 className="text-lg mb-3">Compounding score — last 8 weeks</h2>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={wcsData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2B302A" />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#B8B4A5' }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#B8B4A5' }} width={30} />
            <Tooltip
              contentStyle={{ background: '#20241F', border: '1px solid #2B302A', fontSize: 12 }}
              labelStyle={{ color: '#EFEDE6' }}
            />
            <Bar dataKey="wcs" fill="#5B8C71" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="card">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-lg">This week’s ledger</h2>
          <span className="stat-number text-2xl text-moss-400">{weekLedger?.o_week ?? 0}</span>
        </div>
        {ledgerBars.length === 0 || ledgerBars.every((b) => b.value === 0) ? (
          <p className="text-paper-300 text-sm">
            No entries yet this week. <Link to="/ledger" className="text-moss-400 underline">Add one</Link>.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={ledgerBars} layout="vertical" margin={{ left: 10 }}>
              <XAxis type="number" domain={[0, 'dataMax']} hide />
              <YAxis type="category" dataKey="category" tick={{ fontSize: 12, fill: '#EFEDE6' }} width={90} />
              <Tooltip
                contentStyle={{ background: '#20241F', border: '1px solid #2B302A', fontSize: 12 }}
                labelStyle={{ color: '#EFEDE6' }}
              />
              <Bar dataKey="value" radius={[0, 3, 3, 0]}>
                {ledgerBars.map((b, i) => (
                  <Cell key={i} fill={b.value >= b.cap ? '#C97A4A' : '#5B8C71'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="card">
        <div className="flex items-center justify-between">
          <h2 className="text-lg">Sprint targets</h2>
          <Link to="/targets" className="text-sm text-moss-400 underline">Edit</Link>
        </div>
        <div className="mt-3">
          <div className="flex items-center justify-between text-sm mb-1">
            <span>{targetsComplete}/{targets.length} complete</span>
          </div>
          <div className="w-full bg-ink-700 rounded-full h-2">
            <div
              className="bg-moss-500 h-2 rounded-full transition-all"
              style={{ width: `${targets.length ? (targetsComplete / targets.length) * 100 : 0}%` }}
            />
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="text-lg mb-3">Accountability partner</h2>
        {partnership && partnerName ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-paper-100">{partnerName}</p>
              <p className="text-sm text-paper-300">{partnerStreak ?? 0}-day streak</p>
            </div>
            <div className="text-right">
              <p className="stat-number text-2xl text-moss-400">{partnerWcs ?? '—'}</p>
              <p className="text-xs text-paper-300">latest WCS</p>
            </div>
          </div>
        ) : (
          <p className="text-paper-300 text-sm">
            No partner connected yet. <Link to="/partner" className="text-moss-400 underline">Invite one</Link>.
          </p>
        )}
      </div>
    </div>
  )
}
