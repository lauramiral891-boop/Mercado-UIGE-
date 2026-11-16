import React, { useState } from "react";
import { Play, Volume2, VolumeX, Store as StoreIcon } from "lucide-react";
import { SafeImage, SponsoredAd, isCellularConnection } from "@mercado-uige/shared";

interface SponsoredMediaViewProps {
  ad: SponsoredAd;
  fallbackImage?: string;
  className?: string;
  compact?: boolean;
}

export const SponsoredMediaView: React.FC<SponsoredMediaViewProps> = ({
  ad,
  fallbackImage,
  className = "w-full h-32 rounded-2xl overflow-hidden",
  compact = false,
}) => {
  const [muted, setMuted] = useState(true);
  const [cellularPlayAllowed, setCellularPlayAllowed] = useState(false);

  const isVideo = ad.mediaType === "video" && Boolean(ad.videoUrl);
  const cellularMode = isCellularConnection();
  const posterSrc = ad.imageUrl || ad.storeImage || fallbackImage || "";
  const shouldShowPosterOnly = isVideo && cellularMode && !cellularPlayAllowed;

  if (!isVideo) {
    return (
      <div className={`relative ${className}`}>
        <SafeImage
          src={posterSrc}
          alt={ad.title}
          className="w-full h-full object-cover"
          fallbackIcon={<StoreIcon size={24} className="text-[#246BFD]" />}
        />
      </div>
    );
  }

  if (shouldShowPosterOnly) {
    return (
      <div className={`relative bg-[#07111F] ${className}`}>
        <SafeImage
          src={posterSrc}
          alt={ad.title}
          className="w-full h-full object-cover"
          fallbackIcon={<StoreIcon size={24} className="text-[#246BFD]" />}
        />
        <div className="absolute inset-0 bg-black/45 flex items-center justify-center p-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setCellularPlayAllowed(true);
            }}
            aria-label="Reproduzir vídeo do anúncio"
            className="min-h-[44px] min-w-[44px] px-3 py-2 rounded-xl bg-[#07111F]/90 text-white border border-white/25 text-[11px] font-black inline-flex items-center gap-1.5 shadow-lg cursor-pointer"
          >
            <Play size={14} className="fill-[#B7F34A] text-[#B7F34A]" />
            {!compact && <span>Reproduzir</span>}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative bg-[#07111F] ${className}`}>
      <video
        src={ad.videoUrl || undefined}
        poster={posterSrc || undefined}
        autoPlay
        muted={muted}
        loop
        playsInline
        preload="metadata"
        className="w-full h-full object-cover"
      />
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setMuted((prev) => !prev);
        }}
        aria-label={muted ? "Activar som do anúncio" : "Silenciar som do anúncio"}
        className="absolute bottom-2 right-2 min-h-[44px] min-w-[44px] px-2.5 py-2 rounded-xl bg-[#07111F]/85 text-white border border-white/20 flex items-center justify-center gap-1 text-[10px] font-bold shadow-lg cursor-pointer"
      >
        {muted ? <VolumeX size={15} /> : <Volume2 size={15} className="text-[#B7F34A]" />}
        {!compact && <span>{muted ? "Sem som" : "Com som"}</span>}
      </button>
    </div>
  );
};
