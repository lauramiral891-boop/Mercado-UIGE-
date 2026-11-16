import { describe, it, expect, beforeEach } from "vitest";
import {
  SponsoredAd,
  Store,
  FULLSCREEN_AD_INITIAL_DELAY_MS,
  FULLSCREEN_AD_COOLDOWN_MS,
  storeHasActivePaidPlan,
  isCellularConnection,
  canShowFullscreenAd,
  OfflineAdRepo,
  saveStores,
  saveAds,
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
        storeId: "st_free",
        sellerId: "u_owner",
        title: "Tentativa sem plano",
        active: true,
        status: "aprovado",
      })
    ).rejects.toThrow("plano pago activo");
  });
});
