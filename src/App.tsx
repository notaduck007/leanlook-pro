import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { AppLayout } from "@/components/AppLayout";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import ChangePassword from "./pages/ChangePassword";
import Onboarding from "./pages/Onboarding";
import Projects from "./pages/Projects";
import NewProject from "./pages/NewProject";
import ProjectDetail from "./pages/ProjectDetail";
import Settings from "./pages/Settings";
import NewLookAhead from "./pages/NewLookAhead";
import LookAheadEditor from "./pages/LookAheadEditor";
import Analytics from "./pages/Analytics";
import LookAheads from "./pages/LookAheads";
import MasterTasks from "./pages/MasterTasks";
import SubContractors from "./pages/SubContractors";
import Huddle from "./pages/Huddle";
import NotFound from "./pages/NotFound";
import { Loader2 } from "lucide-react";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, profile, user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!session) return <Navigate to="/auth" replace />;
  if (user?.user_metadata?.must_change_password) {
    return <Navigate to="/change-password" replace />;
  }
  if (!profile?.company_id) return <Navigate to="/onboarding" replace />;

  return <AppLayout>{children}</AppLayout>;
}

function AppRoutes() {
  const { session, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/auth" element={session ? <Navigate to="/" replace /> : <Auth />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route
        path="/change-password"
        element={!session ? <Navigate to="/auth" replace /> : <ChangePassword />}
      />
      <Route
        path="/onboarding"
        element={
          !session ? <Navigate to="/auth" replace /> :
          profile?.company_id ? <Navigate to="/" replace /> :
          <Onboarding />
        }
      />
      <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
      <Route path="/projects" element={<ProtectedRoute><Projects /></ProtectedRoute>} />
      <Route path="/projects/new" element={<ProtectedRoute><NewProject /></ProtectedRoute>} />
      <Route path="/projects/:id" element={<ProtectedRoute><ProjectDetail /></ProtectedRoute>} />
      <Route path="/projects/:id/lookahead/new" element={<ProtectedRoute><NewLookAhead /></ProtectedRoute>} />
      <Route path="/projects/:id/lookahead/:lookaheadId" element={<ProtectedRoute><LookAheadEditor /></ProtectedRoute>} />
      <Route path="/lookaheads" element={<ProtectedRoute><LookAheads /></ProtectedRoute>} />
      <Route path="/master-tasks" element={<ProtectedRoute><MasterTasks /></ProtectedRoute>} />
      <Route path="/subcontractors" element={<ProtectedRoute><SubContractors /></ProtectedRoute>} />
      <Route path="/analytics" element={<ProtectedRoute><Analytics /></ProtectedRoute>} />
      <Route path="/huddle" element={<ProtectedRoute><Huddle /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
