import { AdAdvertiserType, AdDestinationType, SponsoredAd, Store } from "../types";
import { normalizeAngolanPhone } from "./utils";

export const FULLSCREEN_AD_INITIAL_DELAY_MS = 30_000; // 30 segundos de uso activo
export const FULLSCREEN_AD_COOLDOWN_MS = 240_000; // Máximo 1 anúncio a cada 4 minutos
export const FULLSCREEN_AD_DURATION_SEC = 10; // Mostra até 10 segundos
export const FULLSCREEN_AD_CLOSE_DELAY_SEC = 5; // Botão de fechar visível após 5 segundos

const UNSAFE_URL_SCHEME_REGEX = /^(javascript|data|vbscript|file|blob):/i;

export function resolveAdAdvertiserType(ad: Partial<SponsoredAd>): AdAdvertiserType {
  if (ad.advertiserType === "plataforma" || ad.advertiserType === "externo" || ad.advertiserType === "loja") {
    return ad.advertiserType;
  }
  return ad.storeId ? "loja" : "plataforma";
}

/**
 * Valida e normaliza o destino de um anúncio:
 * - "link": aceita ESTRITAMENTE URLs https:// (rejeita javascript:, data:, http:, vbscript:, etc.)
 * - "whatsapp": normaliza telefone para https://wa.me/<digitos> (rejeita esquemas perigosos)
 * - "loja" / "produto": exige identificador de loja ou artigo
 */
export function validateSafeAdDestination(
  destinationType: AdDestinationType = "loja",
  rawValue?: string | null,
  opts?: { storeId?: string; productId?: string }
): { ok: boolean; normalizedValue?: string; error?: string } {
  const val = (rawValue || "").trim();

  if (destinationType === "link") {
    if (!val) {
      return { ok: false, error: "Indica o link externo do anúncio (começado por https://)." };
    }
    if (UNSAFE_URL_SCHEME_REGEX.test(val) || !val.toLowerCase().startsWith("https://")) {
      return {
        ok: false,
        error: "Destino inválido: apenas links seguros com https:// são permitidos.",
      };
    }
    try {
      const parsed = new URL(val);
      if (parsed.protocol !== "https:" || !parsed.hostname) {
        return {
          ok: false,
          error: "Destino inválido: apenas links seguros com https:// são permitidos.",
        };
      }
      return { ok: true, normalizedValue: parsed.toString() };
    } catch {
      return {
        ok: false,
        error: "Link externo inválido. Usa um endereço completo como https://exemplo.ao.",
      };
    }
  }

  if (destinationType === "whatsapp") {
    if (!val) {
      return { ok: false, error: "Indica o número de WhatsApp para contacto (ex: 923000000)." };
    }
    if (UNSAFE_URL_SCHEME_REGEX.test(val)) {
      return { ok: false, error: "Número de WhatsApp inválido." };
    }
    const strippedWa = val.replace(/^https?:\/\/(wa\.me|api\.whatsapp\.com\/send\?phone=)/i, "");
    const angolanDigits = normalizeAngolanPhone(strippedWa);
    const rawDigits = strippedWa.replace(/\D/g, "");
    const digits = angolanDigits || (rawDigits.length >= 9 && rawDigits.length <= 15 ? rawDigits : null);
    if (!digits) {
      return {
        ok: false,
        error: "Número de WhatsApp inválido. Indica 9 dígitos de Angola (ex: 923000000).",
      };
    }
    return { ok: true, normalizedValue: `https://wa.me/${digits}` };
  }

  if (destinationType === "produto") {
    const prodId = (opts?.productId || val).trim();
    if (!prodId) {
      return { ok: false, error: "Seleciona o artigo de destino do anúncio." };
    }
    return { ok: true, normalizedValue: prodId };
  }

  const stId = (opts?.storeId || val).trim();
  if (!stId) {
    return { ok: false, error: "Seleciona a loja de destino do anúncio." };
  }
  return { ok: true, normalizedValue: stId };
}

/**
 * Garante que apenas lojas aprovadas, activas e com plano pago válido (Básico ou VIP não expirado)
 * podem ter anúncios patrocinados de tipo loja em exibição ou criação.
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
 * Verifica se um anúncio pode ser exibido na app:
 * - "plataforma" e "externo": elegíveis sem precisar de loja nem plano pago
 * - "loja": exige loja aprovada, não suspensa e com plano pago activo
 * - Destinos "link"/"whatsapp" têm de passar na validação segura (só https://)
 */
export function isAdEligibleForPublicDisplay(
  ad: SponsoredAd,
  stores: Store[] = [],
  nowMs = Date.now()
): boolean {
  if (ad.destinationType === "link" || ad.destinationType === "whatsapp") {
    const check = validateSafeAdDestination(ad.destinationType, ad.destinationValue, {
      storeId: ad.storeId,
      productId: ad.productId,
    });
    if (!check.ok) return false;
  }

  const advType = resolveAdAdvertiserType(ad);
  if (advType === "plataforma") {
    return true;
  }
  if (advType === "externo") {
    return Boolean((ad.advertiserName || "").trim());
  }
  return isAdEligibleForPaidStore(ad, stores, nowMs);
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
