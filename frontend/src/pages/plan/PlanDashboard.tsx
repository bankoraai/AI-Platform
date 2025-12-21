import { useEffect, useMemo, useState } from 'react'
import { Link as RouterLink, useOutletContext } from 'react-router-dom'
import { Box, Button, Collapse, Grow, LinearProgress, Stack, Typography, useMediaQuery } from '@mui/material'
import Grid from '@mui/material/Grid'

import type { PlanOutletContext } from './PlanRoute'
import type { PlanJson } from './PlanTypes'
import { PlanCard } from '../../components/plan/PlanCard'
import { BulletList } from '../../components/plan/BulletList'
import { bootstrapApp } from '../../bootstrap'
import type { CheckInLatestOut, TaskOut } from '../../api/ApiClient'

function asPlanJson(value: unknown): PlanJson | null {
  if (!value || typeof value !== 'object') return null
  return value as PlanJson
}

export function PlanDashboardPage() {
  const { plan } = useOutletContext<PlanOutletContext>()
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const planJson = useMemo(() => asPlanJson(plan.plan_json), [plan.plan_json])
  const api = useMemo(() => bootstrapApp().getApi(), [])
  const [tasks, setTasks] = useState<TaskOut[] | null>(null)
  const [latestCheckin, setLatestCheckin] = useState<CheckInLatestOut | null>(null)

  // Backward-compatible fallback: old plans without JSON show the legacy renderer in the details pages.
  if (!planJson) {
    return (
      <PlanCard
        title="Legacy plan view"
        subtitle="This plan was generated before the structured dashboard was enabled."
        actions={
          <Button component={RouterLink} to="/plan/timeline" variant="contained">
            View as text
          </Button>
        }
      >
        <Typography variant="body2" color="text.secondary">
          Generate a new plan to see the animated dashboard layout.
        </Typography>
      </PlanCard>
    )
  }

  const currency = (planJson.meta?.currency || 'USD').toUpperCase()
  const title = planJson.meta?.title || 'Financial Independence Plan'
  const completedCount = (tasks ?? []).filter((t) => !!t.completed_at).length
  const totalCount = tasks?.length ?? 0
  const pct = totalCount ? Math.round((completedCount / totalCount) * 100) : 0
  const nextTasks = (tasks ?? []).filter((t) => !t.completed_at).slice(0, 3)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const t = await api.getTasks(plan.id)
        if (!cancelled) setTasks(t)
      } catch {
        // Dashboard should still render without tasks.
        if (!cancelled) setTasks([])
      }

      try {
        const c = await api.getLatestCheckin(plan.profile_id)
        if (!cancelled) setLatestCheckin(c)
      } catch {
        if (!cancelled) setLatestCheckin(null)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [api, plan.id, plan.profile_id])

  return (
    <Stack spacing={2.5}>
      <Box>
        <Typography variant="h2" sx={{ mb: 0.5 }}>
          {title}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Currency: <strong>{currency}</strong>
        </Typography>
      </Box>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12 }}>
          <Grow in timeout={reducedMotion ? 0 : 180}>
            <div>
              <PlanCard
                title="Progress (7-day tasks)"
                actions={
                  <Button component={RouterLink} to="/plan/timeline" size="small">
                    Open tasks
                  </Button>
                }
              >
                {totalCount ? (
                  <Stack spacing={1}>
                    <Typography variant="body2" color="text.secondary">
                      {completedCount} / {totalCount} completed ({pct}%)
                    </Typography>
                    <LinearProgress variant="determinate" value={pct} />
                    {nextTasks.length ? (
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5 }}>
                          Next recommendations
                        </Typography>
                        <BulletList items={nextTasks.map((t) => t.title)} />
                      </Box>
                    ) : null}
                    {latestCheckin ? (
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5 }}>
                          Last check-in
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {latestCheckin.checkin_month}: you’re <strong>{latestCheckin.ahead_behind.replace('_', ' ')}</strong>
                        </Typography>
                      </Box>
                    ) : null}
                  </Stack>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    Generate a new plan to enable interactive tasks.
                  </Typography>
                )}
              </PlanCard>
            </div>
          </Grow>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Grow in timeout={reducedMotion ? 0 : 250}>
            <div>
              <PlanCard
                title="Summary"
                actions={
                  <Button component={RouterLink} to="/plan/timeline" size="small">
                    View timeline
                  </Button>
                }
              >
                <BulletList items={planJson.summary?.bullets} />
              </PlanCard>
            </div>
          </Grow>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Grow in timeout={reducedMotion ? 0 : 350}>
            <div>
              <PlanCard title="What to do next (7 days)" actions={<Button component={RouterLink} to="/plan/timeline">Open</Button>}>
                <BulletList items={(planJson.immediate_next_7_days?.steps ?? []).slice(0, 4)} />
              </PlanCard>
            </div>
          </Grow>
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <Grow in timeout={reducedMotion ? 0 : 450}>
            <div>
              <PlanCard title="0–3 months" actions={<Button component={RouterLink} to="/plan/timeline">Open</Button>}>
                <BulletList items={(planJson.timeline_0_3_months?.milestones ?? []).slice(0, 3)} />
              </PlanCard>
            </div>
          </Grow>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Grow in timeout={reducedMotion ? 0 : 520}>
            <div>
              <PlanCard title="3–12 months" actions={<Button component={RouterLink} to="/plan/timeline">Open</Button>}>
                <BulletList items={(planJson.timeline_3_12_months?.milestones ?? []).slice(0, 3)} />
              </PlanCard>
            </div>
          </Grow>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Grow in timeout={reducedMotion ? 0 : 600}>
            <div>
              <PlanCard title="Risks" actions={<Button component={RouterLink} to="/plan/risks">Open</Button>}>
                <BulletList items={(planJson.risks?.bullets ?? []).slice(0, 3)} />
              </PlanCard>
            </div>
          </Grow>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Grow in timeout={reducedMotion ? 0 : 700}>
            <div>
              <PlanCard title="Debt payoff strategy" actions={<Button component={RouterLink} to="/plan/debt">Open</Button>}>
                <BulletList items={(planJson.debt_strategy?.prioritization ?? []).slice(0, 4)} />
              </PlanCard>
            </div>
          </Grow>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Grow in timeout={reducedMotion ? 0 : 780}>
            <div>
              <PlanCard title="Investing strategy" actions={<Button component={RouterLink} to="/plan/investing">Open</Button>}>
                <BulletList items={(planJson.investing_strategy?.bullets ?? []).slice(0, 4)} />
              </PlanCard>
            </div>
          </Grow>
        </Grid>

        <Grid size={{ xs: 12 }}>
          <Collapse in timeout={reducedMotion ? 0 : 300}>
            <div>
              <PlanCard title="Assumptions">
                <BulletList items={planJson.meta?.assumptions} />
              </PlanCard>
            </div>
          </Collapse>
        </Grid>
      </Grid>
    </Stack>
  )
}


