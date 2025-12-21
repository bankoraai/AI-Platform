import { Box } from '@mui/material'
import { alpha, useTheme } from '@mui/material/styles'

export function AppBackground() {
  const theme = useTheme()
  const isDark = theme.palette.mode === 'dark'

  const primary = theme.palette.primary.main
  const secondary = theme.palette.secondary.main

  const wash1 = alpha(primary, isDark ? 0.12 : 0.10)
  const wash2 = alpha(secondary, isDark ? 0.10 : 0.09)
  const highlight1 = alpha('#ffffff', isDark ? 0.10 : 0.55)
  const highlight2 = alpha('#ffffff', isDark ? 0.06 : 0.40)

  return (
    <Box
      aria-hidden="true"
      sx={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
        // Base wash (very subtle so text stays readable)
        background:
          `radial-gradient(1200px 800px at 20% -10%, ${wash1}, transparent 60%), radial-gradient(900px 700px at 110% 30%, ${wash2}, transparent 55%)`,
        '&::after': {
          content: '""',
          position: 'absolute',
          inset: 0,
          background:
            `radial-gradient(900px 700px at 20% 30%, ${highlight1}, transparent 60%), radial-gradient(800px 650px at 85% 20%, ${highlight2}, transparent 55%)`,
          opacity: isDark ? 0.35 : 0.55,
        },
        '@keyframes auroraFloat1': {
          '0%': { transform: 'translate(-10%, -8%) scale(1)' },
          '50%': { transform: 'translate(10%, 6%) scale(1.06)' },
          '100%': { transform: 'translate(-10%, -8%) scale(1)' },
        },
        '@keyframes auroraFloat2': {
          '0%': { transform: 'translate(8%, 6%) scale(1)' },
          '50%': { transform: 'translate(-6%, -10%) scale(1.08)' },
          '100%': { transform: 'translate(8%, 6%) scale(1)' },
        },
        '@keyframes auroraFloat3': {
          '0%': { transform: 'translate(0%, 10%) scale(1)' },
          '50%': { transform: 'translate(6%, -6%) scale(1.05)' },
          '100%': { transform: 'translate(0%, 10%) scale(1)' },
        },
        '@media (prefers-reduced-motion: reduce)': {
          '& .auroraBlob': {
            animation: 'none !important',
          },
        },
      }}
    >
      <Box
        className="auroraBlob"
        sx={{
          position: 'absolute',
          width: { xs: 520, md: 760 },
          height: { xs: 520, md: 760 },
          left: { xs: -220, md: -260 },
          top: { xs: -240, md: -300 },
          borderRadius: '999px',
          filter: 'blur(80px)',
          opacity: isDark ? 0.22 : 0.38,
          background: `radial-gradient(circle at 30% 30%, ${alpha(primary, isDark ? 0.45 : 0.55)}, transparent 62%)`,
          animation: 'auroraFloat1 18s ease-in-out infinite',
          mixBlendMode: isDark ? 'screen' : 'multiply',
        }}
      />
      <Box
        className="auroraBlob"
        sx={{
          position: 'absolute',
          width: { xs: 460, md: 680 },
          height: { xs: 460, md: 680 },
          right: { xs: -220, md: -260 },
          top: { xs: 40, md: 40 },
          borderRadius: '999px',
          filter: 'blur(85px)',
          opacity: isDark ? 0.20 : 0.34,
          background: `radial-gradient(circle at 60% 40%, ${alpha(secondary, isDark ? 0.42 : 0.55)}, transparent 62%)`,
          animation: 'auroraFloat2 22s ease-in-out infinite',
          mixBlendMode: isDark ? 'screen' : 'multiply',
        }}
      />
      <Box
        className="auroraBlob"
        sx={{
          position: 'absolute',
          width: { xs: 520, md: 760 },
          height: { xs: 520, md: 760 },
          left: { xs: '18%', md: '28%' },
          bottom: { xs: -300, md: -360 },
          borderRadius: '999px',
          filter: 'blur(95px)',
          opacity: isDark ? 0.14 : 0.22,
          background: `radial-gradient(circle at 40% 60%, ${alpha(primary, isDark ? 0.26 : 0.36)}, transparent 65%)`,
          animation: 'auroraFloat3 26s ease-in-out infinite',
          mixBlendMode: isDark ? 'screen' : 'multiply',
        }}
      />
    </Box>
  )
}


