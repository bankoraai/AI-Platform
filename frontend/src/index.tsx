import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { CssBaseline, ThemeProvider } from '@mui/material'
import { AppGlobalStyles, theme } from './theme'

const root = createRoot(document.getElementById('root')!)
root.render(
	<StrictMode>
		<ThemeProvider theme={theme}>
			<CssBaseline />
			<AppGlobalStyles />
			<App />
		</ThemeProvider>
	</StrictMode>
)


