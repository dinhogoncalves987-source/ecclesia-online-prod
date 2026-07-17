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

import { ReviewModeBanner } from "@/components/ReviewModeBanner";



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
import Avaliacao from "./pages/Avaliacao";




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

// Admin — staging-only (ver src/config/modules.ts, availability: "staging").
// Nunca importados/empacotados num build de produção — apenas o gate
// (ModuleGate) e a página de fallback (ModuleUnavailable) são bundladas.
const Biblia = IS_STAGING_BUILD ? lazy(() => import("./pages/Biblia")) : null;

const CultoLouvor = IS_STAGING_BUILD ? lazy(() => import("./pages/CultoLouvor")) : null;

const CultoBiblioteca = IS_STAGING_BUILD ? lazy(() => import("./pages/culto/BibliotecaMusicas")) : null;

const CultoRoteiros = IS_STAGING_BUILD ? lazy(() => import("./pages/culto/RoteirosCulto")) : null;

const CultoTelao = IS_STAGING_BUILD ? lazy(() => import("./pages/culto/TelaoProjecao")) : null;

const CultoAssistente = IS_STAGING_BUILD ? lazy(() => import("./pages/culto/AssistenteCulto")) : null;

const Campanhas = IS_STAGING_BUILD ? lazy(() => import("./pages/Campanhas")) : null;

const CartasRecomendacao = IS_STAGING_BUILD ? lazy(() => import("./pages/CartasRecomendacao")) : null;

const Relatorios = IS_STAGING_BUILD ? lazy(() => import("./pages/Relatorios")) : null;

const Marketplace = IS_STAGING_BUILD ? lazy(() => import("./pages/Marketplace")) : null;

const Comunidade = IS_STAGING_BUILD ? lazy(() => import("./pages/Comunidade")) : null;

// Público — staging-only (devotional/recommendation-letters). Mesma lógica:
// null (e nenhum chunk) num build de produção.
const DevocionalPublic = IS_STAGING_BUILD ? lazy(() => import("./pages/DevocionalPublic")) : null;

const ValidarCarta = IS_STAGING_BUILD ? lazy(() => import("./pages/ValidarCarta")) : null;



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

          <ReviewModeBanner />

          <Suspense fallback={<PageLoader />}>

            <Routes>

              <Route path="/" element={<Landing />} />

              <Route path="/login" element={<Login />} />

              <Route path="/signup" element={<Signup />} />

              <Route path="/forgot-password" element={<ForgotPassword />} />

              <Route path="/reset-password" element={<ResetPassword />} />

              <Route path="/share" element={<SharePublic />} />
              <Route path="/validar/carta/:token" element={ValidarCarta ? <ValidarCarta /> : <PublicModuleUnavailable />} />
              <Route path="/validar-membro/:id" element={<ValidarMembro />} />
              <Route path="/convite-membro/:token" element={<ConviteMembro />} />
              <Route path="/convite-acesso/:token" element={<ConviteAcesso />} />

              <Route path="/devocional" element={DevocionalPublic ? <DevocionalPublic /> : <PublicModuleUnavailable />} />

              {/*
                Modo Avaliação — rota pública exclusiva, só funcional quando
                VITE_PUBLIC_REVIEW_MODE=true neste build (ver
                src/pages/Avaliacao.tsx e src/config/reviewMode.ts). Quando a
                flag não está ativa, esta rota apenas redireciona para "/"
                como qualquer outra URL não reconhecida.
              */}
              <Route path="/avaliacao" element={<Avaliacao />} />


              <Route path="/admin" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />

              <Route path="/admin/campanhas" element={<ProtectedRoute><ModuleGate moduleId="campaigns">{Campanhas && <Campanhas />}</ModuleGate></ProtectedRoute>} />

              <Route path="/admin/financeiro" element={<ProtectedRoute><Financeiro /></ProtectedRoute>} />

              <Route path="/admin/membros" element={<ProtectedRoute><Membros /></ProtectedRoute>} />

              <Route path="/admin/agenda" element={<ProtectedRoute><Agenda /></ProtectedRoute>} />

              <Route path="/admin/biblia" element={<ProtectedRoute><ModuleGate moduleId="bible-ai">{Biblia && <Biblia />}</ModuleGate></ProtectedRoute>} />

              <Route path="/admin/culto" element={<ProtectedRoute><ModuleGate moduleId="worship">{CultoLouvor && <CultoLouvor />}</ModuleGate></ProtectedRoute>} />

              <Route path="/admin/culto/biblioteca" element={<ProtectedRoute><ModuleGate moduleId="worship">{CultoBiblioteca && <CultoBiblioteca />}</ModuleGate></ProtectedRoute>} />

              <Route path="/admin/culto/roteiros" element={<ProtectedRoute><ModuleGate moduleId="worship">{CultoRoteiros && <CultoRoteiros />}</ModuleGate></ProtectedRoute>} />

              <Route path="/admin/culto/telao" element={<ProtectedRoute><ModuleGate moduleId="worship">{CultoTelao && <CultoTelao />}</ModuleGate></ProtectedRoute>} />

              <Route path="/admin/culto/assistente" element={<ProtectedRoute><ModuleGate moduleId="worship">{CultoAssistente && <CultoAssistente />}</ModuleGate></ProtectedRoute>} />

              <Route path="/admin/oracoes" element={<ProtectedRoute><Oracoes /></ProtectedRoute>} />

              <Route path="/admin/comunicacao" element={<ProtectedRoute><Comunicacao /></ProtectedRoute>} />

              <Route path="/admin/grupos" element={<ProtectedRoute><Grupos /></ProtectedRoute>} />

              <Route path="/admin/documentos" element={<ProtectedRoute><Documentos /></ProtectedRoute>} />

              <Route path="/admin/cartas-recomendacao" element={<ProtectedRoute><ModuleGate moduleId="recommendation-letters">{CartasRecomendacao && <CartasRecomendacao />}</ModuleGate></ProtectedRoute>} />

              <Route path="/admin/relatorios" element={<ProtectedRoute><ModuleGate moduleId="reports">{Relatorios && <Relatorios />}</ModuleGate></ProtectedRoute>} />

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

