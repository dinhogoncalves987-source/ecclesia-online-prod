import { useState, useEffect } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2, Camera, Save } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { useOwnProfile, useInvalidateOwnProfile } from "@/hooks/useOwnProfile";

export default function Perfil() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { data: profile, isLoading: loading } = useOwnProfile(user?.id);
  const invalidateOwnProfile = useInvalidateOwnProfile();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  // Sincroniza o formulário com os dados reais do banco sempre que chegarem
  // (carga inicial e após qualquer invalidação/refetch da query compartilhada).
  useEffect(() => {
    if (!profile) return;
    setFullName(profile.full_name || "");
    setPhone(profile.phone || "");
    setRoleTitle(profile.role_title || "");
    setAvatarUrl(profile.avatar_url);
  }, [profile]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    const acceptedTypes = new Set(["image/png", "image/jpeg", "image/webp"]);
    if (!acceptedTypes.has(file.type)) {
      toast({
        title: t("Formato não suportado"),
        description: t("Use uma imagem PNG, JPG ou WEBP"),
        variant: "destructive",
      });
      e.target.value = "";
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: t("Imagem muito grande"),
        description: t("A foto deve ter no máximo 5MB"),
        variant: "destructive",
      });
      e.target.value = "";
      return;
    }

    setUploading(true);
    const extByType: Record<string, string> = {
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/webp": "webp",
    };
    const ext = extByType[file.type];
    const path = `${user.id}/avatar.${ext}`;

    try {
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });

      if (uploadError) {
        toast({ title: t("Erro ao enviar foto"), description: uploadError.message, variant: "destructive" });
        return;
      }

      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
      const url = `${urlData.publicUrl}?t=${Date.now()}`;
      const { error: updateError } = await supabase.rpc(
        "save_own_profile_avatar",
        { p_avatar_url: url },
      );

      if (updateError) {
        // Nunca mostrar sucesso sem persistência real confirmada.
        toast({
          title: t("Erro ao salvar foto"),
          description: updateError.message,
          variant: "destructive",
        });
        return;
      }

      setAvatarUrl(url);
      await invalidateOwnProfile(user.id);
      toast({ title: t("Foto atualizada!") });
    } catch (error) {
      toast({
        title: t("Erro ao enviar foto"),
        description: error instanceof Error ? error.message : t("Erro inesperado"),
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleSave = async () => {
    if (!user) return;
    if (!fullName.trim()) {
      toast({
        title: t("Nome completo é obrigatório"),
        variant: "destructive",
      });
      return;
    }
    setSaving(true);

    try {
      const { error } = await supabase.rpc("save_own_profile", {
        p_full_name: fullName.trim(),
        p_phone: phone.trim() || null,
        p_role_title: roleTitle.trim() || null,
      });

      if (error) {
        toast({
          title: t("Erro ao salvar"),
          description: error.message || t("Não foi possível salvar. Tente novamente."),
          variant: "destructive",
        });
        return;
      }

      // Só mostra sucesso DEPOIS de confirmar a persistência real no banco —
      // e recarrega a fonte única (React Query), que também atualiza o
      // cabeçalho/avatar/menu do AdminLayout imediatamente, sem novo login.
      await invalidateOwnProfile(user.id);
      toast({ title: t("Perfil atualizado com sucesso!") });
    } catch (error) {
      toast({
        title: t("Erro ao salvar"),
        description:
          error instanceof Error
            ? error.message
            : t("Não foi possível salvar. Tente novamente."),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const initials = fullName
    ? fullName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()
    : user?.email?.charAt(0).toUpperCase() || "?";

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="max-w-2xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-serif tracking-tight">{t("Meu Perfil")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("Gerencie suas informações pessoais")}</p>
        </div>

        {/* Avatar */}
        <div className="bg-card rounded-xl shadow-executive p-6 flex flex-col items-center gap-4">
          <div className="relative">
            {avatarUrl ? (
              <img src={avatarUrl} alt={t("Avatar")} className="w-24 h-24 rounded-full object-cover border-4 border-accent/30" />
            ) : (
              <div className="w-24 h-24 rounded-full bg-accent/20 border-4 border-accent/30 flex items-center justify-center text-2xl font-bold text-accent">
                {initials}
              </div>
            )}
            <label className="absolute bottom-0 right-0 w-8 h-8 bg-primary rounded-full flex items-center justify-center cursor-pointer hover:opacity-80 transition-opacity">
              {uploading ? (
                <Loader2 size={14} className="animate-spin text-primary-foreground" />
              ) : (
                <Camera size={14} className="text-primary-foreground" />
              )}
              <input type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
            </label>
          </div>
          <p className="text-xs text-muted-foreground">{t("Clique no ícone para alterar a foto")}</p>
        </div>

        {/* Form */}
        <div className="bg-card rounded-xl shadow-executive p-6 space-y-5">
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("Nome Completo")}</label>
            <input
              type="text"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              className="mt-1.5 w-full px-4 py-3 rounded-lg border border-input bg-background text-base focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("E-mail")}</label>
            <input
              type="email"
              value={user?.email || ""}
              disabled
              className="mt-1.5 w-full px-4 py-3 rounded-lg border border-input bg-secondary/50 text-base text-muted-foreground"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("Telefone")}</label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="(11) 99999-9999"
              className="mt-1.5 w-full px-4 py-3 rounded-lg border border-input bg-background text-base focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("Função na Igreja")}</label>
            <input
              type="text"
              value={roleTitle}
              onChange={e => setRoleTitle(e.target.value)}
              placeholder={t("Ex: Pastor, Diácono, Membro...")}
              className="mt-1.5 w-full px-4 py-3 rounded-lg border border-input bg-background text-base focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full sm:w-auto px-6 py-3 bg-primary text-primary-foreground rounded-lg text-base font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {t("Salvar Alterações")}
          </button>
        </div>
      </div>
    </AdminLayout>
  );
}
