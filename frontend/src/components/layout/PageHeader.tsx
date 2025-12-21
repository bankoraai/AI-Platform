import { Box, Stack, Typography } from '@mui/material'
import type { ReactNode } from 'react'

export type PageHeaderProps = {
  title: string
  subtitle?: string
  actions?: ReactNode
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <Box sx={{ mb: 3 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} gap={2} alignItems={{ sm: 'flex-end' }} justifyContent="space-between">
        <Box>
          <Typography variant="h2" sx={{ mb: subtitle ? 0.5 : 0, letterSpacing: '-0.01em' }}>
            {title}
          </Typography>
          {subtitle ? (
            <Typography variant="body2" color="text.secondary">
              {subtitle}
            </Typography>
          ) : null}
        </Box>
        {actions ? <Box sx={{ flexShrink: 0 }}>{actions}</Box> : null}
      </Stack>
    </Box>
  )
}


