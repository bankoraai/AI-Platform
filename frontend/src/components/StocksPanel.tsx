import { useEffect, useState } from 'react'
import { Box, Button, Divider, List, ListItem, ListItemText, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material'

export default function StocksPanel({ balances, onUpdateBalances }: { balances: { id: string; available?: number; current?: number; currency?: string }[]; onUpdateBalances: (b: { id: string; available?: number; current?: number; currency?: string }[]) => void }) {
    type Position = { symbol: string; quantity: number; avgPrice: number }

    const [watchlist, setWatchlist] = useState<string[]>(() => {
        try {
            const raw = localStorage.getItem('stock_watchlist')
            const arr = raw ? JSON.parse(raw) : null
            return Array.isArray(arr) && arr.length ? arr : ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN']
        } catch { return ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN'] }
    })
    const [positions, setPositions] = useState<Position[]>(() => {
        try {
            const raw = localStorage.getItem('stock_positions')
            const arr = raw ? JSON.parse(raw) : []
            return Array.isArray(arr) ? arr : []
        } catch { return [] }
    })
    const [selected, setSelected] = useState<string>(watchlist[0] || 'AAPL')
    const [qty, setQty] = useState<number>(1)
    const [side, setSide] = useState<'BUY' | 'SELL'>('BUY')
    const [transAmt, setTransAmt] = useState<number>(0)

    useEffect(() => {
        try { localStorage.setItem('stock_watchlist', JSON.stringify(watchlist)) } catch {}
    }, [watchlist])
    useEffect(() => {
        try { localStorage.setItem('stock_positions', JSON.stringify(positions)) } catch {}
    }, [positions])

    function getStockCash(): number {
        const acc = balances.find(b => b.id === 'ACC-STOCK')
        return Number(acc?.available ?? acc?.current ?? 0)
    }
    function setStockCash(newCash: number) {
        onUpdateBalances(balances.map(b => b.id === 'ACC-STOCK' ? { ...b, available: newCash, current: newCash } : b))
    }

    function getGeneralCash(): number {
        return balances
            .filter(b => b.id !== 'ACC-STOCK')
            .reduce((sum, b) => sum + Number(b.available ?? b.current ?? 0), 0)
    }

    function priceForSymbol(sym: string, t: number): number {
        const base = sym.split('').reduce((s, c) => s + c.charCodeAt(0), 0)
        const drift = 0.0005
        const vol = 0.012
        const noise = Math.sin((base % 97) * 0.07 + t * 0.08) * vol + Math.cos((base % 59) * 0.05 + t * 0.11) * vol * 0.6
        const p0 = 50 + (base % 150)
        const pt = p0 * (1 + drift * t / 60) * (1 + noise)
        return Math.max(1, Number(pt.toFixed(2)))
    }

    const [tick, setTick] = useState<number>(0)
    useEffect(() => {
        const id = setInterval(() => setTick(t => (t + 1) % 6000), 1000)
        return () => clearInterval(id)
    }, [])

    function currentPrice(sym: string): number {
        return priceForSymbol(sym, tick)
    }

    function linePathMini(values: number[], width: number, height: number, padding: number) {
        const w = width - padding * 2
        const h = height - padding * 2
        const max = Math.max(...values)
        const min = Math.min(...values)
        const n = values.length - 1
        const pts = values.map((v, i) => {
            const x = padding + (i / Math.max(1, n)) * w
            const y = padding + h - ((v - min) / Math.max(1, max - min)) * h
            return `${x},${y}`
        }).join(' ')
        return `M ${pts.replace(/ /g, ' L ')}`
    }

    function totalEquity(): number {
        const cash = getStockCash()
        const equity = positions.reduce((s, p) => s + p.quantity * currentPrice(p.symbol), 0)
        return cash + equity
    }

    function upsertPosition(sym: string, deltaQty: number, fillPrice: number) {
        setPositions(prev => {
            const idx = prev.findIndex(p => p.symbol === sym)
            if (idx === -1) {
                if (deltaQty <= 0) return prev
                return [...prev, { symbol: sym, quantity: deltaQty, avgPrice: fillPrice }]
            }
            const cur = prev[idx]
            const newQty = cur.quantity + deltaQty
            if (newQty <= 0.000001) {
                return prev.filter((_, i) => i !== idx)
            }
            const bought = deltaQty > 0 ? deltaQty : 0
            const newAvg = bought > 0 ? ((cur.avgPrice * cur.quantity) + (fillPrice * bought)) / (cur.quantity + bought) : cur.avgPrice
            const next = prev.slice()
            next[idx] = { symbol: sym, quantity: newQty, avgPrice: newAvg }
            return next
        })
    }

    function executeTrade() {
        const sym = (selected || '').toUpperCase().trim()
        if (!sym || qty <= 0) return
        const px = currentPrice(sym)
        const fee = Math.max(0.0, Math.min(5, px * qty * 0.001))
        if (side === 'BUY') {
            const cost = px * qty + fee
            const cash = getStockCash()
            if (cost > cash) { alert('Insufficient stock cash'); return }
            setStockCash(cash - cost)
            upsertPosition(sym, qty, px)
        } else {
            const pos = positions.find(p => p.symbol === sym)
            if (!pos || pos.quantity < qty) { alert('Insufficient position'); return }
            const proceeds = px * qty - fee
            setStockCash(getStockCash() + proceeds)
            upsertPosition(sym, -qty, px)
        }
    }

    function transferToStocks() {
        const amt = Math.max(0, transAmt)
        if (!amt) return
        const gen = getGeneralCash()
        if (amt > gen) { alert('Insufficient general balance'); return }
        const next = balances.map(b => ({ ...b }))
        // ensure stock account exists
        let stock = next.find(b => b.id === 'ACC-STOCK') as any
        if (!stock) {
            stock = { id: 'ACC-STOCK', available: 0, current: 0, currency: (next.find(b => b.id !== 'ACC-STOCK')?.currency) || 'ILS' }
            next.push(stock)
        }
        // debit general
        let remaining = amt
        for (let i = 0; i < next.length && remaining > 0; i++) {
            const b = next[i]
            if (b.id === 'ACC-STOCK') continue
            const bal = Number(b.available ?? b.current ?? 0)
            const take = Math.min(bal, remaining)
            const newBal = bal - take
            ;(b as any).available = newBal
            ;(b as any).current = newBal
            remaining -= take
        }
        // credit stocks
        const sc = Number(stock.available ?? stock.current ?? 0)
        const newSc = sc + amt
        stock.available = newSc
        stock.current = newSc
        onUpdateBalances(next)
        setTransAmt(0)
    }

    function transferToGeneral() {
        const amt = Math.max(0, transAmt)
        if (!amt) return
        const next = balances.map(b => ({ ...b }))
        // ensure stock account exists
        let stockIdx = next.findIndex(b => b.id === 'ACC-STOCK')
        if (stockIdx < 0) {
            next.push({ id: 'ACC-STOCK', available: 0, current: 0, currency: (next.find(b => b.id !== 'ACC-STOCK')?.currency) || 'ILS' })
            stockIdx = next.length - 1
        }
        const stock = next[stockIdx] as any
        const sc = Number(stock.available ?? stock.current ?? 0)
        if (amt > sc) { alert('Insufficient stocks cash'); return }
        stock.available = sc - amt
        stock.current = sc - amt
        // credit first general account
        let genIdx = next.findIndex(b => b.id !== 'ACC-STOCK')
        if (genIdx < 0) {
            next.push({ id: 'ACC-001', available: 0, current: 0, currency: 'ILS' })
            genIdx = next.length - 1
        }
        const g = next[genIdx] as any
        const gb = Number(g.available ?? g.current ?? 0)
        g.available = gb + amt
        g.current = gb + amt
        onUpdateBalances(next)
        setTransAmt(0)
    }

    const miniSeries = (() => {
        const arr: number[] = []
        for (let i = 0; i <= 60; i++) arr.push(priceForSymbol(selected, Math.max(0, tick - (60 - i))))
        return arr
    })()

    return (
        <Stack spacing={2} sx={{ mt: 2 }}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'stretch', md: 'flex-start' }}>
                <Paper sx={{ p: 2, flex: 1 }}>
                    <Stack direction="row" alignItems="center" justifyContent="space-between">
                        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Watchlist</Typography>
                        <Stack direction="row" spacing={1}>
                            <TextField size="small" placeholder="Add symbol" onKeyDown={(e) => {
                                const t = e.target as HTMLInputElement
                                if (e.key === 'Enter') {
                                    const sym = (t.value || '').toUpperCase().trim()
                                    if (sym && !watchlist.includes(sym)) setWatchlist(prev => [...prev, sym])
                                    t.value = ''
                                }
                            }} />
                        </Stack>
                    </Stack>
                    <List>
                        {watchlist.map(sym => {
                            const px = currentPrice(sym)
                            const sel = sym === selected
                            return (
                                <ListItem key={sym} onClick={() => setSelected(sym)} sx={{ cursor: 'pointer', bgcolor: sel ? 'rgba(11,94,215,0.06)' : undefined }}>
                                    <ListItemText primary={`${sym}`} secondary={`${px.toFixed(2)} ILS`} />
                                </ListItem>
                            )
                        })}
                    </List>
                </Paper>

                <Paper sx={{ p: 2, flex: 2 }}>
                    <Stack direction="row" alignItems="center" justifyContent="space-between">
                        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{selected} — {currentPrice(selected).toFixed(2)} ILS</Typography>
                        <Typography variant="body2" color="text.secondary">Equity: {Math.round(totalEquity()).toLocaleString()} ILS</Typography>
                    </Stack>
                    <Box sx={{ mt: 1, position: 'relative', height: 220, borderRadius: 2, background: 'linear-gradient(180deg, rgba(11,94,215,0.06), rgba(11,94,215,0.02))', border: '1px solid rgba(0,0,0,0.06)' }}>
                        <svg width="100%" height="100%" viewBox="0 0 700 220" preserveAspectRatio="none">
                            <path d={linePathMini(miniSeries, 700, 220, 20)} fill="none" stroke="#0B5ED7" strokeWidth="2.5" />
                        </svg>
                    </Box>
                    <Stack sx={{ mt: 2 }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>Positions</Typography>
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell>Symbol</TableCell>
                                    <TableCell align="right">Qty</TableCell>
                                    <TableCell align="right">Avg Price</TableCell>
                                    <TableCell align="right">Market</TableCell>
                                    <TableCell align="right">P/L</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {positions.map(p => {
                                    const mkt = currentPrice(p.symbol) * p.quantity
                                    const cost = p.avgPrice * p.quantity
                                    const pl = mkt - cost
                                    return (
                                        <TableRow key={p.symbol} hover>
                                            <TableCell>{p.symbol}</TableCell>
                                            <TableCell align="right">{p.quantity}</TableCell>
                                            <TableCell align="right">{p.avgPrice.toFixed(2)}</TableCell>
                                            <TableCell align="right">{mkt.toFixed(2)}</TableCell>
                                            <TableCell align="right" style={{ color: pl >= 0 ? '#16a34a' : '#dc2626' }}>{pl.toFixed(2)}</TableCell>
                                        </TableRow>
                                    )
                                })}
                                {positions.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={5}><Typography variant="body2" color="text.secondary">No positions yet.</Typography></TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </Stack>
                </Paper>

                <Paper sx={{ p: 2, flex: 1 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Trade</Typography>
                    <Stack spacing={1.25} sx={{ mt: 1 }}>
                        <TextField label="Symbol" value={selected} onChange={e => setSelected(e.target.value.toUpperCase())} />
                        <Stack direction="row" spacing={1}>
                            <Button variant={side === 'BUY' ? 'contained' : 'outlined'} color="primary" onClick={() => setSide('BUY')}>Buy</Button>
                            <Button variant={side === 'SELL' ? 'contained' : 'outlined'} color="secondary" onClick={() => setSide('SELL')}>Sell</Button>
                        </Stack>
                        <TextField label="Quantity" type="number" value={qty} onChange={e => setQty(Math.max(0, Number(e.target.value)))} />
                        <Typography variant="body2" color="text.secondary">Est. price: {currentPrice(selected).toFixed(2)} ILS</Typography>
                        <Typography variant="body2">Stock cash: {Math.round(getStockCash()).toLocaleString()} ILS</Typography>
                        <Button variant="contained" onClick={executeTrade}>{side}</Button>
                    </Stack>

                    <Divider sx={{ my: 2 }} />
                    <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Transfer</Typography>
                    <Stack spacing={1.25} sx={{ mt: 1 }}>
                        <TextField label="Amount" type="number" value={transAmt} onChange={e => setTransAmt(Math.max(0, Number(e.target.value)))} />
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                            <Button variant="outlined" onClick={transferToStocks}>To Stocks</Button>
                            <Button variant="outlined" onClick={transferToGeneral}>To General</Button>
                        </Stack>
                        <Typography variant="caption" color="text.secondary">General: {Math.round(getGeneralCash()).toLocaleString()} ILS</Typography>
                        <Typography variant="caption" color="text.secondary">Stocks: {Math.round(getStockCash()).toLocaleString()} ILS</Typography>
                    </Stack>
                </Paper>
            </Stack>
        </Stack>
    )
}


