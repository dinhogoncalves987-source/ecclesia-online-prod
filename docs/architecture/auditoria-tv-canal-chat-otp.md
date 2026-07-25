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

---

# OPERAÇÃO FINAL — Finalização real (branch `handoff/sonnet-finalizacao-tv-canal-chat-20260724`)

Continuação desta auditoria, a partir do checkpoint `handoff/sonnet-auditoria-tv-canal-chat-otp-20260724`
(commit `a78c992`, worktree limpo). Esta seção documenta apenas o que foi feito **nesta segunda
sessão** — a Parte 1 acima permanece válida e não foi reescrita.

## 22. VPS — estado, backup e correção real de autenticação RTMP

**Estado encontrado:** MediaMTX v1.19.2 rodando em Docker (`ecclesia-mediamtx`,
`bluenviron/mediamtx:latest-ffmpeg`), sem qualquer autenticação — publish RTMP era aceito
anonimamente por qualquer um que soubesse o IP e o path.

**Backup:** `docker-compose.yml` e `mediamtx.yml` originais copiados para
`/opt/backups/20260724_231652/` na própria VPS antes de qualquer alteração.

**Hardening aplicado:**
- `authInternalUsers` configurado em `mediamtx.yml`: publish exige `user`/`pass` fortes
  (gerados aleatoriamente na própria VPS, nunca neste chat); leitura (HLS/RTSP) continua aberta
  por ser o objetivo público do produto.
- **Bug real encontrado e corrigido**: o valor das credenciais em `mediamtx.yml` estava escrito
  como `${MTX_PUBLISH_USER}`/`${MTX_PUBLISH_PASSWORD}`, no padrão de variável de ambiente do
  Docker Compose — mas o MediaMTX **não expande variáveis de ambiente em campos arbitrários do
  YAML** (essa sintaxe só existe para variáveis passadas a comandos `runOnXxx`, conforme o
  `mediamtx.yml` de referência oficial do próprio binário v1.19.2). Na prática, o usuário/senha
  configurados eram literalmente as strings `${MTX_PUBLISH_USER}`/`${MTX_PUBLISH_PASSWORD}` —
  por isso toda tentativa de publish autenticado falhava com `authentication failed`,
  independentemente do formato da URL (`user:pass@host` ou `?user=&pass=`), e até a própria API
  local (`:9997`) com as credenciais corretas retornava 401.
- **Correção**: criado `/opt/ecclesia-studio/mediamtx.yml.template` (com os placeholders) e
  `/opt/ecclesia-studio/render-config.sh`, que lê `.env` e usa `envsubst` para gerar o
  `mediamtx.yml` final com os valores reais substituídos **inteiramente no servidor** — em
  nenhum momento os valores passaram por este chat. `docker-compose.yml` não precisou mudar para
  isso (o `.env` já era carregado via `env_file`).
- **Teste real, executado por script transferido à VPS (nunca inline), lendo credenciais só no
  servidor, sem nunca imprimir os valores**:
  - Publish anônimo → **recusado** (`Conversion failed!` no FFmpeg do lado cliente).
  - Publish autenticado via `rtmp://127.0.0.1:1935/live/<id>?user=<u>&pass=<p>` (URL-encoded) →
    **aceito**: log do MediaMTX mostra `stream is available and online` e
    `is publishing to path 'live/<id>'`.
  - FFmpeg confirmado **continuamente transmitindo** (checado às ~6s e novamente às ~9s).
  - HLS do **mesmo** `liveSessionId` → `HLS_STATUS:200` nas duas checagens.
  - Reexecutado com sucesso idêntico após o passo de fixação de versão abaixo (§23), confirmando
    que a correção não dependia do digest antigo.
- Formato de URL confirmado como correto pela documentação oficial do MediaMTX: `user`/`pass`
  como parâmetros de query (`?user=...&pass=...`), não `user:pass@host`.

## 23. Fixação de versão do MediaMTX

`docker-compose.yml` alterado de `image: bluenviron/mediamtx:latest-ffmpeg` (tag mutável) para
`image: bluenviron/mediamtx@sha256:08c837deb7bac85d509e2a4c2737308e5a34f8f084a46a0d8793cdb0579a6e5d`
(digest imutável do mesmo v1.19.2 já em produção na VPS, confirmado via `docker exec ... --version`
depois de recriar o container). Comentário no arquivo documenta a versão e a data. Container
recriado e reconfirmado com o mesmo teste RTMP→HLS do §22 (sucesso).

## 24. HTTPS via Caddy

- Caddy 2.11.4 instalado via repositório oficial (`dl.cloudsmith.io/public/caddy`).
- `Caddyfile` criado em `/etc/caddy/Caddyfile`: proxy reverso transparente de
  `live.ecclesiabr.online` → `127.0.0.1:8888` (HLS do MediaMTX), com `encode gzip` e log JSON
  próprio.
- Porta 443 liberada no `ufw` (porta 22 nunca foi tocada). Serviço `caddy` habilitado
  (`systemctl enable`) e ativo (`systemctl is-active` → `active`).
- **Bloqueio real, fora do controle desta operação**: `live.ecclesiabr.online` **não resolve**
  para `134.209.208.169` (NXDOMAIN confirmado via consulta DNS e também pelo próprio Caddy ao
  tentar o desafio ACME `tls-alpn-01`: `DNS problem: NXDOMAIN looking up A for
  live.ecclesiabr.online`). Sem acesso ao provedor de DNS do domínio `ecclesiabr.online`, não é
  possível criar o registro A. **IMPLEMENTADO, MAS NÃO HOMOLOGADO NO SERVIÇO REAL** — assim que o
  DNS apontar para a VPS, o Caddy já em execução obtém o certificado Let's Encrypt sozinho (ele já
  está em loop de retry a cada 60s, por até 30 dias, sem qualquer ação manual adicional) e
  `https://live.ecclesiabr.online/live/<id>/index.m3u8` passa a funcionar sem nenhuma mudança de
  código. Ação necessária do responsável pelo domínio: criar registro `A live.ecclesiabr.online →
  134.209.208.169` (e opcionalmente `AAAA`, se o domínio usar IPv6, o que não é o caso desta VPS).

## 25. Edge Functions — recuperadas/implementadas com hardening novo

Todas em `supabase/functions/`, nenhuma publicada remotamente (só existem no worktree):

- **`validate-tv-stream-key`**: chamada pelo MediaMTX via futuro `authHTTPAddress` (webhook).
  Autenticação por segredo compartilhado (`MEDIAMTX_WEBHOOK_SECRET`) — não por JWT de usuário, já
  que quem chama é a VPS. Nunca recebe a stream key em texto puro para além do próprio handshake;
  calcula o hash SHA-256 e delega toda a lógica crítica (lookup + criação/atualização de sessão) à
  RPC transacional `validate_and_start_tv_stream` (nova, `FOR UPDATE`), eliminando a corrida entre
  "achar a chave" e "criar a sessão" que existiria com múltiplas queries soltas. Resposta nunca
  revela o motivo exato da negação ao chamador (evita enumeração).
- **`update-tv-heartbeat`**: mesmo padrão de segredo compartilhado; delega à RPC
  `update_live_session_heartbeat`, que nunca reativa uma sessão já `ended`.
- **`get-r2-upload-url`**: reescrita com mudança de contrato de segurança — o cliente **não
  escolhe mais bucket/path livremente** (gap real da versão histórica). Agora envia só um
  `purpose` de uma lista fechada (`canal-video`, `canal-thumbnail`, `tv-recording`, `tv-asset`);
  bucket, prefixo, capability exigida (`canal.manage`/`tv.manage`), tipo de conteúdo permitido e
  tamanho máximo são decididos **no servidor**. Exige usuário autenticado + `has_org_access_permission`
  antes de assinar qualquer coisa; assinatura AWS SigV4 (presigned PUT) implementada localmente
  (Web Crypto, sem dependências externas); falha fechada (503 `r2_not_configured`) se as
  variáveis R2 não estiverem definidas — nunca gera URL "mock". `src/lib/r2Upload.ts` e
  `src/lib/canalEcclesia.ts::uploadVideoToR2` atualizados para o novo contrato (`purpose` em vez
  de `bucket`/`path`; `buildR2Path`/`getR2BucketForFile` removidos por não serem mais necessários).
- **`create-livekit-room`** / **`create-livekit-token`** / **`end-livekit-room`**: recuperadas de
  `staging-tv-canal` com 3 correções de segurança:
  1. `create-livekit-room`/`end-livekit-room` agora chamam as RPCs (`create_tv_studio_room`,
     `end_live_production`) com o **contexto do próprio usuário** (JWT repassado), não mais
     `service_role` — a checagem de capability dentro da RPC (`auth.uid()`) volta a valer de
     verdade em vez de ser contornada pelo uso de service role.
  2. `create-livekit-token`, papel câmera: a versão histórica aceitava qualquer
     `cameraSessionId` "anônimo" e emitia token sem checar nada — fechado: agora exige que o
     `cameraSessionId` já exista em `tv_camera_sessions` (criado só pela RPC autenticada e
     validada `join_production_as_camera`) **e** pertença ao mesmo usuário autenticado que está
     chamando esta função — nunca mais um usuário pode assumir a câmera de outro só sabendo o
     UUID da sessão.
  3. Sem LiveKit configurado, retorna `{ mock: true, token: null }` com mensagem explícita — nunca
     um token funcional fabricado.
- `supabase/config.toml` atualizado: `verify_jwt = false` só para as duas funções chamadas pela
  VPS (`validate-tv-stream-key`, `update-tv-heartbeat`); `verify_jwt = true` (defesa em
  profundidade) para as 4 chamadas pelo navegador do usuário.

## 26. Migration nova (incremental, não aplicada)

`supabase/migrations/20260803000000_tv_streaming_operational_rpcs.sql` (espelhada byte-a-byte em
`supabase-production/supabase/migrations/`, registrada em `supabase/migration-manifest.json` sob
`staging_feature`, mesma categoria das migrations TV/Canal anteriores). Cria 4 RPCs
`SECURITY DEFINER` novas, todas com `SET search_path` e `REVOKE ALL ... GRANT` explícito:
- `validate_and_start_tv_stream(hash, source_type, hls_url, rtmp_url)` — `service_role` apenas.
- `stop_tv_stream_by_session(session_id)` — `service_role` apenas (pronta para um futuro hook
  `on_publish_done` do MediaMTX; não é chamada por nada ainda).
- `update_live_session_heartbeat(session_id, viewer_count)` — `service_role` apenas.
- `check_stale_tv_live_sessions()` — `service_role` apenas; marca `error` sessões `live` sem
  heartbeat há mais de 90s. Não agenda nenhum cron (pg_cron) — fica pronta para o Codex agendar.
Nenhuma migration já existente foi reaberta ou editada.

## 27. Remoção de falso sucesso — "Preparar computador"

Removido o padrão `await new Promise(setTimeout) → setPrepState("success")` (sucesso fabricado
por timeout, sem verificar nada) em dois lugares:
- `src/pages/admin/TvConfiguracoes.tsx` (`handlePrepareComputer`)
- `src/components/tv/EcclesiaStudio.tsx` (`handleStudioPrepare`)

Em ambos, o estado agora só vira `success` quando `obs.connected` (estado real do
`useObsWebSocket`, que já faz o handshake WebSocket de verdade contra `ws://localhost:4455`) fica
`true`, e só vira `error` quando o próprio hook esgota as tentativas de reconexão
(`obs.error` populado). Textos da UI ajustados para não prometerem "instalação" que um navegador
não pode de fato realizar — a tela agora diz claramente que está "procurando" o Ecclesia Studio já
aberto no computador, nunca que está instalando algo.

## 28. Canal Eclésia — remoção de mock do fluxo operacional

Delegado a um subagente nesta mesma sessão (mesmo worktree, sem commit):
[Remove Canal Eclésia mock data from real routes](5e06e02d-0d6d-4119-ba34-1a17971dc6ab). Resultado
**confirmado de forma independente por grep direto no código-fonte** ao final desta sessão (não
apenas relatado pelo subagente): `rg canalMockData src` não retorna nenhum resultado fora do
próprio `src/lib/canalMockData.ts`, e `rg "isOfficialChannel|OfficialBadge" src` também só bate no
arquivo mock — nenhuma referência pendente.

Arquivos alterados pelo subagente:
- **`src/pages/VideoPlayer.tsx`** — vídeo, canal, relacionados e comentários agora vêm de
  `fetchVideoById`, `fetchEcclesiaChannels`, `fetchComments` e da nova `fetchRelatedVideos`;
  removido o bloco de "comentários mock para visitante deslogado" e o fallback para mock em caso
  de erro de fetch (agora mostra estado de erro/vazio real).
- **`src/pages/CanalMyChannel.tsx`** — antes 100% mock; agora busca os canais reais da organização
  (`fetchEcclesiaChannels`) e os vídeos reais do canal ativo (`fetchAdminVideos`), com skeletons de
  carregamento e estado vazio honesto ("você ainda não tem canal → Criar canal").
- **`src/pages/CanalHome.tsx`** — já buscava dados reais como caminho principal; removido o
  fallback para mock (resultados reais, por mais escassos que sejam, aparecem como são, com o CTA
  de estado vazio já existente).
- **`src/pages/CanalChannel.tsx`** — removido o fallback de canal/vídeos mock; um canal não
  encontrado agora mostra corretamente "Canal não encontrado" em vez de dado fabricado.
- **`src/components/canal/CanalComponents.tsx`** — removidos `isOfficialChannel`/`OfficialBadge`,
  conceito que só existia no mock (o schema real de `ecclesia_channels` não tem uma coluna
  "oficial/verificado" — documentado como limitação, não fabricado).

Função nova em `canalEcclesia.ts`: `fetchRelatedVideos(organizationId, currentVideoId, category,
limit)`, substituindo `getMockRelated` por uma consulta Supabase real (prioriza mesma categoria,
com fallback por contagem de visualizações; retorna lista vazia honestamente quando não há
conteúdo suficiente).

`src/lib/canalMockData.ts` permanece no repositório apenas como arquivo isolado, sem nenhuma
importação — pode ser removido em uma limpeza futura ou mantido como fixture de teste; não
representa mais risco de vazar dado fabricado para o usuário final.

**Limitação declarada pelo próprio subagente**: não foi possível rodar
`npx tsc --noEmit -p tsconfig.app.json` nestes arquivos (mesma indisponibilidade de shell desta
sessão). Compensado com revisão manual de imports/tipos/JSX de cada arquivo alterado; o
`tsconfig.app.json` do projeto usa `strict: false`/`noImplicitAny: false`/`noUnusedLocals: false`,
o que reduz o risco de erro de compilação não detectável por revisão manual — mas isso **precisa
ser confirmado por execução real do `tsc`** antes de qualquer promoção, junto com o restante da
lista do item 11.

## 29. Limitação honesta desta sessão — ambiente de shell indisponível

Na segunda metade desta sessão, a ferramenta de execução de shell local (usada para
`git`, `npx vitest`, `npx tsc`, `npx eslint`, `npm run build`, e para todo comando SSH/`scp`
adicional contra a VPS) parou de responder de forma persistente (múltiplas tentativas, com esperas
crescentes de até 60s, todas sem retorno). Isso significa que, a partir do ponto em que a VPS já
estava com RTMP/HLS confirmados e o Caddy já instalado (§22–24), **não foi possível**:
- rodar novamente comandos SSH adicionais contra a VPS (o último estado real confirmado é o
  descrito nas seções acima);
- rodar `npx vitest run`, `npx tsc --noEmit -p tsconfig.app.json`, `npx eslint`,
  `git diff --check`, `npm run build:staging`, `npm run build:production` ou
  `scripts/verify-production-bundle.mjs` nesta sessão após esse ponto;
- criar a branch `handoff/sonnet-finalizacao-tv-canal-chat-20260724` via `git switch -c` (o
  checkpoint inicial desta operação foi verificado por texto/transcript antes da indisponibilidade,
  mas o comando de criação da branch em si depende do shell).

Todo o trabalho de código (Edge Functions, migration nova, correções de frontend, remoção de mock)
foi feito e salvo em disco via ferramentas de arquivo (Read/Write/StrReplace/Grep), que não
dependem do shell e continuaram funcionando normalmente — mas **nenhum destes itens foi
revalidado por teste/compilação/build nesta sessão**. Isto é reportado aqui em vez de omitido:
qualquer pessoa que retomar este trabalho (Codex ou outro agente) deve, como primeiro passo, rodar
a lista de validação da OPERAÇÃO FINAL (item 11 do prompt original) antes de confiar que o código
novo compila e passa nos testes. Pelo desenho do código (TypeScript com tipos explícitos, sem uso
de `any` novo além do padrão já existente no arquivo, seguindo exatamente as mesmas convenções de
Edge Functions já existentes no repositório), a expectativa é de que compile, mas isso precisa ser
confirmado por execução real antes de qualquer promoção.
