import React, { useEffect, useState } from "react";
import { ChevronRight, Play, Store as StoreIcon, Volume2, VolumeX, X } from "lucide-react";
import {
  FULLSCREEN_AD_CLOSE_DELAY_SEC,
  FULLSCREEN_AD_DURATION_SEC,
  SafeImage,
  SponsoredAd,
  Store,
  isCellularConnection,
} from "@mercado-uige/shared";

interface FullscreenAdOverlayProps {
  ad: SponsoredAd | null;
  store?: Store | null;
  onClose: () => void;
  onOpenStore: (ad: SponsoredAd) => void;
}

export const FullscreenAdOverlay: React.FC<FullscreenAdOverlayProps> = ({
  ad,
  store,
  onClose,
  onOpenStore,
}) => {
  const [elapsedSec, setElapsedSec] = useState(0);
  const [muted, setMuted] = useState(true);
  const [cellularPlayAllowed, setCellularPlayAllowed] = useState(false);

  useEffect(() => {
    if (!ad) {
      setElapsedSec(0);
      setMuted(true);
      setCellularPlayAllowed(false);
      return;
    }
    setElapsedSec(0);
    setMuted(true);
    setCellularPlayAllowed(false);

    const interval = setInterval(() => {
      setElapsedSec((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [ad?.id]);

  useEffect(() => {
    if (ad && elapsedSec >= FULLSCREEN_AD_DURATION_SEC) {
      onClose();
    }
  }, [ad, elapsedSec, onClose]);

  if (!ad) return null;

  const canClose = elapsedSec >= FULLSCREEN_AD_CLOSE_DELAY_SEC;
  const remainingToClose = Math.max(0, FULLSCREEN_AD_CLOSE_DELAY_SEC - elapsedSec);
  const remainingTotal = Math.max(0, FULLSCREEN_AD_DURATION_SEC - elapsedSec);
  const progressPct = Math.min(100, Math.round((elapsedSec / FULLSCREEN_AD_DURATION_SEC) * 100));

  const isVideo = ad.mediaType === "video" && Boolean(ad.videoUrl);
  const cellularMode = isCellularConnection();
  const posterSrc = ad.imageUrl || store?.facadeImage || store?.logo || ad.storeImage || "";
  const showPosterOnly = isVideo && cellularMode && !cellularPlayAllowed;
  const storeTitle = store?.name || ad.storeName || "Loja Parceira";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Anúncio patrocinado de ${storeTitle}`}
      className="fixed inset-0 z-50 bg-[#07111F] text-white flex flex-col justify-between select-none"
      onClick={() => onOpenStore(ad)}
    >
      {/* Mídia em ecrã inteiro (Imagem da loja ou Vídeo com autoplay sem som) */}
      <div className="absolute inset-0">
        {isVideo && !showPosterOnly ? (
          <video
            src={ad.videoUrl || undefined}
            poster={posterSrc || undefined}
            autoPlay
            muted={muted}
            loop
            playsInline
            className="w-full h-full object-cover"
          />
        ) : (
          <SafeImage
            src={posterSrc}
            alt={ad.title}
            className="w-full h-full object-cover"
            fallbackIcon={<StoreIcon size={54} className="text-[#246BFD]" />}
          />
        )}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "linear-gradient(180deg, rgba(7,17,31,0.82) 0%, rgba(7,17,31,0.18) 45%, rgba(7,17,31,0.94) 100%)",
          }}
        />
      </div>

      {/* Topo: Selo Patrocinado + Botão de fechar visível apenas após 5 s */}
      <div className="relative z-10 flex items-center justify-between gap-3 p-4 pt-5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="px-2.5 py-1 rounded-md bg-[#B7F34A] text-slate-950 font-black text-[11px] uppercase tracking-wider shrink-0">
            Patrocinado
          </span>
          <span className="text-xs font-bold text-white/90 truncate">{storeTitle}</span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isVideo && !showPosterOnly && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setMuted((prev) => !prev);
              }}
              aria-label={muted ? "Activar som" : "Silenciar vídeo"}
              className="min-h-[44px] min-w-[44px] px-3 rounded-xl bg-[#07111F]/80 border border-white/25 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              {muted ? <VolumeX size={16} /> : <Volume2 size={16} className="text-[#B7F34A]" />}
              <span className="hidden sm:inline">{muted ? "Som desligado" : "Com som"}</span>
            </button>
          )}

          {canClose ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              aria-label="Fechar anúncio"
              className="min-h-[44px] min-w-[44px] px-3.5 py-2 rounded-xl bg-white text-slate-950 font-black text-xs inline-flex items-center gap-1.5 shadow-xl cursor-pointer"
            >
              <X size={16} />
              <span>Fechar ({remainingTotal}s)</span>
            </button>
          ) : (
            <div className="min-h-[44px] px-3 py-2 rounded-xl bg-[#07111F]/80 border border-white/20 text-white/90 text-xs font-bold inline-flex items-center">
              Fechar em {remainingToClose}s
            </div>
          )}
        </div>
      </div>

      {/* Centro: Botão manual para reproduzir vídeo em dados móveis */}
      {showPosterOnly && (
        <div className="relative z-10 flex items-center justify-center px-4">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setCellularPlayAllowed(true);
            }}
            aria-label="Reproduzir vídeo em dados móveis"
            className="min-h-[48px] px-5 py-3 rounded-2xl bg-[#07111F]/90 border border-[#B7F34A]/60 text-white font-black text-xs inline-flex items-center gap-2 shadow-2xl cursor-pointer"
          >
            <Play size={18} className="fill-[#B7F34A] text-[#B7F34A]" />
            <span>Dados móveis: tocar para reproduzir vídeo</span>
          </button>
        </div>
      )}

      {/* Rodapé: Dados da loja + CTA para visitar a loja */}
      <div className="relative z-10 p-5 pb-7 space-y-3">
        <div className="space-y-1.5 max-w-xl">
          <span className="text-xs font-bold text-[#B7F34A] block">
            {store?.municipality ? `${store.municipality}, Uíge` : "Província do Uíge"}
          </span>
          <h2 className="text-2xl sm:text-3xl font-black leading-tight text-white">{ad.title}</h2>
          {ad.subtitle && <p className="text-sm text-white/85">{ad.subtitle}</p>}
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenStore(ad);
          }}
          className="w-full sm:w-auto min-h-[48px] px-6 py-3 rounded-2xl bg-[#B7F34A] text-slate-950 font-black text-sm inline-flex items-center justify-center gap-2 shadow-2xl cursor-pointer"
        >
          <StoreIcon size={17} />
          <span>Visitar {storeTitle}</span>
          <ChevronRight size={17} />
        </button>

        {/* Barra de progresso (até 10 s) */}
        <div className="w-full h-1 rounded-full bg-white/20 overflow-hidden">
          <div
            className="h-full bg-[#B7F34A] transition-all duration-1000 linear"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>
    </div>
  );
};
