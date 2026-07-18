import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { runEnvironmentCheck } from "./scripts/check-environment.mjs";

// https://vitejs.dev/config/
export default defineConfig(({ mode, command }) => {
  // SEGURANÇA (FASE 4): a validação de ambiente é reforçada AQUI, dentro do
  // próprio vite.config.ts, para que `vite build` chamado diretamente (sem
  // passar por `npm run build:production`/`build:staging`) também falhe
  // fechado quando o ambiente estiver ausente ou inconsistente — não é
  // possível contornar a guarda pulando os scripts do package.json.
  // `loadEnv` mescla process.env com os arquivos .env.<mode> do próprio Vite,
  // exatamente como o build real vai enxergar as variáveis.
  if (command === "build") {
    const loadedEnv = loadEnv(mode, process.cwd(), "");
    runEnvironmentCheck({ ...process.env, ...loadedEnv });
  }

  return {
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: "prompt",
      // false: o registro do SW é feito manualmente pelo componente
      // PWAUpdatePrompt via virtual:pwa-register/react. Deixar o plugin
      // também injetar um script de auto-registro no HTML criaria um
      // segundo caminho de registro concorrente com o hook React.
      injectRegister: false,
      // Controlamos os ícones do precache explicitamente via
      // workbox.globPatterns (ver abaixo) — evita duplicação de entradas.
      includeManifestIcons: false,
      // Fonte única do manifesto: nenhum public/manifest.webmanifest manual
      // deve existir. O plugin gera "manifest.webmanifest" (nome padrão) e
      // injeta automaticamente o <link rel="manifest"> no HTML a partir da
      // configuração "manifest" abaixo.
      // Service Worker gerado via workbox
      workbox: {
        // push-sw.js (raiz, não processado pelo Workbox) adiciona os
        // listeners 'push'/'notificationclick' ao MESMO Service Worker
        // gerado abaixo — permite notificação real de mensagem nova com o
        // app fechado/celular travado (ver src/lib/webPush.ts).
        importScripts: ["push-sw.js"],
        // Precache restrito ao app shell (JS/CSS/HTML do build) e aos
        // ícones essenciais do manifesto (pequenos, poucos KB cada).
        // NUNCA precachear campanhas, mídia, uploads ou documentos — isso
        // é responsabilidade do runtime caching abaixo, com limites de
        // tamanho e expiração.
        globPatterns: [
          "**/*.{js,css,woff2}",
          "index.html",
          "favicon.ico",
          "icons/icon-192.png",
          "icons/icon-512.png",
          "icons/apple-touch-icon.png",
        ],
        // Excluir explicitamente conteúdo grande/sensível do precache
        globIgnores: [
          "**/campaigns/**",
          "**/supabase/**",
          "**/node_modules/**",
        ],
        // Fallback SPA para todas as rotas de navegação
        navigateFallback: "/index.html",
        // NÃO permitir que o SW assuma páginas já abertas automaticamente
        skipWaiting: false,
        clientsClaim: false,
        // Runtime caching controlado: apenas assets estáticos do próprio
        // domínio, com limites de entradas e expiração. Nunca cacheia
        // Supabase, APIs, autenticação, dados financeiros, mensagens,
        // documentos privados ou requisições não-GET.
        runtimeCaching: [
          {
            // Google Fonts stylesheets
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-stylesheets",
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 ano
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            // Google Fonts webfonts
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-webfonts",
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 ano
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            // Imagens de campanhas (apenas domínio próprio) — cache em
            // tempo de execução, limitado, NUNCA precacheado no build.
            urlPattern: ({ url }) =>
              url.origin === self.location.origin &&
              url.pathname.startsWith("/campaigns/"),
            handler: "CacheFirst",
            options: {
              cacheName: "ecclesia-campaign-images",
              expiration: {
                maxEntries: 48,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 dias
              },
            },
          },
          {
            // Ícones (apenas domínio próprio)
            urlPattern: ({ url }) =>
              url.origin === self.location.origin &&
              url.pathname.startsWith("/icons/"),
            handler: "CacheFirst",
            options: {
              cacheName: "ecclesia-icons",
              expiration: {
                maxEntries: 32,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 dias
              },
            },
          },
        ],
      },
      // Manifest — fonte única de verdade (nenhum public/manifest.webmanifest
      // manual deve coexistir). Dados preservados do manifesto original
      // que já estava em produção antes desta modernização.
      manifest: {
        id: "/",
        lang: "pt-BR",
        name: "Ecclesia Admin",
        short_name: "Ecclesia",
        description: "Gestão eclesiástica — Ecclesia Admin",
        display: "standalone",
        orientation: "portrait",
        // Abrir direto na área autenticada evita a falsa impressão de
        // logout: a Landing pública nunca aparece para quem já tem sessão
        // válida. Login.tsx/ProtectedRoute cuidam do fallback para /login
        // quando realmente não há sessão.
        start_url: "/admin",
        scope: "/",
        theme_color: "#0B0B0F",
        background_color: "#0B0B0F",
        icons: [
          {
            src: "/icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
          {
            src: "/icons/apple-touch-icon.png",
            sizes: "180x180",
            type: "image/png",
            purpose: "any",
          },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;

          if (id.includes("recharts")) return "vendor-recharts";
          if (
            id.includes("react-markdown") ||
            id.includes("remark-") ||
            id.includes("micromark")
          ) {
            return "vendor-markdown";
          }
          if (id.includes("framer-motion")) return "vendor-motion";
          if (id.includes("@radix-ui")) return "vendor-radix";
          if (id.includes("@supabase")) return "vendor-supabase";
          if (id.includes("@tanstack")) return "vendor-query";
          if (id.includes("lucide-react")) return "vendor-icons";
          if (id.includes("date-fns")) return "vendor-dates";
        },
      },
    },
  },
  };
});
