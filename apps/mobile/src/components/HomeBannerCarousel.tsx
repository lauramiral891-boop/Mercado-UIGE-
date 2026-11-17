import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  SponsoredAd,
  hasAdDestination,
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
}

export const HomeBannerCarousel: React.FC<HomeBannerCarouselProps> = ({
  banners,
  autoplay,
  defaultDurationSec,
  activeIndex,
  onActiveIndexChange,
  onOpenBanner,
}) => {
  const orderedBanners = useMemo(() => sortBannersForCarousel(banners), [banners]);
  const [internalIdx, setInternalIdx] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const touchStartXRef = useRef<number | null>(null);
  const touchEndXRef = useRef<number | null>(null);

  const currentIdx =
    orderedBanners.length > 0 ? (activeIndex ?? internalIdx) % orderedBanners.length : 0;

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
  }, [
    currentBanner?.id,
    currentIdx,
    effectiveDurationSec,
    autoplay,
    isPaused,
    prefersReducedMotion,
    orderedBanners.length,
  ]);

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

  // Sem banners activos: não ocupa nenhum espaço na home
  if (!currentBanner) {
    return null;
  }

  const paid = isBannerPaid(currentBanner);
  const clickable = hasAdDestination(currentBanner);
  const cleanTitle = (currentBanner.title || "").trim();
  const cleanDescription = (currentBanner.description || currentBanner.subtitle || "").trim();
  const cleanCta = (currentBanner.ctaText || "").trim();
  const hasTextOverlay = Boolean(cleanTitle || cleanDescription || cleanCta);

  return (
    <section
      data-testid="home-banner-carousel"
      aria-label="Banners em destaque"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onPointerDown={() => setIsPaused(true)}
      onPointerUp={() => setIsPaused(false)}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      className="w-full max-h-[230px] select-none"
    >
      <div
        role={clickable ? "button" : undefined}
        tabIndex={clickable ? 0 : undefined}
        onClick={clickable ? () => onOpenBanner(currentBanner) : undefined}
        onKeyDown={
          clickable
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onOpenBanner(currentBanner);
                }
              }
            : undefined
        }
        className={`relative w-full aspect-[16/9] max-h-[210px] rounded-2xl overflow-hidden bg-black/15 ${
          clickable ? "cursor-pointer" : "cursor-default"
        } ${prefersReducedMotion ? "transition-none" : "transition-opacity duration-300"}`}
      >
        <SponsoredMediaView
          key={currentBanner.id}
          ad={currentBanner}
          isActive={true}
          loop={true}
          showProgressBar={currentBanner.mediaType === "video" && Boolean(currentBanner.videoUrl)}
          className="w-full h-full"
        />

        {paid && (
          <span
            data-testid="banner-paid-badge"
            className="absolute top-2 right-2 z-20 px-2 py-0.5 rounded bg-black/65 border border-white/20 text-[10px] font-bold text-white tracking-wide"
          >
            Patrocinado
          </span>
        )}

        {hasTextOverlay && (
          <div
            data-testid="banner-text-overlay"
            className="absolute inset-x-0 bottom-0 z-10 bg-black/65 px-3.5 py-2.5 flex items-end justify-between gap-2.5"
          >
            <div className="min-w-0 flex-1 space-y-0.5">
              {cleanTitle && (
                <h2 className="text-[14px] font-bold text-white leading-tight truncate">
                  {cleanTitle}
                </h2>
              )}
              {cleanDescription && (
                <p className="text-[12px] text-white/90 leading-snug line-clamp-1">
                  {cleanDescription}
                </p>
              )}
            </div>
            {cleanCta && (
              <span className="shrink-0 px-3 py-1 rounded-lg bg-red-600 text-white text-[11px] font-black shadow-sm">
                {cleanCta}
              </span>
            )}
          </div>
        )}
      </div>

      {orderedBanners.length > 1 && (
        <div
          data-testid="banner-dots"
          className="mt-1.5 h-3 flex items-center justify-center gap-1.5"
        >
          {orderedBanners.map((b, idx) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setSlide(idx)}
              aria-label={`Banner ${idx + 1}`}
              aria-current={idx === currentIdx ? "true" : undefined}
              className={`h-1.5 rounded-full cursor-pointer ${
                prefersReducedMotion ? "transition-none" : "transition-all duration-200"
              } ${idx === currentIdx ? "w-4 bg-red-600" : "w-1.5 bg-slate-400/50"}`}
            />
          ))}
        </div>
      )}
    </section>
  );
};
