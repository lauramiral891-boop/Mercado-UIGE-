import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  OfflineAuditRepo,
  OfflineProductRepo,
  OfflineReportRepo,
  OfflineStoreRepo,
  OfflineSystemConfigRepo,
  OfflineUserBlockRepo,
  OfflineUserRepo,
} from "../../repositories/offline";
import {
  DEFAULT_ESTABLISHED_ACCOUNT_DAILY_LIMIT,
  DEFAULT_NEW_ACCOUNT_DAILY_LIMIT,
  PRODUCT_AUTO_HIDE_DISTINCT_REPORTERS,
  buildBlockedSellerSet,
  checkDailyPublishQuota,
  findProhibitedKeyword,
  getDailyPublishLimitForAccount,
  getLuandaDayKey,
  parseProhibitedKeywordsList,
  validateProductPublishFields,
} from "../moderation";
import { getStoreVerificationLabel, isStoreVerified } from "../storefront";
import { saveCurrentUser, saveProducts, saveUsers } from "../storage";
import { Product, User } from "../../types";

function mockLocalStorage() {
  let store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => {
      store[k] = String(v);
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      store = {};
    },
  };
}

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: overrides.id || "u_1",
    code: overrides.code || "CL-0001",
    name: overrides.name || "Utilizador Uíge",
    email: overrides.email || "user@uige.ao",
    phone: overrides.phone ?? "923111222",
    role: overrides.role || "cliente",
    province: "Uíge",
    municipality: overrides.municipality || "Uíge",
    bairro: overrides.bairro ?? "Centro da Cidade",
    walletBalance: 0,
    isApproved: overrides.isApproved ?? true,
    approvalStatus: overrides.approvalStatus ?? "aprovado",
    isSuspended: overrides.isSuspended ?? false,
    isBanned: overrides.isBanned ?? false,
    termsAcceptedAt: overrides.termsAcceptedAt ?? new Date().toISOString(),
    createdAt: overrides.createdAt || new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
    ...overrides,
  };
}

describe("V12 — Publicação Livre, Moderação Pós-Publicação, Limites Diários e Bloqueios", () => {
  beforeEach(() => {
    mockLocalStorage();
  });

  it("1. Qualquer utilizador registado activa venda e loja imediatamente (1 loja por dono e idempotência)", async () => {
    const userRepo = new OfflineUserRepo();
    const storeRepo = new OfflineStoreRepo();

    const client = makeUser({ id: "u_seller_1", role: "cliente" });
    saveUsers([client]);
    saveCurrentUser(client);

    const upgraded = await userRepo.requestMerchantUpgrade(client.id, {
      phone: "923444555",
      municipality: "Uíge",
      bairro: "Catapa",
    });
    expect(upgraded.role).toBe("comerciante");
    expect(upgraded.isApproved).toBe(true);
    expect(upgraded.approvalStatus).toBe("aprovado");
    expect(upgraded.termsAcceptedAt).toBeTruthy();

    const firstStore = await storeRepo.create({
      ownerId: client.id,
      name: "Banca do Centro",
      storeType: "loja_fixa",
      municipality: "Uíge",
      bairro: "Catapa",
      address: "Rua do Comércio",
      facadeImage: "https://cdn.example.com/fachada.jpg",
      phone: "923444555",
      clientMutationId: "mut_store_1",
    });

    expect(firstStore.isApproved).toBe(true);
    expect(firstStore.approvalStatus).toBe("aprovado");
    expect(firstStore.verified).toBe(false);

    // Repetição com mesmo clientMutationId ou mesmo dono devolve a loja existente sem duplicar
    const sameByMutation = await storeRepo.create({
      ownerId: client.id,
      name: "Banca Duplicada",
      storeType: "loja_fixa",
      municipality: "Uíge",
      bairro: "Catapa",
      address: "Rua do Comércio",
      facadeImage: "https://cdn.example.com/fachada.jpg",
      clientMutationId: "mut_store_1",
    });
    const sameByOwner = await storeRepo.create({
      ownerId: client.id,
      name: "Outra Loja Mesmo Dono",
      storeType: "loja_fixa",
      municipality: "Uíge",
      bairro: "Catapa",
      address: "Rua do Comércio",
      facadeImage: "https://cdn.example.com/fachada.jpg",
      clientMutationId: "mut_store_2",
    });
    expect(sameByMutation.id).toBe(firstStore.id);
    expect(sameByOwner.id).toBe(firstStore.id);
    expect((await storeRepo.getAll(true)).length).toBe(1);
  });

  it("2. Publica artigos visíveis por defeito e permite reativar pré-aprovação no painel admin", async () => {
    const cfgRepo = new OfflineSystemConfigRepo();
    const storeRepo = new OfflineStoreRepo();
    const prodRepo = new OfflineProductRepo();

    const seller = makeUser({ id: "u_pub_1", role: "comerciante" });
    saveUsers([seller]);
    saveCurrentUser(seller);

    const store = await storeRepo.create({
      ownerId: seller.id,
      name: "Casa Uíge",
      storeType: "loja_fixa",
      municipality: "Uíge",
      bairro: "Centro da Cidade",
      address: "Av. Principal",
      facadeImage: "https://cdn.example.com/f.jpg",
      phone: "923000111",
    });

    const cfgDefault = await cfgRepo.get();
    expect(cfgDefault.requireProductApproval).toBe(false);

    const openProd = await prodRepo.create({
      sellerId: seller.id,
      storeId: store.id,
      name: "Arroz Tio Lucas 25kg",
      price: 22500,
      whatsapp: "923000111",
      bairro: "Centro da Cidade",
      image: "https://cdn.example.com/arroz.jpg",
    });
    expect(openProd.isApproved).toBe(true);
    expect(openProd.moderationStatus).toBe("publicado");

    // Admin activa pré-aprovação obrigatória
    await cfgRepo.update({ requireProductApproval: true });
    const heldProd = await prodRepo.create({
      sellerId: seller.id,
      storeId: store.id,
      name: "Feijão Manteiga 5kg",
      price: 7500,
      whatsapp: "923000111",
      bairro: "Centro da Cidade",
      image: "https://cdn.example.com/feijao.jpg",
    });
    expect(heldProd.isApproved).toBe(false);
    expect(heldProd.moderationStatus).toBe("em_revisao");
    expect(heldProd.moderationReason).toContain("aprovação prévia");
  });

  it("3. Separa o selo 'Loja verificada' (só admin) de 'Vendedor não verificado'", async () => {
    const storeRepo = new OfflineStoreRepo();
    const seller = makeUser({ id: "u_ver_1", role: "comerciante" });
    saveUsers([seller]);

    const st = await storeRepo.create({
      ownerId: seller.id,
      name: "Kiosque Kandemba",
      storeType: "loja_fixa",
      municipality: "Uíge",
      bairro: "Bairro Popular",
      address: "Rua A",
      facadeImage: "https://cdn.example.com/k.jpg",
      phone: "923222333",
    });

    expect(st.isApproved).toBe(true);
    expect(isStoreVerified(st)).toBe(false);
    expect(getStoreVerificationLabel(st)).toBe("Vendedor não verificado");

    await storeRepo.verifyStore(st.id, true);
    const verifiedStore = await storeRepo.getById(st.id);
    expect(isStoreVerified(verifiedStore)).toBe(true);
    expect(getStoreVerificationLabel(verifiedStore)).toBe("Loja verificada");

    // Loja suspensa perde exibição do selo verificado
    await storeRepo.suspendStore(st.id, true, "Incumprimento");
    const suspendedStore = await storeRepo.getById(st.id);
    expect(isStoreVerified(suspendedStore)).toBe(false);
    expect(getStoreVerificationLabel(suspendedStore)).toBe("Vendedor não verificado");
  });

  it("4. Aplica limites diários por idade da conta (<24h = 5/dia, >=24h = 30/dia) editáveis no admin", async () => {
    const cfgRepo = new OfflineSystemConfigRepo();
    const prodRepo = new OfflineProductRepo();
    const storeRepo = new OfflineStoreRepo();

    const nowMs = new Date("2026-05-10T12:00:00Z").getTime();
    const newAccountCreatedAt = new Date(nowMs - 2 * 3600 * 1000).toISOString();
    const establishedCreatedAt = new Date(nowMs - 48 * 3600 * 1000).toISOString();

    expect(getDailyPublishLimitForAccount(newAccountCreatedAt, null, nowMs)).toEqual({
      limit: DEFAULT_NEW_ACCOUNT_DAILY_LIMIT,
      isNewAccount: true,
    });
    expect(getDailyPublishLimitForAccount(establishedCreatedAt, null, nowMs)).toEqual({
      limit: DEFAULT_ESTABLISHED_ACCOUNT_DAILY_LIMIT,
      isNewAccount: false,
    });

    // Fuso Africa/Luanda (UTC+1): 23:30 UTC pertence ao dia seguinte em Luanda
    expect(getLuandaDayKey("2026-05-10T23:30:00Z")).toBe("2026-05-11");

    const productsToday: Product[] = Array.from({ length: 5 }, (_, idx) => ({
      id: `p_${idx}`,
      sellerId: "u_new",
      name: `Item ${idx}`,
      description: "",
      price: 1000,
      discount: 0,
      stock: 1,
      categoryName: "Casa",
      condition: "novo",
      image: "https://cdn.example.com/1.jpg",
      province: "Uíge",
      municipality: "Uíge",
      isApproved: true,
      sales: 0,
      rating: 0,
      reviewsCount: 0,
      createdAt: new Date(nowMs - idx * 60000).toISOString(),
    }));

    const newCheck = checkDailyPublishQuota({
      products: productsToday,
      sellerId: "u_new",
      userCreatedAt: newAccountCreatedAt,
      nowMs,
    });
    expect(newCheck.allowed).toBe(false);
    expect(newCheck.limit).toBe(5);

    const estCheck = checkDailyPublishQuota({
      products: productsToday,
      sellerId: "u_new",
      userCreatedAt: establishedCreatedAt,
      nowMs,
    });
    expect(estCheck.allowed).toBe(true);
    expect(estCheck.limit).toBe(30);
    expect(estCheck.remaining).toBe(25);

    // Repositório OfflineProductRepo bloqueia ao exceder limite configurável
    const newSeller = makeUser({
      id: "u_new_real",
      role: "comerciante",
      createdAt: new Date().toISOString(),
    });
    saveUsers([newSeller]);
    saveCurrentUser(newSeller);
    const st = await storeRepo.create({
      ownerId: newSeller.id,
      name: "Loja Nova",
      storeType: "loja_fixa",
      municipality: "Uíge",
      bairro: "Catapa",
      address: "Rua 1",
      facadeImage: "https://cdn.example.com/f.jpg",
      phone: "923555666",
    });

    await cfgRepo.update({ newAccountDailyLimit: 2, establishedAccountDailyLimit: 12 });
    await prodRepo.create({
      sellerId: newSeller.id,
      storeId: st.id,
      name: "Artigo 1",
      price: 1500,
      whatsapp: "923555666",
      bairro: "Catapa",
      image: "https://cdn.example.com/a1.jpg",
    });
    await prodRepo.create({
      sellerId: newSeller.id,
      storeId: st.id,
      name: "Artigo 2",
      price: 2500,
      whatsapp: "923555666",
      bairro: "Catapa",
      image: "https://cdn.example.com/a2.jpg",
    });

    await expect(
      prodRepo.create({
        sellerId: newSeller.id,
        storeId: st.id,
        name: "Artigo 3",
        price: 3500,
        whatsapp: "923555666",
        bairro: "Catapa",
        image: "https://cdn.example.com/a3.jpg",
      })
    ).rejects.toThrow(/Limite diário/);
  });

  it("5. Exige WhatsApp válido, bairro, pelo menos 1 foto, nome e preço positivo ao publicar", async () => {
    const prodRepo = new OfflineProductRepo();

    expect(
      validateProductPublishFields({
        name: "Telemóvel",
        price: 45000,
        whatsapp: "123",
        bairro: "Centro da Cidade",
        image: "https://cdn.example.com/p.jpg",
      }).ok
    ).toBe(false);

    expect(
      validateProductPublishFields({
        name: "Telemóvel",
        price: 45000,
        whatsapp: "923 111 222",
        bairro: "",
        image: "https://cdn.example.com/p.jpg",
      }).ok
    ).toBe(false);

    expect(
      validateProductPublishFields({
        name: "Telemóvel",
        price: 45000,
        whatsapp: "923 111 222",
        bairro: "Centro da Cidade",
        image: "",
        images: [],
      }).ok
    ).toBe(false);

    const valid = validateProductPublishFields({
      name: "Telemóvel",
      price: 45000,
      whatsapp: "923 111 222",
      bairro: "Centro da Cidade",
      images: ["https://cdn.example.com/p1.jpg"],
    });
    expect(valid.ok).toBe(true);
    expect(valid.normalizedWhatsapp).toBe("244923111222");

    await expect(
      prodRepo.create({
        sellerId: "u_req",
        name: "Artigo Sem Foto",
        price: 5000,
        whatsapp: "923111222",
        bairro: "Catapa",
      })
    ).rejects.toThrow(/pelo menos 1 fotografia/);
  });

  it("6. Filtra conteúdo proibido (armas, drogas, adulto, documentos falsos, receita, câmbio) e palavras editáveis", async () => {
    const cfgRepo = new OfflineSystemConfigRepo();
    const prodRepo = new OfflineProductRepo();

    expect(findProhibitedKeyword("Vendo pistola sem licença")).toBe("pistola");
    expect(findProhibitedKeyword("Chá de liamba natural")).toBe("liamba");
    expect(findProhibitedKeyword("Pack pornografia privada")).toBe("pornografia");
    expect(findProhibitedKeyword("Faço BI falso na hora")).toBe("bi falso");
    expect(findProhibitedKeyword("Caixa de antibiótico sem receita")).toBe("antibiotico");
    expect(findProhibitedKeyword("Câmbio rápido de notas")).toBe("cambio");
    expect(findProhibitedKeyword("Farinha de mandioca do Uíge")).toBeNull();

    // Palavras editáveis pelo admin
    const parsed = parseProhibitedKeywordsList("marfim, pistola, marfim\ncontrabando");
    expect(parsed).toEqual(["marfim", "pistola", "contrabando"]);
    await cfgRepo.update({ prohibitedKeywords: parsed });

    const seller = makeUser({ id: "u_filter", role: "comerciante" });
    saveUsers([seller]);
    saveCurrentUser(seller);

    const flagged = await prodRepo.create({
      sellerId: seller.id,
      name: "Escultura rara de Marfim",
      price: 80000,
      whatsapp: "923777888",
      bairro: "Centro da Cidade",
      image: "https://cdn.example.com/m.jpg",
    });

    expect(flagged.isApproved).toBe(false);
    expect(flagged.moderationStatus).toBe("em_revisao");
    expect(flagged.moderationReason).toContain("marfim");
  });

  it("7. Bloqueia denúncia duplicada, oculta artigo às 3 denúncias distintas e suporta denúncia em avaliações", async () => {
    const prodRepo = new OfflineProductRepo();
    const reportRepo = new OfflineReportRepo();

    const seller = makeUser({ id: "u_rep_seller", role: "comerciante" });
    saveUsers([seller]);
    saveCurrentUser(seller);

    const product = await prodRepo.create({
      sellerId: seller.id,
      name: "Gerador 5kVA",
      price: 185000,
      whatsapp: "923888999",
      bairro: "Papá Simão",
      image: "https://cdn.example.com/gen.jpg",
    });
    expect(PRODUCT_AUTO_HIDE_DISTINCT_REPORTERS).toBe(3);

    await reportRepo.create({
      reporterId: "c1",
      productId: product.id,
      reason: "Preço enganoso",
    });

    // Mesmo utilizador não pode denunciar duas vezes o mesmo artigo
    await expect(
      reportRepo.create({
        reporterId: "c1",
        productId: product.id,
        reason: "Repetido",
      })
    ).rejects.toThrow(/Já denunciaste/);

    await reportRepo.create({
      reporterId: "c2",
      productId: product.id,
      reason: "Fotos não correspondem",
    });
    let fetched = await prodRepo.getById(product.id);
    expect(fetched?.isApproved).toBe(true);
    expect(fetched?.reportsCount).toBe(2);

    // 3.ª conta distinta oculta automaticamente o artigo para revisão admin
    await reportRepo.create({
      reporterId: "c3",
      productId: product.id,
      reason: "Artigo suspeito",
    });
    fetched = await prodRepo.getById(product.id);
    expect(fetched?.reportsCount).toBe(3);
    expect(fetched?.isApproved).toBe(false);
    expect(fetched?.moderationStatus).toBe("em_revisao");

    // Admin pode restaurar o artigo
    await prodRepo.moderateProduct(product.id, "restaurar");
    fetched = await prodRepo.getById(product.id);
    expect(fetched?.isApproved).toBe(true);
    expect(fetched?.moderationStatus).toBe("publicado");

    // Remoção exige motivo obrigatório
    await expect(prodRepo.moderateProduct(product.id, "remover", "")).rejects.toThrow(/motivo/);
    await prodRepo.moderateProduct(product.id, "remover", "Produto contrafeito");
    expect(await prodRepo.getById(product.id)).toBeNull();

    // Denúncia em avaliação também é unicidade por avaliacao + denunciante
    const revReport = await reportRepo.create({
      reporterId: "c1",
      reviewId: "rev_99",
      reviewType: "produto",
      reviewComment: "Ofensa gratuita",
      reason: "Linguagem imprópria",
    });
    expect(revReport.reviewType).toBe("produto");
    await expect(
      reportRepo.create({
        reporterId: "c1",
        reviewId: "rev_99",
        reviewType: "produto",
        reason: "Segunda vez",
      })
    ).rejects.toThrow(/Já denunciaste/);
  });

  it("8. Permite bloquear vendedor (ocultando artigos e lojas) e regista aceitação dos Termos", async () => {
    const blockRepo = new OfflineUserBlockRepo();
    const prodRepo = new OfflineProductRepo();
    const storeRepo = new OfflineStoreRepo();

    const buyer = makeUser({ id: "u_buyer", role: "cliente", termsAcceptedAt: "2026-05-01T10:00:00Z" });
    const sellerA = makeUser({ id: "u_seller_a", role: "comerciante" });
    const sellerB = makeUser({ id: "u_seller_b", role: "comerciante" });
    saveUsers([buyer, sellerA, sellerB]);
    saveCurrentUser(sellerA);

    const storeA = await storeRepo.create({
      ownerId: sellerA.id,
      name: "Loja A",
      storeType: "loja_fixa",
      municipality: "Uíge",
      bairro: "Catapa",
      address: "Rua A",
      facadeImage: "https://cdn.example.com/a.jpg",
      phone: "923100100",
    });
    const prodA = await prodRepo.create({
      sellerId: sellerA.id,
      storeId: storeA.id,
      name: "Bicicleta A",
      price: 55000,
      whatsapp: "923100100",
      bairro: "Catapa",
      image: "https://cdn.example.com/bike.jpg",
    });

    saveCurrentUser(sellerB);
    const storeB = await storeRepo.create({
      ownerId: sellerB.id,
      name: "Loja B",
      storeType: "loja_fixa",
      municipality: "Uíge",
      bairro: "Dunga",
      address: "Rua B",
      facadeImage: "https://cdn.example.com/b.jpg",
      phone: "923200200",
    });
    const prodB = await prodRepo.create({
      sellerId: sellerB.id,
      storeId: storeB.id,
      name: "Sapato B",
      price: 12000,
      whatsapp: "923200200",
      bairro: "Dunga",
      image: "https://cdn.example.com/shoe.jpg",
    });

    saveCurrentUser(buyer);
    expect(buyer.termsAcceptedAt).toBe("2026-05-01T10:00:00Z");

    await blockRepo.block(buyer.id, sellerA.id, "Vendedor abusivo");
    const blockedSet = buildBlockedSellerSet(await blockRepo.getAll(buyer.id), buyer.id);
    expect(blockedSet.has(sellerA.id)).toBe(true);

    const visibleProds = await prodRepo.getAll();
    expect(visibleProds.some((p) => p.id === prodA.id)).toBe(false);
    expect(visibleProds.some((p) => p.id === prodB.id)).toBe(true);

    const visibleStores = await storeRepo.getAll();
    expect(visibleStores.some((s) => s.id === storeA.id)).toBe(false);
    expect(visibleStores.some((s) => s.id === storeB.id)).toBe(true);

    await blockRepo.unblock(buyer.id, sellerA.id);
    expect((await prodRepo.getAll()).some((p) => p.id === prodA.id)).toBe(true);
  });

  it("9. Banir utilizador exige motivo, suspende loja associada e impede novas publicações", async () => {
    const userRepo = new OfflineUserRepo();
    const storeRepo = new OfflineStoreRepo();
    const prodRepo = new OfflineProductRepo();
    const auditRepo = new OfflineAuditRepo();

    const offender = makeUser({ id: "u_bad", role: "comerciante" });
    saveUsers([offender]);
    saveCurrentUser(offender);

    const store = await storeRepo.create({
      ownerId: offender.id,
      name: "Loja Suspeita",
      storeType: "loja_fixa",
      municipality: "Uíge",
      bairro: "Quituma",
      address: "Rua Z",
      facadeImage: "https://cdn.example.com/z.jpg",
      phone: "923300300",
    });

    await expect(userRepo.banUser(offender.id, true, "")).rejects.toThrow(/motivo/);

    await userRepo.banUser(offender.id, true, "Fraude reiterada");
    await auditRepo.log("admin_1", "BAN_USER", offender.id, { reason: "Fraude reiterada" });

    const updatedOffender = (await userRepo.getAll()).find((u) => u.id === offender.id);
    expect(updatedOffender?.isBanned).toBe(true);
    expect(updatedOffender?.banReason).toBe("Fraude reiterada");

    const updatedStore = await storeRepo.getById(store.id);
    expect(updatedStore?.isSuspended).toBe(true);

    await expect(
      prodRepo.create({
        sellerId: offender.id,
        storeId: store.id,
        name: "Novo Artigo",
        price: 5000,
        whatsapp: "923300300",
        bairro: "Quituma",
        image: "https://cdn.example.com/n.jpg",
      })
    ).rejects.toThrow(/banida ou suspensa/);

    const logs = await auditRepo.getAll();
    expect(logs.some((l) => l.action === "BAN_USER" && l.targetId === offender.id)).toBe(true);
  });

  it("10. Garante regras de servidor, limites, RLS e isolamento entre vendedores na migração 20250112", () => {
    const sqlPath = path.resolve(
      process.cwd(),
      "supabase/migrations/20250112_open_publishing_moderation_limits_and_blocks.sql"
    );
    const sql = fs.readFileSync(sqlPath, "utf8");

    expect(sql).toContain("termos_aceites_em TIMESTAMPTZ");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.bloqueios_utilizador");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS verificada BOOLEAN NOT NULL DEFAULT FALSE");
    expect(sql).toContain("limite_diario_conta_nova INT NOT NULL DEFAULT 5");
    expect(sql).toContain("limite_diario_conta_estabelecida INT NOT NULL DEFAULT 30");
    expect(sql).toContain("palavras_proibidas TEXT[]");
    expect(sql).toContain("v_prod_distinct >= 3");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.admin_moderar_produto");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.admin_verificar_loja");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.admin_banir_utilizador");
    expect(sql).toContain("uq_denuncias_reporter_produto");
    expect(sql).toContain("uq_denuncias_reporter_avaliacao");
    // Isolamento entre vendedores: só o próprio vendedor (não banido) ou moderador pode alterar/apagar produto
    expect(sql).toContain("vendedor_id = auth.uid() AND NOT public.is_user_banned(auth.uid())");
    expect(sql).toContain("lj.dono_id = auth.uid()");
  });
});
