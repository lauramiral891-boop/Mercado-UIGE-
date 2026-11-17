import { describe, it, expect, beforeEach } from "vitest";
import {
  calculateDiscountPercent,
  canUserReviewProduct,
  canUserReviewStore,
  computeReviewStats,
  filterReviews,
  filterStoreProducts,
  formatActiveSince,
  getStoreProductCategories,
  isStoreVerified,
} from "../storefront";
import {
  OfflineOrderRepo,
  OfflineProductRepo,
  OfflineProductReviewRepo,
  OfflineStoreFollowerRepo,
  OfflineStoreRepo,
  OfflineStoreReviewRepo,
} from "../../repositories/offline";
import { getStoredOrders, saveOrders } from "../storage";
import { Order, Product } from "../../types";

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

function makeProduct(overrides: Partial<Product>): Product {
  return {
    id: overrides.id || "p_1",
    storeId: overrides.storeId ?? "st_a",
    sellerId: overrides.sellerId || "seller_shared",
    name: overrides.name || "Artigo Teste",
    description: overrides.description || "Descrição",
    price: overrides.price ?? 10000,
    oldPrice: overrides.oldPrice,
    discount: overrides.discount ?? 0,
    stock: overrides.stock ?? 5,
    categoryName: overrides.categoryName || "Alimentação",
    brand: "Local",
    condition: "novo",
    image: "",
    images: [],
    province: "Uíge",
    municipality: "Uíge",
    isApproved: overrides.isApproved ?? true,
    sales: overrides.sales ?? 0,
    rating: overrides.rating ?? 0,
    reviewsCount: overrides.reviewsCount ?? 0,
    createdAt: "2026-01-10T10:00:00Z",
    ...overrides,
  };
}

describe("Loja, Produto, Seguidores e Avaliações Verificadas (FASE 10)", () => {
  beforeEach(() => {
    mockLocalStorage();
  });

  it("calcula correctamente a percentagem de desconto entre preço actual e preço antigo", () => {
    expect(calculateDiscountPercent(4500, 5500)).toBe(18);
    expect(calculateDiscountPercent(5000, 10000)).toBe(50);
    expect(calculateDiscountPercent(10000, 10000)).toBe(0);
    expect(calculateDiscountPercent(12000, 10000)).toBe(0);
    expect(calculateDiscountPercent(5000, null)).toBe(0);
    expect(calculateDiscountPercent(0, 5000)).toBe(0);
  });

  it("devolve estatísticas vazias sem valores fictícios quando não existem avaliações", () => {
    const empty = computeReviewStats([]);
    expect(empty.total).toBe(0);
    expect(empty.average).toBe(0);
    expect(empty.withPhotosCount).toBe(0);
    expect(empty.verifiedCount).toBe(0);
    expect(empty.breakdown.every((row) => row.count === 0 && row.percent === 0)).toBe(true);

    expect(
      isStoreVerified({ isApproved: false, isSuspended: false })
    ).toBe(false);
    expect(
      isStoreVerified({ isApproved: true, isSuspended: true })
    ).toBe(false);
    expect(
      isStoreVerified({ isApproved: true, isSuspended: false })
    ).toBe(true);
    expect(formatActiveSince("2026-01-15T12:00:00Z").length).toBeGreaterThan(0);
  });

  it("garante isolamento estrito entre lojas (não mistura produtos por sellerId partilhado)", () => {
    const mixedCatalog: Product[] = [
      makeProduct({ id: "p_a1", storeId: "st_a", sellerId: "owner_1", name: "Arroz Loja A", categoryName: "Alimentação" }),
      makeProduct({ id: "p_a2", storeId: "st_a", sellerId: "owner_1", name: "Ténis Loja A", categoryName: "Moda" }),
      makeProduct({ id: "p_b1", storeId: "st_b", sellerId: "owner_1", name: "Sofá Loja B", categoryName: "Casa" }),
      makeProduct({ id: "p_a_unapproved", storeId: "st_a", sellerId: "owner_1", name: "Oculto", isApproved: false }),
    ];

    const onlyA = filterStoreProducts(mixedCatalog, "st_a");
    expect(onlyA.map((p) => p.id)).toEqual(["p_a1", "p_a2"]);
    expect(onlyA.some((p) => p.id === "p_b1")).toBe(false);
    expect(onlyA.some((p) => p.id === "p_a_unapproved")).toBe(false);

    const onlyB = filterStoreProducts(mixedCatalog, "st_b");
    expect(onlyB.map((p) => p.id)).toEqual(["p_b1"]);

    expect(getStoreProductCategories(mixedCatalog, "st_a")).toEqual(["Alimentação", "Moda"]);
    expect(filterStoreProducts(mixedCatalog, "st_a", "Moda").map((p) => p.id)).toEqual(["p_a2"]);
  });

  it("permite seguir e deixar de seguir loja com unicidade por loja e utilizador", async () => {
    const storeRepo = new OfflineStoreRepo();
    const followerRepo = new OfflineStoreFollowerRepo();

    const store = await storeRepo.create({
      ownerId: "seller_1",
      name: "Boutique Uíge",
      storeType: "loja_fixa",
      municipality: "Uíge",
      bairro: "Centro da Cidade",
      address: "Rua Central",
      facadeImage: "capa.jpg",
      isApproved: true,
    });

    expect(await followerRepo.isFollowing(store.id, "cli_1")).toBe(false);
    expect(await followerRepo.getFollowerCount(store.id)).toBe(0);

    await followerRepo.follow(store.id, "cli_1");
    // Seguir duas vezes o mesmo utilizador não pode duplicar contagem
    await followerRepo.follow(store.id, "cli_1");
    expect(await followerRepo.isFollowing(store.id, "cli_1")).toBe(true);
    expect(await followerRepo.getFollowerCount(store.id)).toBe(1);

    // Outro utilizador aumenta para 2
    const toggle2 = await followerRepo.toggle(store.id, "cli_2");
    expect(toggle2.following).toBe(true);
    expect(toggle2.count).toBe(2);

    // Deixar de seguir reduz correctamente para 1
    const unfollow1 = await followerRepo.toggle(store.id, "cli_1");
    expect(unfollow1.following).toBe(false);
    expect(unfollow1.count).toBe(1);

    const refreshed = await storeRepo.getById(store.id);
    expect(refreshed?.followersCount).toBe(1);
  });

  it("bloqueia avaliações de loja e produto sem encomenda entregue e desbloqueia após Entregue", async () => {
    const storeRepo = new OfflineStoreRepo();
    const prodRepo = new OfflineProductRepo();
    const ordRepo = new OfflineOrderRepo();
    const storeRevRepo = new OfflineStoreReviewRepo();
    const prodRevRepo = new OfflineProductReviewRepo();

    const store = await storeRepo.create({
      ownerId: "seller_1",
      name: "Electrónica Uíge",
      storeType: "loja_fixa",
      municipality: "Uíge",
      bairro: "Catapa",
      address: "Av. 4 de Fevereiro",
      facadeImage: "facade.jpg",
      isApproved: true,
    });

    const prod = await prodRepo.create({
      storeId: store.id,
      sellerId: "seller_1",
      name: "Auscultadores Sem Fios",
      description: "Som nítido com boa bateria.",
      price: 15000,
      oldPrice: 20000,
      stock: 10,
      categoryName: "Electrónica",
      municipality: "Uíge",
      isApproved: true,
    });

    // Sem qualquer encomenda -> bloqueado na lógica e nos repositórios
    expect(canUserReviewProduct("cli_1", prod.id, [])).toBe(false);
    expect(canUserReviewStore("cli_1", store.id, [])).toBe(false);

    await expect(
      storeRevRepo.create({ storeId: store.id, userId: "cli_1", stars: 5, comment: "Boa" })
    ).rejects.toThrow(/encomenda entregue/);

    await expect(
      prodRevRepo.create({ productId: prod.id, userId: "cli_1", stars: 5, comment: "Bom" })
    ).rejects.toThrow(/encomenda entregue/);

    // Cria encomenda ainda Pendente -> continua bloqueado
    const createdOrder = await ordRepo.create({
      userId: "cli_1",
      userName: "Domingos Pedro",
      userPhone: "923000111",
      storeId: store.id,
      storeName: store.name,
      items: [{ productId: prod.id, qty: 2 }],
      address: "Bairro Catapa",
      paymentMethod: "Multicaixa Express",
      deliveryType: "entrega",
      deliveryFee: 1500,
    });

    expect(canUserReviewProduct("cli_1", prod.id, getStoredOrders())).toBe(false);
    await expect(
      prodRevRepo.create({ productId: prod.id, userId: "cli_1", stars: 4, comment: "Ainda não chegou" })
    ).rejects.toThrow(/encomenda entregue/);

    // Marca encomenda como Entregue
    const deliveredOrders: Order[] = getStoredOrders().map((o: Order) =>
      o.id === createdOrder.id ? { ...o, status: "Entregue" } : o
    );
    saveOrders(deliveredOrders);

    expect(canUserReviewProduct("cli_1", prod.id, deliveredOrders)).toBe(true);
    expect(canUserReviewStore("cli_1", store.id, deliveredOrders)).toBe(true);

    // Publica avaliação do produto com foto
    const revProd = await prodRevRepo.create({
      productId: prod.id,
      userId: "cli_1",
      userName: "Domingos Pedro",
      stars: 5,
      comment: "Excelente qualidade, entregue rápido no Uíge!",
      photos: ["https://cdn.example.com/foto-real.jpg"],
    });
    expect(revProd.verifiedPurchase).toBe(true);
    expect(revProd.photos).toEqual(["https://cdn.example.com/foto-real.jpg"]);

    // Publica avaliação da loja
    const revStore = await storeRevRepo.create({
      storeId: store.id,
      userId: "cli_1",
      userName: "Domingos Pedro",
      stars: 4,
      comment: "Atendimento atencioso.",
      photos: [],
    });
    expect(revStore.verifiedPurchase).toBe(true);

    // Verifica filtros de avaliações e estatísticas públicas da loja
    const prodRevs = await prodRevRepo.getByProduct(prod.id);
    const storeRevs = await storeRevRepo.getByStore(store.id);
    expect(filterReviews(prodRevs, "fotos")).toHaveLength(1);
    expect(filterReviews(storeRevs, "fotos")).toHaveLength(0);
    expect(filterReviews(storeRevs, "verificadas")).toHaveLength(1);

    const pubStats = await storeRepo.getPublicStats(store.id);
    expect(pubStats?.productsCount).toBe(1);
    expect(pubStats?.deliveredOrdersCount).toBe(1);
    expect(pubStats?.rating).toBe(4);
    expect(pubStats?.reviewsCount).toBe(1);
  });
});
