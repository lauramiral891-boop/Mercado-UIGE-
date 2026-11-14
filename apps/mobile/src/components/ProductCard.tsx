import React from "react";
import { Heart, ShoppingCart, Star, MapPin, Store as StoreIcon, Crown } from "lucide-react";
import { Product, fmtKz, formatStoreType, SafeImage } from "@mercado-uige/shared";

interface ProductCardProps {
  product: Product;
  isFavorite: boolean;
  onToggleFavorite: (product: Product) => void;
  onAddToCart: (product: Product) => void;
  onOpenProduct: (product: Product) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  isFavorite,
  onToggleFavorite,
  onAddToCart,
  onOpenProduct,
}) => {
  const isOutOfStock = Number(product.stock) <= 0;
  const isLowStock = Number(product.stock) > 0 && Number(product.stock) <= 5;
  const hasOldPrice = Boolean(product.oldPrice && Number(product.oldPrice) > Number(product.price));
  const isUsed = product.condition === "usado";

  return (
    <div
      className="group relative rounded-3xl overflow-hidden border transition-all duration-300 hover:shadow-xl flex flex-col justify-between min-w-0"
      style={{
        backgroundColor: "var(--surface)",
        borderColor: "var(--border)",
        boxShadow: "var(--shadow-card)",
      }}
    >
      {/* Image & Badges */}
      <div
        className="relative aspect-4/3 w-full overflow-hidden cursor-pointer bg-slate-900/60"
        onClick={() => onOpenProduct(product)}
      >
        <SafeImage
          src={product.image}
          alt={product.name}
          className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
          fallbackText="Sem fotografia"
        />

        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30 opacity-70 group-hover:opacity-60 transition-opacity pointer-events-none" />

        {/* Top Badges */}
        <div className="absolute top-2 left-2 flex flex-col gap-1 z-10 pointer-events-none">
          {product.discount > 0 && (
            <span
              className="text-[10px] sm:text-[11px] font-black px-2 py-0.5 rounded-full shadow-md text-slate-950"
              style={{ backgroundColor: "var(--accent)" }}
            >
              -{product.discount}%
            </span>
          )}
          {isUsed && (
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-orange-500 text-white shadow-sm">
              Usado
            </span>
          )}
          {product.storeVip && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 flex items-center gap-1 shadow-sm">
              <Crown size={10} className="fill-current" /> VIP
            </span>
          )}
        </div>

        {/* Favorite Button */}
        <button
          type="button"
          aria-label={isFavorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(product);
          }}
          className="absolute top-2 right-2 w-8 h-8 sm:w-9 sm:h-9 rounded-full grid place-items-center bg-black/40 hover:bg-black/60 backdrop-blur-md transition-transform active:scale-90 z-10 cursor-pointer"
        >
          <Heart
            size={16}
            className={`transition-colors duration-200 ${
              isFavorite ? "text-red-500 fill-red-500" : "text-white fill-none"
            }`}
          />
        </button>

        {/* Bottom Stock Badge */}
        <div className="absolute bottom-2 left-2 z-10 pointer-events-none">
          {isOutOfStock ? (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-600/90 text-white backdrop-blur-sm">
              Esgotado
            </span>
          ) : isLowStock ? (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/95 text-slate-950 font-black backdrop-blur-sm">
              Só {product.stock} un.
            </span>
          ) : (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/85 text-white backdrop-blur-sm">
              Em Stock
            </span>
          )}
        </div>
      </div>

      {/* Product Info */}
      <div className="p-2.5 sm:p-3.5 flex flex-col flex-1 justify-between gap-2 min-w-0">
        <div className="min-w-0">
          <div className="flex items-center justify-between text-[10px] sm:text-[11px] gap-1.5" style={{ color: "var(--text-secondary)" }}>
            <span className="truncate flex items-center gap-1 font-medium min-w-0">
              <StoreIcon size={11} className="shrink-0 text-[#246BFD]" />
              <span className="truncate">{product.storeName || "Loja Uíge"}</span>
            </span>
            <span className="shrink-0 flex items-center gap-0.5 max-w-[45%] truncate">
              <MapPin size={10} className="shrink-0" />
              <span className="truncate">{product.municipality || "Uíge"}</span>
            </span>
          </div>

          <div className="text-[10px] font-bold mt-0.5 truncate" style={{ color: "var(--text-secondary)" }}>
            {formatStoreType(product.storeType)}
            {product.storeCode ? ` · ${product.storeCode}` : ""}
          </div>

          <h3
            onClick={() => onOpenProduct(product)}
            className="font-bold text-xs sm:text-sm leading-snug line-clamp-2 mt-1 cursor-pointer hover:text-[#246BFD] transition-colors break-words"
            style={{ color: "var(--text-primary)" }}
            title={product.name}
          >
            {product.name}
          </h3>

          <div className="flex items-center flex-wrap gap-1 text-[11px] mt-1" style={{ color: "var(--text-secondary)" }}>
            {product.reviewsCount > 0 && product.rating > 0 ? (
              <>
                <div className="flex items-center text-amber-400 gap-0.5">
                  <Star size={12} className="fill-amber-400" />
                  <span className="font-bold">{Number(product.rating).toFixed(1)}</span>
                </div>
                <span className="opacity-60">({product.reviewsCount})</span>
              </>
            ) : (
              <span className="opacity-70">Sem avaliações</span>
            )}
            <span className="opacity-40">•</span>
            <span className={`font-bold ${isUsed ? "text-orange-400" : ""}`}>
              {isUsed ? "Usado" : "Novo"}
            </span>
          </div>
        </div>

        {/* Pricing and Action */}
        <div className="min-w-0">
          <div className="flex items-baseline flex-wrap gap-1.5 mt-0.5">
            <span
              className="font-black text-sm sm:text-base md:text-lg tracking-tight tabular-nums"
              style={{ color: "var(--accent)" }}
            >
              {fmtKz(product.price)}
            </span>
            {hasOldPrice && (
              <span className="text-[11px] line-through opacity-50 tabular-nums" style={{ color: "var(--text-secondary)" }}>
                {fmtKz(product.oldPrice)}
              </span>
            )}
          </div>

          <button
            type="button"
            disabled={isOutOfStock}
            onClick={() => onAddToCart(product)}
            className="mt-2.5 w-full py-2 sm:py-2.5 px-2.5 rounded-2xl font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-all duration-200 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-sm text-white"
            style={{ backgroundColor: "var(--primary)" }}
          >
            <ShoppingCart size={14} className="shrink-0" />
            <span className="truncate">{isOutOfStock ? "Indisponível" : "Adicionar"}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
