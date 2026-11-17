import React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  MessageCircle,
  Minus,
  Package,
  Plus,
  ShoppingCart,
  Store as StoreIcon,
  Trash2,
  Truck,
} from "lucide-react";
import {
  Avatar,
  Order,
  Product,
  SafeImage,
  Store,
  StoreType,
  SystemConfig,
  buildWhatsAppOrderUrl,
  fmtKz,
  formatStoreType,
} from "@mercado-uige/shared";

export interface CartGroupItem {
  productId: string;
  qty: number;
  selectedVariant?: string;
  product: Product;
}

export interface CartGroup {
  storeKey: string;
  storeId?: string;
  storeName: string;
  storeCode?: string;
  storeType?: StoreType;
  items: CartGroupItem[];
  subtotal: number;
}

interface CartViewProps {
  cartGroups: CartGroup[];
  stores: Store[];
  systemConfig: SystemConfig;
  checkoutDeliveryType: "entrega" | "levantamento";
  onChangeDeliveryType: (mode: "entrega" | "levantamento") => void;
  checkoutPayment: string;
  onChangePayment: (method: string) => void;
  checkoutPhone: string;
  onChangePhone: (phone: string) => void;
  checkoutAddress: string;
  onChangeAddress: (address: string) => void;
  cartSubtotal: number;
  cartDeliveryTotal: number;
  cartTotal: number;
  recentOrders?: Order[];
  userName?: string;
  userPhone?: string | null;
  onUpdateQty: (productId: string, delta: number) => void;
  onRemoveItem: (productId: string) => void;
  onConfirmOrder: () => void;
  onExploreCatalog: () => void;
  onViewOrders?: () => void;
  onOpenStore?: (store: Store) => void;
}

export const CartView: React.FC<CartViewProps> = ({
  cartGroups,
  stores,
  systemConfig,
  checkoutDeliveryType,
  onChangeDeliveryType,
  checkoutPayment,
  onChangePayment,
  checkoutPhone,
  onChangePhone,
  checkoutAddress,
  onChangeAddress,
  cartSubtotal,
  cartDeliveryTotal,
  cartTotal,
  recentOrders = [],
  userName,
  userPhone,
  onUpdateQty,
  onRemoveItem,
  onConfirmOrder,
  onExploreCatalog,
  onViewOrders,
  onOpenStore,
}) => {
  return (
    <div
      data-testid="cart-view"
      className="max-w-2xl mx-auto space-y-4 anim-fadeUp"
      style={{ color: "var(--rbw-text)" }}
    >
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl sm:text-2xl font-black tracking-tight">O Meu Carrinho</h1>
        {cartGroups.length > 0 && (
          <span className="text-xs font-bold tabular-nums" style={{ color: "var(--rbw-muted)" }}>
            {cartGroups.length} loja{cartGroups.length > 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Confirmação pós-checkout com 1 botão WhatsApp por loja */}
      {recentOrders.length > 0 && (
        <div
          data-testid="cart-whatsapp-orders"
          className="rounded-3xl border border-red-600/40 p-4 space-y-3"
          style={{ backgroundColor: "var(--rbw-surface)" }}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2">
              <CheckCircle2 size={18} className="text-red-600 shrink-0 mt-0.5" />
              <div>
                <h2 className="text-sm font-black">
                  Encomenda{recentOrders.length > 1 ? "s" : ""} registada{recentOrders.length > 1 ? "s" : ""} por loja
                </h2>
                <p className="text-xs mt-0.5" style={{ color: "var(--rbw-muted)" }}>
                  Envia cada pedido directamente para o WhatsApp da respectiva loja.
                </p>
              </div>
            </div>
            {onViewOrders && (
              <button
                type="button"
                onClick={onViewOrders}
                className="text-xs font-black text-red-600 hover:underline cursor-pointer shrink-0"
              >
                Ver encomendas
              </button>
            )}
          </div>

          <div className="space-y-2.5">
            {recentOrders.map((ord) => {
              const st = ord.storeId ? stores.find((s) => s.id === ord.storeId) : undefined;
              const wa = buildWhatsAppOrderUrl({
                order: {
                  ...ord,
                  userName: ord.userName || userName,
                  userPhone: ord.userPhone || userPhone || undefined,
                },
                storePhone: ord.storePhone || st?.phone || null,
                fallbackAdminPhone: systemConfig.adminWhatsapp,
              });

              return (
                <div
                  key={ord.id}
                  className="p-3 rounded-2xl border space-y-2"
                  style={{
                    backgroundColor: "var(--rbw-surface-2)",
                    borderColor: "var(--rbw-border)",
                  }}
                >
                  <div className="flex items-center justify-between gap-2 text-xs font-black">
                    <span className="truncate">
                      #{ord.code} · {ord.storeName || "Loja Uíge"}
                    </span>
                    <span className="text-red-600 tabular-nums shrink-0">{fmtKz(ord.total)}</span>
                  </div>

                  {wa.usedFallback && (
                    <p className="text-[11px] flex items-start gap-1.5" style={{ color: "var(--rbw-muted)" }}>
                      <AlertTriangle size={13} className="text-red-600 shrink-0 mt-0.5" />
                      <span>
                        Loja sem WhatsApp registado — o pedido segue para o apoio do Mercado Uíge.
                      </span>
                    </p>
                  )}

                  <a
                    href={wa.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid={`cart-wa-btn-${ord.storeId || ord.code}`}
                    className="w-full min-h-[44px] px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white font-black text-xs flex items-center justify-center gap-2 transition-colors"
                  >
                    <MessageCircle size={15} />
                    <span>Enviar por WhatsApp ({ord.storeName || "Loja"})</span>
                  </a>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {cartGroups.length === 0 ? (
        <div
          className="py-12 px-4 rounded-3xl border text-center space-y-3"
          style={{
            backgroundColor: "var(--rbw-surface)",
            borderColor: "var(--rbw-border)",
          }}
        >
          <ShoppingCart size={38} className="mx-auto text-red-600 opacity-75" />
          <h2 className="font-black text-sm">O teu carrinho está vazio</h2>
          <p className="text-xs max-w-xs mx-auto" style={{ color: "var(--rbw-muted)" }}>
            Adiciona artigos das lojas locais do Uíge para organizar o pedido por loja.
          </p>
          <button
            type="button"
            onClick={onExploreCatalog}
            className="min-h-[44px] px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 font-black text-xs text-white cursor-pointer"
          >
            Explorar artigos
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {cartGroups.map((group) => {
            const storeObj = group.storeId ? stores.find((s) => s.id === group.storeId) : undefined;
            const storeDeliveryFee =
              checkoutDeliveryType === "entrega"
                ? Number(systemConfig.defaultDeliveryFee || 1500)
                : 0;
            const groupTotal = group.subtotal + storeDeliveryFee;

            return (
              <section
                key={group.storeKey}
                data-testid={`cart-store-group-${group.storeKey}`}
                className="rounded-3xl border overflow-hidden"
                style={{
                  backgroundColor: "var(--rbw-surface)",
                  borderColor: "var(--rbw-border)",
                }}
              >
                {/* Cabeçalho da Loja */}
                <div
                  className="px-4 py-3 border-b flex items-center justify-between gap-2 text-xs"
                  style={{
                    backgroundColor: "var(--rbw-surface-2)",
                    borderColor: "var(--rbw-border)",
                  }}
                >
                  <button
                    type="button"
                    disabled={!storeObj || !onOpenStore}
                    onClick={() => storeObj && onOpenStore?.(storeObj)}
                    className={`flex items-center gap-2.5 min-w-0 text-left ${
                      storeObj && onOpenStore ? "cursor-pointer hover:text-red-600" : "cursor-default"
                    }`}
                  >
                    <Avatar
                      src={storeObj?.logo || storeObj?.facadeImage}
                      name={group.storeName}
                      size="xs"
                    />
                    <div className="min-w-0">
                      <span className="font-black block truncate">{group.storeName}</span>
                      <span className="text-[11px]" style={{ color: "var(--rbw-muted)" }}>
                        {formatStoreType(group.storeType)}
                        {group.storeCode ? ` · ${group.storeCode}` : ""}
                      </span>
                    </div>
                  </button>
                </div>

                {/* Itens */}
                <div className="divide-y" style={{ borderColor: "var(--rbw-border)" }}>
                  {group.items.map((item) => (
                    <div key={item.productId} className="p-3.5 flex items-center justify-between gap-3">
                      <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0 bg-zinc-900">
                        <SafeImage
                          src={item.product.image}
                          alt={item.product.name}
                          className="w-full h-full object-cover"
                          fallbackIcon={<Package size={20} className="text-red-600" />}
                        />
                      </div>

                      <div className="flex-1 min-w-0 space-y-1">
                        <h3 className="font-bold text-xs line-clamp-2">{item.product.name}</h3>
                        {item.selectedVariant && (
                          <span className="text-[11px] block" style={{ color: "var(--rbw-muted)" }}>
                            Opção: {item.selectedVariant}
                          </span>
                        )}
                        <span className="font-black text-sm text-red-600 block tabular-nums">
                          {fmtKz(item.product.price)}
                        </span>

                        <div className="flex items-center gap-2 pt-0.5">
                          <button
                            type="button"
                            onClick={() => onUpdateQty(item.productId, -1)}
                            className="w-8 h-8 rounded-lg border grid place-items-center cursor-pointer"
                            style={{ borderColor: "var(--rbw-border)" }}
                            aria-label="Diminuir quantidade"
                          >
                            <Minus size={13} />
                          </button>
                          <span className="min-w-[2.25rem] text-center text-xs font-black tabular-nums">
                            {item.qty}
                          </span>
                          <button
                            type="button"
                            onClick={() => onUpdateQty(item.productId, 1)}
                            className="w-8 h-8 rounded-lg border grid place-items-center cursor-pointer"
                            style={{ borderColor: "var(--rbw-border)" }}
                            aria-label="Aumentar quantidade"
                          >
                            <Plus size={13} />
                          </button>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => onRemoveItem(item.productId)}
                        className="w-10 h-10 rounded-xl grid place-items-center text-red-600 hover:bg-red-600/10 cursor-pointer shrink-0"
                        aria-label="Remover item do carrinho"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Subtotal e taxa desta loja */}
                <div
                  className="px-4 py-3 border-t space-y-1 text-xs"
                  style={{
                    backgroundColor: "var(--rbw-surface-2)",
                    borderColor: "var(--rbw-border)",
                  }}
                >
                  <div className="flex justify-between">
                    <span style={{ color: "var(--rbw-muted)" }}>Subtotal da loja</span>
                    <span className="font-bold tabular-nums">{fmtKz(group.subtotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: "var(--rbw-muted)" }}>
                      {checkoutDeliveryType === "entrega" ? "Taxa de entrega" : "Levantamento na loja"}
                    </span>
                    <span className="font-bold tabular-nums">{fmtKz(storeDeliveryFee)}</span>
                  </div>
                  <div className="flex justify-between font-black pt-1">
                    <span>Total desta loja</span>
                    <span className="text-red-600 tabular-nums">{fmtKz(groupTotal)}</span>
                  </div>
                </div>
              </section>
            );
          })}

          {/* Resumo & Dados de Entrega / Pagamento */}
          <div
            className="p-4 rounded-3xl border space-y-3.5"
            style={{
              backgroundColor: "var(--rbw-surface)",
              borderColor: "var(--rbw-border)",
            }}
          >
            <div>
              <label className="block text-xs font-black mb-1.5">Modo de recepção</label>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => onChangeDeliveryType("entrega")}
                  className={`min-h-[44px] px-3 rounded-xl font-black border cursor-pointer flex items-center justify-center gap-1.5 ${
                    checkoutDeliveryType === "entrega"
                      ? "bg-red-600 text-white border-red-600"
                      : ""
                  }`}
                  style={
                    checkoutDeliveryType === "entrega"
                      ? undefined
                      : { borderColor: "var(--rbw-border)", color: "var(--rbw-text)" }
                  }
                >
                  <Truck size={14} />
                  <span>Entrega ({fmtKz(systemConfig.defaultDeliveryFee)})</span>
                </button>
                <button
                  type="button"
                  onClick={() => onChangeDeliveryType("levantamento")}
                  className={`min-h-[44px] px-3 rounded-xl font-black border cursor-pointer flex items-center justify-center gap-1.5 ${
                    checkoutDeliveryType === "levantamento"
                      ? "bg-red-600 text-white border-red-600"
                      : ""
                  }`}
                  style={
                    checkoutDeliveryType === "levantamento"
                      ? undefined
                      : { borderColor: "var(--rbw-border)", color: "var(--rbw-text)" }
                  }
                >
                  <StoreIcon size={14} />
                  <span>Levantamento (Grátis)</span>
                </button>
              </div>
            </div>

            <div className="space-y-2.5 text-xs">
              <div>
                <label className="block font-bold mb-1">Método de pagamento</label>
                <select
                  value={checkoutPayment}
                  onChange={(e) => onChangePayment(e.target.value)}
                  className="w-full min-h-[42px] px-3 rounded-xl border font-medium outline-none focus:border-red-600"
                  style={{
                    borderColor: "var(--rbw-border)",
                    backgroundColor: "var(--rbw-surface-2)",
                    color: "var(--rbw-text)",
                  }}
                >
                  <option value="Multicaixa Express">Multicaixa Express</option>
                  <option value="Pagamento na Entrega">Pagamento na Entrega (Dinheiro/TPA)</option>
                  <option value="Transferência Bancária (IBAN)">Transferência Bancária (IBAN)</option>
                </select>
              </div>

              <div>
                <label className="block font-bold mb-1">Telemóvel / WhatsApp do cliente *</label>
                <input
                  type="tel"
                  required
                  value={checkoutPhone}
                  onChange={(e) => onChangePhone(e.target.value)}
                  placeholder="Ex: 923000000"
                  className="w-full min-h-[42px] px-3 rounded-xl border bg-transparent font-medium outline-none focus:border-red-600"
                  style={{ borderColor: "var(--rbw-border)" }}
                />
              </div>

              {checkoutDeliveryType === "entrega" && (
                <div>
                  <label className="block font-bold mb-1">Endereço de entrega no Uíge *</label>
                  <input
                    type="text"
                    required
                    value={checkoutAddress}
                    onChange={(e) => onChangeAddress(e.target.value)}
                    placeholder="Ex: Bairro Candombe Velho, Rua 4, Casa 12"
                    className="w-full min-h-[42px] px-3 rounded-xl border bg-transparent font-medium outline-none focus:border-red-600"
                    style={{ borderColor: "var(--rbw-border)" }}
                  />
                </div>
              )}
            </div>

            {/* Totais Gerais */}
            <div className="pt-2 border-t space-y-1.5 text-xs" style={{ borderColor: "var(--rbw-border)" }}>
              <div className="flex justify-between">
                <span style={{ color: "var(--rbw-muted)" }}>
                  Subtotal ({cartGroups.length} loja{cartGroups.length > 1 ? "s" : ""})
                </span>
                <span className="font-bold tabular-nums">{fmtKz(cartSubtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: "var(--rbw-muted)" }}>Entrega total</span>
                <span className="font-bold tabular-nums">{fmtKz(cartDeliveryTotal)}</span>
              </div>
              <div className="flex justify-between text-base font-black pt-1.5 border-t" style={{ borderColor: "var(--rbw-border)" }}>
                <span>Total geral</span>
                <span className="text-red-600 tabular-nums">{fmtKz(cartTotal)}</span>
              </div>
            </div>

            {cartGroups.length > 1 && (
              <p className="text-[11px] font-medium" style={{ color: "var(--rbw-muted)" }}>
                Serão criadas {cartGroups.length} encomendas independentes (uma por loja) com botão WhatsApp próprio.
              </p>
            )}

            <button
              type="button"
              onClick={onConfirmOrder}
              className="w-full min-h-[48px] rounded-2xl bg-red-600 hover:bg-red-700 font-black text-sm text-white shadow-lg cursor-pointer transition-colors"
            >
              Finalizar compra ({fmtKz(cartTotal)})
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
