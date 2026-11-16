import { Order, PlanType, StoreType, SystemConfig } from "../types";

export const fmtKz = (n: number | string | undefined | null) => {
  const raw = typeof n === "number" ? n : Number(String(n ?? 0).replace(/[^\d.-]/g, ""));
  const val = Number.isFinite(raw) ? Math.max(0, raw) : 0;
  return `${val.toLocaleString("pt-AO", { maximumFractionDigits: 0 })} Kz`;
};

export function formatUserRole(role?: string | null): string {
  switch ((role || "").toLowerCase()) {
    case "admin":
      return "Administrador";
    case "comerciante":
      return "Comerciante";
    case "entregador":
      return "Entregador";
    default:
      return "Cliente";
  }
}

export function formatStoreType(type?: StoreType | string | null): string {
  return type === "vendedor_ambulante" ? "Vendedor ambulante" : "Loja fixa";
}

export function formatPlanType(plan?: PlanType | string | null): string {
  switch ((plan || "").toLowerCase()) {
    case "vip":
      return "Destaque / VIP";
    case "basico":
      return "Básico";
    default:
      return "Grátis";
  }
}

export function fmtDate(value?: string | Date | null): string {
  if (!value) return "Hoje";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "Hoje";
  return d.toLocaleDateString("pt-AO");
}

export function fmtDateTime(value?: string | Date | null): string {
  if (!value) return "Agora";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "Agora";
  return d.toLocaleString("pt-AO");
}

/**
 * Converte qualquer erro técnico (rede, Supabase Auth, Postgres/RLS) numa mensagem curta em pt-AO.
 */
export function translateErrorMessage(
  err: unknown,
  fallback = "Ocorreu um problema. Tenta novamente."
): string {
  const raw =
    typeof err === "string"
      ? err
      : err && typeof err === "object" && "message" in err
      ? String((err as { message?: unknown }).message || "")
      : "";
  const msg = raw.toLowerCase().trim();

  if (!msg) return fallback;

  if (
    msg.includes("failed to fetch") ||
    msg.includes("network") ||
    msg.includes("fetcherror") ||
    msg.includes("load failed") ||
    msg.includes("offline") ||
    msg.includes("timeout") ||
    msg.includes("internet")
  ) {
    return "Sem ligação. Verifica a internet e tenta novamente.";
  }

  if (msg.includes("rate limit") || msg.includes("too many requests") || msg.includes("security purposes")) {
    return "Muitos pedidos seguidos. Aguarda 60 segundos.";
  }

  if (msg.includes("expired") || msg.includes("expirado")) {
    return "O código expirou. Pede um novo código.";
  }

  if (msg.includes("secret api key") || msg.includes("invalid api key")) {
    return "Configuração inválida do servidor: chave secreta não permitida na app.";
  }

  if (msg.includes("error sending") || msg.includes("smtp")) {
    return "Não foi possível enviar o e-mail. Verifica as definições de SMTP no Supabase.";
  }

  if (msg.includes("signups not allowed") || msg.includes("otp_disabled")) {
    return "Registo temporariamente indisponível. Tenta novamente mais tarde.";
  }

  if (
    msg.includes("invalid") ||
    msg.includes("otp") ||
    msg.includes("token") ||
    msg.includes("credentials")
  ) {
    return "Código inválido ou incorreto. Verifica e tenta novamente.";
  }

  if (msg.includes("email") && (msg.includes("format") || msg.includes("unable to validate"))) {
    return "E-mail inválido. Verifica o endereço.";
  }

  if (
    msg.includes("row-level security") ||
    msg.includes("permission") ||
    msg.includes("not authorized") ||
    msg.includes("não autorizada") ||
    msg.includes("unauthorized") ||
    msg.includes("jwt")
  ) {
    return "Sem permissão para esta acção. Inicia sessão novamente.";
  }

  if (msg.includes("stock insuficiente")) {
    return "Stock insuficiente para este artigo.";
  }

  if (msg.includes("apenas para residentes") || msg.includes("província do uíge")) {
    return "O registo é exclusivo para residentes da província do Uíge.";
  }

  if (msg.includes("loja fixa exige")) {
    return "Loja fixa exige morada, bairro e fotografia da fachada.";
  }

  if (msg.includes("vendedor ambulante exige")) {
    return "Vendedor ambulante exige fotografia do BI e telefone.";
  }

  if (msg.includes("duplicate") || msg.includes("already exists") || msg.includes("unique")) {
    return "Este registo já foi enviado.";
  }

  if (msg.includes("não encontrado") || msg.includes("not found")) {
    return "Registo não encontrado.";
  }

  if (msg.includes("não autenticado")) {
    return "Inicia sessão para continuar.";
  }

  return fallback;
}

/**
 * Normaliza texto: minúsculas, sem acentos, sem pontuação e sem espaços a mais.
 */
export const normalize = (s: string) =>
  (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function phoneticToken(token: string): string {
  if (token.length < 4) return token;
  return token.replace(/ph/g, "f");
}

export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return dp[m][n];
}

/**
 * Calcula pontuação entre um token de pesquisa e um campo de texto normalizado.
 * Tolerância a gralhas APENAS em palavras com >= 4 letras e no máximo 1 letra de diferença.
 */
function scoreTokenInField(qToken: string, fieldText: string): number {
  if (!qToken || !fieldText) return 0;
  const fTokens = fieldText.split(" ").filter(Boolean);
  if (fTokens.length === 0) return 0;

  let best = 0;
  const qPhonetic = phoneticToken(qToken);

  for (const ft of fTokens) {
    if (ft === qToken) {
      return 1.0;
    }

    // Equivalência fonética directa (ex: "ifone" <-> "iphone")
    if (qToken.length >= 4 && ft.length >= 4 && phoneticToken(ft) === qPhonetic) {
      best = Math.max(best, 0.94);
      continue;
    }

    // Prefixo forte em palavras de 3+ caracteres (ex: "iphon" -> "iphone")
    if (qToken.length >= 4 && ft.startsWith(qToken)) {
      best = Math.max(best, 0.88);
      continue;
    }

    // Erro de escrita: APENAS palavras com >= 4 letras e no máximo 1 letra de diferença
    if (qToken.length >= 4 && ft.length >= 4 && Math.abs(qToken.length - ft.length) <= 1) {
      const dist = levenshtein(qToken, ft);
      if (dist <= 1) {
        // Evita falsos positivos como "ifone" -> "fone" (iniciais diferentes quando palavra curta)
        const sameStart = qToken[0] === ft[0];
        if (sameStart || (qToken.length >= 5 && ft.length >= 5)) {
          best = Math.max(best, 0.82);
        }
      }
    }
  }

  return best;
}

const MIN_RELEVANCE_SCORE = 24;

export interface SearchPersonalization {
  recentQueries?: string[];
  clickedProductIds?: string[];
  preferredCategories?: string[];
  preferredBrands?: string[];
}

export function smartSearch<
  T extends {
    id?: string;
    name: string;
    description?: string | null;
    brand?: string | null;
    categoryName?: string | null;
    condition?: string | null;
    storeType?: string | null;
    municipality?: string | null;
    province?: string | null;
    price?: any;
    stock?: any;
    rating?: any;
    sales?: any;
  }
>(
  items: T[],
  query: string,
  opts?: {
    sort?: string;
    maxPrice?: number;
    location?: string;
    category?: string;
    condition?: "todas" | "novo" | "usado";
    storeType?: "todos" | StoreType;
    onlyAvailable?: boolean;
    personalization?: SearchPersonalization;
  }
) {
  const q = (query || "").trim();
  let list = [...items];

  const normQ = normalize(q);

  if (opts?.category && opts.category !== "todas") {
    list = list.filter((i) => normalize(i.categoryName || "") === normalize(opts.category!));
  }
  if (opts?.location && opts.location !== "todas") {
    list = list.filter(
      (i) =>
        normalize(i.municipality || "").includes(normalize(opts.location!)) ||
        normalize(i.province || "").includes(normalize(opts.location!))
    );
  }
  if (opts?.condition && opts.condition !== "todas") {
    list = list.filter((i) => (i.condition || "novo") === opts.condition);
  }
  if (opts?.storeType && opts.storeType !== "todos") {
    list = list.filter((i) => (i.storeType || "loja_fixa") === opts.storeType);
  }
  if (opts?.maxPrice && opts.maxPrice > 0) {
    list = list.filter((i) => Number(i.price) <= opts.maxPrice!);
  }
  if (opts?.onlyAvailable) {
    list = list.filter((i) => Number(i.stock) > 0);
  }

  if (!normQ) {
    if (opts?.sort === "preco-asc") list.sort((a, b) => Number(a.price) - Number(b.price));
    else if (opts?.sort === "preco-desc") list.sort((a, b) => Number(b.price) - Number(a.price));
    else if (opts?.sort === "vendas") list.sort((a, b) => Number(b.sales || 0) - Number(a.sales || 0));
    else if (opts?.sort === "avaliacao") list.sort((a, b) => Number(b.rating || 0) - Number(a.rating || 0));
    return list.map((i) => ({ item: i, score: 0 }));
  }

  const qTokens = normQ.split(" ").filter(Boolean);
  if (qTokens.length === 0) return [];

  // Palavras principais (letras com >= 3 chars) que definem o assunto da pesquisa
  const primaryTokens = qTokens.filter((t) => /[a-z]/.test(t) && t.length >= 3);
  const requiredPrimary = primaryTokens.length > 0 ? primaryTokens : qTokens;

  // Pesos rigorosos: nome > marca > categoria > descrição
  const WEIGHTS = {
    name: 100,
    brand: 70,
    category: 45,
    description: 25,
  };

  const clickedSet = new Set(opts?.personalization?.clickedProductIds || []);
  const prefCats = new Set((opts?.personalization?.preferredCategories || []).map(normalize));
  const prefBrands = new Set((opts?.personalization?.preferredBrands || []).map(normalize));

  const scored: { item: T; score: number; personalBoost: number }[] = [];

  for (const item of list) {
    const fName = normalize(item.name || "");
    const fBrand = normalize(item.brand || "");
    const fCat = normalize(item.categoryName || "");
    const fDesc = normalize(item.description || "");

    let totalTokenScore = 0;
    let matchedPrimaryCount = 0;
    let matchedTokenCount = 0;

    for (const qt of qTokens) {
      const sName = scoreTokenInField(qt, fName) * WEIGHTS.name;
      const sBrand = scoreTokenInField(qt, fBrand) * WEIGHTS.brand;
      const sCat = scoreTokenInField(qt, fCat) * WEIGHTS.category;
      const sDesc = scoreTokenInField(qt, fDesc) * WEIGHTS.description;

      const tokenBest = Math.max(sName, sBrand, sCat, sDesc);
      if (tokenBest > 0) {
        matchedTokenCount++;
        if (requiredPrimary.includes(qt)) {
          matchedPrimaryCount++;
        }
      }
      totalTokenScore += tokenBest;
    }

    // Sem correspondência com nenhuma palavra principal -> irrelevante
    if (matchedPrimaryCount === 0) continue;

    // Se houver múltiplas palavras principais (ex: "samsung carregador"), garante cobertura mínima relevante
    const avgScore = totalTokenScore / qTokens.length;
    const exactPhraseInName = fName.includes(normQ) ? 15 : 0;
    const finalScore = avgScore + exactPhraseInName;

    if (finalScore < MIN_RELEVANCE_SCORE || matchedTokenCount === 0) {
      continue;
    }

    // Personalização local usada APENAS para desempatar/ordenar itens que JÁ passaram a relevância mínima
    let personalBoost = 0;
    if (item.id && clickedSet.has(item.id)) personalBoost += 4;
    if (item.categoryName && prefCats.has(normalize(item.categoryName))) personalBoost += 2;
    if (item.brand && prefBrands.has(normalize(item.brand))) personalBoost += 1.5;

    scored.push({ item, score: finalScore, personalBoost });
  }

  scored.sort((a, b) => {
    if (opts?.sort === "preco-asc") return Number(a.item.price) - Number(b.item.price);
    if (opts?.sort === "preco-desc") return Number(b.item.price) - Number(a.item.price);
    if (opts?.sort === "vendas") return Number(b.item.sales || 0) - Number(a.item.sales || 0);
    return b.score + b.personalBoost - (a.score + a.personalBoost);
  });

  return scored.map(({ item, score }) => ({ item, score }));
}

// Lista fechada exclusiva de Municípios e Bairros da Província do Uíge
export const UIGE_MUNICIPALITY_BAIRROS: Record<string, string[]> = {
  "Uíge": [
    "Centro da Cidade",
    "Candombe Velho",
    "Candombe Novo",
    "Papá Simão",
    "Bairro Popular",
    "Mabanza Sosso",
    "Catapa",
    "Kilandukilo",
    "Mbemba Ngango",
    "Dunga",
    "Quituma",
    "Kixicongo",
  ],
  "Negage": ["Centro do Negage", "Bairro Militar", "Kapopa", "Cangundo", "Dimuca", "Quisseque"],
  "Maquela do Zombo": ["Sede Maquela", "Bairro Comercial", "Quibocolo", "Bé", "Cuilo Futa"],
  "Damba": ["Sede Damba", "Bairro Nzamba", "Camatambo", "Lêmboa", "Petecusso"],
  "Sanza Pombo": ["Sede Sanza Pombo", "Uamba", "Cuilo Pombo", "Alfândega"],
  "Quimbele": ["Sede Quimbele", "Cuango", "Icoca", "Alto Zaza"],
  "Songo": ["Sede Songo", "Quivuenga", "Kinvuenga"],
  "Quitexe": ["Sede Quitexe", "Aldeia Viçosa", "Cambamba", "Vista Alegre"],
  "Bembe": ["Sede Bembe", "Lucunga", "Mabaia"],
  "Ambuíla": ["Sede Ambuíla", "Quipedro", "Nova Ambuíla"],
  "Mucaba": ["Sede Mucaba", "Uando Mucaba"],
  "Bungo": ["Sede Bungo", "Bairro Kangola"],
  "Buengas": ["Sede Buengas", "Nova Esperança", "Cuilo Camboso"],
  "Puri": ["Sede Puri", "Bairro Kizenga"],
  "Milunga": ["Sede Milunga", "Macocola", "Massau"],
  "Alto Cauale": ["Sede Cangola", "Bengo", "Caiango"],
};

export const UIGE_MUNICIPALITIES = Object.keys(UIGE_MUNICIPALITY_BAIRROS);

export function getBairrosByMunicipality(municipality: string): string[] {
  return UIGE_MUNICIPALITY_BAIRROS[municipality] || UIGE_MUNICIPALITY_BAIRROS["Uíge"];
}

export const ORDER_STATUSES = [
  "Pendente",
  "Confirmada",
  "Em preparação",
  "Pronta para levantamento",
  "Em entrega",
  "Entregue",
  "Cancelada",
] as const;

export const DELIVERY_STATUSES = [
  "Pedido",
  "Aceite pelo entregador",
  "Recolhido",
  "A caminho",
  "Entregue",
  "Com problema",
] as const;

export function generateOrderCode() {
  const letters = "UG";
  const num = Math.floor(10000 + Math.random() * 90000);
  return `MU-${letters}-${num}`;
}

export function generateDeliveryCode(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export function normalizeAngolanPhone(phone?: string | null): string | null {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return null;
  let local = digits;
  if (local.startsWith("00244")) local = local.slice(5);
  else if (local.startsWith("244")) local = local.slice(3);

  if (!/^9\d{8}$/.test(local)) {
    return null;
  }
  return `244${local}`;
}

export function getPlanPriceForType(
  cfg: SystemConfig,
  roleType: "loja_fixa" | "vendedor_ambulante" | "entregador",
  planType: PlanType
): number {
  if (planType === "gratis") return 0;
  if (roleType === "vendedor_ambulante") {
    return planType === "vip" ? cfg.ambulantVipPrice : cfg.ambulantBasicPrice;
  }
  if (roleType === "entregador") {
    return planType === "vip" ? cfg.courierVipPrice : cfg.courierBasicPrice;
  }
  return planType === "vip"
    ? cfg.fixedStoreVipPrice || cfg.vipPlanPrice
    : cfg.fixedStoreBasicPrice || cfg.basicPlanPrice;
}

const MAX_WHATSAPP_MESSAGE_LENGTH = 1490;

export function buildWhatsAppOrderMessage(
  order: Pick<
    Order,
    "code" | "userName" | "userPhone" | "storeName" | "items" | "total" | "deliveryType" | "address"
  >
): string {
  const deliveryLabel =
    order.deliveryType === "levantamento" ? "Levantamento na Loja" : "Entrega ao Domicílio";
  const headerLines = [
    `*Mercado Uíge — Novo Pedido ${order.code}*`,
    `Loja: ${order.storeName || "Loja Uíge"}`,
    `Cliente: ${order.userName || "Cliente Uíge"}`,
    `Telefone: ${order.userPhone || "Não informado"}`,
    `Entrega: ${deliveryLabel}`,
    order.deliveryType !== "levantamento" && order.address ? `Endereço: ${order.address}` : "",
    `Produtos:`,
  ].filter(Boolean);

  const footerLines = [
    `Total: ${fmtKz(order.total)}`,
  ];

  const baseLength =
    headerLines.join("\n").length + footerLines.join("\n").length + 4;
  const maxItemsBudget = Math.max(80, MAX_WHATSAPP_MESSAGE_LENGTH - baseLength);

  const itemLines: string[] = [];
  let currentItemsLen = 0;
  const totalItems = order.items.length;

  for (let i = 0; i < totalItems; i++) {
    const it = order.items[i];
    const cleanName = (it.productName || "Artigo").trim().slice(0, 70);
    const line = `- ${it.qty}x ${cleanName} (${fmtKz(it.price * it.qty)})`;
    const remainingCount = totalItems - i;
    const moreNotice = `\n- ... (+${remainingCount} artigo(s))`;

    if (
      currentItemsLen + line.length + 1 + (i < totalItems - 1 ? moreNotice.length : 0) >
      maxItemsBudget
    ) {
      itemLines.push(`- ... (+${remainingCount} artigo(s))`);
      break;
    }
    itemLines.push(line);
    currentItemsLen += line.length + 1;
  }

  const full = [...headerLines, ...itemLines, ...footerLines].join("\n");
  return full.length < 1500 ? full : full.slice(0, 1499);
}

export function buildWhatsAppOrderUrl(params: {
  order: Pick<
    Order,
    "code" | "userName" | "userPhone" | "storeName" | "items" | "total" | "deliveryType" | "address"
  >;
  storePhone?: string | null;
  fallbackAdminPhone?: string | null;
}): {
  url: string;
  phoneDigits: string;
  usedFallback: boolean;
  message: string;
} {
  const validStorePhone = normalizeAngolanPhone(params.storePhone);
  const validFallbackPhone = normalizeAngolanPhone(params.fallbackAdminPhone) || "244945379003";
  const usedFallback = !validStorePhone;
  const phoneDigits = validStorePhone || validFallbackPhone;
  const message = buildWhatsAppOrderMessage(params.order);
  const url = `https://wa.me/${phoneDigits}?text=${encodeURIComponent(message)}`;
  return { url, phoneDigits, usedFallback, message };
}

