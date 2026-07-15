# Ambientes: Produção × Staging — Ecclesia Online

> Documento de configuração **proposta**. Nenhuma alteração remota (Vercel,
> Supabase ou GitHub) foi feita ao produzir este documento — apenas leitura
> via CLI autenticada e inspeção de arquivos locais. Nenhum segredo é citado
> aqui; apenas nomes de projeto, project refs, domínios e nomes/escopos de
> variáveis, conforme autorizado.

## 0. Ponto de confirmação obrigatória (leia antes do resto)

O comando `supabase projects list` (CLI autenticada) retornou **3** projetos
ativos na conta, não 2:

| Ref | Nome | Observação |
|---|---|---|
| `afxaytvrmgszzigxsbcd` | `xceleiro` | **Sem nenhuma referência neste repositório** (nome, código e scripts não mencionam este projeto) — não é um dos dois ambientes do Ecclesia Online. |
| `qkiiwopkbcslquyfhdec` | `Ecclesia-Admin-Staging` | Nome já identifica como staging. |
| `zsonukpxahaxffugavfu` | `Ecclesia-Admin` | Projeto atualmente **linkado** pela CLI local (`●`); mesmo ref da variável `.env` da raiz e do pull mais recente das variáveis "Production" do Vercel (`.env.vercel.production`, 09/07). |

A instrução original pedia para parar e reportar se aparecessem 3 projetos
ativos. Estou seguindo essa regra literalmente: **este mapeamento é proposto,
não definitivo**, e nenhuma configuração remota deve ser alterada com base
nele sem confirmação explícita do responsável. Dito isso, a evidência para
descartar `xceleiro` como irrelevante ao Ecclesia é forte e verificável (zero
menções no código/scripts, nome de produto totalmente diferente), e a
identificação dos outros dois é consistente em **todas** as fontes
verificadas (ver seção 1).

## 1. Evidências usadas para a identificação

| Fonte | `qkiiwopkbcslquyfhdec` | `zsonukpxahaxffugavfu` | `onywmysaukyzgkzoxtsw` |
|---|---|---|---|
| `supabase projects list` (autenticado) | ✅ existe — nome "Ecclesia-Admin-Staging" | ✅ existe — nome "Ecclesia-Admin", linkado (`●`) | ❌ **não existe** na conta |
| `scripts/seed-*.mjs` (comentários) | ✅ citado explicitamente como "Staging" | — | — |
| `.env` (raiz) | — | ✅ | — |
| `.env.local`, `.env.development.local`, `.env.preview.local` | ✅ | — | — |
| `.env.vercel.production` (pull mais recente, 09/07) | — | ✅ | — |
| `.env.production-check` (pull mais antigo, 27/05 — **obsoleto**) | ✅ (indica que em algum momento anterior a variável de produção esteve mal configurada) | — | — |
| `supabase/config.toml` (`project_id`) | — | — | ✅ |

**Conclusão proposta** (pendente da confirmação do responsável por conta da
regra dos "3 projetos"):

- `SUPABASE_PRODUCTION_REF` = `zsonukpxahaxffugavfu` ("Ecclesia-Admin")
- `SUPABASE_STAGING_REF` = `qkiiwopkbcslquyfhdec` ("Ecclesia-Admin-Staging")
- `OBSOLETE_REPOSITORY_REF` = `onywmysaukyzgkzoxtsw` (`supabase/config.toml` —
  não corresponde a nenhum projeto ativo da conta; não editado nesta tarefa)

`.env.production-check` sugere que, em algum ponto antes de 27/05, o projeto
Vercel de produção esteve configurado apontando para o ref de staging — o
pull mais recente (09/07) já mostra o ref correto. Isso é consistente com o
próprio motivo desta tarefa (mistura histórica de ambientes).

## 2. Vercel — projetos

`vercel project ls` (conta `dinhogoncalves987-sources-projects`) lista, entre
outros, **11 projetos**. O relevante para este repositório (branch
`main`/`revisao-integrada-2026-07-15`, remoto
`dinhogoncalves987-source/ecclesia-online-prod`) é:

| Projeto Vercel | Domínio de produção atual |
|---|---|
| `ecclesia-online` | `https://ecclesiabr.online` |

Não foi encontrado, nesta conta, um segundo projeto Vercel já configurado
como "staging" deste repositório (`ecclesia-admin`/`ecclesia-br-admin` são
projetos Vercel antigos, sem atividade recente — não confirmados como o
staging atual deste código). **Ação pendente**: criar/confirmar um projeto
Vercel dedicado a staging antes de publicar a branch `staging` proposta.

### 2.1 Proposta — Projeto Vercel de Produção

- Branch: `main`
- Domínio: `ecclesiabr.online` (oficial)
- Variáveis: ver `.env.production.example` (Production environment)
- Supabase: `zsonukpxahaxffugavfu` (proposto)
- Build Command recomendado: `npm run build:production` (chama
  `scripts/check-environment.mjs` antes de `vite build --mode production`)
- `VERCEL_ENV` esperado: `production`

### 2.2 Proposta — Projeto Vercel de Staging

- Branch: `staging` (a criar — não existe ainda neste repositório;
  `staging-tv-canal` permanece como branch histórica de referência, não deve
  ser reaproveitada nem apagada)
- Domínio: um subdomínio/domínio dedicado, diferente do oficial (ex.:
  `staging.ecclesiabr.online` ou domínio `*.vercel.app` do próprio projeto)
- Variáveis: ver `.env.staging.example` (Preview e/ou Custom Environment
  "staging")
- Supabase: `qkiiwopkbcslquyfhdec` (proposto)
- Build Command recomendado: `npm run build:staging`
- `VERCEL_ENV` esperado: `preview` (ou o Custom Environment dedicado, se
  criado)

### 2.3 Variáveis Vercel observadas (nomes, sem valores)

A partir dos pulls locais de "Production" já existentes no workspace
(`.env.vercel.production`, mais recente; `.env.production-check`, obsoleto —
ambos devem ser removidos do índice Git e ignorados, nunca lidos por
`vercel env pull` nesta tarefa), os **nomes** de variáveis observados no
projeto Vercel incluem:

`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`,
`VITE_ENABLE_LEGACY_CHURCH_SCOPE_FALLBACK`, `R2_ACCESS_KEY_ID`, `R2_BUCKET`,
`R2_ENDPOINT`, `R2_PUBLIC_URL`, `R2_SECRET_ACCESS_KEY` (armazenamento externo
de mídia), além das variáveis automáticas da própria Vercel
(`VERCEL_ENV`, `VERCEL_GIT_COMMIT_REF`, `VERCEL_OIDC_TOKEN`, etc.).

`vercel env ls` direto (nomes/escopos, sem valores) não pôde ser executado
nesta sessão: o comando requer o diretório local vinculado a um projeto
(`.vercel/project.json`, ausente) e o passo de vinculação (`vercel link`) foi
tratado como mutação de estado local que exige aprovação explícita — não
executado automaticamente. **Ação pendente**: o responsável pode rodar
`vercel link` + `vercel env ls` manualmente para confirmar nomes/escopos
diretamente no painel.

Recomenda-se adicionar, apenas como variáveis de build (não `VITE_`, nunca
expostas ao bundle do frontend, usadas só por `scripts/check-environment.mjs`):
`SUPABASE_PRODUCTION_REF`, `SUPABASE_STAGING_REF`, `OFFICIAL_PRODUCTION_DOMAIN`
— ver `.env.staging.example` / `.env.production.example`.

## 3. Supabase — separação completa

| Item | Produção (`zsonukpxahaxffugavfu`) | Staging (`qkiiwopkbcslquyfhdec`) |
|---|---|---|
| Auth Site URL | `https://ecclesiabr.online` | domínio de staging (diferente do oficial) |
| Auth Redirect URLs | somente rotas do domínio oficial (`/reset-password`, `/admin?entry=1`, `/convite-membro/*`, etc.) | somente rotas do domínio de staging |
| Storage | buckets próprios do projeto de produção | buckets próprios do projeto de staging — **nenhum dado real copiado** |
| Edge Functions | implantadas separadamente no projeto de produção | implantadas separadamente no projeto de staging |
| Secrets (service_role, chaves externas) | exclusivos do projeto de produção | exclusivos do projeto de staging |
| CORS origins | apenas o domínio oficial | apenas o(s) domínio(s) de staging/preview |
| Dados/PII | dados reais de igrejas | **nenhuma cópia de PII de produção** — apenas dados demo fixos (ver `RELATORIO_CLASSIFICACAO_MIGRATIONS.md`, categoria C) |

Nenhuma dessas configurações foi alterada nesta tarefa — é uma checklist para
configuração manual futura no painel do Supabase de cada projeto.

### 3.1 Workdirs e vínculos seguros da CLI

Existem somente **dois bancos**, cada um com seu próprio workdir e seu próprio
arquivo local de vínculo da CLI:

| Ambiente | Banco | Workdir da CLI | Conteúdo permitido |
|---|---|---|---|
| Staging/teste | `qkiiwopkbcslquyfhdec` | raiz do repositório (`supabase/`) | migrations e seeds de teste, classificados no manifesto |
| Produção | `zsonukpxahaxffugavfu` | `supabase-production/` | somente migrations de produção revisadas individualmente; nunca seed/demo |

O diretório `supabase-production/` não é um terceiro projeto. Ele apenas
impede que a CLI enxergue as migrations históricas do staging quando estiver
conectada ao banco real. O projeto não relacionado `xceleiro` permanece fora
dos dois workdirs e é recusado pelo guard.

`config.toml#project_id` identifica somente o projeto local dos containers; o
banco remoto usado por `--linked` fica no `.temp/project-ref` do respectivo
workdir depois de `supabase link`. O wrapper verifica esse arquivo antes de
qualquer consulta ou escrita.

O histórico de produção começa em
`20260715170000_production_baseline_marker.sql`. A reconciliação real foi
executada manualmente antes dela e retornou `ok=true`. A marcadora não repete
a correção: contém somente consultas de catálogo e exceções fail-closed para
validar `super_admins`, RLS, autoridade raiz, proteção de `profiles`, convites
e remoção das funções inseguras. Se qualquer garantia estiver ausente, a
transação falha e o baseline não é registrado.

A ação excepcional `baseline` exige simultaneamente:

1. alvo `production` explícito;
2. vínculo do workdir exatamente com `zsonukpxahaxffugavfu`;
3. confirmação literal `BASELINE_PRODUCTION_20260715`;
4. exatamente um SQL no workdir: a migration-marcadora;
5. preflight `--dry-run` aprovado antes do envio.

`push` e `up` genéricos continuam bloqueados em produção. Toda migration
futura deverá ser criada no workdir de produção e ganhar uma autorização
controlada própria após revisão; o baseline não serve como autorização
permanente.

## 4. GitHub — proposta de proteção

Repositório: `dinhogoncalves987-source/ecclesia-online-prod`.

- Branch `main`: protegida, PR obrigatório, checks obrigatórios
  (`npm run build`, `npx tsc --noEmit`, `npm test -- --run`, `npm run lint`),
  sem push direto.
- Ambiente do GitHub `production`: aprovação manual obrigatória antes do
  deploy consumir os secrets de produção.
- Branch `staging` (a criar): ambiente do GitHub `staging` separado, sem
  aprovação manual (fluxo mais rápido para iteração).
- `staging-tv-canal`: mantida como está — branch histórica de referência até
  a restauração controlada do TV Digital/Canal Ecclésia na nova `staging`
  (ver seção 5). Não reutilizar como a branch `staging` nem apagar.

Nenhuma dessas proteções foi configurada remotamente nesta tarefa (requer
acesso de administração do repositório no GitHub, fora do escopo desta
execução local).

## 5. TV Digital / Canal Ecclésia — stage-only, restauração futura

TV Digital e Canal Ecclésia pertencem ao produto e continuam preservados
integralmente na branch histórica `staging-tv-canal`. Nesta integração
(`revisao-integrada-2026-07-15`) **nenhum arquivo foi copiado** dessa branch
— apenas os identificadores de módulo (`tv-digital`, `canal-ecclesia`) foram
registrados em `src/config/modules.ts` como `availability: "staging"`, para
que a allowlist já os classifique corretamente quando forem restaurados.

Procedimento de restauração proposto (a executar depois da revisão do
Alfred/Codex, fora desta tarefa):

1. Criar a nova branch `staging` a partir de `main` (ou da branch de
   integração aprovada).
2. Trazer o código de TV Digital/Canal Ecclésia de `staging-tv-canal` para a
   nova `staging` de forma controlada (cherry-pick/merge revisado dos
   commits relevantes — não um merge cego da branch inteira).
3. Se a restauração tiver sido feita anteriormente via um commit de revert
   (mencionado no contexto desta tarefa), desfazer esse revert de forma
   controlada (`git revert <hash-do-revert>`), nunca reescrevendo histórico.
4. Adicionar as rotas/menu correspondentes em `App.tsx`/`AdminLayout.tsx`
   envolvidas em `<ModuleGate moduleId="tv-digital">` /
   `moduleId="canal-ecclesia"` — o registro em `src/config/modules.ts` já
   está pronto para isso.
5. Validar em staging antes de considerar qualquer promoção futura para
   produção (que exigiria adicionar esses módulos à allowlist de produção
   explicitamente, com aprovação).

## 6. Resumo do fluxo proposto

```
main (produção)                    staging (a criar) / staging-tv-canal (histórica)
   │                                        │
   ├─ Vercel: projeto produção              ├─ Vercel: projeto staging
   │   VITE_APP_ENV=production              │   VITE_APP_ENV=staging
   │   domínio oficial                      │   domínio diferente do oficial
   │   Supabase produção                    │   Supabase staging
   │   workdir: supabase-production/        │   workdir: supabase/
   │                                        │
   └─ scripts/check-environment.mjs         └─ scripts/check-environment.mjs
       bloqueia build se ref/branch/            bloqueia build se ref/domínio
       domínio não forem os de produção          coincidir com produção
```
