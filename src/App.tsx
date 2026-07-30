import { lazy, Suspense } from "react";

import { QueryClientProvider } from "@tanstack/react-query";

import { queryClient } from "@/lib/queryClient";

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
import ConviteMembro from "./pages/ConviteMembro";
import ConviteAcesso from "./pages/ConviteAcesso";

import NotFound from "./pages/NotFound";




// Admin — lazy loaded (not needed until user navigates), sempre disponíveis
// em produção e staging (allowlist urgente de produção — ver modules.ts).
const Dashboard = lazy(() => import("./pages/Dashboard"));

const Financeiro = lazy(() => import("./pages/Financeiro"));

const Membros = lazy(() => import("./pages/Membros"));
const MemberProfile = lazy(() => import("./pages/MemberProfile"));

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
// sempre, igual aos outros módulos "both" acima.
const Biblia = lazy(() => import("./pages/Biblia"));

// Culto & Louvor, Campanhas, Cartas de Recomendação e Relatórios foram
// promovidos para availability: "both" em src/config/modules.ts
// (CORREÇÃO 2026-07-17 — todos têm backend real no Supabase — worship_songs/
// worship_setlists, campaigns/campaign_updates, recommendation_letters,
// e Relatorios.tsx já consulta members/transactions/events/prayer_requests/
// groups/documents reais via runScopedOrganizationQuery — nenhum depende de
// dado fictício para funcionar). Carregados sempre, iguais aos módulos
// "both" acima.
const CultoLouvor = lazy(() => import("./pages/CultoLouvor"));

const CultoBiblioteca = lazy(() => import("./pages/culto/BibliotecaMusicas"));

const CultoRoteiros = lazy(() => import("./pages/culto/RoteirosCulto"));

const CultoTelao = lazy(() => import("./pages/culto/TelaoProjecao"));

const CultoAssistente = lazy(() => import("./pages/culto/AssistenteCulto"));

const Campanhas = lazy(() => import("./pages/Campanhas"));

const CartasRecomendacao = lazy(() => import("./pages/CartasRecomendacao"));

const Relatorios = lazy(() => import("./pages/Relatorios"));

// TV Digital e Canal Eclésia foram promovidos para availability: "both" em
// src/config/modules.ts — backend (migrations 20260802*/20260803000000 e as
// edge functions de LiveKit/R2/heartbeat) já homologado e classificado como
// production_management em supabase/migration-manifest.json. Carregados
// sempre, iguais aos outros módulos "both" acima.
const TvHome = lazy(() => import("./pages/TvHome"));
const TvChannel = lazy(() => import("./pages/TvChannel"));
const TvAdmin = lazy(() => import("./pages/admin/TvAdmin"));
const TvCanais = lazy(() => import("./pages/admin/TvCanais"));
const TvProgramacao = lazy(() => import("./pages/admin/TvProgramacao"));
const TvAoVivo = lazy(() => import("./pages/admin/TvAoVivo"));
const TvBiblioteca = lazy(() => import("./pages/admin/TvBiblioteca"));
const TvConfiguracoes = lazy(() => import("./pages/admin/TvConfiguracoes"));
const TvStudioCamera = lazy(() => import("./pages/TvStudioCamera"));

const CanalHome = lazy(() => import("./pages/CanalHome"));
const CanalChannel = lazy(() => import("./pages/CanalChannel"));
const VideoPlayer = lazy(() => import("./pages/VideoPlayer"));
const CanalUpload = lazy(() => import("./pages/CanalUpload"));
const CanalPlaylists = lazy(() => import("./pages/CanalPlaylists"));
const CanalCreateChannel = lazy(() => import("./pages/CanalCreateChannel"));
const CanalMyChannel = lazy(() => import("./pages/CanalMyChannel"));

// Funcionalidades fora desta release ficam desativadas IGUALMENTE nos dois
// ambientes. O desenvolvimento continua em branch/preview própria.
// Documentos oficiais foram homologados e acompanham a mesma release no
// staging e na produção.
const CartasTransferencia = lazy(() => import("./pages/CartasTransferencia"));
const Certificados = lazy(() => import("./pages/Certificados"));
const ValidarTransferencia = lazy(() => import("./pages/ValidarTransferencia"));
const ValidarCertificado = lazy(() => import("./pages/ValidarCertificado"));

// CORREÇÃO 2026-07-20: "devotional" foi promovido de volta para "both" em
// src/config/modules.ts — a página pública de compartilhamento do
// versículo do dia precisa acompanhar, senão um link enviado por um membro
// em produção cairia num "módulo indisponível".
const DevocionalPublic = lazy(() => import("./pages/DevocionalPublic"));

// Cartas de Recomendação foi promovida (ver acima) — a página pública de
// validação de carta precisa acompanhar, senão o QR/link de validação
// impresso numa carta real de produção cairia num "módulo indisponível".
const ValidarCarta = lazy(() => import("./pages/ValidarCarta"));



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
              <Route path="/validar/transferencia/:token" element={<ValidarTransferencia />} />
              <Route path="/validar/certificado/:token" element={<ValidarCertificado />} />
              <Route path="/convite-membro/:token" element={<ConviteMembro />} />
              <Route path="/convite-acesso/:token" element={<ConviteAcesso />} />

              <Route path="/devocional" element={<DevocionalPublic />} />


              <Route path="/admin" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />

              <Route path="/admin/campanhas" element={<ProtectedRoute><ModuleGate moduleId="campaigns"><Campanhas /></ModuleGate></ProtectedRoute>} />

              <Route path="/admin/financeiro" element={<ProtectedRoute><Financeiro /></ProtectedRoute>} />

              <Route path="/admin/membros" element={<ProtectedRoute><Membros /></ProtectedRoute>} />
              <Route path="/admin/membros/:memberId" element={<ProtectedRoute><MemberProfile /></ProtectedRoute>} />

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

              <Route path="/admin/cartas-transferencia" element={<ProtectedRoute><ModuleGate moduleId="official-documents"><CartasTransferencia /></ModuleGate></ProtectedRoute>} />

              <Route path="/admin/certificados" element={<ProtectedRoute><ModuleGate moduleId="official-documents"><Certificados /></ModuleGate></ProtectedRoute>} />

              <Route path="/admin/relatorios" element={<ProtectedRoute><ModuleGate moduleId="reports"><Relatorios /></ModuleGate></ProtectedRoute>} />

              {/* TV Digital */}
              <Route path="/tv" element={<ProtectedRoute><ModuleGate moduleId="tv-digital"><TvHome /></ModuleGate></ProtectedRoute>} />
              <Route path="/tv/:channelSlug" element={<ProtectedRoute><ModuleGate moduleId="tv-digital"><TvChannel /></ModuleGate></ProtectedRoute>} />
              <Route path="/admin/tv" element={<ProtectedRoute><ModuleGate moduleId="tv-digital"><TvAdmin /></ModuleGate></ProtectedRoute>} />
              <Route path="/admin/tv/canais" element={<ProtectedRoute><ModuleGate moduleId="tv-digital"><TvCanais /></ModuleGate></ProtectedRoute>} />
              <Route path="/admin/tv/programacao" element={<ProtectedRoute><ModuleGate moduleId="tv-digital"><TvProgramacao /></ModuleGate></ProtectedRoute>} />
              <Route path="/admin/tv/ao-vivo" element={<ProtectedRoute><ModuleGate moduleId="tv-digital"><TvAoVivo /></ModuleGate></ProtectedRoute>} />
              <Route path="/admin/tv/biblioteca" element={<ProtectedRoute><ModuleGate moduleId="tv-digital"><TvBiblioteca /></ModuleGate></ProtectedRoute>} />
              <Route path="/admin/tv/configuracoes" element={<ProtectedRoute><ModuleGate moduleId="tv-digital"><TvConfiguracoes /></ModuleGate></ProtectedRoute>} />
              {/* Acesso de câmera do estúdio: operador entra via link/QR dedicado, sem exigir sessão administrativa completa. */}
              <Route path="/tv/studio/:roomId/camera" element={<ModuleGate moduleId="tv-digital"><TvStudioCamera /></ModuleGate>} />

              {/* Canal Eclésia (vídeo sob demanda) */}
              <Route path="/canal" element={<ProtectedRoute><ModuleGate moduleId="canal-ecclesia"><CanalHome /></ModuleGate></ProtectedRoute>} />
              <Route path="/canal/upload" element={<ProtectedRoute><ModuleGate moduleId="canal-ecclesia"><CanalUpload /></ModuleGate></ProtectedRoute>} />
              <Route path="/canal/playlists" element={<ProtectedRoute><ModuleGate moduleId="canal-ecclesia"><CanalPlaylists /></ModuleGate></ProtectedRoute>} />
              <Route path="/canal/criar" element={<ProtectedRoute><ModuleGate moduleId="canal-ecclesia"><CanalCreateChannel /></ModuleGate></ProtectedRoute>} />
              <Route path="/canal/meu-canal" element={<ProtectedRoute><ModuleGate moduleId="canal-ecclesia"><CanalMyChannel /></ModuleGate></ProtectedRoute>} />
              <Route path="/canal/:slug" element={<ProtectedRoute><ModuleGate moduleId="canal-ecclesia"><CanalChannel /></ModuleGate></ProtectedRoute>} />
              <Route path="/video/:id" element={<ProtectedRoute><ModuleGate moduleId="canal-ecclesia"><VideoPlayer /></ModuleGate></ProtectedRoute>} />

              <Route path="/admin/escalas" element={<ProtectedRoute><Escalas /></ProtectedRoute>} />

              <Route path="/admin/perfil" element={<ProtectedRoute><Perfil /></ProtectedRoute>} />

              <Route path="/admin/gerenciar-acessos" element={<ProtectedRoute><GerenciarAcessos /></ProtectedRoute>} />

              <Route path="/admin/congregacoes" element={<ProtectedRoute><Congregacoes /></ProtectedRoute>} />

              <Route path="/admin/assembleia-geral" element={<ProtectedRoute><AssembleiaGeral /></ProtectedRoute>} />

              <Route path="/admin/super-admin" element={<ProtectedRoute><SuperAdmin /></ProtectedRoute>} />

              <Route path="/admin/configuracao-igreja" element={<ProtectedRoute><ConfiguracaoIgreja /></ProtectedRoute>} />

              <Route path="/admin/marketplace" element={<ProtectedRoute><ModuleGate moduleId="marketplace"><NotFound /></ModuleGate></ProtectedRoute>} />

              <Route path="/admin/comunidade" element={<ProtectedRoute><ModuleGate moduleId="community"><NotFound /></ModuleGate></ProtectedRoute>} />

              <Route path="/admin/discipulado" element={<ProtectedRoute><ModuleGate moduleId="discipleship"><NotFound /></ModuleGate></ProtectedRoute>} />

              <Route path="/admin/teologia" element={<ProtectedRoute><ModuleGate moduleId="theology"><NotFound /></ModuleGate></ProtectedRoute>} />

              <Route path="/admin/missoes" element={<ProtectedRoute><ModuleGate moduleId="missions"><NotFound /></ModuleGate></ProtectedRoute>} />

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
