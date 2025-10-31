import { useEffect, useState } from 'react'
import { authLoginUrl, fetchAccounts, getPoalimSettings, savePoalimSettings, generateAiInsights, simulateInsightAction } from './lib/api'
import FinancialSnapshot from './components/FinancialSnapshot'
import StocksPanel from './components/StocksPanel'
import type { Account, AccountBalance, SavingsAccount, Loan } from './lib/types'
import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    Container,
    IconButton,
    Paper,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Slider,
    Stack,
    Tab,
    Tabs,
	LinearProgress,
	Grid,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Tooltip,
	Typography,
    Switch,
	FormControlLabel,
	Divider
} from '@mui/material'
import MenuItem from '@mui/material/MenuItem'
// icon imports trimmed to only those used
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import PauseIcon from '@mui/icons-material/Pause'


// Types moved to ./lib/types

type Budget = {
    id: string
    name: string
    limit: number
    spent: number
    color?: string
}

export default function App() {
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [accounts, setAccounts] = useState<Account[] | null>(null)
	const [tab, setTab] = useState(0)
    const [accountsSubTab, setAccountsSubTab] = useState(0)
    

	// Settings state
	const [clientId, setClientId] = useState('')
	const [clientSecret, setClientSecret] = useState('')
	const [hasSecret, setHasSecret] = useState(false)
	const [redirectUri, setRedirectUri] = useState('')
	const [authorizationUrl, setAuthorizationUrl] = useState('')
	const [tokenUrl, setTokenUrl] = useState('')
	const [apiBaseUrl, setApiBaseUrl] = useState('')
	const [accountsEndpoint, setAccountsEndpoint] = useState('')
	const [demoMode, setDemoMode] = useState(false)
	const [saving, setSaving] = useState(false)
	const [saveMsg, setSaveMsg] = useState<string | null>(null)
	const [aiLoading, setAiLoading] = useState(false)
	const [aiError, setAiError] = useState<string | null>(null)
	const [aiText, setAiText] = useState<string | null>(null)
	const [planRows, setPlanRows] = useState<Array<{ action: string; amount?: string; horizon?: string; impact?: string }> | null>(null)
	const [currentStep, setCurrentStep] = useState(0)
	const [completedActions, setCompletedActions] = useState<string[]>([])
	const [aiNotes, setAiNotes] = useState('')

	// Budgets state
	const [budgetsMonth, setBudgetsMonth] = useState<string>(() => {
		const d = new Date()
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
	})
	const [budgets, setBudgets] = useState<Budget[]>([])
	const [newBudgetName, setNewBudgetName] = useState('')
	const [newBudgetLimit, setNewBudgetLimit] = useState<number>(0)
	const [expenseInput, setExpenseInput] = useState<Record<string, number>>({})

	// Demo editable savings/loans
	const [demoSavings, setDemoSavings] = useState<SavingsAccount[]>([])
	const [demoLoans, setDemoLoans] = useState<Loan[]>([])
	const [newSaving, setNewSaving] = useState<Partial<SavingsAccount>>({ name: '', balance: 0, rate: 0.5, currency: 'ILS', accountId: '' })
	const [newLoan, setNewLoan] = useState<Partial<Loan>>({ name: '', principal: 0, outstanding: 0, rate: 2.5, payment: 0, currency: 'ILS', accountId: '' })

	// Insights simulation state
	const [simOpen, setSimOpen] = useState(false)
	const [simLoading, setSimLoading] = useState(false)
	const [simError, setSimError] = useState<string | null>(null)
	const [simData, setSimData] = useState<{
		series: { months: number[]; cash: number[]; savings: number[]; debt: number[]; net: number[] }
		narrative: string
	} | null>(null)
	const [simSpeed, setSimSpeed] = useState(1)
	const [simMonths, setSimMonths] = useState(24)
	const [simPlaying, setSimPlaying] = useState(true)
const [simProgress, setSimProgress] = useState(0)
const [selectedSuggestion, setSelectedSuggestion] = useState<{ action: string; amount?: string; horizon?: string; impact?: string } | null>(null)



    // Mock datasets for demo mode

    const defaultBalances: AccountBalance[] = [
        { id: 'ACC-001', available: 12050.35, current: 12453.75, currency: 'ILS' },
        { id: 'ACC-002', available: 50234.10, current: 50234.10, currency: 'ILS' },
        { id: 'ACC-STOCK', available: 0, current: 0, currency: 'ILS' },
    ]

    const defaultSavings: SavingsAccount[] = [
        { id: 'SAV-001', name: 'Emergency Fund', balance: 18000, rate: 1.2, currency: 'ILS' },
        { id: 'SAV-002', name: 'Vacation Fund', balance: 7500, rate: 0.9, currency: 'ILS' }
    ]

    const defaultLoans: Loan[] = [
        { id: 'LN-001', name: 'Car Loan', principal: 80000, outstanding: 52000, rate: 4.9, payment: 1250, currency: 'ILS' },
        { id: 'LN-002', name: 'Student Loan', principal: 60000, outstanding: 31000, rate: 3.7, payment: 850, currency: 'ILS' }
    ]

    const [demoBalances, setDemoBalances] = useState<AccountBalance[]>([])

    useEffect(() => {
        try {
            const raw = localStorage.getItem('demo_balances')
            const parsed = raw ? JSON.parse(raw) : null
            let arr: AccountBalance[] = Array.isArray(parsed) ? parsed : defaultBalances
            // Ensure at least one non-stock account exists; if none, add defaults
            const hasNonStock = arr.some(b => b.id !== 'ACC-STOCK')
            if (!hasNonStock) {
                const nonStockDefaults = defaultBalances.filter(b => b.id !== 'ACC-STOCK')
                arr = [...nonStockDefaults, ...arr]
            }
            // Ensure stocks account exists
            const hasStock = arr.some(b => b.id === 'ACC-STOCK')
            if (!hasStock) arr = [...arr, { id: 'ACC-STOCK', available: 0, current: 0, currency: 'ILS' }]
            // Deduplicate by id, keep first occurrence
            const seen = new Set<string>()
            const uniq = arr.filter(b => {
                const id = String(b.id)
                if (seen.has(id)) return false
                seen.add(id)
                return true
            })
            setDemoBalances(uniq)
        } catch {
            setDemoBalances(defaultBalances)
        }
    }, [])

    useEffect(() => {
        try { localStorage.setItem('demo_balances', JSON.stringify(demoBalances)) } catch {}
    }, [demoBalances])

	function renderFuturisticAnalysis(text: string) {
    const cleaned = (text || '')
        .replace(/\*\*\*+/g, ' ')        // remove *** blocks
        .replace(/\*\*([^*]+)\*\*/g, '$1') // strip bold markers
        .replace(/\*([^*]+)\*/g, '$1')     // strip italics
        .replace(/`([^`]+)`/g, '$1')        // strip code ticks
        .replace(/^\s*\+\s*/gm, '- ')    // convert + bullets to -
        .trim()

    const lines = cleaned.split(/\r?\n/)
		const elements: React.ReactNode[] = []
		let bullets: string[] = []

		function flushBullets() {
			if (bullets.length === 0) return
			elements.push(
            <Stack spacing={0.5} sx={{ pl: 0 }}>
					{bullets.map((b, idx) => (
                    <Typography key={`b-${idx}`} variant="body2">• {b}</Typography>
                ))}
            </Stack>
			)
			bullets = []
		}

    function emphasizeNumbers(line: string) {
        const parts = line.split(/(\b[\d][\d,\.]*\s*(?:ILS|USD|%|mo|months|years)?)/g)
			return (
				<>
					{parts.map((p, i) => {
						const isNum = /(\b[\d][\d,\.]*\s*(?:ILS|USD|%|mo|months|years)?)/.test(p)
                    return isNum ? <strong key={i}>{p}</strong> : <span key={i}>{p}</span>
					})}
				</>
			)
		}

    function boldLabel(line: string) {
        const m = /^(\s*[^:]{1,24}):\s*(.+)$/.exec(line)
        if (!m) return emphasizeNumbers(line)
        return (<><strong>{m[1]}:</strong> {emphasizeNumbers(m[2])}</>)
    }

		lines.forEach((raw, idx) => {
			const line = raw.trimEnd()
        if (!line.trim()) { flushBullets(); return }

			const h1 = /^#\s+(.+)/.exec(line)
			const h2 = /^##\s+(.+)/.exec(line)
			const h3 = /^###\s+(.+)/.exec(line)
        if (h1) { flushBullets(); elements.push(<Typography key={`h1-${idx}`} variant="subtitle1" sx={{ fontWeight: 700, mt: 2 }}>{h1[1]}</Typography>); return }
        if (h2) { flushBullets(); elements.push(<Typography key={`h2-${idx}`} variant="subtitle2" sx={{ fontWeight: 700, mt: 1.5 }}>{h2[1]}</Typography>); return }
        if (h3) { flushBullets(); elements.push(<Typography key={`h3-${idx}`} variant="subtitle2" sx={{ fontWeight: 600, mt: 1 }}>{h3[1]}</Typography>); return }

        if (/^[-*+]\s+/.test(line)) { bullets.push(line.replace(/^[-*+]\s+/, '')); return }

			if (/^(!|>)/.test(line) || /risk|warning|caution/i.test(line)) {
				flushBullets()
				elements.push(
					<Stack key={`warn-${idx}`} direction="row" spacing={1} alignItems="flex-start" sx={{ mt: 1 }}>
						<WarningAmberIcon color="warning" fontSize="small" />
                    <Typography variant="body2">{line.replace(/^(!|>)/, '').trim()}</Typography>
					</Stack>
				)
				return
			}

			flushBullets()
        elements.push(<Typography key={`p-${idx}`} variant="body2">{boldLabel(line)}</Typography>)
			if (idx < lines.length - 1) elements.push(<Divider key={`d-${idx}`} sx={{ my: 1, opacity: 0.1 }} />)
		})
		flushBullets()
		return <Stack spacing={1}>{elements}</Stack>
	}



	function linePath(values: number[], width: number, height: number, padding: number) {
		const w = width - padding * 2
		const h = height - padding * 2
		const max = Math.max(...values)
		const min = Math.min(...values)
		const n = values.length - 1
		const points = values.map((v, i) => {
			const x = padding + (i / n) * w
			const y = padding + h - ((v - min) / Math.max(1, max - min)) * h
			return `${x},${y}`
		}).join(' ')
		return `M ${points.replace(/ /g, ' L ')}`
	}

    async function load() {
        setLoading(true)
        setError(null)
        try {
            const data = await fetchAccounts()
            const accountsArray = Array.isArray((data as any)?.accounts) ? ((data as any).accounts as Account[]) : []
            setAccounts(accountsArray.length > 0 ? [accountsArray[0]] : [])
        } catch (e: any) {
            setAccounts(null)
            setError(e?.message || 'Failed to load accounts')
        } finally {
            setLoading(false)
        }
    }

    const ACCOUNTS_TAB_INDEX = 1
    useEffect(() => {
		if (tab === ACCOUNTS_TAB_INDEX) {
            load()
        }
    }, [tab])

	useEffect(() => {
		(async () => {
			try {
				const s = await getPoalimSettings()
				setClientId(s.client_id || '')
				setHasSecret(!!s.has_client_secret)
				setRedirectUri(s.redirect_uri || '')
				setAuthorizationUrl(s.authorization_url || '')
				setTokenUrl(s.token_url || '')
				setApiBaseUrl(s.api_base_url || '')
				setAccountsEndpoint(s.accounts_endpoint || '')
				setDemoMode(!!s.demo_mode)
			} catch (e) {
				// ignore settings fetch errors in UI
			}
		})()
	}, [])

	// Use backend accounts (single) for snapshot when available; otherwise fall back to demo balances
	const balancesForSnapshot: AccountBalance[] = (accounts && accounts.length)
		? accounts.map(a => ({ id: a.id || 'ACC-001', available: Number(a.balance ?? 0), current: Number(a.balance ?? 0), currency: a.currency || 'ILS' }))
		: demoBalances

	// Budgets persistence
	function budgetsStorageKey(monthKey: string) {
		return `budgets_by_month:${monthKey}`
	}

	useEffect(() => {
		try {
			const raw = localStorage.getItem(budgetsStorageKey(budgetsMonth))
			if (raw) {
				const parsed = JSON.parse(raw)
				if (Array.isArray(parsed)) setBudgets(parsed)
				else setBudgets([])
			} else {
				setBudgets([])
			}
		} catch {
			setBudgets([])
		}
	}, [budgetsMonth])

	useEffect(() => {
		try {
			localStorage.setItem(budgetsStorageKey(budgetsMonth), JSON.stringify(budgets))
		} catch {
			// ignore
		}
	}, [budgets, budgetsMonth])

	// Demo savings/loans persistence (permanent across months, simple demo)
	useEffect(() => {
		try {
			const s = localStorage.getItem('demo_savings')
			const l = localStorage.getItem('demo_loans')
			setDemoSavings(s ? JSON.parse(s) : defaultSavings)
			setDemoLoans(l ? JSON.parse(l) : defaultLoans)
		} catch {
			setDemoSavings(defaultSavings)
			setDemoLoans(defaultLoans)
		}
	}, [])

	useEffect(() => {
		try { localStorage.setItem('demo_savings', JSON.stringify(demoSavings)) } catch {}
	}, [demoSavings])
	useEffect(() => {
		try { localStorage.setItem('demo_loans', JSON.stringify(demoLoans)) } catch {}
	}, [demoLoans])

	// Simulation playback ticker
	useEffect(() => {
		if (!simOpen || !simPlaying || !simData) return
		const total = Math.max(0, (simData.series.months?.length || 1) - 1)
		const interval = Math.max(20, 200 / Math.max(0.1, simSpeed))
		const id = setInterval(() => {
			setSimProgress((p) => (p >= total ? 0 : p + 1))
		}, interval)
		return () => clearInterval(id)
	}, [simOpen, simPlaying, simData, simSpeed])

	async function openSimulation(sugg: { action: string; amount?: string; horizon?: string; impact?: string }) {
		setSelectedSuggestion(sugg)
		setSimOpen(true)
		setSimLoading(true)
		setSimError(null)
		try {
			const res = await simulateInsightAction({
				balances: demoBalances,
				savings: demoSavings.map(s => ({ id: s.id, name: s.name, balance: s.balance, rate: s.rate, currency: s.currency })),
				loans: demoLoans.map(l => ({ id: l.id, name: l.name, principal: l.principal, outstanding: l.outstanding, rate: l.rate, payment: l.payment, currency: l.currency })),
				suggestion: sugg,
				months: simMonths,
				notes: aiNotes || ''
			})
			setSimData(res)
			setSimProgress(0)
		} catch (e: any) {
			setSimError(e?.message || 'Failed to simulate')
		} finally {
			setSimLoading(false)
		}
	}

	async function refetchSimulation(updatedMonths: number) {
		if (!selectedSuggestion) return
		setSimLoading(true)
		setSimError(null)
		try {
			const res = await simulateInsightAction({
				balances: demoBalances,
				savings: demoSavings.map(s => ({ id: s.id, name: s.name, balance: s.balance, rate: s.rate, currency: s.currency })),
				loans: demoLoans.map(l => ({ id: l.id, name: l.name, principal: l.principal, outstanding: l.outstanding, rate: l.rate, payment: l.payment, currency: l.currency })),
				suggestion: selectedSuggestion,
				months: updatedMonths,
				notes: aiNotes || ''
			})
			setSimData(res)
			setSimProgress(0)
		} catch (e: any) {
			setSimError(e?.message || 'Failed to simulate')
		} finally {
			setSimLoading(false)
		}
	}

	async function saveSettings() {
		setSaving(true)
		setSaveMsg(null)
		try {
			const res = await savePoalimSettings({
				client_id: clientId || undefined,
				client_secret: clientSecret || undefined,
				poalim_redirect_uri: redirectUri || undefined,
				poalim_authorization_url: authorizationUrl || undefined,
				poalim_token_url: tokenUrl || undefined,
				poalim_api_base_url: apiBaseUrl || undefined,
				poalim_accounts_endpoint: accountsEndpoint || undefined,
				persist: true,
				demo_mode: demoMode
			})
			setHasSecret(res.has_client_secret)
			setClientSecret('') // clear input after save
			setSaveMsg('Saved')
		} catch (e: any) {
			setSaveMsg(e?.message || 'Failed to save')
		} finally {
			setSaving(false)
		}
	}

	function applyPsd2Preset() {
		setAuthorizationUrl('https://poalimdev.co.il/open-banking/oidc/authorize')
		setTokenUrl('https://poalimdev.co.il/open-banking/oidc/token')
		setRedirectUri('http://localhost:8000/api/auth/callback')
		setApiBaseUrl('https://poalimdev.co.il/api/60/1/aisp')
		setAccountsEndpoint('https://poalimdev.co.il/api/60/1/aisp/accounts')
		setSaveMsg('Loaded PSD2 1.7 defaults (Poalim dev) — click Save')
	}

    return (
		<Container maxWidth="lg" sx={{ py: { xs: 4, md: 6 } }}>
			<Tabs value={tab} onChange={(_, v) => setTab(v)} aria-label="Main navigation tabs" sx={{ mb: 3 }}>
				<Tab label="Home" />
				<Tab label="Accounts" />
				<Tab label="Stocks" />
				<Tab label="Insights" />
				<Tab label="Budgets" />
				<Tab label="Settings" />
			</Tabs>

			{/* Global financial snapshot across tabs (demo mode), hidden on Home */}
			{demoMode && tab !== 0 && (
				<FinancialSnapshot
					balances={balancesForSnapshot}
					savings={demoSavings}
					loans={demoLoans}
					currency="ILS"
				/>
			)}

			{tab === 0 && (
				<Box>
					{/* Vision (first section) */}
					<Box sx={{ py: { xs: 8, md: 12 }, textAlign: 'center' }} id="vision">
						<Typography variant="h3" component="h1" sx={{ fontWeight: 800, letterSpacing: 0.5 }}>
							A private, AI-first finance experience for everyone
						</Typography>
						<Typography variant="h6" color="text.secondary" sx={{ mt: 2, maxWidth: 900, mx: 'auto' }}>
							We envision a world where every person has access to trustworthy financial coaching—simple insights, personalized plans, and transparent tradeoffs—without giving up privacy. OpenBank AI makes financial literacy practical with clear steps to build resilience and grow wealth.
						</Typography>
						<Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 3 }} justifyContent="center">
							<Button variant="contained" onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}>Explore Features</Button>
							<Button variant="outlined" onClick={() => document.getElementById('why')?.scrollIntoView({ behavior: 'smooth' })}>Why OpenBank AI</Button>
						</Stack>
					</Box>

					{/* Stats */}
					<Box sx={{ py: { xs: 4, md: 6 } }}>
						<Grid container spacing={2}>
							<Grid item xs={12} sm={6} md={3}>
								<Paper sx={{ p: 3, textAlign: 'center' }}>
									<Typography variant="h4" sx={{ fontWeight: 800 }}>0</Typography>
									<Typography variant="body2" color="text.secondary">External APIs required</Typography>
								</Paper>
							</Grid>
							<Grid item xs={12} sm={6} md={3}>
								<Paper sx={{ p: 3, textAlign: 'center' }}>
									<Typography variant="h4" sx={{ fontWeight: 800 }}>100%</Typography>
									<Typography variant="body2" color="text.secondary">Local mock data support</Typography>
								</Paper>
							</Grid>
							<Grid item xs={12} sm={6} md={3}>
								<Paper sx={{ p: 3, textAlign: 'center' }}>
									<Typography variant="h4" sx={{ fontWeight: 800 }}>Type-safe</Typography>
									<Typography variant="body2" color="text.secondary">React + TypeScript + MUI</Typography>
								</Paper>
							</Grid>
							<Grid item xs={12} sm={6} md={3}>
								<Paper sx={{ p: 3, textAlign: 'center' }}>
									<Typography variant="h4" sx={{ fontWeight: 800 }}>Fast</Typography>
									<Typography variant="body2" color="text.secondary">Lightweight, responsive UI</Typography>
								</Paper>
							</Grid>
						</Grid>
					</Box>

					{/* Features (screenshots) */}
					<Box sx={{ py: { xs: 4, md: 8 } }} id="features">
						<Typography variant="h5" sx={{ fontWeight: 700, mb: 2, textAlign: 'center' }}>What you’ll get</Typography>
						<Grid container spacing={2}>
							<Grid item xs={12} md={6}>
								<Paper sx={{ p: 2 }}>
									<Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>Accounts overview</Typography>
									<Divider sx={{ mb: 1 }} />
									<Box sx={{ border: '1px solid rgba(0,0,0,0.08)', borderRadius: 1, overflow: 'hidden' }}>
										<Box sx={{ display: 'flex', gap: 1, p: 1, bgcolor: 'rgba(2,6,23,0.03)' }}>
											<Box sx={{ width: 10, height: 10, bgcolor: '#F87171', borderRadius: '50%' }} />
											<Box sx={{ width: 10, height: 10, bgcolor: '#FBBF24', borderRadius: '50%' }} />
											<Box sx={{ width: 10, height: 10, bgcolor: '#34D399', borderRadius: '50%' }} />
										</Box>
                                        <Box sx={{ p: 2 }}>
                                            <Table size="small">
                                                <TableHead>
                                                    <TableRow>
                                                        <TableCell>Name</TableCell>
                                                        <TableCell>IBAN</TableCell>
                                                        <TableCell align="right">Balance</TableCell>
                                                        <TableCell>Currency</TableCell>
                                                    </TableRow>
                                                </TableHead>
                                                <TableBody>
                                                    {([
                                                        { name: 'Checking', iban: 'IL12 1234 5678 9012', balance: (balancesForSnapshot[0]?.available ?? 12453.75), currency: 'ILS' },
                                                        { name: 'Savings', iban: 'IL98 7654 3210 9876', balance: (balancesForSnapshot[1]?.available ?? 50234.10), currency: 'ILS' }
                                                    ]).map((a, i) => (
                                                        <TableRow key={i} hover>
                                                            <TableCell>{a.name}</TableCell>
                                                            <TableCell>{a.iban}</TableCell>
                                                            <TableCell align="right">{a.balance.toLocaleString()}</TableCell>
                                                            <TableCell>{a.currency}</TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </Box>
									</Box>
								</Paper>
							</Grid>
							<Grid item xs={12} md={6}>
								<Paper sx={{ p: 2 }}>
									<Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>AI insights & recommendations</Typography>
									<Divider sx={{ mb: 1 }} />
									<Box sx={{ border: '1px solid rgba(0,0,0,0.08)', borderRadius: 1, overflow: 'hidden' }}>
										<Box sx={{ display: 'flex', gap: 1, p: 1, bgcolor: 'rgba(2,6,23,0.03)' }}>
											<Box sx={{ width: 10, height: 10, bgcolor: '#F87171', borderRadius: '50%' }} />
											<Box sx={{ width: 10, height: 10, bgcolor: '#FBBF24', borderRadius: '50%' }} />
											<Box sx={{ width: 10, height: 10, bgcolor: '#34D399', borderRadius: '50%' }} />
										</Box>
                                        <Box sx={{ p: 2 }}>
                                            <Stack spacing={1.25}>
                                                <Typography variant="body2">Based on your balances and loans, here are next steps:</Typography>
                                                <Stack component="ul" sx={{ pl: 2, m: 0 }} spacing={0.5}
                                                    >
                                                    <Typography component="li" variant="body2">Move 10,000 ILS to savings to earn interest</Typography>
                                                    <Typography component="li" variant="body2">Pay down 2,000 ILS on highest-rate debt</Typography>
                                                    <Typography component="li" variant="body2">Build a 6-month emergency fund</Typography>
                                                </Stack>
                                                <Stack direction="row" spacing={1}>
                                                    <Chip label="Save more" />
                                                    <Chip label="Pay debt" />
                                                    <Chip label="Build cushion" />
                                                </Stack>
                                                <Typography variant="caption" color="text.secondary">These are examples. No bank connection required in mock mode.</Typography>
                                            </Stack>
                                        </Box>
									</Box>
								</Paper>
							</Grid>
							<Grid item xs={12} md={6}>
								<Paper sx={{ p: 2 }}>
									<Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>Budgets & tracking</Typography>
									<Divider sx={{ mb: 1 }} />
									<Box sx={{ border: '1px solid rgba(0,0,0,0.08)', borderRadius: 1, overflow: 'hidden' }}>
										<Box sx={{ display: 'flex', gap: 1, p: 1, bgcolor: 'rgba(2,6,23,0.03)' }}>
											<Box sx={{ width: 10, height: 10, bgcolor: '#F87171', borderRadius: '50%' }} />
											<Box sx={{ width: 10, height: 10, bgcolor: '#FBBF24', borderRadius: '50%' }} />
											<Box sx={{ width: 10, height: 10, bgcolor: '#34D399', borderRadius: '50%' }} />
										</Box>
                                        <Box sx={{ p: 2 }}>
                                            <Stack spacing={1.25}>
                                                {([
                                                    { name: 'Food', spent: 1200, limit: 2000 },
                                                    { name: 'Transport', spent: 450, limit: 800 },
                                                    { name: 'Housing', spent: 3200, limit: 3200 }
                                                ]).map((b) => {
                                                    const pct = Math.min(100, Math.round((b.spent / Math.max(1, b.limit)) * 100))
                                                    return (
                                                        <Box key={b.name}>
                                                            <Stack direction="row" justifyContent="space-between">
                                                                <Typography variant="body2">{b.name}</Typography>
                                                                <Typography variant="caption" color="text.secondary">{b.spent.toLocaleString()} / {b.limit.toLocaleString()} ILS</Typography>
                                                            </Stack>
                                                            <LinearProgress variant="determinate" value={pct} sx={{ height: 8, borderRadius: 1, mt: 0.5 }} />
                                                        </Box>
                                                    )
                                                })}
                                            </Stack>
                                        </Box>
									</Box>
								</Paper>
							</Grid>
							<Grid item xs={12} md={6}>
								<Paper sx={{ p: 2 }}>
									<Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>Stocks simulator</Typography>
									<Divider sx={{ mb: 1 }} />
									<Box sx={{ border: '1px solid rgba(0,0,0,0.08)', borderRadius: 1, overflow: 'hidden' }}>
										<Box sx={{ display: 'flex', gap: 1, p: 1, bgcolor: 'rgba(2,6,23,0.03)' }}>
											<Box sx={{ width: 10, height: 10, bgcolor: '#F87171', borderRadius: '50%' }} />
											<Box sx={{ width: 10, height: 10, bgcolor: '#FBBF24', borderRadius: '50%' }} />
											<Box sx={{ width: 10, height: 10, bgcolor: '#34D399', borderRadius: '50%' }} />
										</Box>
                                        <Box sx={{ p: 2 }}>
                                            <Stack spacing={1.25}>
                                                {(['AAPL','MSFT','NVDA'] as const).map((sym) => {
                                                    const seed = sym.split('').reduce((s, c) => s + c.charCodeAt(0), 0)
                                                    const values = Array.from({ length: 24 }, (_, i) => 100 + (seed % 7) + Math.sin(i / 2 + seed) * 2 + i * 0.2)
                                                    return (
                                                        <Stack key={sym} direction="row" alignItems="center" spacing={1.25}>
                                                            <Chip label={sym} size="small" />
                                                            <Box sx={{ flex: 1 }}>
                                                                <svg width={160} height={36} viewBox="0 0 160 36">
                                                                    <path d={linePath(values, 160, 36, 4)} stroke="#0B5ED7" fill="none" strokeWidth={1.5} />
                                                                </svg>
                                                            </Box>
                                                            <Typography variant="caption" color={values[values.length - 1] - values[0] >= 0 ? 'success.main' : 'error.main'}>
                                                                {((values[values.length - 1] - values[0]) / values[0] * 100).toFixed(1)}%
                                                            </Typography>
                                                        </Stack>
                                                    )
                                                })}
                                            </Stack>
                                        </Box>
									</Box>
								</Paper>
							</Grid>
						</Grid>
					</Box>

					{/* Pros / Benefits */}
					<Box sx={{ py: { xs: 4, md: 6 } }} id="why">
						<Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>Why OpenBank AI</Typography>
						<Grid container spacing={2}>
							<Grid item xs={12} md={4}>
								<Paper sx={{ p: 3 }}>
									<Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Privacy-first</Typography>
									<Typography variant="body2" color="text.secondary">Run in mock mode with no external calls. Your data stays local.</Typography>
								</Paper>
							</Grid>
							<Grid item xs={12} md={4}>
								<Paper sx={{ p: 3 }}>
									<Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Actionable insights</Typography>
									<Typography variant="body2" color="text.secondary">Clear, step-by-step guidance to build savings and reduce debt.</Typography>
								</Paper>
							</Grid>
							<Grid item xs={12} md={4}>
								<Paper sx={{ p: 3 }}>
									<Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Developer-friendly</Typography>
									<Typography variant="body2" color="text.secondary">TypeScript, React, and MUI with clear modules and mocks.</Typography>
								</Paper>
							</Grid>
						</Grid>
					</Box>

					{/* Security & Privacy */}
					<Box sx={{ py: { xs: 4, md: 6 } }}>
						<Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>Security & Privacy</Typography>
						<Grid container spacing={2}>
							<Grid item xs={12} md={4}>
								<Paper sx={{ p: 3 }}>
									<Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Local-first mocks</Typography>
									<Typography variant="body2" color="text.secondary">Evaluate features without bank credentials or network access.</Typography>
								</Paper>
							</Grid>
							<Grid item xs={12} md={4}>
								<Paper sx={{ p: 3 }}>
									<Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Configurable</Typography>
									<Typography variant="body2" color="text.secondary">Switch between demo and live integrations when ready.</Typography>
								</Paper>
							</Grid>
							<Grid item xs={12} md={4}>
								<Paper sx={{ p: 3 }}>
									<Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Minimal surface</Typography>
									<Typography variant="body2" color="text.secondary">Only essential endpoints when backend is enabled.</Typography>
								</Paper>
							</Grid>
						</Grid>
					</Box>

					{/* Testimonials */}
					<Box sx={{ py: { xs: 4, md: 6 } }}>
						<Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>What people say</Typography>
						<Grid container spacing={2}>
							<Grid item xs={12} md={6}>
								<Paper sx={{ p: 3 }}>
									<Typography variant="body2">“The insights helped me pay down debt faster while growing savings.”</Typography>
									<Divider sx={{ my: 1 }} />
									<Typography variant="caption" color="text.secondary">Early user</Typography>
								</Paper>
							</Grid>
							<Grid item xs={12} md={6}>
								<Paper sx={{ p: 3 }}>
									<Typography variant="body2">“I loved trying it without connecting a bank. Super clear and safe.”</Typography>
									<Divider sx={{ my: 1 }} />
									<Typography variant="caption" color="text.secondary">Beta tester</Typography>
								</Paper>
							</Grid>
						</Grid>
					</Box>

					{/* FAQ */}
					<Box sx={{ py: { xs: 4, md: 6 } }}>
						<Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>FAQ</Typography>
						<Stack spacing={1.5}>
							<Paper sx={{ p: 2 }}>
								<Typography variant="subtitle2">Do I need to connect a real bank?</Typography>
								<Typography variant="body2" color="text.secondary">No. Mock mode is fully supported and enabled in this build.</Typography>
							</Paper>
							<Paper sx={{ p: 2 }}>
								<Typography variant="subtitle2">What about privacy?</Typography>
								<Typography variant="body2" color="text.secondary">Your data stays on your device in mock mode. No external calls.</Typography>
							</Paper>
						</Stack>
					</Box>

					{/* Call to action */}
					<Box sx={{ py: { xs: 4, md: 6 }, textAlign: 'center' }}>
						<Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="center">
							<Button variant="contained" onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}>See Features</Button>
							<Button variant="outlined" onClick={() => document.getElementById('why')?.scrollIntoView({ behavior: 'smooth' })}>Why OpenBank AI</Button>
						</Stack>
					</Box>
				</Box>
			)}

			{tab === 1 && (
				<Box>
					<Paper sx={{ p: 3 }} className="glass">
						<Typography variant="h5" sx={{ fontWeight: 600 }}>Accounts</Typography>
						<Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
							View your linked data. In Demo mode, mock datasets are shown.
						</Typography>
						<Tabs value={accountsSubTab} onChange={(_, v) => setAccountsSubTab(v)} aria-label="Accounts sub tabs" sx={{ mt: 2 }}>
						<Tab label="Accounts" />
						<Tab label="Savings" />
						<Tab label="Loans" />
						</Tabs>
						{/* Actions */}
						<Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 2 }}>
							<Button size="large" variant="outlined" onClick={load}>Refresh accounts</Button>
						</Stack>

						{/* Content */}
						<Stack spacing={2} sx={{ mt: 2 }}>
							{accountsSubTab === 0 && (
								<>
									{loading && (
										<Stack direction="row" spacing={1} alignItems="center">
											<CircularProgress size={20} />
											<Typography>Loading accounts…</Typography>
										</Stack>
									)}
									{error && <Alert severity="error">{error}</Alert>}
									{accounts && (
										<TableContainer component={Paper} className="glass">
											<Table size="small" sx={{ minWidth: 700 }}>
												<TableHead>
													<TableRow>
														<TableCell>ID</TableCell>
														<TableCell>Name</TableCell>
														<TableCell>IBAN</TableCell>
														<TableCell align="right">Balance</TableCell>
														<TableCell>Currency</TableCell>
													</TableRow>
												</TableHead>
												<TableBody>
													{accounts.map((a, i) => (
														<TableRow key={a.id || i} hover>
															<TableCell>{a.id || '-'}</TableCell>
															<TableCell>{a.name || '-'}</TableCell>
															<TableCell>{a.iban || '-'}</TableCell>
															<TableCell align="right">{a.balance ?? '-'}</TableCell>
															<TableCell>{a.currency || '-'}</TableCell>
														</TableRow>
													))}
												</TableBody>
											</Table>
										</TableContainer>
									)}
								</>
							)}

							{false}

							{accountsSubTab === 1 && (
								<>
                                    {!demoMode && <Alert severity="info">Enable Demo mode in Settings to edit sample savings.</Alert>}
									{demoMode && (
                                        <Stack spacing={2}>
                                            <Paper sx={{ p: 2 }}>
                                                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', md: 'center' }}>
                                                    <TextField label="Name" value={newSaving.name || ''} onChange={e => setNewSaving(v => ({ ...v, name: e.target.value }))} sx={{ flex: 2 }} />
                                                    <TextField label="Balance" type="number" value={newSaving.balance ?? ''} onChange={e => setNewSaving(v => ({ ...v, balance: Number(e.target.value) }))} />
                                                    <TextField label="Rate (APR %)" type="number" value={newSaving.rate ?? ''} onChange={e => setNewSaving(v => ({ ...v, rate: Number(e.target.value) }))} />
                                                    <TextField label="Currency" value={newSaving.currency || 'ILS'} onChange={e => setNewSaving(v => ({ ...v, currency: e.target.value }))} />
                                                    <TextField select label="Account" value={newSaving.accountId || ''} onChange={e => setNewSaving(v => ({ ...v, accountId: e.target.value }))} sx={{ minWidth: 160 }}>
                                                        <MenuItem value="">Unassigned</MenuItem>
                                                        {(accounts || []).map(a => (
                                                            <MenuItem key={a.id} value={a.id}>{a.id} — {a.name}</MenuItem>
                                                        ))}
                                                    </TextField>
                                                    <Button variant="contained" onClick={() => {
                                                        const name = (newSaving.name || '').trim()
                                                        const balance = Number(newSaving.balance || 0)
                                                        const rate = Number(newSaving.rate || 0)
                                                        const currency = (newSaving.currency || 'ILS').trim()
                                                        if (!name || balance < 0) return
                                                        setDemoSavings(prev => [...prev, { id: crypto.randomUUID(), name, balance, rate, currency, accountId: newSaving.accountId || '' }])
                                                        setNewSaving({ name: '', balance: 0, rate: 0.5, currency: 'ILS', accountId: '' })
                                                    }}>Add</Button>
                                                </Stack>
                                            </Paper>
										<TableContainer component={Paper} className="glass">
                                                <Table size="small" sx={{ minWidth: 760 }}>
												<TableHead>
													<TableRow>
                                                            <TableCell style={{ width: 140 }}>ID</TableCell>
														<TableCell>Name</TableCell>
														<TableCell align="right">Balance</TableCell>
                                                            <TableCell align="right">Rate %</TableCell>
														<TableCell>Currency</TableCell>
                                                            <TableCell>Account</TableCell>
                                                            <TableCell align="right">Actions</TableCell>
													</TableRow>
												</TableHead>
												<TableBody>
                                                        {demoSavings.map((s) => (
														<TableRow key={s.id} hover>
															<TableCell>{s.id}</TableCell>
                                                                <TableCell>
                                                                    <TextField size="small" value={s.name} onChange={e => setDemoSavings(prev => prev.map(x => x.id === s.id ? { ...x, name: e.target.value } : x))} />
                                                                </TableCell>
                                                                <TableCell align="right">
                                                                    <TextField size="small" type="number" value={s.balance} onChange={e => setDemoSavings(prev => prev.map(x => x.id === s.id ? { ...x, balance: Number(e.target.value) } : x))} />
                                                                </TableCell>
                                                                <TableCell align="right">
                                                                    <TextField size="small" type="number" value={s.rate} onChange={e => setDemoSavings(prev => prev.map(x => x.id === s.id ? { ...x, rate: Number(e.target.value) } : x))} />
                                                                </TableCell>
                                                                <TableCell>
                                                                    <TextField size="small" value={s.currency} onChange={e => setDemoSavings(prev => prev.map(x => x.id === s.id ? { ...x, currency: e.target.value } : x))} />
                                                                </TableCell>
                                                                <TableCell>
                                                                    <TextField select size="small" value={s.accountId || ''} onChange={e => setDemoSavings(prev => prev.map(x => x.id === s.id ? { ...x, accountId: e.target.value } : x))} sx={{ minWidth: 160 }}>
                                                                        <MenuItem value="">Unassigned</MenuItem>
                                                                        {(accounts || []).map(a => (
                                                                            <MenuItem key={a.id} value={a.id}>{a.id} — {a.name}</MenuItem>
                                                                        ))}
                                                                    </TextField>
                                                                </TableCell>
                                                                <TableCell align="right">
                                                                    <Button size="small" color="error" onClick={() => setDemoSavings(prev => prev.filter(x => x.id !== s.id))}>Delete</Button>
                                                                </TableCell>
														</TableRow>
													))}
												</TableBody>
											</Table>
										</TableContainer>
                                        </Stack>
									)}
								</>
							)}

							{accountsSubTab === 2 && (
								<>
                                    {!demoMode && <Alert severity="info">Enable Demo mode in Settings to edit sample loans.</Alert>}
									{demoMode && (
                                        <Stack spacing={2}>
                                            <Paper sx={{ p: 2 }}>
                                                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', md: 'center' }}>
                                                    <TextField label="Name" value={newLoan.name || ''} onChange={e => setNewLoan(v => ({ ...v, name: e.target.value }))} sx={{ flex: 2 }} />
                                                    <TextField label="Principal" type="number" value={newLoan.principal ?? ''} onChange={e => setNewLoan(v => ({ ...v, principal: Number(e.target.value) }))} />
                                                    <TextField label="Outstanding" type="number" value={newLoan.outstanding ?? ''} onChange={e => setNewLoan(v => ({ ...v, outstanding: Number(e.target.value) }))} />
                                                    <TextField label="Payment/mo" type="number" value={newLoan.payment ?? ''} onChange={e => setNewLoan(v => ({ ...v, payment: Number(e.target.value) }))} />
                                                    <TextField label="Rate (APR %)" type="number" value={newLoan.rate ?? ''} onChange={e => setNewLoan(v => ({ ...v, rate: Number(e.target.value) }))} />
                                                    <TextField label="Currency" value={newLoan.currency || 'ILS'} onChange={e => setNewLoan(v => ({ ...v, currency: e.target.value }))} />
                                                    <TextField select label="Account" value={newLoan.accountId || ''} onChange={e => setNewLoan(v => ({ ...v, accountId: e.target.value }))} sx={{ minWidth: 160 }}>
                                                        <MenuItem value="">Unassigned</MenuItem>
                                                        {(accounts || []).map(a => (
                                                            <MenuItem key={a.id} value={a.id}>{a.id} — {a.name}</MenuItem>
                                                        ))}
                                                    </TextField>
                                                    <Button variant="contained" onClick={() => {
                                                        const name = (newLoan.name || '').trim()
                                                        const principal = Number(newLoan.principal || 0)
                                                        const outstanding = Number(newLoan.outstanding || 0)
                                                        const payment = Number(newLoan.payment || 0)
                                                        const rate = Number(newLoan.rate || 0)
                                                        const currency = (newLoan.currency || 'ILS').trim()
                                                        if (!name || principal < 0 || outstanding < 0 || payment < 0) return
                                                        setDemoLoans(prev => [...prev, { id: crypto.randomUUID(), name, principal, outstanding, payment, rate, currency, accountId: newLoan.accountId || '' }])
                                                        setNewLoan({ name: '', principal: 0, outstanding: 0, payment: 0, rate: 2.5, currency: 'ILS', accountId: '' })
                                                    }}>Add</Button>
                                                </Stack>
                                            </Paper>
										<TableContainer component={Paper} className="glass">
                                                <Table size="small" sx={{ minWidth: 900 }}>
												<TableHead>
													<TableRow>
                                                            <TableCell style={{ width: 140 }}>ID</TableCell>
														<TableCell>Name</TableCell>
														<TableCell align="right">Principal</TableCell>
														<TableCell align="right">Outstanding</TableCell>
														<TableCell align="right">Payment/mo</TableCell>
                                                            <TableCell align="right">Rate %</TableCell>
														<TableCell>Currency</TableCell>
                                                            <TableCell>Account</TableCell>
                                                            <TableCell align="right">Actions</TableCell>
													</TableRow>
												</TableHead>
												<TableBody>
                                                        {demoLoans.map((l) => (
														<TableRow key={l.id} hover>
															<TableCell>{l.id}</TableCell>
                                                                <TableCell>
                                                                    <TextField size="small" value={l.name} onChange={e => setDemoLoans(prev => prev.map(x => x.id === l.id ? { ...x, name: e.target.value } : x))} />
                                                                </TableCell>
                                                                <TableCell align="right">
                                                                    <TextField size="small" type="number" value={l.principal} onChange={e => setDemoLoans(prev => prev.map(x => x.id === l.id ? { ...x, principal: Number(e.target.value) } : x))} />
                                                                </TableCell>
                                                                <TableCell align="right">
                                                                    <TextField size="small" type="number" value={l.outstanding} onChange={e => setDemoLoans(prev => prev.map(x => x.id === l.id ? { ...x, outstanding: Number(e.target.value) } : x))} />
                                                                </TableCell>
                                                                <TableCell align="right">
                                                                    <TextField size="small" type="number" value={l.payment} onChange={e => setDemoLoans(prev => prev.map(x => x.id === l.id ? { ...x, payment: Number(e.target.value) } : x))} />
                                                                </TableCell>
                                                                <TableCell align="right">
                                                                    <TextField size="small" type="number" value={l.rate} onChange={e => setDemoLoans(prev => prev.map(x => x.id === l.id ? { ...x, rate: Number(e.target.value) } : x))} />
                                                                </TableCell>
                                                                <TableCell>
                                                                    <TextField size="small" value={l.currency} onChange={e => setDemoLoans(prev => prev.map(x => x.id === l.id ? { ...x, currency: e.target.value } : x))} />
                                                                </TableCell>
                                                                <TableCell>
                                                                    <TextField select size="small" value={l.accountId || ''} onChange={e => setDemoLoans(prev => prev.map(x => x.id === l.id ? { ...x, accountId: e.target.value } : x))} sx={{ minWidth: 160 }}>
                                                                        <MenuItem value="">Unassigned</MenuItem>
                                                                        {(accounts || []).map(a => (
                                                                            <MenuItem key={a.id} value={a.id}>{a.id} — {a.name}</MenuItem>
                                                                        ))}
                                                                    </TextField>
                                                                </TableCell>
                                                                <TableCell align="right">
                                                                    <Button size="small" color="error" onClick={() => setDemoLoans(prev => prev.filter(x => x.id !== l.id))}>Delete</Button>
                                                                </TableCell>
														</TableRow>
													))}
												</TableBody>
											</Table>
										</TableContainer>
                                        </Stack>
									)}
								</>
							)}
						</Stack>
					</Paper>
				</Box>
			)}

		{tab === 2 && (
                <Box>
                    <Paper sx={{ p: 3 }} className="glass">
                        <Typography variant="h5" sx={{ fontWeight: 700 }}>Stocks</Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                            Trade with a dedicated stocks cash account. Transfers sync with Accounts.
                        </Typography>

                        <StocksPanel
                            balances={balancesForSnapshot}
                            onUpdateBalances={(b) => { if (!accounts || accounts.length === 0) setDemoBalances(b) }}
                        />
                    </Paper>
                </Box>
            )}


		{tab === 3 && (
				<Box>
					<Paper sx={{ p: 3 }} className="glass">
						<Typography variant="h5" sx={{ fontWeight: 600 }}>Insights</Typography>
						<Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
							Actionable recommendations based on your current balances, savings, and loans.
						</Typography>

						<Stack spacing={2} sx={{ mt: 2 }}>
							{!demoMode && (
								<Alert severity="info">Enable Demo mode in Settings to view mock insights.</Alert>
							)}

							{demoMode && (
								<>
									{/* Controls */}
									<Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', sm: 'center' }}>
										<TextField
											label="Monthly essential expenses"
											type="number"
											defaultValue={10000}
											onChange={() => { /* keep uncontrolled default for simplicity */ }}
											helperText="Used to size your emergency fund"
											id="monthly-expenses-input"
										/>
										<Button variant="outlined" onClick={() => setTab(1)}>Open Accounts</Button>
										<Button
											variant="contained"
											disabled={!demoMode || aiLoading}
											onClick={async () => {
												setAiError(null)
												setAiText(null)
												setAiLoading(true)
												try {
													const expensesNode = document.getElementById('monthly-expenses-input') as HTMLInputElement | null
													const monthlyExpenses = Math.max(0, Number(expensesNode?.value ?? 10000) || 10000)
													const res = await generateAiInsights({
														balances: demoBalances,
                                                        savings: demoSavings.map(s => ({ id: s.id, name: s.name, balance: s.balance, rate: s.rate, currency: s.currency })),
                                                        loans: demoLoans.map(l => ({ id: l.id, name: l.name, principal: l.principal, outstanding: l.outstanding, rate: l.rate, payment: l.payment, currency: l.currency })),
														monthly_expenses: monthlyExpenses
													})
													setAiText(res.analysis || '')
												} catch (e: any) {
													setAiError(e?.message || 'Failed to generate insights')
												} finally {
													setAiLoading(false)
												}
											}}
										>
											{aiLoading ? 'Generating…' : 'Generate AI Insights'}
										</Button>
									</Stack>

									{/* Snapshot */}
									{(() => {
										// read value from input (keep simple to avoid extra state)
										const expensesNode = document.getElementById('monthly-expenses-input') as HTMLInputElement | null
											const monthlyExpenses = Math.max(0, Number(expensesNode?.value ?? 10000) || 10000)
											const totalCash = (balancesForSnapshot.reduce((sum, b) => sum + Number(b.available ?? 0), 0))
                                        const totalSavings = demoSavings.reduce((sum, s) => sum + s.balance, 0)
                                        const totalDebt = demoLoans.reduce((sum, l) => sum + l.outstanding, 0)
										const netLiquidity = totalCash + totalSavings - totalDebt
										const monthsCovered = monthlyExpenses > 0 ? totalSavings / monthlyExpenses : 0
                                        const highestRateLoan = [...demoLoans].sort((a, b) => b.rate - a.rate)[0]
										const cashCushion = 20000
										const extraCash = Math.max(0, totalCash + totalSavings - cashCushion)
										const suggestedExtraPayment = highestRateLoan ? Math.round(Math.min(extraCash * 0.2, highestRateLoan.outstanding * 0.1)) : 0
										const estInterestSavedYear = highestRateLoan ? Math.round(suggestedExtraPayment * (highestRateLoan.rate / 100)) : 0

										return (
											<Stack spacing={2}>
												<Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
													<Paper sx={{ p: 2, flex: 1 }}>
														<Typography variant="overline">Total cash</Typography>
														<Typography variant="h6">{totalCash.toLocaleString()} ILS</Typography>
													</Paper>
													<Paper sx={{ p: 2, flex: 1 }}>
														<Typography variant="overline">Savings</Typography>
														<Typography variant="h6">{totalSavings.toLocaleString()} ILS</Typography>
													</Paper>
													<Paper sx={{ p: 2, flex: 1 }}>
														<Typography variant="overline">Debt</Typography>
														<Typography variant="h6">{totalDebt.toLocaleString()} ILS</Typography>
													</Paper>
													<Paper sx={{ p: 2, flex: 1 }}>
														<Typography variant="overline">Net liquidity</Typography>
														<Typography variant="h6">{netLiquidity.toLocaleString()} ILS</Typography>
													</Paper>
												</Stack>

												{/* Insights */}
												<Stack spacing={2}>
												{(aiError || aiText) && (
													<Paper sx={{ p: 2 }}>
														<Typography variant="subtitle1" sx={{ fontWeight: 600 }}>AI Insights</Typography>
														{aiError && <Alert severity="error" sx={{ mt: 1 }}>{aiError}</Alert>}
											{aiText && (
												<Box sx={{ mt: 1 }}>
													{renderAiInsightCards(aiText)}
													{(() => {
														const parsed = parsePlanFromText(aiText)
														if (parsed && parsed.length) {
															if (!planRows || planRows.length !== parsed.length) setPlanRows(parsed)
														}
														if (!planRows || !planRows.length) return null
														return (
															<Box sx={{ mt: 2 }}>
																<Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>Actions</Typography>
																<Stack spacing={1}>
																	{planRows.map((r, i) => {
																		const line = [r.action, r.amount && `Amount: ${r.amount}`, r.horizon && `Horizon: ${r.horizon}`, r.impact && `Impact: ${r.impact}`].filter(Boolean).join(' — ')
																		return (
																			<Paper key={i} sx={{ p: 1.5 }}>
																				<Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }} justifyContent="space-between">
																					<Typography variant="body2">• {line}</Typography>
																					<Button size="small" variant="contained" onClick={() => openSimulation(r)}>Simulate</Button>
																</Stack>
																			</Paper>
																	)
																})}
																</Stack>
															</Box>
														)
													})()}
												</Box>
											)}
												</Paper>
											)}
												</Stack>
											</Stack>
										)
										})()}
									</>
								)}
							</Stack>
						</Paper>
				</Box>
			)}

		{tab === 4 && (
				<Box>
					<Paper sx={{ p: 3 }} className="glass">
						<Typography variant="h5" sx={{ fontWeight: 700 }}>Budgets</Typography>
						<Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
							Plan monthly limits and track spending per category.
						</Typography>

						{/* Month controls */}
						<Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', sm: 'center' }} sx={{ mt: 2 }}>
							<Stack direction="row" spacing={1} alignItems="center">
								<Button variant="outlined" onClick={() => {
									const [y, m] = budgetsMonth.split('-').map(n => Number(n))
									const d = new Date(y, m - 2, 1)
									setBudgetsMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
								}}>Prev</Button>
								<Typography variant="subtitle2" sx={{ minWidth: 120, textAlign: 'center' }}>{budgetsMonth}</Typography>
								<Button variant="outlined" onClick={() => {
									const [y, m] = budgetsMonth.split('-').map(n => Number(n))
									const d = new Date(y, m, 1)
									setBudgetsMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
								}}>Next</Button>
							</Stack>
							<Box sx={{ flex: 1 }} />
							<Button variant="text" color="error" onClick={() => {
								if (!window.confirm('Reset all spending for this month?')) return
								setBudgets(prev => prev.map(b => ({ ...b, spent: 0 })))
							}}>Reset month</Button>
						</Stack>

						{/* Summary */}
						{(() => {
							const totalLimit = budgets.reduce((s, b) => s + Math.max(0, b.limit), 0)
							const totalSpent = budgets.reduce((s, b) => s + Math.max(0, b.spent), 0)
							const remaining = Math.max(0, totalLimit - totalSpent)
							const pct = totalLimit > 0 ? Math.min(100, (totalSpent / totalLimit) * 100) : 0
							return (
								<Paper sx={{ p: 2, mt: 2 }}>
									<Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'stretch', md: 'center' }}>
										<Box sx={{ flex: 1 }}>
											<Typography variant="overline">This month</Typography>
											<Typography variant="h6">Budgeted {totalLimit.toLocaleString()} — Spent {totalSpent.toLocaleString()} — Remaining {remaining.toLocaleString()}</Typography>
										</Box>
										<Box sx={{ flex: 1 }}>
											<SimpleBar value={totalSpent} max={Math.max(1, totalLimit)} label={`Overall usage: ${pct.toFixed(0)}%`} />
										</Box>
									</Stack>
					</Paper>
							)
						})()}

						{/* New budget */}
						<Paper sx={{ p: 2, mt: 2 }}>
							<Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', md: 'center' }}>
								<TextField label="Category" value={newBudgetName} onChange={e => setNewBudgetName(e.target.value)} sx={{ flex: 2 }} />
								<TextField label="Monthly limit" type="number" value={newBudgetLimit} onChange={e => setNewBudgetLimit(Number(e.target.value))} sx={{ flex: 1 }} />
								<Button variant="contained" onClick={() => {
									const name = newBudgetName.trim()
									if (!name || newBudgetLimit <= 0) return
									setBudgets(prev => [...prev, { id: crypto.randomUUID(), name, limit: newBudgetLimit, spent: 0 }])
									setNewBudgetName('')
									setNewBudgetLimit(0)
								}}>Add budget</Button>
							</Stack>
						</Paper>

						{/* Budgets list */}
						<Stack spacing={1.5} sx={{ mt: 2 }}>
							{budgets.map((b) => {
								const remaining = Math.max(0, b.limit - b.spent)
								return (
									<Paper key={b.id} sx={{ p: 2 }}>
										<Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', md: 'center' }}>
											<Box sx={{ flex: 2 }}>
												<Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{b.name}</Typography>
												<Typography variant="body2" color="text.secondary">Limit {b.limit.toLocaleString()} — Spent {b.spent.toLocaleString()} — Remaining {remaining.toLocaleString()}</Typography>
												<Box sx={{ mt: 1 }}>
													<SimpleBar value={b.spent} max={Math.max(1, b.limit)} label={''} />
				</Box>
											</Box>
											<Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }}>
												<TextField size="small" label="Add expense" type="number" value={expenseInput[b.id] ?? ''} onChange={e => setExpenseInput(prev => ({ ...prev, [b.id]: Number(e.target.value) }))} />
												<Button size="small" variant="outlined" onClick={() => {
													const val = Number(expenseInput[b.id] || 0)
													if (!val) return
													setBudgets(prev => prev.map(x => x.id === b.id ? { ...x, spent: Math.max(0, x.spent + val) } : x))
													setExpenseInput(prev => ({ ...prev, [b.id]: 0 }))
												}}>Add</Button>
												<Button size="small" variant="outlined" onClick={() => {
													const name = window.prompt('Rename category', b.name) || ''
													if (!name.trim()) return
													setBudgets(prev => prev.map(x => x.id === b.id ? { ...x, name: name.trim() } : x))
												}}>Rename</Button>
												<Button size="small" variant="outlined" onClick={() => {
													const lim = Number(window.prompt('Set monthly limit', String(b.limit)) || b.limit)
													if (!lim || lim <= 0) return
													setBudgets(prev => prev.map(x => x.id === b.id ? { ...x, limit: lim } : x))
												}}>Set limit</Button>
												<Button size="small" color="error" onClick={() => setBudgets(prev => prev.filter(x => x.id !== b.id))}>Delete</Button>
											</Stack>
										</Stack>
									</Paper>
								)
							})}
							{budgets.length === 0 && (
								<Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>No budgets yet. Add your first category above.</Typography>
							)}
						</Stack>
					</Paper>
				</Box>
			)}

		{tab === 5 && (
				<Box>
					<Paper sx={{ p: 3 }} className="glass">
						<Typography variant="h5" sx={{ fontWeight: 600 }}>Settings</Typography>
						<Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
							Connect your bank to securely fetch accounts and insights.
						</Typography>
						<Stack spacing={2} sx={{ mt: 3 }}>
						<FormControlLabel
							control={<Switch checked={demoMode} onChange={(_, v) => setDemoMode(v)} />}
							label={demoMode ? 'Demo mode: ON (using mock data)' : 'Demo mode: OFF'}
						/>
							<Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
								<TextField label="Poalim Client ID" fullWidth value={clientId} onChange={(e) => setClientId(e.target.value)} />
								<TextField label={hasSecret ? 'Poalim Client Secret (set)' : 'Poalim Client Secret'} type="password" fullWidth value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} />
							</Stack>
							<Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
								<TextField label="Authorization URL" fullWidth value={authorizationUrl} onChange={(e) => setAuthorizationUrl(e.target.value)} />
								<TextField label="Token URL" fullWidth value={tokenUrl} onChange={(e) => setTokenUrl(e.target.value)} />
							</Stack>
						<Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
							<Button variant="text" onClick={applyPsd2Preset}>Use PSD2 1.7 (Poalim dev preset)</Button>
						</Stack>
							<Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
								<TextField label="Redirect URI" fullWidth value={redirectUri} onChange={(e) => setRedirectUri(e.target.value)} />
								<TextField label="API Base URL" fullWidth value={apiBaseUrl} onChange={(e) => setApiBaseUrl(e.target.value)} />
							</Stack>
							<Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
								<TextField label="Accounts Endpoint (optional)" fullWidth value={accountsEndpoint} onChange={(e) => setAccountsEndpoint(e.target.value)} />
							</Stack>
							<Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
								<Button size="large" variant="outlined" onClick={saveSettings} disabled={saving}>{saving ? 'Saving…' : 'Save credentials'}</Button>
								{saveMsg && <Typography variant="body2" color="text.secondary">{saveMsg}</Typography>}
							</Stack>
							<Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
								<Button size="large" variant="contained" color="primary" href={authLoginUrl()}>
									Connect bank account
								</Button>
								<Button size="large" variant="outlined" onClick={load}>Refresh accounts</Button>
							</Stack>
						</Stack>
					</Paper>
				</Box>
			)}

		{/* Global Simulation Dialog (visible across tabs) */}
		<Dialog open={simOpen} onClose={() => setSimOpen(false)} fullWidth maxWidth="md">
			<DialogTitle>
				<Typography variant="h6" sx={{ fontWeight: 700 }}>
					Simulation{selectedSuggestion ? `: ${selectedSuggestion!.action}` : ''}
				</Typography>
			</DialogTitle>
			<DialogContent dividers>
				<Stack spacing={2}>
					{simError && <Alert severity="error">{simError}</Alert>}
					{simLoading && (
						<Stack direction="row" spacing={1} alignItems="center">
							<CircularProgress size={20} />
							<Typography>Simulating…</Typography>
						</Stack>
					)}
					{simData && (
						<>
							{/* Controls */}
							<Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="center">
								<Box sx={{ flex: 1 }}>
									<Typography gutterBottom>Time horizon (months): {simMonths}</Typography>
									<Slider min={6} max={120} step={1} value={simMonths} onChange={(_, v) => setSimMonths(v as number)} onChangeCommitted={(_, v) => { setSimMonths(v as number); refetchSimulation(v as number) }} />
								</Box>
								<Box sx={{ flex: 1 }}>
									<Typography gutterBottom>Playback speed: {simSpeed.toFixed(2)}x</Typography>
									<Slider min={0.25} max={4} step={0.25} value={simSpeed} onChange={(_, v) => setSimSpeed(v as number)} />
								</Box>
								<Tooltip title="Play/Pause animation">
									<IconButton onClick={() => setSimPlaying(p => !p)}>{simPlaying ? <PauseIcon /> : <PlayArrowIcon />}</IconButton>
								</Tooltip>
							</Stack>

							{/* Chart */}
							<Box sx={{ mt: 1, position: 'relative', height: 320, borderRadius: 2, background: 'linear-gradient(180deg, rgba(250,250,250,0.8), rgba(250,250,250,0.6))', border: '1px solid rgba(0,0,0,0.08)' }}>
								<svg width="100%" height="100%" viewBox="0 0 760 320" preserveAspectRatio="none">

								{/* Subtle grid with y-axis labels */}
								{(() => {
									const padding = 28
									const w = 760 - padding * 2
									const h = 320 - padding * 2
									const g: JSX.Element[] = []
									for (let i = 0; i <= 8; i++) {
										const x = padding + (i / 8) * w
										g.push(<line key={`v-${i}`} x1={x} x2={x} y1={padding} y2={320 - padding} stroke="rgba(0,0,0,0.06)" />)
									}
									// y ticks from net series
									const vals = (simData!.series.net || [])
									const min = Math.min(...vals)
									const max = Math.max(...vals)
									for (let j = 0; j <= 4; j++) {
										const y = padding + (j / 4) * h
										const val = max - (j / 4) * (max - min)
										g.push(<line key={`h-${j}`} x1={padding} x2={760 - padding} y1={y} y2={y} stroke="rgba(0,0,0,0.06)" />)
										g.push(<text key={`t-${j}`} x={padding - 6} y={y + 4} textAnchor="end" fontSize="10" fill="rgba(0,0,0,0.6)">{Math.round(val).toLocaleString()}</text>)
									}
									return <g>{g}</g>
								})()}

								{/* Area under net for clarity */}
								<path d={areaPath(simData!.series.net, 760, 320, 28)} fill="rgba(11,94,215,0.08)" />
								{/* Paths */}
								<path d={linePath(simData!.series.net, 760, 320, 28)} fill="none" stroke="#0B5ED7" strokeWidth="2.5" />
									<path d={linePath(simData!.series.cash, 760, 320, 28)} fill="none" stroke="#22C55E" strokeWidth="2" />
									<path d={linePath(simData!.series.savings, 760, 320, 28)} fill="none" stroke="#8B5CF6" strokeWidth="2" />
									<path d={linePath(simData!.series.debt.map(v => -v), 760, 320, 28)} fill="none" stroke="#EF4444" strokeWidth="2" />
									{(() => {
										const idx = Math.min(simProgress, simData!.series.net.length - 1)
										const padding = 28
										const n = simData!.series.net.length - 1
										const x = padding + (idx / Math.max(1, n)) * (760 - padding * 2)
										return <line x1={x} x2={x} y1={padding} y2={300 - padding} stroke="rgba(0,0,0,0.1)" strokeDasharray="4 6" />
									})()}
								</svg>
								{/* Legend */}
								<Box sx={{ position: 'absolute', left: 12, top: 12, bgcolor: 'rgba(255,255,255,0.9)', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 1, p: 1 }}>
									<Stack direction="row" spacing={1}>
										<Chip size="small" label="Net" variant="outlined" sx={{ color: '#0B5ED7', borderColor: '#0B5ED7' }} />
										<Chip size="small" label="Cash" variant="outlined" sx={{ color: '#22C55E', borderColor: '#22C55E' }} />
										<Chip size="small" label="Savings" variant="outlined" sx={{ color: '#8B5CF6', borderColor: '#8B5CF6' }} />
										<Chip size="small" label="Debt" variant="outlined" sx={{ color: '#EF4444', borderColor: '#EF4444' }} />
									</Stack>
								</Box>
								{/* Readout */}
								<Box sx={{ position: 'absolute', right: 12, top: 12, bgcolor: 'rgba(255,255,255,0.95)', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 1, p: 1 }}>
									<Stack spacing={0.5}>
										<Typography variant="caption" color="text.secondary">Month {simProgress}</Typography>
										<Typography variant="caption"><strong>Net:</strong> {Math.round(simData!.series.net[Math.min(simProgress, simData!.series.net.length - 1)]).toLocaleString()}</Typography>
										<Typography variant="caption"><strong>Cash:</strong> {Math.round(simData!.series.cash[Math.min(simProgress, simData!.series.cash.length - 1)]).toLocaleString()}</Typography>
										<Typography variant="caption"><strong>Savings:</strong> {Math.round(simData!.series.savings[Math.min(simProgress, simData!.series.savings.length - 1)]).toLocaleString()}</Typography>
										<Typography variant="caption"><strong>Debt:</strong> {Math.round(simData!.series.debt[Math.min(simProgress, simData!.series.debt.length - 1)]).toLocaleString()}</Typography>
									</Stack>
								</Box>
							</Box>

							{/* Narrative */}
							<Paper sx={{ p: 2, bgcolor: 'rgba(2,6,23,0.55)', border: '1px solid rgba(99,102,241,0.25)' }}>
								<Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1, background: 'linear-gradient(90deg, #93C5FD, #A78BFA)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>What this means</Typography>
								{renderFuturisticAnalysis(simData.narrative)}
							</Paper>
						</>
					)}
				</Stack>
			</DialogContent>
			<DialogActions>
				<Button onClick={() => setSimOpen(false)}>Close</Button>
			</DialogActions>
		</Dialog>
		</Container>
	)
}

// StocksPanel moved to ./components/StocksPanel

function areaPath(values: number[], width: number, height: number, padding: number) {
    const w = width - padding * 2
    const h = height - padding * 2
    const max = Math.max(...values)
    const min = Math.min(...values)
    const n = values.length - 1
    const coords = values.map((v, i) => {
        const x = padding + (i / Math.max(1, n)) * w
        const y = padding + h - ((v - min) / Math.max(1, max - min)) * h
        return { x, y }
    })
    if (coords.length === 0) return ''
    const first = coords[0]
    const last = coords[coords.length - 1]
    const topLine = coords.map(p => `${p.x},${p.y}`).join(' L ')
    const baseY = padding + h
    return `M ${first.x},${baseY} L ${topLine} L ${last.x},${baseY} Z`
}

function renderAiInsightCards(text: string) {
	const lower = (text || '').toLowerCase()
	function findSectionIndex(title: string) {
		const idx = lower.indexOf(title.toLowerCase())
		return idx
	}
	function extractTableRows(fromIdx: number) {
		if (fromIdx < 0) return null
		const tail = text.slice(fromIdx)
		const lines = tail.split(/\r?\n/)
		const tableStart = lines.findIndex(l => /^\s*\|/.test(l))
		if (tableStart === -1) return null
		const rows: string[] = []
		for (let i = tableStart; i < lines.length; i++) {
			const ln = lines[i]
			if (!/^\s*\|/.test(ln)) break
			rows.push(ln.trim())
		}
		if (rows.length < 2) return null
		const header = rows[0].split('|').map(c => c.trim()).filter(Boolean)
		const dataRows = rows.slice(2)
		const parsed = dataRows.map(r => {
			const cells = r.split('|').map(c => c.trim())
			const obj: Record<string, string> = {}
			header.forEach((h, i) => { obj[h] = (cells[i] || '').trim() })
			return obj
		})
		return { header, rows: parsed }
	}
	function extractBulletsAround(title: string) {
		const idx = findSectionIndex(title)
		if (idx < 0) return []
		const tail = text.slice(idx)
		const lines = tail.split(/\r?\n/)
		const bullets: string[] = []
		let started = false
		for (const ln of lines) {
			if (/^\s*[-*+]/.test(ln)) { started = true; bullets.push(ln.replace(/^\s*[-*+]\s*/, '').trim()); continue }
			if (started && ln.trim() === '') break
			if (started && /\|/.test(ln)) break
		}
		return bullets
	}

	const plan = extractTableRows(findSectionIndex('Top Action Plan'))
	const automations = extractTableRows(findSectionIndex('Optional Automations'))
	const risks = extractBulletsAround('Risk Early Warnings')

    const hasCards = !!plan || !!automations || risks.length > 0
    if (!hasCards) {
        return renderTextOnlyInsights(text)
    }

    return renderTextOnlyInsights(text)
}

function parsePlanFromText(text: string): Array<{ action: string; amount?: string; horizon?: string; impact?: string }> | null {
	const lines = (text || '').split(/\r?\n/)
	const headerIdx = lines.findIndex(l => /^\s*\|\s*Action\s*\|/i.test(l))
	if (headerIdx === -1) return null
	const header = lines[headerIdx].split('|').map(c => c.trim()).filter(Boolean)
	const rows: string[] = []
	for (let i = headerIdx + 2; i < lines.length; i++) {
		const ln = lines[i]
		if (!/^\s*\|/.test(ln)) break
		rows.push(ln)
	}
	const parsed = rows.map(r => {
		const cells = r.split('|').map(c => c.trim())
		const obj: Record<string, string> = {}
		header.forEach((h, i) => { obj[h] = (cells[i] || '').trim() })
		return {
			action: (obj['Action'] || obj['action'] || '').replace(/^\d+\.?\s*/, ''),
			amount: obj['Amount'] || obj['amount'] || '',
			horizon: obj['Date Horizon'] || obj['Horizon'] || obj['Date'] || '',
			impact: obj['Expected Impact'] || obj['Impact'] || ''
		}
	})
	return parsed
}

function SimpleBar({ value, max, label }: { value: number; max: number; label: string }) {
	const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100))
	return (
		<Box>
			<Typography variant="caption" color="text.secondary">{label}</Typography>
			<Box sx={{ mt: 0.5, height: 10, borderRadius: 6, bgcolor: 'rgba(11,94,215,0.08)', overflow: 'hidden' }}>
				<Box sx={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg,#0B5ED7,#22C55E)', transition: 'width .3s ease' }} />
			</Box>
		</Box>
	)
}

function renderTextOnlyInsights(text: string) {
	// Sanitize markdown emphasis and code fences
	const cleaned = (text || '')
		.replace(/\*\*([^*]+)\*\*/g, '$1')
		.replace(/\*([^*]+)\*/g, '$1')
		.replace(/`([^`]+)`/g, '$1')
		.replace(/^>\s?/gm, '')
		.trim()

	// Extract sections
	function section(title: string) {
		const re = new RegExp(`(^|\n)#{1,3}\\s*${title}\\s*\n`, 'i')
		const m = re.exec(cleaned)
		if (!m) return ''
		const start = m.index + m[0].length
		const rest = cleaned.slice(start)
		const next = /\n#{1,6}\s+/i.exec(rest)
		return rest.slice(0, next ? next.index : rest.length)
	}

	const posture = section('Financial Posture')
	const plan = section('Top Action Plan')
	const risks = section('Risk Early Warnings')
	const autos = section('Optional Automations')

	function renderBullets(src: string) {
		const lines = (src || '').split(/\r?\n/)
		const items = lines
			.filter(l => /^\s*[-*+]/.test(l))
			.map(l => l.replace(/^\s*[-*+]\s*/, '').trim())
		if (items.length === 0) return null
		return (
			<Stack spacing={0.5} sx={{ pl: 0 }}>
				{items.map((t, i) => (
					<Typography key={i} variant="body2">• {t}</Typography>
				))}
			</Stack>
		)
	}

	function parseTable(src: string) {
		const lines = (src || '').split(/\r?\n/)
		const headerIdx = lines.findIndex(l => /^\s*\|/.test(l))
		if (headerIdx === -1) return null
		const header = lines[headerIdx].split('|').map(c => c.trim()).filter(Boolean)
		const rows: string[] = []
		for (let i = headerIdx + 2; i < lines.length; i++) {
			const ln = lines[i]
			if (!/^\s*\|/.test(ln)) break
			rows.push(ln)
		}
		const parsed = rows.map(r => {
			const cells = r.split('|').map(c => c.trim())
			const obj: Record<string, string> = {}
			header.forEach((h, i) => { obj[h] = (cells[i] || '').trim() })
			return obj
		})
		return { header, rows: parsed }
	}

	const planTable = parseTable(plan)
	const autoTable = parseTable(autos)

	return (
		<Stack spacing={1.25}>
			{posture && (
				<>
					<Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Financial Posture</Typography>
					{renderBullets(posture) || <Typography variant="body2">{posture}</Typography>}
				</>
			)}

			{planTable && (
				<>
					<Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Top Action Plan</Typography>
					<Stack spacing={0.5}>
						{planTable.rows.map((r, i) => {
							const action = r['Action'] || r['action'] || ''
							const amount = r['Amount'] || r['amount'] || ''
							const horizon = r['Date Horizon'] || r['Horizon'] || r['Date'] || ''
							const impact = r['Expected Impact'] || r['Impact'] || ''
							const line = [action.replace(/^\d+\.?\s*/, ''), amount && `Amount: ${amount}`, horizon && `Horizon: ${horizon}`, impact && `Impact: ${impact}`]
								.filter(Boolean)
								.join(' — ')
							return <Typography key={i} variant="body2">• {line}</Typography>
						})}
					</Stack>
				</>
			)}

			{risks && (
				<>
					<Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Risk Early Warnings</Typography>
					{renderBullets(risks) || <Typography variant="body2">{risks}</Typography>}
				</>
			)}

			{autoTable && (
				<>
					<Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Optional Automations</Typography>
					<Stack spacing={0.5}>
						{autoTable.rows.map((r, i) => {
							const name = r['Automation'] || r['automation'] || ''
							const freq = r['Frequency'] || r['frequency'] || ''
							const setup = r['Setup'] || r['setup'] || ''
							const line = [name.replace(/^\d+\.?\s*/, ''), freq && `Frequency: ${freq}`, setup && `Setup: ${setup}`]
								.filter(Boolean)
								.join(' — ')
							return <Typography key={i} variant="body2">• {line}</Typography>
						})}
					</Stack>
				</>
			)}
		</Stack>
	)
}
