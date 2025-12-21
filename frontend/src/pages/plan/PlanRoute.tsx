import { useCallback, useEffect, useMemo, useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { Alert, Button, Card, CardContent, Chip, Skeleton, Stack, Typography } from '@mui/material'

import { bootstrapApp } from '../../bootstrap'
import type { PlanOut } from '../../api/ApiClient'
import { PageHeader } from '../../components/layout/PageHeader'

export type PlanOutletContext = {
  plan: PlanOut
  reloadPlan: () => Promise<void>
}

export function PlanRoute() {
  const navigate = useNavigate()
  const api = useMemo(() => bootstrapApp().getApi(), [])
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [plan, setPlan] = useState<PlanOut | null>(null)

  const profileId = Number(localStorage.getItem('last_profile_id') || 0)

  const reloadPlan = useCallback(async () => {
    setError(null)
    setBusy(true)
    try {
      if (!profileId) throw new Error('Missing profile. Please go to Planner and generate a plan.')
      const latest = await api.getLatestPlan(profileId)
      setPlan(latest)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }, [api, profileId])

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (cancelled) return
      await reloadPlan()
    }
    load()
    return () => {
      cancelled = true
    }
  }, [reloadPlan])

  return (
    <Stack spacing={3}>
      <PageHeader
        title="Your Plan"
        actions={
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <Button variant="outlined" onClick={() => navigate('/plan/calendar')}>
              Calendar
            </Button>
            <Button variant="outlined" onClick={() => navigate('/plan/checkin')}>
              Monthly check-in
            </Button>
            <Button variant="outlined" onClick={() => navigate('/planner')}>
              Update inputs
            </Button>
          </Stack>
        }
      />

      {busy ? (
        <Card>
          <CardContent>
            <Stack spacing={1}>
              <Skeleton width="45%" />
              <Skeleton />
              <Skeleton />
              <Skeleton />
            </Stack>
          </CardContent>
        </Card>
      ) : null}

      {error ? <Alert severity="error">{error}</Alert> : null}

      {!busy && error ? (
        <Card>
          <CardContent>
            <Stack spacing={1.5}>
              <Typography variant="subtitle1" sx={{ fontWeight: 750 }}>
                You don’t have a plan yet
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Go to Planner to enter your numbers and generate a plan.
              </Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <Button variant="contained" onClick={() => navigate('/planner')}>
                  Go to Planner
                </Button>
                <Button variant="outlined" onClick={reloadPlan}>
                  Try again
                </Button>
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      ) : null}

      {plan && !busy ? (
        <>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <Chip size="small" label={`Model: ${plan.model_used}`} />
            <Chip size="small" variant="outlined" label={`Created: ${plan.created_at}`} />
          </Stack>
          <Outlet context={{ plan, reloadPlan } satisfies PlanOutletContext} />
        </>
      ) : null}
    </Stack>
  )
}


