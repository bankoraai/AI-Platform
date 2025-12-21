import { useCallback, useEffect, useMemo, useState } from 'react'
import { Checkbox, CircularProgress, List, ListItem, ListItemButton, ListItemText, Stack, Typography } from '@mui/material'

import { bootstrapApp } from '../../bootstrap'
import type { TaskOut } from '../../api/ApiClient'

export function usePlanTasks(planId: number) {
  const api = useMemo(() => bootstrapApp().getApi(), [])
  const [tasks, setTasks] = useState<TaskOut[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setError(null)
    setBusy(true)
    try {
      const t = await api.getTasks(planId)
      setTasks(t)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setTasks([])
    } finally {
      setBusy(false)
    }
  }, [api, planId])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setError(null)
      setBusy(true)
      try {
        const t = await api.getTasks(planId)
        if (!cancelled) setTasks(t)
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e))
          setTasks([])
        }
      } finally {
        if (!cancelled) setBusy(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [api, planId])

  const toggle = useCallback(
    async (task: TaskOut) => {
      const checked = !!task.completed_at
      // Optimistic toggle
      setTasks((prev) =>
        (prev ?? []).map((p) => (p.id === task.id ? { ...p, completed_at: checked ? null : new Date().toISOString() } : p)),
      )
      try {
        const updated = await api.patchTask(task.id, { completed: !checked })
        setTasks((prev) => (prev ?? []).map((p) => (p.id === task.id ? updated : p)))
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
        await reload().catch(() => null)
      }
    },
    [api, reload],
  )

  return { tasks, setTasks, busy, error, reload, toggle }
}

function formatDueLabel(task: TaskOut): string | null {
  const due = task.due_at ? new Date(task.due_at) : null
  return due ? `Due ${due.toLocaleDateString()}` : null
}

export function TaskChecklist(props: {
  tasks: TaskOut[] | null
  busy?: boolean
  error?: string | null
  onToggle: (task: TaskOut) => Promise<void> | void
  empty?: React.ReactNode
}) {
  const { tasks, busy, error, onToggle, empty } = props
  if (busy && !tasks) return <CircularProgress size={20} />
  return (
    <Stack spacing={1}>
      {error ? (
        <Typography variant="body2" color="error">
          {error}
        </Typography>
      ) : null}
      {tasks?.length ? (
        <List dense disablePadding>
          {tasks.map((t) => {
            const checked = !!t.completed_at
            return (
              <ListItem key={t.id} disablePadding>
                <ListItemButton onClick={() => onToggle(t)}>
                  <Checkbox edge="start" checked={checked} tabIndex={-1} disableRipple />
                  <ListItemText primary={t.title} secondary={formatDueLabel(t)} />
                </ListItemButton>
              </ListItem>
            )
          })}
        </List>
      ) : (
        (empty ?? null)
      )}
    </Stack>
  )
}


