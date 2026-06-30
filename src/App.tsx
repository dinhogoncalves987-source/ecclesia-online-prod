import { lazy, Suspense } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { BrowserRouter, Route, Routes } from "react-router-dom";

import { Toaster as Sonner } from "@/components/ui/sonner";

import { Toaster } from "@/components/ui/toaster";

import { TooltipProvider } from "@/components/ui/tooltip";

import { AuthProvider } from "@/hooks/useAuth";

import { LanguageProvider } from "@/hooks/useLanguage";

import { ChurchProvider } from "@/hooks/useChurch";

import { SupportContextProvider } from "@/contexts/SupportContext";

import { ProtectedRoute } from "@/components/ProtectedRoute";

import { OfflineBanner } from "@/components/OfflineBanner";

import { PageLoader } from "@/components/PageLoader";



// Public / auth — kept synchronous (entry points, small footprint)

import Landing from "./pages/Landing";

import Login from "./pages/Login";

import Signup from "./pages/Signup";

import ForgotPassword from "./pages/ForgotPassword";

import ResetPassword from "./pages/ResetPassword";

import SharePublic from "./pages/SharePublic";
import ValidarCarta from "./pages/ValidarCarta";
import ValidarMembro from "./pages/ValidarMembro";
import ConviteMembro from "./pages/ConviteMembro";
import ConviteAcesso from "./pages/ConviteAcesso";

import DevocionalPublic from "./pages/DevocionalPublic";

import NotFound from "./pages/NotFound";

const AppHome = lazy(() => import("./pages/AppHome"));



// Admin — lazy loaded (not needed until user navigates)

const Dashboard = lazy(() => import("./pages/Dashboard"));

const Financeiro = lazy(() => import("./pages/Financeiro"));

const Membros = lazy(() => import("./pages/Membros"));

const Agenda = lazy(() => import("./pages/Agenda"));

const Biblia = lazy(() => import("./pages/Biblia"));

const CultoLouvor = lazy(() => import("./pages/CultoLouvor"));

const CultoBiblioteca = lazy(() => import("./pages/culto/BibliotecaMusicas"));

const CultoRoteiros = lazy(() => import("./pages/culto/RoteirosCulto"));

const CultoTelao = lazy(() => import("./pages/culto/TelaoProjecao"));

const CultoAssistente = lazy(() => import("./pages/culto/AssistenteCulto"));

const Campanhas = lazy(() => import("./pages/Campanhas"));

const Oracoes = lazy(() => import("./pages/Oracoes"));

const Comunicacao = lazy(() => import("./pages/Comunicacao"));

const Grupos = lazy(() => import("./pages/Grupos"));

const Documentos = lazy(() => import("./pages/Documentos"));

const CartasRecomendacao = lazy(() => import("./pages/CartasRecomendacao"));

const Relatorios = lazy(() => import("./pages/Relatorios"));

const Escalas = lazy(() => import("./pages/Escalas"));

const Perfil = lazy(() => import("./pages/Perfil"));

const GerenciarAcessos = lazy(() => import("./pages/GerenciarAcessos"));

const Congregacoes = lazy(() => import("./pages/Congregacoes"));

const SuperAdmin = lazy(() => import("./pages/SuperAdmin"));

const AssembleiaGeral = lazy(() => import("./pages/AssembleiaGeral"));

const Marketplace = lazy(() => import("./pages/Marketplace"));

const Comunidade = lazy(() => import("./pages/Comunidade"));

const ChatSecretaria = lazy(() => import("./pages/ChatSecretaria"));

const SolicitacoesAdministrativas = lazy(() => import("./pages/SolicitacoesAdministrativas"));

const CarteiraEcclesia = lazy(() => import("./pages/CarteiraEcclesia"));



const queryClient = new QueryClient();



const App = () => (

  <QueryClientProvider client={queryClient}>

    <TooltipProvider>

      <AuthProvider>

        <LanguageProvider>

        <SupportContextProvider>

        <ChurchProvider>

        <OfflineBanner />

        <Toaster />

        <Sonner />

        <BrowserRouter>

          <Suspense fallback={<PageLoader />}>

            <Routes>

              <Route path="/" element={<Landing />} />

              <Route path="/login" element={<Login />} />

              <Route path="/signup" element={<Signup />} />

              <Route path="/forgot-password" element={<ForgotPassword />} />

              <Route path="/reset-password" element={<ResetPassword />} />

              <Route path="/share" element={<SharePublic />} />
              <Route path="/validar/carta/:token" element={<ValidarCarta />} />
              <Route path="/validar-membro/:id" element={<ValidarMembro />} />
              <Route path="/convite-membro/:token" element={<ConviteMembro />} />
              <Route path="/convite-acesso/:token" element={<ConviteAcesso />} />

              <Route path="/devocional" element={<DevocionalPublic />} />

              {/* Member app — accessible to any authenticated user, no org required */}
              <Route path="/app" element={<AppHome />} />

              <Route path="/admin" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />

              <Route path="/admin/campanhas" element={<ProtectedRoute><Campanhas /></ProtectedRoute>} />

              <Route path="/admin/financeiro" element={<ProtectedRoute><Financeiro /></ProtectedRoute>} />

              <Route path="/admin/membros" element={<ProtectedRoute><Membros /></ProtectedRoute>} />

              <Route path="/admin/agenda" element={<ProtectedRoute><Agenda /></ProtectedRoute>} />

              <Route path="/admin/biblia" element={<ProtectedRoute><Biblia /></ProtectedRoute>} />

              <Route path="/admin/culto" element={<ProtectedRoute><CultoLouvor /></ProtectedRoute>} />

              <Route path="/admin/culto/biblioteca" element={<ProtectedRoute><CultoBiblioteca /></ProtectedRoute>} />

              <Route path="/admin/culto/roteiros" element={<ProtectedRoute><CultoRoteiros /></ProtectedRoute>} />

              <Route path="/admin/culto/telao" element={<ProtectedRoute><CultoTelao /></ProtectedRoute>} />

              <Route path="/admin/culto/assistente" element={<ProtectedRoute><CultoAssistente /></ProtectedRoute>} />

              <Route path="/admin/oracoes" element={<ProtectedRoute><Oracoes /></ProtectedRoute>} />

              <Route path="/admin/comunicacao" element={<ProtectedRoute><Comunicacao /></ProtectedRoute>} />

              <Route path="/admin/grupos" element={<ProtectedRoute><Grupos /></ProtectedRoute>} />

              <Route path="/admin/documentos" element={<ProtectedRoute><Documentos /></ProtectedRoute>} />

              <Route path="/admin/cartas-recomendacao" element={<ProtectedRoute><CartasRecomendacao /></ProtectedRoute>} />

              <Route path="/admin/relatorios" element={<ProtectedRoute><Relatorios /></ProtectedRoute>} />

              <Route path="/admin/escalas" element={<ProtectedRoute><Escalas /></ProtectedRoute>} />

              <Route path="/admin/perfil" element={<ProtectedRoute><Perfil /></ProtectedRoute>} />

              <Route path="/admin/gerenciar-acessos" element={<ProtectedRoute><GerenciarAcessos /></ProtectedRoute>} />

              <Route path="/admin/congregacoes" element={<ProtectedRoute><Congregacoes /></ProtectedRoute>} />

              <Route path="/admin/assembleia-geral" element={<ProtectedRoute><AssembleiaGeral /></ProtectedRoute>} />

              <Route path="/admin/super-admin" element={<ProtectedRoute><SuperAdmin /></ProtectedRoute>} />

              <Route path="/admin/marketplace" element={<ProtectedRoute><Marketplace /></ProtectedRoute>} />

              <Route path="/admin/comunidade" element={<ProtectedRoute><Comunidade /></ProtectedRoute>} />

              {/* Global chat — accessible to all roles */}
              <Route path="/admin/chat" element={<ProtectedRoute><ChatSecretaria /></ProtectedRoute>} />
              {/* Legacy route kept for backward compatibility */}
              <Route path="/admin/chat-secretaria" element={<ProtectedRoute><ChatSecretaria /></ProtectedRoute>} />

              <Route path="/admin/solicitacoes" element={<ProtectedRoute><SolicitacoesAdministrativas /></ProtectedRoute>} />

              <Route path="/admin/carteira-ecclesia" element={<ProtectedRoute><CarteiraEcclesia /></ProtectedRoute>} />

              <Route path="*" element={<NotFound />} />

            </Routes>

          </Suspense>

        </BrowserRouter>

        </ChurchProvider>

        </SupportContextProvider>

        </LanguageProvider>

      </AuthProvider>

    </TooltipProvider>

  </QueryClientProvider>

);



export default App;

