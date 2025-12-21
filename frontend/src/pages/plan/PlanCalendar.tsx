import { useMemo, useState } from 'react'
import { Link as RouterLink, useOutletContext } from 'react-router-dom'
import { Badge, Button, Stack, Typography } from '@mui/material'
import Calendar from 'react-calendar'
import 'react-calendar/dist/Calendar.css'

import type { PlanOutletContext } from './PlanRoute'
import { PlanCard } from '../../components/plan/PlanCard'
import { TaskChecklist, usePlanTasks } from '../../components/plan/TaskChecklist'
import type { TaskOut } from '../../api/ApiClient'

type CalendarValue = Date | [Date, Date] | null

function dayKeyLocal(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function taskDueDayKey(task: TaskOut): string | null {
  if (!task.due_at) return null
  const dt = new Date(task.due_at)
  if (Number.isNaN(dt.getTime())) return null
  return dayKeyLocal(dt)
}

export function PlanCalendarPage() {
  const { plan } = useOutletContext<PlanOutletContext>()
  const { tasks, busy, error, toggle } = usePlanTasks(plan.id)
  const [selected, setSelected] = useState<Date>(() => new Date())

  const countsByDay = useMemo(() => {
    const map = new Map<string, number>()
    for (const t of tasks ?? []) {
      const key = taskDueDayKey(t)
      if (!key) continue
      map.set(key, (map.get(key) ?? 0) + 1)
    }
    return map
  }, [tasks])

  const selectedKey = useMemo(() => dayKeyLocal(selected), [selected])
  const tasksForDay = useMemo(() => {
    const list = (tasks ?? []).filter((t) => taskDueDayKey(t) === selectedKey)
    // sort by position, then incomplete first
    return list.sort((a, b) => {
      const ac = a.completed_at ? 1 : 0
      const bc = b.completed_at ? 1 : 0
      if (ac !== bc) return ac - bc
      return (a.position ?? 0) - (b.position ?? 0)
    })
  }, [tasks, selectedKey])

  return (
    <Stack spacing={2}>
      <PlanCard
        title="Task calendar"
        subtitle="Click a day to review what’s due and check items off."
        actions={
          <Button component={RouterLink} to="/plan" size="small">
            Back
          </Button>
        }
      >
        <Stack spacing={2}>
          <Calendar
            value={selected as unknown as CalendarValue}
            onChange={(v) => {
              const next = Array.isArray(v) ? v[0] : v
              if (next instanceof Date) setSelected(next)
            }}
            tileContent={({ date, view }) => {
              if (view !== 'month') return null
              const key = dayKeyLocal(date)
              const count = countsByDay.get(key) ?? 0
              if (!count) return null
              return (
                <Badge
                  color="primary"
                  badgeContent={count}
                  sx={{
                    '& .MuiBadge-badge': { right: -6, top: 6 },
                  }}
                >
                  <span />
                </Badge>
              )
            }}
          />

          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            Due on {selected.toLocaleDateString()}
          </Typography>

          <TaskChecklist
            tasks={tasksForDay}
            busy={busy}
            error={error}
            onToggle={toggle}
            empty={<Typography variant="body2" color="text.secondary">No tasks due this day.</Typography>}
          />
        </Stack>
      </PlanCard>
    </Stack>
  )
}


