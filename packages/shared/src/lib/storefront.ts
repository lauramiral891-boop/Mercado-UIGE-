import { Order, Product, Store } from "../types";
import { normalizeAngolanPhone } from "./utils";

/**
 * Calcula a percentagem real de desconto entre o preço antigo e o preço actual.
 * Devolve 0 se não existir desconto válido.
 */
export function calculateDiscountPercent(price: number, oldPrice?: number | null): number {
  const curr = Number(price);
  const old = Number(oldPrice);
  if (!Number.isFinite(curr) || !Number.isFinite(old) || curr <= 0 || old <= curr) {
    return 0;
  }
  const pct = Math.round(((old - curr) / old) * 100);
  if (pct <= 0) return 0;
  return Math.min(99, pct);
}

/**
 * Garante isolamento estrito da loja: devolve APENAS produtos aprovados cujo `storeId === storeId`
 * (nunca mistura artigos de outras lojas nem do mesmo dono em loja diferente).
 */
export function filterStoreProducts(products: Product[], storeId: string, category?: string): Product[] {
  if (!storeId) return [];
  const cleanCat = (category || "").trim().toLowerCase();
  return products.filter((p) => {
    if (p.isApproved === false) return false;
    if (p.storeId !== storeId) return false;
    if (cleanCat && cleanCat !== "todas" && cleanCat !== "todos") {
      return (p.categoryName || "").trim().toLowerCase() === cleanCat;
    }
    return true;
  });
}

/**
 * Extrai as categorias distintas disponíveis dentro dos artigos de uma loja.
 */
export function getStoreProductCategories(products: Product[], storeId: string): string[] {
  const storeItems = filterStoreProducts(products, storeId);
  const seen = new Map<string, string>();
  for (const p of storeItems) {
    const label = (p.categoryName || "").trim();
    if (!label) continue;
    const key = label.toLowerCase();
    if (!seen.has(key)) seen.set(key, label);
  }
  return Array.from(seen.values()).sort((a, b) => a.localeCompare(b, "pt"));
}

/**
 * Verifica se o cliente pode avaliar o produto: exige pelo menos uma encomenda com estado "Entregue"
 * que contenha este produto.
 */
export function canUserReviewProduct(
  userId: string | undefined | null,
  productId: string | undefined | null,
  orders: Order[]
): boolean {
  if (!userId || !productId) return false;
  return orders.some(
    (o) =>
      o.userId === userId &&
      o.status === "Entregue" &&
      Array.isArray(o.items) &&
      o.items.some((it) => it.productId === productId)
  );
}

/**
 * Verifica se o cliente pode avaliar a loja: exige pelo menos uma encomenda da loja com estado "Entregue".
 */
export function canUserReviewStore(
  userId: string | undefined | null,
  storeId: string | undefined | null,
  orders: Order[],
  products: Product[] = []
): boolean {
  if (!userId || !storeId) return false;
  const productStoreMap = new Map<string, string>();
  for (const p of products) {
    if (p.id && p.storeId) productStoreMap.set(p.id, p.storeId);
  }
  return orders.some((o) => {
    if (o.userId !== userId || o.status !== "Entregue") return false;
    if (o.storeId === storeId) return true;
    return Array.isArray(o.items) && o.items.some((it) => productStoreMap.get(it.productId) === storeId);
  });
}

export type ReviewFilterMode = "todas" | "fotos" | "verificadas";

export interface ReviewBreakdownRow {
  stars: 5 | 4 | 3 | 2 | 1;
  count: number;
  percent: number;
}

export interface ReviewStatsSummary {
  total: number;
  average: number;
  withPhotosCount: number;
  verifiedCount: number;
  breakdown: ReviewBreakdownRow[];
}

export function computeReviewStats(
  reviews: Array<{ stars: number; photos?: string[]; verifiedPurchase?: boolean }>
): ReviewStatsSummary {
  const counts: Record<1 | 2 | 3 | 4 | 5, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  let sum = 0;
  let withPhotosCount = 0;
  let verifiedCount = 0;

  for (const r of reviews) {
    const clamped = Math.min(5, Math.max(1, Math.round(Number(r.stars || 0)))) as 1 | 2 | 3 | 4 | 5;
    counts[clamped] += 1;
    sum += clamped;
    if (Array.isArray(r.photos) && r.photos.filter(Boolean).length > 0) withPhotosCount += 1;
    if (r.verifiedPurchase) verifiedCount += 1;
  }

  const total = reviews.length;
  const average = total > 0 ? Number((sum / total).toFixed(1)) : 0;
  const breakdown: ReviewBreakdownRow[] = ([5, 4, 3, 2, 1] as const).map((stars) => ({
    stars,
    count: counts[stars],
    percent: total > 0 ? Math.round((counts[stars] / total) * 100) : 0,
  }));

  return { total, average, withPhotosCount, verifiedCount, breakdown };
}

export function filterReviews<
  T extends { photos?: string[]; verifiedPurchase?: boolean }
>(reviews: T[], filter: ReviewFilterMode): T[] {
  if (filter === "fotos") {
    return reviews.filter((r) => Array.isArray(r.photos) && r.photos.filter(Boolean).length > 0);
  }
  if (filter === "verificadas") {
    return reviews.filter((r) => Boolean(r.verifiedPurchase));
  }
  return reviews;
}

/**
 * Formata "Em actividade desde Mês/Ano" em português de Angola a partir de `criado_em`.
 */
export function formatActiveSince(isoDate?: string | null): string {
  if (!isoDate) return "";
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("pt-AO", { month: "short", year: "numeric" }).format(d);
  } catch {
    return `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  }
}

/**
 * Constrói ligação directa para o WhatsApp da loja para iniciar conversa com mensagem pré-preenchida.
 */
export function buildStoreWhatsAppChatUrl(phone?: string | null, storeName?: string): string | null {
  const digits = normalizeAngolanPhone(phone);
  if (!digits) return null;
  const cleanName = (storeName || "loja no Mercado Uíge").trim();
  const msg = `Olá ${cleanName}, vi os vossos artigos no Mercado Uíge e gostaria de falar convosco.`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(msg)}`;
}

/**
 * Indica se a loja tem direito ao selo oficial "Loja verificada" (apenas aprovada pelo admin).
 */
export function isStoreVerified(store?: Pick<Store, "isApproved" | "isSuspended"> | null): boolean {
  return Boolean(store && store.isApproved === true && !store.isSuspended);
}
