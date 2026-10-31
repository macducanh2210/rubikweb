import { createBrowserRouter, createRoutesFromElements, Navigate, Route, RouterProvider } from 'react-router-dom'
import { AdminRoute, GuestRoute, ProtectedRoute } from './components/RouteGuards'
import { AuthLayout } from './components/AuthLayout'
import { MainLayout } from './components/MainLayout'
import { AccountPage } from './pages/AccountPage'
import { ProfilePage } from './pages/ProfilePage'
import { SettingsPage } from './pages/SettingsPage'
import { AdminPage } from './pages/AdminPage'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'
import { HistoryPage } from './pages/HistoryPage'
import { HistoryDetailPage } from './pages/HistoryDetailPage'
import { LoginPage } from './pages/LoginPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { RegisterPage } from './pages/RegisterPage'
import { ScanPage } from './pages/ScanPage'
import { SolverPage } from './pages/SolverPage'
import { PracticePage } from './pages/PracticePage'
import { PracticeAchievementsPage } from './pages/PracticeAchievementsPage'
import { DailyChallengePage } from './pages/DailyChallengePage'
import { ManualCubePage } from './pages/ManualCubePage'
import { DesignPage } from './pages/DesignPage'

const router = createBrowserRouter(createRoutesFromElements(
  <>
      <Route path="/" element={<Navigate to="/quet" replace />} />

      {import.meta.env.DEV && <Route path="/design" element={<DesignPage />} />}

      <Route element={<GuestRoute />}>
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Route>
      </Route>

      <Route element={<AuthLayout />}>
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route element={<MainLayout />}>
          <Route path="/quet" element={<ScanPage />} />
          <Route path="/loi-giai" element={<SolverPage />} />
          <Route path="/luyen-tap" element={<PracticePage />} />
          <Route path="/thanh-tich" element={<PracticeAchievementsPage />} />
          <Route path="/thu-thach" element={<DailyChallengePage />} />
          <Route path="/nhap-mau" element={<ManualCubePage />} />
          <Route path="/lich-su" element={<HistoryPage />} />
          <Route path="/history/:id" element={<HistoryDetailPage />} />
          <Route path="/tai-khoan" element={<AccountPage />}>
            <Route index element={<ProfilePage />} />
            <Route path="cai-dat" element={<SettingsPage />} />
          </Route>
          <Route element={<AdminRoute />}>
            <Route path="/quan-tri" element={<AdminPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
  </>,
))

export function App() {
  return <RouterProvider router={router} />
}
