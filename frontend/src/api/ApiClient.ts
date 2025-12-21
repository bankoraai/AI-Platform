export type ApiClientConfig = {
  baseUrl: string
}

export type MockUserHeaders = {
  mock_user_id: string
  name?: string | null
  email?: string | null
}

export type LoanIn = {
  name: string
  balance: number
  apr_percent: number
  minimum_payment?: number
  term_months?: number | null
}

export type ProfileUpsertIn = {
  mock_user_id: string
  name?: string | null
  email?: string | null
  cash_available: number
  stocks_total: number
  loans: LoanIn[]
}

export type LoanOut = {
  id: number
  name: string
  balance: number
  apr_percent: number
  minimum_payment: number
  term_months: number | null
}

export type ProfileOut = {
  id: number
  mock_user_id: string
  currency_code: string
  cash_available: number
  stocks_total: number
  loans: LoanOut[]
}

export type CheckInLoanBalanceIn = {
  id: number
  balance: number
}

export type CheckInCreateIn = {
  profile_id: number
  cash_available: number
  stocks_total: number
  loans: CheckInLoanBalanceIn[]
}

export type CheckInDeltaOut = {
  net_worth_delta: number
  debt_delta: number
  investments_delta: number
}

export type CheckInOut = {
  id: number
  profile_id: number
  checkin_month: string
  ahead_behind: string
  deltas: CheckInDeltaOut
  new_plan: PlanOut
}

export type CheckInLatestOut = {
  id: number
  profile_id: number
  checkin_month: string
  ahead_behind: string
  deltas: CheckInDeltaOut
}

export type SettingsOut = {
  preferred_currency: string
}

export type PlanOut = {
  id: number
  profile_id: number
  model_used: string
  prompt_hash: string
  plan_text: string
  plan_json?: Record<string, unknown> | null
  created_at: string
}

export type TaskOut = {
  id: number
  plan_id: number
  profile_id: number
  task_key: string
  title: string
  position: number
  due_at?: string | null
  remind_at?: string | null
  last_reminded_at?: string | null
  reminder_state: string
  completed_at?: string | null
  created_at: string
  updated_at: string
}

export type TaskPatchIn = {
  completed?: boolean | null
  due_at?: string | null
  remind_at?: string | null
}

export type PushSubscribeIn = {
  endpoint: string
  p256dh: string
  auth: string
  user_agent?: string | null
}

export type PushSubscribeOut = {
  id: number
  endpoint: string
  disabled: boolean
}

export class ApiClient {
  private readonly baseUrl: string

  constructor(cfg: ApiClientConfig) {
    this.baseUrl = cfg.baseUrl.replace(/\/$/, '')
  }

  private buildMockUserHeaders(user?: MockUserHeaders | null): Record<string, string> {
    if (!user?.mock_user_id) return {}
    const headers: Record<string, string> = {
      'X-Mock-User-Id': user.mock_user_id,
    }
    if (user.name) headers['X-Mock-User-Name'] = user.name
    if (user.email) headers['X-Mock-User-Email'] = user.email
    return headers
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(text || `Request failed: ${res.status}`)
    }
    return (await res.json()) as T
  }

  async upsertProfile(payload: ProfileUpsertIn): Promise<ProfileOut> {
    return this.request<ProfileOut>('/api/profiles', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }

  async getLatestProfile(user: MockUserHeaders): Promise<ProfileOut> {
    return this.request<ProfileOut>('/api/profiles/latest', {
      method: 'GET',
      headers: this.buildMockUserHeaders(user),
    })
  }

  async getProfile(profileId: number): Promise<ProfileOut> {
    return this.request<ProfileOut>(`/api/profiles/${profileId}`, { method: 'GET' })
  }

  async getSettings(user: MockUserHeaders): Promise<SettingsOut> {
    return this.request<SettingsOut>('/api/settings', {
      method: 'GET',
      headers: this.buildMockUserHeaders(user),
    })
  }

  async updateSettings(user: MockUserHeaders, update: SettingsOut): Promise<SettingsOut> {
    return this.request<SettingsOut>('/api/settings', {
      method: 'PUT',
      headers: this.buildMockUserHeaders(user),
      body: JSON.stringify(update),
    })
  }

  async generatePlan(profileId: number, currencyCode?: string): Promise<PlanOut> {
    return this.request<PlanOut>('/api/plans', {
      method: 'POST',
      body: JSON.stringify({ profile_id: profileId, currency_code: currencyCode ?? null }),
    })
  }

  async getLatestPlan(profileId: number): Promise<PlanOut> {
    return this.request<PlanOut>(`/api/plans/latest/${profileId}`, { method: 'GET' })
  }

  async getTasks(planId: number): Promise<TaskOut[]> {
    return this.request<TaskOut[]>(`/api/tasks?plan_id=${encodeURIComponent(String(planId))}`, { method: 'GET' })
  }

  async patchTask(taskId: number, patch: TaskPatchIn): Promise<TaskOut> {
    return this.request<TaskOut>(`/api/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify(patch) })
  }

  async createCheckin(payload: CheckInCreateIn): Promise<CheckInOut> {
    return this.request<CheckInOut>('/api/checkins', { method: 'POST', body: JSON.stringify(payload) })
  }

  async getLatestCheckin(profileId: number): Promise<CheckInLatestOut> {
    return this.request<CheckInLatestOut>(`/api/checkins/latest?profile_id=${encodeURIComponent(String(profileId))}`, {
      method: 'GET',
    })
  }

  async subscribePush(user: MockUserHeaders, payload: PushSubscribeIn): Promise<PushSubscribeOut> {
    return this.request<PushSubscribeOut>('/api/push/subscribe', {
      method: 'POST',
      headers: this.buildMockUserHeaders(user),
      body: JSON.stringify(payload),
    })
  }

  async unsubscribePush(endpoint: string): Promise<{ status: string }> {
    return this.request<{ status: string }>('/api/push/unsubscribe', {
      method: 'POST',
      body: JSON.stringify({ endpoint }),
    })
  }
}


