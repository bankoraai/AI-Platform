export type PlanJson = {
  meta?: {
    currency?: string
    title?: string
    assumptions?: string[]
    notes?: string[]
  }
  summary?: {
    bullets?: string[]
    next_action?: string
    biggest_risk?: string
  }
  immediate_next_7_days?: { steps?: string[] }
  timeline_0_3_months?: { milestones?: string[] }
  timeline_3_12_months?: { milestones?: string[] }
  debt_strategy?: { prioritization?: string[]; payoff_notes?: string[] }
  investing_strategy?: { bullets?: string[] }
  risks?: { bullets?: string[] }
  disclaimer?: string
}


