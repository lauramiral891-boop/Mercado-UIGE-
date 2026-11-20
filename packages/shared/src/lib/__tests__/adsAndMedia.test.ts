import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  SponsoredAd,
  Store,
  BANNER_TARGET_WIDTH,
  BANNER_TARGET_HEIGHT,
  MAX_BANNER_IMAGE_BYTES,
  FULLSCREEN_AD_INITIAL_DELAY_MS,
  FULLSCREEN_AD_COOLDOWN_MS,
  MAX_AD_VIDEO_DURATION_SEC,
  MAX_AD_VIDEO_BYTES,
  AD_VIDEO_TARGET_BYTES,
  MAX_PRODUCT_VIDEO_BYTES,
  MAX_STORAGE_UPLOAD_BYTES,
  DEFAULT_BANNER_DURATION_SEC,
  MIN_BANNER_DURATION_SEC,
  MAX_BANNER_DURATION_SEC,
  LUANDA_UTC_OFFSET_MINUTES,
  getNowLuandaInput,
  luandaInputToUtcIso,
  utcIsoToLuandaInput,
  formatLuandaDateTimeShort,
  isAdWithinScheduleWindow,
  resolveAdLifecycleState,
  extractServerErrorDetail,
  clampBannerDurationSec,
  resolveEffectiveBannerDurationSec,
  isBannerPaid,
  sortBannersForCarousel,
  computeAdCtrPercent,
  computeBannerDashboardStats,
  computeTargetVideoBitrate,
  validateVideoConstraints,
  normalizeUploadFileName,
  uploadMediaFile,
  storeHasActivePaidPlan,
  isAdEligibleForPublicDisplay,
  hasAdDestination,
  validateSafeAdDestination,
  isCellularConnection,
  canShowFullscreenAd,
  OfflineAdRepo,
  OfflinePaymentRepo,
  OfflineSystemConfigRepo,
  saveStores,
  saveAds,
  saveMerchantPayments,
} from "../../index";

const makeStore = (overrides: Partial<Store> = {}): Store => ({
  id: "st_paid",
  code: "LJ-0010",
  ownerId: "u_owner",
  name: "Loja Café do Uíge",
  description: "Café e produtos agrícolas",
  category: "Alimentação",
  storeType: "loja_fixa",
  province: "Uíge",
  municipality: "Uíge",
  logo: "https://cdn.example.com/logo.jpg",
  facadeImage: "https://cdn.example.com/facade.jpg",
  isApproved: true,
  isSuspended: false,
  isVip: false,
  planType: "basico",
  planExpiresAt: new Date(Date.now() + 15 * 86400_000).toISOString(),
  rating: 4.9,
  salesCount: 25,
  createdAt: new Date().toISOString(),
  ...overrides,
});

describe("Anúncios em imagem ou vídeo, dados móveis e regras de ecrã inteiro (FASE 3)", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    (globalThis as any).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, String(v)),
      removeItem: (k: string) => store.delete(k),
      clear: () => store.clear(),
    };
    saveMerchantPayments([]);
  });

  it("identifica correctamente lojas elegíveis apenas com plano pago activo", () => {
    const now = Date.now();
    expect(storeHasActivePaidPlan(makeStore({ planType: "basico" }), now)).toBe(true);
    expect(storeHasActivePaidPlan(makeStore({ planType: "vip" }), now)).toBe(true);
    expect(storeHasActivePaidPlan(makeStore({ planType: "gratis" }), now)).toBe(false);
    expect(storeHasActivePaidPlan(makeStore({ isApproved: false }), now)).toBe(false);
    expect(storeHasActivePaidPlan(makeStore({ isSuspended: true }), now)).toBe(false);
    expect(
      storeHasActivePaidPlan(
        makeStore({ planType: "vip", planExpiresAt: new Date(now - 3600_000).toISOString() }),
        now
      )
    ).toBe(false);
  });

  it("detecta ligação por dados móveis ou poupança de dados sem quebrar fora do browser", () => {
    expect(isCellularConnection({ connection: { type: "cellular" } })).toBe(true);
    expect(isCellularConnection({ connection: { type: "wifi", saveData: true } })).toBe(true);
    expect(isCellularConnection({ connection: { type: "wifi", saveData: false } })).toBe(false);
    expect(isCellularConnection({})).toBe(false);
  });

  it("respeita 30s iniciais, intervalo de 4 min e bloqueios no checkout, registo ou escrita", () => {
    const now = 1_000_000;
    const base = {
      activeUsageMs: FULLSCREEN_AD_INITIAL_DELAY_MS,
      nowMs: now,
      lastShownAtMs: null,
      currentView: "home",
      isModalOpen: false,
      isTyping: false,
      hasEligibleAd: true,
    };

    expect(canShowFullscreenAd(base)).toBe(true);
    // Primeiros 30s da app
    expect(canShowFullscreenAd({ ...base, activeUsageMs: FULLSCREEN_AD_INITIAL_DELAY_MS - 1 })).toBe(false);
    // Nunca no checkout/carrinho
    expect(canShowFullscreenAd({ ...base, currentView: "cart" })).toBe(false);
    expect(canShowFullscreenAd({ ...base, currentView: "checkout" })).toBe(false);
    // Nunca com modal aberto (ex: registo/login/detalhes)
    expect(canShowFullscreenAd({ ...base, isModalOpen: true })).toBe(false);
    // Nunca enquanto escreve
    expect(canShowFullscreenAd({ ...base, isTyping: true })).toBe(false);
    // Máximo 1 a cada 4 minutos
    expect(
      canShowFullscreenAd({ ...base, lastShownAtMs: now - (FULLSCREEN_AD_COOLDOWN_MS - 1000) })
    ).toBe(false);
    expect(
      canShowFullscreenAd({ ...base, lastShownAtMs: now - FULLSCREEN_AD_COOLDOWN_MS })
    ).toBe(true);
  });

  it("filtra anúncios públicos para mostrar só lojas com plano pago activo e preserva vídeos", async () => {
    const paidStore = makeStore({ id: "st_paid", planType: "vip" });
    const freeStore = makeStore({ id: "st_free", planType: "gratis", name: "Loja Grátis" });
    saveStores([paidStore, freeStore]);

    const futureEnd = new Date(Date.now() + 7 * 86400_000).toISOString();
    const pastStart = new Date(Date.now() - 86400_000).toISOString();

    const paidVideoAd: SponsoredAd = {
      id: "ad_paid_video",
      advertiserType: "loja",
      storeId: "st_paid",
      sellerId: "u_owner",
      storeName: paidStore.name,
      title: "Vídeo Promo VIP",
      subtitle: "Descontos no centro",
      imageUrl: "https://cdn.example.com/poster.jpg",
      videoUrl: "https://cdn.example.com/promo.mp4",
      mediaType: "video",
      position: "topo",
      startDate: pastStart,
      endDate: futureEnd,
      views: 0,
      clicks: 0,
      active: true,
      status: "aprovado",
      createdAt: pastStart,
    };

    const freeStoreAd: SponsoredAd = {
      ...paidVideoAd,
      id: "ad_free",
      storeId: "st_free",
      storeName: freeStore.name,
      title: "Loja Grátis Indevida",
    };

    saveAds([paidVideoAd, freeStoreAd]);

    const repo = new OfflineAdRepo();
    const publicList = await repo.getAll(false);
    expect(publicList).toHaveLength(1);
    expect(publicList[0].id).toBe("ad_paid_video");
    expect(publicList[0].mediaType).toBe("video");
    expect(publicList[0].videoUrl).toBe("https://cdn.example.com/promo.mp4");

    await expect(
      repo.create({
        advertiserType: "loja",
        storeId: "st_free",
        sellerId: "u_owner",
        title: "Tentativa sem plano",
        active: true,
        status: "aprovado",
      })
    ).rejects.toThrow("plano pago activo");
  });

  it("permite anúncios da plataforma e externos sem loja, rejeita javascript: e regista pagamentos externos", async () => {
    saveStores([]);
    saveAds([]);

    expect(validateSafeAdDestination("link", "https://mercadouige.ao/campanha").ok).toBe(true);
    expect(validateSafeAdDestination("link", "javascript:alert(1)").ok).toBe(false);
    expect(validateSafeAdDestination("link", "http://inseguro.ao").ok).toBe(false);
    expect(validateSafeAdDestination("link", "data:text/html,<script>").ok).toBe(false);

    const waCheck = validateSafeAdDestination("whatsapp", "923456789");
    expect(waCheck.ok).toBe(true);
    expect(waCheck.normalizedValue).toBe("https://wa.me/244923456789");

    const adRepo = new OfflineAdRepo();
    const futureEnd = new Date(Date.now() + 7 * 86400_000).toISOString();
    const pastStart = new Date(Date.now() - 86400_000).toISOString();

    // Rejeita criação com javascript:
    await expect(
      adRepo.create({
        advertiserType: "plataforma",
        title: "XSS Bloqueado",
        destinationType: "link",
        destinationValue: "javascript:alert(1)",
        position: "faixa",
        startDate: pastStart,
        endDate: futureEnd,
        active: true,
        status: "aprovado",
      })
    ).rejects.toThrow("https://");

    const platformAd = await adRepo.create({
      advertiserType: "plataforma",
      title: "Semana Agrícola do Uíge",
      destinationType: "link",
      destinationValue: "https://mercadouige.ao/feira",
      position: "faixa",
      startDate: pastStart,
      endDate: futureEnd,
      active: true,
      status: "aprovado",
    });

    const externalAd = await adRepo.create({
      advertiserType: "externo",
      advertiserName: "Banco Sol Uíge",
      title: "Conta Digital Uíge",
      destinationType: "whatsapp",
      destinationValue: "923111222",
      position: "ecra_inteiro",
      startDate: pastStart,
      endDate: futureEnd,
      active: true,
      status: "aprovado",
    });

    expect(isAdEligibleForPublicDisplay(platformAd, [])).toBe(true);
    expect(isAdEligibleForPublicDisplay(externalAd, [])).toBe(true);

    const activePublic = await adRepo.getAll(false);
    expect(activePublic).toHaveLength(2);

    // Editar título e destino
    const updatedExternal = await adRepo.update(externalAd.id, {
      title: "Conta Jovem Uíge",
      position: "faixa",
    });
    expect(updatedExternal.title).toBe("Conta Jovem Uíge");
    expect(updatedExternal.position).toBe("faixa");

    // Pausar e apagar
    await adRepo.updateStatus(platformAd.id, "pendente", false);
    expect(await adRepo.getAll(false)).toHaveLength(1);
    await adRepo.delete(platformAd.id);
    expect(await adRepo.getAll(true)).toHaveLength(1);

    // Registo de pagamento de anunciante externo
    const payRepo = new OfflinePaymentRepo();
    const extPayment = await payRepo.create({
      sellerId: "admin_1",
      advertiserName: "Banco Sol Uíge",
      type: "anuncio_externo",
      adId: externalAd.id,
      amountKz: 35000,
      method: "Transferência",
      reference: "BFA-9921",
      proofUrl: "https://cdn.example.com/comprovativo.jpg",
    });
    expect(extPayment.type).toBe("anuncio_externo");
    expect(extPayment.amountKz).toBe(35000);
    expect(extPayment.advertiserName).toBe("Banco Sol Uíge");
  });

  it("valida limites de banner (1600x900 máx 300KB; vídeo 15 s / 5 MB) e limite de 20 MB no Storage", async () => {
    expect(BANNER_TARGET_WIDTH).toBe(1600);
    expect(BANNER_TARGET_HEIGHT).toBe(900);
    expect(MAX_BANNER_IMAGE_BYTES).toBe(300 * 1024);

    expect(MAX_PRODUCT_VIDEO_BYTES).toBe(10 * 1024 * 1024);
    expect(MAX_AD_VIDEO_BYTES).toBe(5 * 1024 * 1024);
    expect(AD_VIDEO_TARGET_BYTES).toBe(4 * 1024 * 1024);
    expect(MAX_AD_VIDEO_DURATION_SEC).toBe(15);
    expect(MAX_STORAGE_UPLOAD_BYTES).toBe(20 * 1024 * 1024);

    // Banner em vídeo: aceita até 15 s e 5 MB
    expect(
      validateVideoConstraints(15, 5 * 1024 * 1024, {
        maxDurationSec: MAX_AD_VIDEO_DURATION_SEC,
        maxBytes: MAX_AD_VIDEO_BYTES,
      })
    ).toEqual({ ok: true });

    const adTooLong = validateVideoConstraints(16, 2 * 1024 * 1024, {
      maxDurationSec: MAX_AD_VIDEO_DURATION_SEC,
      maxBytes: MAX_AD_VIDEO_BYTES,
    });
    expect(adTooLong.ok).toBe(false);
    expect(adTooLong.error).toContain("15 segundos");

    const adTooHeavy = validateVideoConstraints(12, MAX_AD_VIDEO_BYTES + 1, {
      maxDurationSec: MAX_AD_VIDEO_DURATION_SEC,
      maxBytes: MAX_AD_VIDEO_BYTES,
    });
    expect(adTooHeavy.ok).toBe(false);
    expect(adTooHeavy.error).toContain("5 MB");

    // Bitrate alvo mantém vídeo de 15s abaixo de 4 MB
    const bps15 = computeTargetVideoBitrate(15, AD_VIDEO_TARGET_BYTES);
    const estimatedBytes15 = (bps15 * 15) / 8;
    expect(estimatedBytes15).toBeLessThanOrEqual(AD_VIDEO_TARGET_BYTES);

    // Upload para Storage bloqueia ficheiros > 20 MB antes de enviar
    const oversizedBlob = new Blob([new Uint8Array(10)], { type: "video/mp4" });
    Object.defineProperty(oversizedBlob, "size", { value: MAX_STORAGE_UPLOAD_BYTES + 1024 });
    const uploadRes = await uploadMediaFile(oversizedBlob, "grande.mp4", "anuncios");
    expect(uploadRes.url).toBeNull();
    expect(uploadRes.error?.message).toContain("20 MB");
  });

  it("permite banners só com imagem ou vídeo sem título, descrição, botão nem link (nenhum texto forçado)", async () => {
    saveStores([]);
    saveAds([]);
    const repo = new OfflineAdRepo();

    expect(validateSafeAdDestination("nenhum", "")).toEqual({ ok: true, normalizedValue: "" });

    const imageOnly = await repo.create({
      advertiserType: "plataforma",
      bannerCategory: "publico",
      isPaid: false,
      title: "",
      description: "",
      ctaText: "",
      destinationType: "nenhum",
      destinationValue: "",
      imageUrl: "https://cdn.example.com/banner-16x9.webp",
      position: "topo",
      startDate: null,
      endDate: null,
      active: true,
      status: "aprovado",
    });

    expect(imageOnly.title).toBe("");
    expect(imageOnly.description).toBe("");
    expect(imageOnly.ctaText).toBe("");
    expect(imageOnly.destinationType).toBe("nenhum");
    expect(hasAdDestination(imageOnly)).toBe(false);
    expect(isAdEligibleForPublicDisplay(imageOnly, [])).toBe(true);

    const linkedBanner = await repo.create({
      advertiserType: "externo",
      advertiserName: "Loja Parceira",
      bannerCategory: "patrocinado",
      isPaid: true,
      title: "Promoção Especial",
      destinationType: "link",
      destinationValue: "https://empresa.ao",
      imageUrl: "https://cdn.example.com/promo.webp",
      position: "topo",
      startDate: null,
      endDate: null,
      active: true,
      status: "aprovado",
    });
    expect(hasAdDestination(linkedBanner)).toBe(true);
    expect(linkedBanner.ctaText).toBe("");

    const allPublic = await repo.getAll(false);
    expect(allPublic).toHaveLength(2);
  });

  it("aplica duração por banner vs padrão global (3..60s), ordenação por prioridade/ordem, CTR e suspensão (FASE A)", async () => {
    expect(DEFAULT_BANNER_DURATION_SEC).toBe(8);
    expect(clampBannerDurationSec(undefined)).toBe(8);
    expect(clampBannerDurationSec(0)).toBe(8);
    expect(clampBannerDurationSec(1)).toBe(MIN_BANNER_DURATION_SEC);
    expect(clampBannerDurationSec(120)).toBe(MAX_BANNER_DURATION_SEC);
    expect(clampBannerDurationSec(15)).toBe(15);

    expect(
      resolveEffectiveBannerDurationSec({ durationSec: null }, { bannerDefaultDurationSec: 20 })
    ).toBe(20);
    expect(
      resolveEffectiveBannerDurationSec({ durationSec: 12 }, { bannerDefaultDurationSec: 20 })
    ).toBe(12);

    const cfgRepo = new OfflineSystemConfigRepo();
    const updatedCfg = await cfgRepo.update({ bannerDefaultDurationSec: 15, bannerAutoplay: false });
    expect(updatedCfg.bannerDefaultDurationSec).toBe(15);
    expect(updatedCfg.bannerAutoplay).toBe(false);

    saveStores([]);
    saveAds([]);
    const adRepo = new OfflineAdRepo();
    const pastStart = new Date(Date.now() - 86400_000).toISOString();
    const futureEnd = new Date(Date.now() + 7 * 86400_000).toISOString();

    const freeBanner = await adRepo.create({
      advertiserType: "plataforma",
      bannerCategory: "publico",
      isPaid: false,
      title: "Feira do Uíge Gratuita",
      description: "Entrada livre no mercado municipal",
      ctaText: "Saber mais",
      position: "topo",
      order: 1,
      priority: 10,
      durationSec: null,
      startDate: pastStart,
      endDate: futureEnd,
      active: true,
      status: "aprovado",
    });

    const paidBanner = await adRepo.create({
      advertiserType: "externo",
      advertiserName: "Unitel Uíge",
      bannerCategory: "patrocinado",
      isPaid: true,
      title: "Internet Rápida no Uíge",
      ctaText: "Ver pacotes",
      destinationType: "link",
      destinationValue: "https://unitel.ao/uige",
      position: "topo",
      order: 2,
      priority: 50,
      durationSec: 12,
      startDate: pastStart,
      endDate: futureEnd,
      active: true,
      status: "aprovado",
    });

    const pendingBanner = await adRepo.create({
      advertiserType: "externo",
      advertiserName: "Banco BIC",
      bannerCategory: "promocional",
      isPaid: true,
      title: "Campanha Pendente",
      destinationType: "link",
      destinationValue: "https://bancobic.ao",
      position: "topo",
      order: 3,
      priority: 5,
      startDate: pastStart,
      endDate: futureEnd,
      active: false,
      status: "pendente",
    });

    expect(isBannerPaid(freeBanner)).toBe(false);
    expect(isBannerPaid(paidBanner)).toBe(true);

    const ordered = sortBannersForCarousel([freeBanner, paidBanner]);
    expect(ordered[0].id).toBe(paidBanner.id);
    expect(ordered[1].id).toBe(freeBanner.id);

    // Simular vistas e cliques
    const saved = (await adRepo.getAll(true)).map((item) =>
      item.id === paidBanner.id ? { ...item, views: 200, clicks: 15 } : item
    );
    saveAds(saved);

    expect(computeAdCtrPercent({ views: 200, clicks: 15 })).toBe(7.5);
    const stats = computeBannerDashboardStats(await adRepo.getAll(true));
    expect(stats.activos).toBe(2);
    expect(stats.pendentes).toBe(1);
    expect(stats.pagos).toBe(2);
    expect(stats.gratuitos).toBe(1);
    expect(stats.totalViews).toBe(200);
    expect(stats.totalClicks).toBe(15);
    expect(stats.ctrPercent).toBe(7.5);

    // Suspender banner retira-o da lista pública
    await adRepo.updateStatus(paidBanner.id, "suspenso", false);
    const publicAfterSuspend = await adRepo.getAll(false);
    expect(publicAfterSuspend.map((a) => a.id)).toEqual([freeBanner.id]);

    // Aprovar pendente
    await adRepo.updateStatus(pendingBanner.id, "aprovado", true);
    const publicAfterApprove = await adRepo.getAll(false);
    expect(publicAfterApprove.map((a) => a.id)).toContain(pendingBanner.id);
  });

  it("converte datas Africa/Luanda (UTC+1) para UTC, valida agendamentos futuros/sem datas e extrai erros reais do servidor (FASE 1)", async () => {
    expect(LUANDA_UTC_OFFSET_MINUTES).toBe(60);

    // 14:30 em Africa/Luanda (UTC+1) == 13:30 UTC no mesmo dia, independente do fuso do servidor Node
    const utcFromLuanda = luandaInputToUtcIso("2026-11-17T14:30");
    expect(utcFromLuanda).toBe("2026-11-17T13:30:00.000Z");
    expect(utcIsoToLuandaInput("2026-11-17T13:30:00.000Z")).toBe("2026-11-17T14:30");

    // Passagem de meia-noite UTC -> Luanda (23:30 UTC == 00:30 do dia seguinte em Luanda)
    expect(utcIsoToLuandaInput("2026-11-17T23:30:00.000Z")).toBe("2026-11-18T00:30");
    expect(formatLuandaDateTimeShort("2026-11-17T23:30:00.000Z")).toBe("18/11 00:30");
    expect(getNowLuandaInput(Date.UTC(2026, 10, 17, 13, 30))).toBe("2026-11-17T14:30");

    saveStores([]);
    saveAds([]);
    const repo = new OfflineAdRepo();
    const nowMs = Date.UTC(2026, 10, 17, 12, 0, 0); // 13:00 Luanda

    // 1. Anúncio sem datas entra imediatamente no ar se aprovado e activo
    const undatedAd = await repo.create({
      advertiserType: "plataforma",
      title: "Campanha Sem Datas",
      destinationType: "link",
      destinationValue: "https://mercadouige.ao/sempre",
      position: "topo",
      startDate: null,
      endDate: null,
      active: true,
      status: "aprovado",
    });
    expect(isAdWithinScheduleWindow(undatedAd, nowMs)).toBe(true);
    expect(isAdEligibleForPublicDisplay(undatedAd, [], nowMs)).toBe(true);
    const undatedState = resolveAdLifecycleState(undatedAd, [], nowMs);
    expect(undatedState.key).toBe("activo");
    expect(undatedState.label).toBe("Activo");
    expect(undatedState.reason).toContain("sem data de fim");

    // 2. Anúncio agendado para o futuro (15:00 Luanda = 14:00 UTC > 12:00 UTC)
    const futureUtc = luandaInputToUtcIso("2026-11-17T15:00")!;
    const endUtc = luandaInputToUtcIso("2026-11-20T18:00")!;
    const scheduledAd = await repo.create({
      advertiserType: "plataforma",
      title: "Black Friday Uíge",
      destinationType: "link",
      destinationValue: "https://mercadouige.ao/bf",
      position: "topo",
      startDate: futureUtc,
      endDate: endUtc,
      active: true,
      status: "aprovado",
    });
    expect(isAdWithinScheduleWindow(scheduledAd, nowMs)).toBe(false);
    expect(isAdEligibleForPublicDisplay(scheduledAd, [], nowMs)).toBe(false);
    const scheduledState = resolveAdLifecycleState(scheduledAd, [], nowMs);
    expect(scheduledState.key).toBe("agendado");
    expect(scheduledState.label).toBe("Agendado para 17/11 15:00");
    expect(scheduledState.reason).toContain("17/11 15:00");

    // 3. Rascunho fica inactivo e visível como Rascunho
    const draftAd = await repo.create({
      advertiserType: "plataforma",
      title: "Rascunho de Natal",
      destinationType: "link",
      destinationValue: "https://mercadouige.ao/natal",
      position: "topo",
      startDate: null,
      endDate: null,
      active: false,
      status: "rascunho",
      statusReason: "A aguardar fotografia definitiva",
    });
    expect(draftAd.active).toBe(false);
    expect(isAdEligibleForPublicDisplay(draftAd, [], nowMs)).toBe(false);
    const draftState = resolveAdLifecycleState(draftAd, [], nowMs);
    expect(draftState.key).toBe("rascunho");
    expect(draftState.label).toBe("Rascunho");
    expect(draftState.reason).toBe("A aguardar fotografia definitiva");

    // 4. Lista pública (getAll(false)) devolve apenas o anúncio sem datas; agendado e rascunho ficam ocultos
    vi.useFakeTimers();
    try {
      vi.setSystemTime(nowMs);
      const publicAds = await repo.getAll(false);
      expect(publicAds.map((a) => a.id)).toEqual([undatedAd.id]);
    } finally {
      vi.useRealTimers();
    }

    // 5. Rejeita fim anterior ao início
    await expect(
      repo.create({
        advertiserType: "plataforma",
        title: "Data Invertida",
        startDate: "2026-11-20T12:00:00.000Z",
        endDate: "2026-11-18T12:00:00.000Z",
        active: true,
        status: "aprovado",
      })
    ).rejects.toThrow("data de fim");

    // 6. Erros reais do servidor com código técnico (nunca "não é possível")
    const rlsErr = extractServerErrorDetail({
      code: "42501",
      message: 'new row violates row-level security policy for table "anuncios"',
    });
    expect(rlsErr.code).toBe("42501");
    expect(rlsErr.message).toContain("Permissão recusada");

    const missingColErr = extractServerErrorDetail({
      code: "PGRST204",
      message: "Could not find the 'motivo_estado' column of 'anuncios' in the schema cache",
    });
    expect(missingColErr.code).toBe("PGRST204");
    expect(missingColErr.message).toContain("Coluna em falta");

    const triggerErr = extractServerErrorDetail({
      code: "P0001",
      message: "Apenas lojas com plano pago activo podem ter anúncios patrocinados.",
    });
    expect(triggerErr.code).toBe("P0001");
    expect(triggerErr.message).toBe("Apenas lojas com plano pago activo podem ter anúncios patrocinados.");
  });

  it("normaliza nomes de ficheiros e alinha extensão com o MIME comprimido no Storage", () => {
    const pngAsJpeg = normalizeUploadFileName("Fotografia Café (Uíge) #1.png", "image/jpeg");
    expect(pngAsJpeg.safeFileName).toBe("Fotografia_Cafe_Uige_1.jpg");
    expect(pngAsJpeg.contentType).toBe("image/jpeg");

    const webpBanner = normalizeUploadFileName("banner promoção 16:9.JPG", "image/webp");
    expect(webpBanner.safeFileName).toBe("banner_promocao_16_9.webp");
    expect(webpBanner.contentType).toBe("image/webp");

    const videoWithCodec = normalizeUploadFileName("Vídeo Loja.MP4", "video/webm;codecs=vp8");
    expect(videoWithCodec.safeFileName).toBe("Video_Loja.webm");
    expect(videoWithCodec.contentType).toBe("video/webm");
  });
});
