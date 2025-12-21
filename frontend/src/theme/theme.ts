import { alpha, createTheme } from '@mui/material/styles'

import { tokens } from './tokens'

export type ThemeMode = 'light' | 'dark'
export type ThemeAccent = 'blue' | 'teal'
export type ThemeDensity = 'comfortable' | 'compact'

export type AppThemeOptions = {
  mode: ThemeMode
  accent: ThemeAccent
  density: ThemeDensity
}

const ACCENTS: Record<ThemeAccent, { primary: string; secondary: string }> = {
  blue: { primary: '#2563eb', secondary: '#0f766e' },
  teal: { primary: '#0f766e', secondary: '#2563eb' },
}

export function createAppTheme(options: AppThemeOptions) {
  const accent = ACCENTS[options.accent]
  const isDark = options.mode === 'dark'
  const spacingBase = options.density === 'compact' ? 6 : 8

  const divider = isDark ? alpha('#e2e8f0', 0.12) : alpha('#0f172a', 0.12)
  const borderSubtle = isDark ? alpha('#e2e8f0', 0.10) : alpha('#0f172a', tokens.border.subtleAlpha)
  const focusRing = (color: string) => `0 0 0 3px ${alpha(color, isDark ? 0.34 : 0.22)}`

  return createTheme({
    spacing: spacingBase,
    palette: {
      mode: options.mode,
      primary: { main: accent.primary },
      secondary: { main: accent.secondary },
      background: isDark
        ? {
            default: '#0b1220',
            paper: '#0f172a',
          }
        : {
            default: '#f7f8fb',
            paper: '#ffffff',
          },
      divider,
      text: isDark
        ? {
            primary: '#e5e7eb',
            secondary: alpha('#e5e7eb', 0.72),
          }
        : {
            primary: '#0f172a',
            secondary: alpha('#0f172a', 0.72),
          },
    },
    shape: { borderRadius: tokens.radius.md },
    typography: {
      fontFamily: tokens.typography.fontFamily,
      h1: { fontSize: '2rem', fontWeight: 750, lineHeight: 1.16, letterSpacing: '-0.02em' },
      h2: { fontSize: '1.5rem', fontWeight: 750, lineHeight: 1.22, letterSpacing: '-0.015em' },
      h3: { fontSize: '1.25rem', fontWeight: 750, lineHeight: 1.26 },
      subtitle1: { fontSize: '1rem', fontWeight: 650 },
      body1: { fontSize: '1rem', lineHeight: 1.55 },
      body2: { fontSize: '0.875rem', lineHeight: 1.55 },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            WebkitFontSmoothing: 'antialiased',
            MozOsxFontSmoothing: 'grayscale',
          },
          ':root': {
            colorScheme: options.mode,
          },
          '@media (prefers-reduced-motion: reduce)': {
            '.auroraBlob': {
              animation: 'none !important',
            },
          },
        },
      },
      MuiButtonBase: {
        styleOverrides: {
          root: {
            '&.Mui-focusVisible': {
              outline: 'none',
              boxShadow: focusRing(accent.primary),
            },
          },
        },
      },
      MuiButton: {
        defaultProps: {
          disableElevation: true,
          size: options.density === 'compact' ? 'small' : 'medium',
        },
        styleOverrides: {
          root: {
            borderRadius: tokens.radius.md,
            textTransform: 'none',
            fontWeight: 650,
          },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            '&.Mui-focusVisible': {
              boxShadow: focusRing(accent.primary),
            },
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: tokens.radius.lg,
            border: '1px solid',
            borderColor: borderSubtle,
            boxShadow: isDark ? 'none' : tokens.shadow.sm,
          },
        },
      },
      MuiTextField: {
        defaultProps: {
          size: 'small',
          variant: 'outlined',
          fullWidth: true,
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: tokens.radius.md,
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderWidth: 2,
            },
            '&.Mui-focused': {
              boxShadow: focusRing(accent.primary),
            },
          },
          input: {
            paddingTop: options.density === 'compact' ? 8 : 10,
            paddingBottom: options.density === 'compact' ? 8 : 10,
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: tokens.radius.md,
            fontWeight: 650,
          },
        },
      },
      MuiTabs: {
        styleOverrides: {
          root: {
            minHeight: options.density === 'compact' ? 40 : 44,
          },
          indicator: {
            height: 3,
            borderRadius: 999,
          },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            fontWeight: 650,
            minHeight: options.density === 'compact' ? 40 : 44,
          },
        },
      },
      MuiAlert: {
        styleOverrides: {
          root: {
            borderRadius: tokens.radius.md,
            border: `1px solid ${borderSubtle}`,
          },
        },
      },
      MuiMenuItem: {
        styleOverrides: {
          root: {
            borderRadius: tokens.radius.md,
            '&.Mui-focusVisible': {
              boxShadow: focusRing(accent.primary),
            },
          },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: tokens.radius.md,
            '&.Mui-focusVisible': {
              boxShadow: focusRing(accent.primary),
            },
          },
        },
      },
      MuiContainer: {
        defaultProps: {
          maxWidth: tokens.layout.maxContentWidth,
        },
      },
      MuiAppBar: {
        defaultProps: {
          color: 'transparent',
          elevation: 0,
        },
        styleOverrides: {
          root: {
            borderBottom: `1px solid ${borderSubtle}`,
            backgroundColor: isDark ? alpha('#0b1220', 0.78) : alpha('#ffffff', 0.82),
            backdropFilter: 'blur(10px)',
          },
        },
      },
    },
  })
}


