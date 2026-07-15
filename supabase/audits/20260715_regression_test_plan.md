# Plano de verificação manual — Fases 1–3 (P0 security hardening)

> **Por que não são testes automatizados de banco:** as regras absolutas desta
> tarefa proíbem aplicar migrations, rodar seeds ou alterar dados em qualquer
> banco remoto durante esta sessão, e o ambiente não tem um Postgres local
> disponível para pgTAP/integration tests. Este documento é o "teste de
> regressão" no formato possível dentro dessas restrições: uma lista exata de
> queries/chamadas **somente leitura ou em ambiente de staging isolado**, que
> um revisor com acesso deve rodar **manualmente, em staging**, antes de
> promover estas migrations. Nenhuma delas deve ser rodada em produção.

## Fase 1 — escalada para super_admin

1. **metadata `platform_role` é ignorada no cadastro**
   - Criar um usuário via `supabase.auth.signUp({ email, password, options: { data: { platform_role: 'super_admin' } } })`.
   - Verificar: `select platform_role from public.profiles where user_id = '<novo_user_id>';` → deve retornar `NULL`.

2. **usuário comum não consegue se promover / alterar `platform_role`**
   - Autenticado como o usuário comum criado acima, tentar via cliente:
     `supabase.from('profiles').update({ platform_role: 'super_admin' }).eq('user_id', <self>)`.
   - Esperado: erro de permissão de coluna (`permission denied for column platform_role`),
     não um sucesso silencioso.
   - Mesmo teste para `user_id` e `email`.

3. **colunas seguras continuam editáveis**
   - Mesmo usuário: `update({ full_name: 'Novo Nome', phone: '11999999999', avatar_url: '...' })`.
   - Esperado: sucesso.

4. **super admin legítimo continua reconhecido**
   - Inserir manualmente (fora desta sessão, com acesso de administrador do
     banco) uma linha em `public.super_admins` para um `user_id` de teste.
   - `select public.is_platform_admin('<user_id>');` → `true`.
   - Repetir removendo a linha → `false` (assumindo que este usuário não tem
     também uma linha em `user_roles` global).

5. **políticas que usam `is_platform_admin` permanecem funcionais**
   - Como o super admin de teste (passo 4), confirmar que ainda consegue,
     por exemplo, `select * from organizations limit 1;` (política
     "organizations members read" via `is_org_user` → `is_platform_admin`).

6. **RPC `admin_set_platform_role`**
   - Como usuário comum (sem super_admins/user_roles global): chamar
     `select public.admin_set_platform_role('<algum_user_id>', 'support_central');`
     → deve retornar `{"ok": false, "error": "forbidden"}`, sem alterar nada.
   - Como super admin de teste: mesma chamada → `{"ok": true, ...}` e
     `profiles.platform_role` do alvo atualizado.

## Fase 2 — entrada aberta por slug

1. **`join_organization_by_slug` não existe mais**
   - `select to_regprocedure('public.join_organization_by_slug(text)');` → `NULL`.

2. **novo cadastro nunca ganha organização por slug**
   - `signUp` com `options: { data: { church_slug: '<slug_de_uma_org_real>' } }`.
   - Verificar: `select * from public.organization_users where user_id = '<novo_user_id>';`
     → nenhuma linha.

3. **frontend**
   - Abrir `/signup?church=<slug>` sem estar autenticado, criar conta, confirmar
     e-mail se exigido, entrar no `/admin` → deve cair em "sem organização"
     (tela de pendência), nunca em uma organização automaticamente.

## Fase 3 — convites de membro e de acesso

1. **convite de acesso sem e-mail é rejeitado na criação**
   - Tentar `insert into access_invites (...) values (..., email = NULL, ...)`
     diretamente (bypassando o frontend) → deve falhar por
     `access_invites_email_required` (constraint `NOT VALID`, mas válida para
     novos INSERTs).

2. **convite de acesso não pode ser aceito só com o token**
   - Para um convite antigo (criado antes desta migration) sem e-mail, chamar
     `accept_access_invite('<token>')` autenticado com qualquer conta →
     `{"ok": false, "error": "invite_email_missing"}`.

3. **e-mail diferente**
   - Convite com e-mail `a@x.com`, aceitar autenticado como `b@x.com` →
     `{"ok": false, "error": "email_mismatch"}`.

4. **token reutilizado**
   - Aceitar o mesmo convite duas vezes → segunda chamada retorna
     `{"ok": false, "error": "already_accepted"}`.

5. **concorrência**
   - Disparar duas chamadas `accept_access_invite('<mesmo_token>')` em
     paralelo (duas conexões) → apenas uma deve suceder; a outra deve
     receber `already_accepted` (a trava `FOR UPDATE` serializa as duas
     transações).

6. **papel existente não pode ser sobrescrito**
   - Usuário já tem `organization_users` ativo na organização do convite
     (qualquer papel) → aceitar retorna `{"ok": false, "error": "existing_org_access", "role": "<papel_atual>"}`,
     sem alterar a linha existente.

7. **usuário já existente / fluxo de confirmação por link (member invite)**
   - Já coberto pelo fluxo existente em `src/pages/ConviteMembro.tsx`
     (signUp com `emailRedirectTo`, sem sessão até confirmação, depois
     `accept_member_invite`); confirmar manualmente que, sem clicar no link
     de confirmação, nenhuma chamada a `accept_member_invite` ocorre (a
     página fica em `check_email` até haver sessão real).

8. **sessão inesperada no signup / convite sem e-mail (member invite)**
   - Já coberto por `member_email_missing` / `session_mismatch` em
     `ConviteMembro.tsx` — confirmar que os dois estados aparecem
     corretamente ao simular, respectivamente, um membro sem e-mail
     cadastrado e uma sessão logada com e-mail diferente do membro.

## Fora do escopo automatizável nesta sessão

Nenhuma das queries acima foi executada por este agente: as regras absolutas
desta tarefa proíbem qualquer leitura/escrita em banco remoto sem autenticação
explicitamente concedida fora desta sessão. Este arquivo deve ser usado por um
humano com acesso a um projeto Supabase de staging isolado.
