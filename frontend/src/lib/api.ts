const backendUrl = (process.env.REACT_APP_BACKEND_URL as string | undefined) ?? 'http://localhost:8000'

export async function fetchAccounts() {
	const res = await fetch(`${backendUrl}/api/accounts`, {
		credentials: 'include'
	})
	if (!res.ok) {
		throw new Error(`Failed to fetch accounts: ${res.status}`)
	}
	return res.json()
}

export function authLoginUrl() {
	return `${backendUrl}/api/auth/login`
}

export async function getPoalimSettings() {
	const res = await fetch(`${backendUrl}/api/settings/poalim`, {
		credentials: 'include'
	})
	if (!res.ok) {
		throw new Error(`Failed to fetch settings: ${res.status}`)
	}
	return res.json() as Promise<{
		client_id: string
		has_client_secret: boolean
		redirect_uri?: string
		authorization_url?: string
		token_url?: string
		api_base_url?: string
		accounts_endpoint?: string
		demo_mode: boolean
	}>
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
	const res = await fetch(`${backendUrl}/api/settings/poalim`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		credentials: 'include',
		body: JSON.stringify(input)
	})
	if (!res.ok) {
		const text = await res.text()
		throw new Error(text || `Failed to save settings: ${res.status}`)
	}
	return res.json() as Promise<{ client_id: string; has_client_secret: boolean; demo_mode: boolean }>
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
    const res = await fetch(`${backendUrl}/api/insights/ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(input)
    })
    if (!res.ok) {
        const text = await res.text()
        throw new Error(text || `Failed to generate insights: ${res.status}`)
    }
    return res.json() as Promise<{ analysis: string }>
}

export async function simulateInsightAction(input: {
    balances: Array<{ id: string; available?: number; current?: number; currency?: string }>
    savings: Array<{ id: string; name: string; balance: number; rate: number; currency: string }>
    loans: Array<{ id: string; name: string; principal: number; outstanding: number; rate: number; payment: number; currency: string }>
    suggestion: { action: string; amount?: string; horizon?: string; impact?: string }
    months?: number
    notes?: string
}) {
    const res = await fetch(`${backendUrl}/api/insights/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(input)
    })
    if (!res.ok) {
        const text = await res.text()
        throw new Error(text || `Failed to simulate: ${res.status}`)
    }
    return res.json() as Promise<{
        series: { months: number[]; cash: number[]; savings: number[]; debt: number[]; net: number[] }
        narrative: string
    }>
}