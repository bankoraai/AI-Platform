import { Link as RouterLink, useOutletContext } from 'react-router-dom'
import { Button, Stack } from '@mui/material'

import type { PlanOutletContext } from './PlanRoute'
import type { PlanJson } from './PlanTypes'
import { PlanCard } from '../../components/plan/PlanCard'
import { BulletList } from '../../components/plan/BulletList'
import { PlanLegacyText } from './PlanLegacyText'

function asPlanJson(value: unknown): PlanJson | null {
  if (!value || typeof value !== 'object') return null
  return value as PlanJson
}

export function PlanRisksPage() {
  const { plan } = useOutletContext<PlanOutletContext>()
  const planJson = asPlanJson(plan.plan_json)

  if (!planJson) return <PlanLegacyText text={plan.plan_text} />

  return (
    <Stack spacing={2}>
      <PlanCard title="Risks & pitfalls" actions={<Button component={RouterLink} to="/plan">Back to dashboard</Button>}>
        <BulletList items={planJson.risks?.bullets} />
      </PlanCard>
    </Stack>
  )
}


