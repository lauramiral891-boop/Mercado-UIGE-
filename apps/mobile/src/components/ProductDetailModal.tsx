import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  BadgeCheck,
  Ban,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Crown,
  Expand,
  Flag,
  Heart,
  MapPin,
  Minus,
  Plus,
  Send,
  Share2,
  ShoppingCart,
  Star,
  Store as StoreIcon,
  Truck,
  Video,
  X,
} from "lucide-react";
import {
  Avatar,
  Order,
  Product,
  ProductReview,
  SafeImage,
  Store,
  User,
  calculateDiscountPercent,
  canUserReviewProduct,
  computeReviewStats,
  fmtKz,
  formatActiveSince,
  formatStoreType,
  getStoreVerificationLabel,
  isStoreVerified,
  nativePlugins,
  productReviewRepo,
} from "@mercado-uige/shared";
import { ImageGalleryModal } from "./ImageGalleryModal";
import { ReviewsSection } from "./ReviewsSection";

interface ProductDetailModalProps {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
  isFavorite: boolean;
  onToggleFavorite: (product: Product) => void;
  onAddToCart: (product: Product, qty: number, variant?: string) => void;
  onBuyNow?: (product: Product, qty: number, variant?: string) => void;
  onOpenStore?: (storeId: string) => void;
  sellerStore?: Store | null;
  productReviews?: ProductReview[];
  orders?: Order[];
  currentUser?: User | null;
  onSubmitProductReview?: (payload: {
    stars: number;
    comment: string;
    photos: string[];
  }) => Promise<void>;
  isSellerBlocked?: boolean;
  onToggleBlockSeller?: (sellerId: string) => Promise<void> | void;
  onReportReview?: (
    reviewId: string,
    reviewType: "loja" | "produto",
    reason: string
  ) => Promise<void> | void;
  onRequireAuth?: () => void;
  similarProducts: Product[];
  onSelectProduct: (p: Product) => void;
  onSendMessage: (productId: string, message: string) => void;
  onReportProduct: (productId: string, reason: string) => void;
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
  product,
  isOpen,
  onClose,
  isFavorite,
  onToggleFavorite,
  onAddToCart,
  onBuyNow,
  onOpenStore,
  sellerStore = null,
  productReviews,
  orders = [],
  currentUser = null,
  onSubmitProductReview,
  isSellerBlocked = false,
  onToggleBlockSeller,
  onReportReview,
  onRequireAuth,
  similarProducts,
  onSelectProduct,
  onSendMessage,
  onReportProduct,
}) => {
  const [qty, setQty] = useState(1);
  const [selectedVariant, setSelectedVariant] = useState("");
  const [activeSlideIdx, setActiveSlideIdx] = useState(0);
  const [showVideo, setShowVideo] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);
  const [chatMessage, setChatMessage] = useState("");
  const [showReportInput, setShowReportInput] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [copiedLink, setCopiedLink] = useState(false);
  const [localReviews, setLocalReviews] = useState<ProductReview[]>([]);

  const touchStartXRef = useRef<number | null>(null);
  const touchEndXRef = useRef<number | null>(null);

  useEffect(() => {
    if (!product || !isOpen) return;
    setQty(1);
    setSelectedVariant(product.variants && product.variants.length > 0 ? product.variants[0] : "");
    setActiveSlideIdx(0);
    setShowVideo(Boolean(product.videoUrl && product.mediaType === "video"));
    setGalleryOpen(false);
    setDescExpanded(false);
    setChatMessage("");
    setShowReportInput(false);
    setReportReason("");

    if (productReviews === undefined) {
      productReviewRepo
        .getByProduct(product.id)
        .then((rows) => setLocalReviews(rows))
        .catch(() => setLocalReviews([]));
    }
  }, [product?.id, isOpen, productReviews]);

  const gallery = useMemo(() => {
    if (!product) return [];
    const list: string[] = [];
    if (product.image) list.push(product.image);
    if (Array.isArray(product.images)) {
      for (const img of product.images) {
        if (img && !list.includes(img)) list.push(img);
      }
    }
    return list;
  }, [product]);

  const resolvedReviews = productReviews !== undefined ? productReviews : localReviews;
  const reviewStats = useMemo(() => computeReviewStats(resolvedReviews), [resolvedReviews]);

  if (!isOpen || !product) return null;

  const safeSlideIdx = gallery.length > 0 ? Math.min(activeSlideIdx, gallery.length - 1) : 0;
  const currentSlideUrl = gallery[safeSlideIdx] || "";
  const isOutOfStock = Number(product.stock) <= 0;
  const maxQty = Math.max(1, Number(product.stock || 0));
  const discountPct = calculateDiscountPercent(product.price, product.oldPrice);
  const soldCount = Math.max(0, Number(product.sales || 0));
  const descriptionText = (product.description || "").trim();
  const isLongDescription = descriptionText.length > 120;
  const displayedDescription =
    isLongDescription && !descExpanded
      ? `${descriptionText.slice(0, 120).trimEnd()}…`
      : descriptionText;

  const storeVerified = isStoreVerified(sellerStore);
  const storeNameDisplay = sellerStore?.name || product.storeName || "Loja Local";
  const storeLogoUrl = sellerStore?.logo || sellerStore?.facadeImage || "";
  const storeActiveSince = formatActiveSince(sellerStore?.createdAt);
  const canReview = canUserReviewProduct(currentUser?.id, product.id, orders);

  const realRating =
    reviewStats.total > 0
      ? reviewStats.average
      : Number(product.reviewsCount || 0) > 0
      ? Number(product.rating || 0)
      : 0;
  const realReviewsTotal =
    reviewStats.total > 0 ? reviewStats.total : Number(product.reviewsCount || 0);

  const goToSlide = (nextIdx: number) => {
    if (gallery.length <= 1) return;
    setShowVideo(false);
    setActiveSlideIdx(((nextIdx % gallery.length) + gallery.length) % gallery.length);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0]?.clientX ?? null;
    touchEndXRef.current = null;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndXRef.current = e.touches[0]?.clientX ?? null;
  };

  const handleTouchEnd = () => {
    if (touchStartXRef.current !== null && touchEndXRef.current !== null) {
      const diff = touchEndXRef.current - touchStartXRef.current;
      if (Math.abs(diff) >= 36) {
        goToSlide(diff < 0 ? safeSlideIdx + 1 : safeSlideIdx - 1);
      }
    }
    touchStartXRef.current = null;
    touchEndXRef.current = null;
  };

  const handleShare = async () => {
    const success = await nativePlugins.shareContent(
      product.name,
      `Confere este artigo no Mercado Uíge: ${product.name} por ${fmtKz(product.price)}`,
      typeof window !== "undefined" ? window.location.href : ""
    );
    if (!nativePlugins.isNative() && success) {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatMessage.trim()) return;
    onSendMessage(product.id, chatMessage.trim());
    setChatMessage("");
  };

  const handleSendReport = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportReason.trim()) return;
    onReportProduct(product.id, reportReason.trim());
    setReportReason("");
    setShowReportInput(false);
  };

  const handleLocalOrRemoteReviewSubmit = async (payload: {
    stars: number;
    comment: string;
    photos: string[];
  }) => {
    if (onSubmitProductReview) {
      await onSubmitProductReview(payload);
      return;
    }
    if (!currentUser) return;
    const created = await productReviewRepo.create({
      productId: product.id,
      userId: currentUser.id,
      userName: currentUser.name,
      userAvatar: currentUser.avatar || undefined,
      stars: payload.stars,
      comment: payload.comment,
      photos: payload.photos,
    });
    setLocalReviews((prev) => [created, ...prev.filter((r) => r.userId !== currentUser.id)]);
  };

  return (
    <div
      data-testid="product-detail-modal"
      className="fixed inset-0 z-50 grid place-items-center p-0 sm:p-4 bg-black/80 backdrop-blur-md anim-fadeUp"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl h-full sm:h-auto sm:max-h-[92vh] sm:rounded-3xl border shadow-2xl anim-pop flex flex-col overflow-hidden"
        style={{
          backgroundColor: "var(--rbw-bg)",
          borderColor: "var(--rbw-border)",
          color: "var(--rbw-text)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div
          className="shrink-0 flex items-center justify-between gap-2 px-3.5 sm:px-5 py-3 border-b pt-safe"
          style={{
            backgroundColor: "var(--rbw-surface)",
            borderColor: "var(--rbw-border)",
          }}
        >
          <div
            className="flex items-center gap-1.5 text-[11px] sm:text-xs font-bold min-w-0 truncate"
            style={{ color: "var(--rbw-muted)" }}
          >
            <span className="capitalize truncate">{product.categoryName || "Geral"}</span>
            <span>·</span>
            <span className="flex items-center gap-1 shrink-0">
              <MapPin size={12} className="text-red-600" /> {product.municipality || "Uíge"}, Uíge
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => onToggleFavorite(product)}
              className="w-10 h-10 rounded-xl border grid place-items-center cursor-pointer"
              style={{ borderColor: "var(--rbw-border)" }}
              aria-label={isFavorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
            >
              <Heart
                size={16}
                className={isFavorite ? "text-red-600 fill-red-600" : ""}
              />
            </button>
            <button
              type="button"
              onClick={handleShare}
              className="w-10 h-10 rounded-xl border grid place-items-center cursor-pointer"
              style={{ borderColor: "var(--rbw-border)" }}
              title="Partilhar produto"
              aria-label="Partilhar produto"
            >
              <Share2 size={15} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-10 h-10 rounded-xl border grid place-items-center hover:bg-red-600 hover:text-white hover:border-red-600 cursor-pointer transition-colors"
              style={{ borderColor: "var(--rbw-border)" }}
              aria-label="Fechar detalhes do produto"
            >
              <X size={17} />
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-5 space-y-5">
          {copiedLink && (
            <div className="p-2.5 text-xs font-bold bg-red-600/15 text-red-500 border border-red-600/30 rounded-xl text-center">
              Ligação do artigo copiada!
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
            {/* Galeria deslizável + contador */}
            <div className="space-y-3 min-w-0">
              <div
                data-testid="product-swipe-gallery"
                className="relative aspect-square w-full rounded-2xl overflow-hidden border bg-zinc-950 touch-pan-y"
                style={{ borderColor: "var(--rbw-border)" }}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
              >
                {showVideo && product.videoUrl ? (
                  <video
                    src={product.videoUrl}
                    controls
                    autoPlay
                    muted
                    playsInline
                    loop
                    className="w-full h-full object-cover bg-black"
                  />
                ) : (
                  <div
                    role={gallery.length > 0 ? "button" : undefined}
                    tabIndex={gallery.length > 0 ? 0 : undefined}
                    onClick={() => gallery.length > 0 && setGalleryOpen(true)}
                    onKeyDown={(e) => {
                      if (gallery.length > 0 && (e.key === "Enter" || e.key === " ")) {
                        e.preventDefault();
                        setGalleryOpen(true);
                      }
                    }}
                    className={`w-full h-full ${gallery.length > 0 ? "cursor-zoom-in" : ""}`}
                    aria-label={gallery.length > 0 ? "Ampliar fotografia do produto" : undefined}
                  >
                    <SafeImage
                      src={currentSlideUrl}
                      alt={product.name}
                      className="w-full h-full object-cover"
                      fallbackText="Sem fotografia disponível"
                      loading="eager"
                    />
                  </div>
                )}

                {/* Top-left Badges */}
                <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 z-10 pointer-events-none">
                  {discountPct > 0 && (
                    <span className="text-[11px] font-black px-2.5 py-1 rounded-lg bg-red-600 text-white shadow tabular-nums">
                      -{discountPct}%
                    </span>
                  )}
                  {product.condition === "usado" && (
                    <span className="text-[11px] font-black px-2.5 py-1 rounded-lg bg-black/85 text-white border border-white/20">
                      Usado
                    </span>
                  )}
                  {product.storeVip && (
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-white text-black flex items-center gap-1 shadow">
                      <Crown size={12} className="text-red-600 fill-red-600" /> VIP
                    </span>
                  )}
                </div>

                {/* Counter & Zoom trigger */}
                {!showVideo && gallery.length > 0 && (
                  <div className="absolute bottom-3 right-3 z-10 flex items-center gap-1.5">
                    <span
                      data-testid="product-gallery-counter"
                      className="px-2.5 py-1 rounded-lg bg-black/80 text-white text-[11px] font-black tabular-nums border border-white/15"
                    >
                      {safeSlideIdx + 1} / {gallery.length}
                    </span>
                    <button
                      type="button"
                      onClick={() => setGalleryOpen(true)}
                      aria-label="Abrir galeria em ecrã inteiro"
                      className="w-8 h-8 rounded-lg bg-black/80 text-white border border-white/15 grid place-items-center cursor-pointer hover:bg-red-600"
                    >
                      <Expand size={14} />
                    </button>
                  </div>
                )}

                {!showVideo && gallery.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={() => goToSlide(safeSlideIdx - 1)}
                      aria-label="Foto anterior"
                      className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/65 text-white grid place-items-center cursor-pointer hover:bg-red-600"
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <button
                      type="button"
                      onClick={() => goToSlide(safeSlideIdx + 1)}
                      aria-label="Foto seguinte"
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/65 text-white grid place-items-center cursor-pointer hover:bg-red-600"
                    >
                      <ChevronRight size={18} />
                    </button>
                  </>
                )}
              </div>

              {/* Thumbnails & Vídeo */}
              {(gallery.length > 1 || product.videoUrl) && (
                <div className="flex gap-2 overflow-x-auto no-scrollbar">
                  {product.videoUrl && (
                    <button
                      type="button"
                      onClick={() => setShowVideo(true)}
                      className={`w-14 h-14 rounded-xl overflow-hidden border-2 shrink-0 cursor-pointer bg-black text-white grid place-items-center ${
                        showVideo ? "border-red-600" : "border-transparent opacity-70"
                      }`}
                      aria-label="Ver vídeo do artigo"
                    >
                      <Video size={20} className="text-red-600" />
                    </button>
                  )}
                  {gallery.map((img, idx) => (
                    <button
                      key={`${img}-${idx}`}
                      type="button"
                      onClick={() => {
                        setShowVideo(false);
                        setActiveSlideIdx(idx);
                      }}
                      className={`w-14 h-14 rounded-xl overflow-hidden border-2 shrink-0 cursor-pointer ${
                        !showVideo && safeSlideIdx === idx
                          ? "border-red-600"
                          : "border-transparent opacity-60"
                      }`}
                    >
                      <SafeImage
                        src={img}
                        alt={`${product.name} (${idx + 1})`}
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Detalhes do Produto */}
            <div className="space-y-4 min-w-0">
              <div>
                <h1 className="text-lg sm:text-2xl font-black leading-tight break-words">
                  {product.name}
                </h1>

                {/* Preço, preço antigo e desconto */}
                <div className="mt-2.5 flex flex-wrap items-baseline gap-2.5">
                  <span className="text-2xl sm:text-3xl font-black tracking-tight tabular-nums text-red-600">
                    {fmtKz(product.price)}
                  </span>
                  {discountPct > 0 && product.oldPrice && (
                    <>
                      <span
                        className="text-sm line-through tabular-nums"
                        style={{ color: "var(--rbw-muted)" }}
                      >
                        {fmtKz(product.oldPrice)}
                      </span>
                      <span className="text-xs font-black px-2 py-0.5 rounded-lg bg-red-600/15 text-red-600 tabular-nums">
                        Poupa {discountPct}%
                      </span>
                    </>
                  )}
                </div>

                {/* Classificação real + Vendas reais */}
                <div
                  className="mt-2.5 flex flex-wrap items-center gap-3 text-xs font-bold"
                  style={{ color: "var(--rbw-muted)" }}
                >
                  {realReviewsTotal > 0 ? (
                    <span className="inline-flex items-center gap-1" style={{ color: "var(--rbw-text)" }}>
                      <Star size={14} className="text-red-600 fill-red-600" />
                      <span className="tabular-nums">{realRating.toFixed(1)}</span>
                      <span style={{ color: "var(--rbw-muted)" }}>({realReviewsTotal})</span>
                    </span>
                  ) : (
                    <span>Ainda sem avaliações</span>
                  )}
                  <span>·</span>
                  <span data-testid="product-sold-count" className="tabular-nums">
                    {soldCount} vendidos
                  </span>
                </div>
              </div>

              {/* Variantes */}
              {product.variants && product.variants.length > 0 && (
                <div>
                  <label
                    className="block text-xs font-bold mb-1.5"
                    style={{ color: "var(--rbw-muted)" }}
                  >
                    Opção / Variante:
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {product.variants.map((v) => {
                      const active = selectedVariant === v;
                      return (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setSelectedVariant(v)}
                          className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                            active ? "bg-red-600 text-white border-red-600" : ""
                          }`}
                          style={
                            active
                              ? undefined
                              : {
                                  backgroundColor: "var(--rbw-surface)",
                                  borderColor: "var(--rbw-border)",
                                  color: "var(--rbw-text)",
                                }
                          }
                        >
                          {v}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Quantidade - / + */}
              <div
                className="p-3 rounded-2xl border flex flex-wrap items-center justify-between gap-2"
                style={{
                  backgroundColor: "var(--rbw-surface)",
                  borderColor: "var(--rbw-border)",
                }}
              >
                <div>
                  <span className="text-xs font-black block">Quantidade</span>
                  <span
                    className={`text-[11px] font-bold ${isOutOfStock ? "text-red-500" : ""}`}
                    style={isOutOfStock ? undefined : { color: "var(--rbw-muted)" }}
                  >
                    {isOutOfStock ? "Esgotado" : `${product.stock} disponíveis`}
                  </span>
                </div>

                <div
                  className="flex items-center border rounded-xl overflow-hidden"
                  style={{ borderColor: "var(--rbw-border)" }}
                >
                  <button
                    type="button"
                    disabled={qty <= 1 || isOutOfStock}
                    onClick={() => setQty(Math.max(1, qty - 1))}
                    className="w-10 h-10 grid place-items-center disabled:opacity-40 cursor-pointer"
                    aria-label="Diminuir quantidade"
                  >
                    <Minus size={14} />
                  </button>
                  <span className="w-10 text-center font-black text-sm tabular-nums">
                    {isOutOfStock ? 0 : qty}
                  </span>
                  <button
                    type="button"
                    disabled={qty >= maxQty || isOutOfStock}
                    onClick={() => setQty(Math.min(maxQty, qty + 1))}
                    className="w-10 h-10 grid place-items-center disabled:opacity-40 cursor-pointer"
                    aria-label="Aumentar quantidade"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>

              {/* Descrição com "Ver mais" */}
              {descriptionText && (
                <div
                  className="p-3.5 rounded-2xl border space-y-1.5"
                  style={{
                    backgroundColor: "var(--rbw-surface)",
                    borderColor: "var(--rbw-border)",
                  }}
                >
                  <h2 className="text-xs font-black uppercase tracking-wider" style={{ color: "var(--rbw-muted)" }}>
                    Descrição
                  </h2>
                  <p className="text-xs sm:text-sm leading-relaxed break-words">
                    {displayedDescription}
                  </p>
                  {isLongDescription && (
                    <button
                      type="button"
                      onClick={() => setDescExpanded((e) => !e)}
                      className="text-xs font-black text-red-600 hover:underline cursor-pointer"
                    >
                      {descExpanded ? "Ver menos" : "Ver mais"}
                    </button>
                  )}
                </div>
              )}

              {/* Ficha técnica compacta (Marca, Estado, Levantamento) */}
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div
                  className="p-2.5 rounded-xl border min-w-0"
                  style={{
                    backgroundColor: "var(--rbw-surface)",
                    borderColor: "var(--rbw-border)",
                  }}
                >
                  <span className="block text-[10px]" style={{ color: "var(--rbw-muted)" }}>
                    Marca
                  </span>
                  <span className="font-bold block truncate">{product.brand || "Local"}</span>
                </div>
                <div
                  className="p-2.5 rounded-xl border min-w-0"
                  style={{
                    backgroundColor: "var(--rbw-surface)",
                    borderColor: "var(--rbw-border)",
                  }}
                >
                  <span className="block text-[10px]" style={{ color: "var(--rbw-muted)" }}>
                    Estado
                  </span>
                  <span className="font-bold block truncate">
                    {product.condition === "usado" ? "Usado" : "Novo"}
                  </span>
                </div>
                <div
                  className="p-2.5 rounded-xl border min-w-0"
                  style={{
                    backgroundColor: "var(--rbw-surface)",
                    borderColor: "var(--rbw-border)",
                  }}
                >
                  <span className="block text-[10px]" style={{ color: "var(--rbw-muted)" }}>
                    Município
                  </span>
                  <span className="font-bold block truncate">
                    {product.municipality || "Uíge"}
                  </span>
                </div>
              </div>

              {/* Cartão do Vendedor com Avatar + Selo Verificada (só aprovada) + Visitar Loja */}
              <div
                data-testid="product-seller-card"
                className="p-3.5 rounded-2xl border space-y-3"
                style={{
                  backgroundColor: "var(--rbw-surface)",
                  borderColor: "var(--rbw-border)",
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar src={storeLogoUrl} name={storeNameDisplay} size="md" />
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-black truncate">{storeNameDisplay}</span>
                        {storeVerified ? (
                          <span
                            data-testid="product-seller-verified"
                            className="inline-flex items-center gap-0.5 text-[11px] font-bold text-red-600"
                          >
                            <BadgeCheck size={13} /> {getStoreVerificationLabel(sellerStore)}
                          </span>
                        ) : (
                          <span
                            data-testid="product-seller-unverified"
                            className="text-[11px] font-medium"
                            style={{ color: "var(--rbw-muted)" }}
                          >
                            {getStoreVerificationLabel(sellerStore)}
                          </span>
                        )}
                      </div>
                      <div
                        className="flex flex-wrap items-center gap-x-2 text-[11px]"
                        style={{ color: "var(--rbw-muted)" }}
                      >
                        <span className="inline-flex items-center gap-1">
                          <StoreIcon size={11} className="text-red-600" />
                          {formatStoreType(sellerStore?.storeType || product.storeType)}
                        </span>
                        {(sellerStore?.code || product.storeCode) && (
                          <span>· {sellerStore?.code || product.storeCode}</span>
                        )}
                        {storeActiveSince && (
                          <span className="inline-flex items-center gap-1">
                            · <Calendar size={11} /> Em actividade desde {storeActiveSince}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {product.storeId && onOpenStore && (
                    <button
                      type="button"
                      onClick={() => onOpenStore(product.storeId!)}
                      className="min-h-[38px] px-3 py-1.5 rounded-xl border border-red-600 text-red-600 hover:bg-red-600 hover:text-white text-xs font-black shrink-0 cursor-pointer transition-colors"
                    >
                      Visitar loja
                    </button>
                  )}
                </div>

                <div
                  className="pt-2.5 border-t flex flex-wrap items-center justify-between gap-2 text-[11px] font-medium"
                  style={{ borderColor: "var(--rbw-border)", color: "var(--rbw-muted)" }}
                >
                  <div className="flex items-center gap-2">
                    <Truck size={14} className="text-red-600 shrink-0" />
                    <span>Entrega no Uíge ou levantamento directo combinado com a loja</span>
                  </div>
                  {onToggleBlockSeller &&
                    (sellerStore?.ownerId || product.sellerId) &&
                    currentUser?.id !== (sellerStore?.ownerId || product.sellerId) && (
                      <button
                        type="button"
                        data-testid="product-block-seller-btn"
                        onClick={() =>
                          onToggleBlockSeller((sellerStore?.ownerId || product.sellerId)!)
                        }
                        className="inline-flex items-center gap-1 font-bold hover:text-red-600 cursor-pointer"
                      >
                        <Ban size={12} />
                        <span>{isSellerBlocked ? "Desbloquear vendedor" : "Bloquear vendedor"}</span>
                      </button>
                    )}
                </div>
              </div>

              {/* Mensagem directa & Denúncia */}
              <div
                className="p-3 rounded-2xl border space-y-2.5"
                style={{
                  backgroundColor: "var(--rbw-surface)",
                  borderColor: "var(--rbw-border)",
                }}
              >
                <span className="text-xs font-bold block" style={{ color: "var(--rbw-muted)" }}>
                  Perguntar ao comerciante:
                </span>
                <form onSubmit={handleSendChat} className="flex gap-2">
                  <input
                    type="text"
                    value={chatMessage}
                    onChange={(e) => setChatMessage(e.target.value)}
                    placeholder="Ex: Tem disponível para entrega hoje?"
                    className="flex-1 min-w-0 px-3 py-2 rounded-xl text-xs border bg-transparent outline-none focus:border-red-600"
                    style={{ borderColor: "var(--rbw-border)" }}
                  />
                  <button
                    type="submit"
                    disabled={!chatMessage.trim()}
                    className="px-3.5 py-2 rounded-xl text-xs font-black bg-red-600 text-white flex items-center gap-1 cursor-pointer shrink-0 disabled:opacity-50"
                  >
                    <Send size={13} />
                    <span>Enviar</span>
                  </button>
                </form>

                <div className="pt-1 text-center">
                  {!showReportInput ? (
                    <button
                      type="button"
                      onClick={() => setShowReportInput(true)}
                      className="text-[11px] font-semibold opacity-70 hover:opacity-100 flex items-center justify-center gap-1 mx-auto cursor-pointer"
                    >
                      <Flag size={12} className="text-red-600" /> Denunciar anúncio ou irregularidade
                    </button>
                  ) : (
                    <form onSubmit={handleSendReport} className="flex flex-wrap sm:flex-nowrap gap-2 mt-2">
                      <input
                        type="text"
                        value={reportReason}
                        onChange={(e) => setReportReason(e.target.value)}
                        placeholder="Indica o motivo da denúncia..."
                        className="flex-1 min-w-0 px-3 py-1.5 rounded-xl text-xs border bg-transparent outline-none focus:border-red-600"
                        style={{ borderColor: "var(--rbw-border)" }}
                      />
                      <div className="flex gap-1.5 shrink-0">
                        <button
                          type="submit"
                          disabled={!reportReason.trim()}
                          className="px-3 py-1.5 rounded-xl text-xs font-bold bg-red-600 text-white cursor-pointer disabled:opacity-50"
                        >
                          Enviar
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowReportInput(false)}
                          className="px-2.5 py-1.5 rounded-xl text-xs border cursor-pointer"
                          style={{ borderColor: "var(--rbw-border)" }}
                        >
                          Cancelar
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Avaliações do Produto (apenas quem tem encomenda entregue) */}
          <ReviewsSection
            title="Avaliações do produto"
            reviewType="produto"
            reviews={resolvedReviews}
            currentUser={currentUser}
            canReview={canReview}
            emptyEligibilityHint="Apenas clientes com encomenda entregue deste produto podem avaliar."
            onRequireAuth={onRequireAuth}
            onSubmitReview={handleLocalOrRemoteReviewSubmit}
            onReportReview={onReportReview}
          />

          {/* Produtos Semelhantes */}
          {similarProducts.length > 0 && (
            <div className="pt-4 border-t" style={{ borderColor: "var(--rbw-border)" }}>
              <h3 className="font-black text-sm sm:text-base mb-3">Artigos Semelhantes no Uíge</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
                {similarProducts.slice(0, 4).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onSelectProduct(p)}
                    className="p-2.5 rounded-2xl border cursor-pointer hover:border-red-600 transition-colors text-left min-w-0"
                    style={{
                      backgroundColor: "var(--rbw-surface)",
                      borderColor: "var(--rbw-border)",
                    }}
                  >
                    <div className="w-full h-24 rounded-xl overflow-hidden bg-zinc-900">
                      <SafeImage src={p.image} alt={p.name} className="w-full h-full object-cover" />
                    </div>
                    <div className="font-bold text-xs truncate mt-2">{p.name}</div>
                    <div className="font-black text-xs mt-0.5 text-red-600 tabular-nums">
                      {fmtKz(p.price)}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Barra Fixa Inferior do Produto */}
        <div
          data-testid="product-bottom-bar"
          className="shrink-0 border-t px-3.5 sm:px-5 py-3 pb-safe"
          style={{
            backgroundColor: "var(--rbw-surface)",
            borderColor: "var(--rbw-border)",
          }}
        >
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              disabled={isOutOfStock}
              onClick={() => {
                onAddToCart(product, qty, selectedVariant);
                onClose();
              }}
              className="min-h-[46px] px-3 rounded-xl border border-red-600 text-red-600 font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:bg-red-600/10 transition-colors"
            >
              <ShoppingCart size={16} />
              <span className="truncate">
                {isOutOfStock ? "Esgotado" : "Adicionar ao carrinho"}
              </span>
            </button>

            <button
              type="button"
              disabled={isOutOfStock}
              onClick={() => {
                if (onBuyNow) {
                  onBuyNow(product, qty, selectedVariant);
                } else {
                  onAddToCart(product, qty, selectedVariant);
                  onClose();
                }
              }}
              className="min-h-[46px] px-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <span className="truncate">Comprar agora</span>
            </button>
          </div>
        </div>
      </div>

      {/* Galeria Fullscreen */}
      <ImageGalleryModal
        images={gallery}
        title={product.name}
        initialIndex={safeSlideIdx}
        isOpen={galleryOpen}
        onClose={() => setGalleryOpen(false)}
      />
    </div>
  );
};
