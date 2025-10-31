import { Box, Chip, Paper, Stack, Typography } from '@mui/material'
import type { AccountBalance, SavingsAccount, Loan } from '../lib/types'

export default function FinancialSnapshot({
    balances,
    savings,
    loans,
    currency = 'ILS',
}: {
    balances: AccountBalance[]
    savings: SavingsAccount[]
    loans: Loan[]
    currency?: string
}) {
    const totalCash = balances.reduce((sum, b) => sum + Number(b.available ?? b.current ?? 0), 0)
    const totalSavings = savings.reduce((sum, s) => sum + Number(s.balance || 0), 0)
    const totalDebt = loans.reduce((sum, l) => sum + Number(l.outstanding || 0), 0)
    const net = totalCash + totalSavings - totalDebt

    function fmt(n: number) {
        return `${Math.round(n).toLocaleString()} ${currency}`
    }

    return (
        <Paper sx={{ p: 2, mb: 2, borderRadius: 2 }} className="glass">
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'stretch', md: 'center' }}>
                <Box sx={{ flex: 1 }}>
                    <Typography variant="overline">Cash</Typography>
                    <Typography variant="h6">{fmt(totalCash)}</Typography>
                </Box>
                <Box sx={{ flex: 1 }}>
                    <Typography variant="overline">Savings</Typography>
                    <Typography variant="h6">{fmt(totalSavings)}</Typography>
                </Box>
                <Box sx={{ flex: 1 }}>
                    <Typography variant="overline">Debt</Typography>
                    <Typography variant="h6">{fmt(totalDebt)}</Typography>
                </Box>
                <Box sx={{ flex: 1 }}>
                    <Typography variant="overline">Net liquidity</Typography>
                    <Typography variant="h6">{fmt(net)}</Typography>
                </Box>
                <Box>
                    <Chip size="small" label="Snapshot" variant="outlined" />
                </Box>
            </Stack>
        </Paper>
    )
}


