import { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { useChurch } from "@/hooks/useChurchContext";
import { useLanguage } from "@/hooks/useLanguage";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Navigate } from "react-router-dom";
import {
  Church as ChurchIcon,
  Plus,
  Loader2,
  MapPin,
  Phone,
  Mail,
  Share2,
  Trash2,
  Edit,
  Building2,
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
  const [form, setForm] = useState({
    name: "",
    city: "",
    state: "",
    phone: "",
    email: "",
  });

  const isSetorContext = activeOrgType === "setor";
  const isConvencaoContext = activeOrgType === "convencao";
  const canManageChildUnits = isAdmin && (isMatriz || isSetorContext || isConvencaoContext);

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
        toast({ title: "Dados da unidade atualizados." });
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
          orgType === "setor" ? "Setor criado." : orgType === "matriz" ? "Matriz municipal criada." : "Congregação criada.";
        toast({
          title: createdTitle,
          description: "A unidade permanece no sistema; responsáveis serão definidos em outro fluxo.",
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
      toast({ title: "Unidade excluída." });
      void loadChildOrganizations();
    }
  };

  const handleShareInvite = (c: ChildOrganization) => {
    const url = `${window.location.origin}/signup?church=${c.slug}`;
    navigator.clipboard.writeText(url);
    toast({
      title: t("Link copiado!"),
      description:
        "Link de cadastro nesta unidade. Membros e convites não substituem a definição de gestores no sistema.",
    });
  };

  const typeBadgeLabel = (orgType: string) => {
    if (orgType === "convencao") return "Convenção / Regional";
    if (orgType === "matriz") return "Matriz municipal";
    if (orgType === "setor") return "Setor";
    if (orgType === "congregacao") return t("Congregação");
    return orgType;
  };

  const pageSubtitle = () => {
    if (isConvencaoContext) {
      return "Cadastre matrizes municipais vinculadas a esta convenção ou regional. Unidades são permanentes; responsáveis serão atribuídos separadamente da estrutura.";
    }
    if (isMatriz) {
      return "Cadastre setores vinculados a esta matriz. Unidades são permanentes; pastores, supervisores e tesoureiros podem mudar sem recriar a unidade.";
    }
    if (isSetorContext) {
      return "Cadastre congregações vinculadas a este setor. Unidades são permanentes; responsáveis serão atribuídos separadamente da estrutura.";
    }
    return "Esta congregação não cria novas unidades. Membros, tesouraria e histórico permanecem na unidade quando os responsáveis mudam.";
  };

  const emptyListMessage = () => {
    if (isConvencaoContext) return "Nenhuma matriz municipal cadastrada.";
    if (isMatriz) return "Nenhum setor cadastrado.";
    if (isSetorContext) return t("Nenhuma congregação cadastrada");
    return "Não há unidades filhas neste nível.";
  };

  const newUnitButtonLabel = () => {
    if (isConvencaoContext) return "Nova matriz municipal";
    if (isMatriz) return "Novo setor";
    return "Nova congregação";
  };

  const formTitle = () => {
    if (editingId) return "Editar unidade";
    if (isConvencaoContext) return "Nova matriz municipal";
    if (isMatriz) return "Novo setor";
    return "Nova congregação";
  };

  const primarySaveLabel = () => {
    if (editingId) return t("Salvar Alterações");
    if (isConvencaoContext) return "Criar matriz municipal";
    if (isMatriz) return "Criar setor";
    return "Criar congregação";
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
              {t("Congregações")}
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
              Os dados abaixo identificam a unidade (nome e contatos institucionais). Gestores e histórico de gestão não
              são alterados ao editar este cadastro.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder={
                  isConvencaoContext ? "Nome da matriz municipal *" : isMatriz ? "Nome do setor *" : "Nome da congregação *"
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
              {childOrganizations.map((c) => (
                <div key={c.id} className="p-4 hover:bg-secondary/20 transition-colors">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center flex-shrink-0">
                      <ChurchIcon size={20} className="text-accent" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium">{c.name}</p>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground font-semibold shrink-0">
                          {typeBadgeLabel(c.organization_type)}
                        </span>
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
                    {canManageChildUnits && (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => handleShareInvite(c)}
                          className="p-2 rounded-lg hover:bg-secondary transition-colors"
                          title={t("Copiar link de convite")}
                        >
                          <Share2 size={14} className="text-muted-foreground" />
                        </button>
                        <button
                          onClick={() => handleEdit(c)}
                          className="p-2 rounded-lg hover:bg-secondary transition-colors"
                          title={t("Editar")}
                        >
                          <Edit size={14} className="text-muted-foreground" />
                        </button>
                        <button
                          onClick={() => void handleDelete(c.id)}
                          className="p-2 rounded-lg hover:bg-destructive/10 transition-colors"
                          title={t("Excluir")}
                        >
                          <Trash2 size={14} className="text-destructive" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
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
