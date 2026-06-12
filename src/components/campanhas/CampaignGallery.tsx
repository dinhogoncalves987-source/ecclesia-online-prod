import { useState } from "react";

import { ImagePlus } from "lucide-react";

import { cn } from "@/lib/utils";

import { useLanguage } from "@/hooks/useLanguage";

import { useToast } from "@/hooks/use-toast";

import { useRole } from "@/hooks/useRole";

import {

  campaignImageSeed,

  getLocalGalleryImagesForCampaign,

  pickCoverManifestImageForCampaign,

} from "@/lib/campaignImages";

import type { Campaign } from "@/lib/campaignsDemo";

import type { CampaignMediaItem } from "@/lib/campaignMedia";

import { getCampaignGallery, resolveMediaItemUrl } from "@/lib/campaignMedia";

import { CampaignMediaLightbox } from "@/components/campanhas/CampaignMediaLightbox";



type Props = {

  campaign: Campaign;

  media?: CampaignMediaItem[];

  loading?: boolean;

  onEdit?: () => void;

};



const MAX_VISIBLE = 12;



function buildGalleryUrls(campaign: Campaign, media: CampaignMediaItem[]): string[] {

  const realUrls = getCampaignGallery(campaign, media)
    .filter((item) => !item.isCover)

    .map((item) => resolveMediaItemUrl(item))

    .filter((url): url is string => Boolean(url))

    .filter((url) => !url.endsWith(".svg"));



  if (realUrls.length > 0) return realUrls;



  const seed = campaignImageSeed(campaign);

  const manifestCover = pickCoverManifestImageForCampaign(campaign, seed);

  return getLocalGalleryImagesForCampaign(campaign, seed, 24, manifestCover).filter(

    (url) => url !== manifestCover,

  );

}



export function CampaignGallery({ campaign, media = [], loading = false, onEdit }: Props) {

  const { t } = useLanguage();

  const { toast } = useToast();

  const { hasRole } = useRole();

  const canManage = hasRole(["church_admin", "leader", "tesoureiro", "super_admin"]);

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);



  const allUrls = buildGalleryUrls(campaign, media);

  const hasRealUploads = getCampaignGallery(campaign, media).length > 0;



  const extraCount = Math.max(0, allUrls.length - MAX_VISIBLE);

  const visibleCount = extraCount > 0 ? MAX_VISIBLE - 1 : Math.min(allUrls.length, MAX_VISIBLE);

  const visible = allUrls.slice(0, visibleCount);



  const openLightbox = (index: number) => {

    if (index >= 0 && index < allUrls.length) setLightboxIndex(index);

  };



  const handleAddPhotos = () => {

    if (onEdit) {

      onEdit();

      return;

    }

    toast({ title: t("Adicionar fotos"), description: t("Edite a campanha para enviar fotos") });

  };



  if (allUrls.length === 0 && !canManage) return null;



  return (

    <section>

      <div className="flex items-center justify-between gap-2 mb-3">

        <h3 className="font-semibold text-sm">{t("Galeria de Fotos")}</h3>

        <div className="flex items-center gap-2">

          {loading && (

            <span className="text-[10px] text-muted-foreground animate-pulse">{t("Carregando...")}</span>

          )}

          {canManage && (

            <button

              type="button"

              onClick={handleAddPhotos}

              className="text-xs inline-flex items-center gap-1 text-primary hover:underline"

            >

              <ImagePlus size={14} /> {t("Adicionar fotos")}

            </button>

          )}

        </div>

      </div>



      {!hasRealUploads && allUrls.length > 0 && (

        <p className="text-[10px] text-muted-foreground mb-2">{t("Imagens ilustrativas da biblioteca")}</p>

      )}



      {allUrls.length === 0 ? (

        <p className="text-xs text-muted-foreground rounded-lg bg-secondary/40 p-3">{t("Nenhuma foto na galeria")}</p>

      ) : (

        <>

          <div className="grid grid-cols-2 gap-2 sm:hidden">

            {visible.map((url, index) => (

              <GalleryTile

                key={`m-${url}-${index}`}

                url={url}

                featured={index === 0}

                onClick={() => openLightbox(index)}

              />

            ))}

            {extraCount > 0 && (

              <MoreTile count={extraCount} label={t("fotos")} onClick={() => openLightbox(visibleCount)} />

            )}

          </div>



          <div className="hidden sm:grid sm:grid-cols-4 sm:grid-rows-2 sm:gap-2.5 sm:h-[220px] lg:h-[240px]">

            {visible.map((url, index) => (

              <GalleryTile

                key={`d-${url}-${index}`}

                url={url}

                featured={index === 0}

                onClick={() => openLightbox(index)}

                className={cn(

                  index === 0 && "col-span-2 row-span-2 h-full",

                  index > 0 && "h-full min-h-0",

                )}

              />

            ))}

            {extraCount > 0 && (

              <MoreTile

                count={extraCount}

                label={t("fotos")}

                className="h-full min-h-0"

                onClick={() => openLightbox(visibleCount)}

              />

            )}

          </div>

        </>

      )}



      {lightboxIndex !== null && (

        <CampaignMediaLightbox

          urls={allUrls}

          index={lightboxIndex}

          onIndexChange={setLightboxIndex}

          onClose={() => setLightboxIndex(null)}

        />

      )}

    </section>

  );

}



function GalleryTile({

  url,

  featured,

  className,

  onClick,

}: {

  url: string;

  featured?: boolean;

  className?: string;

  onClick: () => void;

}) {

  return (

    <button

      type="button"

      onClick={onClick}

      className={cn(

        "relative overflow-hidden rounded-xl border border-border/30 bg-muted group cursor-pointer text-left",

        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background",

        featured ? "aspect-[4/3] sm:aspect-auto" : "aspect-[4/3] sm:aspect-auto",

        className,

      )}

    >

      <img

        src={url}

        alt=""

        className="h-full w-full object-cover object-center transition-transform duration-300 group-hover:scale-[1.03] group-active:scale-[0.99]"

        loading="lazy"

        draggable={false}

      />

      <div className="absolute inset-0 ring-1 ring-inset ring-black/5 rounded-xl pointer-events-none" />

    </button>

  );

}



function MoreTile({

  count,

  label,

  className,

  onClick,

}: {

  count: number;

  label: string;

  className?: string;

  onClick: () => void;

}) {

  return (

    <button

      type="button"

      onClick={onClick}

      className={cn(

        "relative overflow-hidden rounded-xl border border-border/30 bg-secondary/60 flex items-center justify-center",

        "cursor-pointer hover:bg-secondary/80 transition-colors",

        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background",

        "aspect-[4/3] sm:aspect-auto",

        className,

      )}

    >

      <span className="text-lg font-semibold text-muted-foreground">

        +{count} {label}

      </span>

    </button>

  );

}


