import { describe, it, expect, beforeEach } from "vitest";
import {
  SponsoredAd,
  Store,
  FULLSCREEN_AD_INITIAL_DELAY_MS,
  FULLSCREEN_AD_COOLDOWN_MS,
  MAX_AD_VIDEO_DURATION_SEC,
  MAX_AD_VIDEO_BYTES,
  AD_VIDEO_TARGET_BYTES,
  MAX_PRODUCT_VIDEO_BYTES,
  MAX_STORAGE_UPLOAD_BYTES,
  computeTargetVideoBitrate,
  validateVideoConstraints,
  uploadMediaFile,
  storeHasActivePaidPlan,
  isAdEligibleForPublicDisplay,
  validateSafeAdDestination,
  isCellularConnection,
  canShowFullscreenAd,
  OfflineAdRepo,
  OfflinePaymentRepo,
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

  it("valida limites de vídeo (20 MB / 30 s para anúncios com alvo ~8 MB; 10 MB / 15 s para artigos) e limite de 20 MB no Storage", async () => {
    expect(MAX_PRODUCT_VIDEO_BYTES).toBe(10 * 1024 * 1024);
    expect(MAX_AD_VIDEO_BYTES).toBe(20 * 1024 * 1024);
    expect(AD_VIDEO_TARGET_BYTES).toBe(8 * 1024 * 1024);
    expect(MAX_AD_VIDEO_DURATION_SEC).toBe(30);
    expect(MAX_STORAGE_UPLOAD_BYTES).toBe(20 * 1024 * 1024);

    // Anúncio do admin: aceita até 30 s e 20 MB
    expect(
      validateVideoConstraints(30, 20 * 1024 * 1024, {
        maxDurationSec: MAX_AD_VIDEO_DURATION_SEC,
        maxBytes: MAX_AD_VIDEO_BYTES,
      })
    ).toEqual({ ok: true });

    const adTooLong = validateVideoConstraints(31, 5 * 1024 * 1024, {
      maxDurationSec: MAX_AD_VIDEO_DURATION_SEC,
      maxBytes: MAX_AD_VIDEO_BYTES,
    });
    expect(adTooLong.ok).toBe(false);
    expect(adTooLong.error).toContain("30 segundos");

    const adTooHeavy = validateVideoConstraints(25, MAX_AD_VIDEO_BYTES + 1, {
      maxDurationSec: MAX_AD_VIDEO_DURATION_SEC,
      maxBytes: MAX_AD_VIDEO_BYTES,
    });
    expect(adTooHeavy.ok).toBe(false);
    expect(adTooHeavy.error).toContain("20 MB");

    // Bitrate alvo mantém vídeo de 30s abaixo de ~8 MB
    const bps30 = computeTargetVideoBitrate(30, AD_VIDEO_TARGET_BYTES);
    const estimatedBytes30 = (bps30 * 30) / 8;
    expect(estimatedBytes30).toBeLessThanOrEqual(AD_VIDEO_TARGET_BYTES);

    // Upload para Storage bloqueia ficheiros > 20 MB antes de enviar
    const oversizedBlob = new Blob([new Uint8Array(10)], { type: "video/mp4" });
    Object.defineProperty(oversizedBlob, "size", { value: MAX_STORAGE_UPLOAD_BYTES + 1024 });
    const uploadRes = await uploadMediaFile(oversizedBlob, "grande.mp4", "anuncios");
    expect(uploadRes.url).toBeNull();
    expect(uploadRes.error?.message).toContain("20 MB");
  });
});
