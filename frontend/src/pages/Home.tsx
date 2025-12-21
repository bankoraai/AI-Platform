import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Button, Card, CardContent, Stack, Typography } from '@mui/material'
import Grid from '@mui/material/Grid'

import { PageHeader } from '../components/layout/PageHeader'
import { bootstrapApp } from '../bootstrap'
import { MockAuthService } from '../services/MockAuthService'

export function HomePage() {
  const navigate = useNavigate()
  const auth = useMemo(() => new MockAuthService(), [])
  const user = useMemo(() => auth.getUser(), [auth])
  const api = useMemo(() => bootstrapApp().getApi(), [])

  const [continueTo, setContinueTo] = useState<string>('/planner')
  const [continueLabel, setContinueLabel] = useState<string>('Start planning')
  const [continueNote, setContinueNote] = useState<string>('')
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function compute() {
      setLoadError(null)

      if (!user?.mock_user_id) {
        if (!cancelled) {
          setContinueTo('/signin')
          setContinueLabel('Mock sign in')
          setContinueNote('Sign in to save your profile and generate a plan.')
        }
        return
      }

      try {
        const latestProfile = await api.getLatestProfile({
          mock_user_id: user.mock_user_id,
          name: user.name ?? null,
          email: user.email ?? null,
        })
        localStorage.setItem('last_profile_id', String(latestProfile.id))

        try {
          const latestPlan = await api.getLatestPlan(latestProfile.id)
          localStorage.setItem('last_plan_id', String(latestPlan.id))
          if (!cancelled) {
            setContinueTo('/plan')
            setContinueLabel('Continue to your plan')
            setContinueNote('Review your next steps and timeline.')
          }
        } catch {
          if (!cancelled) {
            setContinueTo('/planner')
            setContinueLabel('Generate your plan')
            setContinueNote('We found your saved profile—generate the latest plan.')
          }
        }
      } catch (err) {
        // No saved profile yet (or not reachable). Treat as onboarding to Planner.
        if (!cancelled) {
          setContinueTo('/planner')
          setContinueLabel('Complete your profile')
          setContinueNote('Add your loans, cash, and investments to generate a plan.')
          const msg = err instanceof Error ? err.message : String(err)
          if (!msg.toLowerCase().includes('not found') && !msg.toLowerCase().includes('no saved profile')) setLoadError(msg)
        }
      }
    }

    compute()
    return () => {
      cancelled = true
    }
  }, [api, user?.email, user?.mock_user_id, user?.name])

  return (
    <Stack spacing={3}>
      <PageHeader
        title="AI Wealth Planner"
        subtitle="Enter your loans, cash, and investments. We’ll generate a practical plan and timeline to help you build wealth."
      />

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 8 }}>
          <Card>
            <CardContent>
              <Typography variant="subtitle1" sx={{ mb: 0.5 }}>
                Get a step-by-step plan in minutes
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {continueNote || 'Add your inputs and we’ll generate a clear action plan you can follow.'}
              </Typography>
              {loadError ? <Alert severity="warning" sx={{ mb: 2 }}>{loadError}</Alert> : null}
              <Button variant="contained" onClick={() => navigate(continueTo)}>
                {continueLabel}
              </Button>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <Card>
            <CardContent>
              <Typography variant="subtitle1" sx={{ mb: 0.5 }}>
                Disclaimer
              </Typography>
              <Typography variant="body2" color="text.secondary">
                This tool is for educational purposes only and is not financial advice.
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Stack>
  )
}


