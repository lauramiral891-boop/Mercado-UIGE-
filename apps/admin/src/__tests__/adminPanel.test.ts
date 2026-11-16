import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  buildCsvContent,
  buildDirectWhatsappHref,
  buildLast7DaysStats,
  canAccessAdminSection,
  collectAttentionQueue,
  computeMonthlyCommissionsKz,
  computeTodayOrdersCount,
} from "../lib/adminHelpers";
import { AdminApp } from "../App";
import {
  CourierMonthlyFee,
  DeliveryRecord,
  MerchantPayment,
  Order,
  ReportItem,
  Store,
  User,
} from "@mercado-uige/shared";

const NOW = new Date("2026-06-15T12:00:00.000Z");
const OLD_30H = new Date(NOW.getTime() - 30 * 3_600_000).toISOString();
const FRESH_2H = new Date(NOW.getTime() - 2 * 3_600_000).toISOString();

describe("FASE 1 — Painel Admin Profissional", () => {
  it("aplica permissões de secção por papel (super_admin, moderador, financeiro, cliente)", () => {
    expect(canAccessAdminSection("super_admin", "controlo")).toBe(true);
    expect(canAccessAdminSection("super_admin", "pagamentos")).toBe(true);
    expect(canAccessAdminSection("super_admin", "aprovacoes")).toBe(true);

    expect(canAccessAdminSection("moderador", "aprovacoes")).toBe(true);
    expect(canAccessAdminSection("moderador", "lojas")).toBe(true);
    expect(canAccessAdminSection("moderador", "denuncias")).toBe(true);
    expect(canAccessAdminSection("moderador", "pagamentos")).toBe(false);
    expect(canAccessAdminSection("moderador", "controlo")).toBe(false);

    expect(canAccessAdminSection("financeiro", "pagamentos")).toBe(true);
    expect(canAccessAdminSection("financeiro", "configuracoes")).toBe(true);
    expect(canAccessAdminSection("financeiro", "aprovacoes")).toBe(false);
    expect(canAccessAdminSection("financeiro", "controlo")).toBe(false);

    expect(canAccessAdminSection("cliente", "resumo")).toBe(false);
    expect(canAccessAdminSection("comerciante", "controlo")).toBe(false);
  });

  it("identifica apenas itens parados há mais de 24h na lista 'Precisa de atenção'", () => {
    const stores: Store[] = [
      {
        id: "st-old",
        code: "LJ-0001",
        ownerId: "u1",
        name: "Loja Antiga",
        description: "",
        category: "Moda",
        storeType: "loja_fixa",
        province: "Uíge",
        municipality: "Uíge",
        logo: "",
        isApproved: false,
        isVip: false,
        rating: 5,
        salesCount: 0,
        createdAt: OLD_30H,
      },
      {
        id: "st-fresh",
        code: "LJ-0002",
        ownerId: "u2",
        name: "Loja Recente",
        description: "",
        category: "Moda",
        storeType: "loja_fixa",
        province: "Uíge",
        municipality: "Uíge",
        logo: "",
        isApproved: false,
        isVip: false,
        rating: 5,
        salesCount: 0,
        createdAt: FRESH_2H,
      },
    ];

    const users: User[] = [
      {
        id: "u-courier",
        code: "CL-0010",
        name: "Mateus Entregador",
        email: "m@uige.ao",
        role: "entregador",
        walletBalance: 0,
        isApproved: false,
        createdAt: OLD_30H,
      },
    ];

    const payments: MerchantPayment[] = [
      {
        id: "pay-1",
        sellerId: "u1",
        storeName: "Loja Antiga",
        type: "plano",
        targetPlan: "vip",
        amountKz: 15000,
        method: "Multicaixa Express",
        proofUrl: "https://example.com/proof.jpg",
        status: "pendente",
        createdAt: OLD_30H,
      },
    ];

    const fees: CourierMonthlyFee[] = [];
    const reports: ReportItem[] = [];
    const orders: Order[] = [
      {
        id: "ord-late",
        code: "MU-UG-999",
        userId: "u3",
        storeName: "Loja Antiga",
        status: "Pendente",
        items: [],
        subtotal: 5000,
        deliveryFee: 1500,
        total: 6500,
        address: "Centro",
        paymentMethod: "Multicaixa Express",
        createdAt: OLD_30H,
      },
    ];
    const deliveries: DeliveryRecord[] = [];

    const queue = collectAttentionQueue(
      { stores, users, payments, courierFees: fees, reports, orders, deliveries },
      NOW.getTime()
    );

    expect(queue.some((q) => q.id === "att_store_st-old")).toBe(true);
    expect(queue.some((q) => q.id === "att_store_st-fresh")).toBe(false);
    expect(queue.some((q) => q.id === "att_user_u-courier")).toBe(true);
    expect(queue.some((q) => q.id === "att_pay_pay-1")).toBe(true);
    expect(queue.some((q) => q.id === "att_ord_ord-late")).toBe(true);
  });

  it("calcula encomendas de hoje, comissões do mês e série de 7 dias correctamente", () => {
    const orders: Order[] = [
      {
        id: "o1",
        code: "MU-1",
        userId: "u1",
        status: "Confirmada",
        items: [],
        subtotal: 10000,
        deliveryFee: 1500,
        total: 11500,
        address: "Uíge",
        paymentMethod: "Dinheiro",
        createdAt: "2026-06-15T09:30:00.000Z",
      },
      {
        id: "o2",
        code: "MU-2",
        userId: "u1",
        status: "Cancelada",
        items: [],
        subtotal: 8000,
        deliveryFee: 0,
        total: 8000,
        address: "Uíge",
        paymentMethod: "Dinheiro",
        createdAt: "2026-06-15T10:30:00.000Z",
      },
    ];

    const deliveries: DeliveryRecord[] = [
      {
        id: "d1",
        orderId: "o1",
        customerId: "u1",
        status: "Entregue",
        confirmationCode: "1234",
        deliveryFee: 2000,
        commissionPercent: 15,
        commissionAmount: 300,
        courierEarning: 1700,
        commissionCharged: true,
        deliveryAddress: "Uíge",
        hasDelay: false,
        deliveredAt: "2026-06-15T11:00:00.000Z",
        createdAt: "2026-06-15T09:40:00.000Z",
      },
      {
        id: "d-other-month",
        orderId: "o0",
        customerId: "u1",
        status: "Entregue",
        confirmationCode: "5678",
        deliveryFee: 2000,
        commissionPercent: 15,
        commissionAmount: 500,
        courierEarning: 1500,
        commissionCharged: true,
        deliveryAddress: "Uíge",
        hasDelay: false,
        deliveredAt: "2026-05-20T11:00:00.000Z",
        createdAt: "2026-05-20T10:00:00.000Z",
      },
    ];

    expect(computeTodayOrdersCount(orders, NOW)).toBe(2);
    expect(computeMonthlyCommissionsKz(deliveries, NOW)).toBe(300);

    const chart = buildLast7DaysStats(orders, deliveries, NOW);
    expect(chart).toHaveLength(7);
    const todayBar = chart[chart.length - 1];
    expect(todayBar.ordersCount).toBe(1); // exclui cancelada
    expect(todayBar.revenueKz).toBe(11500);
    expect(todayBar.commissionsKz).toBe(300);
  });

  it("gera CSV com BOM UTF-8, escaping de aspas e protecção contra fórmula", () => {
    const csv = buildCsvContent(
      ["Código", "Nome", "Nota"],
      [["LJ-0001", 'Loja "Uíge", Lda', "=CMD|'/C calc'!A0"]]
    );
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('"Loja ""Uíge"", Lda"');
    expect(csv).toContain("'=CMD|'/C calc'!A0");
  });

  it("constrói links directos de WhatsApp normalizados para Angola (+244)", () => {
    const href = buildDirectWhatsappHref("945379003", "Olá loja");
    expect(href).toBe("https://wa.me/244945379003?text=Ol%C3%A1%20loja");
    expect(buildDirectWhatsappHref("")).toBeNull();
  });

  it("renderiza o ecrã de autenticação administrativa sem erros", () => {
    const html = renderToStaticMarkup(React.createElement(AdminApp));
    expect(html).toContain("Mercado");
    expect(html).toContain("Enviar Código de Acesso");
  });
});
