import { SponsoredAd, Store } from "../types";

export const FULLSCREEN_AD_INITIAL_DELAY_MS = 30_000; // 30 segundos de uso activo
export const FULLSCREEN_AD_COOLDOWN_MS = 240_000; // Máximo 1 anúncio a cada 4 minutos
export const FULLSCREEN_AD_DURATION_SEC = 10; // Mostra até 10 segundos
export const FULLSCREEN_AD_CLOSE_DELAY_SEC = 5; // Botão de fechar visível após 5 segundos

/**
 * Garante que apenas lojas aprovadas, activas e com plano pago válido (Básico ou VIP não expirado)
 * podem ter anúncios patrocinados em exibição ou criação.
 */
export function storeHasActivePaidPlan(store?: Store | null, nowMs = Date.now()): boolean {
  if (!store) return false;
  if (store.isApproved === false || store.isSuspended) return false;
  if (store.planType !== "basico" && store.planType !== "vip") return false;
  if (store.planExpiresAt) {
    const expMs = new Date(store.planExpiresAt).getTime();
    if (!Number.isFinite(expMs) || expMs <= nowMs) return false;
  }
  return true;
}

/**
 * Verifica se um anúncio patrocinado pertence a uma loja elegível com plano pago activo.
 */
export function isAdEligibleForPaidStore(
  ad: SponsoredAd,
  stores: Store[] = [],
  nowMs = Date.now()
): boolean {
  if (!ad.storeId) return false;
  const matched = stores.find((s) => s.id === ad.storeId);
  if (matched) {
    return storeHasActivePaidPlan(matched, nowMs);
  }
  if (ad.storePlanType) {
    if (ad.storeIsApproved === false || ad.storeIsSuspended) return false;
    if (ad.storePlanType !== "basico" && ad.storePlanType !== "vip") return false;
    if (ad.storePlanExpiresAt) {
      const expMs = new Date(ad.storePlanExpiresAt).getTime();
      if (!Number.isFinite(expMs) || expMs <= nowMs) return false;
    }
    return true;
  }
  return false;
}

/**
 * Detecta se o dispositivo está em ligação de dados móveis ou modo de poupança de dados
 * para evitar reprodução automática de vídeo fora de Wi-Fi.
 */
export function isCellularConnection(nav?: any): boolean {
  const targetNav = nav ?? (typeof navigator !== "undefined" ? navigator : undefined);
  if (!targetNav) return false;
  const conn = targetNav.connection || targetNav.mozConnection || targetNav.webkitConnection;
  if (!conn) return false;
  if (conn.saveData === true) return true;
  const type = String(conn.type || "").toLowerCase();
  if (type === "cellular") return true;
  return false;
}

/**
 * Determina se o anúncio patrocinado de ecrã inteiro pode ser exibido neste momento:
 * - Nunca nos primeiros 30 s de uso activo
 * - Máximo 1 a cada 4 minutos
 * - Nunca no checkout/carrinho, no registo/login, com outros modais abertos ou enquanto o cliente escreve
 */
export function canShowFullscreenAd(params: {
  activeUsageMs: number;
  nowMs: number;
  lastShownAtMs: number | null;
  currentView: string;
  isModalOpen: boolean;
  isTyping: boolean;
  hasEligibleAd: boolean;
}): boolean {
  if (!params.hasEligibleAd) return false;
  if (params.activeUsageMs < FULLSCREEN_AD_INITIAL_DELAY_MS) return false;
  if (params.lastShownAtMs !== null && params.nowMs - params.lastShownAtMs < FULLSCREEN_AD_COOLDOWN_MS) {
    return false;
  }
  if (params.currentView === "cart" || params.currentView === "checkout") return false;
  if (params.isModalOpen) return false;
  if (params.isTyping) return false;
  return true;
}

/**
 * Verifica se o foco actual está num campo de texto / edição para não interromper o utilizador a escrever.
 */
export function isEditableElementFocused(doc?: Document | null): boolean {
  const targetDoc = doc ?? (typeof document !== "undefined" ? document : null);
  if (!targetDoc) return false;
  const active = targetDoc.activeElement as HTMLElement | null;
  if (!active) return false;
  const tag = active.tagName?.toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (active.isContentEditable) return true;
  return false;
}
