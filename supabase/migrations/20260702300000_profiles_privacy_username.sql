-- =============================================================================
-- Ecclesia Chat Definitivo — Migração 1: Perfis, Privacidade e Username
-- =============================================================================
-- Adiciona campos de identidade pública, privacidade do chat e
-- chave pública ECDH para criptografia ponta a ponta nas conversas secretas.
-- =============================================================================

-- ── Campos de identidade e privacidade em profiles ────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username          text         UNIQUE,
  ADD COLUMN IF NOT EXISTS display_name      text,
  ADD COLUMN IF NOT EXISTS bio               text,
  ADD COLUMN IF NOT EXISTS phone_verified    boolean      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_searchable     boolean      NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS chat_privacy      text         NOT NULL DEFAULT 'org_members'
    CHECK (chat_privacy IN ('everyone', 'org_members', 'nobody')),
  ADD COLUMN IF NOT EXISTS public_key_ecdh   text,
  ADD COLUMN IF NOT EXISTS last_seen_at      timestamptz;

-- Índice para busca por username
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_username
  ON public.profiles (lower(username))
  WHERE username IS NOT NULL;

-- Índice para busca de perfis pesquisáveis
CREATE INDEX IF NOT EXISTS idx_profiles_searchable
  ON public.profiles (is_searchable, full_name)
  WHERE is_searchable = true;

-- ── Comentários ───────────────────────────────────────────────────────────────

COMMENT ON COLUMN public.profiles.username IS
  'Handle público único (ex: @joao.ecclesia). Usado em buscas e menções.';

COMMENT ON COLUMN public.profiles.display_name IS
  'Nome de exibição no chat (pode ser diferente de full_name).';

COMMENT ON COLUMN public.profiles.public_key_ecdh IS
  'Chave pública ECDH (P-256, formato SPKI base64) para criptografia E2EE
   nas conversas secretas. Nunca armazenar a chave privada aqui.';

COMMENT ON COLUMN public.profiles.chat_privacy IS
  'Controla quem pode iniciar conversa com este usuário:
   everyone = qualquer pessoa | org_members = apenas membros da mesma org | nobody = ninguém.';

COMMENT ON COLUMN public.profiles.last_seen_at IS
  'Timestamp da última atividade do usuário. Exibido como "visto por último".';
