import React from "react";
import { ChevronRight, Megaphone, X } from "lucide-react";
import { SafeImage, SponsoredAd } from "@mercado-uige/shared";

interface BottomAdStripProps {
  ad: SponsoredAd | null;
  onOpen: (ad: SponsoredAd) => void;
  onDismiss: (adId: string) => void;
}

export const BottomAdStrip: React.FC<BottomAdStripProps> = ({ ad, onOpen, onDismiss }) => {
  if (!ad) return null;

  const poster = ad.imageUrl || ad.storeImage || "";
  const sponsorLabel = ad.advertiserName || ad.storeName || "";

  return (
    <div
      data-testid="bottom-ad-strip"
      className="w-full border-t border-[#246BFD]/40 bg-[#07111F]/95 text-white backdrop-blur-xl pointer-events-auto"
    >
      <div className="flex items-center justify-between gap-2 px-2.5 py-1 min-h-[44px]">
        <button
          type="button"
          onClick={() => onOpen(ad)}
          className="flex-1 min-w-0 flex items-center gap-2 text-left cursor-pointer py-0.5"
          aria-label={`Abrir anúncio patrocinado: ${ad.title}`}
        >
          <div className="w-8 h-8 rounded-lg overflow-hidden shrink-0 bg-[#111D30] border border-[#246BFD]/30 grid place-items-center">
            {poster ? (
              <SafeImage
                src={poster}
                alt={ad.title}
                className="w-full h-full object-cover"
                fallbackIcon={<Megaphone size={14} className="text-[#246BFD]" />}
              />
            ) : (
              <Megaphone size={14} className="text-[#B7F34A]" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="px-1.5 py-0.5 rounded bg-[#B7F34A] text-slate-950 font-black text-[9px] uppercase tracking-wider shrink-0 leading-none">
                Patrocinado
              </span>
              {sponsorLabel && (
                <span className="text-[10px] font-semibold text-white/75 truncate">
                  {sponsorLabel}
                </span>
              )}
            </div>
            <p className="text-xs font-extrabold truncate text-white leading-tight mt-0.5">
              {ad.title}
            </p>
          </div>

          <ChevronRight size={14} className="text-[#B7F34A] shrink-0" />
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss(ad.id);
          }}
          aria-label="Fechar faixa patrocinada"
          className="min-w-[44px] min-h-[44px] -my-1 -mr-1 grid place-items-center text-white/75 hover:text-white cursor-pointer shrink-0"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
};
