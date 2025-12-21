import MenuIcon from '@mui/icons-material/Menu'
import { Box, Divider, Drawer, IconButton, List, ListItemButton, ListItemText, Paper, Stack, Typography, useMediaQuery } from '@mui/material'
import { alpha, useTheme } from '@mui/material/styles'
import { useMemo, useState } from 'react'
import { Link as RouterLink, Outlet, matchPath, useLocation } from 'react-router-dom'

const NAV_WIDTH = 248

type NavItem = { to: string; label: string }

function usePlanNavItems(): NavItem[] {
  return useMemo(
    () => [
      { to: '/plan', label: 'Overview' },
      { to: '/plan/timeline', label: 'Timeline' },
      { to: '/plan/calendar', label: 'Calendar' },
      { to: '/plan/checkin', label: 'Check-in' },
      { to: '/plan/debt', label: 'Debt' },
      { to: '/plan/investing', label: 'Investing' },
      { to: '/plan/risks', label: 'Risks' },
    ],
    [],
  )
}

function PlanNav(props: { onNavigate?: () => void }) {
  const location = useLocation()
  const items = usePlanNavItems()

  return (
    <Stack spacing={1} sx={{ p: 1 }}>
      <Box sx={{ px: 1, py: 1 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 750 }}>
          Plan
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Sections
        </Typography>
      </Box>
      <Divider />
      <List dense disablePadding sx={{ display: 'grid', gap: 0.5, pt: 1 }}>
        {items.map((it) => {
          const isActive = !!matchPath({ path: it.to, end: it.to === '/plan' }, location.pathname)
          return (
            <ListItemButton
              key={it.to}
              component={RouterLink}
              to={it.to}
              onClick={props.onNavigate}
              selected={isActive}
              sx={{
                borderRadius: 2,
                px: 1.25,
                '&.Mui-selected': {
                  bgcolor: (theme) => alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.18 : 0.10),
                  '&:hover': {
                    bgcolor: (theme) => alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.22 : 0.12),
                  },
                },
              }}
            >
              <ListItemText
                primary={it.label}
                primaryTypographyProps={{
                  fontWeight: isActive ? 750 : 600,
                }}
              />
            </ListItemButton>
          )
        })}
      </List>
    </Stack>
  )
}

export function PlanLayout() {
  const theme = useTheme()
  const showDesktopNav = useMediaQuery(theme.breakpoints.up('md'))

  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <Box sx={{ display: 'flex', gap: 2 }}>
      {showDesktopNav ? (
        <Box sx={{ width: NAV_WIDTH, flexShrink: 0, display: { xs: 'none', md: 'block' } }}>
          <Paper
            variant="outlined"
            sx={{
              width: NAV_WIDTH,
              borderRadius: 3,
              position: 'sticky',
              top: 88,
            }}
          >
            <PlanNav />
          </Paper>
        </Box>
      ) : null}

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{ display: { xs: 'flex', md: 'none' }, mb: 2 }}
        >
          <Typography variant="subtitle1" sx={{ fontWeight: 750 }}>
            Plan
          </Typography>
          <IconButton aria-label="Open plan sections" onClick={() => setMobileOpen(true)}>
            <MenuIcon />
          </IconButton>
        </Stack>

        <Outlet />
      </Box>

      <Drawer
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        variant="temporary"
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: 'block', md: 'none' },
          '& .MuiDrawer-paper': {
            width: NAV_WIDTH,
          },
        }}
      >
        <PlanNav onNavigate={() => setMobileOpen(false)} />
      </Drawer>
    </Box>
  )
}


