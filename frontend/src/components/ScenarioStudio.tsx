import { useEffect, useMemo, useState } from 'react'
import { Box, Paper, Stack, Typography, Slider, Chip, Divider, Button, Dialog, DialogTitle, DialogContent, DialogActions, IconButton, Tooltip } from '@mui/material'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import PauseIcon from '@mui/icons-material/Pause'
import type { AccountBalance } from '../lib/types'

type Props = {
    balances: AccountBalance[]
}

type Inputs = {
    income: number
    rent: number
    travel: number
    other: number
    savingsRatePct: number
    months: number
}

function clamp(n: number, min: number, max: number): number { return Math.max(min, Math.min(max, n)) }

export default function ScenarioStudio({ balances }: Props) {
    const startingCash = useMemo(() => (balances || []).reduce((s, b) => s + Number(b.available ?? 0), 0), [balances])

    const [inputs, setInputs] = useState<Inputs>(() => {
        try {
            const raw = localStorage.getItem('scenario_studio_v1')
            const parsed = raw ? JSON.parse(raw) as Partial<Inputs> : {}
            return {
                income: clamp(Number(parsed.income ?? 18000), 0, 100000),
                rent: clamp(Number(parsed.rent ?? 6500), 0, 30000),
                travel: clamp(Number(parsed.travel ?? 1500), 0, 25000),
                other: clamp(Number(parsed.other ?? 6000), 0, 60000),
                savingsRatePct: clamp(Number(parsed.savingsRatePct ?? 10), 0, 80),
                months: clamp(Number(parsed.months ?? 24), 6, 120)
            }
        } catch {
            return { income: 18000, rent: 6500, travel: 1500, other: 6000, savingsRatePct: 10, months: 24 }
        }
    })

    useEffect(() => {
        try { localStorage.setItem('scenario_studio_v1', JSON.stringify(inputs)) } catch {}
    }, [inputs])

    const monthlyDiscretionary = inputs.travel + inputs.other
    const monthlyEssentials = inputs.rent
    const monthlySavings = Math.max(0, (inputs.income - monthlyEssentials - monthlyDiscretionary) * (inputs.savingsRatePct / 100))
    const monthlyNet = inputs.income - monthlyEssentials - monthlyDiscretionary - monthlySavings

    const projection = useMemo(() => {
        const months: number[] = []
        const cash: number[] = []
        let cur = startingCash
        for (let i = 0; i < inputs.months; i++) {
            months.push(i)
            cur += monthlyNet
            cash.push(cur)
        }
        return { months, cash }
    }, [inputs.months, monthlyNet, startingCash])

    const runwayMonths = useMemo(() => {
        if (monthlyNet >= 0) return Infinity
        if (startingCash <= 0) return 0
        return Math.max(0, Math.floor(startingCash / Math.abs(monthlyNet)))
    }, [monthlyNet, startingCash])

    function fmt(n: number): string { return `${Math.round(n).toLocaleString()} ILS` }

    function recommendations(): string[] {
        const recs: string[] = []
        if (monthlyNet < 0) {
            const needed = Math.ceil(Math.abs(monthlyNet))
            const cutTravel = Math.min(inputs.travel, needed)
            const cutOther = Math.max(0, needed - cutTravel)
            recs.push(`You are overspending by ~${fmt(needed)} per month. Reduce travel by ${fmt(cutTravel)}${cutOther > 0 ? ` and other by ${fmt(cutOther)}` : ''} to break even.`)
            if (runwayMonths > 0 && runwayMonths !== Infinity) recs.push(`Runway ~${runwayMonths} months at current burn. Consider raising income or pausing non-essentials.`)
        } else if (monthlyNet > 0) {
            const expenses = monthlyEssentials + monthlyDiscretionary
            const targetFund = Math.round(expenses * 3)
            const monthsToTarget = monthlyNet > 0 ? Math.ceil(Math.max(0, targetFund - startingCash) / monthlyNet) : Infinity
            recs.push(`You have a monthly surplus of ${fmt(monthlyNet)}. Reach a 3-month cushion (~${fmt(targetFund)}) in ~${Number.isFinite(monthsToTarget) ? monthsToTarget : 0} months.`)
            recs.push(`Consider allocating part of surplus to high-interest debt or higher-yield savings.`)
        } else {
            recs.push('You are roughly at break-even. Small changes to spending or income will build cushion.')
        }
        return recs
    }

    // Scale for dialog chart
    const seriesMin = Math.min(0, ...projection.cash)
    const seriesMax = Math.max(...projection.cash)
    const yMin = seriesMin - Math.max(1, Math.abs(seriesMax - seriesMin) * 0.08)
    const yMax = seriesMax + Math.max(1, Math.abs(seriesMax - seriesMin) * 0.08)

    // Hover index used by the dialog chart
    const [hoverIdx, setHoverIdx] = useState<number | null>(null)

    // Targets (3-month cushion)
    const expenses = monthlyEssentials + monthlyDiscretionary
    const targetFund = Math.round(expenses * 3)

    // Dialog + playback state
    const [dialogOpen, setDialogOpen] = useState(false)
    const [playing, setPlaying] = useState(true)
    const [playIdx, setPlayIdx] = useState(0)
    useEffect(() => {
        if (!dialogOpen || !playing || projection.cash.length === 0) return
        const id = setInterval(() => {
            setPlayIdx((i) => (i + 1) % Math.max(1, projection.cash.length))
        }, 150)
        return () => clearInterval(id)
    }, [dialogOpen, playing, projection.cash.length])

    return (
        <Paper sx={{ p: 3 }} className="glass">
            <Stack spacing={2}>
                <Typography variant="h5" sx={{ fontWeight: 700 }}>Scenario Studio</Typography>
                <Typography variant="body2" color="text.secondary">Drag sliders to test income and spending scenarios. See projected cash and actionable recommendations.</Typography>

                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ xs: 'stretch', md: 'center' }}>
                    <Chip label={`Starting cash: ${fmt(startingCash)}`} color="primary" size="small" />
                    <Chip label={`Net monthly: ${fmt(monthlyNet)}`} size="small" />
                    {Number.isFinite(runwayMonths) ? (
                        <Chip label={`Runway: ${runwayMonths} mo`} color={monthlyNet < 0 ? 'warning' : 'default'} size="small" />
                    ) : (
                        <Chip label="Runway: growing" color="success" size="small" />
                    )}
                </Stack>

                <Divider />

                <Stack spacing={2}>
                    <Box>
                        <Typography gutterBottom>Monthly income: {fmt(inputs.income)}</Typography>
                        <Slider min={0} max={100000} step={100} value={inputs.income} onChange={(_, v) => setInputs(s => ({ ...s, income: v as number }))} />
                    </Box>
                    <Box>
                        <Typography gutterBottom>Rent: {fmt(inputs.rent)}</Typography>
                        <Slider min={0} max={30000} step={100} value={inputs.rent} onChange={(_, v) => setInputs(s => ({ ...s, rent: v as number }))} />
                    </Box>
                    <Box>
                        <Typography gutterBottom>Travel: {fmt(inputs.travel)}</Typography>
                        <Slider min={0} max={25000} step={100} value={inputs.travel} onChange={(_, v) => setInputs(s => ({ ...s, travel: v as number }))} />
                    </Box>
                    <Box>
                        <Typography gutterBottom>Other expenses: {fmt(inputs.other)}</Typography>
                        <Slider min={0} max={60000} step={100} value={inputs.other} onChange={(_, v) => setInputs(s => ({ ...s, other: v as number }))} />
                    </Box>
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                        <Box sx={{ flex: 1 }}>
                            <Typography gutterBottom>Savings rate: {inputs.savingsRatePct}%</Typography>
                            <Slider min={0} max={80} step={1} value={inputs.savingsRatePct} onChange={(_, v) => setInputs(s => ({ ...s, savingsRatePct: v as number }))} />
                        </Box>
                        <Box sx={{ flex: 1 }}>
                            <Typography gutterBottom>Horizon (months): {inputs.months}</Typography>
                            <Slider min={6} max={120} step={1} value={inputs.months} onChange={(_, v) => setInputs(s => ({ ...s, months: v as number }))} />
                        </Box>
                    </Stack>
                </Stack>

                <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'stretch', sm: 'center' }} justifyContent="space-between">
                    <Typography variant="subtitle2" sx={{ opacity: 0.8 }}>Projection</Typography>
                    <Button size="small" variant="outlined" onClick={() => { setDialogOpen(true); setPlayIdx(0); setPlaying(true) }}>Open Interactive Simulation</Button>
                </Stack>

                {/* Interactive Dialog */}
                <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="lg">
                    <DialogTitle>
                        <Stack direction="row" alignItems="center" justifyContent="space-between">
                            <Typography variant="h6" sx={{ fontWeight: 700 }}>Interactive Simulation</Typography>
                            <Stack direction="row" spacing={1} alignItems="center">
                                <Tooltip title={playing ? 'Pause' : 'Play'}>
                                    <IconButton onClick={() => setPlaying(p => !p)}>
                                        {playing ? <PauseIcon /> : <PlayArrowIcon />}
                                    </IconButton>
                                </Tooltip>
                            </Stack>
                        </Stack>
                    </DialogTitle>
                    <DialogContent dividers>
                        {(() => {
                            const D_W = 980
                            const D_H = 420
                            const D_PAD = 44
                            const d_xForIndex = (i: number) => {
                                const n = Math.max(1, projection.cash.length - 1)
                                return D_PAD + (i / n) * (D_W - D_PAD * 2)
                            }
                            const d_yForValue = (v: number) => {
                                const h = D_H - D_PAD * 2
                                return D_PAD + h - ((v - yMin) / Math.max(1e-6, yMax - yMin)) * h
                            }
                            const d_linePath = (values: number[]) => {
                                if (!values.length) return ''
                                const pts = values.map((v, i) => `${d_xForIndex(i)},${d_yForValue(v)}`).join(' L ')
                                return `M ${pts}`
                            }
                            const d_areaPath = (values: number[]) => {
                                if (!values.length) return ''
                                const x0 = d_xForIndex(0)
                                const xb = d_xForIndex(values.length - 1)
                                const yb = d_yForValue(yMin)
                                const top = values.map((v, i) => `${d_xForIndex(i)},${d_yForValue(v)}`).join(' L ')
                                return `M ${x0},${yb} L ${top} L ${xb},${yb} Z`
                            }
                            const d_zeroY = d_yForValue(0)
                            const d_targetY = d_yForValue(targetFund)
                            const currentIdx = hoverIdx !== null ? hoverIdx : playIdx
                            const currentX = d_xForIndex(currentIdx)
                            const currentY = d_yForValue(projection.cash[currentIdx] ?? 0)

                            return (
                                <Box sx={{ position: 'relative', height: D_H, borderRadius: 2, background: 'linear-gradient(180deg, rgba(6,10,25,0.85), rgba(6,10,25,0.7))', border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                                    <svg
                                        width="100%"
                                        height="100%"
                                        viewBox={`0 0 ${D_W} ${D_H}`}
                                        preserveAspectRatio="none"
                                        onMouseMove={(e) => {
                                            const rect = e.currentTarget.getBoundingClientRect()
                                            const px = clamp(e.clientX - rect.left, D_PAD, D_W - D_PAD)
                                            const n = Math.max(1, projection.cash.length - 1)
                                            const ratio = (px - D_PAD) / Math.max(1, (D_W - D_PAD * 2))
                                            const idx = Math.round(clamp(ratio, 0, 1) * n)
                                            setHoverIdx(idx)
                                        }}
                                        onMouseLeave={() => setHoverIdx(null)}
                                    >
                                        <defs>
                                            <linearGradient id="d_gridFade" x1="0" x2="0" y1="0" y2="1">
                                                <stop offset="0%" stopColor="rgba(255,255,255,0.18)" />
                                                <stop offset="100%" stopColor="rgba(255,255,255,0.05)" />
                                            </linearGradient>
                                            <linearGradient id="d_lineGrad" x1="0" y1="0" x2="1" y2="0">
                                                <stop offset="0%" stopColor="#22C55E" />
                                                <stop offset="50%" stopColor="#0B5ED7" />
                                                <stop offset="100%" stopColor="#8B5CF6" />
                                            </linearGradient>
                                            <linearGradient id="d_areaGrad" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor="rgba(13,110,253,0.28)" />
                                                <stop offset="100%" stopColor="rgba(13,110,253,0.03)" />
                                            </linearGradient>
                                            <filter id="d_glow" x="-50%" y="-50%" width="200%" height="200%">
                                                <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                                                <feMerge>
                                                    <feMergeNode in="coloredBlur" />
                                                    <feMergeNode in="SourceGraphic" />
                                                </feMerge>
                                            </filter>
                                        </defs>

                                        {/* Grid */}
                                        {(() => {
                                            const g: JSX.Element[] = []
                                            for (let i = 0; i <= 12; i++) {
                                                const x = d_xForIndex(Math.round((projection.cash.length - 1) * (i / 12)))
                                                g.push(<line key={`d-gv-${i}`} x1={x} x2={x} y1={D_PAD} y2={D_H - D_PAD} stroke="url(#d_gridFade)" />)
                                            }
                                            for (let j = 0; j <= 6; j++) {
                                                const y = D_PAD + (j / 6) * (D_H - D_PAD * 2)
                                                g.push(<line key={`d-gh-${j}`} x1={D_PAD} x2={D_W - D_PAD} y1={y} y2={y} stroke="url(#d_gridFade)" />)
                                            }
                                            return g
                                        })()}

                                        {/* Baselines */}
                                        <line x1={D_PAD} x2={D_W - D_PAD} y1={d_zeroY} y2={d_zeroY} stroke="rgba(255,255,255,0.22)" strokeDasharray="4 4" />
                                        <line x1={D_PAD} x2={D_W - D_PAD} y1={d_targetY} y2={d_targetY} stroke="rgba(34,197,94,0.4)" strokeDasharray="6 6" />

                                        {/* Series */}
                                        <path d={d_areaPath(projection.cash)} fill="url(#d_areaGrad)" />
                                        <path d={d_linePath(projection.cash)} fill="none" stroke="url(#d_lineGrad)" strokeWidth={2.25} filter="url(#d_glow)" />

                                        {/* Cursor */}
                                        <line x1={currentX} x2={currentX} y1={D_PAD} y2={D_H - D_PAD} stroke="rgba(139,92,246,0.65)" strokeDasharray="3 3" />
                                        <circle cx={currentX} cy={currentY} r={4.5} fill="#8B5CF6" stroke="white" strokeWidth={1} />

                                        {/* Y labels */}
                                        {(() => {
                                            const labels: JSX.Element[] = []
                                            for (let j = 0; j <= 5; j++) {
                                                const val = yMin + (j / 5) * (yMax - yMin)
                                                const yy = d_yForValue(val)
                                                labels.push(
                                                    <text key={`d-yl-${j}`} x={D_PAD - 10} y={yy} textAnchor="end" dominantBaseline="middle" fill="rgba(255,255,255,0.7)" fontSize="11">
                                                        {fmt(val)}
                                                    </text>
                                                )
                                            }
                                            return labels
                                        })()}
                                    </svg>

                                    {/* Floating tooltip */}
                                    <Box sx={{ position: 'absolute', top: Math.max(8, currentY - 40), left: Math.min(D_W - 180, Math.max(8, currentX + 10)), p: 1, borderRadius: 1, background: 'rgba(16,24,48,0.92)', color: 'white', border: '1px solid rgba(139,92,246,0.55)' }}>
                                        <Typography variant="caption">Month {currentIdx + 1}</Typography>
                                        <Typography variant="body2" sx={{ fontWeight: 700 }}>{fmt(projection.cash[currentIdx] || 0)}</Typography>
                                    </Box>
                                </Box>
                            )
                        })()}

                        {/* Scrubber */}
                        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'stretch', md: 'center' }} sx={{ mt: 2 }}>
                            <Box sx={{ flex: 1 }}>
                                <Typography gutterBottom>Scrub timeline</Typography>
                                <Slider min={0} max={Math.max(0, projection.cash.length - 1)} step={1} value={playIdx} onChange={(_, v) => setPlayIdx(v as number)} />
                            </Box>
                            <Chip label={`Value: ${fmt(projection.cash[playIdx] || 0)}`} size="small" />
                        </Stack>
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => setDialogOpen(false)}>Close</Button>
                    </DialogActions>
                </Dialog>

                <Box>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>Recommended actions</Typography>
                    <Stack spacing={1}>
                        {recommendations().map((r, i) => (
                            <Paper key={i} sx={{ p: 1.5 }} variant="outlined">
                                <Typography variant="body2">• {r}</Typography>
                            </Paper>
                        ))}
                    </Stack>
                </Box>
            </Stack>
        </Paper>
    )
}


