# Contrato dos quatro domínios institucionais

> Ecclesia Online — arquitetura compartilhada entre Secretaria, Discipulado, Teologia e Missões.
> Criado na OPERAÇÃO 1 (Fundação compartilhada + Secretaria). Este documento é o contrato que as
> três operações seguintes (Discipulado, Teologia, Missões) devem seguir. Nenhuma delas foi
> implementada ainda — este documento define apenas o que já existe e o que elas devem reutilizar.

## 1. Identidade central

Uma pessoa existe **uma única vez** no sistema: a linha em `public.members`. Não existe (e as
operações futuras não devem criar) tabela de "pessoa da Secretaria", "aluno de Discipulado",
"aluno de Teologia" ou "missionário". Esses são **papéis/participações/vínculos** que se
referenciam a `members.id` — nunca uma nova pessoa.

`members` já resolve, desde antes desta operação:

- Dados pessoais, contato, endereço(s) (`member_addresses`), família/dependentes (`member_family`).
- Identificadores: `member_code` (Ecclesia), `legacy_code`/`legacy_registration`/`legacy_source`
  (WinTechi).
- Pessoa **pode existir sem login**: `members.user_id` é opcional (nullable, com índice único
  parcial `(organization_id, user_id) WHERE user_id IS NOT NULL`). Um dependente ou visitante pode
  ser cadastrado, ganhar histórico e, mais tarde, receber um convite (`member_invites`) que vincula
  seu `user_id`.

**Regra para Discipulado/Teologia/Missões:** ao registrar "aluno", "discipulador",
"professor", "missionário" etc., **procure/reaproveite uma linha existente em `members`** (pela
pessoa física) e crie apenas a matrícula/participação específica do módulo, referenciando
`member_id`. Nunca duplique nome/CPF/contato em uma tabela nova.

## 2. Pessoa × usuário autenticado

```
auth.users ──1:1── profiles (login: nome, avatar, platform_role)
                       │
                 organization_users (vínculo org + role operacional)
                       │
        members.user_id (ponte OPCIONAL, nullable) ── members (pessoa pastoral)
```

`profiles`/`organization_users` representam a **conta**; `members` representa a **pessoa**. Um
membro sem `user_id` continua tendo cadastro, endereço, família, histórico — só não acessa o
sistema. Isso é o que permite cadastrar crianças/dependentes sem consumir vaga de usuário ativo.

## 3. Organizações

Hierarquia única: `public.organizations` (`parent_id` self-FK; `organization_type` texto livre —
`matriz`/`setor`/`subsede`/`congregacao`/convenções). Toda associação de pessoa a domínio deve
usar `organization_id` apontando para essa mesma tabela — **nunca** recriar "igreja",
"matriz" ou "unidade" em outro lugar.

Autorização por capacidade (não por role fixo): `public.has_org_access_permission(user_id,
organization_id, permission_key)`, alimentada por `access_responsibility_definitions` +
`organization_responsibles`, com herança hierárquica via
`is_organization_descendant_or_self()`. Toda nova policy de domínio deve usar essa função — nunca
`has_org_role()` com strings soltas (`'admin'` não existe como role real hoje).

## 4. Histórico institucional compartilhado — `member_history`

Toda pessoa tem **uma única timeline**: `public.member_history`. Cada linha registra:

| Campo | Sentido |
|---|---|
| `history_type` | catálogo fechado (cadastro, admissão, batismo, mudança de situação/congregação/setor/organização, nomeação, encerramento de função, ordenação, transferência, ocorrência, documento/credencial/carta/certificado emitido, registro importado, outro) |
| `occurred_at` vs `recorded_at` | data do acontecimento × data em que foi digitado no sistema (essencial para importação legada retroativa) |
| `source_module` | `secretaria` \| `discipulado` \| `teologia` \| `missoes` \| `sistema` — **quem originou o evento** |
| `source_table` + `source_id` | aponta para o registro especializado (ex.: `member_occurrences`/`id`) quando existir — evita "texto livre" quando a informação já tem estrutura própria |
| `document_id` | referência a `public.documents` já existente (não duplica sistema de arquivos) |
| `attachment_path` | quando o anexo é privado/pessoal, reaproveita o MESMO bucket `member-documents` já usado pelo documento civil do membro |
| `visibility` | `normal` \| `confidential` |
| `legacy_source`/`legacy_module`/`legacy_code` | origem WinTechi; a idempotência da timeline inclui também tipo do evento e registro especializado, evitando colisão entre fatos diferentes da mesma ficha |

### Ponto de extensão único: `register_member_history_event()`

```sql
public.register_member_history_event(
  p_member_id, p_history_type, p_title, p_description, p_occurred_at,
  p_source_module, p_source_table, p_source_id, p_document_id, p_attachment_path,
  p_visibility, p_legacy_source, p_legacy_module, p_legacy_code
) RETURNS uuid
```

Esta é a **única porta interna do banco** para gravar na timeline. Ela não tem `EXECUTE` para
`authenticated`: expor uma RPC genérica ao navegador permitiria forjar `source_module`,
`source_table` e tipos de evento. A Secretaria já a usa por triggers nas tabelas
`member_occurrences`/`member_ordinations`/`member_transfers`/`members`. **Discipulado, Teologia e
Missões devem chamá-la por triggers ou RPCs específicas de domínio**, nunca diretamente pelo
frontend e nunca criando uma segunda timeline. A função:

- Resolve a organização efetiva do membro (`COALESCE(congregation_id, sector_id, organization_id)`).
- Exige `members.write` quando o trigger/RPC de domínio foi iniciado por usuário autenticado.
- Exige adicionalmente `members.confidential` quando `visibility = 'confidential'`.
- **Não bloqueia contexto de backend/service_role** (`auth.uid() IS NULL`) — é assim que a futura
  importação em lote do WinTechi poderá rodar sem burlar RLS nem exigir uma exceção "authenticated
  pode tudo".

Não existe (propositalmente) uma tabela `events`/`activities` genérica com payload livre — isso
seria o "motor genérico universal" que o contrato proíbe. `member_history` tem colunas tipadas
específicas; o que precisa de estrutura própria (ocorrência, ordenação, transferência) tem sua
própria tabela e referencia a timeline via `source_table`/`source_id`.

## 5. Documentos compartilhados

Reaproveitados sem alteração:

- `public.documents` (documentos institucionais da organização) — histórico/ocorrências/ordenações/
  transferências podem referenciar `document_id`.
- Bucket privado `member-documents` (já usado pelo documento civil do membro) — reaproveitado para
  anexos pessoais de eventos da timeline via `attachment_path` (mesmo padrão de path
  `{organization_id}/{member_id}/...`).

Nenhum novo sistema de upload, bucket ou tabela de arquivos foi criado.

## 6. Confidencialidade

Nova capability: **`members.confidential`** (`src/lib/accessControl.ts` +
`access_responsibility_definitions.permission_keys`). Concedida hoje **apenas** a quem já tem
todas as permissões de governança (`church_admin`, `responsible_pastor`) — Secretário(a)/
Subsecretário(a)/Operador de membros (que têm `members.read`/`members.write`) **não** veem
ocorrências/histórico marcados como `confidential`, nem no banco (RLS) nem no frontend
(`hasCapability("members.confidential")`).

Isso vale hoje para `member_history` e `member_occurrences`. Ordenações e transferências não têm
confidencialidade própria (são dados institucionais já públicos dentro da organização, como
`members.member_role`/`administrative_role`).

## 7. Origem legada (WinTechi)

Todas as tabelas novas desta fundação têm `legacy_source`, `legacy_module`, `legacy_code`.
Nas tabelas especializadas, a chave inclui organização, origem, módulo e código. Na timeline, inclui
também tipo do evento e referência especializada, pois a mesma ficha pode produzir legitimamente
mais de um fato (por exemplo, nomeação e encerramento).
Isso garante que uma futura importação em lote:

- Preserve sistema/módulo/código de origem.
- Nunca duplique o mesmo registro (idempotência por índice único, não por lógica de aplicação).
- Rode em contexto de service_role sem exigir usuário autenticado (ver seção 4).

A importação em si **não foi implementada** nesta operação — apenas a estrutura que a suporta.

## 8. O que cada domínio deve reutilizar (e o que não deve duplicar)

| Reutilizar sempre | Nunca duplicar |
|---|---|
| `public.members` (pessoa) | Nova tabela de "aluno"/"professor"/"missionário" como pessoa |
| `public.organizations` + `has_org_access_permission()` | Hierarquia de igreja/unidade paralela |
| `public.documents` + bucket `member-documents` | Novo sistema de upload/arquivos |
| `public.member_history` + `register_member_history_event()` por trigger/RPC específica | Timeline própria do módulo ou chamada genérica pelo navegador |
| `public.recommendation_letters` (Cartas) | Nova tabela de "carta" |
| Financeiro existente (`finance_*`) — **Teologia/Missões usarão no futuro, com identificação de origem/contexto/centro de custo** | Tabela financeira paralela |
| Capabilities existentes (`ACCESS_PERMISSION_KEYS`) — criar UMA nova capability por necessidade real comprovada (ex.: `members.confidential`) | Checagem de role hardcoded no frontend |

## 9. Contratos mínimos que Discipulado/Teologia/Missões podem consumir hoje

1. **Identificação da pessoa**: `members.id` (busca por nome/CPF/telefone/código já existe em
   `src/lib/memberSearch.ts`).
2. **Organização relacionada**: `organizations.id` + `has_org_access_permission()`.
3. **Origem do módulo**: enum `source_module` já inclui `discipulado`/`teologia`/`missoes` — pronto
   para uso, sem migration adicional.
4. **Registrar evento na timeline**: a tabela especializada do domínio deve possuir trigger que
   chama `register_member_history_event()`; se houver ação do navegador, exponha uma RPC específica
   e validada para aquela ação. Não existe wrapper genérico no frontend.
5. **Metadados legados**: `legacy_source`/`legacy_module`/`legacy_code` com idempotência por índice
   único — o padrão a copiar em qualquer tabela nova desses módulos.
6. **Confidencialidade e auditoria**: `visibility` + `created_by` + `created_at`/`updated_at` — o
   padrão a copiar.

Nenhuma tela, rota ou tabela funcional de Discipulado/Teologia/Missões foi criada nesta operação —
apenas os pontos de extensão acima, já testados e em uso real pela Secretaria.

## 10. Extensões reais criadas pela Operação 2 (Discipulado)

> Esta seção só registra o que a Operação 2 efetivamente criou sobre o contrato acima. As decisões
> da Operação 1 (seções 1–9) não foram alteradas. Detalhe completo em
> `docs/architecture/operacao-2-discipulado.md`.

- **Catálogo de `member_history.history_type` estendido** (migration
  `20260729120000_discipleship_permissions_and_history.sql`, nunca reabrindo a migration original da
  Op. 1): 5 novos marcos genéricos — `matricula`, `inicio_formacao`, `conclusao_formacao`,
  `desligamento_formacao`, `transferencia_turma`. Nomeados de propósito para Teologia reutilizar sem
  nova migration de catálogo.
- **`source_module = 'discipulado'`** passou de valor previsto no enum para valor real em uso — todo
  evento de matrícula/formação chega à timeline por um trigger dedicado
  (`_discipleship_enrollments_register_history`), nunca chamando `register_member_history_event()`
  direto do frontend.
- **12 tabelas novas** (`discipleship_locations`, `discipleship_departments`, `discipleship_courses`,
  `discipleship_lessons`, `discipleship_classes`, `discipleship_staff_assignments`,
  `discipleship_enrollments`, `discipleship_sessions`, `discipleship_attendance`,
  `discipleship_assessments`, `discipleship_assessment_results`, `discipleship_followups`) — todas
  referenciam `members.id`/`organizations.id`, nenhuma tabela de pessoa ou organização paralela.
- **4 capabilities novas**: `discipleship.read`, `discipleship.manage`, `discipleship.teach`,
  `discipleship.confidential` — mesmo padrão de `members.confidential` (nunca concedida por
  conveniência junto de read/manage/teach).
- **3 responsabilidades operacionais novas**: `discipleship_coordinator`, `discipleship_secretary`,
  `discipleship_teacher` — mesmo formato de `access_responsibility_definitions` já usado pela
  Secretaria (`inherits_to_descendants=false`, `is_governance=false`, escopo local).
- **Decisão documentada**: `public.groups` (pequenos grupos de comunhão) **não** foi reaproveitado
  para representar "departamento curricular" do WinTechi — semântica incompatível. Criada
  `discipleship_departments` como catálogo próprio, opcional, sem duplicar hierarquia de
  `organizations`.
- **Padrão de "escrita só por RPC" replicado**: tabelas com máquina de estados ou risco de burla de
  autoria (`enrollments`, `staff_assignments`, `attendance`, `assessment_results`, `followups`)
  revogam INSERT/UPDATE/DELETE de `authenticated`, mesmo padrão já usado por `member_occurrences` na
  Operação 1 — confirmando que este é o padrão do projeto, não uma decisão isolada da Secretaria.
- **Contrato de certificado (elegibilidade + registro, sem emissão visual)**: reaproveita
  `public.documents` + `member_history` tipo `certificado_emitido` (já existente da Op. 1) — nenhuma
  tabela ou gerador de documento novo.

## 11. Extensões reais criadas pela Operação 3 (Teologia)

> Esta seção só registra o que a Operação 3 efetivamente criou sobre o contrato acima. As decisões
> das Operações 1 e 2 (seções 1–10) não foram alteradas nem reabertas. Detalhe completo em
> `docs/architecture/operacao-3-teologia.md`. A entrega foi revisada pelo Codex; os ajustes de
> integridade acadêmica, escopo organizacional e autorização estão registrados naquele documento.

- **Nenhuma extensão do catálogo `member_history.history_type` foi necessária.** Os 5 marcos
  genéricos criados na Operação 2 (`matricula`, `inicio_formacao`, `conclusao_formacao`,
  `desligamento_formacao`, `transferencia_turma`) foram nomeados de propósito para reutilização
  futura — confirmado real ao serem consumidos por Teologia sem qualquer migration de catálogo.
  `certificado_emitido` (Op. 1) também foi reaproveitado sem alteração.
- **`source_module = 'teologia'`** passou de valor previsto no enum para valor real em uso — todo
  evento de matrícula/formação chega à timeline por um trigger dedicado
  (`_theology_enrollments_register_history`), nunca chamando `register_member_history_event()`
  direto do frontend.
- **19 tabelas novas** no namespace `theology_*` (`theology_institutes`, `theology_study_centers`,
  `theology_subjects`, `theology_programs`, `theology_curriculum_items`, `theology_periods`,
  `theology_classes`, `theology_class_offerings`, `theology_staff_assignments`,
  `theology_enrollments`, `theology_offering_enrollments`, `theology_sessions`,
  `theology_attendance`, `theology_assessment_models`, `theology_assessment_model_components`,
  `theology_assessments`, `theology_assessment_results`, `theology_grade_audit_log`,
  `theology_transaction_links`) — todas referenciam `members.id`/`organizations.id`, nenhuma tabela
  de pessoa, organização, documento ou storage paralela.
- **Decisão documentada**: as tabelas `discipleship_*` **não** foram reutilizadas nem ligadas por FK
  a `theology_*` — Discipulado modela um curso simples (uma matrícula = um curso), Teologia precisa
  de matriz curricular (programa → múltiplas matérias → múltiplas ofertas → múltiplas tentativas).
  Padrões de RLS/RPC/concorrência/histórico foram **replicados** (não herdados), confirmando que são
  o padrão real do projeto, não uma decisão isolada de um módulo.
- **4 capabilities novas**: `theology.read`, `theology.manage`, `theology.teach`,
  `theology.confidential` — mesmo padrão de `discipleship.*`/`members.confidential` (nunca concedida
  por conveniência junto de read/manage/teach). Nenhuma capability `theology.finance` foi criada —
  operações financeiras continuam exigindo as capabilities financeiras reais (`finance.read`/
  `finance.write`/`finance.approve`).
- **3 responsabilidades operacionais novas**: `theology_coordinator`, `theology_secretary`,
  `theology_teacher` — mesmo formato de `access_responsibility_definitions` já usado por
  Secretaria/Discipulado (`inherits_to_descendants=false`, `is_governance=false`, escopo local).
- **Vínculo financeiro fino, sem duplicar valor/saldo/fechamento**: `theology_transaction_links`
  não tem coluna monetária — apenas liga uma `public.transactions` real a uma matrícula/período
  acadêmico, exigindo **ambas** as capabilities (`theology.*` + `finance.*`) simultaneamente para
  ler ou escrever. Recibo, lançamento, movimentação e fechamento continuam exclusivamente no motor
  financeiro existente. Lacuna documentada: o Financeiro real não tem hoje uma operação equivalente
  a "recibo por matrícula" ou "fechamento por módulo" do legado — resolvido com o fechamento mensal
  geral existente, sem inventar uma segunda contabilidade.
- **Modelo de avaliação configurável com trava pós-uso**: `theology_assessment_models` +
  `theology_assessment_model_components` substituem os três menus fixos do legado (Mod01/Mod02/
  Mod03) por um modelo único e configurável (escala, nota mínima, arredondamento, pesos,
  obrigatoriedade por componente), bloqueado para edição depois que qualquer avaliação
  agendada/aplicada o usa — padrão reutilizável por qualquer domínio futuro que precise de
  "nota"/"critério" configurável sem reabrir tabela fixa.
- **Padrão de "escrita só por RPC" replicado**: tabelas com máquina de estados ou risco de burla de
  autoria (`staff_assignments`, `enrollments`, `offering_enrollments`, `attendance`,
  `assessment_results`, `grade_audit_log`, `transaction_links`) revogam INSERT/UPDATE/DELETE de
  `authenticated`, mesmo padrão já confirmado nas Operações 1 e 2.
- **Auditoria de alteração de nota**: `theology_grade_audit_log` + RPC
  `amend_theology_assessment_result()` — exige `theology.manage` e justificativa, preserva valor
  anterior e novo antes do `UPDATE`, nunca uma alteração silenciosa. Padrão reutilizável por qualquer
  domínio futuro com dado avaliativo/numérico sujeito a correção pós-publicação.
- **Contrato de certificado (elegibilidade + registro, sem emissão visual)**: mesmo contrato da
  Operação 2, reaproveitando `public.documents` + `member_history` tipo `certificado_emitido`.
