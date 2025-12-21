import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Box, Button, Card, CardContent, Stack, TextField } from '@mui/material'

import { MockAuthService } from '../services/MockAuthService'
import { PageHeader } from '../components/layout/PageHeader'

export function SignInPage() {
  const navigate = useNavigate()
  const auth = useMemo(() => new MockAuthService(), [])
  const existing = auth.getUser()

  const [name, setName] = useState(existing?.name ?? '')
  const [email, setEmail] = useState(existing?.email ?? '')

  return (
    <Box sx={{ maxWidth: 720, mx: 'auto' }}>
      <Stack spacing={3}>
        <PageHeader
          title="Mock Sign In"
          subtitle="No real authentication yet. We store this locally in your browser."
        />

        <Card>
          <CardContent>
            <Box
              component="form"
              onSubmit={(e) => {
                e.preventDefault()
                const id = auth.ensureUserId(existing?.mock_user_id ?? null)
                auth.setUser({ mock_user_id: id, name: name.trim() || null, email: email.trim() || null })
                navigate('/planner')
              }}
            >
              <Stack spacing={2}>
                <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" />
                <TextField
                  label="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="jane@example.com"
                />

                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ pt: 1 }}>
                  <Button type="submit" variant="contained">
                    Continue
                  </Button>
                  <Button
                    type="button"
                    variant="outlined"
                    color="error"
                    onClick={() => {
                      auth.clear()
                      setName('')
                      setEmail('')
                    }}
                  >
                    Clear
                  </Button>
                </Stack>
              </Stack>
            </Box>
          </CardContent>
        </Card>
      </Stack>
    </Box>
  )
}


