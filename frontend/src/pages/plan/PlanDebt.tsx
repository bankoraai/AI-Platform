import { Link as RouterLink, useOutletContext } from 'react-router-dom'
import { Button, Stack, Typography } from '@mui/material'

import type { PlanOutletContext } from './PlanRoute'
import type { PlanJson } from './PlanTypes'
import { PlanCard } from '../../components/plan/PlanCard'
import { BulletList } from '../../components/plan/BulletList'
import { PlanLegacyText } from './PlanLegacyText'

function asPlanJson(value: unknown): PlanJson | null {
  if (!value || typeof value !== 'object') return null
  return value as PlanJson
}

export function PlanDebtPage() {
  const { plan } = useOutletContext<PlanOutletContext>()
  const planJson = asPlanJson(plan.plan_json)

  if (!planJson) return <PlanLegacyText text={plan.plan_text} />

  return (
    <Stack spacing={2}>
      <PlanCard title="Debt payoff strategy" actions={<Button component={RouterLink} to="/plan">Back to dashboard</Button>}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Prioritization
        </Typography>
        <BulletList items={planJson.debt_strategy?.prioritization} />
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2, mb: 1 }}>
          Notes
        </Typography>
        <BulletList items={planJson.debt_strategy?.payoff_notes} />
      </PlanCard>
    </Stack>
  )
}


