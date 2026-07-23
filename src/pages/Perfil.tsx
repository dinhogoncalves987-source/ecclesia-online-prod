import { useState, useEffect } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2, Camera, Save } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { useOwnProfile, useInvalidateOwnProfile } from "@/hooks/useOwnProfile";
import { updateOwnProfile } from "@/lib/ownProfileMutations";

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

    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${user.id}/avatar.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true });

    if (uploadError) {
      toast({ title: t("Erro ao enviar foto"), description: uploadError.message, variant: "destructive" });
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
    const url = urlData.publicUrl + "?t=" + Date.now();

    const updateResult = await updateOwnProfile({ avatar_url: url });

    setUploading(false);

    if (!updateResult.ok) {
      // Nunca mostrar sucesso sem persistência real confirmada.
      toast({
        title: t("Erro ao salvar foto"),
        description: updateResult.error,
        variant: "destructive",
      });
      return;
    }

    setAvatarUrl(url);
    await invalidateOwnProfile(user.id);
    toast({ title: t("Foto atualizada!") });
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);

    const result = await updateOwnProfile({
      full_name: fullName.trim(),
      phone: phone.trim(),
      role_title: roleTitle.trim(),
    });

    if (!result.ok) {
      toast({
        title: t("Erro ao salvar"),
        description: result.error || t("Não foi possível salvar. Tente novamente."),
        variant: "destructive",
      });
      setSaving(false);
      return;
    }

    // Só mostra sucesso DEPOIS de confirmar a persistência real no banco —
    // e recarrega a fonte única (React Query), que também atualiza o
    // cabeçalho/avatar/menu do AdminLayout imediatamente, sem novo login.
    const { error: metadataError } = await supabase.auth.updateUser({
      data: {
        ...(user.user_metadata ?? {}),
        full_name: fullName.trim(),
      },
    });
    if (metadataError) {
      console.warn("[Perfil] perfil salvo; metadado Auth não sincronizado", metadataError.message);
    }

    await invalidateOwnProfile(user.id);
    setSaving(false);
    toast({ title: t("Perfil atualizado com sucesso!") });
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
      <div className="max-w-2xl mx-auto space-y-5 sm:space-y-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-serif tracking-tight">{t("Meu Perfil")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("Gerencie suas informações pessoais")}</p>
        </div>

        {/* Avatar */}
        <div className="bg-card rounded-xl shadow-executive p-4 sm:p-6 flex flex-col items-center gap-4">
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
        <div className="bg-card rounded-xl shadow-executive p-4 sm:p-6 space-y-5">
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
