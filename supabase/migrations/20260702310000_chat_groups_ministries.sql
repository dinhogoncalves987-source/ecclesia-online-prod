-- =============================================================================
-- Ecclesia Chat Definitivo — Migração 2: Grupos e Ministérios
-- =============================================================================
-- Cria tabelas para grupos de chat e ministérios.
-- Vincula grupos às threads existentes via group_id.
-- =============================================================================

-- ── Tabela de grupos de chat ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.chat_groups (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name            text        NOT NULL,
  description     text,
  avatar_url      text,
  group_type      text        NOT NULL DEFAULT 'group'
    CHECK (group_type IN ('group', 'ministry', 'leadership', 'support', 'broadcast')),
  created_by      uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  is_active       boolean     NOT NULL DEFAULT true,
  max_participants integer    DEFAULT 256,
  metadata        jsonb       DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_groups_org
  ON public.chat_groups (organization_id, group_type, is_active);

-- ── Participantes dos grupos ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.chat_group_participants (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id        uuid        NOT NULL REFERENCES public.chat_groups(id) ON DELETE CASCADE,
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid        NOT NULL,
  role            text        NOT NULL DEFAULT 'member'
    CHECK (role IN ('owner', 'admin', 'member')),
  joined_at       timestamptz NOT NULL DEFAULT now(),
  muted_until     timestamptz,
  is_active       boolean     NOT NULL DEFAULT true,
  UNIQUE (group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_cgp_group
  ON public.chat_group_participants (group_id, is_active);

CREATE INDEX IF NOT EXISTS idx_cgp_user
  ON public.chat_group_participants (user_id, is_active);

-- ── Vincular threads a grupos ─────────────────────────────────────────────────

ALTER TABLE public.internal_threads
  ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES public.chat_groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_internal_threads_group
  ON public.internal_threads (group_id)
  WHERE group_id IS NOT NULL;

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE public.chat_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_group_participants ENABLE ROW LEVEL SECURITY;

-- Membros da organização podem ver grupos da org
CREATE POLICY "chat_groups_select_org"
  ON public.chat_groups FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_users ou
      WHERE ou.organization_id = chat_groups.organization_id
        AND ou.user_id = auth.uid()
        AND ou.is_active = true
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.platform_role IN ('super_admin', 'platform_admin')
    )
  );

-- Admins da org podem criar grupos
CREATE POLICY "chat_groups_insert_admin"
  ON public.chat_groups FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_users ou
      WHERE ou.organization_id = chat_groups.organization_id
        AND ou.user_id = auth.uid()
        AND ou.is_active = true
        AND ou.role IN ('church_admin', 'super_admin')
    )
  );

-- Participantes podem ver outros participantes do grupo
CREATE POLICY "cgp_select_participant"
  ON public.chat_group_participants FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.chat_group_participants cgp2
      WHERE cgp2.group_id = chat_group_participants.group_id
        AND cgp2.user_id = auth.uid()
        AND cgp2.is_active = true
    )
  );

-- Usuário pode se inserir/remover (convite implícito gerenciado pelo backend)
CREATE POLICY "cgp_insert_self"
  ON public.chat_group_participants FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- ── Trigger: atualizar updated_at ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chat_groups_updated_at ON public.chat_groups;
CREATE TRIGGER trg_chat_groups_updated_at
  BEFORE UPDATE ON public.chat_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── Comentários ───────────────────────────────────────────────────────────────

COMMENT ON TABLE public.chat_groups IS
  'Grupos de chat por organização. Suporta grupos gerais, ministérios, liderança, suporte e broadcast.';

COMMENT ON TABLE public.chat_group_participants IS
  'Participantes de grupos de chat. Role: owner (criador), admin (gestor), member (membro comum).';
