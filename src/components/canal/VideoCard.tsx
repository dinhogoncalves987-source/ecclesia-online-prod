import { Link } from "react-router-dom";
import { Play } from "lucide-react";
import { type EcclesiaVideo, formatDuration, timeAgo, CATEGORY_LABELS } from "@/lib/canalEcclesia";

type VideoCardProps = {
  video: EcclesiaVideo;
  showChannel?: boolean;
};

export function VideoCard({ video, showChannel }: VideoCardProps) {
  return (
    <Link to={`/video/${video.id}`} className="group block">
      {/* Thumbnail */}
      <div className="relative aspect-video bg-gray-950 rounded-xl overflow-hidden mb-2">
        {video.thumbnailUrl ? (
          <img
            src={video.thumbnailUrl}
            alt={video.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800">
            <Play className="w-10 h-10 text-gray-600" />
          </div>
        )}

        {/* Play overlay */}
        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
            <Play className="w-5 h-5 text-gray-900 ml-0.5" />
          </div>
        </div>

        {/* Duration badge */}
        {video.durationSeconds && (
          <span className="absolute bottom-2 right-2 bg-black/80 text-white text-xs font-mono px-1.5 py-0.5 rounded">
            {formatDuration(video.durationSeconds)}
          </span>
        )}

        {/* Status badge for non-ready */}
        {video.status === "processing" && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
            <span className="text-yellow-400 text-xs font-medium">Processando…</span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="px-0.5">
        <h3 className="font-medium text-sm leading-tight line-clamp-2 group-hover:text-primary transition">
          {video.title}
        </h3>
        {showChannel && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {CATEGORY_LABELS[video.category]}
          </p>
        )}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
          <span>{video.viewCount.toLocaleString("pt-BR")} visualizações</span>
          <span>·</span>
          <span>{timeAgo(video.publishedAt ?? video.createdAt)}</span>
        </div>
      </div>
    </Link>
  );
}
