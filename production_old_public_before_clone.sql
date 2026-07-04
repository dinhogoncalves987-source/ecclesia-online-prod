--
-- PostgreSQL database dump
--

\restrict 2eXidAA8w3eQPIKLYDd4vOTJWlnIPvLZ2lh1d3tgLfBgYTRrNuLtZM1SyP7zdOT

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.10

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: can_manage_church(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_manage_church(_user_id uuid, _church_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT
    public.has_church_role(_user_id, _church_id, 'super_admin')
    OR public.has_church_role(_user_id, _church_id, 'church_admin')
$$;


--
-- Name: has_church_role(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_church_role(_user_id uuid, _church_id uuid, _role text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND (
        ur.church_id = _church_id
        OR ur.church_id IS NULL
        OR public.normalize_app_role(ur.role) = 'super_admin'
      )
      AND public.normalize_app_role(ur.role) = _role
  )
$$;


--
-- Name: has_org_role(uuid, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_org_role(org_id uuid, roles text[]) RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1
    from public.organization_users
    where user_id = auth.uid()
      and organization_id = org_id
      and role = any(roles)
      and is_active = true
  );
$$;


--
-- Name: is_org_user(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_org_user(org_id uuid) RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1
    from public.organization_users
    where user_id = auth.uid()
      and organization_id = org_id
      and is_active = true
  );
$$;


--
-- Name: is_platform_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_platform_admin() RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1
    from public.profiles
    where user_id = auth.uid()
      and platform_role = 'super_admin'
  );
$$;


--
-- Name: normalize_app_role(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.normalize_app_role(_role text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  SELECT CASE _role
    WHEN 'superadmin' THEN 'super_admin'
    WHEN 'super_admin' THEN 'super_admin'
    WHEN 'admin' THEN 'church_admin'
    WHEN 'church_admin' THEN 'church_admin'
    WHEN 'lider' THEN 'leader'
    WHEN 'leader' THEN 'leader'
    WHEN 'tesoureiro' THEN 'leader'
    WHEN 'obreiro' THEN 'leader'
    WHEN 'membro' THEN 'member'
    WHEN 'member' THEN 'member'
    ELSE 'member'
  END
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: assemblies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assemblies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    assembly_date date DEFAULT CURRENT_DATE NOT NULL,
    starts_at timestamp with time zone,
    ends_at timestamp with time zone,
    youtube_url text,
    is_visible boolean DEFAULT true,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: assembly_attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assembly_attachments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    assembly_id uuid NOT NULL,
    title text NOT NULL,
    attachment_type text DEFAULT 'file'::text,
    file_url text,
    file_type text,
    youtube_url text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: communications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.communications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    title text NOT NULL,
    content text NOT NULL,
    communication_type text DEFAULT 'announcement'::text,
    target_role text,
    is_public boolean DEFAULT false,
    published_at timestamp with time zone DEFAULT now(),
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    member_id uuid,
    document_type text NOT NULL,
    title text NOT NULL,
    content text,
    status text DEFAULT 'draft'::text NOT NULL,
    file_url text,
    validation_code text,
    signed_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    event_type text DEFAULT 'general'::text,
    starts_at timestamp with time zone NOT NULL,
    ends_at timestamp with time zone,
    location text,
    is_public boolean DEFAULT true,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: group_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.group_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    member_id uuid NOT NULL,
    role text DEFAULT 'member'::text,
    joined_at date DEFAULT CURRENT_DATE,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    group_type text DEFAULT 'small_group'::text,
    leader_member_id uuid,
    meeting_day text,
    meeting_time text,
    location text,
    is_active boolean DEFAULT true,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: member_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.member_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    member_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    history_type text NOT NULL,
    title text NOT NULL,
    description text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    full_name text NOT NULL,
    email text,
    phone text,
    birth_date date,
    status text DEFAULT 'active'::text NOT NULL,
    member_role text DEFAULT 'member'::text,
    address text,
    city text,
    state text,
    country_code text DEFAULT 'BR'::text,
    joined_at date,
    baptized_at date,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: organization_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text DEFAULT 'member'::text NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    parent_id uuid,
    name text NOT NULL,
    slug text,
    organization_type text NOT NULL,
    country_code text DEFAULT 'BR'::text,
    language_code text DEFAULT 'pt-BR'::text,
    email text,
    phone text,
    city text,
    state text,
    logo_url text,
    active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: platform_announcements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_announcements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid,
    title text NOT NULL,
    short_description text,
    full_content text,
    image_url text,
    button_label text,
    button_link text,
    target_type text DEFAULT 'global'::text,
    is_active boolean DEFAULT true,
    starts_at timestamp with time zone,
    ends_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: platform_campaign_media; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_campaign_media (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    campaign_id uuid NOT NULL,
    media_type text NOT NULL,
    title text,
    description text,
    media_url text NOT NULL,
    thumbnail_url text,
    display_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: platform_campaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_campaigns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid,
    title text NOT NULL,
    subtitle text,
    short_description text,
    full_content text,
    campaign_type text DEFAULT 'donation'::text,
    target_type text DEFAULT 'global'::text,
    cover_image_url text,
    goal_amount numeric(12,2),
    current_amount numeric(12,2) DEFAULT 0,
    button_label text DEFAULT 'Contribuir'::text,
    button_link text,
    is_active boolean DEFAULT true,
    starts_at timestamp with time zone,
    ends_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: prayer_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prayer_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    member_id uuid,
    user_id uuid,
    title text NOT NULL,
    description text,
    is_private boolean DEFAULT false,
    status text DEFAULT 'open'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    full_name text,
    email text,
    phone text,
    avatar_url text,
    platform_role text DEFAULT 'user'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: signatures; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.signatures (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    user_id uuid NOT NULL,
    signer_name text NOT NULL,
    signer_role text NOT NULL,
    signature_image_url text,
    stamp_image_url text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    church_id uuid,
    role text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Data for Name: assemblies; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.assemblies (id, organization_id, title, description, assembly_date, starts_at, ends_at, youtube_url, is_visible, created_by, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: assembly_attachments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.assembly_attachments (id, assembly_id, title, attachment_type, file_url, file_type, youtube_url, created_at) FROM stdin;
\.


--
-- Data for Name: communications; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.communications (id, organization_id, title, content, communication_type, target_role, is_public, published_at, created_by, created_at, updated_at) FROM stdin;
44444444-0000-0000-0000-000000000001	11111111-0000-0000-0000-000000000004	Bem-vindos ao Ecclesia Admin	Prezados irmaos, com muito jubilo anunciamos a implantacao do Ecclesia Admin - nosso novo sistema de gestao pastoral integrada. Acesse pelo computador ou celular para acompanhar eventos, comunicados, devocionais, financeiro e muito mais. Deus seja louvado!	Normal	\N	t	2026-05-19 09:00:00+00	\N	2026-05-19 21:43:37.689089+00	2026-05-19 21:43:37.689089+00
44444444-0000-0000-0000-000000000002	11111111-0000-0000-0000-000000000004	Seminario de Lideranca - Inscricoes Abertas	O Seminario de Lideranca acontecera no dia 06 de junho (sabado), das 9h as 17h, no Auditorio Central. Palestrantes confirmados: Pr. Marcos Oliveira (RJ) e Pastora Ana Lima (SP). Vagas limitadas a 80 participantes. Inscricoes na secretaria.	Importante	\N	t	2026-05-18 14:00:00+00	\N	2026-05-19 21:43:37.689089+00	2026-05-19 21:43:37.689089+00
44444444-0000-0000-0000-000000000003	11111111-0000-0000-0000-000000000004	Congresso de Oracao e Missoes - 13 e 14 de junho	Realizaremos nosso Congresso Anual de Oracao e Missoes com o tema "Ate os Confins da Terra" (Atos 1:8). Programacao: pregacoes, momentos de intercessao, testemunhos missionarios e oferta especial para missoes nacionais.	Importante	\N	t	2026-05-15 10:00:00+00	\N	2026-05-19 21:43:37.689089+00	2026-05-19 21:43:37.689089+00
44444444-0000-0000-0000-000000000004	11111111-0000-0000-0000-000000000004	Atualizacao de Cadastro - Prazo: 30 de maio	Solicitamos que todos os membros regularizem seu cadastro junto a secretaria ate o dia 30 de maio. Necessario apresentar: documento com foto e comprovante de residencia. Horario: segunda a sexta, 9h as 17h.	Normal	\N	t	2026-05-10 08:00:00+00	\N	2026-05-19 21:43:37.689089+00	2026-05-19 21:43:37.689089+00
\.


--
-- Data for Name: documents; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.documents (id, organization_id, member_id, document_type, title, content, status, file_url, validation_code, signed_at, created_by, created_at, updated_at) FROM stdin;
55555555-0000-0000-0000-000000000001	11111111-0000-0000-0000-000000000004	\N	Estatuto	Estatuto da Congregacao	ESTATUTO DA CONGREGACAO BATISTA JARDIM AMERICA\\n\\nCAPITULO I - DA DENOMINACAO\\nArt. 1o - A Congregacao Batista Jardim America, fundada em 21 de junho de 2001, e uma entidade religiosa sem fins lucrativos, filiada a Igreja Batista Central Sao Paulo.\\n\\nCAPITULO II - DOS OBJETIVOS\\nArt. 2o - a) A evangelizacao e o discipulado; b) A adoracao e o culto; c) O servico e a missao.\\n\\nCAPITULO III - DOS MEMBROS\\nArt. 3o - Sao membros os professantes de fe crista aceitos conforme este estatuto.\\n\\nCAPITULO IV - DA ADMINISTRACAO\\nArt. 4o - Administrada pelo Pastor, Conselho de Diaconos e Assembleia Geral.	draft	\N	\N	\N	\N	2026-05-19 21:43:37.689089+00	2026-05-19 21:43:37.689089+00
55555555-0000-0000-0000-000000000002	11111111-0000-0000-0000-000000000004	\N	Ata	Ata da Assembleia Geral - Maio 2026	ATA DA ASSEMBLEIA GERAL ORDINARIA\\nData: 10 de maio de 2026 | Hora: 11h00\\n\\nPresentes: 45 membros\\nMesa: Pr. Joao Paulo Ferreira (Presidente), Fernanda Alves (Secretaria)\\n\\nPAUTA:\\n1. Leitura e aprovacao da ata anterior - aprovada.\\n2. Relatorio financeiro do 1o trimestre - saldo positivo.\\n3. Aprovacao do calendario de eventos para o 2o semestre.\\n4. Eleicao do novo conselho de diaconos - eleitos Carlos Lima e Andre Nascimento.\\n5. Reforma do banheiro aprovada - valor estimado R$ 12.000,00.\\n\\nEncerrado as 12h45.\\n\\nPr. Joao Paulo Ferreira - Presidente | Fernanda Alves - Secretaria	draft	\N	\N	\N	\N	2026-05-19 21:43:37.689089+00	2026-05-19 21:43:37.689089+00
55555555-0000-0000-0000-000000000003	11111111-0000-0000-0000-000000000004	\N	Geral	Manual do Novo Membro	BEM-VINDO A NOSSA FAMILIA!\\n\\nNOSSA VISAO\\nSer uma comunidade que transforma vidas pelo poder do Evangelho de Jesus Cristo.\\n\\nNOSSOS VALORES\\n- Palavra: a Biblia como fundamento de tudo\\n- Oracao: comunhao constante com Deus\\n- Comunidade: relacionamentos genuinos\\n- Missao: alcancar o perdido\\n\\nMINISTERIOS DISPONIVEIS\\n- Ministerio de Louvor e Adoracao\\n- Ministerio Infantil (0-12 anos)\\n- Grupo de Jovens Resgate (13-30 anos)\\n- Grupo de Casais Agape\\n- Ministerio de Misericordia\\n\\nCOMPROMISSOS DO MEMBRO\\n- Participar dos cultos\\n- Contribuir com dizimos\\n- Servir em algum ministerio\\n\\nCONTATOS\\nPastor Joao Paulo: (11) 99999-0001\\nSecretaria: seg-sex 9h-17h	draft	\N	\N	\N	\N	2026-05-19 21:43:37.689089+00	2026-05-19 21:43:37.689089+00
\.


--
-- Data for Name: events; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.events (id, organization_id, title, description, event_type, starts_at, ends_at, location, is_public, created_by, created_at, updated_at) FROM stdin;
33333333-0000-0000-0000-000000000001	11111111-0000-0000-0000-000000000004	Culto de Adoracao - Domingo	\N	bg-accent	2026-05-24 10:00:00+00	2026-05-24 12:00:00+00	Templo Principal	t	\N	2026-05-19 21:43:37.689089+00	2026-05-19 21:43:37.689089+00
33333333-0000-0000-0000-000000000002	11111111-0000-0000-0000-000000000004	Culto da Familia	\N	bg-accent	2026-05-24 19:00:00+00	2026-05-24 20:30:00+00	Templo Principal	t	\N	2026-05-19 21:43:37.689089+00	2026-05-19 21:43:37.689089+00
33333333-0000-0000-0000-000000000003	11111111-0000-0000-0000-000000000004	Culto de Oracao - Quarta	\N	bg-primary	2026-05-27 19:30:00+00	2026-05-27 21:00:00+00	Salao de Reunioes	t	\N	2026-05-19 21:43:37.689089+00	2026-05-19 21:43:37.689089+00
33333333-0000-0000-0000-000000000004	11111111-0000-0000-0000-000000000004	Reuniao de Jovens	\N	bg-primary	2026-05-30 19:00:00+00	2026-05-30 21:00:00+00	Salao dos Jovens	t	\N	2026-05-19 21:43:37.689089+00	2026-05-19 21:43:37.689089+00
33333333-0000-0000-0000-000000000005	11111111-0000-0000-0000-000000000004	Culto de Adoracao - Domingo	\N	bg-accent	2026-05-31 10:00:00+00	2026-05-31 12:00:00+00	Templo Principal	t	\N	2026-05-19 21:43:37.689089+00	2026-05-19 21:43:37.689089+00
33333333-0000-0000-0000-000000000006	11111111-0000-0000-0000-000000000004	Seminario de Lideranca	\N	bg-success	2026-06-06 09:00:00+00	2026-06-06 17:00:00+00	Auditorio Central	t	\N	2026-05-19 21:43:37.689089+00	2026-05-19 21:43:37.689089+00
33333333-0000-0000-0000-000000000007	11111111-0000-0000-0000-000000000004	Culto de Adoracao - Domingo	\N	bg-accent	2026-06-07 10:00:00+00	2026-06-07 12:00:00+00	Templo Principal	t	\N	2026-05-19 21:43:37.689089+00	2026-05-19 21:43:37.689089+00
33333333-0000-0000-0000-000000000008	11111111-0000-0000-0000-000000000004	Congresso de Oracao e Missoes	\N	bg-success	2026-06-13 19:00:00+00	2026-06-14 18:00:00+00	Templo Principal	t	\N	2026-05-19 21:43:37.689089+00	2026-05-19 21:43:37.689089+00
33333333-0000-0000-0000-000000000009	11111111-0000-0000-0000-000000000004	Culto de Adoracao - Domingo	\N	bg-accent	2026-06-14 10:00:00+00	2026-06-14 12:00:00+00	Templo Principal	t	\N	2026-05-19 21:43:37.689089+00	2026-05-19 21:43:37.689089+00
33333333-0000-0000-0000-000000000010	11111111-0000-0000-0000-000000000004	Culto de Aniversario da Igreja	\N	bg-accent	2026-06-21 10:00:00+00	2026-06-21 13:00:00+00	Templo Principal	t	\N	2026-05-19 21:43:37.689089+00	2026-05-19 21:43:37.689089+00
33333333-0000-0000-0000-000000000011	11111111-0000-0000-0000-000000000004	Retiro de Casais	\N	bg-primary	2026-06-27 08:00:00+00	2026-06-29 18:00:00+00	Centro de Retiros Betania	t	\N	2026-05-19 21:43:37.689089+00	2026-05-19 21:43:37.689089+00
\.


--
-- Data for Name: group_members; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.group_members (id, group_id, member_id, role, joined_at, created_at) FROM stdin;
\.


--
-- Data for Name: groups; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.groups (id, organization_id, name, description, group_type, leader_member_id, meeting_day, meeting_time, location, is_active, created_by, created_at, updated_at) FROM stdin;
66666666-0000-0000-0000-000000000001	11111111-0000-0000-0000-000000000004	Jovens Resgate	Grupo de jovens com idades entre 15 e 30 anos. Reunioes aos sabados as 19h no Salao dos Jovens. Lider: Paulo Henrique Costa. Foco em evangelismo, discipulado e missoes urbanas.	small_group	\N	\N	\N	\N	t	\N	2026-05-19 21:43:37.689089+00	2026-05-19 21:43:37.689089+00
66666666-0000-0000-0000-000000000002	11111111-0000-0000-0000-000000000004	Casais Agape	Grupo para casais em todas as fases do casamento. Reunioes quinzenais as sextas-feiras as 20h. Coordenacao: Ricardo e Juliana Pereira. Estudo: Amor e Respeito (Ef 5:22-33).	small_group	\N	\N	\N	\N	t	\N	2026-05-19 21:43:37.689089+00	2026-05-19 21:43:37.689089+00
\.


--
-- Data for Name: member_history; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.member_history (id, member_id, organization_id, history_type, title, description, created_by, created_at) FROM stdin;
\.


--
-- Data for Name: members; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.members (id, organization_id, full_name, email, phone, birth_date, status, member_role, address, city, state, country_code, joined_at, baptized_at, notes, created_by, created_at, updated_at) FROM stdin;
22222222-0000-0000-0000-000000000001	11111111-0000-0000-0000-000000000004	Pr. Joao Paulo Ferreira	pastor@ibca.com.br	(11) 99999-0001	\N	Ativo	Pastor	\N	\N	\N	BR	2015-03-15	\N	\N	\N	2026-05-19 21:43:37.689089+00	2026-05-19 21:43:37.689089+00
22222222-0000-0000-0000-000000000002	11111111-0000-0000-0000-000000000004	Maria Aparecida Santos	maria.santos@ibca.com	(11) 99999-0002	\N	Ativo	Diaconisa	\N	\N	\N	BR	2016-06-20	\N	\N	\N	2026-05-19 21:43:37.689089+00	2026-05-19 21:43:37.689089+00
22222222-0000-0000-0000-000000000003	11111111-0000-0000-0000-000000000004	Carlos Roberto Lima	carlos.lima@ibca.com	(11) 99999-0003	\N	Ativo	Diacono	\N	\N	\N	BR	2017-01-10	\N	\N	\N	2026-05-19 21:43:37.689089+00	2026-05-19 21:43:37.689089+00
22222222-0000-0000-0000-000000000004	11111111-0000-0000-0000-000000000004	Ana Cristina Oliveira	ana.oliveira@ibca.com	(11) 99999-0004	\N	Ativo	Membro	\N	\N	\N	BR	2018-09-05	\N	\N	\N	2026-05-19 21:43:37.689089+00	2026-05-19 21:43:37.689089+00
22222222-0000-0000-0000-000000000005	11111111-0000-0000-0000-000000000004	Paulo Henrique Costa	paulo.costa@ibca.com	(11) 99999-0005	\N	Ativo	Lider de Jovens	\N	\N	\N	BR	2019-03-22	\N	\N	\N	2026-05-19 21:43:37.689089+00	2026-05-19 21:43:37.689089+00
22222222-0000-0000-0000-000000000006	11111111-0000-0000-0000-000000000004	Fernanda Maria Alves	fernanda@ibca.com	(11) 99999-0006	\N	Ativo	Secretaria	\N	\N	\N	BR	2019-11-14	\N	\N	\N	2026-05-19 21:43:37.689089+00	2026-05-19 21:43:37.689089+00
22222222-0000-0000-0000-000000000007	11111111-0000-0000-0000-000000000004	Ricardo Jose Pereira	tesoureiro@ibca.com	(11) 99999-0007	\N	Ativo	Tesoureiro	\N	\N	\N	BR	2020-02-28	\N	\N	\N	2026-05-19 21:43:37.689089+00	2026-05-19 21:43:37.689089+00
22222222-0000-0000-0000-000000000008	11111111-0000-0000-0000-000000000004	Juliana Cristina Ramos	\N	(11) 99999-0008	\N	Ativo	Membro	\N	\N	\N	BR	2021-05-10	\N	\N	\N	2026-05-19 21:43:37.689089+00	2026-05-19 21:43:37.689089+00
22222222-0000-0000-0000-000000000009	11111111-0000-0000-0000-000000000004	Lucas Eduardo Souza	\N	(11) 99999-0009	\N	Ativo	Obreiro	\N	\N	\N	BR	2022-01-17	\N	\N	\N	2026-05-19 21:43:37.689089+00	2026-05-19 21:43:37.689089+00
22222222-0000-0000-0000-000000000010	11111111-0000-0000-0000-000000000004	Beatriz Helena Martins	\N	(11) 99999-0010	\N	Ativo	Membro	\N	\N	\N	BR	2022-08-30	\N	\N	\N	2026-05-19 21:43:37.689089+00	2026-05-19 21:43:37.689089+00
22222222-0000-0000-0000-000000000011	11111111-0000-0000-0000-000000000004	Rodrigo Almeida Torres	\N	(11) 99999-0011	\N	Visitante	Visitante	\N	\N	\N	BR	2026-05-05	\N	\N	\N	2026-05-19 21:43:37.689089+00	2026-05-19 21:43:37.689089+00
22222222-0000-0000-0000-000000000012	11111111-0000-0000-0000-000000000004	Silvia Regina Campos	\N	\N	\N	Ativo	Membro	\N	\N	\N	BR	2023-03-12	\N	\N	\N	2026-05-19 21:43:37.689089+00	2026-05-19 21:43:37.689089+00
22222222-0000-0000-0000-000000000013	11111111-0000-0000-0000-000000000004	Andre Luis Nascimento	\N	(11) 99999-0013	\N	Ativo	Diacono	\N	\N	\N	BR	2020-08-05	\N	\N	\N	2026-05-19 21:43:37.689089+00	2026-05-19 21:43:37.689089+00
22222222-0000-0000-0000-000000000014	11111111-0000-0000-0000-000000000004	Priscila Fontes Correia	\N	\N	\N	Ativo	Membro	\N	\N	\N	BR	2024-01-20	\N	\N	\N	2026-05-19 21:43:37.689089+00	2026-05-19 21:43:37.689089+00
22222222-0000-0000-0000-000000000015	11111111-0000-0000-0000-000000000004	Marcos Vinicius Rocha	\N	\N	\N	Inativo	Obreiro	\N	\N	\N	BR	2021-11-08	\N	\N	\N	2026-05-19 21:43:37.689089+00	2026-05-19 21:43:37.689089+00
\.


--
-- Data for Name: organization_users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.organization_users (id, organization_id, user_id, role, is_active, created_at) FROM stdin;
eac7af1b-b998-42c8-801c-414b7ecc34d6	11111111-0000-0000-0000-000000000001	77a11cfc-42f8-43ac-910f-c77b7b0349da	church_admin	t	2026-05-20 17:22:55.708285+00
8d53ef03-00fc-4903-827f-4641bcb0572b	11111111-0000-0000-0000-000000000002	77a11cfc-42f8-43ac-910f-c77b7b0349da	church_admin	t	2026-05-20 17:22:55.708285+00
\.


--
-- Data for Name: organizations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.organizations (id, parent_id, name, slug, organization_type, country_code, language_code, email, phone, city, state, logo_url, active, created_at, updated_at) FROM stdin;
11111111-0000-0000-0000-000000000001	\N	Convencao Batista Nacional	convencao-batista-nacional	convencao	BR	pt-BR	\N	\N	Brasilia	DF	\N	t	2026-05-19 21:33:31.070208+00	2026-05-19 21:33:31.070208+00
11111111-0000-0000-0000-000000000002	11111111-0000-0000-0000-000000000001	Igreja Batista Central Sao Paulo	ibc-sao-paulo	matriz	BR	pt-BR	\N	\N	Sao Paulo	SP	\N	t	2026-05-19 21:33:31.070208+00	2026-05-19 21:33:31.070208+00
11111111-0000-0000-0000-000000000003	11111111-0000-0000-0000-000000000002	Setor Regional Norte SP	setor-regional-norte-sp	setor	BR	pt-BR	\N	\N	Sao Paulo	SP	\N	t	2026-05-19 21:33:31.070208+00	2026-05-19 21:33:31.070208+00
11111111-0000-0000-0000-000000000004	11111111-0000-0000-0000-000000000003	Congregacao Batista Jardim America	congregacao-jardim-america	congregacao	BR	pt-BR	\N	\N	Sao Paulo	SP	\N	t	2026-05-19 21:33:31.070208+00	2026-05-19 21:33:31.070208+00
\.


--
-- Data for Name: platform_announcements; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.platform_announcements (id, organization_id, title, short_description, full_content, image_url, button_label, button_link, target_type, is_active, starts_at, ends_at, created_by, created_at, updated_at) FROM stdin;
193b529a-b600-4392-ba5d-464b5055896b	\N	MISSÃO CAMBOJA	"MISSÃO CAMBOJA: Construindo uma igreja, salas de aula e um refeitório. Garantindo teto, educação e três refeições diárias para nossas crianças. Sua doação transforma vidas!"	"Crie um banner cinematográfico e emocionante. Ao fundo, uma estrutura de igreja e salas de aula em construção sob a luz do sol no Camboja. Em primeiro plano, uma criança cambojana sorrindo. Estilo visual realista, cores quentes que transmitem esperança. Reserve um espaço centralizado ou lateral limpo para que o texto do 'Conteúdo Completo' seja inserido de forma legível."	https://zsonukpxahaxffugavfu.supabase.co/storage/v1/object/public/platform-media/platform-announcements/ai-1778553140309-f5eff203-e1be-4a7e-b2c2-1fbff16b5cd2-missao-camboja.svg	Doe, Salve Vidas.	\N	members	t	2026-05-09 12:00:00+00	2026-12-12 12:00:00+00	167245df-7062-4a19-85b7-e8343ad27a0e	2026-05-11 23:30:33.471319+00	2026-05-12 02:32:21.037+00
99999999-0000-0000-0000-000000000001	\N	Ecclesia Admin em Demonstracao	Explore o sistema com dados de demonstracao. Acesse a Biblia com IA pastoral, devocionais inteligentes e muito mais.	\N	\N	Explorar Biblia IA	/admin/biblia	global	t	2026-05-19 20:33:31.070208+00	\N	\N	2026-05-19 21:33:31.070208+00	2026-05-19 21:33:31.070208+00
\.


--
-- Data for Name: platform_campaign_media; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.platform_campaign_media (id, campaign_id, media_type, title, description, media_url, thumbnail_url, display_order, created_at) FROM stdin;
\.


--
-- Data for Name: platform_campaigns; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.platform_campaigns (id, organization_id, title, subtitle, short_description, full_content, campaign_type, target_type, cover_image_url, goal_amount, current_amount, button_label, button_link, is_active, starts_at, ends_at, created_by, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: prayer_requests; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.prayer_requests (id, organization_id, member_id, user_id, title, description, is_private, status, created_at, updated_at) FROM stdin;
77777777-0000-0000-0000-000000000001	11111111-0000-0000-0000-000000000004	\N	\N	Cura e restauracao - Irma Maria	Pedido de intercessao pela irma Maria Santos que realizou uma cirurgia cardiaca. Que o Senhor conceda cura completa, paz e conforto a ela e a sua familia neste momento de recuperacao.	f	Em Oracao	2026-05-19 21:43:37.689089+00	2026-05-19 21:43:37.689089+00
77777777-0000-0000-0000-000000000002	11111111-0000-0000-0000-000000000004	\N	\N	Provisao para familia Souza	O irmao Lucas Souza esta desempregado ha tres meses. Sua familia depende de sua renda. Intercedemos para que o Senhor abra portas de trabalho e fortifica a fe dessa familia.	f	Em Oracao	2026-05-19 21:43:37.689089+00	2026-05-19 21:43:37.689089+00
77777777-0000-0000-0000-000000000003	11111111-0000-0000-0000-000000000004	\N	\N	Ungimento do Congresso de Oracao	Pedimos intercessao para o Congresso de Oracao e Missoes de junho. Que o Espirito Santo prepare os coracoes e que muitos sejam tocados pelo chamado missionario.	f	Pendente	2026-05-19 21:43:37.689089+00	2026-05-19 21:43:37.689089+00
\.


--
-- Data for Name: profiles; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.profiles (id, user_id, full_name, email, phone, avatar_url, platform_role, created_at, updated_at) FROM stdin;
fc8070bc-c51c-4ada-8071-850e2f41391a	167245df-7062-4a19-85b7-e8343ad27a0e	Edson Goncalves	dinhoroquete@gmail.com	\N	\N	super_admin	2026-05-11 23:24:26.49418+00	2026-05-11 23:24:26.49418+00
\.


--
-- Data for Name: signatures; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.signatures (id, organization_id, user_id, signer_name, signer_role, signature_image_url, stamp_image_url, is_active, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: user_roles; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.user_roles (id, user_id, church_id, role, created_at) FROM stdin;
08e944d4-428f-41bd-9160-862fdbe2c4df	167245df-7062-4a19-85b7-e8343ad27a0e	\N	super_admin	2026-05-09 19:51:10.47642+00
\.


--
-- Name: assemblies assemblies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assemblies
    ADD CONSTRAINT assemblies_pkey PRIMARY KEY (id);


--
-- Name: assembly_attachments assembly_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assembly_attachments
    ADD CONSTRAINT assembly_attachments_pkey PRIMARY KEY (id);


--
-- Name: communications communications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.communications
    ADD CONSTRAINT communications_pkey PRIMARY KEY (id);


--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);


--
-- Name: documents documents_validation_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_validation_code_key UNIQUE (validation_code);


--
-- Name: events events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (id);


--
-- Name: group_members group_members_group_id_member_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_members
    ADD CONSTRAINT group_members_group_id_member_id_key UNIQUE (group_id, member_id);


--
-- Name: group_members group_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_members
    ADD CONSTRAINT group_members_pkey PRIMARY KEY (id);


--
-- Name: groups groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT groups_pkey PRIMARY KEY (id);


--
-- Name: member_history member_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_history
    ADD CONSTRAINT member_history_pkey PRIMARY KEY (id);


--
-- Name: members members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.members
    ADD CONSTRAINT members_pkey PRIMARY KEY (id);


--
-- Name: organization_users organization_users_organization_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_users
    ADD CONSTRAINT organization_users_organization_id_user_id_key UNIQUE (organization_id, user_id);


--
-- Name: organization_users organization_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_users
    ADD CONSTRAINT organization_users_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_slug_key UNIQUE (slug);


--
-- Name: platform_announcements platform_announcements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_announcements
    ADD CONSTRAINT platform_announcements_pkey PRIMARY KEY (id);


--
-- Name: platform_campaign_media platform_campaign_media_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_campaign_media
    ADD CONSTRAINT platform_campaign_media_pkey PRIMARY KEY (id);


--
-- Name: platform_campaigns platform_campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_campaigns
    ADD CONSTRAINT platform_campaigns_pkey PRIMARY KEY (id);


--
-- Name: prayer_requests prayer_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prayer_requests
    ADD CONSTRAINT prayer_requests_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_user_id_key UNIQUE (user_id);


--
-- Name: signatures signatures_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signatures
    ADD CONSTRAINT signatures_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: assemblies assemblies_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assemblies
    ADD CONSTRAINT assemblies_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: assemblies assemblies_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assemblies
    ADD CONSTRAINT assemblies_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: assembly_attachments assembly_attachments_assembly_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assembly_attachments
    ADD CONSTRAINT assembly_attachments_assembly_id_fkey FOREIGN KEY (assembly_id) REFERENCES public.assemblies(id) ON DELETE CASCADE;


--
-- Name: communications communications_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.communications
    ADD CONSTRAINT communications_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: communications communications_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.communications
    ADD CONSTRAINT communications_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: documents documents_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: documents documents_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.members(id) ON DELETE SET NULL;


--
-- Name: documents documents_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: events events_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: events events_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: group_members group_members_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_members
    ADD CONSTRAINT group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;


--
-- Name: group_members group_members_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_members
    ADD CONSTRAINT group_members_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.members(id) ON DELETE CASCADE;


--
-- Name: groups groups_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT groups_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: groups groups_leader_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT groups_leader_member_id_fkey FOREIGN KEY (leader_member_id) REFERENCES public.members(id) ON DELETE SET NULL;


--
-- Name: groups groups_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT groups_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: member_history member_history_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_history
    ADD CONSTRAINT member_history_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: member_history member_history_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_history
    ADD CONSTRAINT member_history_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.members(id) ON DELETE CASCADE;


--
-- Name: member_history member_history_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_history
    ADD CONSTRAINT member_history_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: members members_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.members
    ADD CONSTRAINT members_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: members members_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.members
    ADD CONSTRAINT members_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: organization_users organization_users_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_users
    ADD CONSTRAINT organization_users_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: organization_users organization_users_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_users
    ADD CONSTRAINT organization_users_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: organizations organizations_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: platform_announcements platform_announcements_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_announcements
    ADD CONSTRAINT platform_announcements_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: platform_announcements platform_announcements_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_announcements
    ADD CONSTRAINT platform_announcements_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: platform_campaign_media platform_campaign_media_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_campaign_media
    ADD CONSTRAINT platform_campaign_media_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.platform_campaigns(id) ON DELETE CASCADE;


--
-- Name: platform_campaigns platform_campaigns_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_campaigns
    ADD CONSTRAINT platform_campaigns_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: platform_campaigns platform_campaigns_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_campaigns
    ADD CONSTRAINT platform_campaigns_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE SET NULL;


--
-- Name: prayer_requests prayer_requests_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prayer_requests
    ADD CONSTRAINT prayer_requests_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.members(id) ON DELETE SET NULL;


--
-- Name: prayer_requests prayer_requests_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prayer_requests
    ADD CONSTRAINT prayer_requests_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: prayer_requests prayer_requests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prayer_requests
    ADD CONSTRAINT prayer_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: profiles profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: signatures signatures_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signatures
    ADD CONSTRAINT signatures_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: signatures signatures_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signatures
    ADD CONSTRAINT signatures_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: communications Admins can manage communications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage communications" ON public.communications TO authenticated USING ((public.is_platform_admin() OR public.has_org_role(organization_id, ARRAY['admin'::text, 'pastor'::text, 'secretary'::text, 'leader'::text]))) WITH CHECK ((public.is_platform_admin() OR public.has_org_role(organization_id, ARRAY['admin'::text, 'pastor'::text, 'secretary'::text, 'leader'::text])));


--
-- Name: organization_users Admins can manage organization users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage organization users" ON public.organization_users TO authenticated USING ((public.is_platform_admin() OR public.has_org_role(organization_id, ARRAY['admin'::text, 'pastor'::text]))) WITH CHECK ((public.is_platform_admin() OR public.has_org_role(organization_id, ARRAY['admin'::text, 'pastor'::text])));


--
-- Name: signatures Admins can manage signatures; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage signatures" ON public.signatures TO authenticated USING ((public.is_platform_admin() OR public.has_org_role(organization_id, ARRAY['admin'::text, 'pastor'::text, 'secretary'::text]))) WITH CHECK ((public.is_platform_admin() OR public.has_org_role(organization_id, ARRAY['admin'::text, 'pastor'::text, 'secretary'::text])));


--
-- Name: platform_announcements Authenticated users can view active announcements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view active announcements" ON public.platform_announcements FOR SELECT TO authenticated USING ((is_active = true));


--
-- Name: platform_campaigns Authenticated users can view active platform campaigns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view active platform campaigns" ON public.platform_campaigns FOR SELECT TO authenticated USING ((is_active = true));


--
-- Name: platform_campaign_media Authenticated users can view campaign media; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view campaign media" ON public.platform_campaign_media FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.platform_campaigns c
  WHERE ((c.id = platform_campaign_media.campaign_id) AND (c.is_active = true)))));


--
-- Name: organizations Platform admin can manage organizations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Platform admin can manage organizations" ON public.organizations TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());


--
-- Name: platform_announcements Platform admins can manage announcements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Platform admins can manage announcements" ON public.platform_announcements TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());


--
-- Name: platform_campaign_media Platform admins can manage campaign media; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Platform admins can manage campaign media" ON public.platform_campaign_media TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());


--
-- Name: platform_campaigns Platform admins can manage platform campaigns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Platform admins can manage platform campaigns" ON public.platform_campaigns TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());


--
-- Name: assemblies Secretariat can manage assemblies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Secretariat can manage assemblies" ON public.assemblies TO authenticated USING ((public.is_platform_admin() OR public.has_org_role(organization_id, ARRAY['admin'::text, 'pastor'::text, 'secretary'::text]))) WITH CHECK ((public.is_platform_admin() OR public.has_org_role(organization_id, ARRAY['admin'::text, 'pastor'::text, 'secretary'::text])));


--
-- Name: assembly_attachments Secretariat can manage assembly attachments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Secretariat can manage assembly attachments" ON public.assembly_attachments TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.assemblies a
  WHERE ((a.id = assembly_attachments.assembly_id) AND (public.is_platform_admin() OR public.has_org_role(a.organization_id, ARRAY['admin'::text, 'pastor'::text, 'secretary'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.assemblies a
  WHERE ((a.id = assembly_attachments.assembly_id) AND (public.is_platform_admin() OR public.has_org_role(a.organization_id, ARRAY['admin'::text, 'pastor'::text, 'secretary'::text]))))));


--
-- Name: documents Secretariat can manage documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Secretariat can manage documents" ON public.documents TO authenticated USING ((public.is_platform_admin() OR public.has_org_role(organization_id, ARRAY['admin'::text, 'pastor'::text, 'secretary'::text]))) WITH CHECK ((public.is_platform_admin() OR public.has_org_role(organization_id, ARRAY['admin'::text, 'pastor'::text, 'secretary'::text])));


--
-- Name: events Secretariat can manage events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Secretariat can manage events" ON public.events TO authenticated USING ((public.is_platform_admin() OR public.has_org_role(organization_id, ARRAY['admin'::text, 'pastor'::text, 'secretary'::text, 'leader'::text]))) WITH CHECK ((public.is_platform_admin() OR public.has_org_role(organization_id, ARRAY['admin'::text, 'pastor'::text, 'secretary'::text, 'leader'::text])));


--
-- Name: group_members Secretariat can manage group members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Secretariat can manage group members" ON public.group_members TO authenticated USING ((public.is_platform_admin() OR (EXISTS ( SELECT 1
   FROM public.groups g
  WHERE ((g.id = group_members.group_id) AND public.has_org_role(g.organization_id, ARRAY['admin'::text, 'pastor'::text, 'secretary'::text, 'leader'::text])))))) WITH CHECK ((public.is_platform_admin() OR (EXISTS ( SELECT 1
   FROM public.groups g
  WHERE ((g.id = group_members.group_id) AND public.has_org_role(g.organization_id, ARRAY['admin'::text, 'pastor'::text, 'secretary'::text, 'leader'::text]))))));


--
-- Name: groups Secretariat can manage groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Secretariat can manage groups" ON public.groups TO authenticated USING ((public.is_platform_admin() OR public.has_org_role(organization_id, ARRAY['admin'::text, 'pastor'::text, 'secretary'::text, 'leader'::text]))) WITH CHECK ((public.is_platform_admin() OR public.has_org_role(organization_id, ARRAY['admin'::text, 'pastor'::text, 'secretary'::text, 'leader'::text])));


--
-- Name: member_history Secretariat can manage member history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Secretariat can manage member history" ON public.member_history TO authenticated USING ((public.is_platform_admin() OR public.has_org_role(organization_id, ARRAY['admin'::text, 'pastor'::text, 'secretary'::text]))) WITH CHECK ((public.is_platform_admin() OR public.has_org_role(organization_id, ARRAY['admin'::text, 'pastor'::text, 'secretary'::text])));


--
-- Name: members Secretariat can manage members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Secretariat can manage members" ON public.members TO authenticated USING ((public.is_platform_admin() OR public.has_org_role(organization_id, ARRAY['admin'::text, 'pastor'::text, 'secretary'::text]))) WITH CHECK ((public.is_platform_admin() OR public.has_org_role(organization_id, ARRAY['admin'::text, 'pastor'::text, 'secretary'::text])));


--
-- Name: prayer_requests Secretariat can manage prayer requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Secretariat can manage prayer requests" ON public.prayer_requests TO authenticated USING ((public.is_platform_admin() OR public.has_org_role(organization_id, ARRAY['admin'::text, 'pastor'::text, 'secretary'::text]))) WITH CHECK ((public.is_platform_admin() OR public.has_org_role(organization_id, ARRAY['admin'::text, 'pastor'::text, 'secretary'::text])));


--
-- Name: prayer_requests Users can create prayer requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create prayer requests" ON public.prayer_requests FOR INSERT TO authenticated WITH CHECK ((public.is_org_user(organization_id) AND (user_id = auth.uid())));


--
-- Name: profiles Users can insert own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (((user_id = auth.uid()) OR public.is_platform_admin()));


--
-- Name: user_roles Users can read own roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own roles" ON public.user_roles FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: profiles Users can update own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (((user_id = auth.uid()) OR public.is_platform_admin()));


--
-- Name: assemblies Users can view assemblies from their organization; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view assemblies from their organization" ON public.assemblies FOR SELECT TO authenticated USING ((public.is_platform_admin() OR public.is_org_user(organization_id) OR (is_visible = true)));


--
-- Name: assembly_attachments Users can view assembly attachments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view assembly attachments" ON public.assembly_attachments FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.assemblies a
  WHERE ((a.id = assembly_attachments.assembly_id) AND (public.is_platform_admin() OR public.is_org_user(a.organization_id) OR (a.is_visible = true))))));


--
-- Name: communications Users can view communications from their organization; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view communications from their organization" ON public.communications FOR SELECT TO authenticated USING ((public.is_platform_admin() OR public.is_org_user(organization_id)));


--
-- Name: documents Users can view documents from their organization; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view documents from their organization" ON public.documents FOR SELECT TO authenticated USING ((public.is_platform_admin() OR public.is_org_user(organization_id)));


--
-- Name: events Users can view events from their organization; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view events from their organization" ON public.events FOR SELECT TO authenticated USING ((public.is_platform_admin() OR public.is_org_user(organization_id) OR (is_public = true)));


--
-- Name: group_members Users can view group members from their organization; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view group members from their organization" ON public.group_members FOR SELECT TO authenticated USING ((public.is_platform_admin() OR (EXISTS ( SELECT 1
   FROM public.groups g
  WHERE ((g.id = group_members.group_id) AND public.is_org_user(g.organization_id))))));


--
-- Name: groups Users can view groups from their organization; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view groups from their organization" ON public.groups FOR SELECT TO authenticated USING ((public.is_platform_admin() OR public.is_org_user(organization_id)));


--
-- Name: member_history Users can view member history from their organization; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view member history from their organization" ON public.member_history FOR SELECT TO authenticated USING ((public.is_platform_admin() OR public.is_org_user(organization_id)));


--
-- Name: members Users can view members from their organization; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view members from their organization" ON public.members FOR SELECT TO authenticated USING ((public.is_platform_admin() OR public.is_org_user(organization_id)));


--
-- Name: organizations Users can view organizations they belong to; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view organizations they belong to" ON public.organizations FOR SELECT TO authenticated USING ((public.is_platform_admin() OR public.is_org_user(id)));


--
-- Name: organization_users Users can view own organization links; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own organization links" ON public.organization_users FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR public.is_platform_admin() OR public.has_org_role(organization_id, ARRAY['admin'::text, 'pastor'::text, 'secretary'::text])));


--
-- Name: profiles Users can view own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR public.is_platform_admin()));


--
-- Name: prayer_requests Users can view public prayer requests from their organization; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view public prayer requests from their organization" ON public.prayer_requests FOR SELECT TO authenticated USING ((public.is_platform_admin() OR public.has_org_role(organization_id, ARRAY['admin'::text, 'pastor'::text, 'secretary'::text]) OR (public.is_org_user(organization_id) AND (is_private = false)) OR (user_id = auth.uid())));


--
-- Name: signatures Users can view signatures from their organization; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view signatures from their organization" ON public.signatures FOR SELECT TO authenticated USING ((public.is_platform_admin() OR public.is_org_user(organization_id)));


--
-- Name: assemblies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.assemblies ENABLE ROW LEVEL SECURITY;

--
-- Name: assembly_attachments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.assembly_attachments ENABLE ROW LEVEL SECURITY;

--
-- Name: communications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.communications ENABLE ROW LEVEL SECURITY;

--
-- Name: documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

--
-- Name: events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

--
-- Name: group_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

--
-- Name: groups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

--
-- Name: member_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.member_history ENABLE ROW LEVEL SECURITY;

--
-- Name: members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;

--
-- Name: organization_users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organization_users ENABLE ROW LEVEL SECURITY;

--
-- Name: organizations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_announcements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.platform_announcements ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_campaign_media; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.platform_campaign_media ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_campaigns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.platform_campaigns ENABLE ROW LEVEL SECURITY;

--
-- Name: prayer_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.prayer_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: signatures; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.signatures ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict 2eXidAA8w3eQPIKLYDd4vOTJWlnIPvLZ2lh1d3tgLfBgYTRrNuLtZM1SyP7zdOT

