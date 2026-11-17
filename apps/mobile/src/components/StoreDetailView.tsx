import React, { useMemo, useState } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  Calendar,
  Crown,
  Flag,
  Heart,
  MapPin,
  MessageCircle,
  Package,
  Phone,
  ShoppingCart,
  Store as StoreIcon,
  UserCheck,
  UserPlus,
} from "lucide-react";
import {
  Avatar,
  Order,
  Product,
  SafeImage,
  Store,
  StorePublicStats,
  StoreReview,
  User,
  buildStoreWhatsAppChatUrl,
  calculateDiscountPercent,
  canUserReviewStore,
  computeReviewStats,
  filterStoreProducts,
  fmtKz,
  formatActiveSince,
  formatStoreType,
  getStoreProductCategories,
  isStoreVerified,
} from "@mercado-uige/shared";
import { ReviewsSection } from "./ReviewsSection";

type StoreTab = "produtos" | "sobre" | "avaliacoes" | "contactos";

interface StoreDetailViewProps {
  store: Store;
  products: Product[];
  reviews: StoreReview[];
  stats?: StorePublicStats | null;
  orders: Order[];
  currentUser: User | null;
  favorites: string[];
  isFollowing: boolean;
  followersCount: number;
  onBack: () => void;
  onToggleFollow: () => void;
  onToggleFavorite: (product: Product) => void;
  onAddToCart: (product: Product) => void;
  onOpenProduct: (product: Product) => void;
  onSubmitReview: (payload: { stars: number; comment: string; photos: string[] }) => Promise<void>;
  onSubmitReport: (reason: string) => Promise<void>;
  onRequireAuth: () => void;
  onMissingPhone?: () => void;
}

export const StoreDetailView: React.FC<StoreDetailViewProps> = ({
  store,
  products,
  reviews,
  stats,
  orders,
  currentUser,
  favorites,
  isFollowing,
  followersCount,
  onBack,
  onToggleFollow,
  onToggleFavorite,
  onAddToCart,
  onOpenProduct,
  onSubmitReview,
  onSubmitReport,
  onRequireAuth,
  onMissingPhone,
}) => {
  const [activeTab, setActiveTab] = useState<StoreTab>("produtos");
  const [selectedCategory, setSelectedCategory] = useState<string>("Todas");
  const [showReportForm, setShowReportForm] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [sendingReport, setSendingReport] = useState(false);

  // Isolamento estrito: apenas produtos cujo storeId corresponde exactamente a esta loja
  const allStoreProducts = useMemo(() => filterStoreProducts(products, store.id), [products, store.id]);
  const storeCategories = useMemo(
    () => getStoreProductCategories(products, store.id),
    [products, store.id]
  );
  const visibleProducts = useMemo(
    () =>
      selectedCategory === "Todas"
        ? allStoreProducts
        : filterStoreProducts(products, store.id, selectedCategory),
    [allStoreProducts, products, store.id, selectedCategory]
  );

  const reviewStats = useMemo(() => computeReviewStats(reviews), [reviews]);
  const verified = isStoreVerified(store);
  const coverUrl = (store.cover || store.facadeImage || "").trim();
  const logoUrl = (store.logo || store.facadeImage || "").trim();
  const activeSince = formatActiveSince(store.createdAt);
  const whatsappChatUrl = buildStoreWhatsAppChatUrl(store.phone, store.name);

  const realProductsCount = stats?.productsCount ?? allStoreProducts.length;
  const realDeliveredCount = stats?.deliveredOrdersCount ?? Number(store.deliveredOrdersCount || 0);
  const realRatingValue =
    reviewStats.total > 0
      ? reviewStats.average
      : stats && stats.reviewsCount > 0
      ? stats.rating
      : Number(store.reviewsCount || 0) > 0
      ? Number(store.rating || 0)
      : 0;
  const realReviewsTotal =
    reviewStats.total > 0
      ? reviewStats.total
      : stats?.reviewsCount ?? Number(store.reviewsCount || 0);

  const canReview = useMemo(
    () => canUserReviewStore(currentUser?.id, store.id, orders, products),
    [currentUser?.id, store.id, orders, products]
  );

  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportReason.trim()) return;
    setSendingReport(true);
    try {
      await onSubmitReport(reportReason.trim());
      setReportReason("");
      setShowReportForm(false);
    } finally {
      setSendingReport(false);
    }
  };

  return (
    <div
      data-testid="store-detail-view"
      className="space-y-4 pb-24 anim-fadeUp"
      style={{ color: "var(--rbw-text)" }}
    >
      {/* Top Action Bar */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onBack}
          className="min-h-[44px] inline-flex items-center gap-1.5 px-3 rounded-xl border text-xs font-bold cursor-pointer"
          style={{
            backgroundColor: "var(--rbw-surface)",
            borderColor: "var(--rbw-border)",
          }}
        >
          <ArrowLeft size={15} />
          <span>Voltar às lojas</span>
        </button>

        <button
          type="button"
          onClick={() => setShowReportForm((v) => !v)}
          className="min-h-[44px] inline-flex items-center gap-1.5 px-3 rounded-xl border text-xs font-bold text-red-600 cursor-pointer"
          style={{
            backgroundColor: "var(--rbw-surface)",
            borderColor: "var(--rbw-border)",
          }}
        >
          <Flag size={14} />
          <span>Denunciar</span>
        </button>
      </div>

      {showReportForm && (
        <form
          onSubmit={handleReportSubmit}
          className="p-3.5 rounded-2xl border border-red-600/40 bg-red-600/10 space-y-2 text-xs"
        >
          <label className="font-bold block text-red-500">Motivo da denúncia contra esta loja</label>
          <div className="flex gap-2">
            <input
              type="text"
              required
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              placeholder="Descreve o problema..."
              className="flex-1 min-w-0 px-3 py-2 rounded-xl border bg-transparent outline-none focus:border-red-600"
              style={{ borderColor: "var(--rbw-border)" }}
            />
            <button
              type="submit"
              disabled={sendingReport}
              className="px-4 py-2 rounded-xl bg-red-600 text-white font-black cursor-pointer shrink-0 disabled:opacity-50"
            >
              {sendingReport ? "..." : "Enviar"}
            </button>
          </div>
        </form>
      )}

      {/* Cabeçalho da Loja (Capa 16:9 opcional + Logótipo + Selo Verificada + Seguir + 3 números reais) */}
      <div
        className="rounded-3xl border overflow-hidden"
        style={{
          backgroundColor: "var(--rbw-surface)",
          borderColor: "var(--rbw-border)",
        }}
      >
        {coverUrl ? (
          <div className="relative aspect-video w-full overflow-hidden bg-zinc-900">
            <SafeImage
              src={coverUrl}
              alt={`Capa da loja ${store.name}`}
              className="w-full h-full object-cover"
              loading="eager"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
          </div>
        ) : (
          <div className="h-3 w-full bg-red-600" />
        )}

        <div className="p-4 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <Avatar src={logoUrl} name={store.name} size="xl" />
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <h1 className="text-lg sm:text-xl font-black tracking-tight break-words">
                    {store.name}
                  </h1>
                  {store.isVip && <Crown size={16} className="text-red-600 fill-red-600 shrink-0" />}
                </div>

                {verified && (
                  <div
                    data-testid="store-verified-badge"
                    className="inline-flex items-center gap-1 text-xs font-bold text-red-600"
                  >
                    <BadgeCheck size={14} />
                    <span>Loja verificada</span>
                  </div>
                )}

                <div
                  className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs"
                  style={{ color: "var(--rbw-muted)" }}
                >
                  <span className="font-semibold">{formatStoreType(store.storeType)}</span>
                  {store.code && <span>· {store.code}</span>}
                  {activeSince && (
                    <span className="inline-flex items-center gap-1">
                      · <Calendar size={11} /> Em actividade desde {activeSince}
                    </span>
                  )}
                </div>

                <p className="text-xs font-semibold tabular-nums" style={{ color: "var(--rbw-muted)" }}>
                  {followersCount} {followersCount === 1 ? "seguidor" : "seguidores"}
                </p>
              </div>
            </div>

            <button
              type="button"
              data-testid="store-follow-header-btn"
              onClick={onToggleFollow}
              className={`min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-black inline-flex items-center gap-1.5 shrink-0 cursor-pointer border transition-colors ${
                isFollowing
                  ? "border-red-600 text-red-600 bg-transparent"
                  : "bg-red-600 border-red-600 text-white hover:bg-red-700"
              }`}
            >
              {isFollowing ? <UserCheck size={14} /> : <UserPlus size={14} />}
              <span>{isFollowing ? "A seguir" : "Seguir"}</span>
            </button>
          </div>

          {/* 3 Números reais calculados na base de dados */}
          <div
            className="grid grid-cols-3 divide-x rounded-2xl border py-3 text-center"
            style={{
              backgroundColor: "var(--rbw-surface-2)",
              borderColor: "var(--rbw-border)",
            }}
          >
            <div className="px-2">
              <span className="text-base sm:text-lg font-black tabular-nums block">
                {realProductsCount}
              </span>
              <span className="text-[11px] font-medium block" style={{ color: "var(--rbw-muted)" }}>
                Produtos
              </span>
            </div>
            <div className="px-2" style={{ borderColor: "var(--rbw-border)" }}>
              <span className="text-base sm:text-lg font-black tabular-nums block">
                {realDeliveredCount}
              </span>
              <span className="text-[11px] font-medium block" style={{ color: "var(--rbw-muted)" }}>
                Entregues
              </span>
            </div>
            <div className="px-2" style={{ borderColor: "var(--rbw-border)" }}>
              <span className="text-base sm:text-lg font-black tabular-nums block">
                {realReviewsTotal > 0 ? `${realRatingValue.toFixed(1)} ★` : "0.0"}
              </span>
              <span className="text-[11px] font-medium block truncate" style={{ color: "var(--rbw-muted)" }}>
                {realReviewsTotal > 0 ? `${realReviewsTotal} aval.` : "Sem avaliações"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Abas: Sobre, Produtos, Avaliações, Contactos */}
      <div
        role="tablist"
        aria-label="Secções da loja"
        className="grid grid-cols-4 gap-1.5 p-1 rounded-2xl border"
        style={{
          backgroundColor: "var(--rbw-surface)",
          borderColor: "var(--rbw-border)",
        }}
      >
        {(
          [
            { id: "produtos", label: "Produtos" },
            { id: "sobre", label: "Sobre" },
            { id: "avaliacoes", label: "Avaliações" },
            { id: "contactos", label: "Contactos" },
          ] as { id: StoreTab; label: string }[]
        ).map((t) => {
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`min-h-[40px] px-2 py-2 rounded-xl text-xs font-black cursor-pointer transition-colors ${
                active ? "bg-red-600 text-white" : "hover:text-red-600"
              }`}
              style={active ? undefined : { color: "var(--rbw-text)" }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ABA: PRODUTOS */}
      {activeTab === "produtos" && (
        <div className="space-y-3">
          {storeCategories.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
              {["Todas", ...storeCategories].map((cat) => {
                const active = selectedCategory === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`min-h-[36px] px-3.5 py-1.5 rounded-xl text-xs font-bold border whitespace-nowrap cursor-pointer transition-colors ${
                      active ? "bg-red-600 border-red-600 text-white" : ""
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
                    {cat}
                  </button>
                );
              })}
            </div>
          )}

          {visibleProducts.length === 0 ? (
            <div
              className="py-10 px-4 rounded-2xl border text-center space-y-1.5"
              style={{
                backgroundColor: "var(--rbw-surface)",
                borderColor: "var(--rbw-border)",
              }}
            >
              <Package size={34} className="mx-auto text-red-600 opacity-75" />
              <p className="text-sm font-black">
                {allStoreProducts.length === 0
                  ? "Esta loja ainda não publicou artigos"
                  : `Sem artigos na categoria "${selectedCategory}"`}
              </p>
              <p className="text-xs" style={{ color: "var(--rbw-muted)" }}>
                Explora as outras categorias ou segue a loja para acompanhar novidades.
              </p>
            </div>
          ) : (
            <div data-testid="store-products-grid" className="grid grid-cols-2 gap-3">
              {visibleProducts.map((p) => {
                const discountPct = calculateDiscountPercent(p.price, p.oldPrice);
                const isFav = favorites.includes(p.id);
                const outOfStock = Number(p.stock) <= 0;
                const soldCount = Math.max(0, Number(p.sales || 0));

                return (
                  <article
                    key={p.id}
                    className="rounded-2xl border overflow-hidden flex flex-col justify-between min-w-0"
                    style={{
                      backgroundColor: "var(--rbw-surface)",
                      borderColor: "var(--rbw-border)",
                    }}
                  >
                    <div
                      className="relative aspect-[4/3] w-full overflow-hidden cursor-pointer bg-zinc-900"
                      onClick={() => onOpenProduct(p)}
                    >
                      <SafeImage
                        src={p.image}
                        alt={p.name}
                        className="w-full h-full object-cover"
                        fallbackText="Sem fotografia"
                      />

                      {discountPct > 0 && (
                        <span className="absolute top-2 left-2 px-2 py-0.5 rounded-lg bg-red-600 text-white text-[10px] font-black tabular-nums">
                          -{discountPct}%
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleFavorite(p);
                        }}
                        aria-label={isFav ? "Remover dos favoritos" : "Adicionar aos favoritos"}
                        className="absolute top-2 right-2 w-9 h-9 rounded-full bg-black/65 text-white grid place-items-center cursor-pointer"
                      >
                        <Heart
                          size={15}
                          className={isFav ? "text-red-500 fill-red-500" : "text-white"}
                        />
                      </button>
                    </div>

                    <div className="p-2.5 flex flex-col flex-1 justify-between gap-2 min-w-0">
                      <div className="space-y-1 min-w-0">
                        <h3
                          onClick={() => onOpenProduct(p)}
                          className="text-xs font-bold leading-snug line-clamp-2 cursor-pointer hover:text-red-600"
                        >
                          {p.name}
                        </h3>

                        <div className="flex flex-wrap items-baseline gap-1.5">
                          <span className="text-sm font-black tabular-nums text-red-600">
                            {fmtKz(p.price)}
                          </span>
                          {discountPct > 0 && p.oldPrice && (
                            <span
                              className="text-[11px] line-through tabular-nums"
                              style={{ color: "var(--rbw-muted)" }}
                            >
                              {fmtKz(p.oldPrice)}
                            </span>
                          )}
                        </div>

                        <p
                          className="text-[11px] font-medium tabular-nums"
                          style={{ color: "var(--rbw-muted)" }}
                        >
                          {soldCount} vendidos
                        </p>
                      </div>

                      <button
                        type="button"
                        disabled={outOfStock}
                        onClick={() => onAddToCart(p)}
                        className="w-full min-h-[38px] rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <ShoppingCart size={13} />
                        <span>{outOfStock ? "Esgotado" : "Adicionar"}</span>
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ABA: SOBRE */}
      {activeTab === "sobre" && (
        <div
          className="rounded-2xl border p-4 space-y-3 text-xs"
          style={{
            backgroundColor: "var(--rbw-surface)",
            borderColor: "var(--rbw-border)",
          }}
        >
          <h2 className="text-sm font-black">Sobre {store.name}</h2>
          <p className="leading-relaxed" style={{ color: store.description ? "var(--rbw-text)" : "var(--rbw-muted)" }}>
            {store.description?.trim() || "Esta loja ainda não adicionou uma descrição."}
          </p>

          <div
            className="pt-3 border-t space-y-2"
            style={{ borderColor: "var(--rbw-border)" }}
          >
            <div className="flex items-center justify-between gap-2">
              <span style={{ color: "var(--rbw-muted)" }}>Modalidade</span>
              <span className="font-bold">{formatStoreType(store.storeType)}</span>
            </div>
            {store.code && (
              <div className="flex items-center justify-between gap-2">
                <span style={{ color: "var(--rbw-muted)" }}>Código da loja</span>
                <span className="font-bold tabular-nums">{store.code}</span>
              </div>
            )}
            {activeSince && (
              <div className="flex items-center justify-between gap-2">
                <span style={{ color: "var(--rbw-muted)" }}>Em actividade desde</span>
                <span className="font-bold">{activeSince}</span>
              </div>
            )}
            <div className="flex items-center justify-between gap-2">
              <span style={{ color: "var(--rbw-muted)" }}>Estado de verificação</span>
              <span className={`font-bold ${verified ? "text-red-600" : ""}`}>
                {verified ? "Loja verificada" : "Em verificação"}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ABA: AVALIAÇÕES */}
      {activeTab === "avaliacoes" && (
        <ReviewsSection
          title={`Avaliações de ${store.name}`}
          reviews={reviews}
          currentUser={currentUser}
          canReview={canReview}
          emptyEligibilityHint="Apenas clientes com encomenda entregue desta loja podem avaliar."
          onRequireAuth={onRequireAuth}
          onSubmitReview={onSubmitReview}
        />
      )}

      {/* ABA: CONTACTOS */}
      {activeTab === "contactos" && (
        <div
          className="rounded-2xl border p-4 space-y-3 text-xs"
          style={{
            backgroundColor: "var(--rbw-surface)",
            borderColor: "var(--rbw-border)",
          }}
        >
          <h2 className="text-sm font-black">Contactos e Localização</h2>
          <div className="space-y-2.5">
            <div className="flex items-start gap-2.5">
              <MapPin size={15} className="text-red-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block">Endereço no Uíge</span>
                <span style={{ color: "var(--rbw-muted)" }}>
                  {[store.address, store.bairro, store.municipality, "Uíge"]
                    .filter(Boolean)
                    .join(", ")}
                </span>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <Phone size={15} className="text-red-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block">Telefone / WhatsApp</span>
                <span style={{ color: "var(--rbw-muted)" }}>
                  {store.phone || "Contacto não disponibilizado pela loja"}
                </span>
              </div>
            </div>
          </div>

          {whatsappChatUrl && (
            <a
              href={whatsappChatUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full min-h-[44px] rounded-xl bg-red-600 hover:bg-red-700 text-white font-black flex items-center justify-center gap-2"
            >
              <MessageCircle size={16} />
              <span>Abrir conversa no WhatsApp</span>
            </a>
          )}
        </div>
      )}

      {/* Barra Fixa Inferior da Loja: Chat + Seguir loja */}
      <div
        data-testid="store-bottom-bar"
        className="fixed bottom-0 inset-x-0 z-40 border-t px-3 py-2.5 pb-safe"
        style={{
          backgroundColor: "var(--rbw-surface)",
          borderColor: "var(--rbw-border)",
        }}
      >
        <div className="max-w-3xl mx-auto grid grid-cols-2 gap-2.5">
          {whatsappChatUrl ? (
            <a
              href={whatsappChatUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[44px] rounded-xl border font-black text-xs flex items-center justify-center gap-2 cursor-pointer"
              style={{
                backgroundColor: "var(--rbw-surface-2)",
                borderColor: "var(--rbw-border)",
                color: "var(--rbw-text)",
              }}
            >
              <MessageCircle size={16} className="text-red-600" />
              <span>Chat</span>
            </a>
          ) : (
            <button
              type="button"
              onClick={() => onMissingPhone?.()}
              className="min-h-[44px] rounded-xl border font-black text-xs flex items-center justify-center gap-2 cursor-pointer opacity-80"
              style={{
                backgroundColor: "var(--rbw-surface-2)",
                borderColor: "var(--rbw-border)",
                color: "var(--rbw-text)",
              }}
            >
              <StoreIcon size={16} className="text-red-600" />
              <span>Chat</span>
            </button>
          )}

          <button
            type="button"
            onClick={onToggleFollow}
            className={`min-h-[44px] rounded-xl font-black text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors ${
              isFollowing
                ? "border border-red-600 text-red-600 bg-transparent"
                : "bg-red-600 hover:bg-red-700 text-white"
            }`}
          >
            {isFollowing ? <UserCheck size={16} /> : <UserPlus size={16} />}
            <span>{isFollowing ? "A seguir loja" : "Seguir loja"}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
