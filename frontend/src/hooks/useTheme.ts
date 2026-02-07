import { useSyncExternalStore } from 'react'

type Theme = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'theme'

let currentTheme: Theme = (localStorage.getItem(STORAGE_KEY) as Theme) || 'system'
const listeners = new Set<() => void>()

function getIsDark(): boolean {
  if (currentTheme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  }
  return currentTheme === 'dark'
}

function applyTheme() {
  const isDark = getIsDark()
  document.documentElement.classList.toggle('dark', isDark)
}

// Apply on load
applyTheme()

// Listen for system preference changes
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (currentTheme === 'system') {
    applyTheme()
    listeners.forEach((l) => l())
  }
})

function setTheme(theme: Theme) {
  currentTheme = theme
  localStorage.setItem(STORAGE_KEY, theme)
  applyTheme()
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot() {
  return currentTheme
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot)
  const isDark = getIsDark()

  const toggle = () => {
    setTheme(isDark ? 'light' : 'dark')
  }

  return { theme, setTheme, isDark, toggle }
}
