import { describe, it, expect, beforeEach } from "vitest";
import {
  OfflineStoreRepo,
  OfflineReportRepo,
  OfflineDeliveryRepo,
  OfflinePaymentRepo,
  OfflineStoreReviewRepo,
  OfflineSystemConfigRepo,
} from "../../repositories/offline";
import { UIGE_MUNICIPALITIES, getBairrosByMunicipality } from "../utils";

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

describe("Regras de Negócio — Lojas, Denúncias, Planos, Uíge e Entregas", () => {
  beforeEach(() => {
    mockLocalStorage();
  });

  it("gera códigos legíveis únicos (LJ-0001, LJ-0002) e exige campos obrigatórios por tipo de loja", async () => {
    const storeRepo = new OfflineStoreRepo();

    await expect(
      storeRepo.create({
        ownerId: "u1",
        name: "Loja Sem Fachada",
        storeType: "loja_fixa",
        municipality: "Uíge",
        bairro: "Centro da Cidade",
        address: "Rua do Comércio",
        facadeImage: "",
      })
    ).rejects.toThrow(/Loja fixa exige/);

    await expect(
      storeRepo.create({
        ownerId: "u2",
        name: "Ambulante Sem BI",
        storeType: "vendedor_ambulante",
        municipality: "Uíge",
        phone: "923000000",
        biPhotoUrl: "",
      })
    ).rejects.toThrow(/Vendedor ambulante exige/);

    const s1 = await storeRepo.create({
      ownerId: "u1",
      name: "Loja Comercial Centro",
      storeType: "loja_fixa",
      municipality: "Uíge",
      bairro: "Centro da Cidade",
      address: "Rua 1",
      facadeImage: "data:image/jpeg;base64,abc",
      isApproved: true,
    });
    const s2 = await storeRepo.create({
      ownerId: "u2",
      name: "Vendedor João",
      storeType: "vendedor_ambulante",
      municipality: "Negage",
      bairro: "Centro do Negage",
      phone: "923111222",
      biPhotoUrl: "data:image/jpeg;base64,bi",
    });

    expect(s1.code).toBe("LJ-0001");
    expect(s2.code).toBe("LJ-0002");
    expect(s2.isApproved).toBe(false); // Vendedor ambulante só fica activo após aprovação admin
  });

  it("suspende loja automaticamente ao atingir o número configurado de denúncias", async () => {
    const storeRepo = new OfflineStoreRepo();
    const cfgRepo = new OfflineSystemConfigRepo();
    const reportRepo = new OfflineReportRepo();

    await cfgRepo.update({ autoSuspendReportsThreshold: 2 });
    const st = await storeRepo.create({
      ownerId: "u1",
      name: "Loja Alvo",
      storeType: "loja_fixa",
      municipality: "Uíge",
      bairro: "Catapa",
      address: "Rua 3",
      facadeImage: "fachada.jpg",
      isApproved: true,
    });

    await reportRepo.create({ reporterId: "c1", storeId: st.id, reason: "Produto defeituoso" });
    let fetched = await storeRepo.getById(st.id);
    expect(fetched?.isSuspended).toBe(false);

    await reportRepo.create({ reporterId: "c2", storeId: st.id, reason: "Não entregou" });
    fetched = await storeRepo.getById(st.id);
    expect(fetched?.isSuspended).toBe(true);
    expect(fetched?.reportsCount).toBe(2);
  });

  it("activa plano pago na confirmação do pagamento e reverte para Grátis quando expira", async () => {
    const storeRepo = new OfflineStoreRepo();
    const payRepo = new OfflinePaymentRepo();

    const st = await storeRepo.create({
      ownerId: "u1",
      name: "Loja VIP Teste",
      storeType: "loja_fixa",
      municipality: "Uíge",
      bairro: "Centro da Cidade",
      address: "Av. Principal",
      facadeImage: "fachada.jpg",
      isApproved: true,
    });

    const pay = await payRepo.create({
      sellerId: "u1",
      storeId: st.id,
      type: "plano",
      targetPlan: "vip",
      amountKz: 15000,
      method: "Multicaixa Express",
      proofUrl: "comprovativo.jpg",
    });

    await payRepo.review(pay.id, "confirmado");
    let updated = await storeRepo.getById(st.id);
    expect(updated?.planType).toBe("vip");
    expect(updated?.isVip).toBe(true);

    // Simular expiração
    await storeRepo.setPlan(st.id, "vip", -2);
    await storeRepo.getAll(true); // aplica expiração automática
    updated = await storeRepo.getById(st.id);
    expect(updated?.planType).toBe("gratis");
    expect(updated?.isVip).toBe(false);
  });

  it("cobra comissão da entrega apenas após validação com o código de 4 dígitos", async () => {
    const delRepo = new OfflineDeliveryRepo();

    const del = await delRepo.create({
      orderId: "ord_1",
      orderCode: "MU-UG-12345",
      storeId: "st_1",
      storeName: "Loja Kandemba",
      customerId: "c_1",
      deliveryAddress: "Bairro Popular, Uíge",
      deliveryFee: 2000,
      commissionPercent: 15,
    });

    expect(del.commissionCharged).toBe(false);
    expect(del.commissionAmount).toBe(0);

    await delRepo.accept(del.id, "ent_1", "Manuel");
    await delRepo.updateStatus(del.id, "Recolhido");
    await delRepo.updateStatus(del.id, "A caminho");

    const wrong = await delRepo.confirmWithCode(del.id, "0000");
    expect(wrong.ok).toBe(false);

    const ok = await delRepo.confirmWithCode(del.id, del.confirmationCode);
    expect(ok.ok).toBe(true);

    const [after] = await delRepo.getAll({ courierId: "ent_1" });
    expect(after.status).toBe("Entregue");
    expect(after.commissionCharged).toBe(true);
    expect(after.commissionAmount).toBe(300);
    expect(after.courierEarning).toBe(1700);
  });

  it("actualiza classificação média da loja após avaliações", async () => {
    const storeRepo = new OfflineStoreRepo();
    const reviewRepo = new OfflineStoreReviewRepo();

    const st = await storeRepo.create({
      ownerId: "u1",
      name: "Loja Estrelas",
      storeType: "loja_fixa",
      municipality: "Uíge",
      bairro: "Papá Simão",
      address: "Rua 2",
      facadeImage: "f.jpg",
      isApproved: true,
    });

    await reviewRepo.create({ storeId: st.id, userId: "c1", stars: 5, comment: "Óptimo" });
    await reviewRepo.create({ storeId: st.id, userId: "c2", stars: 3, comment: "Normal" });

    const updated = await storeRepo.getById(st.id);
    expect(updated?.rating).toBe(4);
    expect(updated?.reviewsCount).toBe(2);
  });

  it("fornece lista fechada de municípios e bairros exclusivos do Uíge", () => {
    expect(UIGE_MUNICIPALITIES).toContain("Uíge");
    expect(UIGE_MUNICIPALITIES).toContain("Negage");
    expect(UIGE_MUNICIPALITIES).not.toContain("Luanda");
    expect(getBairrosByMunicipality("Uíge").length).toBeGreaterThan(5);
  });
});
