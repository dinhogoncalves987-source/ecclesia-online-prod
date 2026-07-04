import { Link } from "react-router-dom";
import { Play, CheckCircle2, Tv2, Clock } from "lucide-react";
import {
  type EcclesiaVideo,
  formatDuration, timeAgo, CATEGORY_LABELS,
} from "@/lib/canalEcclesia";
import { isOfficialChannel } from "@/lib/canalMockData";

// ── VideoCard rico ─────────────────────────────────────────────────────────────

type VideoCardProps = {
  video: EcclesiaVideo;
  channelName?: string;
  showChannel?: boolean;
  size?: "default" | "compact";
};

export function CanalVideoCard({ video, channelName, showChannel, size = "default" }: VideoCardProps) {
  const isCompact = size === "compact";

  return (
    <Link to={`/video/${video.id}`} className="group block">
      {/* Thumbnail */}
      <div className={`relative bg-gray-950 rounded-xl overflow-hidden mb-2 ${isCompact ? "aspect-video" : "aspect-video"}`}>
        {video.thumbnailUrl ? (
          <img
            src={video.thumbnailUrl}
            alt={video.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
            <div className="text-center">
              <Play className="w-10 h-10 text-gray-600 mx-auto" />
            </div>
          </div>
        )}

        {/* Play overlay */}
        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
            <Play className="w-5 h-5 text-gray-900 ml-0.5" />
          </div>
        </div>

        {/* Duration badge */}
        {video.durationSeconds && (
          <span className="absolute bottom-2 right-2 bg-black/80 text-white text-xs font-mono px-1.5 py-0.5 rounded flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatDuration(video.durationSeconds)}
          </span>
        )}

        {/* Live badge */}
        {video.status === "processing" && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
            <span className="bg-yellow-500 text-black text-xs font-semibold px-2 py-0.5 rounded-full">Processando</span>
          </div>
        )}

        {/* TV Digital badge */}
        {video.tvLiveSessionId && (
          <span className="absolute top-2 left-2 bg-red-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
            REPLAY
          </span>
        )}
      </div>

      {/* Info */}
      <div className={`${isCompact ? "px-0" : "px-0.5"}`}>
        <h3 className={`font-medium leading-tight line-clamp-2 group-hover:text-primary transition ${isCompact ? "text-xs" : "text-sm"}`}>
          {video.title}
        </h3>
        {showChannel && channelName && (
          <p className={`text-muted-foreground mt-0.5 ${isCompact ? "text-[10px]" : "text-xs"}`}>
            {channelName}
          </p>
        )}
        <div className={`flex items-center gap-1 text-muted-foreground mt-1 ${isCompact ? "text-[10px]" : "text-xs"}`}>
          <span className="bg-muted px-1.5 py-0.5 rounded text-[10px]">
            {CATEGORY_LABELS[video.category]}
          </span>
          <span>·</span>
          <span>{video.viewCount.toLocaleString("pt-BR")} views</span>
          <span>·</span>
          <span>{timeAgo(video.publishedAt ?? video.createdAt)}</span>
        </div>
      </div>
    </Link>
  );
}

// ── ChannelCard ────────────────────────────────────────────────────────────────

type ChannelCardProps = {
  id: string;
  name: string;
  slug: string;
  subscriberCount: number;
  videoCount: number;
  logoUrl?: string | null;
  description?: string | null;
};

export function CanalChannelCard({ id, name, slug, subscriberCount, videoCount, logoUrl, description }: ChannelCardProps) {
  const official = isOfficialChannel(id);

  return (
    <Link
      to={`/canal/${slug}`}
      className="group flex flex-col items-center text-center p-4 bg-card border border-border rounded-2xl hover:border-primary/40 hover:shadow-md transition"
    >
      {/* Avatar */}
      <div className="w-16 h-16 rounded-full overflow-hidden bg-primary/10 flex items-center justify-center mb-3 border-2 border-border group-hover:border-primary/40 transition">
        {logoUrl ? (
          <img src={logoUrl} alt={name} className="w-full h-full object-cover" />
        ) : (
          <Tv2 className="w-7 h-7 text-primary" />
        )}
      </div>

      {/* Name + badge */}
      <div className="flex items-center gap-1 mb-1">
        <p className="font-semibold text-sm line-clamp-1">{name}</p>
        {official && <CheckCircle2 className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
      </div>

      {description && (
        <p className="text-[11px] text-muted-foreground line-clamp-2 mb-2 leading-relaxed">{description}</p>
      )}

      <p className="text-xs text-muted-foreground">
        {subscriberCount.toLocaleString("pt-BR")} seguidores · {videoCount} vídeos
      </p>
    </Link>
  );
}

// ── SubscribeButton ────────────────────────────────────────────────────────────

type SubscribeButtonProps = {
  isSubscribed: boolean;
  count?: number;
  loading?: boolean;
  onToggle: () => void;
};

export function CanalSubscribeButton({ isSubscribed, count, loading, onToggle }: SubscribeButtonProps) {
  return (
    <button
      onClick={onToggle}
      disabled={loading}
      className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition disabled:opacity-60 ${
        isSubscribed
          ? "bg-muted border border-border hover:bg-destructive/10 hover:border-destructive/30 hover:text-destructive"
          : "bg-primary text-primary-foreground hover:bg-primary/90"
      }`}
    >
      {loading ? (
        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : null}
      {isSubscribed ? "Seguindo" : "Seguir"}
      {count !== undefined && count > 0 && (
        <span className="font-normal opacity-70">· {count.toLocaleString("pt-BR")}</span>
      )}
    </button>
  );
}

// ── OfficialBadge ──────────────────────────────────────────────────────────────

export function OfficialBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-full">
      <CheckCircle2 className="w-3 h-3" />
      Canal Oficial
    </span>
  );
}

// ── EmptyVideos ────────────────────────────────────────────────────────────────

export function CanalEmptyState({ label, action }: { label: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-muted-foreground select-none">
      <div className="w-20 h-20 rounded-2xl bg-muted flex items-center justify-center mb-4">
        <Play className="w-9 h-9 opacity-30" />
      </div>
      <p className="font-medium text-foreground/60">{label}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

// ── Skeleton Cards ─────────────────────────────────────────────────────────────

export function CanalVideoSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="aspect-video bg-muted rounded-xl mb-2" />
      <div className="h-3 bg-muted rounded w-full mb-1.5" />
      <div className="h-3 bg-muted rounded w-3/4 mb-1.5" />
      <div className="h-2.5 bg-muted rounded w-1/2" />
    </div>
  );
}
