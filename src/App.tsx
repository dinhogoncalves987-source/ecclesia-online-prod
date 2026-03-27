import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import Financeiro from "./pages/Financeiro";
import Membros from "./pages/Membros";
import Agenda from "./pages/Agenda";
import Biblia from "./pages/Biblia";
import PlaceholderPage from "./pages/PlaceholderPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/admin" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/admin/financeiro" element={<ProtectedRoute><Financeiro /></ProtectedRoute>} />
            <Route path="/admin/membros" element={<ProtectedRoute><Membros /></ProtectedRoute>} />
            <Route path="/admin/agenda" element={<ProtectedRoute><Agenda /></ProtectedRoute>} />
            <Route path="/admin/biblia" element={<ProtectedRoute><Biblia /></ProtectedRoute>} />
            <Route path="/admin/oracoes" element={<ProtectedRoute><PlaceholderPage title="Pedidos de Oração" description="Módulo de pedidos de oração e intercessão em desenvolvimento." /></ProtectedRoute>} />
            <Route path="/admin/comunicacao" element={<ProtectedRoute><PlaceholderPage title="Comunicação" description="Módulo de comunicação interna em desenvolvimento." /></ProtectedRoute>} />
            <Route path="/admin/grupos" element={<ProtectedRoute><PlaceholderPage title="Pequenos Grupos" description="Módulo de gestão de pequenos grupos em desenvolvimento." /></ProtectedRoute>} />
            <Route path="/admin/documentos" element={<ProtectedRoute><PlaceholderPage title="Documentos" description="Biblioteca de documentos em desenvolvimento." /></ProtectedRoute>} />
            <Route path="/admin/relatorios" element={<ProtectedRoute><PlaceholderPage title="Relatórios" description="Módulo de relatórios em desenvolvimento." /></ProtectedRoute>} />
            <Route path="/admin/escalas" element={<ProtectedRoute><PlaceholderPage title="Escalas" description="Módulo de escalas de serviço em desenvolvimento." /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
