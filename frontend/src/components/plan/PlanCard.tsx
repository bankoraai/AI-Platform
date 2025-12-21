import { Card, CardContent, Stack, Typography } from '@mui/material'
import type { ReactNode } from 'react'

export type PlanCardProps = {
  title: string
  subtitle?: string
  children: ReactNode
  actions?: ReactNode
}

export function PlanCard({ title, subtitle, children, actions }: PlanCardProps) {
  return (
    <Card>
      <CardContent>
        <Stack spacing={1.5}>
          <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={2}>
            <div>
              <Typography variant="subtitle1">{title}</Typography>
              {subtitle ? (
                <Typography variant="body2" color="text.secondary">
                  {subtitle}
                </Typography>
              ) : null}
            </div>
            {actions ? <div>{actions}</div> : null}
          </Stack>
          {children}
        </Stack>
      </CardContent>
    </Card>
  )
}


