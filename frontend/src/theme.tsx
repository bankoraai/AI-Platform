import { alpha, createTheme } from '@mui/material/styles'
import { GlobalStyles } from '@mui/material'

// Futuristic light palette (clean, glassy, non-neon)
const primary = '#0B5ED7' // blue
const secondary = '#6366F1' // indigo
const backgroundDefault = '#F6F8FB'
const backgroundPaper = '#FFFFFF'

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: primary },
    secondary: { main: secondary },
    background: { default: backgroundDefault, paper: backgroundPaper },
    text: { primary: '#0F172A', secondary: '#465164' }
  },
  typography: {
    fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', 'Apple Color Emoji', 'Segoe UI Emoji'",
    h1: { letterSpacing: 0.4, fontWeight: 800 },
    h2: { letterSpacing: 0.3, fontWeight: 800 },
    h3: { letterSpacing: 0.3, fontWeight: 700 },
    button: { textTransform: 'none', letterSpacing: 0.2 }
  },
  shape: { borderRadius: 14 },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        'html, body, #root': { height: '100%' },
        body: {
          backgroundColor: backgroundDefault,
          backgroundImage:
            `radial-gradient(900px 600px at -10% -10%, ${alpha('#93C5FD', 0.18)} 0%, transparent 55%),
             radial-gradient(900px 600px at 110% -10%, ${alpha('#A5B4FC', 0.16)} 0%, transparent 55%),
             radial-gradient(900px 600px at 50% 110%, ${alpha('#86EFAC', 0.12)} 0%, transparent 60%)`
        }
      }
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundColor: backgroundPaper,
          backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.85), rgba(255,255,255,0.95))',
          border: `1px solid ${alpha('#0F172A', 0.06)}`,
          boxShadow: '0 10px 24px rgba(2,6,23,0.06)'
        }
      }
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderWidth: 1,
          transition: 'transform .15s ease, box-shadow .15s ease',
          '&:hover': {
            transform: 'translateY(-1px)',
            boxShadow: `0 10px 22px ${alpha(primary, 0.18)}`
          }
        },
        outlined: {
          borderColor: alpha('#0F172A', 0.12)
        }
      }
    },
    MuiTabs: {
      styleOverrides: {
        root: { minHeight: 44 },
        indicator: {
          height: 3,
          borderRadius: 3,
          background: `linear-gradient(90deg, ${primary}, ${alpha(secondary, 0.9)})`
        }
      }
    },
    MuiTab: {
      styleOverrides: {
        root: {
          minHeight: 44,
          fontWeight: 600,
          letterSpacing: 0.25
        }
      }
    },
    MuiTableContainer: {
      styleOverrides: {
        root: {
          backgroundColor: backgroundPaper,
          border: `1px solid ${alpha('#0F172A', 0.06)}`,
          boxShadow: 'none'
        }
      }
    },
    MuiTableCell: {
      styleOverrides: {
        head: {
          color: alpha('#0F172A', 0.8),
          borderBottom: `1px solid ${alpha('#0F172A', 0.08)}`
        },
        body: {
          borderBottom: `1px solid ${alpha('#0F172A', 0.05)}`
        }
      }
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          backgroundColor: alpha('#DC3545', 0.08),
          border: `1px solid ${alpha('#DC3545', 0.2)}`
        }
      }
    },
    MuiSlider: {
      styleOverrides: {
        root: { paddingTop: 14, paddingBottom: 14 },
        track: { background: primary },
        rail: { opacity: 0.25 },
        thumb: { boxShadow: `0 0 0 6px ${alpha(primary, 0.14)}` }
      }
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: { borderRadius: 10, fontSize: 12 }
      }
    }
  }
})

export function AppGlobalStyles() {
  return (
    <GlobalStyles styles={{
      '@keyframes backgroundDrift': {
        '0%': { transform: 'translate3d(0,0,0) scale(1)' },
        '50%': { transform: 'translate3d(-1.5%, -1.5%, 0) scale(1.02)' },
        '100%': { transform: 'translate3d(0,0,0) scale(1)' }
      },
      'body::after': {
        content: '""',
        position: 'fixed',
        inset: -200,
        zIndex: -1,
        pointerEvents: 'none',
        backgroundImage:
          `radial-gradient(600px 600px at 20% 10%, ${alpha('#93C5FD', 0.16)} 0%, transparent 55%),
           radial-gradient(700px 700px at 80% 0%, ${alpha('#A5B4FC', 0.14)} 0%, transparent 55%),
           radial-gradient(800px 800px at 50% 100%, ${alpha('#86EFAC', 0.10)} 0%, transparent 60%)`,
        animation: 'backgroundDrift 24s ease-in-out infinite'
      },
      '.glass': {
        background: 'linear-gradient(180deg, rgba(255,255,255,0.86), rgba(255,255,255,0.96))',
        border: `1px solid ${alpha('#0F172A', 0.06)}`,
        boxShadow: '0 10px 24px rgba(2,6,23,0.06)',
        backdropFilter: 'saturate(1.05) blur(6px)'
      }
    }} />
  )
}
