import { AppBar, Box, Button, Container, Stack, Toolbar, Typography } from '@mui/material'
import { alpha } from '@mui/material/styles'
import { useMemo } from 'react'
import { Link as RouterLink, Outlet, matchPath, useLocation } from 'react-router-dom'

import { tokens } from '../../theme/tokens'
import { MockAuthService } from '../../services/MockAuthService'
import { AppBackground } from './AppBackground'

function TopNavLink(props: { to: string; label: string }) {
  const location = useLocation()
  const isActive = !!matchPath({ path: props.to, end: true }, location.pathname)
  return (
    <Button
      component={RouterLink}
      to={props.to}
      color="inherit"
      aria-current={isActive ? 'page' : undefined}
      sx={{
        px: 1.5,
        minHeight: 36,
        borderRadius: 999,
        color: isActive ? 'primary.main' : 'text.primary',
        bgcolor: isActive ? ((theme) => alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.18 : 0.10)) : 'transparent',
        border: '1px solid',
        borderColor: isActive
          ? ((theme) => alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.30 : 0.20))
          : ((theme) => alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.10 : 0.08)),
        '&:hover': {
          bgcolor: (theme) => alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.14 : 0.08),
          borderColor: (theme) => alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.24 : 0.16),
        },
      }}
    >
      {props.label}
    </Button>
  )
}

export function AppLayout() {
  const location = useLocation()
  const user = useMemo(() => new MockAuthService().getUser(), [location.key])

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBackground />

      <Box sx={{ position: 'relative', zIndex: 1 }}>
        <AppBar position="sticky">
          <Container maxWidth={tokens.layout.maxContentWidth}>
            <Toolbar disableGutters sx={{ minHeight: 64 }}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ flex: 1 }}>
                <Typography
                  component={RouterLink}
                  to="/"
                  variant="subtitle1"
                  color="text.primary"
                  sx={{ textDecoration: 'none' }}
                >
                  AI Wealth Planner
                </Typography>
                <Box sx={{ flex: 1 }} />
                <TopNavLink to="/" label="Home" />
                <TopNavLink to="/planner" label="Planner" />
                <TopNavLink to="/plan" label="Plan" />
                <TopNavLink to="/settings" label="Settings" />
                <Button
                  component={RouterLink}
                  to="/signin"
                  color="inherit"
                  sx={{
                    px: 1.5,
                    minHeight: 36,
                    borderRadius: 999,
                    color: !!matchPath({ path: '/signin', end: true }, location.pathname)
                      ? 'primary.main'
                      : 'text.primary',
                    bgcolor: !!matchPath({ path: '/signin', end: true }, location.pathname)
                      ? ((theme) => alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.18 : 0.10))
                      : 'transparent',
                    border: '1px solid',
                    borderColor: !!matchPath({ path: '/signin', end: true }, location.pathname)
                      ? ((theme) => alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.30 : 0.20))
                      : ((theme) => alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.10 : 0.08)),
                    '&:hover': {
                      bgcolor: (theme) => alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.14 : 0.08),
                      borderColor: (theme) => alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.24 : 0.16),
                    },
                  }}
                >
                  {user ? `Signed in: ${user.name || user.email || 'User'}` : 'Sign in'}
                </Button>
              </Stack>
            </Toolbar>
          </Container>
        </AppBar>

        <Container maxWidth={tokens.layout.maxContentWidth} sx={{ py: tokens.layout.pageGutterY }}>
          <Outlet />
        </Container>
      </Box>
    </Box>
  )
}


