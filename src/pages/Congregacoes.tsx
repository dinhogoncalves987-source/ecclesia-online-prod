import { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { useChurch } from "@/hooks/useChurchContext";
import { useLanguage } from "@/hooks/useLanguage";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { getPublicAppUrl } from "@/lib/publicUrl";
import { Navigate } from "react-router-dom";
import {
  AlertCircle,
  Building2,
  ChevronDown,
  Church as ChurchIcon,
  Edit,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Plus,
  Share2,
  Trash2,
} from "lucide-react";

type ChildOrganizationType = "matriz" | "setor" | "congregacao" | string;

interface ChildOrganization {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  state: string | null;
  phone: string | null;
  email: string | null;
  organization_type: ChildOrganizationType;
  parent_id: string | null;
}

export default function Congregacoes() {
  const { user } = useAuth();
  const { isAdmin, loading: roleLoading } = useRole();
  const { church, isMatriz } = useChurch();
  const { t } = useLanguage();
  const [activeOrgType, setActiveOrgType] = useState<string | null>(null);
  const [activeOrgTypeResolved, setActiveOrgTypeResolved] = useState(false);
  const [childOrganizations, setChildOrganizations] = useState<ChildOrganization[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Sub-congregações carregadas para cada setor expandido (chave = setor.id)
  const [sectorCongregations, setSectorCongregations] = useState<Record<string, ChildOrganization[]>>({});
  const [loadingCongregations, setLoadingCongregations] = useState<Record<string, boolean>>({});
  // Pre-loaded counts per sector (shown on the row before expanding)
  const [congregationCounts, setCongregationCounts] = useState<Record<string, number>>({});
  const [form, setForm] = useState({
    name: "",
    city: "",
    state: "",
    phone: "",
    email: "",
  });

  const isSetorContext = activeOrgType === "setor";
  const isConvencaoContext = activeOrgType === "convencao";
  const canManageChildUnits = isAdmin
    && (isMatriz || isSetorContext || isConvencaoContext)
    && (isMatriz || activeOrgTypeResolved);

  const pageTitle = (): string => {
    if (isConvencaoContext) return t("Matrizes Municipais");
    if (isMatriz) return t("Setores / Distritos");
    return t("Congregações");
  };

  const loadCongregationsForSector = useCallback(async (sectorId: string, force = false) => {
    if (!force && sectorCongregations[sectorId] !== undefined) return;
    setLoadingCongregations((prev) => ({ ...prev, [sectorId]: true }));
    const { data, error } = await supabase
      .from("organizations")
      .select("id,name,slug,city,state,phone,email,organization_type,parent_id")
      .eq("parent_id", sectorId)
      .eq("active", true)
      .eq("organization_type", "congregacao")
      .order("name");
    setLoadingCongregations((prev) => ({ ...prev, [sectorId]: false }));
    if (!error && data) {
      setSectorCongregations((prev) => ({
        ...prev,
        [sectorId]: data.map((row) => ({
          id: row.id, name: row.name, slug: row.slug ?? "",
          city: row.city, state: row.state, phone: row.phone,
          email: row.email, organization_type: row.organization_type,
          parent_id: row.parent_id,
        })),
      }));
      setCongregationCounts((prev) => ({ ...prev, [sectorId]: data.length }));
    }
  }, [sectorCongregations]);

  useEffect(() => {
    if (!church?.id) {
      setActiveOrgType(null);
      setActiveOrgTypeResolved(false);
      return;
    }
    setActiveOrgTypeResolved(false);
    let cancelled = false;
    void supabase
      .from("organizations")
      .select("organization_type")
      .eq("id", church.id)
      .single()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setActiveOrgType(null);
        } else {
          setActiveOrgType(data?.organization_type ?? null);
        }
        setActiveOrgTypeResolved(true);
      });
    return () => {
      cancelled = true;
    };
  }, [church?.id]);

  const loadChildOrganizations = useCallback(async () => {
    if (!church) return;

    setLoading(true);

    if (isMatriz) {
      const { data, error } = await supabase
        .from("organizations")
        .select("id,name,slug,city,state,phone,email,organization_type,parent_id")
        .eq("parent_id", church.id)
        .eq("active", true)
        .eq("organization_type", "setor")
        .order("name");

      if (error) {
        console.error(error);
        toast({ title: t("Erro ao carregar"), description: error.message, variant: "destructive" });
        setChildOrganizations([]);
      } else if (data) {
        const sectors = data.map((row) => ({
          id: row.id, name: row.name, slug: row.slug ?? "",
          city: row.city, state: row.state, phone: row.phone,
          email: row.email, organization_type: row.organization_type,
          parent_id: row.parent_id,
        }));
        setChildOrganizations(sectors);
        // Pre-load congregation counts for all sectors
        const sectorIds = sectors.map((s) => s.id);
        if (sectorIds.length > 0) {
          const { data: congs } = await supabase
            .from("organizations")
            .select("id,parent_id")
            .in("parent_id", sectorIds)
            .eq("active", true)
            .eq("organization_type", "congregacao");
          if (congs) {
            const counts: Record<string, number> = {};
            for (const c of congs) { counts[c.parent_id!] = (counts[c.parent_id!] ?? 0) + 1; }
            setCongregationCounts(counts);
          }
        }
      }
      setLoading(false);
      return;
    }

    if (activeOrgType === "convencao") {
      const { data, error } = await supabase
        .from("organizations")
        .select("id,name,slug,city,state,phone,email,organization_type,parent_id")
        .eq("parent_id", church.id)
        .eq("active", true)
        .eq("organization_type", "matriz")
        .order("name");

      if (error) {
        console.error(error);
        toast({ title: t("Erro ao carregar"), description: error.message, variant: "destructive" });
        setChildOrganizations([]);
      } else if (data) {
        setChildOrganizations(
          data.map((row) => ({
            id: row.id,
            name: row.name,
            slug: row.slug ?? "",
            city: row.city,
            state: row.state,
            phone: row.phone,
            email: row.email,
            organization_type: row.organization_type,
            parent_id: row.parent_id,
          })),
        );
      }
      setLoading(false);
      return;
    }

    if (activeOrgType === "setor") {
      const { data, error } = await supabase
        .from("organizations")
        .select("id,name,slug,city,state,phone,email,organization_type,parent_id")
        .eq("parent_id", church.id)
        .eq("active", true)
        .eq("organization_type", "congregacao")
        .order("name");

      if (error) {
        console.error(error);
        toast({ title: t("Erro ao carregar"), description: error.message, variant: "destructive" });
        setChildOrganizations([]);
      } else if (data) {
        setChildOrganizations(
          data.map((row) => ({
            id: row.id,
            name: row.name,
            slug: row.slug ?? "",
            city: row.city,
            state: row.state,
            phone: row.phone,
            email: row.email,
            organization_type: row.organization_type,
            parent_id: row.parent_id,
          })),
        );
      }
      setLoading(false);
      return;
    }

    setChildOrganizations([]);
    setLoading(false);
  }, [church, isMatriz, activeOrgType, t]);

  useEffect(() => {
    if (roleLoading) return;
    if (!user || !church) {
      setLoading(false);
      return;
    }
    if (!isMatriz && !activeOrgTypeResolved) return;
    void loadChildOrganizations();
  }, [user, roleLoading, church, isMatriz, activeOrgType, activeOrgTypeResolved, loadChildOrganizations]);

  const generateSlug = (name: string) =>
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

  const insertOrganizationType = (): "matriz" | "setor" | "congregacao" => {
    if (isMatriz) return "setor";
    if (isConvencaoContext) return "matriz";
    return "congregacao";
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({ title: t("Nome é obrigatório"), variant: "destructive" });
      return;
    }

    const slug = generateSlug(form.name) + "-" + Date.now().toString(36);

    if (editingId) {
      const { error } = await supabase
        .from("organizations")
        .update({
          name: form.name,
          city: form.city || null,
          state: form.state || null,
          phone: form.phone || null,
          email: form.email || null,
        })
        .eq("id", editingId);

      if (error) {
        toast({ title: t("Erro ao atualizar"), description: error.message, variant: "destructive" });
      } else {
        toast({ title: t("Dados da unidade atualizados.") });
      }
    } else {
      const orgType = insertOrganizationType();
      const { error } = await supabase.from("organizations").insert({
        name: form.name,
        slug,
        parent_id: church!.id,
        organization_type: orgType,
        city: form.city || null,
        state: form.state || null,
        phone: form.phone || null,
        email: form.email || null,
        active: true,
      });

      if (error) {
        toast({ title: t("Erro ao criar congregação"), description: error.message, variant: "destructive" });
      } else {
        const createdTitle =
          orgType === "setor" ? t("Setor criado.") : orgType === "matriz" ? t("Matriz municipal criada.") : t("Congregação criada.");
        toast({
          title: createdTitle,
          description: t("A unidade permanece no sistema; responsáveis serão definidos em outro fluxo."),
        });
      }
    }

    setForm({ name: "", city: "", state: "", phone: "", email: "" });
    setShowForm(false);
    setEditingId(null);
    void loadChildOrganizations();
  };

  const handleEdit = (c: ChildOrganization) => {
    setForm({
      name: c.name,
      city: c.city || "",
      state: c.state || "",
      phone: c.phone || "",
      email: c.email || "",
    });
    setEditingId(c.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("organizations").delete().eq("id", id);
    if (error) {
      toast({ title: t("Erro ao excluir"), description: error.message, variant: "destructive" });
    } else {
      toast({ title: t("Unidade excluída.") });
      void loadChildOrganizations();
    }
  };

  const handleShareInvite = (c: ChildOrganization) => {
    const url = `${getPublicAppUrl()}/signup?church=${encodeURIComponent(c.slug)}`;
    navigator.clipboard.writeText(url);
    toast({
      title: t("Link copiado!"),
      description: t("Link de cadastro nesta unidade. Membros e convites não substituem a definição de gestores no sistema."),
    });
  };

  const typeBadgeLabel = (orgType: string) => {
    if (orgType === "convencao") return t("Convenção / Regional");
    if (orgType === "matriz") return t("Matriz municipal");
    if (orgType === "setor") return t("Setor");
    if (orgType === "congregacao") return t("Congregação");
    return orgType;
  };

  const pageSubtitle = () => {
    if (isConvencaoContext) return t("Cadastre matrizes municipais vinculadas a esta convenção ou regional. Unidades são permanentes; responsáveis serão atribuídos separadamente da estrutura.");
    if (isMatriz) return t("Cadastre setores vinculados a esta matriz. Unidades são permanentes; pastores, supervisores e tesoureiros podem mudar sem recriar a unidade.");
    if (isSetorContext) return t("Cadastre congregações vinculadas a este setor. Unidades são permanentes; responsáveis serão atribuídos separadamente da estrutura.");
    return t("Esta congregação não cria novas unidades. Membros, tesouraria e histórico permanecem na unidade quando os responsáveis mudam.");
  };

  const emptyListMessage = () => {
    if (isConvencaoContext) return t("Nenhuma matriz municipal cadastrada.");
    if (isMatriz) return t("Nenhum setor cadastrado.");
    if (isSetorContext) return t("Nenhuma congregação cadastrada");
    return t("Não há unidades filhas neste nível.");
  };

  const newUnitButtonLabel = () => {
    if (isConvencaoContext) return t("Nova matriz municipal");
    if (isMatriz) return t("Novo setor");
    return t("Nova congregação");
  };

  const formTitle = () => {
    if (editingId) return t("Editar unidade");
    if (isConvencaoContext) return t("Nova matriz municipal");
    if (isMatriz) return t("Novo setor");
    return t("Nova congregação");
  };

  const primarySaveLabel = () => {
    if (editingId) return t("Salvar Alterações");
    if (isConvencaoContext) return t("Criar matriz municipal");
    if (isMatriz) return t("Criar setor");
    return t("Criar congregação");
  };

  if (!roleLoading && !isAdmin) {
    return <Navigate to="/admin" replace />;
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-serif tracking-tight flex items-center gap-2">
              <Building2 size={28} className="text-accent" />
              {pageTitle()}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">{pageSubtitle()}</p>
          </div>
          {canManageChildUnits && (
            <button
              onClick={() => {
                setShowForm(!showForm);
                setEditingId(null);
                setForm({ name: "", city: "", state: "", phone: "", email: "" });
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <Plus size={16} /> {newUnitButtonLabel()}
            </button>
          )}
        </div>

        {/* Form */}
        {showForm && (
          <div className="bg-card rounded-xl shadow-executive p-5 space-y-4">
            <h2 className="font-medium text-sm">{formTitle()}</h2>
            <p className="text-xs text-muted-foreground">
              {t("Os dados abaixo identificam a unidade (nome e contatos institucionais). Gestores e histórico de gestão não são alterados ao editar este cadastro.")}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder={
                  isConvencaoContext ? t("Nome da matriz municipal *") : isMatriz ? t("Nome do setor *") : t("Nome da congregação *")
                }
                className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
              />
              <input
                value={form.city}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                placeholder={t("Cidade")}
                className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
              />
              <input
                value={form.state}
                onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
                placeholder={t("Estado")}
                className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
              />
              <input
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder={t("Telefone")}
                className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
              />
              <input
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder={t("E-mail")}
                className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => void handleSave()}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
              >
                {primarySaveLabel()}
              </button>
              <button
                onClick={() => {
                  setShowForm(false);
                  setEditingId(null);
                }}
                className="px-4 py-2 bg-secondary text-foreground rounded-lg text-sm hover:bg-secondary/80 transition-colors"
              >
                {t("Cancelar")}
              </button>
            </div>
          </div>
        )}

        {/* Child organizations list */}
        <div className="bg-card rounded-xl shadow-executive overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="animate-spin text-muted-foreground" />
            </div>
          ) : childOrganizations.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Building2 size={48} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">{emptyListMessage()}</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {childOrganizations.map((c) => {
                const isExpanded = expandedId === c.id;
                return (
                  <div key={c.id} className="transition-colors">
                    {/* Cabeçalho da linha — clicável para expandir */}
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        const next = isExpanded ? null : c.id;
                        setExpandedId(next);
                        if (next && isMatriz && c.organization_type === "setor") {
                          void loadCongregationsForSector(c.id, true);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        const next = isExpanded ? null : c.id;
                        setExpandedId(next);
                        if (next && isMatriz && c.organization_type === "setor") {
                          void loadCongregationsForSector(c.id, true);
                        }
                      }}
                      className="p-4 hover:bg-secondary/30 transition-colors cursor-pointer select-none"
                    >
                      <div className="flex items-start gap-4">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${isExpanded ? "bg-accent/30" : "bg-accent/20"}`}>
                          <ChurchIcon size={20} className="text-accent" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold">{c.name}</p>
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground font-semibold shrink-0">
                              {typeBadgeLabel(c.organization_type)}
                            </span>
                            {isMatriz && c.organization_type === "setor" && congregationCounts[c.id] !== undefined && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent/15 text-accent font-semibold shrink-0">
                                {congregationCounts[c.id]} congreg.
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                            {c.city && (
                              <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                                <MapPin size={10} /> {c.city}
                                {c.state ? `, ${c.state}` : ""}
                              </span>
                            )}
                            {c.phone && (
                              <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                                <Phone size={10} /> {c.phone}
                              </span>
                            )}
                            {c.email && (
                              <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                                <Mail size={10} /> {c.email}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <span className="text-[11px] text-muted-foreground mr-1 hidden sm:inline">
                            {isExpanded ? "Recolher" : "Ver detalhes"}
                          </span>
                          <ChevronDown
                            size={15}
                            className={`text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Painel expandido — detalhes + ações operacionais */}
                    {isExpanded && (
                      <div className="bg-muted/30 border-t border-border/40 px-4 pb-4 pt-3 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                          <div>
                            <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-0.5">
                              Nome
                            </p>
                            <p className="font-medium">{c.name}</p>
                          </div>
                          {(c.city || c.state) && (
                            <div>
                              <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-0.5">
                                Localização
                              </p>
                              <p className="font-medium">
                                {[c.city, c.state].filter(Boolean).join(", ")}
                              </p>
                            </div>
                          )}
                          <div>
                            <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-0.5">
                              Tipo
                            </p>
                            <p className="font-medium">{typeBadgeLabel(c.organization_type)}</p>
                          </div>
                          {c.phone && (
                            <div>
                              <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-0.5">
                                Telefone
                              </p>
                              <p className="font-medium">{c.phone}</p>
                            </div>
                          )}
                          {c.email && (
                            <div>
                              <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-0.5">
                                Email
                              </p>
                              <p className="font-medium">{c.email}</p>
                            </div>
                          )}
                        </div>

                        {canManageChildUnits && (
                          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border/40">
                            <button
                              onClick={(e) => { e.stopPropagation(); handleShareInvite(c); }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
                            >
                              <Share2 size={13} />
                              {t("Convidar responsável")}
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleEdit(c); setExpandedId(null); }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-foreground text-xs font-medium hover:bg-secondary/80 transition-colors border border-border"
                            >
                              <Edit size={13} />
                              {t("Editar dados")}
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); void handleDelete(c.id); }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-destructive text-xs font-medium hover:bg-destructive/10 transition-colors border border-destructive/30"
                            >
                              <Trash2 size={13} />
                              {t("Remover unidade")}
                            </button>
                          </div>
                        )}

                        <p className="text-[10px] text-muted-foreground">
                          O link de "Convidar responsável" direciona ao cadastro nesta unidade.
                          Defina o acesso do gestor em{" "}
                          <strong>Configurações → Gerenciar Acessos</strong> após o cadastro.
                        </p>

                        {/* Congregações vinculadas (apenas para setores sob Matriz) */}
                        {isMatriz && c.organization_type === "setor" && (
                          <div className="mt-3 pt-3 border-t border-border/30">
                            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                              <ChurchIcon size={11} />
                              Congregações vinculadas
                            </p>
                            {loadingCongregations[c.id] ? (
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Loader2 size={12} className="animate-spin" />
                                Carregando congregações...
                              </div>
                            ) : !sectorCongregations[c.id] ? (
                              <p className="text-xs text-muted-foreground">Clique para expandir e carregar.</p>
                            ) : sectorCongregations[c.id].length === 0 ? (
                              <p className="text-xs text-amber-600 flex items-center gap-1.5">
                                <AlertCircle size={12} />
                                Nenhuma congregação vinculada a este setor.
                              </p>
                            ) : (
                              <div className="space-y-2">
                                {sectorCongregations[c.id].map((cong) => (
                                  <div key={cong.id} className="flex items-start justify-between gap-3 rounded-lg bg-background/60 px-3 py-2 border border-border/40">
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium truncate">{cong.name}</p>
                                      <div className="flex flex-wrap gap-x-3 mt-0.5">
                                        {cong.city && (
                                          <span className="text-[11px] text-muted-foreground flex items-center gap-0.5">
                                            <MapPin size={9} /> {cong.city}{cong.state ? `, ${cong.state}` : ""}
                                          </span>
                                        )}
                                        {cong.phone && (
                                          <span className="text-[11px] text-muted-foreground flex items-center gap-0.5">
                                            <Phone size={9} /> {cong.phone}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    <div className="flex gap-1 flex-shrink-0">
                                      <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); handleShareInvite(cong); }}
                                        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                                      >
                                        <Share2 size={10} />
                                        Convidar
                                      </button>
                                      <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); handleEdit(cong); setExpandedId(null); }}
                                        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                                      >
                                        <Edit size={10} />
                                        Editar
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Current unit info */}
        {church && (
          <div className="bg-card rounded-xl shadow-executive p-5">
            <h2 className="font-medium text-sm mb-3 flex items-center gap-2">
              <ChurchIcon size={16} className="text-accent" />
              Unidade atual
            </h2>
            <p className="text-xs text-muted-foreground mb-3">
              A unidade (convenção, matriz municipal, setor ou congregação) é permanente no sistema. Quem administra
              pode mudar sem transferir membros, tesouraria ou histórico para outra organização.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">{t("Nome")}</p>
                <p className="font-medium">{church.name}</p>
              </div>
              {church.pastor_name && (
                <div>
                  <p className="text-xs text-muted-foreground">Referência de contato (opcional)</p>
                  <p className="font-medium">{church.pastor_name}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Não indica titularidade da unidade; gestores são definidos em outro fluxo.
                  </p>
                </div>
              )}
              {church.city && (
                <div>
                  <p className="text-xs text-muted-foreground">{t("Cidade")}</p>
                  <p className="font-medium">
                    {church.city}
                    {church.state ? `, ${church.state}` : ""}
                  </p>
                </div>
              )}
              <div>
                <p className="text-xs text-muted-foreground">
                  {isConvencaoContext
                    ? "Total de matrizes municipais nesta convenção"
                    : isMatriz
                      ? "Total de setores nesta matriz"
                      : isSetorContext
                        ? "Total de congregações neste setor"
                        : "Unidades filhas"}
                </p>
                <p className="font-medium">{childOrganizations.length}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
