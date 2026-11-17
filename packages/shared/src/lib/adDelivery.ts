import { AdAdvertiserType, AdDestinationType, SponsoredAd, Store, SystemConfig } from "../types";
import { normalizeAngolanPhone } from "./utils";

export const FULLSCREEN_AD_INITIAL_DELAY_MS = 30_000; // 30 segundos de uso activo
export const FULLSCREEN_AD_COOLDOWN_MS = 240_000; // Máximo 1 anúncio a cada 4 minutos
export const FULLSCREEN_AD_DURATION_SEC = 10; // Mostra até 10 segundos
export const FULLSCREEN_AD_CLOSE_DELAY_SEC = 5; // Botão de fechar visível após 5 segundos

export const BANNER_DURATION_PRESETS = [5, 8, 10, 15, 20] as const;
export const MIN_BANNER_DURATION_SEC = 3;
export const MAX_BANNER_DURATION_SEC = 60;
export const DEFAULT_BANNER_DURATION_SEC = 8;
export const CONFIG_REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutos
export const LUANDA_UTC_OFFSET_MINUTES = 60; // Africa/Luanda (UTC+1, sem horário de verão)

const UNSAFE_URL_SCHEME_REGEX = /^(javascript|data|vbscript|file|blob):/i;

function pad2(n: number): string {
  return String(Math.trunc(n)).padStart(2, "0");
}

/**
 * Devolve a hora actual em Africa/Luanda (UTC+1) no formato `YYYY-MM-DDTHH:mm` para `<input type="datetime-local">`.
 */
export function getNowLuandaInput(nowMs = Date.now()): string {
  const luanda = new Date(nowMs + LUANDA_UTC_OFFSET_MINUTES * 60_000);
  return `${luanda.getUTCFullYear()}-${pad2(luanda.getUTCMonth() + 1)}-${pad2(luanda.getUTCDate())}T${pad2(luanda.getUTCHours())}:${pad2(luanda.getUTCMinutes())}`;
}

/**
 * Converte data/hora escolhida em Africa/Luanda (UTC+1, ex. `2026-11-17T14:30`) para ISO UTC (`...Z`).
 */
export function luandaInputToUtcIso(luandaInput?: string | null): string | null {
  const raw = (luandaInput || "").trim();
  if (!raw) return null;
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!match) {
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = match[4] !== undefined ? Number(match[4]) : 0;
  const minute = match[5] !== undefined ? Number(match[5]) : 0;
  const second = match[6] !== undefined ? Number(match[6]) : 0;
  const utcMs =
    Date.UTC(year, month - 1, day, hour, minute, second, 0) -
    LUANDA_UTC_OFFSET_MINUTES * 60_000;
  return new Date(utcMs).toISOString();
}

/**
 * Converte timestamp UTC da base de dados para string `YYYY-MM-DDTHH:mm` em Africa/Luanda (UTC+1).
 */
export function utcIsoToLuandaInput(utcIso?: string | null): string {
  if (!utcIso) return "";
  const ms = new Date(utcIso).getTime();
  if (!Number.isFinite(ms)) return "";
  const luanda = new Date(ms + LUANDA_UTC_OFFSET_MINUTES * 60_000);
  return `${luanda.getUTCFullYear()}-${pad2(luanda.getUTCMonth() + 1)}-${pad2(luanda.getUTCDate())}T${pad2(luanda.getUTCHours())}:${pad2(luanda.getUTCMinutes())}`;
}

/**
 * Formata um timestamp UTC como `dd/mm hh:mm` no fuso horário Africa/Luanda (UTC+1).
 */
export function formatLuandaDateTimeShort(utcIso?: string | null): string {
  if (!utcIso) return "Sem data";
  const ms = new Date(utcIso).getTime();
  if (!Number.isFinite(ms)) return "Sem data";
  const luanda = new Date(ms + LUANDA_UTC_OFFSET_MINUTES * 60_000);
  return `${pad2(luanda.getUTCDate())}/${pad2(luanda.getUTCMonth() + 1)} ${pad2(luanda.getUTCHours())}:${pad2(luanda.getUTCMinutes())}`;
}

/**
 * Formata data/hora completa em Africa/Luanda (UTC+1).
 */
export function formatLuandaDateTimeFull(utcIso?: string | null): string {
  if (!utcIso) return "Sem data definida";
  const ms = new Date(utcIso).getTime();
  if (!Number.isFinite(ms)) return "Sem data definida";
  const luanda = new Date(ms + LUANDA_UTC_OFFSET_MINUTES * 60_000);
  return `${pad2(luanda.getUTCDate())}/${pad2(luanda.getUTCMonth() + 1)}/${luanda.getUTCFullYear()} ${pad2(luanda.getUTCHours())}:${pad2(luanda.getUTCMinutes())} (Luanda)`;
}

/**
 * Verifica se a janela de agendamento do anúncio está activa no instante `nowMs` (ou se não tem datas definidas).
 */
export function isAdWithinScheduleWindow(
  ad: Pick<SponsoredAd, "startDate" | "endDate">,
  nowMs = Date.now()
): boolean {
  if (ad.startDate) {
    const startMs = new Date(ad.startDate).getTime();
    if (Number.isFinite(startMs) && startMs > nowMs) {
      return false;
    }
  }
  if (ad.endDate) {
    const endMs = new Date(ad.endDate).getTime();
    if (Number.isFinite(endMs) && endMs < nowMs) {
      return false;
    }
  }
  return true;
}

export type AdLifecycleKey =
  | "rascunho"
  | "pendente"
  | "agendado"
  | "activo"
  | "suspenso"
  | "expirado"
  | "rejeitado";

export interface AdLifecycleState {
  key: AdLifecycleKey;
  label: string;
  reason: string;
  isLive: boolean;
}

/**
 * Calcula o estado visível e o motivo claro para o painel admin e diagnósticos de publicação:
 * Rascunho | Pendente | Agendado para dd/mm hh:mm | Activo | Suspenso | Expirado | Rejeitado.
 */
export function resolveAdLifecycleState(
  ad: SponsoredAd,
  stores: Store[] = [],
  nowMs = Date.now()
): AdLifecycleState {
  const customReason = (ad.statusReason || "").trim();

  if (ad.isSuspended || ad.status === "suspenso") {
    return {
      key: "suspenso",
      label: "Suspenso",
      reason: customReason || "Suspenso pela moderação.",
      isLive: false,
    };
  }

  if (ad.status === "rejeitado") {
    return {
      key: "rejeitado",
      label: "Rejeitado",
      reason: customReason || "Rejeitado pela moderação.",
      isLive: false,
    };
  }

  if (ad.status === "rascunho") {
    return {
      key: "rascunho",
      label: "Rascunho",
      reason: customReason || "Guardado como rascunho; ainda não foi publicado.",
      isLive: false,
    };
  }

  if (ad.status === "pendente") {
    return {
      key: "pendente",
      label: "Pendente",
      reason: customReason || "Aguarda aprovação da administração.",
      isLive: false,
    };
  }

  const endMs = ad.endDate ? new Date(ad.endDate).getTime() : NaN;
  const startMs = ad.startDate ? new Date(ad.startDate).getTime() : NaN;

  if (ad.status === "expirado" || (Boolean(ad.endDate) && Number.isFinite(endMs) && endMs < nowMs)) {
    return {
      key: "expirado",
      label: "Expirado",
      reason:
        customReason ||
        (ad.endDate && Number.isFinite(endMs)
          ? `Período terminado em ${formatLuandaDateTimeShort(ad.endDate)} (Luanda).`
          : "Campanha expirada."),
      isLive: false,
    };
  }

  if (!ad.active) {
    return {
      key: "rascunho",
      label: "Rascunho",
      reason: customReason || "Desactivado manualmente pelo administrador.",
      isLive: false,
    };
  }

  if (Boolean(ad.startDate) && Number.isFinite(startMs) && startMs > nowMs) {
    const startFmt = formatLuandaDateTimeShort(ad.startDate);
    return {
      key: "agendado",
      label: `Agendado para ${startFmt}`,
      reason: customReason || `Entra no ar automaticamente em ${startFmt} (Africa/Luanda).`,
      isLive: false,
    };
  }

  if (resolveAdAdvertiserType(ad) === "loja" && !isAdEligibleForPaidStore(ad, stores, nowMs)) {
    return {
      key: "suspenso",
      label: "Suspenso",
      reason: customReason || "Loja sem plano pago activo ou não aprovada.",
      isLive: false,
    };
  }

  return {
    key: "activo",
    label: "Activo",
    reason:
      customReason ||
      (ad.endDate && Number.isFinite(endMs)
        ? `No ar até ${formatLuandaDateTimeShort(ad.endDate)} (Luanda).`
        : "No ar continuamente (sem data de fim)."),
    isLive: true,
  };
}

export function resolveAdAdvertiserType(ad: Partial<SponsoredAd>): AdAdvertiserType {
  if (ad.advertiserType === "plataforma" || ad.advertiserType === "externo" || ad.advertiserType === "loja") {
    return ad.advertiserType;
  }
  return ad.storeId ? "loja" : "plataforma";
}

export function clampBannerDurationSec(
  value?: number | null,
  fallback = DEFAULT_BANNER_DURATION_SEC
): number {
  const safeFallback =
    typeof fallback === "number" && Number.isFinite(fallback)
      ? Math.min(MAX_BANNER_DURATION_SEC, Math.max(MIN_BANNER_DURATION_SEC, Math.round(fallback)))
      : DEFAULT_BANNER_DURATION_SEC;

  if (value === undefined || value === null || !Number.isFinite(Number(value)) || Number(value) <= 0) {
    return safeFallback;
  }
  return Math.min(MAX_BANNER_DURATION_SEC, Math.max(MIN_BANNER_DURATION_SEC, Math.round(Number(value))));
}

export function resolveEffectiveBannerDurationSec(
  ad?: Partial<SponsoredAd> | null,
  config?: Pick<SystemConfig, "bannerDefaultDurationSec"> | null
): number {
  const globalDefault = clampBannerDurationSec(config?.bannerDefaultDurationSec, DEFAULT_BANNER_DURATION_SEC);
  if (ad?.durationSec !== undefined && ad?.durationSec !== null && Number(ad.durationSec) > 0) {
    return clampBannerDurationSec(ad.durationSec, globalDefault);
  }
  return globalDefault;
}

export function isBannerPaid(ad: Partial<SponsoredAd>): boolean {
  if (typeof ad.isPaid === "boolean") return ad.isPaid;
  const advType = resolveAdAdvertiserType(ad);
  if (advType === "loja") return true;
  if (advType === "externo") return true;
  return ad.bannerCategory === "patrocinado";
}

export function sortBannersForCarousel(ads: SponsoredAd[]): SponsoredAd[] {
  return [...ads].sort((a, b) => {
    const prioDiff = Number(b.priority ?? 0) - Number(a.priority ?? 0);
    if (prioDiff !== 0) return prioDiff;
    const orderDiff = Number(a.order ?? 0) - Number(b.order ?? 0);
    if (orderDiff !== 0) return orderDiff;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

export function computeAdCtrPercent(ad: Pick<SponsoredAd, "views" | "clicks">): number {
  const views = Number(ad.views || 0);
  const clicks = Number(ad.clicks || 0);
  if (views <= 0) return 0;
  return Math.round((clicks / views) * 1000) / 10;
}

export interface BannerDashboardStats {
  total: number;
  activos: number;
  agendados: number;
  rascunhos: number;
  pendentes: number;
  expirados: number;
  suspensos: number;
  pagos: number;
  gratuitos: number;
  totalViews: number;
  totalClicks: number;
  ctrPercent: number;
}

export function computeBannerDashboardStats(ads: SponsoredAd[], nowMs = Date.now(), stores: Store[] = []): BannerDashboardStats {
  let activos = 0;
  let agendados = 0;
  let rascunhos = 0;
  let pendentes = 0;
  let expirados = 0;
  let suspensos = 0;
  let pagos = 0;
  let gratuitos = 0;
  let totalViews = 0;
  let totalClicks = 0;

  for (const ad of ads) {
    const lifecycle = resolveAdLifecycleState(ad, stores, nowMs);

    if (lifecycle.key === "suspenso" || lifecycle.key === "rejeitado") {
      suspensos += 1;
    } else if (lifecycle.key === "expirado") {
      expirados += 1;
    } else if (lifecycle.key === "pendente") {
      pendentes += 1;
    } else if (lifecycle.key === "rascunho") {
      rascunhos += 1;
    } else if (lifecycle.key === "agendado") {
      agendados += 1;
    } else if (lifecycle.key === "activo") {
      activos += 1;
    }

    if (isBannerPaid(ad)) {
      pagos += 1;
    } else {
      gratuitos += 1;
    }

    totalViews += Number(ad.views || 0);
    totalClicks += Number(ad.clicks || 0);
  }

  return {
    total: ads.length,
    activos,
    agendados,
    rascunhos,
    pendentes,
    expirados,
    suspensos,
    pagos,
    gratuitos,
    totalViews,
    totalClicks,
    ctrPercent: totalViews > 0 ? Math.round((totalClicks / totalViews) * 1000) / 10 : 0,
  };
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
 * - Rejeita suspensos ou rejeitados
 * - "plataforma" e "externo": elegíveis sem precisar de loja nem plano pago
 * - "loja": exige loja aprovada, não suspensa e com plano pago activo
 * - Destinos "link"/"whatsapp" têm de passar na validação segura (só https://)
 */
export function isAdEligibleForPublicDisplay(
  ad: SponsoredAd,
  stores: Store[] = [],
  nowMs = Date.now()
): boolean {
  if (ad.isSuspended || ad.status !== "aprovado" || !ad.active) {
    return false;
  }

  if (!isAdWithinScheduleWindow(ad, nowMs)) {
    return false;
  }

  if (ad.destinationType === "link" || ad.destinationType === "whatsapp") {
    const check = validateSafeAdDestination(ad.destinationType, ad.destinationValue || ad.linkUrl, {
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
