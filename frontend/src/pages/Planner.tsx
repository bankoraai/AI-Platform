import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Divider,
  IconButton,
  InputAdornment,
  Link,
  Typography,
  Stack,
  TextField,
} from '@mui/material'
import Grid from '@mui/material/Grid'
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import { Link as RouterLink } from 'react-router-dom'

import { bootstrapApp } from '../bootstrap'
import { MockAuthService } from '../services/MockAuthService'
import type { LoanIn } from '../api/ApiClient'
import { PageHeader } from '../components/layout/PageHeader'

type LoanDraft = LoanIn & { _id: string }

function newLoanDraft(): LoanDraft {
  return {
    _id: `ln_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    name: '',
    balance: 0,
    apr_percent: 0,
    minimum_payment: 0,
    term_months: null,
  }
}

export function PlannerPage() {
  const navigate = useNavigate()
  const auth = useMemo(() => new MockAuthService(), [])
  const user = useMemo(() => auth.getUser(), [auth])
  const api = useMemo(() => bootstrapApp().getApi(), [])
  const lastProfileId = Number(localStorage.getItem('last_profile_id') || 0)

  const [cash, setCash] = useState<number>(0)
  const [stocks, setStocks] = useState<number>(0)
  const [loans, setLoans] = useState<LoanDraft[]>([newLoanDraft()])

  const [busy, setBusy] = useState(false) // used for Generate Plan flow
  const [loadBusy, setLoadBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [currencyCode, setCurrencyCode] = useState<string>(() => localStorage.getItem('preferred_currency') || 'USD')

  const canSubmit = !!user?.mock_user_id
  function currencySymbol(code: string): string {
    switch ((code || '').toUpperCase()) {
      case 'USD':
      case 'CAD':
      case 'AUD':
        return '$'
      case 'EUR':
        return '€'
      case 'GBP':
        return '£'
      case 'JPY':
        return '¥'
      case 'NIS':
        return '₪'
      case 'CHF':
        return 'CHF'
      case 'AED':
        return 'AED'
      case 'SAR':
        return 'SAR'
      default:
        return code.toUpperCase() || '$'
    }
  }

  const suppressAutosaveRef = useRef(false)
  const autosaveTimerRef = useRef<number | null>(null)

  function cleanedLoansForSave(current: LoanDraft[]) {
    return current
      .filter((l) => l.name.trim().length > 0)
      .map((l) => ({
        name: l.name.trim(),
        balance: Number(l.balance || 0),
        apr_percent: Number(l.apr_percent || 0),
        minimum_payment: Number(l.minimum_payment || 0),
        term_months: l.term_months ? Number(l.term_months) : null,
      }))
  }

  async function loadLatestFromDb() {
    if (!user?.mock_user_id) return
    setError(null)
    setLoadBusy(true)
    try {
      const latest = await api.getLatestProfile({
        mock_user_id: user.mock_user_id,
        name: user.name ?? null,
        email: user.email ?? null,
      })

      // Avoid triggering autosave immediately from hydration.
      suppressAutosaveRef.current = true
      const profileCurrency = (latest.currency_code || 'USD').toUpperCase()
      setCurrencyCode(profileCurrency)
      localStorage.setItem('preferred_currency', profileCurrency)
      setCash(Number(latest.cash_available || 0))
      setStocks(Number(latest.stocks_total || 0))
      setLoans(
        (latest.loans?.length ? latest.loans : []).map((ln) => ({
          _id: `db_${ln.id}`,
          name: ln.name,
          balance: Number(ln.balance || 0),
          apr_percent: Number(ln.apr_percent || 0),
          minimum_payment: Number(ln.minimum_payment || 0),
          term_months: ln.term_months ?? null,
        })),
      )
      // Ensure at least one blank row exists for UX.
      setLoans((prev) => (prev.length ? prev : [newLoanDraft()]))
      setSaveStatus('saved')
      setSaveError(null)
    } catch (err) {
      // 404 is fine (no saved data yet); anything else is worth surfacing.
      const msg = err instanceof Error ? err.message : String(err)
      if (!msg.toLowerCase().includes('no saved profile') && !msg.toLowerCase().includes('not found')) {
        setError(msg)
      }
      // If there is no saved profile yet, seed currency from user settings (DB-backed).
      try {
        const s = await api.getSettings({
          mock_user_id: user.mock_user_id,
          name: user.name ?? null,
          email: user.email ?? null,
        })
        const next = (s.preferred_currency || 'USD').toUpperCase()
        setCurrencyCode(next)
        localStorage.setItem('preferred_currency', next)
      } catch {
        // ignore
      }
    } finally {
      // Re-enable autosave after the synchronous state updates have flushed.
      queueMicrotask(() => {
        suppressAutosaveRef.current = false
      })
      setLoadBusy(false)
    }
  }

  // Auto-load latest saved profile when entering Planner (if signed in).
  useEffect(() => {
    if (!user?.mock_user_id) return
    loadLatestFromDb()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.mock_user_id])

  // Debounced auto-save on edits.
  useEffect(() => {
    if (!user?.mock_user_id) return
    if (suppressAutosaveRef.current) return

    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current)
      autosaveTimerRef.current = null
    }

    setSaveStatus('saving')
    setSaveError(null)

    autosaveTimerRef.current = window.setTimeout(async () => {
      try {
        const profile = await api.upsertProfile({
          mock_user_id: user.mock_user_id,
          name: user.name ?? null,
          email: user.email ?? null,
          cash_available: Number(cash || 0),
          stocks_total: Number(stocks || 0),
          loans: cleanedLoansForSave(loans),
        })
        localStorage.setItem('last_profile_id', String(profile.id))
        setSaveStatus('saved')
      } catch (err) {
        setSaveStatus('error')
        setSaveError(err instanceof Error ? err.message : String(err))
      }
    }, 800)

    return () => {
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current)
        autosaveTimerRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.mock_user_id, cash, stocks, loans])

  return (
    <Stack spacing={3}>
      <PageHeader
        title="Planner"
        subtitle="Fill in your numbers and generate a step-by-step plan."
        actions={
          canSubmit ? (
            <Stack direction="row" spacing={1.5} alignItems="center">
              {lastProfileId ? (
                <Button variant="outlined" onClick={() => navigate('/plan')}>
                  View plan
                </Button>
              ) : null}
              <Typography variant="body2" color={saveStatus === 'error' ? 'error' : 'text.secondary'}>
                {saveStatus === 'saving'
                  ? 'Saving…'
                  : saveStatus === 'saved'
                    ? 'Saved'
                    : saveStatus === 'error'
                      ? 'Save failed'
                      : ''}
              </Typography>
              <Button variant="outlined" onClick={loadLatestFromDb} disabled={loadBusy}>
                {loadBusy ? 'Loading…' : 'Reload saved'}
              </Button>
            </Stack>
          ) : null
        }
      />

      {!canSubmit ? (
        <Alert severity="warning">
          Please{' '}
          <Link component={RouterLink} to="/signin" underline="hover">
            mock sign in
          </Link>{' '}
          first.
        </Alert>
      ) : null}

      {error ? <Alert severity="error">{error}</Alert> : null}
      {saveError ? <Alert severity="warning">{saveError}</Alert> : null}

      <Card>
        <CardContent>
          <Box
            component="form"
            onSubmit={async (e) => {
              e.preventDefault()
              setError(null)
              if (!user?.mock_user_id) return
              setBusy(true)
              try {
                const cleanedLoans = cleanedLoansForSave(loans)

                const profile = await api.upsertProfile({
                  mock_user_id: user.mock_user_id,
                  name: user.name ?? null,
                  email: user.email ?? null,
                  cash_available: Number(cash || 0),
                  stocks_total: Number(stocks || 0),
                  loans: cleanedLoans,
                })

                localStorage.setItem('last_profile_id', String(profile.id))

                const plan = await api.generatePlan(profile.id, currencyCode)
                localStorage.setItem('last_plan_id', String(plan.id))
                navigate('/plan')
              } catch (err) {
                setError(err instanceof Error ? err.message : String(err))
              } finally {
                setBusy(false)
              }
            }}
          >
            <Stack spacing={3}>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField
                    label="Cash available"
                    type="number"
                    inputProps={{ min: 0, step: '0.01' }}
                    value={cash}
                    onChange={(e) => setCash(Number(e.target.value))}
                    InputProps={{
                      startAdornment: <InputAdornment position="start">{currencySymbol(currencyCode)}</InputAdornment>,
                    }}
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField
                    label="Total stock investments"
                    type="number"
                    inputProps={{ min: 0, step: '0.01' }}
                    value={stocks}
                    onChange={(e) => setStocks(Number(e.target.value))}
                    InputProps={{
                      startAdornment: <InputAdornment position="start">{currencySymbol(currencyCode)}</InputAdornment>,
                    }}
                  />
                </Grid>
              </Grid>

              <Divider />

              <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
                <Box>
                  <Box component="div" sx={{ fontWeight: 700 }}>
                    Loans
                  </Box>
                  <Box component="div" sx={{ color: 'text.secondary', fontSize: 14 }}>
                    Add each loan you’re paying down.
                  </Box>
                </Box>
                <Button
                  type="button"
                  variant="outlined"
                  startIcon={<AddCircleOutlineIcon />}
                  onClick={() => setLoans((prev) => [...prev, newLoanDraft()])}
                >
                  Add loan
                </Button>
              </Stack>

              <Stack spacing={2}>
                {loans.map((l, idx) => (
                  <Card key={l._id} variant="outlined" sx={{ borderStyle: 'solid' }}>
                    <CardContent>
                      <Stack spacing={2}>
                        <Grid container spacing={2}>
                          <Grid size={{ xs: 12, md: 4 }}>
                            <TextField
                              label="Name"
                              value={l.name}
                              onChange={(e) =>
                                setLoans((prev) => prev.map((p) => (p._id === l._id ? { ...p, name: e.target.value } : p)))
                              }
                              placeholder={`Loan #${idx + 1}`}
                            />
                          </Grid>
                          <Grid size={{ xs: 12, md: 2 }}>
                            <TextField
                              label="Balance"
                              type="number"
                              inputProps={{ min: 0, step: '0.01' }}
                              value={l.balance}
                              onChange={(e) =>
                                setLoans((prev) =>
                                  prev.map((p) => (p._id === l._id ? { ...p, balance: Number(e.target.value) } : p)),
                                )
                              }
                              InputProps={{
                                startAdornment: <InputAdornment position="start">{currencySymbol(currencyCode)}</InputAdornment>,
                              }}
                            />
                          </Grid>
                          <Grid size={{ xs: 12, md: 2 }}>
                            <TextField
                              label="APR"
                              type="number"
                              inputProps={{ min: 0, max: 100, step: '0.01' }}
                              value={l.apr_percent}
                              onChange={(e) =>
                                setLoans((prev) =>
                                  prev.map((p) => (p._id === l._id ? { ...p, apr_percent: Number(e.target.value) } : p)),
                                )
                              }
                              InputProps={{
                                endAdornment: <InputAdornment position="end">%</InputAdornment>,
                              }}
                            />
                          </Grid>
                          <Grid size={{ xs: 12, md: 2 }}>
                            <TextField
                              label="Min payment"
                              type="number"
                              inputProps={{ min: 0, step: '0.01' }}
                              value={l.minimum_payment ?? 0}
                              onChange={(e) =>
                                setLoans((prev) =>
                                  prev.map((p) =>
                                    p._id === l._id ? { ...p, minimum_payment: Number(e.target.value) } : p,
                                  ),
                                )
                              }
                              InputProps={{
                                startAdornment: <InputAdornment position="start">{currencySymbol(currencyCode)}</InputAdornment>,
                              }}
                            />
                          </Grid>
                          <Grid size={{ xs: 12, md: 2 }}>
                            <TextField
                              label="Term (months)"
                              type="number"
                              inputProps={{ min: 1, step: '1' }}
                              value={l.term_months ?? ''}
                              onChange={(e) =>
                                setLoans((prev) =>
                                  prev.map((p) =>
                                    p._id === l._id
                                      ? { ...p, term_months: e.target.value ? Number(e.target.value) : null }
                                      : p,
                                  ),
                                )
                              }
                            />
                          </Grid>
                        </Grid>

                        <Stack direction="row" justifyContent="flex-end">
                          <IconButton
                            aria-label="Remove loan"
                            onClick={() => setLoans((prev) => prev.filter((p) => p._id !== l._id))}
                            disabled={loans.length <= 1}
                            color="error"
                          >
                            <DeleteOutlineIcon />
                          </IconButton>
                        </Stack>
                      </Stack>
                    </CardContent>
                  </Card>
                ))}
              </Stack>

              <Stack direction="row" justifyContent="flex-end">
                <Button type="submit" variant="contained" disabled={!canSubmit || busy} endIcon={<ArrowForwardIcon />}>
                  {busy ? 'Generating…' : 'Generate plan'}
                </Button>
              </Stack>
            </Stack>
          </Box>
        </CardContent>
      </Card>
    </Stack>
  )
}


