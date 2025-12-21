import { ApiClient } from './api/ApiClient'

export type RuntimeConfig = {
  apiBaseUrl: string
}

export class AppBootstrap {
  private readonly config: RuntimeConfig
  private readonly apiClient: ApiClient

  constructor() {
    const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8000'
    this.config = { apiBaseUrl }
    this.apiClient = new ApiClient({ baseUrl: apiBaseUrl })
  }

  getConfig(): RuntimeConfig {
    return this.config
  }

  getApi(): ApiClient {
    return this.apiClient
  }
}

let _bootstrap: AppBootstrap | null = null

export function bootstrapApp(): AppBootstrap {
  if (_bootstrap) return _bootstrap
  _bootstrap = new AppBootstrap()
  return _bootstrap
}


