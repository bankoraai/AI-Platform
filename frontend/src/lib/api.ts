export async function fetchAccounts() {
	// Pure mock: return static demo accounts
	return Promise.resolve({
		accounts: [
			{ id: 'ACC-001', name: 'Checking', iban: 'IL12 1234 5678 9012', balance: 12453.75, currency: 'ILS' },
			{ id: 'ACC-002', name: 'Savings', iban: 'IL98 7654 3210 9876', balance: 50234.10, currency: 'ILS' }
		]
	})
}

export function authLoginUrl() {
	// No auth in mock-only mode
	return '#'
}

export async function getPoalimSettings() {
	// Return local demo settings; no API calls
	return Promise.resolve({
		client_id: '',
		has_client_secret: false,
		redirect_uri: '',
		authorization_url: '',
		token_url: '',
		api_base_url: '',
		accounts_endpoint: '',
		demo_mode: true
	})
}

export async function savePoalimSettings(input: {
	client_id?: string
	client_secret?: string
	poalim_redirect_uri?: string
	poalim_authorization_url?: string
	poalim_token_url?: string
	poalim_api_base_url?: string
	poalim_accounts_endpoint?: string
	persist?: boolean
	demo_mode?: boolean
}) {
	// Pretend to save and echo minimal state needed by the UI
	return Promise.resolve({
		client_id: input.client_id || '',
		has_client_secret: !!input.client_secret,
		demo_mode: !!input.demo_mode
	})
}

export async function generateAiInsights(input: {
	balances: Array<{ id: string; available?: number; current?: number; currency?: string }>
	savings: Array<{ id: string; name: string; balance: number; rate: number; currency: string }>
	loans: Array<{ id: string; name: string; principal: number; outstanding: number; rate: number; payment: number; currency: string }>
	monthly_expenses: number
	completed_actions?: string[]
	step?: number
	notes?: string
}) {
	const totalCash = input.balances.reduce((s, b) => s + Number(b.available ?? b.current ?? 0), 0)
	const totalSavings = input.savings.reduce((s, a) => s + a.balance, 0)
	const totalDebt = input.loans.reduce((s, l) => s + l.outstanding, 0)
	const net = totalCash + totalSavings - totalDebt
	const analysis = [
		'## Overview',
		`Current net liquidity: ${Math.round(net).toLocaleString()} ILS. Monthly expenses: ${Math.round(input.monthly_expenses).toLocaleString()} ILS.`,
		'',
		'## Recommended Actions',
		'- Increase emergency fund to 6 months of expenses',
		'- Transfer surplus cash into savings to earn interest',
		'- Make extra payments toward highest-rate debt',
		'',
		'## Action Plan',
		'| Action | Amount | Horizon | Impact |',
		'| --- | ---: | :---: | :--- |',
		'| Transfer surplus cash to savings | 10,000 ILS | 1 mo | +Interest |',
		'| Extra mortgage payment | 2,000 ILS/mo | 12 mo | -Interest |',
		'| Build emergency fund | 20,000 ILS | 6 mo | +Resilience |'
	].join('\n')
	return Promise.resolve({ analysis })
}

export async function simulateInsightAction(input: {
	balances: Array<{ id: string; available?: number; current?: number; currency?: string }>
	savings: Array<{ id: string; name: string; balance: number; rate: number; currency: string }>
	loans: Array<{ id: string; name: string; principal: number; outstanding: number; rate: number; payment: number; currency: string }>
	suggestion: { action: string; amount?: string; horizon?: string; impact?: string }
	months?: number
	notes?: string
}) {
	const months = Math.max(6, Math.min(120, input.months ?? 36))
	const m: number[] = Array.from({ length: months }, (_, i) => i)
	const startCash = input.balances.reduce((s, b) => s + Number(b.available ?? b.current ?? 0), 0)
	const startSavings = input.savings.reduce((s, a) => s + a.balance, 0)
	const startDebt = input.loans.reduce((s, l) => s + l.outstanding, 0)
	const avgSavingsRate = input.savings.length ? (input.savings.reduce((s, a) => s + a.rate, 0) / input.savings.length) : 1.5
	const monthlySavingsRate = Math.max(0, avgSavingsRate) / 100 / 12
	const monthlyDebtDecay = 0.002 // 0.2% monthly reduction as a simple mock

	const cash: number[] = []
	const savings: number[] = []
	const debt: number[] = []

	let c = startCash
	let s = startSavings
	let d = startDebt

	for (let i = 0; i < months; i++) {
		// Simple drift
		c += 200 // monthly cash accumulation
		s = s * (1 + monthlySavingsRate) + 200 // add small monthly contribution
		d = Math.max(0, d * (1 - monthlyDebtDecay))

		cash.push(c)
		savings.push(s)
		debt.push(d)
	}

	const net = cash.map((v, i) => v + savings[i] - debt[i])
	const narrative = 'This simulation illustrates a steady increase in cash and savings with modest debt reduction over time. Use Settings to adjust demo values; in mock mode no external APIs are used.'

	return Promise.resolve({
		series: { months: m, cash, savings, debt, net },
		narrative
	})
}