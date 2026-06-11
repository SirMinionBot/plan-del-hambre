import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { Loading } from './components/ui/Banner'
import { Layout } from './components/Layout'
import { AuthProvider } from './components/AuthProvider'
import { HouseholdProvider } from './components/HouseholdProvider'
import { useAuth } from './hooks/useAuth'
import { useHousehold } from './hooks/useHousehold'
import { CalendarPage } from './pages/Calendar'
import { CalibratePage } from './pages/Calibrate'
import { HouseholdSetupPage } from './pages/HouseholdSetup'
import { LoginPage } from './pages/Login'
import { PantryPage } from './pages/Pantry'
import { PlannerPage } from './pages/Planner'
import { ProfilePage } from './pages/Profile'
import { RecipeDetailPage } from './pages/RecipeDetail'
import { RecipesPage } from './pages/Recipes'
import { ResetPasswordPage } from './pages/ResetPassword'
import { ShoppingPage } from './pages/Shopping'
import { StatsPage } from './pages/Stats'
import { TemplatesPage } from './pages/Templates'
import { TodayPage } from './pages/Today'

function RequireAuth() {
  const { session, loading } = useAuth()
  if (loading) return <Loading />
  if (!session) return <Navigate to="/login" replace />
  return <Outlet />
}

function RequireHousehold() {
  const { household, loading } = useHousehold()
  if (loading) return <Loading />
  if (!household) return <Navigate to="/hogar" replace />
  return <Outlet />
}

export default function App() {
  return (
    <AuthProvider>
      <HouseholdProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/reset" element={<ResetPasswordPage />} />
          <Route element={<RequireAuth />}>
            <Route path="/hogar" element={<HouseholdSetupPage />} />
            <Route element={<RequireHousehold />}>
              <Route element={<Layout />}>
                <Route path="/" element={<TodayPage />} />
                <Route path="/calendario" element={<CalendarPage />} />
                <Route path="/calibrar" element={<CalibratePage />} />
                <Route path="/planificar" element={<PlannerPage />} />
                <Route path="/recetas" element={<RecipesPage />} />
                <Route path="/recetas/:id" element={<RecipeDetailPage />} />
                <Route path="/despensa" element={<PantryPage />} />
                <Route path="/compra" element={<ShoppingPage />} />
                <Route path="/stats" element={<StatsPage />} />
                <Route path="/plantillas" element={<TemplatesPage />} />
                <Route path="/perfil" element={<ProfilePage />} />
              </Route>
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HouseholdProvider>
    </AuthProvider>
  )
}
