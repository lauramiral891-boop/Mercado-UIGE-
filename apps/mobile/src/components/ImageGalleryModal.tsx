import React, { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, LayoutGrid, X, ZoomIn, ZoomOut } from "lucide-react";
import { SafeImage } from "@mercado-uige/shared";

interface ImageGalleryModalProps {
  images: string[];
  title: string;
  initialIndex?: number;
  isOpen: boolean;
  onClose: () => void;
}

export const ImageGalleryModal: React.FC<ImageGalleryModalProps> = ({
  images,
  title,
  initialIndex = 0,
  isOpen,
  onClose,
}) => {
  const cleanImages = images.filter((u) => Boolean(u && u.trim()));
  const [activeIndex, setActiveIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [showGrid, setShowGrid] = useState(false);

  const touchStartXRef = useRef<number | null>(null);
  const touchEndXRef = useRef<number | null>(null);
  const pinchStartDistRef = useRef<number | null>(null);
  const lastTapRef = useRef<number>(0);

  useEffect(() => {
    if (!isOpen) return;
    const bounded =
      cleanImages.length > 0
        ? Math.max(0, Math.min(initialIndex, cleanImages.length - 1))
        : 0;
    setActiveIndex(bounded);
    setZoom(1);
    setShowGrid(false);
  }, [isOpen, initialIndex, cleanImages.length]);

  if (!isOpen || cleanImages.length === 0) return null;

  const safeIdx = Math.max(0, Math.min(activeIndex, cleanImages.length - 1));
  const currentImg = cleanImages[safeIdx];

  const goTo = (nextIdx: number) => {
    if (cleanImages.length <= 1) return;
    const wrapped = ((nextIdx % cleanImages.length) + cleanImages.length) % cleanImages.length;
    setActiveIndex(wrapped);
    setZoom(1);
  };

  const toggleZoom = () => {
    setZoom((z) => (z >= 2 ? 1 : Number((z + 0.5).toFixed(1))));
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchStartDistRef.current = Math.hypot(dx, dy);
      return;
    }
    touchStartXRef.current = e.touches[0]?.clientX ?? null;
    touchEndXRef.current = null;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchStartDistRef.current) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const scale = Math.min(2.5, Math.max(1, Number((dist / pinchStartDistRef.current).toFixed(2))));
      setZoom(scale);
      return;
    }
    touchEndXRef.current = e.touches[0]?.clientX ?? null;
  };

  const handleTouchEnd = () => {
    pinchStartDistRef.current = null;
    if (zoom === 1 && touchStartXRef.current !== null && touchEndXRef.current !== null) {
      const diff = touchEndXRef.current - touchStartXRef.current;
      if (Math.abs(diff) >= 40) {
        goTo(diff < 0 ? safeIdx + 1 : safeIdx - 1);
      }
    }
    touchStartXRef.current = null;
    touchEndXRef.current = null;
  };

  const handleImageTap = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 280) {
      setZoom((z) => (z > 1 ? 1 : 2));
    }
    lastTapRef.current = now;
  };

  return (
    <div
      data-testid="image-gallery-modal"
      role="dialog"
      aria-modal="true"
      aria-label={`Galeria de ${title}`}
      className="fixed inset-0 z-[70] flex flex-col bg-black text-white select-none"
    >
      {/* Top Bar */}
      <div className="flex items-center justify-between gap-2 px-3 py-3 border-b border-white/15 bg-black/95 pt-safe">
        <div className="min-w-0">
          <span className="text-xs font-black tracking-wide block truncate">{title}</span>
          <span
            data-testid="gallery-counter"
            className="text-[11px] font-bold text-zinc-400 tabular-nums"
          >
            {safeIdx + 1} / {cleanImages.length}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setShowGrid((g) => !g)}
            className={`w-11 h-11 rounded-xl grid place-items-center border cursor-pointer transition-colors ${
              showGrid
                ? "bg-red-600 border-red-600 text-white"
                : "border-white/20 bg-zinc-900 text-white hover:border-white/40"
            }`}
            aria-label={showGrid ? "Voltar à visualização grande" : "Ver grelha de fotografias"}
          >
            <LayoutGrid size={18} />
          </button>
          <button
            type="button"
            onClick={toggleZoom}
            className="w-11 h-11 rounded-xl grid place-items-center border border-white/20 bg-zinc-900 text-white hover:border-white/40 cursor-pointer"
            aria-label={zoom > 1 ? "Reduzir zoom" : "Ampliar fotografia"}
          >
            {zoom > 1 ? <ZoomOut size={18} /> : <ZoomIn size={18} />}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-11 h-11 rounded-xl grid place-items-center border border-white/20 bg-zinc-900 text-white hover:bg-red-600 hover:border-red-600 cursor-pointer transition-colors"
            aria-label="Fechar galeria"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Main Content: Grid Preview OR Swipe+Zoom Fullscreen Viewer */}
      {showGrid ? (
        <div
          data-testid="gallery-grid"
          className="flex-1 overflow-y-auto p-3 grid grid-cols-2 sm:grid-cols-3 gap-2.5 content-start bg-black"
        >
          {cleanImages.map((img, idx) => (
            <button
              key={`${img}-${idx}`}
              type="button"
              onClick={() => {
                setActiveIndex(idx);
                setZoom(1);
                setShowGrid(false);
              }}
              className={`relative aspect-square rounded-xl overflow-hidden border-2 cursor-pointer ${
                idx === safeIdx ? "border-red-600" : "border-white/15"
              }`}
            >
              <SafeImage
                src={img}
                alt={`${title} — foto ${idx + 1}`}
                className="w-full h-full object-cover"
              />
              <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/75 text-[10px] font-bold tabular-nums">
                {idx + 1}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div
          className="relative flex-1 overflow-hidden flex items-center justify-center bg-black touch-pan-y"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onClick={handleImageTap}
        >
          <div
            data-testid="gallery-zoom-stage"
            className="w-full h-full flex items-center justify-center p-2 transition-transform duration-150"
            style={{ transform: `scale(${zoom})` }}
          >
            <SafeImage
              src={currentImg}
              alt={`${title} — imagem ${safeIdx + 1}`}
              className="max-w-full max-h-full object-contain"
              loading="eager"
            />
          </div>

          {cleanImages.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  goTo(safeIdx - 1);
                }}
                aria-label="Fotografia anterior"
                className="absolute left-2 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/70 border border-white/20 grid place-items-center hover:bg-red-600 cursor-pointer"
              >
                <ChevronLeft size={20} />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  goTo(safeIdx + 1);
                }}
                aria-label="Fotografia seguinte"
                className="absolute right-2 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/70 border border-white/20 grid place-items-center hover:bg-red-600 cursor-pointer"
              >
                <ChevronRight size={20} />
              </button>
            </>
          )}

          {zoom > 1 && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded bg-red-600 text-white text-[11px] font-black tabular-nums">
              Zoom {zoom}x
            </div>
          )}
        </div>
      )}

      {/* Thumbnails Strip */}
      {cleanImages.length > 1 && !showGrid && (
        <div className="px-3 py-2.5 border-t border-white/15 bg-black/95 flex gap-2 overflow-x-auto no-scrollbar pb-safe">
          {cleanImages.map((img, idx) => (
            <button
              key={`thumb-${idx}`}
              type="button"
              onClick={() => {
                setActiveIndex(idx);
                setZoom(1);
              }}
              aria-label={`Selecionar fotografia ${idx + 1}`}
              className={`w-14 h-14 rounded-xl overflow-hidden border-2 shrink-0 cursor-pointer ${
                idx === safeIdx ? "border-red-600" : "border-white/15 opacity-60"
              }`}
            >
              <SafeImage src={img} alt={`${title} miniatura ${idx + 1}`} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
