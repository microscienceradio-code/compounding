export type LedgerCategory = 'skill' | 'asset' | 'opportunity' | 'positioning'

export const CATEGORY_POINTS: Record<LedgerCategory, number> = {
  skill: 8,
  asset: 12,
  opportunity: 10,
  positioning: 6,
}

export const CATEGORY_WEEKLY_CAP: Record<LedgerCategory, number> = {
  skill: 24,
  asset: 36,
  opportunity: 30,
  positioning: 18,
}

export const CATEGORY_LABEL: Record<LedgerCategory, string> = {
  skill: 'Skill',
  asset: 'Asset',
  opportunity: 'Opportunity',
  positioning: 'Positioning',
}

export interface Profile {
  id: string
  display_name: string
  flagship_priority: string | null
  created_at: string
}

export interface DailyLog {
  id: string
  user_id: string
  log_date: string // yyyy-mm-dd
  dwu: number
  sleep_hours: number | null
  moved: boolean
  shipped: boolean
  shipped_note: string | null
  floor_mode: boolean
  created_at: string
}

export interface DailyScore extends DailyLog {
  e_score: number
  a_score: number
  s_score: number
  g_day: number
}

export interface LedgerEntry {
  id: string
  user_id: string
  week_start: string
  category: LedgerCategory
  description: string
  points: number
  created_at: string
}

export interface WeeklyLedgerTotals {
  user_id: string
  week_start: string
  skill_subtotal: number | null
  asset_subtotal: number | null
  opportunity_subtotal: number | null
  positioning_subtotal: number | null
  o_week: number
}

export interface WeeklyScore {
  user_id: string
  week_start: string
  g_day_avg: number
  o_week: number
  days_logged: number
  days_counted: number
  wcs: number
}

export interface SprintTarget {
  id: string
  user_id: string
  description: string
  completed: boolean
  created_at: string
}

export type ShareLevel = 'summary_only' | 'full_daily'
export type PartnershipStatus = 'pending' | 'accepted' | 'declined'

export interface Partnership {
  id: string
  requester_id: string
  partner_id: string | null
  invite_code: string
  status: PartnershipStatus
  share_level: ShareLevel
  created_at: string
}

export interface PartnerSummaryRow {
  week_start: string
  g_day_avg: number
  o_week: number
  wcs: number
}

export interface PartnerProfileSummary {
  display_name: string
  current_streak: number
}

export interface PartnerMessage {
  id: string
  partnership_id: string
  sender_id: string
  body: string
  created_at: string
}

export interface ScoringSettings {
  user_id: string
  enabled: boolean
  e_weight: number
  a_weight: number
  s_weight: number
  g_weight: number
  o_weight: number
  updated_at: string
}

export const DEFAULT_SCORING_WEIGHTS = {
  e_weight: 0.55,
  a_weight: 0.2,
  s_weight: 0.25,
  g_weight: 0.6,
  o_weight: 0.4,
}
