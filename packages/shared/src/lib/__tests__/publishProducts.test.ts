import { describe, it, expect, beforeEach } from "vitest";
import {
  canMerchantPublishFloating,
  resolvePublishAction,
  validateVideoConstraints,
  MAX_VIDEO_DURATION_SEC,
  MAX_VIDEO_BYTES,
  OfflineProductRepo,
  OfflineSystemConfigRepo,
  Store,
  User,
} from "../../index";

const APPROVED_MERCHANT: User = {
  id: "seller-1",
  name: "Manuel Chicungo",
  email: "manuel@uige.ao",
  role: "comerciante",
  isApproved: true,
  isSuspended: false,
  walletBalance: 0,
  createdAt: "2026-01-01T00:00:00Z",
};

const APPROVED_STORE: Store = {
  id: "store-1",
  ownerId: "seller-1",
  name: "Casa Chicungo",
  description: "Comércio local",
  category: "Electrónicos",
  storeType: "loja_fixa",
  province: "Uíge",
  municipality: "Uíge",
  logo: "",
  isApproved: true,
  isSuspended: false,
  isVip: false,
  rating: 5,
  salesCount: 0,
  createdAt: "2026-01-01T00:00:00Z",
};

describe("FASE 2 — Publicação de Artigos (+ Publicar, Vídeo e Moderação)", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    (globalThis as any).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, String(v)),
      removeItem: (k: string) => store.delete(k),
      clear: () => store.clear(),
    };
  });

  it("botão Publicar na barra encaminha conforme perfil: login, Quero vender ou formulário", () => {
    expect(canMerchantPublishFloating(null)).toBe(false);
    expect(canMerchantPublishFloating({ ...APPROVED_MERCHANT, role: "cliente" })).toBe(false);
    expect(canMerchantPublishFloating({ ...APPROVED_MERCHANT, role: "entregador" })).toBe(false);
    expect(canMerchantPublishFloating({ ...APPROVED_MERCHANT, isApproved: false })).toBe(false);
    expect(canMerchantPublishFloating({ ...APPROVED_MERCHANT, isSuspended: true })).toBe(false);
    expect(canMerchantPublishFloating(APPROVED_MERCHANT, { ...APPROVED_STORE, isSuspended: true })).toBe(false);
    expect(canMerchantPublishFloating(APPROVED_MERCHANT, { ...APPROVED_STORE, isApproved: false })).toBe(false);

    expect(canMerchantPublishFloating(APPROVED_MERCHANT, APPROVED_STORE)).toBe(true);
    expect(canMerchantPublishFloating(APPROVED_MERCHANT, null)).toBe(true);

    expect(resolvePublishAction(null)).toBe("login");
    expect(resolvePublishAction({ ...APPROVED_MERCHANT, role: "cliente" })).toBe("want_to_sell");
    expect(resolvePublishAction({ ...APPROVED_MERCHANT, isApproved: false })).toBe("want_to_sell");
    expect(resolvePublishAction(APPROVED_MERCHANT, APPROVED_STORE)).toBe("publish");
  });

  it("valida estritamente limites de vídeo de artigos: máximo 15 s e 10 MB", () => {
    expect(validateVideoConstraints(MAX_VIDEO_DURATION_SEC, MAX_VIDEO_BYTES)).toEqual({ ok: true });
    expect(validateVideoConstraints(8.5, 2 * 1024 * 1024)).toEqual({ ok: true });

    const tooLong = validateVideoConstraints(15.2, 1024 * 1024);
    expect(tooLong.ok).toBe(false);
    expect(tooLong.error).toContain("15 segundos");

    const tooHeavy = validateVideoConstraints(10, MAX_VIDEO_BYTES + 1);
    expect(tooHeavy.ok).toBe(false);
    expect(tooHeavy.error).toContain("10 MB");

    expect(validateVideoConstraints(0, 1024).ok).toBe(false);
  });

  it("respeita definição do admin para aprovação prévia de artigos", async () => {
    const configRepo = new OfflineSystemConfigRepo();
    const prodRepo = new OfflineProductRepo();

    // Publicação directa quando moderação está desligada
    await configRepo.update({ requireProductApproval: false });
    const directProd = await prodRepo.create({
      sellerId: APPROVED_MERCHANT.id,
      storeId: APPROVED_STORE.id,
      name: "TV Smart 32",
      price: 85000,
      condition: "novo",
      categoryName: "Electrónicos",
    });
    expect(directProd.isApproved).toBe(true);

    // Quando o admin activa a aprovação de artigos, novos artigos ficam pendentes
    await configRepo.update({ requireProductApproval: true });
    const moderatedProd = await prodRepo.create({
      sellerId: APPROVED_MERCHANT.id,
      storeId: APPROVED_STORE.id,
      name: "Gerador Portátil",
      price: 120000,
      condition: "usado",
      categoryName: "Casa e Lar",
      videoUrl: "https://cdn.uige.ao/demo.webm",
      mediaType: "video",
    });
    expect(moderatedProd.isApproved).toBe(false);
    expect(moderatedProd.mediaType).toBe("video");

    // Admin aprova o artigo pendente
    await prodRepo.approve(moderatedProd.id, true);
    const reloaded = await prodRepo.getById(moderatedProd.id);
    expect(reloaded?.isApproved).toBe(true);
  });
});
