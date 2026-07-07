import { useState, useEffect, useRef, type ChangeEvent } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { useChurch } from "@/hooks/useChurchContext";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getDocumentBranding } from "@/lib/documentBranding";
import {
  Building2, Upload, Save, Loader2, ImageIcon, Phone, Mail,
  Globe, MapPin, Hash, User, FileText, Eye,
} from "lucide-react";

// ── Tipos ────────────────────────────────────────────────────────────────────

interface OrgForm {
  name: string;
  short_name: string;
  acronym: string;
  cnpj: string;
  street: string;
  address_number: string;
  address_complement: string;
  neighborhood: string;
  city: string;
  state: string;
  zip_code: string;
  phone: string;
  email: string;
  website_url: string;
  pastor_president_name: string;
}

const EMPTY_FORM: OrgForm = {
  name: "", short_name: "", acronym: "", cnpj: "",
  street: "", address_number: "", address_complement: "",
  neighborhood: "", city: "", state: "", zip_code: "",
  phone: "", email: "", website_url: "", pastor_president_name: "",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatCnpj(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

// ── Componente ───────────────────────────────────────────────────────────────

export default function ConfiguracaoIgreja() {
  const { church, refetch } = useChurch();
  const { user } = useAuth();
  const { t } = useLanguage();

  const [form, setForm] = useState<OrgForm>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [activeTab, setActiveTab] = useState<"dados" | "visual">("dados");

  const logoInputRef = useRef<HTMLInputElement>(null);

  // ── Carregar dados atuais da organização ──────────────────────────────────

  useEffect(() => {
    if (!church) return;

    const fetchOrg = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("organizations")
        .select("name,short_name,acronym,cnpj,street,address_number,address_complement,neighborhood,city,state,zip_code,phone,email,website_url,logo_url,pastor_president_name")
        .eq("id", church.id)
        .maybeSingle();

      if (error) {
        console.error("[ConfiguracaoIgreja] Erro ao carregar:", error);
        toast.error(t("Erro ao carregar configurações da igreja"));
        setLoading(false);
        return;
      }

      if (data) {
        setForm({
          name: data.name ?? "",
          short_name: (data as any).short_name ?? "",
          acronym: (data as any).acronym ?? "",
          cnpj: data.cnpj ?? "",
          street: (data as any).street ?? "",
          address_number: (data as any).address_number ?? "",
          address_complement: (data as any).address_complement ?? "",
          neighborhood: (data as any).neighborhood ?? "",
          city: (data as any).city ?? "",
          state: (data as any).state ?? "",
          zip_code: (data as any).zip_code ?? "",
          phone: (data as any).phone ?? "",
          email: (data as any).email ?? "",
          website_url: (data as any).website_url ?? "",
          pastor_president_name: (data as any).pastor_president_name ?? "",
        });
        setLogoUrl((data as any).logo_url ?? null);
      }
      setLoading(false);
    };

    fetchOrg();
  }, [church, t]);

  // ── Salvar ────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!church) return;
    if (!form.name.trim()) { toast.error(t("Nome da igreja é obrigatório")); return; }

    setSaving(true);
    const { error } = await supabase
      .from("organizations")
      .update({
        name: form.name.trim(),
        short_name: form.short_name.trim() || null,
        acronym: form.acronym.trim() || null,
        cnpj: form.cnpj.trim() || null,
        street: form.street.trim() || null,
        address_number: form.address_number.trim() || null,
        address_complement: form.address_complement.trim() || null,
        neighborhood: form.neighborhood.trim() || null,
        city: form.city.trim() || null,
        state: form.state.trim() || null,
        zip_code: form.zip_code.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        website_url: form.website_url.trim() || null,
        pastor_president_name: form.pastor_president_name.trim() || null,
      } as any)
      .eq("id", church.id);

    setSaving(false);

    if (error) {
      console.error("[ConfiguracaoIgreja] Erro ao salvar:", error);
      toast.error(`Erro ao salvar: ${error.message}`);
      return;
    }

    toast.success(t("Configurações salvas com sucesso"));
    refetch();
  };

  // ── Upload de logo ────────────────────────────────────────────────────────

  const handleLogoUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    if (!church || !user) return;
    const file = e.target.files?.[0];
    if (!file) return;

    const maxMb = 2;
    if (file.size > maxMb * 1024 * 1024) {
      toast.error(`Logo deve ter no máximo ${maxMb}MB`);
      return;
    }

    const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
    const path = `organization-logos/${church.id}/logo.${ext}`;

    setUploadingLogo(true);
    const { error: uploadError } = await supabase.storage
      .from("organization-assets")
      .upload(path, file, { upsert: true, contentType: file.type });

    if (uploadError) {
      console.error("[ConfiguracaoIgreja] Erro no upload:", uploadError);
      toast.error(`Erro ao subir logo: ${uploadError.message}`);
      setUploadingLogo(false);
      return;
    }

    const { data: urlData } = supabase.storage
      .from("organization-assets")
      .getPublicUrl(path);

    const publicUrl = urlData.publicUrl + `?t=${Date.now()}`;

    const { error: updateError } = await supabase
      .from("organizations")
      .update({ logo_url: publicUrl } as any)
      .eq("id", church.id);

    if (updateError) {
      toast.error(`Erro ao salvar URL do logo: ${updateError.message}`);
      setUploadingLogo(false);
      return;
    }

    setLogoUrl(publicUrl);
    setUploadingLogo(false);
    toast.success("Logo atualizado com sucesso");
    refetch();
  };

  // ── Preview de identidade ─────────────────────────────────────────────────

  const branding = getDocumentBranding({
    name: form.name || church?.name || "Igreja",
    short_name: form.short_name || null,
    acronym: form.acronym || null,
    logo_url: logoUrl,
    cnpj: form.cnpj || null,
    street: form.street || null,
    address_number: form.address_number || null,
    address_complement: form.address_complement || null,
    neighborhood: form.neighborhood || null,
    city: form.city || null,
    state: form.state || null,
    zip_code: form.zip_code || null,
    phone: form.phone || null,
    email: form.email || null,
    pastor_president_name: form.pastor_president_name || null,
  });

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-muted-foreground" size={32} />
        </div>
      </AdminLayout>
    );
  }

  const fieldCls = "w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 placeholder:text-muted-foreground";
  const labelCls = "block text-xs font-medium text-muted-foreground mb-1";

  return (
    <AdminLayout>
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">

        {/* Cabeçalho */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Building2 size={20} className="text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">{t("Identidade visual da igreja")}</h1>
              <p className="text-sm text-muted-foreground">
                {t("Dados institucionais usados em documentos, carteira e relatórios")}
              </p>
            </div>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {t("Salvar")}
          </button>
        </div>

        {/* Abas */}
        <div className="flex gap-1 border-b border-border">
          {(["dados", "visual"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab === "dados" ? t("Dados institucionais") : t("Logo & visual")}
            </button>
          ))}
        </div>

        {/* Aba: Dados institucionais */}
        {activeTab === "dados" && (
          <div className="space-y-6">

            {/* Identificação */}
            <section className="bg-card border border-border rounded-xl p-6 space-y-4">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <FileText size={14} className="text-muted-foreground" />
                {t("Identificação")}
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className={labelCls}>{t("Nome oficial *")}</label>
                  <input
                    className={fieldCls}
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="Assembleia de Deus — Igreja Central"
                  />
                </div>
                <div>
                  <label className={labelCls}>{t("Nome curto")}</label>
                  <input
                    className={fieldCls}
                    value={form.short_name}
                    onChange={e => setForm(f => ({ ...f, short_name: e.target.value }))}
                    placeholder="AD Central"
                  />
                </div>
                <div>
                  <label className={labelCls}>{t("Sigla / iniciais")}</label>
                  <input
                    className={fieldCls}
                    value={form.acronym}
                    onChange={e => setForm(f => ({ ...f, acronym: e.target.value.toUpperCase() }))}
                    placeholder="IEADCS"
                    maxLength={10}
                  />
                </div>
                <div>
                  <label className={labelCls}>{t("CNPJ")}</label>
                  <input
                    className={fieldCls}
                    value={form.cnpj}
                    onChange={e => setForm(f => ({ ...f, cnpj: formatCnpj(e.target.value) }))}
                    placeholder="00.000.000/0000-00"
                    maxLength={18}
                  />
                </div>
              </div>
            </section>

            {/* Responsável */}
            <section className="bg-card border border-border rounded-xl p-6 space-y-4">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <User size={14} className="text-muted-foreground" />
                {t("Responsável")}
              </h2>
              <div>
                <label className={labelCls}>{t("Pastor presidente")}</label>
                <input
                  className={fieldCls}
                  value={form.pastor_president_name}
                  onChange={e => setForm(f => ({ ...f, pastor_president_name: e.target.value }))}
                  placeholder="Rev. João da Silva"
                />
              </div>
            </section>

            {/* Endereço */}
            <section className="bg-card border border-border rounded-xl p-6 space-y-4">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <MapPin size={14} className="text-muted-foreground" />
                {t("Endereço")}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className={labelCls}>{t("Logradouro")}</label>
                  <input
                    className={fieldCls}
                    value={form.street}
                    onChange={e => setForm(f => ({ ...f, street: e.target.value }))}
                    placeholder="Rua das Flores"
                  />
                </div>
                <div>
                  <label className={labelCls}>{t("Número")}</label>
                  <input
                    className={fieldCls}
                    value={form.address_number}
                    onChange={e => setForm(f => ({ ...f, address_number: e.target.value }))}
                    placeholder="123"
                  />
                </div>
                <div>
                  <label className={labelCls}>{t("Complemento")}</label>
                  <input
                    className={fieldCls}
                    value={form.address_complement}
                    onChange={e => setForm(f => ({ ...f, address_complement: e.target.value }))}
                    placeholder="Sala 1"
                  />
                </div>
                <div>
                  <label className={labelCls}>{t("Bairro")}</label>
                  <input
                    className={fieldCls}
                    value={form.neighborhood}
                    onChange={e => setForm(f => ({ ...f, neighborhood: e.target.value }))}
                    placeholder="Centro"
                  />
                </div>
                <div>
                  <label className={labelCls}>{t("CEP")}</label>
                  <input
                    className={fieldCls}
                    value={form.zip_code}
                    onChange={e => setForm(f => ({ ...f, zip_code: e.target.value }))}
                    placeholder="00000-000"
                    maxLength={9}
                  />
                </div>
                <div>
                  <label className={labelCls}>{t("Cidade")}</label>
                  <input
                    className={fieldCls}
                    value={form.city}
                    onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                    placeholder="São Paulo"
                  />
                </div>
                <div>
                  <label className={labelCls}>{t("Estado (UF)")}</label>
                  <input
                    className={fieldCls}
                    value={form.state}
                    onChange={e => setForm(f => ({ ...f, state: e.target.value.toUpperCase() }))}
                    placeholder="SP"
                    maxLength={2}
                  />
                </div>
              </div>
            </section>

            {/* Contato */}
            <section className="bg-card border border-border rounded-xl p-6 space-y-4">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Phone size={14} className="text-muted-foreground" />
                {t("Contato")}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>{t("Telefone")}</label>
                  <input
                    className={fieldCls}
                    value={form.phone}
                    onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder="(00) 00000-0000"
                  />
                </div>
                <div>
                  <label className={labelCls}>{t("E-mail institucional")}</label>
                  <input
                    className={fieldCls}
                    type="email"
                    value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="contato@igreja.org"
                  />
                </div>
                <div>
                  <label className={labelCls}>{t("Site")}</label>
                  <input
                    className={fieldCls}
                    value={form.website_url}
                    onChange={e => setForm(f => ({ ...f, website_url: e.target.value }))}
                    placeholder="https://www.igreja.org"
                  />
                </div>
              </div>
            </section>

          </div>
        )}

        {/* Aba: Logo & visual */}
        {activeTab === "visual" && (
          <div className="space-y-6">

            {/* Upload de logo */}
            <section className="bg-card border border-border rounded-xl p-6 space-y-4">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <ImageIcon size={14} className="text-muted-foreground" />
                {t("Logo principal")}
              </h2>
              <p className="text-xs text-muted-foreground">
                {t("Usado na carteira de membro, documentos e cabeçalhos. PNG ou JPEG, máx. 2 MB.")}
              </p>

              <div className="flex items-start gap-6">
                {/* Preview */}
                <div className="w-24 h-24 rounded-xl border-2 border-dashed border-border bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
                  {logoUrl ? (
                    <img
                      src={logoUrl}
                      alt="Logo"
                      className="w-full h-full object-contain p-1"
                    />
                  ) : (
                    <ImageIcon size={32} className="text-muted-foreground/40" />
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={handleLogoUpload}
                  />
                  <button
                    onClick={() => logoInputRef.current?.click()}
                    disabled={uploadingLogo}
                    className="inline-flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm hover:bg-muted transition-colors disabled:opacity-60"
                  >
                    {uploadingLogo
                      ? <Loader2 size={14} className="animate-spin" />
                      : <Upload size={14} />
                    }
                    {uploadingLogo ? t("Enviando...") : t("Escolher logo")}
                  </button>
                  {logoUrl && (
                    <p className="text-xs text-muted-foreground break-all max-w-xs">{logoUrl}</p>
                  )}
                </div>
              </div>
            </section>

            {/* Preview de identidade visual */}
            <section className="bg-card border border-border rounded-xl p-6 space-y-4">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Eye size={14} className="text-muted-foreground" />
                {t("Prévia da identidade visual")}
              </h2>
              <p className="text-xs text-muted-foreground mb-4">
                {t("Como os dados serão exibidos em documentos e relatórios")}
              </p>

              <div className="border border-border rounded-lg p-5 bg-background space-y-3">
                <div className="flex items-center gap-4">
                  {branding.logoUrl ? (
                    <img
                      src={branding.logoUrl}
                      alt="Logo"
                      className="w-14 h-14 object-contain rounded"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded bg-muted flex items-center justify-center">
                      <Building2 size={24} className="text-muted-foreground/40" />
                    </div>
                  )}
                  <div>
                    <p className="font-semibold text-base leading-tight">{branding.officialName}</p>
                    {branding.acronym && (
                      <p className="text-xs text-muted-foreground font-mono">{branding.acronym}</p>
                    )}
                    {branding.pastorPresidentName && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {t("Pastor:")} {branding.pastorPresidentName}
                      </p>
                    )}
                  </div>
                </div>

                <div className="border-t border-border pt-3 space-y-1 text-xs text-muted-foreground">
                  {branding.address && <p><MapPin size={10} className="inline mr-1" />{branding.address}</p>}
                  {(branding.city || branding.state) && (
                    <p>{[branding.city, branding.state].filter(Boolean).join(" - ")}</p>
                  )}
                  {branding.phone && <p><Phone size={10} className="inline mr-1" />{branding.phone}</p>}
                  {branding.email && <p><Mail size={10} className="inline mr-1" />{branding.email}</p>}
                  {branding.cnpj && <p><Hash size={10} className="inline mr-1" />CNPJ: {branding.cnpj}</p>}
                </div>

                <div className="border-t border-border pt-2">
                  <p className="text-[10px] text-muted-foreground/70 italic">{branding.footerText}</p>
                </div>
              </div>
            </section>

          </div>
        )}

      </div>
    </AdminLayout>
  );
}
