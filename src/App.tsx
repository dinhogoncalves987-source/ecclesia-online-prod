import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { LanguageProvider } from "@/hooks/useLanguage";
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
import Oracoes from "./pages/Oracoes";
import Comunicacao from "./pages/Comunicacao";
import Grupos from "./pages/Grupos";
import Documentos from "./pages/Documentos";
import Relatorios from "./pages/Relatorios";
import Escalas from "./pages/Escalas";
import Perfil from "./pages/Perfil";
import GerenciarAcessos from "./pages/GerenciarAcessos";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <LanguageProvider>
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
            <Route path="/admin/oracoes" element={<ProtectedRoute><Oracoes /></ProtectedRoute>} />
            <Route path="/admin/comunicacao" element={<ProtectedRoute><Comunicacao /></ProtectedRoute>} />
            <Route path="/admin/grupos" element={<ProtectedRoute><Grupos /></ProtectedRoute>} />
            <Route path="/admin/documentos" element={<ProtectedRoute><Documentos /></ProtectedRoute>} />
            <Route path="/admin/relatorios" element={<ProtectedRoute><Relatorios /></ProtectedRoute>} />
            <Route path="/admin/escalas" element={<ProtectedRoute><Escalas /></ProtectedRoute>} />
            <Route path="/admin/perfil" element={<ProtectedRoute><Perfil /></ProtectedRoute>} />
            <Route path="/admin/gerenciar-acessos" element={<ProtectedRoute><GerenciarAcessos /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
        </LanguageProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
