import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { BrowserRouter } from 'react-router-dom'
import { bootstrapApp } from './bootstrap'
import { CssBaseline } from '@mui/material'
import { ThemeProvider } from '@mui/material/styles'
import { useMemo } from 'react'

import { createAppTheme } from './theme/theme'
import { ThemePreferencesProvider, useThemePreferences } from './theme/preferences'

bootstrapApp()

function AppTheming() {
  const { preferences } = useThemePreferences()
  const theme = useMemo(() => createAppTheme(preferences), [preferences])
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ThemeProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemePreferencesProvider>
      <AppTheming />
    </ThemePreferencesProvider>
  </StrictMode>,
)
