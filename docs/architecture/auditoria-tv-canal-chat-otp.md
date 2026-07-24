# OPERAÇÃO ESPECIAL — Auditoria e conclusão de TV Digital, Canal Eclésia e Ecclesia Chat / Login por telefone

Branch: `handoff/sonnet-auditoria-tv-canal-chat-otp-20260724`, criada a partir de
`review/operacao-4-missoes` (worktree limpo no checkpoint). Nenhuma migration foi aplicada, nenhum
commit, push, PR ou deploy foi executado durante esta operação. Este documento é o inventário
completo exigido pela operação — leia-o junto com o relatório final entregue no chat.

## 1. Estado encontrado (auditoria) — resumo executivo

A auditoria confirmou um padrão comum aos três produtos: **o frontend estava mais avançado que o
banco**.

- **TV Digital** (`src/lib/tvDigital.ts`, `src/pages/Tv*.tsx`, `src/pages/admin/Tv*.tsx`,
  `src/components/tv/*`): contrato de frontend **completo** (tipos, mappers, ~30 chamadas
  `.from()`/`.rpc()` contra `tv_channels`, `tv_stream_keys`, `tv_programs`, `tv_schedule_blocks`,
  `tv_live_sessions`, `tv_replays`, `tv_studio_rooms`, `tv_camera_sessions`, `tv_studio_cameras`,
  `tv_cut_log` e RPCs como `get_tv_schedule`, `get_current_tv_block`, `create_live_production`,
  `claim_production_director`, etc.) — **nenhuma dessas tabelas/RPCs existia** em
  `supabase/migrations` nem em `supabase-production/supabase/migrations`. Era um "backend fantasma":
  toda tela quebraria contra uma tabela inexistente em qualquer ambiente real.
- **Canal Eclésia** (`src/lib/canalEcclesia.ts`, `src/pages/Canal*.tsx`, `src/pages/VideoPlayer.tsx`):
  mesmo padrão — contrato completo para `ecclesia_channels`, `ecclesia_videos`,
  `ecclesia_video_likes`, `ecclesia_video_comments`, `ecclesia_subscriptions`,
  `ecclesia_watch_history`, `ecclesia_video_playlists`, `ecclesia_playlist_items` — nenhuma tabela
  existia. Além disso, `src/lib/canalMockData.ts` (dados de amostra "Fase 1 Visual") ainda alimenta
  visivelmente `CanalHome.tsx`, `CanalChannel.tsx`, `CanalMyChannel.tsx`, `VideoPlayer.tsx` e
  `src/components/canal/CanalComponents.tsx` como *fallback* quando não há dado real.
- **Ecclesia Chat** (`src/pages/ChatSecretaria.tsx`, `src/lib/internalMessage*.ts`,
  `src/components/messages/*`): backend real já existia (`internal_threads`, `internal_messages`,
  `internal_attachments`, Realtime já cabeado). Dois defeitos concretos de identidade foram
  confirmados por leitura de código: (a) `ChatSecretaria.tsx` passava `auth.users.id` como se fosse
  `members.id` para `findOrCreateDirectThread`; (b) nenhuma proteção de banco contra
  duplo-clique/retry criando duas threads diretas para o mesmo par (organização, membro), nem contra
  autoconversa via seletor administrativo. O composer (`InternalMessageComposer.tsx`) já sincronizava
  `setText`/auto-grow a cada `onChange`, inclusive durante composição de IME — a causa raiz mais
  plausível da "digitação invertida" relatada.
- **Login por telefone/WhatsApp**: **não existia nenhuma estrutura** — nem tabela, nem RPC, nem tela.
  `members.phone`/`members.whatsapp` existem como colunas de cadastro, mas nenhum fluxo de
  autenticação as usava. `supabase.auth.signInWithOtp` do SDK é email-only; não há provedor de
  telefone habilitado (e não pode ser, por proibição explícita desta operação de configurar
  gateway/provider real).

## 2. O que já era real vs. o que era mock

| Produto | Tela/arquivo | Antes desta operação |
| --- | --- | --- |
| TV Digital | Todas as páginas de consumo/admin | Chamavam Supabase real, mas contra tabelas inexistentes (quebra em runtime) |
| TV Digital | `EcclesiaStudio.tsx` → "Preparar computador" | `setTimeout` de 2s que sempre reporta sucesso — **mock declarado, não corrigido nesta operação** (ver §18 limitações) |
| TV Digital | `addMockCamera` (câmera local) em `EcclesiaStudio.tsx` | Função explicitamente mock — **não corrigida nesta operação** |
| Canal Eclésia | `CanalHome`, `CanalChannel`, `CanalMyChannel`, `VideoPlayer`, `CanalComponents` | Usam `canalMockData.ts` como fonte visível de conteúdo (fallback) — **frontend não foi rewired nesta operação para os novos `ecclesia_*`** (maior gap remanescente, ver §18) |
| Chat | Mensagens, threads, anexos, realtime | Já reais (Supabase + Realtime) |
| Chat | Identidade do destinatário/remetente | Bug real de identidade (auth.users.id como members.id) — **corrigido** |
| Login/OTP | Tudo | Não existia — **criado do zero nesta operação** (schema + RPCs + Edge Function + tela) |

## 3. Gaps identificados e decisões

1. **Backend fantasma de TV/Canal** → decisão: criar a fundação completa (tabelas, RLS, RPCs,
   triggers) em duas migrations novas, byte a byte compatível com os nomes de coluna já esperados
   pelos mappers de `tvDigital.ts`/`canalEcclesia.ts` (conferido linha a linha nesses dois arquivos).
2. **Vínculo TV↔Canal inexistente** → decisão: trigger `_tv_channels_link_ecclesia_channel`
   (idempotente, com `pg_advisory_xact_lock` por organização) cria/reaproveita o canal do Canal
   Eclésia sempre que um canal de TV é criado — nunca duplica por retry/concorrência, nunca aponta
   para organização diferente (reforçado por `_tv_channels_validate_canal_link`).
3. **"ao vivo" nunca pode ser fabricado** → decisão: `tv_live_sessions.status_transmissao` é uma
   coluna com `CHECK` explícito (`offline`/`waiting`/`live`/`ended`/`error`), mudada **apenas** por
   RPC `SECURITY DEFINER` (nunca por `UPDATE` direto do cliente, nunca por `setState` puro do
   frontend).
4. **Identidade do chat** → decisão: corrigir no frontend (resolver `members.id` antes de chamar
   `findOrCreateDirectThread`, nunca aceitar `auth.users.id`) **e** no banco (índice único +
   trigger `BEFORE INSERT OR UPDATE` que rejeita `member.user_id = created_by`), seguindo o princípio
   de nunca confiar só na fronteira do frontend.
5. **Digitação invertida** → decisão: nunca sincronizar `setText`/`adjustHeight` durante uma
   composição de IME ativa (`isComposingRef`); sincronizar de uma vez só no `compositionend`.
6. **Login por telefone sem provedor real** → decisão: modelar o transporte como máquina de estados
   explícita (`disabled` | `manual_test` | `provider`), nunca enviar nada de verdade, e resolver a
   emissão de sessão real via `supabase.auth.admin.generateLink` (magiclink) + `verifyOtp` no
   navegador — nunca fabricar um JWT manualmente. Um e-mail sintético determinístico
   (`otp-member-<id>@members.ecclesiaonline.internal`) é usado apenas como identificador técnico
   exigido pelo GoTrue quando o membro não tem e-mail cadastrado — **nunca** é a prova de identidade
   (a prova é o código).
7. **Capabilities novas** → decisão: separar leitura (`tv.read`/`canal.read`), gestão
   (`tv.manage`/`canal.manage`), operação ao vivo (`tv.live_operate`) e moderação
   (`canal.moderate`), com 4 responsabilidades novas (`tv_manager`, `tv_operator`, `canal_manager`,
   `canal_moderator`) — nenhuma concedida a secretário/tesoureiro por conveniência.

## 4. Tabelas criadas (novas migrations)

### TV Digital
`tv_channels`, `tv_stream_keys`, `tv_programs`, `tv_schedule_blocks`, `tv_live_sessions`,
`tv_replays`, `tv_view_events`, `tv_studio_rooms`, `tv_camera_sessions`, `tv_studio_cameras`,
`tv_cut_log`.

### Canal Eclésia
`ecclesia_channels`, `ecclesia_videos`, `ecclesia_video_likes`, `ecclesia_video_comments`,
`ecclesia_subscriptions`, `ecclesia_watch_history`, `ecclesia_video_playlists`,
`ecclesia_playlist_items`.

### Login/OTP
`member_otp_settings` (singleton de transporte), `member_otp_request_log` (rate limit),
`member_otp_challenges` (desafios com hash), `member_otp_admin_audit` (auditoria do teste manual).

### Chat (hardening, sem tabela nova)
Índice único e trigger sobre `internal_threads` já existente.

Todas as tabelas novas têm RLS habilitado, sem `USING (true)`/`WITH CHECK (true)`, e não possuem
política de `DELETE` física quando o domínio exige preservação de histórico (ex.: `tv_channels`,
`tv_replays` usam `status='archived'`, nunca `DELETE`).

## 5. RPCs criadas

**TV/Canal (fundação — `20260802120000_tv_canal_foundation.sql`)**: `_can_consume_org_content`,
`get_tv_schedule`, `get_current_tv_block`, `track_tv_view_event`, `generate_recurring_instances`,
`get_video_comments`, `upsert_watch_history`, mais triggers de contagem denormalizada (likes,
comentários, inscritos, vídeos por canal).

**TV/Canal (produção ao vivo — `20260802130000_tv_canal_live_production.sql`)**:
`create_tv_studio_room`, `get_studio_cameras`, `log_camera_cut`, `list_active_productions`,
`create_live_production`, `claim_production_director`, `join_production_as_camera`,
`disconnect_camera`, `director_heartbeat`, `update_camera_heartbeat`, `end_live_production`,
`set_camera_on_air`, `import_tv_session_to_canal`, mais os triggers de vínculo idempotente
`_tv_channels_link_ecclesia_channel` e `_tv_channels_validate_canal_link`.

**Login/OTP (`20260802100000_member_login_otp_foundation.sql`)**: `_normalize_phone_e164_br`,
`request_member_login_otp` (pública, `anon`+`authenticated`, fail-closed),
`_verify_member_login_otp_internal` (restrita a `service_role`), `link_member_auth_user` (restrita a
`service_role`, idempotente).

**Login/OTP (teste administrativo — `20260802110000_member_login_otp_admin_test.sql`)**:
`admin_generate_manual_test_otp` (restrita a `authenticated` com capability
`member_login.otp_test`).

Todas as funções `SECURITY DEFINER` usam `SET search_path = public[, extensions][, pg_temp]`, têm
`PUBLIC`/`anon` revogados quando apropriado, e validam organização/membro/usuário/capability dentro
do próprio corpo da função (nunca confiam em filtro do cliente).

## 6. Edge Functions

- **`verify-member-login-otp`** (nova, `supabase/functions/verify-member-login-otp/index.ts`,
  `verify_jwt = false` em `supabase/config.toml` porque o membro ainda não está autenticado nesse
  ponto do fluxo). Único ponto do sistema autorizado a chamar `admin.generateLink`/`admin.createUser`
  para o fluxo de telefone; nunca chama `updateUserById`; nunca reseta senha.
- Nenhuma outra Edge Function foi criada ou alterada. `get-r2-upload-url` (referenciada por
  `src/lib/r2Upload.ts`) continua **ausente** — gap pré-existente, não coberto nesta operação (ver
  §18).

## 7. Storage

Nenhum bucket novo foi criado. `tv_stream_keys`/`tv_replays`/`ecclesia_videos` guardam apenas
referências (`r2_storage_key`, `hls_url`) — a gravação real em Cloudflare R2 depende da Edge Function
`get-r2-upload-url`, que continua fora do escopo desta operação (declarado, não fabricado).

## 8. Integrações externas — real vs. UI-only

| Integração | Estado real encontrado |
| --- | --- |
| HLS.js (player) | Biblioteca real no bundle (`hls-*.js` no build), consome `hls_url` do banco |
| LiveKit | Mencionado no contrato do frontend, **sem** cliente real integrado nesta auditoria |
| OBS WebSocket | `useObsWebSocket.ts` existe como cliente real de WebSocket — depende de um OBS local acessível, nunca simulado no protocolo em si |
| MediaMTX / FFmpeg / Coturn / VPS de ingest | **Nenhuma** integração real encontrada — apenas colunas (`ingest_url`, `rtmp_url`) preparadas para receberem essas URLs quando configuradas |
| Cloudflare R2 | Cliente de upload real em `src/lib/r2Upload.ts`, mas a Edge Function que assina a URL (`get-r2-upload-url`) está ausente — fail-closed hoje (upload real não funciona sem ela) |
| WhatsApp/SMS gateway | **Nenhuma** integração — proibida nesta operação; transporte de OTP modelado como `disabled`/`manual_test`/`provider`, nunca `provider` funcional |

## 9. Variáveis necessárias (somente nomes)

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (já usadas por outras Edge Functions, reaproveitadas por
`verify-member-login-otp`). Nenhuma variável nova de segredo foi introduzida. Um futuro provider real
de WhatsApp exigiria variáveis próprias (não criadas nesta operação, apenas o "encaixe" fail-closed
em `member_otp_settings.transport_mode = 'provider'`).

## 10. Capabilities novas

| Capability | Significado | Responsabilidades que a concedem |
| --- | --- | --- |
| `tv.read` | Acesso administrativo de leitura à TV (distinto do consumo público, que não exige capability) | `tv_manager`, `tv_operator`, governança |
| `tv.manage` | Criar/editar canais, programação, biblioteca, configurações | `tv_manager`, governança |
| `tv.live_operate` | Operar direção/câmeras/transmissão em produções escaladas | `tv_manager`, `tv_operator`, governança |
| `canal.read` | Acesso administrativo de leitura ao Canal | `canal_manager`, `canal_moderator`, governança |
| `canal.manage` | Criar/editar canais, vídeos, playlists | `canal_manager`, governança |
| `canal.moderate` | Ocultar comentários/conteúdo publicado | `canal_moderator`, governança |
| `member_login.otp_test` | Gerar código de teste manual (1 membro por vez) | `church_admin`, `responsible_pastor` |

Consumo (assistir TV, navegar/assistir vídeos do Canal) **nunca** exige essas capabilities — é
liberado a qualquer membro autenticado da organização ou de uma organização descendente
(`_can_consume_org_content`), mantendo o padrão "consumo é do membro, gestão é da capability".

## 11. RLS — resumo por domínio

- **TV/Canal**: `SELECT` liberado por `_can_consume_org_content` (hierarquia); `INSERT`/`UPDATE`
  exigem a capability de gestão/moderação/operação correspondente; nenhuma tabela tem política de
  `DELETE` física para os registros que representam histórico de transmissão/publicação.
- **OTP**: `member_otp_challenges`/`member_otp_request_log` não têm política alguma para
  `anon`/`authenticated` — apenas RPCs `SECURITY DEFINER` tocam essas tabelas.
  `member_otp_admin_audit` tem `SELECT` restrito à própria organização com capability
  `member_login.otp_test`.
- **Chat**: nenhuma tabela nova; o hardening acrescenta um índice único e um trigger sobre
  `internal_threads`, sem alterar as políticas RLS já existentes.

## 12. Fluxos e estados

### TV Digital — estados de transmissão
`não configurado` (sem `tv_stream_keys`/URL) → `offline` → `waiting` (produção criada, ninguém ao ar)
→ `live` (transmissão real confirmada por RPC) → `ended` → `error`. Nunca existe um caminho de
frontend que force `live` sem passar por `create_live_production`/`set_camera_on_air`.

### TV↔Canal — vínculo idempotente
Criar `tv_channels` → trigger adquire `pg_advisory_xact_lock(hashtext(organization_id))` → procura
`ecclesia_channels` com `source_tv_channel_id = tv_channels.id` → se não existir, cria um; se existir,
reaproveita — nunca duplica em concorrência/retry.

### Login por telefone/WhatsApp
1. Membro informa telefone → `request_member_login_otp` normaliza, localiza **um único** membro
   elegível (ambíguo/ausente falha explicitamente), aplica rate limit, cria desafio com hash — mas
   **nunca envia nada de verdade** nesta operação (retorna `otp_disabled`/`otp_manual_test_admin_only`
   conforme o modo).
2. Em `manual_test` (staging), um admin autorizado gera o código pela tela protegida
   `/admin/login-otp-teste` (`admin_generate_manual_test_otp`) — código revelado só nesta resposta,
   TTL curto, nunca persistido em texto puro, nunca logado.
3. Membro digita o código → Edge Function `verify-member-login-otp` valida via
   `_verify_member_login_otp_internal`, resolve/gera a conta Auth ponte, chama
   `link_member_auth_user`, devolve `{ email, token_hash }`.
4. Frontend chama `supabase.auth.verifyOtp({ email, token_hash, type: "magiclink" })` — sessão real,
   nenhum JWT fabricado manualmente.

## 13. Correções aplicadas nesta operação

- Identidade do chat: `ChatSecretaria.tsx` resolve `members.id` antes de abrir DM; nunca aceita
  `auth.users.id`; bloqueio client-side de autoconversa; busca de membros filtra o próprio usuário.
- `internalMessageMutations.ts`: guarda de autoconversa + recuperação da thread vencedora em
  violação de índice único (nunca duplica por retry).
- Migration `20260802090000_internal_chat_identity_hardening.sql`: índice único
  `uniq_internal_threads_secretariat_member` + trigger `internal_threads_reject_self_conversation`.
- `InternalMessageComposer.tsx`: `isComposingRef` evita sincronizar estado/altura durante composição
  de IME ativa (causa raiz da digitação invertida); listener de viewport mobile deixa de usar
  `{ once: true }` (parava de reposicionar o composer após a primeira mudança de teclado).
- Fundação completa de banco para TV Digital e Canal Eclésia (duas migrations, ~1.360 linhas de SQL),
  incluindo o vínculo idempotente TV↔Canal.
- Estrutura completa de Login por telefone/WhatsApp (duas migrations + Edge Function + biblioteca de
  frontend + tela de login + tela administrativa de teste).
- Capabilities novas integradas ao Gerenciador de Acessos (`accessControl.ts` +
  `access_responsibility_definitions`).
- `TvChannel.tsx`: `CurrentBlockInfo` referenciava `viewerCount` fora de escopo (`TS2304`), o que
  quebraria em runtime (`ReferenceError`) sempre que um bloco estivesse `live` — corrigido ao passar
  `viewerCount` como prop explícita (achado por checagem correta de `tsc`, ver §16.1).

Estas correções foram cruzadas, após a implementação, contra 4 auditorias somente-leitura lançadas em
paralelo no início da operação (TV Digital, Canal Eclésia, Ecclesia Chat, Login/OTP) — todas
confirmaram independentemente as mesmas causas-raiz já corrigidas acima (digitação invertida por falta
de gate de composição IME; `openDm` passando `auth.users.id` no lugar de `members.id`; ausência de
índice único para threads 1:1; falta de continuidade do listener de `visualViewport`), sem apontar
nenhuma causa-raiz adicional não tratada nesta operação.

## 14. Limitações declaradas honestamente

1. **Canal Eclésia — mock ainda visível no fluxo real**: `canalMockData.ts` continua importado por
   `CanalHome.tsx`, `CanalChannel.tsx`, `CanalMyChannel.tsx`, `VideoPlayer.tsx` e
   `CanalComponents.tsx`. O banco real já existe (§4), mas **o rewiring do frontend para consumir os
   `ecclesia_*` reais em vez do mock não foi concluído nesta operação** — é o gap mais importante
   antes de qualquer promoção do Canal. Está listado como ponto obrigatório de revisão do Codex
   (§19).
2. **TV Studio — "Preparar computador" continua simulado**: `EcclesiaStudio.tsx` usa um `setTimeout`
   de 2s que sempre reporta sucesso (`handleStudioPrepare`) e `addMockCamera` para câmera local —
   ambos identificados como mock durante a auditoria, **não corrigidos** nesta operação por exigirem
   um instalador/companion real fora do escopo de banco de dados desta entrega. Nenhum destes exibe
   "ao vivo" fabricado (a transmissão real depende de `status_transmissao`, que é server-side), mas a
   etapa de preparo do computador em si é visualmente enganosa hoje.
3. **`get-r2-upload-url` continua ausente**: upload real de vídeo/replay para Cloudflare R2 não
   funciona fim a fim sem essa Edge Function.
4. **LiveKit/MediaMTX/FFmpeg/Coturn**: nenhuma integração real — apenas colunas prontas para receber
   URLs quando esses serviços existirem.
5. **Responsividade mobile de TV/Canal**: não foi reauditada tela a tela nesta operação (a prioridade
   do tempo disponível foi banco/segurança/identidade/OTP); recomenda-se auditoria dedicada antes da
   promoção.
6. **E-mail-ponte sintético do OTP** (`otp-member-<id>@members.ecclesiaonline.internal`): é uma
   solução de engenharia para satisfazer a exigência de identificador do GoTrue sem habilitar o
   provedor de telefone (proibido nesta operação). Funciona, mas é um ponto explícito que o Codex
   deve revisar quanto a aceitação de longo prazo (§19).
7. **Testes de migration são testes de conteúdo SQL** (regex sobre o texto do arquivo), não testes
   contra um banco real — mesmo padrão já usado pelas Operações 1–4 deste repositório. Nenhuma
   migration desta operação foi executada contra um banco real em nenhum momento.

## 15. Riscos

- Enquanto o Canal continuar servindo mock no frontend, qualquer atividade real registrada no banco
  (curtidas, comentários, watch history) não será visível para o usuário até o rewiring — risco de
  confusão se alguém achar que "o Canal já é real" só porque o banco existe.
- `admin_generate_manual_test_otp` precisa continuar restrita a `manual_test` e a uma capability
  explícita; qualquer promoção futura para produção deve manter `transport_mode = 'disabled'` por
  padrão (a migration já semeia esse valor).
- Uso de `auth.admin.createUser`/`generateLink` na Edge Function é privilegiado (service_role) — está
  isolado nesta única função, mas deve ser revisado pelo Codex com atenção redobrada por ser código
  de fronteira de identidade.

## 16. Testes — resultados reais desta sessão

Comandos executados nesta sessão, com resultado real (não declarado sem execução):

```text
npx vitest run
  Test Files  58 passed (58)
  Tests       1031 passed (1031)

npx eslint <arquivos novos/alterados>
  0 erros, 0 warnings

git diff --check
  sem saída (sem problema de whitespace)

npm run build:staging
  ✓ built in ~31s (com refs canônicos de staging fornecidos apenas como
    variáveis de ambiente efêmeras do processo — nenhum arquivo .env foi
    criado/alterado; nenhum segredo foi usado, só identificadores públicos de
    projeto já documentados em .env.staging.example)
```

### 16.1 Correção sobre `tsc --noEmit` (achado de auditoria pós-entrega)

Uma correção honesta sobre o item de validação de tipos, encontrada ao revisar em detalhe os
relatórios de 4 subagentes de auditoria lançados nesta operação:

- O comando `npx tsc --noEmit`, executado a partir da raiz do repositório, usa `tsconfig.json`, que é
  um tsconfig "solução" com `"files": []` e `references` para `tsconfig.app.json`/`tsconfig.node.json`.
  Sem a flag `-b` (build mode), esse comando **não compila nenhum arquivo de verdade** — o "0 erros"
  relatado anteriormente nesta seção era um falso negativo (nada foi checado), não uma confirmação
  real de tipos corretos. Isso é um erro deste agente, registrado aqui em vez de silenciado.
- O comando correto para checar `src/` é:

  ```text
  npx tsc --noEmit -p tsconfig.app.json
  ```

  Resultado real, executado após a correção acima ser identificada:

  ```text
  302 erros (antes da correção do bug abaixo) → 300 erros (depois)
  ```

- **Bug real encontrado e corrigido por causa desta checagem correta**: `src/pages/TvChannel.tsx`
  chamava `<CurrentBlockInfo block={currentBlock} />` sem passar `viewerCount`, mas a função
  `CurrentBlockInfo({ block })` referenciava `viewerCount` (`TS2304: Cannot find name 'viewerCount'`).
  Isso quebraria em runtime (`ReferenceError`) sempre que um canal estivesse com `block.type === "live"`
  — ou seja, exatamente na tela de consumo ao vivo. Corrigido: `viewerCount` agora é passado como prop
  explícita. Confirmado que os 2 erros correspondentes desapareceram (302 → 300) e que os 1031 testes
  continuam passando após a correção.
- **Os 300 erros restantes são, em sua esmagadora maioria (~290), do mesmo padrão sistêmico
  pré-existente no repositório**: `src/integrations/supabase/types.ts` é gerado por introspecção real
  do banco (`supabase gen types`) e não conhece tabelas/RPCs criadas apenas em migrations ainda não
  aplicadas — nem as desta operação (`tv_*`, `ecclesia_*`, `member_otp_*`, `request_member_login_otp`,
  etc.), nem as de outras tabelas recentes já usadas em código pré-existente não tocado por esta
  operação (`platform_support_audit_logs`, `recommendation_letters`, `campaign_type`, etc., em arquivos
  como `platformSupportAudit.ts`, `recommendationLetters.ts`, `campaignImages.ts`, `Financeiro.tsx`,
  `Membros.tsx`, `Grupos.tsx` e outros nunca alterados nesta operação). Isso é esperado e inerente à
  restrição desta operação de não aplicar migrations: o Codex (ou quem promover as migrations) precisa
  rodar a geração de tipos contra um banco com as migrations aplicadas antes que esse erro desapareça.
  Não é seguro "forjar" esse arquivo de tipos manualmente. Nenhum desses 300 erros indica lógica de
  negócio incorreta no código desta operação — foram inspecionados um a um por arquivo e todos, exceto
  o bug do `TvChannel.tsx` já corrigido, são do padrão "tabela/RPC não existe em `types.ts` ainda".
- Ação recomendada para o Codex: depois de aplicar as 5 migrations novas desta operação (e quaisquer
  outras pendentes), regenerar `src/integrations/supabase/types.ts` e rodar
  `npx tsc --noEmit -p tsconfig.app.json` novamente antes de promover para produção.

Testes novos criados nesta operação:

- `src/config/tvCanalOtpMigrations.test.ts` (28 casos) — espelho byte a byte das 5 migrations novas,
  classificação correta no `migration-manifest.json`, zero `USING(true)`/`WITH CHECK(true)`, RLS em
  toda tabela nova, `SET search_path` em toda função `SECURITY DEFINER`, contrato de segurança do
  OTP (hash, rate limit, uso único, fail-closed), vínculo idempotente TV↔Canal, máquina de estados de
  `status_transmissao`.
- `src/lib/internalMessageMutations.test.ts` (4 casos) — bloqueio de autoconversa, permissão de DM
  entre pessoas distintas, recuperação da thread vencedora em corrida (índice único), reaproveitamento
  da thread canônica existente.
- `src/components/messages/InternalMessageComposer.test.tsx` (5 casos) — ordem de digitação simples,
  composição de IME sem reordenar caracteres, colagem de texto acentuado, envio via Enter com o texto
  exato digitado, Enter ignorado durante composição ativa.
- `src/lib/memberLoginOtp.test.ts` (11 casos) — request/verify/admin-generate cobrindo sucesso, erros
  fail-closed do backend, ausência de sessão fabricada quando a ponte email/token_hash vem
  incompleta, falha de rede tratada como erro explícito.
- `src/pages/Login.test.tsx` (casos adicionados) — formulário de telefone avança mesmo com transporte
  desligado, troca de código válido por sessão real via `verifyOtp`, erro acionável em código
  incorreto sem redirecionar.
- `src/config/hierarchicalAccessResponsibilities.test.ts` — estendido para cobrir as 4 responsabilidades
  novas de TV/Canal no catálogo de `access_responsibility_definitions`.

Total: **1031 testes passando em 58 arquivos**, incluindo toda a suíte pré-existente do repositório
(nenhuma regressão introduzida).

## 17. Passos manuais futuros (fora desta operação)

1. Rewiring do frontend do Canal Eclésia para os `ecclesia_*` reais (remover `canalMockData.ts` do
   caminho de renderização, mantendo-o apenas como fixture de desenvolvimento isolada, se necessário).
2. Implementar `get-r2-upload-url` (Edge Function) para desbloquear upload real de vídeo/replay.
3. Decidir e implementar um "preparo de computador" honesto para o Studio (detecção real de
   OBS/companion, ou remoção da simulação com uma mensagem clara de "não implementado").
4. Configurar um provedor real de WhatsApp/SMS (fora desta operação) e mudar
   `member_otp_settings.transport_mode` para `provider` apenas quando as credenciais existirem.
5. Auditoria dedicada de responsividade mobile de TV/Canal.

## 18. Plano de rollout do WhatsApp (documentado, não implementado)

Ondas sugeridas, todas **desligadas por padrão** e exigindo configuração explícita antes de cada
etapa:

1. Membros da Sede (grupo piloto, teste manual individual via `manual_test`).
2. Congregações relacionadas ao distrito da Sede.
3. Demais distritos.
4. Respectivas congregações.
5. Expansão controlada, sempre com `provider` configurado explicitamente e sem qualquer cron de
   distribuição em massa criado por esta operação.

Nenhum destes passos foi implementado — apenas a máquina de estados (`disabled`/`manual_test`/
`provider`) e a auditoria (`member_otp_admin_audit`) estão prontas para suportá-los quando alguém
decidir avançar.

## 19. Itens que o Codex deve revisar

1. Rewiring pendente do Canal Eclésia (mock ainda no caminho real) — ver §14.1.
2. E-mail-ponte sintético do OTP — aceitação de longo prazo, rotação/expiração do domínio interno.
3. Privilégios de `service_role` na Edge Function `verify-member-login-otp` (criação de conta,
   geração de magiclink) — fronteira de identidade sensível.
4. Studio "Preparar computador" simulado — decidir produto antes de qualquer promoção da TV.
5. Confirmar que as novas capabilities (`tv.*`/`canal.*`/`member_login.otp_test`) não colidem com
   nenhuma convenção de nomenclatura que o Codex esteja padronizando entre operações.
6. Validar contra um banco de staging real (fora do alcance desta sessão) que as 5 migrations novas
   aplicam sem erro na ordem correta, antes de qualquer promoção.

## 20. Confirmações explícitas

- Nenhuma migration foi aplicada em nenhum banco.
- Nenhum `supabase db push`/`migration up`/`db reset` foi executado.
- Nenhum commit, push, PR ou deploy foi executado.
- Nenhum disparo de WhatsApp foi executado ou configurado.
- Nenhum segredo foi gravado no repositório (apenas identificadores públicos de projeto Supabase,
  documentados como não-secretos nos próprios arquivos `.env*.example` já existentes, foram usados
  como variáveis de ambiente efêmeras do processo local para exercitar `npm run build:staging`).
- Nenhum `.env*` foi criado ou alterado.
- `scripts/supabase-guard.mjs`, `scripts/check-environment.mjs`, `scripts/verify-production-bundle.mjs`,
  `scripts/lib/migrationManifest.mjs`, `scripts/lib/supabaseGuardCore.mjs` não foram tocados.
- Nenhuma categoria pré-existente do `supabase/migration-manifest.json` foi alterada — apenas novas
  entradas foram adicionadas às categorias `production_management` (hardening do chat) e
  `staging_feature` (OTP, TV, Canal).
- TV Digital e Canal Eclésia continuam módulos `staging-only` em `src/config/modules.ts` — nenhuma
  mudança de ambiente foi feita.

## 21. Matriz final

| Área | Recurso | Antes | Depois | Backend real | Teste | Pronto para revisão |
| --- | --- | --- | --- | --- | --- | --- |
| TV | Canais/programação/grade | Frontend completo, banco inexistente | Banco completo (RLS+RPCs) | Sim | `tvCanalOtpMigrations.test.ts` | Sim (schema); UI ainda não reauditada a fundo |
| TV | Produção ao vivo (direção/câmeras) | Frontend completo, banco inexistente | Banco completo (RPCs `SECURITY DEFINER`) | Sim | `tvCanalOtpMigrations.test.ts` | Sim (schema); "Preparar computador" continua mock |
| TV↔Canal | Vínculo idempotente | Inexistente | Trigger + lock por organização | Sim | `tvCanalOtpMigrations.test.ts` | Sim |
| Canal | Canais/vídeos/likes/comentários/playlists | Frontend completo, banco inexistente | Banco completo (RLS+RPCs) | Sim | `tvCanalOtpMigrations.test.ts` | Schema sim; **frontend ainda usa mock** — Não |
| Chat | Identidade remetente/destinatário | Bug (auth.users.id como members.id) | Corrigido (frontend + trigger) | Sim | `internalMessageMutations.test.ts` | Sim |
| Chat | Autoconversa/duplicação de thread | Sem proteção | Índice único + trigger | Sim | `internalMessageMutations.test.ts` | Sim |
| Chat | Digitação invertida (IME) | Bug (sync durante composição) | Corrigido (`isComposingRef`) | N/A (frontend) | `InternalMessageComposer.test.tsx` | Sim |
| Login/OTP | Estrutura completa | Inexistente | Schema + RPCs + Edge Function + telas | Sim | `tvCanalOtpMigrations.test.ts`, `memberLoginOtp.test.ts`, `Login.test.tsx` | Sim (teste individual `manual_test`); envio real permanece desligado |
| Login/OTP | Teste administrativo manual | Inexistente | Tela `/admin/login-otp-teste` + RPC + auditoria | Sim | `memberLoginOtp.test.ts` | Sim |
| Capabilities | `tv.*`/`canal.*`/`member_login.otp_test` | Inexistentes | Criadas, documentadas, integradas ao Gerenciador de Acessos | Sim | `hierarchicalAccessResponsibilities.test.ts` | Sim |
