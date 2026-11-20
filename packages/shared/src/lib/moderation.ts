import { Product, ReportItem, SystemConfig, UserBlock } from "../types";
import { normalizeAngolanPhone } from "./utils";

export const DEFAULT_NEW_ACCOUNT_DAILY_LIMIT = 5;
export const DEFAULT_ESTABLISHED_ACCOUNT_DAILY_LIMIT = 30;
export const PRODUCT_AUTO_HIDE_DISTINCT_REPORTERS = 3;

export const PROHIBITED_CATEGORY_EXAMPLES: Array<{ label: string; sample: string[] }> = [
  { label: "Armas", sample: ["arma", "armas", "pistola", "munição", "explosivo"] },
  { label: "Drogas", sample: ["droga", "drogas", "cocaína", "liamba", "cannabis"] },
  { label: "Conteúdo adulto", sample: ["conteúdo adulto", "pornografia", "sexo explícito"] },
  { label: "Documentos falsos", sample: ["documento falso", "bi falso", "passaporte falso"] },
  { label: "Medicamentos com receita", sample: ["medicamento com receita", "antibiótico", "tramadol"] },
  { label: "Câmbio e dinheiro", sample: ["câmbio", "troca de divisas", "notas falsas"] },
];

export const DEFAULT_PROHIBITED_KEYWORDS: string[] = [
  "arma",
  "armas",
  "pistola",
  "revolver",
  "espingarda",
  "fuzil",
  "municao",
  "municoes",
  "granada",
  "explosivo",
  "droga",
  "drogas",
  "cocaina",
  "liamba",
  "cannabis",
  "maconha",
  "heroina",
  "metanfetamina",
  "ecstasy",
  "estupefaciente",
  "pornografia",
  "porno",
  "sexo explicito",
  "conteudo adulto",
  "prostituicao",
  "acompanhante sexual",
  "documento falso",
  "documentos falsos",
  "bi falso",
  "bilhete falso",
  "passaporte falso",
  "carta falsa",
  "diploma falso",
  "certificado falso",
  "falsificacao",
  "medicamento com receita",
  "medicamentos com receita",
  "receita medica",
  "antibiotico",
  "psicotropico",
  "morfina",
  "tramadol",
  "diazepam",
  "abortivo",
  "cambio",
  "troca de divisas",
  "kwanza por dolar",
  "vender dolares",
  "vender euros",
  "notas falsas",
  "dinheiro falso",
  "lavagem de dinheiro",
];

export function normalizeModerationText(input?: string | null): string {
  return String(input || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function parseProhibitedKeywordsList(raw: string | string[] | null | undefined): string[] {
  const items = Array.isArray(raw) ? raw : String(raw || "").split(/[\n,;]+/);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const clean = item.trim();
    if (!clean) continue;
    const norm = normalizeModerationText(clean);
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    out.push(clean);
  }
  return out;
}

export function findProhibitedKeyword(
  text: string,
  keywords?: string[] | null
): string | null {
  const normText = normalizeModerationText(text);
  if (!normText) return null;
  const list =
    Array.isArray(keywords) && keywords.length > 0
      ? keywords
      : DEFAULT_PROHIBITED_KEYWORDS;

  for (const rawWord of list) {
    const normWord = normalizeModerationText(rawWord);
    if (!normWord) continue;
    const escaped = normWord.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, "i");
    if (regex.test(normText)) {
      return rawWord.trim();
    }
  }
  return null;
}

export interface PublishValidationInput {
  name?: string | null;
  price?: number | string | null;
  whatsapp?: string | null;
  bairro?: string | null;
  image?: string | null;
  images?: string[] | null;
}

export function validateProductPublishFields(input: PublishValidationInput): {
  ok: boolean;
  error?: string;
  normalizedWhatsapp?: string;
} {
  if (!(input.name || "").trim()) {
    return { ok: false, error: "O nome do artigo é obrigatório." };
  }
  const numericPrice = Number(input.price);
  if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
    return { ok: false, error: "Indica um preço válido em Kwanzas (Kz)." };
  }
  const normalizedPhone = normalizeAngolanPhone(input.whatsapp);
  if (!normalizedPhone) {
    return { ok: false, error: "Indica um número de WhatsApp angolano válido (ex.: 923 000 000)." };
  }
  if (!(input.bairro || "").trim()) {
    return { ok: false, error: "Selecciona ou indica o bairro no Uíge para publicar." };
  }
  const hasPrimaryPhoto = Boolean((input.image || "").trim());
  const hasGalleryPhoto = Array.isArray(input.images) && input.images.some((u) => Boolean((u || "").trim()));
  if (!hasPrimaryPhoto && !hasGalleryPhoto) {
    return { ok: false, error: "É obrigatório adicionar pelo menos 1 fotografia do artigo." };
  }
  return { ok: true, normalizedWhatsapp: normalizedPhone };
}

export function getLuandaDayKey(dateOrMs: string | number | Date): string {
  const ms =
    typeof dateOrMs === "number"
      ? dateOrMs
      : dateOrMs instanceof Date
      ? dateOrMs.getTime()
      : new Date(dateOrMs).getTime();
  if (!Number.isFinite(ms)) {
    return new Date(Date.now() + 3600000).toISOString().slice(0, 10);
  }
  return new Date(ms + 3600000).toISOString().slice(0, 10);
}

export function getDailyPublishLimitForAccount(
  userCreatedAt?: string | null,
  cfg?: Pick<SystemConfig, "newAccountDailyLimit" | "establishedAccountDailyLimit"> | null,
  nowMs = Date.now()
): { limit: number; isNewAccount: boolean } {
  const newLimit = Math.max(
    1,
    Number(cfg?.newAccountDailyLimit ?? DEFAULT_NEW_ACCOUNT_DAILY_LIMIT)
  );
  const establishedLimit = Math.max(
    1,
    Number(cfg?.establishedAccountDailyLimit ?? DEFAULT_ESTABLISHED_ACCOUNT_DAILY_LIMIT)
  );
  if (!userCreatedAt) {
    return { limit: newLimit, isNewAccount: true };
  }
  const createdMs = new Date(userCreatedAt).getTime();
  if (!Number.isFinite(createdMs)) {
    return { limit: newLimit, isNewAccount: true };
  }
  const ageMs = nowMs - createdMs;
  const isNewAccount = ageMs < 24 * 60 * 60 * 1000;
  return {
    limit: isNewAccount ? newLimit : establishedLimit,
    isNewAccount,
  };
}

export function checkDailyPublishQuota(params: {
  products: Product[];
  sellerId: string;
  userCreatedAt?: string | null;
  config?: Pick<SystemConfig, "newAccountDailyLimit" | "establishedAccountDailyLimit"> | null;
  nowMs?: number;
}): {
  allowed: boolean;
  used: number;
  limit: number;
  remaining: number;
  isNewAccount: boolean;
} {
  const nowMs = params.nowMs ?? Date.now();
  const { limit, isNewAccount } = getDailyPublishLimitForAccount(
    params.userCreatedAt,
    params.config,
    nowMs
  );
  const todayKey = getLuandaDayKey(nowMs);
  const used = params.products.filter(
    (p) => p.sellerId === params.sellerId && getLuandaDayKey(p.createdAt) === todayKey
  ).length;
  return {
    allowed: used < limit,
    used,
    limit,
    remaining: Math.max(0, limit - used),
    isNewAccount,
  };
}

export function countDistinctProductReporters(reports: ReportItem[], productId: string): number {
  const reporters = new Set<string>();
  for (const r of reports) {
    if (r.productId !== productId) continue;
    if (r.status === "rejeitado") continue;
    reporters.add(r.reporterId || r.id);
  }
  return reporters.size;
}

export function countDistinctStoreReporters(reports: ReportItem[], storeId: string): number {
  const reporters = new Set<string>();
  for (const r of reports) {
    if (r.storeId !== storeId) continue;
    if (r.productId || r.reviewId) continue;
    if (r.status === "rejeitado") continue;
    reporters.add(r.reporterId || r.id);
  }
  return reporters.size;
}

export function buildBlockedSellerSet(blocks: UserBlock[], blockerId?: string | null): Set<string> {
  const set = new Set<string>();
  if (!blockerId) return set;
  for (const b of blocks) {
    if (b.blockerId === blockerId && b.blockedId) {
      set.add(b.blockedId);
    }
  }
  return set;
}
