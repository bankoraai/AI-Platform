import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { Alert, Box, Button, Card, CardContent, InputAdornment, Stack, TextField, Typography } from '@mui/material'
import Grid from '@mui/material/Grid'

import { bootstrapApp } from '../../bootstrap'
import type { CheckInOut, LoanOut } from '../../api/ApiClient'
import type { PlanOutletContext } from './PlanRoute'
import { PlanCard } from '../../components/plan/PlanCard'

type LoanBalanceDraft = Pick<LoanOut, 'id' | 'name' | 'balance'> & { _key: string }

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

export function PlanCheckInPage() {
  const navigate = useNavigate()
  const { plan, reloadPlan } = useOutletContext<PlanOutletContext>()
  const api = useMemo(() => bootstrapApp().getApi(), [])

  const [cash, setCash] = useState<number>(0)
  const [stocks, setStocks] = useState<number>(0)
  const [loans, setLoans] = useState<LoanBalanceDraft[]>([])
  const [currency, setCurrency] = useState<string>(() => localStorage.getItem('preferred_currency') || 'USD')

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<CheckInOut | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setError(null)
      try {
        const profile = await api.getProfile(plan.profile_id)
        if (cancelled) return
        const ccy = (profile.currency_code || 'USD').toUpperCase()
        setCurrency(ccy)
        localStorage.setItem('preferred_currency', ccy)
        setCash(Number(profile.cash_available || 0))
        setStocks(Number(profile.stocks_total || 0))
        setLoans(
          (profile.loans ?? []).map((ln) => ({
            _key: `ln_${ln.id}`,
            id: ln.id,
            name: ln.name,
            balance: Number(ln.balance || 0),
          })),
        )
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [api, plan.profile_id])

  return (
    <Stack spacing={2}>
      <PlanCard title="Monthly check-in" subtitle="Update balances and refresh your plan for this month.">
        {error ? <Alert severity="error">{error}</Alert> : null}
        {result ? (
          <Stack spacing={1.5}>
            <Alert severity={result.ahead_behind === 'ahead' ? 'success' : result.ahead_behind === 'behind' ? 'warning' : 'info'}>
              You’re <strong>{result.ahead_behind.replace('_', ' ')}</strong> this month.
            </Alert>
            <Typography variant="body2" color="text.secondary">
              Net worth Δ: {result.deltas.net_worth_delta.toFixed(2)} | Debt Δ: {result.deltas.debt_delta.toFixed(2)} | Investments Δ:{' '}
              {result.deltas.investments_delta.toFixed(2)}
            </Typography>
            <Stack direction="row" spacing={1}>
              <Button
                variant="contained"
                onClick={async () => {
                  await reloadPlan()
                  navigate('/plan')
                }}
              >
                Go to updated plan
              </Button>
              <Button variant="outlined" onClick={() => setResult(null)}>
                Edit check-in
              </Button>
            </Stack>
          </Stack>
        ) : (
          <Box
            component="form"
            onSubmit={async (e) => {
              e.preventDefault()
              setBusy(true)
              setError(null)
              try {
                const res = await api.createCheckin({
                  profile_id: plan.profile_id,
                  cash_available: Number(cash || 0),
                  stocks_total: Number(stocks || 0),
                  loans: loans.map((ln) => ({ id: ln.id, balance: Number(ln.balance || 0) })),
                })
                setResult(res)
              } catch (err) {
                setError(err instanceof Error ? err.message : String(err))
              } finally {
                setBusy(false)
              }
            }}
          >
            <Stack spacing={2.5}>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField
                    label="Cash available"
                    type="number"
                    inputProps={{ min: 0, step: '0.01' }}
                    value={cash}
                    onChange={(e) => setCash(Number(e.target.value))}
                    InputProps={{ startAdornment: <InputAdornment position="start">{currencySymbol(currency)}</InputAdornment> }}
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField
                    label="Total stock investments"
                    type="number"
                    inputProps={{ min: 0, step: '0.01' }}
                    value={stocks}
                    onChange={(e) => setStocks(Number(e.target.value))}
                    InputProps={{ startAdornment: <InputAdornment position="start">{currencySymbol(currency)}</InputAdornment> }}
                  />
                </Grid>
              </Grid>

              <Card variant="outlined">
                <CardContent>
                  <Stack spacing={1.5}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                      Loan balances
                    </Typography>
                    {loans.length ? (
                      <Stack spacing={1.5}>
                        {loans.map((ln) => (
                          <Grid key={ln._key} container spacing={2} alignItems="center">
                            <Grid size={{ xs: 12, md: 7 }}>
                              <Typography variant="body2">{ln.name}</Typography>
                            </Grid>
                            <Grid size={{ xs: 12, md: 5 }}>
                              <TextField
                                label="Balance"
                                type="number"
                                inputProps={{ min: 0, step: '0.01' }}
                                value={ln.balance}
                                onChange={(e) =>
                                  setLoans((prev) =>
                                    prev.map((p) => (p.id === ln.id ? { ...p, balance: Number(e.target.value) } : p)),
                                  )
                                }
                                InputProps={{
                                  startAdornment: <InputAdornment position="start">{currencySymbol(currency)}</InputAdornment>,
                                }}
                              />
                            </Grid>
                          </Grid>
                        ))}
                      </Stack>
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        No loans on file.
                      </Typography>
                    )}
                  </Stack>
                </CardContent>
              </Card>

              <Stack direction="row" justifyContent="flex-end" spacing={1}>
                <Button variant="outlined" onClick={() => navigate('/plan')} disabled={busy}>
                  Cancel
                </Button>
                <Button type="submit" variant="contained" disabled={busy}>
                  {busy ? 'Saving…' : 'Save check-in & refresh plan'}
                </Button>
              </Stack>
            </Stack>
          </Box>
        )}
      </PlanCard>
    </Stack>
  )
}


