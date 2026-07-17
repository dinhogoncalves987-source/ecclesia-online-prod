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

import { PWAUpdatePrompt } from "@/components/PWAUpdatePrompt";

import { PageLoader } from "@/components/PageLoader";

import { ModuleGate } from "@/components/ModuleGate";

import { EnvironmentBanner } from "@/components/EnvironmentBanner";



// Public / auth — kept synchronous (entry points, small footprint)

import Landing from "./pages/Landing";

import Login from "./pages/Login";

import Signup from "./pages/Signup";

import ForgotPassword from "./pages/ForgotPassword";

import ResetPassword from "./pages/ResetPassword";

import SharePublic from "./pages/SharePublic";
import ValidarMembro from "./pages/ValidarMembro";
import ConviteMembro from "./pages/ConviteMembro";
import ConviteAcesso from "./pages/ConviteAcesso";

import NotFound from "./pages/NotFound";
import PublicModuleUnavailable from "./pages/PublicModuleUnavailable";




// FASE 6 (separação de bundle por build) — `import.meta.env.VITE_APP_ENV` é
// substituído por um literal de string pelo próprio Vite em tempo de build
// (mesmo mecanismo usado por `process.env.NODE_ENV` no ecossistema React
// para eliminar código de dev em produção). Isso torna esta comparação uma
// expressão constante ANTES do Rollup fazer o tree-shaking do módulo — nos
// branches abaixo (`IS_STAGING_BUILD ? lazy(() => import(...)) : null`), o
// branch morto (incluindo a chamada `import()`) nunca é adicionado ao grafo
// de módulos de um build de produção, então o chunk correspondente nunca é
// emitido em `dist/`. Ver scripts/verify-production-bundle.mjs (teste de
// artefato que falha se algum desses chunks aparecer em produção) e
// src/config/modules.ts (mesma allowlist, aplicada em runtime ao menu/rota).
const IS_STAGING_BUILD = import.meta.env.VITE_APP_ENV === "staging";

// Admin — lazy loaded (not needed until user navigates), sempre disponíveis
// em produção e staging (allowlist urgente de produção — ver modules.ts).
const Dashboard = lazy(() => import("./pages/Dashboard"));

const Financeiro = lazy(() => import("./pages/Financeiro"));

const Membros = lazy(() => import("./pages/Membros"));

const Agenda = lazy(() => import("./pages/Agenda"));

const Oracoes = lazy(() => import("./pages/Oracoes"));

const Comunicacao = lazy(() => import("./pages/Comunicacao"));

const Grupos = lazy(() => import("./pages/Grupos"));

const Documentos = lazy(() => import("./pages/Documentos"));

const Escalas = lazy(() => import("./pages/Escalas"));

const Perfil = lazy(() => import("./pages/Perfil"));

const GerenciarAcessos = lazy(() => import("./pages/GerenciarAcessos"));

const Congregacoes = lazy(() => import("./pages/Congregacoes"));

const SuperAdmin = lazy(() => import("./pages/SuperAdmin"));

const ConfiguracaoIgreja = lazy(() => import("./pages/ConfiguracaoIgreja"));

const AssembleiaGeral = lazy(() => import("./pages/AssembleiaGeral"));

const ChatSecretaria = lazy(() => import("./pages/ChatSecretaria"));

const SolicitacoesAdministrativas = lazy(() => import("./pages/SolicitacoesAdministrativas"));

const CarteiraEcclesia = lazy(() => import("./pages/CarteiraEcclesia"));

const ModoPorteiro = lazy(() => import("./pages/ModoPorteiro"));

// Bíblia/IA foi promovida para availability: "both" em src/config/modules.ts
// (CORREÇÃO 2026-07-17 — não depende de nenhuma tabela/migration ainda não
// promovida, é um chat de IA sem escrita no banco). Por isso é carregada
// sempre, igual aos outros módulos "both" acima — nunca condicionada a
// IS_STAGING_BUILD.
const Biblia = lazy(() => import("./pages/Biblia"));

// Culto & Louvor, Campanhas, Cartas de Recomendação e Relatórios foram
// promovidos para availability: "both" em src/config/modules.ts
// (CORREÇÃO 2026-07-17 — todos têm backend real no Supabase — worship_songs/
// worship_setlists, campaigns/campaign_updates, recommendation_letters,
// e Relatorios.tsx já consulta members/transactions/events/prayer_requests/
// groups/documents reais via runScopedOrganizationQuery — nenhum depende de
// dado fictício para funcionar). Carregados sempre, iguais aos módulos
// "both" acima — nunca condicionados a IS_STAGING_BUILD.
const CultoLouvor = lazy(() => import("./pages/CultoLouvor"));

const CultoBiblioteca = lazy(() => import("./pages/culto/BibliotecaMusicas"));

const CultoRoteiros = lazy(() => import("./pages/culto/RoteirosCulto"));

const CultoTelao = lazy(() => import("./pages/culto/TelaoProjecao"));

const CultoAssistente = lazy(() => import("./pages/culto/AssistenteCulto"));

const Campanhas = lazy(() => import("./pages/Campanhas"));

const CartasRecomendacao = lazy(() => import("./pages/CartasRecomendacao"));

const Relatorios = lazy(() => import("./pages/Relatorios"));

// Marketplace e Comunidade permanecem staging-only de propósito: são telas
// 100% de maquete (catálogo/feed fixos no código-fonte), sem nenhuma tabela
// ou consulta real no Supabase — habilitá-las mostraria dado fictício para
// igrejas reais. Ver src/config/modules.ts.
const Marketplace = IS_STAGING_BUILD ? lazy(() => import("./pages/Marketplace")) : null;

const Comunidade = IS_STAGING_BUILD ? lazy(() => import("./pages/Comunidade")) : null;

// Público — staging-only (devotional). Mesma lógica: null (e nenhum chunk)
// num build de produção.
const DevocionalPublic = IS_STAGING_BUILD ? lazy(() => import("./pages/DevocionalPublic")) : null;

// Cartas de Recomendação foi promovida (ver acima) — a página pública de
// validação de carta precisa acompanhar, senão o QR/link de validação
// impresso numa carta real de produção cairia num "módulo indisponível".
const ValidarCarta = lazy(() => import("./pages/ValidarCarta"));



const queryClient = new QueryClient();



const App = () => (

  <QueryClientProvider client={queryClient}>

    <TooltipProvider>

      <AuthProvider>

        <LanguageProvider>

        <SupportContextProvider>

        <ChurchProvider>

        <EnvironmentBanner />

        <OfflineBanner />

        <PWAUpdatePrompt />

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

              <Route path="/devocional" element={DevocionalPublic ? <DevocionalPublic /> : <PublicModuleUnavailable />} />


              <Route path="/admin" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />

              <Route path="/admin/campanhas" element={<ProtectedRoute><ModuleGate moduleId="campaigns"><Campanhas /></ModuleGate></ProtectedRoute>} />

              <Route path="/admin/financeiro" element={<ProtectedRoute><Financeiro /></ProtectedRoute>} />

              <Route path="/admin/membros" element={<ProtectedRoute><Membros /></ProtectedRoute>} />

              <Route path="/admin/agenda" element={<ProtectedRoute><Agenda /></ProtectedRoute>} />

              <Route path="/admin/biblia" element={<ProtectedRoute><ModuleGate moduleId="bible-ai"><Biblia /></ModuleGate></ProtectedRoute>} />

              <Route path="/admin/culto" element={<ProtectedRoute><ModuleGate moduleId="worship"><CultoLouvor /></ModuleGate></ProtectedRoute>} />

              <Route path="/admin/culto/biblioteca" element={<ProtectedRoute><ModuleGate moduleId="worship"><CultoBiblioteca /></ModuleGate></ProtectedRoute>} />

              <Route path="/admin/culto/roteiros" element={<ProtectedRoute><ModuleGate moduleId="worship"><CultoRoteiros /></ModuleGate></ProtectedRoute>} />

              <Route path="/admin/culto/telao" element={<ProtectedRoute><ModuleGate moduleId="worship"><CultoTelao /></ModuleGate></ProtectedRoute>} />

              <Route path="/admin/culto/assistente" element={<ProtectedRoute><ModuleGate moduleId="worship"><CultoAssistente /></ModuleGate></ProtectedRoute>} />

              <Route path="/admin/oracoes" element={<ProtectedRoute><Oracoes /></ProtectedRoute>} />

              <Route path="/admin/comunicacao" element={<ProtectedRoute><Comunicacao /></ProtectedRoute>} />

              <Route path="/admin/grupos" element={<ProtectedRoute><Grupos /></ProtectedRoute>} />

              <Route path="/admin/documentos" element={<ProtectedRoute><Documentos /></ProtectedRoute>} />

              <Route path="/admin/cartas-recomendacao" element={<ProtectedRoute><ModuleGate moduleId="recommendation-letters"><CartasRecomendacao /></ModuleGate></ProtectedRoute>} />

              <Route path="/admin/relatorios" element={<ProtectedRoute><ModuleGate moduleId="reports"><Relatorios /></ModuleGate></ProtectedRoute>} />

              <Route path="/admin/escalas" element={<ProtectedRoute><Escalas /></ProtectedRoute>} />

              <Route path="/admin/perfil" element={<ProtectedRoute><Perfil /></ProtectedRoute>} />

              <Route path="/admin/gerenciar-acessos" element={<ProtectedRoute><GerenciarAcessos /></ProtectedRoute>} />

              <Route path="/admin/congregacoes" element={<ProtectedRoute><Congregacoes /></ProtectedRoute>} />

              <Route path="/admin/assembleia-geral" element={<ProtectedRoute><AssembleiaGeral /></ProtectedRoute>} />

              <Route path="/admin/super-admin" element={<ProtectedRoute><SuperAdmin /></ProtectedRoute>} />

              <Route path="/admin/configuracao-igreja" element={<ProtectedRoute><ConfiguracaoIgreja /></ProtectedRoute>} />

              <Route path="/admin/marketplace" element={<ProtectedRoute><ModuleGate moduleId="marketplace">{Marketplace && <Marketplace />}</ModuleGate></ProtectedRoute>} />

              <Route path="/admin/comunidade" element={<ProtectedRoute><ModuleGate moduleId="community">{Comunidade && <Comunidade />}</ModuleGate></ProtectedRoute>} />

              {/* Global chat — accessible to all roles */}
              <Route path="/admin/chat" element={<ProtectedRoute><ChatSecretaria /></ProtectedRoute>} />
              {/* Legacy route kept for backward compatibility */}
              <Route path="/admin/chat-secretaria" element={<ProtectedRoute><ChatSecretaria /></ProtectedRoute>} />

              <Route path="/admin/solicitacoes" element={<ProtectedRoute><SolicitacoesAdministrativas /></ProtectedRoute>} />

              <Route path="/admin/carteira-ecclesia" element={<ProtectedRoute><CarteiraEcclesia /></ProtectedRoute>} />

              <Route path="/admin/porteiro" element={<ProtectedRoute><ModoPorteiro /></ProtectedRoute>} />

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

