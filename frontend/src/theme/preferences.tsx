import React, { createContext, useCallback, useContext, useMemo, useState } from 'react'

export type ThemeMode = 'light' | 'dark'
export type ThemeAccent = 'blue' | 'teal'
export type ThemeDensity = 'comfortable' | 'compact'

export type ThemePreferences = {
  mode: ThemeMode
  accent: ThemeAccent
  density: ThemeDensity
}

const STORAGE_KEYS = {
  mode: 'ui_mode',
  accent: 'ui_accent',
  density: 'ui_density',
} as const

const DEFAULT_PREFS: ThemePreferences = {
  mode: 'light',
  accent: 'blue',
  density: 'comfortable',
}

function readStoredMode(): ThemeMode {
  const raw = localStorage.getItem(STORAGE_KEYS.mode)
  return raw === 'dark' || raw === 'light' ? raw : DEFAULT_PREFS.mode
}

function readStoredAccent(): ThemeAccent {
  const raw = localStorage.getItem(STORAGE_KEYS.accent)
  return raw === 'teal' || raw === 'blue' ? raw : DEFAULT_PREFS.accent
}

function readStoredDensity(): ThemeDensity {
  const raw = localStorage.getItem(STORAGE_KEYS.density)
  return raw === 'compact' || raw === 'comfortable' ? raw : DEFAULT_PREFS.density
}

export function readStoredThemePreferences(): ThemePreferences {
  return { mode: readStoredMode(), accent: readStoredAccent(), density: readStoredDensity() }
}

type ThemePreferencesContextValue = {
  preferences: ThemePreferences
  setMode: (mode: ThemeMode) => void
  setAccent: (accent: ThemeAccent) => void
  setDensity: (density: ThemeDensity) => void
  setPreferences: (next: Partial<ThemePreferences>) => void
}

const ThemePreferencesContext = createContext<ThemePreferencesContextValue | null>(null)

export function ThemePreferencesProvider(props: { children: React.ReactNode }) {
  const [preferences, setPreferencesState] = useState<ThemePreferences>(() => readStoredThemePreferences())

  const setMode = useCallback((mode: ThemeMode) => {
    localStorage.setItem(STORAGE_KEYS.mode, mode)
    setPreferencesState((p) => ({ ...p, mode }))
  }, [])

  const setAccent = useCallback((accent: ThemeAccent) => {
    localStorage.setItem(STORAGE_KEYS.accent, accent)
    setPreferencesState((p) => ({ ...p, accent }))
  }, [])

  const setDensity = useCallback((density: ThemeDensity) => {
    localStorage.setItem(STORAGE_KEYS.density, density)
    setPreferencesState((p) => ({ ...p, density }))
  }, [])

  const setPreferences = useCallback((next: Partial<ThemePreferences>) => {
    if (next.mode) localStorage.setItem(STORAGE_KEYS.mode, next.mode)
    if (next.accent) localStorage.setItem(STORAGE_KEYS.accent, next.accent)
    if (next.density) localStorage.setItem(STORAGE_KEYS.density, next.density)
    setPreferencesState((p) => ({ ...p, ...next }))
  }, [])

  const value = useMemo<ThemePreferencesContextValue>(
    () => ({ preferences, setMode, setAccent, setDensity, setPreferences }),
    [preferences, setMode, setAccent, setDensity, setPreferences],
  )

  return <ThemePreferencesContext.Provider value={value}>{props.children}</ThemePreferencesContext.Provider>
}

export function useThemePreferences(): ThemePreferencesContextValue {
  const ctx = useContext(ThemePreferencesContext)
  if (!ctx) throw new Error('useThemePreferences must be used within ThemePreferencesProvider')
  return ctx
}


