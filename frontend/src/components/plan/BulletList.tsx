import { Box, Typography } from '@mui/material'

export function BulletList(props: { items?: (string | null | undefined)[] }) {
  const items = (props.items ?? []).filter((x): x is string => !!x && x.trim().length > 0)
  if (!items.length) return null
  return (
    <Box component="ul" sx={{ m: 0, pl: 3 }}>
      {items.map((it, idx) => (
        <Box key={idx} component="li" sx={{ mb: 0.5 }}>
          <Typography variant="body2" component="span">
            {it}
          </Typography>
        </Box>
      ))}
    </Box>
  )
}


