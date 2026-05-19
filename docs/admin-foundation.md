# Fase 3 Administrativa - Fundação

## Tabelas necessárias

- `churches`: cadastro das igrejas, matriz/congregações e hierarquia por `parent_church_id`.
- `profiles`: perfil do usuário vinculado a uma igreja por `church_id`.
- `user_roles`: roles por usuário, com `church_id` opcional para escopo por igreja.
- `super_admins`: lista auxiliar para usuários globais da plataforma.

As tabelas operacionais seguem usando `church_id` para isolamento por igreja, por exemplo:

- `members`
- `transactions`
- `events`
- `announcements`
- `documents`
- `schedules`
- `prayer_requests`
- `small_groups`
- `assemblies`

## Roles canônicos

Novos nomes preparados:

- `super_admin`
- `church_admin`
- `leader`
- `member`

Nomes legados continuam aceitos durante a migração incremental:

- `superadmin` -> `super_admin`
- `admin` -> `church_admin`
- `lider`, `tesoureiro`, `obreiro` -> `leader`
- `membro` -> `member`

## Fluxo de permissões

1. `useAuth()` identifica o usuário autenticado.
2. `useChurch()` carrega o `profile.church_id`, as igrejas visíveis e define a igreja ativa.
3. `useRole()` busca roles em `user_roles`, respeitando a igreja ativa quando aplicável.
4. `normalizeRole()` converte roles legados e novos para os quatro roles canônicos.
5. `ProtectedRoute` valida acesso pelo caminho atual usando `canAccess(path)`.

## Troca de igreja ativa

Use o hook global:

```ts
const { church, activeChurchId, churches, switchChurch, clearActiveChurch } = useChurch();

switchChurch(churchId);
clearActiveChurch();
```

`switchChurch(churchId)` só troca para igrejas já carregadas em `churches` e persiste a escolha no `localStorage` por usuário. `clearActiveChurch()` volta para a igreja principal do perfil.
