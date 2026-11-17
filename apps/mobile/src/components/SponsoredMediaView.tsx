import React, { useEffect, useRef, useState } from "react";
import { Play, Volume2, VolumeX, Store as StoreIcon } from "lucide-react";
import { SafeImage, SponsoredAd, isCellularConnection } from "@mercado-uige/shared";

interface SponsoredMediaViewProps {
  ad: SponsoredAd;
  fallbackImage?: string;
  className?: string;
  compact?: boolean;
  isActive?: boolean;
  loop?: boolean;
  showProgressBar?: boolean;
}

export const SponsoredMediaView: React.FC<SponsoredMediaViewProps> = ({
  ad,
  fallbackImage,
  className = "w-full aspect-[16/9] max-h-[210px] rounded-2xl overflow-hidden",
  compact = false,
  isActive = true,
  loop = true,
  showProgressBar = false,
}) => {
  const [muted, setMuted] = useState(true);
  const [cellularPlayAllowed, setCellularPlayAllowed] = useState(false);
  const [inViewport, setInViewport] = useState(true);
  const [tabVisible, setTabVisible] = useState(
    typeof document === "undefined" ? true : document.visibilityState !== "hidden"
  );
  const [progressPercent, setProgressPercent] = useState(0);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const isVideo = ad.mediaType === "video" && Boolean(ad.videoUrl);
  const cellularMode = isCellularConnection();
  const posterSrc = ad.imageUrl || ad.storeImage || fallbackImage || "";
  const shouldShowPosterOnly = isVideo && cellularMode && !cellularPlayAllowed;
  const altText = (ad.title || "").trim() || ad.advertiserName || ad.storeName || "Banner Mercado Uíge";

  // Pausar automaticamente quando o utilizador troca de separador ou sai da janela
  useEffect(() => {
    if (!isVideo || typeof document === "undefined") return;
    const onVisibility = () => {
      setTabVisible(document.visibilityState !== "hidden");
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [isVideo]);

  // Pausar automaticamente quando o banner sai do ecrã (IntersectionObserver)
  useEffect(() => {
    if (!isVideo || typeof IntersectionObserver === "undefined") return;
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) {
          setInViewport(entry.isIntersecting && entry.intersectionRatio >= 0.25);
        }
      },
      { threshold: [0, 0.25, 0.5] }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [isVideo]);

  // Sincronizar play/pause com estado activo do slide e visibilidade no ecrã
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl || !isVideo || shouldShowPosterOnly) return;

    if (!isActive || !inViewport || !tabVisible) {
      try {
        videoEl.pause();
      } catch {}
    } else {
      try {
        const playPromise = videoEl.play?.();
        if (playPromise && typeof playPromise.catch === "function") {
          playPromise.catch(() => {});
        }
      } catch {}
    }
  }, [isVideo, isActive, inViewport, tabVisible, shouldShowPosterOnly]);

  // Garantir pausa ao desmontar ou trocar de vídeo
  useEffect(() => {
    setProgressPercent(0);
    return () => {
      try {
        videoRef.current?.pause();
      } catch {}
    };
  }, [ad.id, ad.videoUrl]);

  if (!isVideo) {
    return (
      <div ref={containerRef} className={`relative ${className}`}>
        <SafeImage
          src={posterSrc}
          alt={altText}
          className="w-full h-full object-cover object-center"
          fallbackIcon={<StoreIcon size={24} className="text-[#246BFD]" />}
        />
      </div>
    );
  }

  if (shouldShowPosterOnly) {
    return (
      <div ref={containerRef} className={`relative bg-[#07111F] ${className}`}>
        <SafeImage
          src={posterSrc}
          alt={altText}
          className="w-full h-full object-cover object-center"
          fallbackIcon={<StoreIcon size={24} className="text-[#246BFD]" />}
        />
        <div className="absolute inset-0 bg-black/35 flex items-center justify-center p-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setCellularPlayAllowed(true);
            }}
            aria-label="Reproduzir vídeo do banner"
            className="min-h-[40px] min-w-[40px] px-3 py-2 rounded-xl bg-black/80 text-white border border-white/25 text-[11px] font-black inline-flex items-center gap-1.5 shadow-lg cursor-pointer"
          >
            <Play size={14} className="fill-red-600 text-red-600" />
            {!compact && <span>Reproduzir</span>}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`relative bg-[#07111F] ${className}`}>
      <video
        ref={videoRef}
        src={ad.videoUrl || undefined}
        poster={posterSrc || undefined}
        autoPlay={isActive}
        muted={muted}
        loop={loop}
        playsInline
        preload="metadata"
        onTimeUpdate={(e) => {
          const vid = e.currentTarget;
          if (vid.duration && Number.isFinite(vid.duration) && vid.duration > 0) {
            setProgressPercent(Math.min(100, Math.max(0, (vid.currentTime / vid.duration) * 100)));
          }
        }}
        className="w-full h-full object-cover object-center"
      />
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setMuted((prev) => !prev);
        }}
        aria-label={muted ? "Activar som do banner" : "Silenciar som do banner"}
        className={`absolute ${
          showProgressBar ? "top-2 left-2" : "bottom-2 right-2"
        } z-20 min-h-[34px] min-w-[34px] px-2 py-1 rounded-lg bg-black/65 text-white border border-white/20 flex items-center justify-center gap-1 text-[10px] font-bold shadow cursor-pointer`}
      >
        {muted ? <VolumeX size={14} /> : <Volume2 size={14} className="text-red-500" />}
        {!compact && <span>{muted ? "Sem som" : "Som"}</span>}
      </button>

      {showProgressBar && (
        <div
          data-testid="banner-video-progress"
          className="absolute inset-x-0 bottom-0 h-[3px] bg-white/25 z-20 overflow-hidden"
        >
          <div
            className="h-full bg-red-600 transition-[width] duration-150"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}
    </div>
  );
};
