import React, { useState, useEffect } from "react";
import {
  X,
  Heart,
  ShoppingCart,
  Star,
  MapPin,
  Store as StoreIcon,
  Crown,
  Share2,
  Flag,
  Send,
  Plus,
  Minus,
  ShieldCheck,
  Truck,
  Video,
} from "lucide-react";
import { Product, fmtKz, formatStoreType, nativePlugins, SafeImage } from "@mercado-uige/shared";

interface ProductDetailModalProps {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
  isFavorite: boolean;
  onToggleFavorite: (product: Product) => void;
  onAddToCart: (product: Product, qty: number, variant?: string) => void;
  onOpenStore?: (storeId: string) => void;
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
  onOpenStore,
  similarProducts,
  onSelectProduct,
  onSendMessage,
  onReportProduct,
}) => {
  const [qty, setQty] = useState(1);
  const [selectedVariant, setSelectedVariant] = useState("");
  const [activeImage, setActiveImage] = useState("");
  const [showVideo, setShowVideo] = useState(false);
  const [chatMessage, setChatMessage] = useState("");
  const [showReportInput, setShowReportInput] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    if (product) {
      setQty(1);
      setSelectedVariant(product.variants && product.variants.length > 0 ? product.variants[0] : "");
      setActiveImage(product.image || product.images?.[0] || "");
      setShowVideo(Boolean(product.videoUrl && product.mediaType === "video"));
      setChatMessage("");
      setShowReportInput(false);
      setReportReason("");
    }
  }, [product?.id, isOpen]);

  if (!isOpen || !product) return null;

  const isOutOfStock = Number(product.stock) <= 0;
  const maxQty = Math.max(1, Number(product.stock || 0));

  const handleShare = async () => {
    const success = await nativePlugins.shareContent(
      product.name,
      `Confere este produto no Mercado Uíge: ${product.name} por ${fmtKz(product.price)}`,
      window.location.href
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

  const gallery =
    product.images && product.images.length > 0
      ? product.images.filter(Boolean)
      : product.image
      ? [product.image]
      : [];

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-2.5 sm:p-5 bg-black/80 backdrop-blur-md anim-fadeUp"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl rounded-3xl p-3.5 sm:p-6 border shadow-2xl anim-pop max-h-[92vh] overflow-y-auto"
        style={{
          backgroundColor: "var(--surface)",
          borderColor: "var(--border)",
          color: "var(--text-primary)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Top Bar */}
        <div
          className="flex items-center justify-between gap-2 pb-3 border-b mb-4"
          style={{ borderColor: "var(--border)" }}
        >
          <div
            className="flex items-center gap-1.5 text-[11px] sm:text-xs font-bold min-w-0 truncate"
            style={{ color: "var(--text-secondary)" }}
          >
            <span className="capitalize truncate">{product.categoryName || "Geral"}</span>
            <span>•</span>
            <span className="flex items-center gap-1 shrink-0">
              <MapPin size={12} /> {product.municipality || "Uíge"}, Uíge
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleShare}
              className="w-8 h-8 rounded-full border grid place-items-center hover:bg-slate-500/10 cursor-pointer"
              style={{ borderColor: "var(--border)" }}
              title="Partilhar produto"
              aria-label="Partilhar produto"
            >
              <Share2 size={15} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full border grid place-items-center hover:bg-slate-500/10 cursor-pointer"
              style={{ borderColor: "var(--border)" }}
              aria-label="Fechar detalhes do produto"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {copiedLink && (
          <div className="mb-3 p-2 text-xs font-bold bg-[#B7F34A]/20 text-emerald-400 rounded-xl text-center">
            Ligação do produto copiada!
          </div>
        )}

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          {/* Images Section */}
          <div className="space-y-3 min-w-0">
            <div
              className="relative aspect-square w-full rounded-2xl overflow-hidden border bg-slate-900/50"
              style={{ borderColor: "var(--border)" }}
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
                <SafeImage
                  src={activeImage}
                  alt={product.name}
                  className="w-full h-full object-cover"
                  fallbackText="Sem fotografia disponível"
                />
              )}

              <div className="absolute top-3 left-3 right-14 flex flex-wrap gap-1.5 z-10 pointer-events-none">
                {product.discount > 0 && (
                  <span
                    className="text-[11px] font-black px-2.5 py-1 rounded-full shadow-lg text-slate-950"
                    style={{ backgroundColor: "var(--accent)" }}
                  >
                    -{product.discount}% DESCONTO
                  </span>
                )}
                {product.condition === "usado" && (
                  <span className="text-[11px] font-black px-2.5 py-1 rounded-full bg-orange-500 text-white shadow-md">
                    Usado
                  </span>
                )}
                {product.storeVip && (
                  <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-400 text-slate-950 flex items-center gap-1 shadow-md">
                    <Crown size={12} className="fill-current" /> Loja VIP
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => onToggleFavorite(product)}
                className="absolute top-3 right-3 w-9 h-9 rounded-full grid place-items-center bg-black/50 backdrop-blur-md cursor-pointer hover:scale-105 transition-transform z-10"
                aria-label={isFavorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
              >
                <Heart
                  size={18}
                  className={isFavorite ? "text-red-500 fill-red-500" : "text-white fill-none"}
                />
              </button>
            </div>

            {/* Thumbnail & Video selector */}
            {(gallery.length > 1 || product.videoUrl) && (
              <div className="flex gap-2 overflow-x-auto no-scrollbar">
                {product.videoUrl && (
                  <button
                    type="button"
                    onClick={() => setShowVideo(true)}
                    className={`w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden border-2 shrink-0 cursor-pointer bg-slate-900 text-white grid place-items-center ${
                      showVideo ? "border-[#B7F34A]" : "border-transparent opacity-70"
                    }`}
                    aria-label="Ver vídeo do artigo"
                  >
                    <Video size={20} className="text-[#B7F34A]" />
                  </button>
                )}
                {gallery.map((img, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setShowVideo(false);
                      setActiveImage(img);
                    }}
                    className={`w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden border-2 shrink-0 cursor-pointer ${
                      !showVideo && activeImage === img ? "border-[#246BFD]" : "border-transparent opacity-60"
                    }`}
                  >
                    <SafeImage src={img} alt={`${product.name} (${idx + 1})`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}

            {/* Trust Badges */}
            <div
              className="p-3 rounded-2xl border space-y-2 text-xs"
              style={{ backgroundColor: "var(--surface-secondary)", borderColor: "var(--border)" }}
            >
              <div className="flex items-center gap-2 font-semibold">
                <Truck size={16} className="text-[#246BFD] shrink-0" />
                <span>Entrega rápida em Uíge e Negage (24h a 48h)</span>
              </div>
              <div className="flex items-center gap-2 font-semibold">
                <ShieldCheck size={16} className="text-emerald-500 shrink-0" />
                <span>Compra protegida • Multicaixa Express ou na entrega</span>
              </div>
            </div>
          </div>

          {/* Details Section */}
          <div className="flex flex-col justify-between space-y-4 min-w-0">
            <div>
              {/* Store info banner */}
              <div
                className="flex items-center justify-between gap-2 text-xs pb-2 border-b"
                style={{ borderColor: "var(--border)" }}
              >
                <div className="flex items-center gap-1.5 font-bold min-w-0 flex-wrap" style={{ color: "var(--text-secondary)" }}>
                  <StoreIcon size={14} className="text-[#246BFD] shrink-0" />
                  <span className="shrink-0">Vendido por:</span>
                  {product.storeId && onOpenStore ? (
                    <button
                      type="button"
                      onClick={() => onOpenStore(product.storeId!)}
                      className="text-[#246BFD] font-black hover:underline cursor-pointer truncate"
                    >
                      {product.storeName || "Loja Local"}
                    </button>
                  ) : (
                    <span className="text-[#246BFD] font-black truncate">{product.storeName || "Loja Local"}</span>
                  )}
                  <span className="opacity-60">•</span>
                  <span className="text-[11px] font-semibold">
                    {formatStoreType(product.storeType)}
                    {product.storeCode ? ` (${product.storeCode})` : ""}
                  </span>
                </div>
                {product.reviewsCount > 0 && product.rating > 0 ? (
                  <div className="flex items-center gap-1 text-amber-400 font-bold shrink-0">
                    <Star size={13} className="fill-current" />
                    <span>{Number(product.rating).toFixed(1)}</span>
                  </div>
                ) : (
                  <span className="text-[11px] opacity-60 shrink-0">Sem avaliações</span>
                )}
              </div>

              {/* Title */}
              <h1 className="text-lg sm:text-2xl font-black mt-2 leading-tight break-words" style={{ color: "var(--text-primary)" }}>
                {product.name}
              </h1>

              {/* Price */}
              <div className="mt-2.5 flex flex-wrap items-baseline gap-2.5">
                <span className="text-2xl sm:text-3xl font-black tracking-tight" style={{ color: "var(--accent)" }}>
                  {fmtKz(product.price)}
                </span>
                {product.oldPrice && Number(product.oldPrice) > Number(product.price) && (
                  <span className="text-sm line-through opacity-50" style={{ color: "var(--text-secondary)" }}>
                    {fmtKz(product.oldPrice)}
                  </span>
                )}
              </div>

              {/* Description */}
              {product.description && (
                <p className="mt-3 text-xs sm:text-sm leading-relaxed opacity-85 break-words" style={{ color: "var(--text-primary)" }}>
                  {product.description}
                </p>
              )}

              {/* Details table */}
              <div className="grid grid-cols-2 gap-2 mt-4 text-xs">
                <div className="p-2.5 rounded-xl border min-w-0" style={{ backgroundColor: "var(--surface-secondary)", borderColor: "var(--border)" }}>
                  <span className="opacity-60 block">Marca:</span>
                  <span className="font-bold block truncate">{product.brand || "Local"}</span>
                </div>
                <div className="p-2.5 rounded-xl border min-w-0" style={{ backgroundColor: "var(--surface-secondary)", borderColor: "var(--border)" }}>
                  <span className="opacity-60 block">Estado:</span>
                  <span className="font-bold block truncate">{product.condition === "usado" ? "Usado (Verificado)" : "Novo"}</span>
                </div>
                <div className="p-2.5 rounded-xl border min-w-0" style={{ backgroundColor: "var(--surface-secondary)", borderColor: "var(--border)" }}>
                  <span className="opacity-60 block">Disponibilidade:</span>
                  <span className={`font-bold block truncate ${isOutOfStock ? "text-red-500" : "text-emerald-500"}`}>
                    {isOutOfStock ? "Sem Stock" : `${product.stock} unidades`}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl border min-w-0" style={{ backgroundColor: "var(--surface-secondary)", borderColor: "var(--border)" }}>
                  <span className="opacity-60 block">Levantamento:</span>
                  <span className="font-bold block truncate">{product.municipality || "Uíge"}, Uíge</span>
                </div>
              </div>

              {/* Variants */}
              {product.variants && product.variants.length > 0 && (
                <div className="mt-4">
                  <label className="block text-xs font-bold mb-1.5" style={{ color: "var(--text-secondary)" }}>
                    Opção / Variante:
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {product.variants.map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setSelectedVariant(v)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                          selectedVariant === v
                            ? "bg-[#246BFD] text-white border-[#246BFD]"
                            : "border-[var(--border)] hover:border-[#246BFD]"
                        }`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Quantity Stepper */}
              <div className="mt-4 flex flex-wrap items-center gap-2.5">
                <span className="text-xs font-bold" style={{ color: "var(--text-secondary)" }}>Quantidade:</span>
                <div className="flex items-center border rounded-xl overflow-hidden" style={{ borderColor: "var(--border)" }}>
                  <button
                    type="button"
                    disabled={qty <= 1 || isOutOfStock}
                    onClick={() => setQty(Math.max(1, qty - 1))}
                    className="w-8 h-8 grid place-items-center hover:bg-slate-500/10 disabled:opacity-40 cursor-pointer"
                    aria-label="Diminuir quantidade"
                  >
                    <Minus size={14} />
                  </button>
                  <span className="w-9 text-center font-black text-sm">{isOutOfStock ? 0 : qty}</span>
                  <button
                    type="button"
                    disabled={qty >= maxQty || isOutOfStock}
                    onClick={() => setQty(Math.min(maxQty, qty + 1))}
                    className="w-8 h-8 grid place-items-center hover:bg-slate-500/10 disabled:opacity-40 cursor-pointer"
                    aria-label="Aumentar quantidade"
                  >
                    <Plus size={14} />
                  </button>
                </div>
                {!isOutOfStock && (
                  <span className="text-[11px] opacity-75 font-bold">Total: {fmtKz(Number(product.price || 0) * qty)}</span>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2.5 pt-2">
              <button
                type="button"
                disabled={isOutOfStock}
                onClick={() => {
                  onAddToCart(product, qty, selectedVariant);
                  onClose();
                }}
                className="w-full py-3.5 rounded-2xl font-black text-sm text-white shadow-lg flex items-center justify-center gap-2 cursor-pointer transition-transform active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ backgroundColor: "var(--primary)" }}
              >
                <ShoppingCart size={18} />
                <span>{isOutOfStock ? "Produto Esgotado" : "Adicionar ao Carrinho"}</span>
              </button>

              {/* Message to vendor */}
              <div className="p-3 rounded-2xl border" style={{ backgroundColor: "var(--surface-secondary)", borderColor: "var(--border)" }}>
                <span className="text-xs font-bold block mb-1.5" style={{ color: "var(--text-secondary)" }}>
                  Mensagem directa ao Comerciante:
                </span>
                <form onSubmit={handleSendChat} className="flex gap-2">
                  <input
                    type="text"
                    value={chatMessage}
                    onChange={(e) => setChatMessage(e.target.value)}
                    placeholder="Ex: Tem disponível para entrega hoje?"
                    className="flex-1 min-w-0 px-3 py-2 rounded-xl text-xs border bg-transparent outline-none focus:border-[#246BFD]"
                    style={{ borderColor: "var(--border)" }}
                  />
                  <button
                    type="submit"
                    disabled={!chatMessage.trim()}
                    className="px-3 py-2 rounded-xl text-xs font-bold text-white flex items-center gap-1 cursor-pointer shrink-0 disabled:opacity-50"
                    style={{ backgroundColor: "var(--primary)" }}
                  >
                    <Send size={13} />
                    <span>Enviar</span>
                  </button>
                </form>
              </div>

              {/* Report product */}
              <div className="pt-1 text-center">
                {!showReportInput ? (
                  <button
                    type="button"
                    onClick={() => setShowReportInput(true)}
                    className="text-[11px] font-semibold opacity-65 hover:opacity-100 flex items-center justify-center gap-1 mx-auto cursor-pointer"
                  >
                    <Flag size={12} /> Denunciar anúncio ou irregularidade
                  </button>
                ) : (
                  <form onSubmit={handleSendReport} className="flex flex-wrap sm:flex-nowrap gap-2 mt-2">
                    <input
                      type="text"
                      value={reportReason}
                      onChange={(e) => setReportReason(e.target.value)}
                      placeholder="Indique o motivo da denúncia..."
                      className="flex-1 min-w-0 px-3 py-1.5 rounded-xl text-xs border bg-transparent outline-none"
                      style={{ borderColor: "var(--border)" }}
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
                        style={{ borderColor: "var(--border)" }}
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

        {/* Similar Products Carousel */}
        {similarProducts.length > 0 && (
          <div className="mt-6 pt-5 border-t" style={{ borderColor: "var(--border)" }}>
            <h3 className="font-black text-sm sm:text-base mb-3">Produtos Semelhantes em Uíge</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
              {similarProducts.slice(0, 4).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onSelectProduct(p)}
                  className="p-2.5 rounded-2xl border cursor-pointer hover:border-[#246BFD] transition-colors text-left min-w-0"
                  style={{ backgroundColor: "var(--surface-secondary)", borderColor: "var(--border)" }}
                >
                  <div className="w-full h-24 rounded-xl overflow-hidden bg-slate-900/50">
                    <SafeImage src={p.image} alt={p.name} className="w-full h-full object-cover" />
                  </div>
                  <div className="font-bold text-xs truncate mt-2">{p.name}</div>
                  <div className="font-black text-xs mt-0.5" style={{ color: "var(--accent)" }}>
                    {fmtKz(p.price)}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
