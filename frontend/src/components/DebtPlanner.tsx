import { useMemo, useState } from 'react'
import { Box, Paper, Stack, Typography, ToggleButton, ToggleButtonGroup, TextField, Table, TableHead, TableRow, TableCell, TableBody, Chip, Divider, Button } from '@mui/material'
import type { Loan } from '../lib/types'
import { simulateDebtPayoff, suggestRefinance, computeUtilizationAlerts, type Strategy } from '../lib/debt'

const demoDebts: Loan[] = [
    { id: 'cc-1', name: 'Visa Classic', principal: 0, outstanding: 8500, rate: 19.9, payment: 300, currency: 'ILS', kind: 'revolving', creditLimit: 20000 },
    { id: 'loan-1', name: 'Auto Loan', principal: 45000, outstanding: 32000, rate: 7.2, payment: 1200, currency: 'ILS', kind: 'installment' },
    { id: 'loan-2', name: 'Personal Loan', principal: 25000, outstanding: 18000, rate: 11.5, payment: 900, currency: 'ILS', kind: 'installment' },
]

export default function DebtPlanner({ onSimulate }: { onSimulate?: () => void }) {
    const [debts, setDebts] = useState<Loan[]>(demoDebts)
    const [strategy, setStrategy] = useState<Strategy>('avalanche')
    const [budget, setBudget] = useState<number>(() => debts.reduce((s, d) => s + (d.payment || 0), 0) + 500)
    const [offeredApr, setOfferedApr] = useState<number>(7)

    const sim = useMemo(() => {
        return simulateDebtPayoff(
            debts.map(d => ({ ...d, minPayment: d.payment })),
            Math.max(0, Number(budget) || 0),
            strategy
        )
    }, [debts, budget, strategy])

    const refi = useMemo(() => suggestRefinance(debts, offeredApr, 1), [debts, offeredApr])
    const utilAlerts = useMemo(() => computeUtilizationAlerts(debts), [debts])

    const totalDebt = debts.reduce((s, d) => s + (d.outstanding || 0), 0)

    function fmt(n: number): string { return `${Math.round(n).toLocaleString()} ILS` }

    return (
        <Paper sx={{ p: 2, borderRadius: 2 }} className="glass">
            <Stack spacing={2}>
                <Stack direction={{ xs: 'column', md: 'row' }} alignItems={{ xs: 'stretch', md: 'center' }} spacing={2}>
                    <Box sx={{ flex: 1 }}>
                        <Typography variant="h6">Debt payoff planner</Typography>
                        <Typography variant="body2" color="text.secondary">Simulate snowball/avalanche strategies, see refinance ideas, and watch utilization.</Typography>
                    </Box>
                    <ToggleButtonGroup
                        value={strategy}
                        exclusive
                        onChange={(_, v: Strategy | null) => v && setStrategy(v)}
                        size="small"
                    >
                        <ToggleButton value="snowball">Snowball</ToggleButton>
                        <ToggleButton value="avalanche">Avalanche</ToggleButton>
                    </ToggleButtonGroup>
                    <TextField
                        type="number"
                        label="Monthly budget"
                        size="small"
                        value={budget}
                        onChange={e => setBudget(Number(e.target.value) || 0)}
                        inputProps={{ min: 0 }}
                    />
                </Stack>

                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>Debt</TableCell>
                            <TableCell align="right">Balance</TableCell>
                            <TableCell align="right">APR</TableCell>
                            <TableCell align="right">Min payment</TableCell>
                            <TableCell align="right">Limit</TableCell>
                            <TableCell align="right">Utilization</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {debts.map(d => {
                            const util = d.creditLimit ? Math.min(1, (d.outstanding || 0) / d.creditLimit) : undefined
                            return (
                                <TableRow key={d.id}>
                                    <TableCell>{d.name}</TableCell>
                                    <TableCell align="right">{fmt(d.outstanding)}</TableCell>
                                    <TableCell align="right">{(d.rate || 0).toFixed(1)}%</TableCell>
                                    <TableCell align="right">{fmt(d.payment || 0)}</TableCell>
                                    <TableCell align="right">{d.creditLimit ? fmt(d.creditLimit) : '-'}</TableCell>
                                    <TableCell align="right">{util !== undefined ? `${Math.round(util * 100)}%` : '-'}</TableCell>
                                </TableRow>
                            )
                        })}
                    </TableBody>
                </Table>

                <Divider />

                <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                    <Box sx={{ flex: 1 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Simulation</Typography>
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                            <Chip size="small" label={`Strategy: ${strategy}`} />
                            <Chip size="small" label={`Budget: ${fmt(budget)}`} />
                            <Chip size="small" label={`Debts: ${debts.length}`} />
                        </Stack>
                        {sim.months > 0 ? (
                            <>
                                <Typography variant="body2">Payoff time: <strong>{sim.months}</strong> months.</Typography>
                                <Typography variant="body2">Total interest (est.): <strong>{fmt(sim.totalInterest)}</strong>.</Typography>
                                <Typography variant="body2">Payoff order: {sim.payoffOrder.map(id => debts.find(d => d.id === id)?.name || id).join(' → ')}</Typography>
                                <Box sx={{ mt: 1.5 }}>
                                    <Button variant="contained" size="small" onClick={() => onSimulate && onSimulate()}>Simulate impact</Button>
                                </Box>
                            </>
                        ) : (
                            <Typography variant="body2" color="text.secondary">Enter a positive budget to simulate.</Typography>
                        )}
                    </Box>
                    <Box sx={{ flex: 1 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Refinance suggestions</Typography>
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                            <TextField type="number" size="small" label="Offered APR" value={offeredApr} onChange={e => setOfferedApr(Number(e.target.value) || 0)} inputProps={{ min: 0, step: 0.1 }} />
                            <Chip size="small" label={`Total debt: ${fmt(totalDebt)}`} />
                        </Stack>
                        {refi.length ? (
                            <Stack spacing={1}>
                                {refi.map(r => (
                                    <Paper key={r.id} sx={{ p: 1.5 }} variant="outlined">
                                        <Typography variant="body2"><strong>{r.name}</strong>: {r.currentApr.toFixed(1)}% → {r.offeredApr.toFixed(1)}%</Typography>
                                        <Typography variant="caption" color="text.secondary">Est. monthly interest savings: {fmt(r.estMonthlyInterestSavings)}</Typography>
                                    </Paper>
                                ))}
                            </Stack>
                        ) : (
                            <Typography variant="body2" color="text.secondary">No refinance opportunities detected for the offered rate.</Typography>
                        )}
                    </Box>
                </Stack>

                <Box>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Utilization alerts</Typography>
                    {utilAlerts.length ? (
                        <Stack spacing={1} sx={{ mt: 1 }}>
                            {utilAlerts.map(a => (
                                <Chip key={a.id} size="small" color={a.level === 'critical' ? 'error' : a.level === 'warning' ? 'warning' as any : 'default'} label={`${a.name}: ${Math.round(a.utilization * 100)}% – ${a.message}`} />
                            ))}
                        </Stack>
                    ) : (
                        <Typography variant="body2" color="text.secondary">All revolving balances are within healthy utilization.</Typography>
                    )}
                </Box>

                <Box>
                    <Button variant="outlined" size="small" onClick={() => setDebts(demoDebts)}>Reset demo debts</Button>
                </Box>
            </Stack>
        </Paper>
    )
}


