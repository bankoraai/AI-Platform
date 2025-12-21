import { useMemo } from 'react'
import { Link as RouterLink, useOutletContext } from 'react-router-dom'
import { Button, Stack } from '@mui/material'

import type { PlanOutletContext } from './PlanRoute'
import type { PlanJson } from './PlanTypes'
import { PlanCard } from '../../components/plan/PlanCard'
import { BulletList } from '../../components/plan/BulletList'
import { PlanLegacyText } from './PlanLegacyText'
import { TaskChecklist, usePlanTasks } from '../../components/plan/TaskChecklist'

function asPlanJson(value: unknown): PlanJson | null {
  if (!value || typeof value !== 'object') return null
  return value as PlanJson
}

export function PlanTimelinePage() {
  const { plan } = useOutletContext<PlanOutletContext>()
  const planJson = asPlanJson(plan.plan_json)
  const { tasks, busy, error, toggle } = usePlanTasks(plan.id)
  const fallback = useMemo(() => <BulletList items={planJson?.immediate_next_7_days?.steps} />, [planJson])

  if (!planJson) return <PlanLegacyText text={plan.plan_text} />

  return (
    <Stack spacing={2}>
      <PlanCard title="Immediate next 7 days" actions={<Button component={RouterLink} to="/plan">Back to dashboard</Button>}>
        <TaskChecklist tasks={tasks} busy={busy} error={error} onToggle={toggle} empty={fallback} />
      </PlanCard>

      <PlanCard title="0–3 months (weekly milestones)">
        <BulletList items={planJson.timeline_0_3_months?.milestones} />
      </PlanCard>

      <PlanCard title="3–12 months (monthly milestones)">
        <BulletList items={planJson.timeline_3_12_months?.milestones} />
      </PlanCard>
    </Stack>
  )
}


