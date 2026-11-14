import { describe, it, expect, beforeEach } from "vitest";
import {
  normalizeAngolanPhone,
  buildWhatsAppOrderMessage,
  buildWhatsAppOrderUrl,
  getPlanPriceForType,
} from "../utils";
import { DEFAULT_SYSTEM_CONFIG, saveUsers } from "../storage";
import {
  OfflineOrderRepo,
  OfflineStoreRepo,
  OfflineProductRepo,
  OfflineUserRepo,
  OfflinePaymentRepo,
  OfflineSystemConfigRepo,
} from "../../repositories/offline";

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

describe("Encomendas via WhatsApp, Fallback Admin, Pagamento e Planos por Tipo", () => {
  beforeEach(() => {
    mockLocalStorage();
  });

  it("normaliza números angolanos válidos e rejeita inválidos", () => {
    expect(normalizeAngolanPhone("923456789")).toBe("244923456789");
    expect(normalizeAngolanPhone("+244 945 379 003")).toBe("244945379003");
    expect(normalizeAngolanPhone("00244 912-000-111")).toBe("244912000111");
    expect(normalizeAngolanPhone("12345")).toBeNull();
    expect(normalizeAngolanPhone("823456789")).toBeNull();
    expect(normalizeAngolanPhone("")).toBeNull();
  });

  it("usa o número da loja quando válido ou faz fallback para o número do admin editado", async () => {
    const cfgRepo = new OfflineSystemConfigRepo();
    const initialCfg = await cfgRepo.get();
    expect(initialCfg.adminWhatsapp).toBe("945379003");

    const sampleOrder = {
      code: "MU-UG-54321",
      userName: "João Manuel",
      userPhone: "923111222",
      storeName: "Casa do Negage",
      deliveryType: "entrega" as const,
      address: "Bairro Popular, Uíge",
      total: 12500,
      items: [
        {
          id: "i1",
          productId: "p1",
          productName: "Café Torrado 1Kg",
          qty: 2,
          price: 5500,
        },
      ],
    };

    const direct = buildWhatsAppOrderUrl({
      order: sampleOrder,
      storePhone: "924888777",
      fallbackAdminPhone: initialCfg.adminWhatsapp,
    });
    expect(direct.usedFallback).toBe(false);
    expect(direct.phoneDigits).toBe("244924888777");
    expect(direct.url.startsWith("https://wa.me/244924888777?text=")).toBe(true);
    expect(direct.message).toContain("MU-UG-54321");
    expect(direct.message).toContain("João Manuel");
    expect(direct.message).toContain("923111222");
    expect(direct.message).toContain("Casa do Negage");
    expect(direct.message).toContain("2x Café Torrado 1Kg");
    expect(direct.message).toContain("Entrega ao Domicílio");
    expect(direct.message.length).toBeLessThan(1500);

    // Sem WhatsApp válido na loja -> fallback para o número do admin
    const fallbackDefault = buildWhatsAppOrderUrl({
      order: sampleOrder,
      storePhone: "",
      fallbackAdminPhone: initialCfg.adminWhatsapp,
    });
    expect(fallbackDefault.usedFallback).toBe(true);
    expect(fallbackDefault.phoneDigits).toBe("244945379003");

    // Admin edita o número de fallback
    const updatedCfg = await cfgRepo.update({ adminWhatsapp: "931999888" });
    const fallbackEdited = buildWhatsAppOrderUrl({
      order: sampleOrder,
      storePhone: "123",
      fallbackAdminPhone: updatedCfg.adminWhatsapp,
    });
    expect(fallbackEdited.usedFallback).toBe(true);
    expect(fallbackEdited.phoneDigits).toBe("244931999888");
  });

  it("limita estritamente a mensagem WhatsApp a menos de 1500 caracteres mesmo com muitos produtos", () => {
    const manyItems = Array.from({ length: 65 }, (_, idx) => ({
      id: `item_${idx}`,
      productId: `p_${idx}`,
      productName: `Artigo Comercial Número ${idx + 1} com Nome Bastante Comprido no Uíge`,
      qty: idx + 1,
      price: 2500,
    }));

    const message = buildWhatsAppOrderMessage({
      code: "MU-UG-99999",
      userName: "Cliente com Nome Longo de Teste",
      userPhone: "923444555",
      storeName: "Super Loja Central do Uíge",
      deliveryType: "levantamento",
      address: "Levantamento directo na loja",
      total: 425000,
      items: manyItems,
    });

    expect(message.length).toBeLessThan(1500);
    expect(message).toContain("MU-UG-99999");
    expect(message).toContain("Levantamento na Loja");
    expect(message).toContain("Total:");
  });

  it("permite ao comerciante confirmar Pago e Entregue na encomenda", async () => {
    const storeRepo = new OfflineStoreRepo();
    const productRepo = new OfflineProductRepo();
    const orderRepo = new OfflineOrderRepo();

    const store = await storeRepo.create({
      ownerId: "seller_1",
      name: "Boutique Centro",
      storeType: "loja_fixa",
      municipality: "Uíge",
      bairro: "Centro da Cidade",
      address: "Rua Central 10",
      facadeImage: "data:image/jpeg;base64,abc",
      phone: "923100200",
    });

    const prod = await productRepo.create({
      storeId: store.id,
      sellerId: "seller_1",
      name: "Camisa Social",
      price: 8000,
      stock: 5,
    });

    const created = await orderRepo.create({
      userId: "buyer_1",
      userName: "Carlos Sebastião",
      userPhone: "924555666",
      storeId: store.id,
      storeName: store.name,
      storePhone: store.phone,
      items: [{ productId: prod.id, qty: 2 }],
      address: "Bairro Popular, Uíge",
      paymentMethod: "Multicaixa Express",
      deliveryType: "entrega",
      deliveryFee: 1500,
    });

    expect(created.paymentStatus).toBe("pendente");
    expect(created.storePhone).toBe("923100200");

    await orderRepo.markPaid(created.id);
    const afterPaid = await orderRepo.getById(created.id);
    expect(afterPaid?.paymentStatus).toBe("pago");
    expect(afterPaid?.paidAt).toBeTruthy();
    expect(afterPaid?.status).toBe("Confirmada");

    await orderRepo.updateStatus(created.id, "Entregue");
    const afterDelivered = await orderRepo.getById(created.id);
    expect(afterDelivered?.status).toBe("Entregue");
  });

  it("calcula e activa planos diferenciados por tipo (loja fixa, ambulante, entregador) via comprovativo", async () => {
    const cfgRepo = new OfflineSystemConfigRepo();
    const cfg = await cfgRepo.update({
      fixedStoreBasicPrice: 6000,
      fixedStoreVipPrice: 18000,
      ambulantBasicPrice: 3500,
      ambulantVipPrice: 9500,
      courierBasicPrice: 2500,
      courierVipPrice: 7000,
    });

    expect(getPlanPriceForType(cfg, "loja_fixa", "basico")).toBe(6000);
    expect(getPlanPriceForType(cfg, "loja_fixa", "vip")).toBe(18000);
    expect(getPlanPriceForType(cfg, "vendedor_ambulante", "basico")).toBe(3500);
    expect(getPlanPriceForType(cfg, "vendedor_ambulante", "vip")).toBe(9500);
    expect(getPlanPriceForType(cfg, "entregador", "basico")).toBe(2500);
    expect(getPlanPriceForType(cfg, "entregador", "vip")).toBe(7000);
    expect(getPlanPriceForType(DEFAULT_SYSTEM_CONFIG, "entregador", "gratis")).toBe(0);

    // Testar activação de plano para entregador via comprovativo
    saveUsers([
      {
        id: "courier_1",
        code: "CL-0010",
        name: "Mateus Domingos",
        email: "mateus@uige.ao",
        role: "entregador",
        province: "Uíge",
        municipality: "Uíge",
        walletBalance: 0,
        createdAt: new Date().toISOString(),
      },
    ]);

    const paymentRepo = new OfflinePaymentRepo();
    const userRepo = new OfflineUserRepo();

    const pay = await paymentRepo.create({
      sellerId: "courier_1",
      sellerName: "Mateus Domingos",
      userRoleType: "entregador",
      type: "plano",
      targetPlan: "vip",
      amountKz: getPlanPriceForType(cfg, "entregador", "vip"),
      method: "Multicaixa Express",
      proofUrl: "data:image/jpeg;base64,proof",
    });

    await paymentRepo.review(pay.id, "confirmado");
    const updatedUsers = await userRepo.getAll();
    const updatedCourier = updatedUsers.find((u) => u.id === "courier_1");
    expect(updatedCourier?.planType).toBe("vip");
    expect(updatedCourier?.planExpiresAt).toBeTruthy();
  });
});
