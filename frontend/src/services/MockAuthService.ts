export type MockUser = {
  mock_user_id: string
  name?: string | null
  email?: string | null
}

export class MockAuthService {
  private readonly storageKey = 'mock_user'

  getUser(): MockUser | null {
    const raw = localStorage.getItem(this.storageKey)
    if (!raw) return null
    try {
      return JSON.parse(raw) as MockUser
    } catch {
      return null
    }
  }

  setUser(user: MockUser): void {
    localStorage.setItem(this.storageKey, JSON.stringify(user))
  }

  clear(): void {
    localStorage.removeItem(this.storageKey)
  }

  ensureUserId(existing?: string | null): string {
    if (existing && existing.trim()) return existing.trim()
    try {
      const maybe = (crypto as unknown as { randomUUID?: () => string } | undefined)?.randomUUID
      if (maybe) return maybe()
    } catch {
      // ignore
    }
    // Fallback
    return `mock_${Date.now()}_${Math.random().toString(16).slice(2)}`
  }
}


