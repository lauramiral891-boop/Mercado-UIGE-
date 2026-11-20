import { describe, it, expect, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import {
  OfflineOrderRepo,
  OfflineProductRepo,
  OfflineSystemConfigRepo,
  OfflineSystemEventRepo,
  OfflineAppErrorRepo,
} from "../offline";
import { saveProducts } from "../../lib/storage";
import { resetTelemetryRateLimits, sanitizeTelemetryText, allowTelemetryWrite } from "../../lib/observability";

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

const MIGRATION_PATH = path.resolve(
  import.meta.dirname,
  "../../../../../supabase/migrations/20250105_server_price_and_admin_field_locks.sql"
);
const MIGRATION_V6_PATH = path.resolve(
  import.meta.dirname,
  "../../../../../supabase/migrations/20250106_password_auth_media_and_paid_ads.sql"
);
const MIGRATION_V7_PATH = path.resolve(
  import.meta.dirname,
  "../../../../../supabase/migrations/20250107_ads_bottom_nav_and_video_20mb.sql"
);

/**
 * Simula em memória a lógica exacta dos triggers SQL da migração 20250105 para validar
 * comportamento de segurança (bloqueio de campos admin) e recálculo autoritativo no servidor.
 */
class ServerTriggerSimulator {
  private lojas = new Map<string, any>();
  private produtos = new Map<string, any>();
  private encomendas = new Map<string, any>();
  private itens = new Map<string, any[]>();
  private taxaEntregaPadrao = 1500;

  seedStore(store: {
    id: string;
    dono_id: string;
    is_aprovada: boolean;
    is_vip: boolean;
    suspensa: boolean;
    plano_tipo: "gratis" | "basico" | "vip";
  }) {
    this.lojas.set(store.id, { ...store });
  }

  seedProduct(prod: {
    id: string;
    loja_id: string;
    vendedor_id: string;
    nome: string;
    preco: number;
    is_aprovado: boolean;
    is_destaque: boolean;
  }) {
    this.produtos.set(prod.id, { ...prod });
  }

  updateStore(
    storeId: string,
    patch: Partial<{
      nome: string;
      is_aprovada: boolean;
      is_vip: boolean;
      suspensa: boolean;
      plano_tipo: "gratis" | "basico" | "vip";
    }>,
    actor: { role: "cliente" | "comerciante" | "admin"; isSystem?: boolean }
  ) {
    const old = this.lojas.get(storeId);
    if (!old) throw new Error("Loja não encontrada.");
    const next = { ...old, ...patch };

    if (actor.role !== "admin" && !actor.isSystem) {
      if (
        next.is_aprovada !== old.is_aprovada ||
        next.is_vip !== old.is_vip ||
        next.suspensa !== old.suspensa ||
        next.plano_tipo !== old.plano_tipo
      ) {
        throw new Error(
          "Operação não autorizada: só administradores podem alterar is_aprovada, is_vip, suspensa ou plano_tipo da loja."
        );
      }
    }

    this.lojas.set(storeId, next);
    return next;
  }

  insertProduct(
    prod: {
      id: string;
      loja_id: string;
      vendedor_id: string;
      nome: string;
      preco: number;
      is_aprovado?: boolean;
      is_destaque?: boolean;
    },
    actor: { role: "comerciante" | "admin" }
  ) {
    if (actor.role !== "admin") {
      if (prod.is_destaque) {
        throw new Error(
          "Operação não autorizada: só administradores podem activar is_destaque em produtos."
        );
      }
      const store = this.lojas.get(prod.loja_id);
      const forcedApproved = Boolean(store?.is_aprovada && !store?.suspensa);
      const saved = {
        ...prod,
        is_destaque: false,
        is_aprovado: forcedApproved,
      };
      this.produtos.set(prod.id, saved);
      return saved;
    }

    const saved = {
      ...prod,
      is_destaque: Boolean(prod.is_destaque),
      is_aprovado: prod.is_aprovado ?? true,
    };
    this.produtos.set(prod.id, saved);
    return saved;
  }

  updateProduct(
    prodId: string,
    patch: Partial<{ nome: string; preco: number; is_aprovado: boolean; is_destaque: boolean }>,
    actor: { role: "comerciante" | "admin"; isSystem?: boolean }
  ) {
    const old = this.produtos.get(prodId);
    if (!old) throw new Error("Produto não encontrado.");
    const next = { ...old, ...patch };

    if (actor.role !== "admin" && !actor.isSystem) {
      if (next.is_aprovado !== old.is_aprovado || next.is_destaque !== old.is_destaque) {
        throw new Error(
          "Operação não autorizada: só administradores podem alterar aprovação ou destaque de produtos."
        );
      }
    }

    this.produtos.set(prodId, next);
    return next;
  }

  createOrderWithItems(payload: {
    id: string;
    loja_id: string;
    tipo_entrega: "entrega" | "levantamento";
    tamperedSubtotal?: number;
    tamperedTotal?: number;
    tamperedDeliveryFee?: number;
    items: { produto_id: string; quantidade: number; tamperedUnitPrice?: number }[];
  }) {
    // 1. Trigger inicializar_encomenda_servidor: ignora subtotal/total/taxa do cliente
    const taxa = payload.tipo_entrega === "levantamento" ? 0 : this.taxaEntregaPadrao;
    const order = {
      id: payload.id,
      loja_id: payload.loja_id,
      tipo_entrega: payload.tipo_entrega,
      taxa_entrega: taxa,
      subtotal: 0,
      total: taxa,
      estado: "Pendente",
      estado_pagamento: "pendente",
    };
    this.encomendas.set(order.id, order);

    // 2. Trigger validar_preco_item_encomenda + recalcular_totais_encomenda
    const savedItems: any[] = [];
    for (const item of payload.items) {
      const prod = this.produtos.get(item.produto_id);
      if (!prod) throw new Error("Produto inexistente ou indisponível.");
      if (prod.loja_id !== order.loja_id) {
        throw new Error("Todos os itens da encomenda devem pertencer à loja da encomenda.");
      }
      if (item.quantidade <= 0) {
        throw new Error("Quantidade do item deve ser superior a zero.");
      }

      // Ignora tamperedUnitPrice do cliente e usa prod.preco actual do servidor
      savedItems.push({
        produto_id: item.produto_id,
        quantidade: item.quantidade,
        preco_unitario: prod.preco,
      });
    }

    this.itens.set(order.id, savedItems);
    const serverSubtotal = savedItems.reduce((sum, it) => sum + it.quantidade * it.preco_unitario, 0);
    const updatedOrder = {
      ...order,
      subtotal: serverSubtotal,
      total: serverSubtotal + taxa,
    };
    this.encomendas.set(order.id, updatedOrder);
    return { order: updatedOrder, items: savedItems };
  }

  directUpdateOrderTotals(
    orderId: string,
    patch: { subtotal?: number; total?: number; taxa_entrega?: number },
    actor: { role: "cliente" | "comerciante" | "admin" | "super_admin" | "moderador" | "financeiro"; isSystem?: boolean }
  ) {
    const old = this.encomendas.get(orderId);
    if (!old) throw new Error("Encomenda não encontrada.");
    const next = { ...old, ...patch };
    const isPrivileged = actor.role === "admin" || actor.role === "super_admin";
    if (!isPrivileged && !actor.isSystem) {
      if (
        next.subtotal !== old.subtotal ||
        next.total !== old.total ||
        next.taxa_entrega !== old.taxa_entrega
      ) {
        throw new Error(
          "Operação não autorizada: subtotal e total da encomenda são calculados exclusivamente no servidor."
        );
      }
    }
    this.encomendas.set(orderId, next);
    return next;
  }

  checkRolePermission(
    actorRole: "cliente" | "comerciante" | "entregador" | "moderador" | "financeiro" | "super_admin",
    action:
      | "approve_store"
      | "confirm_payment"
      | "change_role"
      | "toggle_maintenance"
      | "read_soc_events"
      | "read_app_errors"
  ) {
    const isSuper = actorRole === "super_admin";
    const isMod = isSuper || actorRole === "moderador";
    const isFin = isSuper || actorRole === "financeiro";

    if (action === "approve_store" && !isMod) {
      throw new Error("Apenas moderador ou super_admin pode aprovar lojas.");
    }
    if (action === "confirm_payment" && !isFin) {
      throw new Error("Apenas financeiro ou super_admin pode confirmar pagamentos.");
    }
    if ((action === "change_role" || action === "toggle_maintenance" || action === "read_soc_events" || action === "read_app_errors") && !isSuper) {
      throw new Error("Apenas super_admin tem acesso a esta operação.");
    }
    return true;
  }
}

describe("Migração 20250105 — Bloqueios Admin, Papéis de Equipa e Centro de Controlo", () => {
  beforeEach(() => {
    mockLocalStorage();
    resetTelemetryRateLimits();
  });

  it("1. Ficheiro SQL 20250105 define todos os triggers de bloqueio e cálculo no servidor", () => {
    const sql = fs.readFileSync(MIGRATION_PATH, "utf-8");

    // Bloqueio em lojas
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.proteger_e_gerar_codigo_loja()");
    expect(sql).toContain("CREATE TRIGGER trg_proteger_loja");
    expect(sql).toContain("NEW.is_aprovada IS DISTINCT FROM OLD.is_aprovada");
    expect(sql).toContain("NEW.is_vip IS DISTINCT FROM OLD.is_vip");
    expect(sql).toContain("NEW.suspensa IS DISTINCT FROM OLD.suspensa");
    expect(sql).toContain("NEW.plano_tipo IS DISTINCT FROM OLD.plano_tipo");

    // Bloqueio em produtos
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.proteger_campos_admin_produto()");
    expect(sql).toContain("CREATE TRIGGER trg_proteger_campos_admin_produto");
    expect(sql).toContain("NEW.is_aprovado IS DISTINCT FROM OLD.is_aprovado");
    expect(sql).toContain("NEW.is_destaque IS DISTINCT FROM OLD.is_destaque");

    // Cálculo autoritativo de encomendas
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.inicializar_encomenda_servidor()");
    expect(sql).toContain("CREATE TRIGGER trg_inicializar_encomenda_servidor");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.validar_preco_item_encomenda()");
    expect(sql).toContain("CREATE TRIGGER trg_validar_preco_item_encomenda");
    expect(sql).toContain("NEW.preco_unitario := v_preco_actual;");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.recalcular_totais_encomenda()");
    expect(sql).toContain("CREATE TRIGGER trg_recalcular_totais_encomenda");
    expect(sql).toContain("SUM(quantidade * preco_unitario)");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.proteger_totais_encomenda()");
    expect(sql).toContain("CREATE TRIGGER trg_proteger_totais_encomenda");
  });

  it("2. Bloqueia não-admin de alterar is_aprovada, is_vip, suspensa e plano_tipo em lojas, mas permite admin", () => {
    const db = new ServerTriggerSimulator();
    db.seedStore({
      id: "loja_1",
      dono_id: "seller_1",
      is_aprovada: false,
      is_vip: false,
      suspensa: false,
      plano_tipo: "gratis",
    });

    // Comerciante NÃO pode aprovar a loja, activar VIP, tirar suspensão ou mudar plano
    expect(() =>
      db.updateStore("loja_1", { is_aprovada: true }, { role: "comerciante" })
    ).toThrow(/só administradores/);

    expect(() =>
      db.updateStore("loja_1", { is_vip: true }, { role: "comerciante" })
    ).toThrow(/só administradores/);

    expect(() =>
      db.updateStore("loja_1", { suspensa: true }, { role: "comerciante" })
    ).toThrow(/só administradores/);

    expect(() =>
      db.updateStore("loja_1", { plano_tipo: "vip" }, { role: "comerciante" })
    ).toThrow(/só administradores/);

    // Comerciante pode alterar campos normais (ex: nome da loja)
    const renamed = db.updateStore("loja_1", { nome: "Casa do Café Uíge" }, { role: "comerciante" });
    expect(renamed.nome).toBe("Casa do Café Uíge");

    // Admin pode alterar qualquer um dos campos protegidos
    const approved = db.updateStore(
      "loja_1",
      { is_aprovada: true, is_vip: true, plano_tipo: "vip" },
      { role: "admin" }
    );
    expect(approved.is_aprovada).toBe(true);
    expect(approved.is_vip).toBe(true);
    expect(approved.plano_tipo).toBe("vip");
  });

  it("3. Bloqueia vendedor de definir is_destaque ou alterar is_aprovado/is_destaque em produtos, mas permite admin", () => {
    const db = new ServerTriggerSimulator();
    db.seedStore({
      id: "loja_1",
      dono_id: "seller_1",
      is_aprovada: true,
      is_vip: false,
      suspensa: false,
      plano_tipo: "gratis",
    });

    // Inserção com is_destaque = true por vendedor é bloqueada
    expect(() =>
      db.insertProduct(
        {
          id: "prod_1",
          loja_id: "loja_1",
          vendedor_id: "seller_1",
          nome: "Telefone X",
          preco: 120000,
          is_destaque: true,
        },
        { role: "comerciante" }
      )
    ).toThrow(/is_destaque/);

    // Inserção normal funciona
    const created = db.insertProduct(
      {
        id: "prod_1",
        loja_id: "loja_1",
        vendedor_id: "seller_1",
        nome: "Telefone X",
        preco: 120000,
      },
      { role: "comerciante" }
    );
    expect(created.is_destaque).toBe(false);
    expect(created.is_aprovado).toBe(true);

    // Vendedor NÃO pode alterar is_destaque nem is_aprovado no UPDATE
    expect(() =>
      db.updateProduct("prod_1", { is_destaque: true }, { role: "comerciante" })
    ).toThrow(/aprovação ou destaque/);

    expect(() =>
      db.updateProduct("prod_1", { is_aprovado: false }, { role: "comerciante" })
    ).toThrow(/aprovação ou destaque/);

    // Admin pode alterar is_destaque e is_aprovado
    const featured = db.updateProduct(
      "prod_1",
      { is_destaque: true, is_aprovado: true },
      { role: "admin" }
    );
    expect(featured.is_destaque).toBe(true);
  });

  it("4. Calcula subtotal e total da encomenda no servidor a partir do preço actual dos produtos, ignorando valores adulterados do cliente", () => {
    const db = new ServerTriggerSimulator();
    db.seedStore({
      id: "loja_1",
      dono_id: "seller_1",
      is_aprovada: true,
      is_vip: false,
      suspensa: false,
      plano_tipo: "gratis",
    });
    db.seedProduct({
      id: "prod_a",
      loja_id: "loja_1",
      vendedor_id: "seller_1",
      nome: "Saco de Café 5Kg",
      preco: 12000,
      is_aprovado: true,
      is_destaque: false,
    });
    db.seedProduct({
      id: "prod_b",
      loja_id: "loja_1",
      vendedor_id: "seller_1",
      nome: "Mel do Uíge 1L",
      preco: 4500,
      is_aprovado: true,
      is_destaque: false,
    });

    // Cliente malicioso tenta enviar preço unitário = 1 Kz, subtotal = 2 Kz, total = 2 Kz, taxa = 0
    const resEntrega = db.createOrderWithItems({
      id: "ord_1",
      loja_id: "loja_1",
      tipo_entrega: "entrega",
      tamperedSubtotal: 2,
      tamperedTotal: 2,
      tamperedDeliveryFee: 0,
      items: [
        { produto_id: "prod_a", quantidade: 2, tamperedUnitPrice: 1 }, // real: 2 * 12000 = 24000
        { produto_id: "prod_b", quantidade: 3, tamperedUnitPrice: 1 }, // real: 3 * 4500 = 13500
      ],
    });

    expect(resEntrega.items[0].preco_unitario).toBe(12000);
    expect(resEntrega.items[1].preco_unitario).toBe(4500);
    expect(resEntrega.order.subtotal).toBe(37500);
    expect(resEntrega.order.taxa_entrega).toBe(1500);
    expect(resEntrega.order.total).toBe(39000);

    // Tentativa directa de adulterar subtotal/total via UPDATE é bloqueada
    expect(() =>
      db.directUpdateOrderTotals("ord_1", { subtotal: 100, total: 100 }, { role: "cliente" })
    ).toThrow(/exclusivamente no servidor/);

    // Em levantamento na loja, taxa_entrega é 0 no servidor e total == subtotal
    const resLevantamento = db.createOrderWithItems({
      id: "ord_2",
      loja_id: "loja_1",
      tipo_entrega: "levantamento",
      tamperedDeliveryFee: 5000,
      items: [{ produto_id: "prod_b", quantidade: 2, tamperedUnitPrice: 10 }],
    });
    expect(resLevantamento.order.taxa_entrega).toBe(0);
    expect(resLevantamento.order.subtotal).toBe(9000);
    expect(resLevantamento.order.total).toBe(9000);
  });

  it("5. OfflineOrderRepo também calcula subtotal, taxa de entrega e total a partir dos produtos guardados e configuração do sistema", async () => {
    const productRepo = new OfflineProductRepo();
    const orderRepo = new OfflineOrderRepo();
    const cfgRepo = new OfflineSystemConfigRepo();

    await cfgRepo.update({ defaultDeliveryFee: 2000 });
    const prod = await productRepo.create({
      storeId: "loja_local_1",
      sellerId: "seller_local_1",
      name: "Fuba de Bombó 10Kg",
      price: 7500,
      stock: 10,
      whatsapp: "923000999",
      bairro: "Mbemba Ngango",
      image: "https://cdn.uige.ao/fuba.jpg",
    });
    saveProducts([prod]);

    // Tenta passar deliveryFee = 0 ou campos falsos em entrega ao domicílio
    const order = await orderRepo.create({
      userId: "buyer_local_1",
      storeId: "loja_local_1",
      items: [{ productId: prod.id, qty: 3 }],
      address: "Bairro Mbemba Ngango, Uíge",
      paymentMethod: "Multicaixa Express",
      deliveryType: "entrega",
      deliveryFee: 0, // deve ser ignorado em prol de defaultDeliveryFee = 2000
    });

    expect(order.subtotal).toBe(22500);
    expect(order.deliveryFee).toBe(2000);
    expect(order.total).toBe(24500);

    const pickupOrder = await orderRepo.create({
      userId: "buyer_local_1",
      storeId: "loja_local_1",
      items: [{ productId: prod.id, qty: 2 }],
      address: "Levantamento na loja",
      paymentMethod: "Multicaixa Express",
      deliveryType: "levantamento",
      deliveryFee: 9999, // deve ser forçado a 0 para levantamento
    });

    expect(pickupOrder.subtotal).toBe(15000);
    expect(pickupOrder.deliveryFee).toBe(0);
    expect(pickupOrder.total).toBe(15000);
  });

  it("6. FASE 0 SQL define papéis de equipa (super_admin, moderador, financeiro), RLS do Centro de Controlo e promoção de admin", () => {
    const sql = fs.readFileSync(MIGRATION_PATH, "utf-8");

    expect(sql).toContain("('cliente', 'comerciante', 'entregador', 'admin', 'super_admin', 'moderador', 'financeiro')");
    expect(sql).toContain("SET papel = 'super_admin'");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.is_super_admin()");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.is_moderator()");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.is_finance()");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.eventos_sistema");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.erros_app");
    expect(sql).toContain("ALTER TABLE public.eventos_sistema ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("ALTER TABLE public.erros_app ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.get_system_health_metrics()");
    expect(sql).toContain("CREATE TRIGGER trg_proteger_configuracoes_sistema");
  });

  it("7. Enforça permissões por papel: moderador vs financeiro vs super_admin", () => {
    const db = new ServerTriggerSimulator();

    // Moderador aprova lojas, mas não confirma pagamentos nem acede ao Centro de Controlo
    expect(db.checkRolePermission("moderador", "approve_store")).toBe(true);
    expect(() => db.checkRolePermission("moderador", "confirm_payment")).toThrow(/financeiro/);
    expect(() => db.checkRolePermission("moderador", "change_role")).toThrow(/super_admin/);
    expect(() => db.checkRolePermission("moderador", "read_soc_events")).toThrow(/super_admin/);

    // Financeiro confirma pagamentos, mas não aprova lojas nem altera manutenção/papéis
    expect(db.checkRolePermission("financeiro", "confirm_payment")).toBe(true);
    expect(() => db.checkRolePermission("financeiro", "approve_store")).toThrow(/moderador/);
    expect(() => db.checkRolePermission("financeiro", "toggle_maintenance")).toThrow(/super_admin/);
    expect(() => db.checkRolePermission("financeiro", "read_app_errors")).toThrow(/super_admin/);

    // Super Admin tem acesso total
    expect(db.checkRolePermission("super_admin", "approve_store")).toBe(true);
    expect(db.checkRolePermission("super_admin", "confirm_payment")).toBe(true);
    expect(db.checkRolePermission("super_admin", "change_role")).toBe(true);
    expect(db.checkRolePermission("super_admin", "toggle_maintenance")).toBe(true);
    expect(db.checkRolePermission("super_admin", "read_soc_events")).toBe(true);
    expect(db.checkRolePermission("super_admin", "read_app_errors")).toBe(true);
  });

  it("8. Sanitiza chaves/senhas/tokens antes de guardar em eventos_sistema e erros_app e agrupa erros por ecrã", async () => {
    const dirty = "Erro login password=segredo123 key=sb_secret_abcDEF999 token=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.xyz";
    const clean = sanitizeTelemetryText(dirty);
    expect(clean).not.toContain("segredo123");
    expect(clean).not.toContain("sb_secret_abcDEF999");
    expect(clean).not.toContain("eyJhbGciOiJIUzI1NiJ9");

    const eventRepo = new OfflineSystemEventRepo();
    await eventRepo.record({
      type: "LOGIN_FALHADO",
      severity: "aviso",
      userEmail: "teste@uige.ao",
      detail: dirty,
    });
    const events = await eventRepo.getAll();
    expect(events.length).toBe(1);
    expect(events[0].detail).not.toContain("segredo123");
    expect(events[0].detail).not.toContain("sb_secret_abcDEF999");

    const errRepo = new OfflineAppErrorRepo();
    await errRepo.report({ screen: "Encomendas", message: dirty, source: "api", durationMs: 410 });
    await errRepo.report({ screen: "Encomendas", message: dirty, source: "api", durationMs: 280 });
    const errors = await errRepo.getAll();
    expect(errors.length).toBe(1);
    expect(errors[0].count).toBe(2);
    expect(errors[0].screen).toBe("Encomendas");
    expect(errors[0].durationMs).toBe(280);
    expect(errors[0].message).not.toContain("sb_secret_");
  });

  it("9. Limite de taxa bloqueia spam de escrita na observabilidade e SOC", () => {
    for (let i = 0; i < 15; i++) {
      expect(allowTelemetryWrite("test:spam", 15, 100000 + i)).toBe(true);
    }
    expect(allowTelemetryWrite("test:spam", 15, 100020)).toBe(false);
    // Após 61 segundos volta a permitir
    expect(allowTelemetryWrite("test:spam", 15, 162000)).toBe(true);
  });

  it("10. Migração 20250106 reforça vídeo, moderação opcional de artigos, anúncios só para planos pagos e limite 5 MB", () => {
    const sqlV6 = fs.readFileSync(MIGRATION_V6_PATH, "utf-8");

    expect(sqlV6).toContain("ADD COLUMN IF NOT EXISTS video_url TEXT");
    expect(sqlV6).toContain("exigir_aprovacao_produtos BOOLEAN NOT NULL DEFAULT FALSE");
    expect(sqlV6).toContain("Comerciante aprovado ou Admin publica produtos");
    expect(sqlV6).toContain("CREATE OR REPLACE FUNCTION public.loja_tem_plano_pago_activo");
    expect(sqlV6).toContain("CREATE TRIGGER trg_proteger_anuncio_plano_pago");
    expect(sqlV6).toContain("Leitura de anúncios pagos ou próprios ou admin");
    expect(sqlV6).toContain("file_size_limit = 5242880");
    expect(sqlV6).toContain("video/mp4");
  });

  it("11. Migração 20250107 suporta anúncios plataforma/externo/loja, destinos seguros https://, pagamentos externos, Quero vender e Storage 20 MB", () => {
    const sqlV7 = fs.readFileSync(MIGRATION_V7_PATH, "utf-8");

    expect(sqlV7).toContain("ADD COLUMN IF NOT EXISTS tipo_anunciante");
    expect(sqlV7).toContain("ADD COLUMN IF NOT EXISTS nome_anunciante TEXT");
    expect(sqlV7).toContain("ADD COLUMN IF NOT EXISTS tipo_destino");
    expect(sqlV7).toContain("ADD COLUMN IF NOT EXISTS destino_valor TEXT");
    expect(sqlV7).toContain("CHECK (posicao IN ('topo', 'faixa', 'categoria', 'pesquisa', 'ecra_inteiro'))");
    expect(sqlV7).toContain("CREATE OR REPLACE FUNCTION public.is_safe_ad_destination");
    expect(sqlV7).toContain("^https://");
    expect(sqlV7).toContain("Leitura de anúncios pagos, plataforma, externos ou admin");
    expect(sqlV7).toContain("CHECK (tipo IN ('plano', 'anuncio', 'anuncio_externo'))");
    expect(sqlV7).toContain("CREATE OR REPLACE FUNCTION public.request_merchant_upgrade");
    expect(sqlV7).toContain("file_size_limit = 20971520");
  });
});
