import { useEffect, useState } from 'react'

const STORAGE_KEY = 'compounding.reminderTime' // e.g. "21:30", or '' for off

/**
 * Best-effort local reminder. This is NOT true push notification — that
 * needs a service worker plus a push server, which this static-site,
 * no-backend architecture deliberately doesn't have. Instead, while the
 * app is open in a tab, this checks once a minute and fires a browser
 * notification the first time the clock passes the chosen time on a given
 * day. It only works while a tab is open (even backgrounded); it will not
 * fire if the browser is fully closed.
 */
export function useLocalReminder(loggedToday: boolean) {
  const [reminderTime, setReminderTimeState] = useState<string>(() => localStorage.getItem(STORAGE_KEY) ?? '')
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied'
  )

  function setReminderTime(value: string) {
    setReminderTimeState(value)
    localStorage.setItem(STORAGE_KEY, value)
  }

  async function requestPermission() {
    if (typeof Notification === 'undefined') return
    const result = await Notification.requestPermission()
    setPermission(result)
  }

  useEffect(() => {
    if (!reminderTime || permission !== 'granted' || loggedToday) return

    const check = () => {
      const [h, m] = reminderTime.split(':').map(Number)
      const now = new Date()
      const target = new Date()
      target.setHours(h, m, 0, 0)
      const todayKey = `compounding.reminderFired.${now.toISOString().slice(0, 10)}`
      if (now >= target && !localStorage.getItem(todayKey)) {
        new Notification('Log today\u2019s pulse', {
          body: 'A minute or two now keeps the streak alive.',
        })
        localStorage.setItem(todayKey, '1')
      }
    }

    check()
    const id = window.setInterval(check, 60_000)
    return () => window.clearInterval(id)
  }, [reminderTime, permission, loggedToday])

  return { reminderTime, setReminderTime, permission, requestPermission }
}
