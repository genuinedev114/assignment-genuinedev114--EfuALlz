import { AnimatePresence } from "framer-motion";
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { ThemeProvider } from "./auth/ThemeContext";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { PageTransition } from "./components/PageTransition";
import { ToastStack } from "./components/ToastStack";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { AppLayout } from "./layouts/AppLayout";
import { AuthLayout } from "./layouts/AuthLayout";
import { NotificationsProvider } from "./notifications/NotificationsContext";
import { CreateInvoicePage } from "./pages/CreateInvoicePage";
import { DashboardPage } from "./pages/DashboardPage";
import { InvoiceDetailPage } from "./pages/InvoiceDetailPage";
import { InvoicesPage } from "./pages/InvoicesPage";
import { LoginPage } from "./pages/LoginPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { ProfilePage } from "./pages/ProfilePage";
import { RegisterPage } from "./pages/RegisterPage";
import { SettingsPage } from "./pages/SettingsPage";
import { MuiThemeBridge } from "./theme/MuiThemeBridge";

export default function App() {
  return (
    <ThemeProvider>
      <MuiThemeBridge>
        <ErrorBoundary>
          <NotificationsProvider>
            <BrowserRouter>
              <AuthProvider>
                <Router />
                <ToastStack />
              </AuthProvider>
            </BrowserRouter>
          </NotificationsProvider>
        </ErrorBoundary>
      </MuiThemeBridge>
    </ThemeProvider>
  );
}

function Router() {
  const { loading } = useAuth();
  const location = useLocation();
  useKeyboardShortcuts();
  if (loading) {
    return (
      <div className="splash">
        <div className="brand-mark large" />
      </div>
    );
  }
  // `mode="wait"` lets the outgoing page exit before the new one enters, so
  // we don't see a flash of two pages overlapping during the swap.
  return (
    <AnimatePresence mode="wait" initial={false}>
      <Routes location={location} key={location.pathname}>
        {/* Public auth routes — bounce to dashboard if already signed in. */}
        <Route element={<RedirectIfAuthed><AuthLayout /></RedirectIfAuthed>}>
          <Route path="/login" element={<PageTransition><LoginPage /></PageTransition>} />
          <Route path="/register" element={<PageTransition><RegisterPage /></PageTransition>} />
        </Route>

        {/* Authed app — everything else lives behind RequireAuth + AppLayout. */}
        <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
          <Route index element={<PageTransition><DashboardPage /></PageTransition>} />
          <Route path="/invoices" element={<PageTransition><InvoicesPage /></PageTransition>} />
          <Route path="/invoices/new" element={<PageTransition><CreateInvoicePage /></PageTransition>} />
          <Route path="/invoices/:id" element={<PageTransition><InvoiceDetailPage /></PageTransition>} />
          <Route path="/upload" element={<Navigate to="/" replace />} />
          <Route path="/profile" element={<PageTransition><ProfilePage /></PageTransition>} />
          <Route path="/settings" element={<PageTransition><SettingsPage /></PageTransition>} />
          <Route path="*" element={<PageTransition><NotFoundPage /></PageTransition>} />
        </Route>

        {/* Unknown URL while signed out — bounce to login. */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </AnimatePresence>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RedirectIfAuthed({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

// Outlet is re-exported here so layouts can import it from a single place if needed.
export { Outlet };
