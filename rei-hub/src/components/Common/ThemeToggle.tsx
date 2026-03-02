import { Sun, Moon } from 'lucide-react'
import { useTheme } from '@/hooks/useTheme'
import { cn } from '@/utils/helpers'

interface ThemeToggleProps {
  collapsed?: boolean
}

export default function ThemeToggle({ collapsed }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'

  return (
    <button
      onClick={toggleTheme}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={cn(
        'flex items-center gap-2 rounded-lg text-sm font-medium transition-colors',
        collapsed
          ? 'w-full justify-center p-2.5'
          : 'w-full px-3 py-2 justify-center',
        isDark
          ? 'text-amber-400 hover:bg-amber-500/10 hover:text-amber-300'
          : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
      )}
    >
      {isDark ? (
        <>
          <Sun className="w-4 h-4 shrink-0" />
          {!collapsed && <span>Light Mode</span>}
        </>
      ) : (
        <>
          <Moon className="w-4 h-4 shrink-0" />
          {!collapsed && <span>Dark Mode</span>}
        </>
      )}
    </button>
  )
}
