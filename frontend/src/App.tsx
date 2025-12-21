import { Navigate, Route, Routes } from 'react-router-dom'

import { AppLayout } from './components/layout/AppLayout'
import { PlanLayout } from './components/layout/PlanLayout'
import { HomePage } from './pages/Home'
import { PlannerPage } from './pages/Planner'
import { SignInPage } from './pages/SignIn'
import { SettingsPage } from './pages/Settings'
import { PlanRoute } from './pages/plan/PlanRoute'
import { PlanDashboardPage } from './pages/plan/PlanDashboard'
import { PlanCalendarPage } from './pages/plan/PlanCalendar'
import { PlanTimelinePage } from './pages/plan/PlanTimeline'
import { PlanDebtPage } from './pages/plan/PlanDebt'
import { PlanInvestingPage } from './pages/plan/PlanInvesting'
import { PlanRisksPage } from './pages/plan/PlanRisks'
import { PlanCheckInPage } from './pages/plan/PlanCheckIn'

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/signin" element={<SignInPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/planner" element={<PlannerPage />} />
        <Route path="/plan" element={<PlanLayout />}>
          <Route element={<PlanRoute />}>
            <Route index element={<PlanDashboardPage />} />
            <Route path="calendar" element={<PlanCalendarPage />} />
            <Route path="checkin" element={<PlanCheckInPage />} />
            <Route path="timeline" element={<PlanTimelinePage />} />
            <Route path="debt" element={<PlanDebtPage />} />
            <Route path="investing" element={<PlanInvestingPage />} />
            <Route path="risks" element={<PlanRisksPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
