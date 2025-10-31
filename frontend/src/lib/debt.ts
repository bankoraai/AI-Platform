import type { Loan } from './types'

export type DebtInput = Loan & {
    minPayment?: number
}

export type Strategy = 'snowball' | 'avalanche'

export type MonthlySnapshot = {
    monthIndex: number
    totals: {
        payment: number
        interest: number
        principal: number
        remaining: number
    }
    perDebt: Array<{
        id: string
        name: string
        payment: number
        interest: number
        principal: number
        remaining: number
    }>
}

export type SimulationResult = {
    months: number
    totalInterest: number
    schedule: MonthlySnapshot[]
    payoffOrder: string[]
}

function monthlyRate(aprPercent: number): number {
    return Math.max(0, (aprPercent || 0) / 100) / 12
}

function isPaidOff(balance: number): boolean {
    return balance <= 0.01
}

export function simulateDebtPayoff(
    debtsInput: DebtInput[],
    monthlyBudget: number,
    strategy: Strategy
): SimulationResult {
    const debts = debtsInput.map(d => ({
        id: d.id,
        name: d.name,
        balance: Math.max(0, Number(d.outstanding ?? d.principal ?? 0)),
        apr: Number(d.rate ?? 0),
        minPayment: Math.max(0, Number(d.minPayment ?? d.payment ?? 0)),
    }))

    const schedule: MonthlySnapshot[] = []
    const payoffOrder: string[] = []
    let totalInterest = 0
    let monthIndex = 0

    // Guard
    if (!debts.length || monthlyBudget <= 0) {
        return { months: 0, totalInterest: 0, schedule: [], payoffOrder: [] }
    }

    // Prevent infinite loops
    const MAX_MONTHS = 600

    // Internal working copy
    const working = debts.map(d => ({ ...d }))

    const orderFn = (a: typeof working[number], b: typeof working[number]) => {
        if (strategy === 'snowball') return a.balance - b.balance
        // avalanche
        return b.apr - a.apr
    }

    while (monthIndex < MAX_MONTHS && working.some(w => !isPaidOff(w.balance))) {
        // Allocate mandatory minimum payments
        let remainingBudget = monthlyBudget
        const monthDetails: MonthlySnapshot['perDebt'] = []

        // First pass: compute interest, apply minimums
        for (const d of working) {
            if (isPaidOff(d.balance)) {
                monthDetails.push({ id: d.id, name: d.name, payment: 0, interest: 0, principal: 0, remaining: d.balance })
                continue
            }

            const r = monthlyRate(d.apr)
            const interest = d.balance * r
            const basePayment = Math.min(Math.max(d.minPayment, interest + 1), d.balance + interest)
            const payment = Math.min(basePayment, remainingBudget)

            const principal = Math.max(0, payment - interest)
            d.balance = Math.max(0, d.balance - principal)
            remainingBudget -= payment
            totalInterest += interest

            monthDetails.push({ id: d.id, name: d.name, payment, interest, principal, remaining: d.balance })
        }

        // Second pass: allocate remaining budget per strategy to the focus debt
        while (remainingBudget > 0.01 && working.some(w => !isPaidOff(w.balance))) {
            const target = [...working].filter(w => !isPaidOff(w.balance)).sort(orderFn)[0]
            const idx = working.findIndex(w => w.id === target.id)
            if (idx < 0) break

            const r = monthlyRate(target.apr)
            const extraInterest = target.balance * r - monthDetails[idx].interest
            const extraPayment = Math.min(remainingBudget, target.balance + Math.max(0, extraInterest))

            const extraPrincipal = Math.max(0, extraPayment - Math.max(0, extraInterest))
            target.balance = Math.max(0, target.balance - extraPrincipal)
            remainingBudget -= extraPayment

            // Update month details
            monthDetails[idx].payment += extraPayment
            monthDetails[idx].interest += Math.max(0, extraInterest)
            monthDetails[idx].principal += extraPrincipal
            monthDetails[idx].remaining = target.balance
            totalInterest += Math.max(0, extraInterest)
        }

        // Track debts paid off this month in order
        for (const d of working) {
            if (isPaidOff(d.balance) && !payoffOrder.includes(d.id)) {
                payoffOrder.push(d.id)
            }
        }

        const totals = monthDetails.reduce((acc, m) => {
            acc.payment += m.payment
            acc.interest += m.interest
            acc.principal += m.principal
            acc.remaining += m.remaining
            return acc
        }, { payment: 0, interest: 0, principal: 0, remaining: 0 })

        schedule.push({ monthIndex, totals, perDebt: monthDetails })
        monthIndex += 1
    }

    return { months: monthIndex, totalInterest, schedule, payoffOrder }
}

export type RefinanceSuggestion = {
    id: string
    name: string
    currentApr: number
    offeredApr: number
    estMonthlyInterestSavings: number
    rationale: string
}

export function suggestRefinance(
    debtsInput: DebtInput[],
    offeredAprPercent: number,
    thresholdDelta = 1
): RefinanceSuggestion[] {
    const suggestions: RefinanceSuggestion[] = []
    const offered = Math.max(0, offeredAprPercent)
    for (const d of debtsInput) {
        const curr = Math.max(0, d.rate || 0)
        const delta = curr - offered
        if (delta >= thresholdDelta) {
            const estMonthlySavings = (Math.max(0, d.outstanding) * delta) / 100 / 12
            suggestions.push({
                id: d.id,
                name: d.name,
                currentApr: curr,
                offeredApr: offered,
                estMonthlyInterestSavings: estMonthlySavings,
                rationale: 'Offered APR is significantly lower than current rate'
            })
        }
    }
    return suggestions
}

export type UtilizationAlert = {
    id: string
    name: string
    utilization: number
    level: 'info' | 'warning' | 'critical'
    message: string
}

export function computeUtilizationAlerts(debtsInput: DebtInput[]): UtilizationAlert[] {
    const alerts: UtilizationAlert[] = []
    for (const d of debtsInput) {
        const limit = d.creditLimit
        const kind = d.kind
        if (!limit || limit <= 0 || kind !== 'revolving') continue
        const util = (Math.max(0, d.outstanding) / limit)
        if (util >= 0.5) {
            alerts.push({ id: d.id, name: d.name, utilization: util, level: 'critical', message: 'Utilization above 50% can hurt your score' })
        } else if (util >= 0.3) {
            alerts.push({ id: d.id, name: d.name, utilization: util, level: 'warning', message: 'Utilization above 30% may impact score' })
        }
    }
    return alerts
}


