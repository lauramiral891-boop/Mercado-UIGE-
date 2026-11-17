import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  SponsoredAd,
  isBannerPaid,
  resolveEffectiveBannerDurationSec,
  sortBannersForCarousel,
} from "@mercado-uige/shared";
import { SponsoredMediaView } from "./SponsoredMediaView";

interface HomeBannerCarouselProps {
  banners: SponsoredAd[];
  autoplay: boolean;
  defaultDurationSec: number;
  activeIndex?: number;
  onActiveIndexChange?: (idx: number) => void;
  onOpenBanner: (banner: SponsoredAd) => void;
  onExploreCatalog: () => void;
  onOpenStores: () => void;
  onOpenUsed: () => void;
}

export const HomeBannerCarousel: React.FC<HomeBannerCarouselProps> = ({
  banners,
  autoplay,
  defaultDurationSec,
  activeIndex,
  onActiveIndexChange,
  onOpenBanner,
  onExploreCatalog,
  onOpenStores,
  onOpenUsed,
}) => {
  const orderedBanners = useMemo(() => sortBannersForCarousel(banners), [banners]);
  const [internalIdx, setInternalIdx] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const touchStartXRef = useRef<number | null>(null);
  const touchEndXRef = useRef<number | null>(null);

  const currentIdx = orderedBanners.length > 0 ? (activeIndex ?? internalIdx) % orderedBanners.length : 0;

  const setSlide = (nextIdx: number) => {
    if (orderedBanners.length === 0) return;
    const wrapped = ((nextIdx % orderedBanners.length) + orderedBanners.length) % orderedBanners.length;
    setInternalIdx(wrapped);
    onActiveIndexChange?.(wrapped);
  };

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  const currentBanner = orderedBanners[currentIdx] || null;
  const effectiveDurationSec = currentBanner
    ? resolveEffectiveBannerDurationSec(currentBanner, { bannerDefaultDurationSec: defaultDurationSec })
    : defaultDurationSec;

  useEffect(() => {
    if (!currentBanner || orderedBanners.length <= 1) return;
    if (!autoplay || isPaused || prefersReducedMotion) return;

    const timer = setTimeout(() => {
      setSlide(currentIdx + 1);
    }, effectiveDurationSec * 1000);

    return () => clearTimeout(timer);
  }, [currentBanner?.id, currentIdx, effectiveDurationSec, autoplay, isPaused, prefersReducedMotion, orderedBanners.length]);

  const handleTouchStart = (e: React.TouchEvent) => {
    setIsPaused(true);
    touchStartXRef.current = e.touches[0]?.clientX ?? null;
    touchEndXRef.current = null;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndXRef.current = e.touches[0]?.clientX ?? null;
  };

  const handleTouchEnd = () => {
    const startX = touchStartXRef.current;
    const endX = touchEndXRef.current;
    if (startX !== null && endX !== null) {
      const diff = endX - startX;
      if (Math.abs(diff) >= 36 && orderedBanners.length > 1) {
        setSlide(diff < 0 ? currentIdx + 1 : currentIdx - 1);
      }
    }
    touchStartXRef.current = null;
    touchEndXRef.current = null;
    setIsPaused(false);
  };

  if (!currentBanner) {
    return (
      <div
        className="relative rounded-3xl overflow-hidden shadow-2xl p-5 sm:p-7"
        style={{
          background: "linear-gradient(120deg, #246BFD 0%, #0B2A5B 55%, #07111F 100%)",
          color: "#FFFFFF",
        }}
      >
        <div className="max-w-lg z-10 relative space-y-2.5">
          <span
            className="inline-block text-[10px] sm:text-xs font-black px-3 py-1 rounded-full uppercase tracking-wider text-slate-950"
            style={{ backgroundColor: "var(--accent)" }}
          >
            PROVÍNCIA DO UÍGE
          </span>
          <h1 className="text-xl sm:text-3xl font-black leading-tight tracking-tight">
            Comércio Local do Uíge
          </h1>
          <p className="text-xs sm:text-sm opacity-85 leading-relaxed">
            Compre e venda artigos novos e usados com lojas fixas e vendedores locais da província.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={onExploreCatalog}
              className="px-4 py-2 rounded-2xl font-black text-xs text-slate-950 shadow-lg cursor-pointer"
              style={{ backgroundColor: "var(--accent)" }}
            >
              Explorar Catálogo
            </button>
            <button
              type="button"
              onClick={onOpenStores}
              className="px-4 py-2 rounded-2xl font-bold text-xs border border-white/30 hover:bg-white/10 cursor-pointer"
            >
              Lojas Locais
            </button>
            <button
              type="button"
              onClick={onOpenUsed}
              className="px-4 py-2 rounded-2xl font-bold text-xs border border-white/30 hover:bg-white/10 cursor-pointer"
            >
              Ver Usados
            </button>
          </div>
        </div>
      </div>
    );
  }

  const paid = isBannerPaid(currentBanner);
  const description = currentBanner.description || currentBanner.subtitle || "";
  const ctaLabel = currentBanner.ctaText?.trim() || "Ver oferta";
  const categoryBadge =
    currentBanner.bannerCategory === "promocional"
      ? "Promoção"
      : currentBanner.bannerCategory === "publico"
      ? "Destaque Uíge"
      : null;

  return (
    <section
      data-testid="home-banner-carousel"
      aria-label="Destaques e campanhas"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onPointerDown={() => setIsPaused(true)}
      onPointerUp={() => setIsPaused(false)}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      className={`relative rounded-3xl overflow-hidden shadow-2xl border border-[#246BFD]/35 select-none ${
        prefersReducedMotion ? "transition-none" : "transition-all duration-300"
      }`}
      style={{
        background: "linear-gradient(120deg, #246BFD 0%, #0B2A5B 58%, #07111F 100%)",
        color: "#FFFFFF",
      }}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => onOpenBanner(currentBanner)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpenBanner(currentBanner);
          }
        }}
        className={`relative p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer ${
          prefersReducedMotion ? "transition-none" : "transition-opacity duration-300"
        }`}
      >
        <div className="max-w-lg space-y-1.5 z-10 min-w-0">
          <div className="flex items-center flex-wrap gap-1.5">
            {paid ? (
              <span
                data-testid="banner-paid-badge"
                className="inline-block text-[10px] font-bold px-2 py-0.5 rounded bg-white/15 border border-white/25 text-white/90 tracking-wide"
              >
                Patrocinado
              </span>
            ) : categoryBadge ? (
              <span
                data-testid="banner-free-badge"
                className="inline-block text-[10px] font-black px-2 py-0.5 rounded text-slate-950 tracking-wide"
                style={{ backgroundColor: "var(--accent)" }}
              >
                {categoryBadge}
              </span>
            ) : null}

            {(currentBanner.advertiserName || currentBanner.storeName) && (
              <span className="text-[11px] font-bold text-white/85 truncate">
                {currentBanner.advertiserName || currentBanner.storeName}
              </span>
            )}
          </div>

          <h1 className="text-lg sm:text-2xl font-black leading-tight tracking-tight line-clamp-2">
            {currentBanner.title}
          </h1>

          {description && (
            <p className="text-xs sm:text-sm text-white/90 line-clamp-2 leading-snug">
              {description}
            </p>
          )}

          <div className="pt-1 flex items-center gap-2">
            <span
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-black text-slate-950 shadow-sm"
              style={{ backgroundColor: "var(--accent)" }}
            >
              {ctaLabel} <ChevronRight size={14} />
            </span>
          </div>
        </div>

        {(currentBanner.imageUrl || currentBanner.videoUrl || currentBanner.storeImage) && (
          <SponsoredMediaView
            ad={currentBanner}
            className="w-full sm:w-72 md:w-80 aspect-[12/5] max-h-36 sm:max-h-40 rounded-2xl overflow-hidden shrink-0 border border-white/15"
          />
        )}
      </div>

      {orderedBanners.length > 1 && (
        <div className="px-4 pb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {orderedBanners.map((b, idx) => (
              <button
                key={b.id}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSlide(idx);
                }}
                aria-label={`Banner ${idx + 1}: ${b.title}`}
                aria-current={idx === currentIdx ? "true" : undefined}
                className={`h-1.5 rounded-full cursor-pointer ${
                  prefersReducedMotion ? "transition-none" : "transition-all duration-200"
                } ${idx === currentIdx ? "w-6 bg-[#B7F34A]" : "w-2 bg-white/40"}`}
              />
            ))}
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Banner anterior"
              onClick={(e) => {
                e.stopPropagation();
                setSlide(currentIdx - 1);
              }}
              className="w-7 h-7 rounded-lg bg-[#07111F]/60 border border-white/15 flex items-center justify-center text-white cursor-pointer"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              type="button"
              aria-label="Próximo banner"
              onClick={(e) => {
                e.stopPropagation();
                setSlide(currentIdx + 1);
              }}
              className="w-7 h-7 rounded-lg bg-[#07111F]/60 border border-white/15 flex items-center justify-center text-white cursor-pointer"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </section>
  );
};
