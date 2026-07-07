import { PieChart, List, Bell } from 'lucide-react'

const tabs = [
  { id: 'dashboard', label: 'Overview', Icon: PieChart },
  { id: 'transactions', label: 'Transactions', Icon: List },
  { id: 'reminders', label: 'Reminders', Icon: Bell },
]

export default function BottomTabBar({ activeTab, onTabChange }) {
  return (
    <nav
      className="fixed bottom-0 left-1/2 z-30 w-full max-w-[430px] -translate-x-1/2 border-t border-hairline bg-card/95 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex">
        {tabs.map(({ id, label, Icon }) => {
          const active = activeTab === id
          return (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              className={`flex flex-1 flex-col items-center gap-1 py-3 text-xs font-medium transition-colors ${
                active ? 'text-accent' : 'text-txt-muted hover:text-txt-secondary'
              }`}
            >
              <Icon size={24} strokeWidth={active ? 2.4 : 1.8} />
              {label}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
