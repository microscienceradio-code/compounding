import { NavLink } from 'react-router-dom'

const links = [
  { to: '/dashboard', label: 'Today', icon: '◐' },
  { to: '/log', label: 'Log', icon: '✎' },
  { to: '/ledger', label: 'Ledger', icon: '▤' },
  { to: '/targets', label: 'Targets', icon: '◈' },
  { to: '/partner', label: 'Partner', icon: '◑' },
  { to: '/settings', label: 'Settings', icon: '⚙' },
]

export default function Nav() {
  return (
    <>
      {/* Top bar on wider screens */}
      <header className="hidden sm:flex items-center justify-between border-b border-ink-700 px-6 py-3">
        <span className="font-display text-lg text-paper-100">Compounding</span>
        <nav className="flex gap-1">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded text-sm transition-colors ${
                  isActive ? 'bg-moss-700/40 text-paper-100' : 'text-paper-300 hover:text-paper-100'
                }`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
      </header>

      {/* Bottom tab bar on mobile — this is a nighttime-on-phone app, so thumb reach matters */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-20 bg-ink-800 border-t border-ink-700 flex justify-around py-1.5">
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            className={({ isActive }) =>
              `flex flex-col items-center px-2 py-1 text-[11px] ${
                isActive ? 'text-moss-400' : 'text-paper-300'
              }`
            }
          >
            <span className="text-lg leading-none">{l.icon}</span>
            {l.label}
          </NavLink>
        ))}
      </nav>
    </>
  )
}
