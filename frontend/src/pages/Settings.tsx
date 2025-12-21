import { useEffect, useMemo, useState } from 'react'
import { Alert, Box, Card, CardContent, FormControlLabel, MenuItem, Stack, Switch, TextField, Typography } from '@mui/material'

import { bootstrapApp } from '../bootstrap'
import { MockAuthService } from '../services/MockAuthService'
import { PageHeader } from '../components/layout/PageHeader'
import { getExistingSubscription, getPushSupport, subscribeForPush, toBackendPayload } from '../services/PushNotifications'
import { useThemePreferences } from '../theme/preferences'

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'AED', 'SAR', 'NIS'] as const

export function SettingsPage() {
  const auth = useMemo(() => new MockAuthService(), [])
  const user = useMemo(() => auth.getUser(), [auth])
  const api = useMemo(() => bootstrapApp().getApi(), [])
  const { preferences, setMode, setAccent, setDensity } = useThemePreferences()

  const [currency, setCurrency] = useState<string>('USD')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [pushEnabled, setPushEnabled] = useState<boolean>(false)
  const [pushBusy, setPushBusy] = useState<boolean>(false)
  const [pushError, setPushError] = useState<string | null>(null)

  const canUse = !!user?.mock_user_id
  const pushSupport = useMemo(() => getPushSupport(), [])
  const vapidPublicKey = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) ?? ''

  useEffect(() => {
    // Seed from local cache for snappy UI.
    const cached = localStorage.getItem('preferred_currency')
    if (cached) setCurrency(cached)
  }, [])

  useEffect(() => {
    let cancelled = false
    async function loadPushStatus() {
      setPushError(null)
      if (!pushSupport.supported) return
      try {
        const sub = await getExistingSubscription()
        if (!cancelled) setPushEnabled(!!sub)
      } catch (e) {
        if (!cancelled) setPushError(e instanceof Error ? e.message : String(e))
      }
    }
    loadPushStatus()
    return () => {
      cancelled = true
    }
  }, [pushSupport.supported])

  useEffect(() => {
    const u = user
    if (!u || !u.mock_user_id) return
    const mockUserId = u.mock_user_id
    const mockUserName = u.name ?? null
    const mockUserEmail = u.email ?? null
    let cancelled = false
    async function load() {
      setError(null)
      setBusy(true)
      try {
        const s = await api.getSettings({
          mock_user_id: mockUserId,
          name: mockUserName,
          email: mockUserEmail,
        })
        if (cancelled) return
        setCurrency(s.preferred_currency || 'USD')
        localStorage.setItem('preferred_currency', s.preferred_currency || 'USD')
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setBusy(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [api, user?.mock_user_id])

  return (
    <Box sx={{ maxWidth: 720, mx: 'auto' }}>
      <Stack spacing={3}>
        <PageHeader
          title="Settings"
          subtitle="Configure defaults for your planning experience."
          actions={
            canUse ? (
              <Typography variant="body2" color={status === 'error' ? 'error' : 'text.secondary'}>
                {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : status === 'error' ? 'Save failed' : ''}
              </Typography>
            ) : null
          }
        />

        {!canUse ? <Alert severity="warning">Please mock sign in first to save settings.</Alert> : null}
        {error ? <Alert severity="error">{error}</Alert> : null}

        <Card>
          <CardContent>
            <Stack spacing={2}>
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  Appearance
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Customize the app theme and spacing.
                </Typography>
              </Box>

              <FormControlLabel
                control={<Switch checked={preferences.mode === 'dark'} onChange={(_e, checked) => setMode(checked ? 'dark' : 'light')} />}
                label={preferences.mode === 'dark' ? 'Dark mode' : 'Light mode'}
              />

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField
                  select
                  label="Accent"
                  value={preferences.accent}
                  onChange={(e) => setAccent(e.target.value === 'teal' ? 'teal' : 'blue')}
                  helperText="Used for highlights and primary actions."
                >
                  <MenuItem value="blue">Blue (Wealth)</MenuItem>
                  <MenuItem value="teal">Teal (Growth)</MenuItem>
                </TextField>

                <TextField
                  select
                  label="Density"
                  value={preferences.density}
                  onChange={(e) => setDensity(e.target.value === 'compact' ? 'compact' : 'comfortable')}
                  helperText="Compact shows more content on screen."
                >
                  <MenuItem value="comfortable">Comfortable</MenuItem>
                  <MenuItem value="compact">Compact</MenuItem>
                </TextField>
              </Stack>
            </Stack>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Stack spacing={2}>
              <TextField
                select
                label="Currency"
                value={currency}
                disabled={!canUse || busy}
                onChange={async (e) => {
                  const next = e.target.value
                  setCurrency(next)
                  localStorage.setItem('preferred_currency', next)
                  const u = user
                  if (!u || !u.mock_user_id) return
                  const mockUserId = u.mock_user_id
                  const mockUserName = u.name ?? null
                  const mockUserEmail = u.email ?? null
                  setStatus('saving')
                  setError(null)
                  try {
                    await api.updateSettings(
                      { mock_user_id: mockUserId, name: mockUserName, email: mockUserEmail },
                      { preferred_currency: next },
                    )
                    setStatus('saved')
                  } catch (err) {
                    setStatus('error')
                    setError(err instanceof Error ? err.message : String(err))
                  }
                }}
                helperText="Used for plan generation and UI formatting."
              >
                {CURRENCIES.map((c) => (
                  <MenuItem key={c} value={c}>
                    {c}
                  </MenuItem>
                ))}
              </TextField>

              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  Notifications
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  Enable push reminders for upcoming plan tasks.
                </Typography>
                {!pushSupport.supported ? (
                  <Typography variant="body2" color="text.secondary">
                    Not supported: {pushSupport.reason}
                  </Typography>
                ) : !vapidPublicKey ? (
                  <Typography variant="body2" color="text.secondary">
                    Push is not configured (missing VAPID public key).
                  </Typography>
                ) : (
                  <>
                    {pushError ? <Alert severity="warning">{pushError}</Alert> : null}
                    <FormControlLabel
                      control={
                        <Switch
                          checked={pushEnabled}
                          disabled={!canUse || pushBusy}
                          onChange={async (_e, checked) => {
                            const u = user
                            if (!u || !u.mock_user_id) return
                            setPushBusy(true)
                            setPushError(null)
                            try {
                              if (checked) {
                                const perm = await Notification.requestPermission()
                                if (perm !== 'granted') throw new Error('Notifications permission was not granted')
                                const sub = await subscribeForPush(vapidPublicKey)
                                const payload = toBackendPayload(sub)
                                if (!payload.p256dh || !payload.auth) throw new Error('Invalid push subscription keys')
                                await api.subscribePush(
                                  { mock_user_id: u.mock_user_id, name: u.name ?? null, email: u.email ?? null },
                                  payload,
                                )
                                setPushEnabled(true)
                              } else {
                                const sub = await getExistingSubscription()
                                if (sub) {
                                  await api.unsubscribePush(sub.endpoint)
                                  await sub.unsubscribe().catch(() => null)
                                }
                                setPushEnabled(false)
                              }
                            } catch (err) {
                              setPushError(err instanceof Error ? err.message : String(err))
                              // Re-evaluate actual state
                              try {
                                const sub = await getExistingSubscription()
                                setPushEnabled(!!sub)
                              } catch {
                                // ignore
                              }
                            } finally {
                              setPushBusy(false)
                            }
                          }}
                        />
                      }
                      label={pushBusy ? 'Updating…' : pushEnabled ? 'Push reminders enabled' : 'Push reminders disabled'}
                    />
                  </>
                )}
              </Box>
            </Stack>
          </CardContent>
        </Card>
      </Stack>
    </Box>
  )
}


