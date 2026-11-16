import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  DEFAULT_SYSTEM_CONFIG,
  NocHistorySample,
  NocServiceCheck,
  Store,
  SystemEvent,
  SystemHealthMetrics,
  User,
} from "@mercado-uige/shared";
import {
  SUPABASE_FREE_LIMITS,
  appendNocHistorySample,
  classifySocRule,
  computeItomUsage,
  findSocBlockTargets,
  formatBytes,
} from "../lib/controlCenterHelpers";
import { ControlCenterSection } from "../components/ControlCenterSection";
import { AdminErrorBoundary } from "../components/AdminErrorBoundary";

const NOW = new Date("2026-06-15T12:00:00.000Z");

describe("FASE 2 — Centro de Controlo (NOC, SOC, ITOM, Observabilidade, Comando)", () => {
  it("calcula utilização ITOM e dispara avisos quando se aproxima do limite grátis Supabase", () => {
    const healthy: SystemHealthMetrics = {
      dbBytes: 25 * 1024 * 1024,
      storageBytes: 50 * 1024 * 1024,
      storageFiles: 120,
      totalUsers: 400,
      storesCount: 25,
      productsCount: 150,
      ordersCount: 90,
      pendingPayments: 1,
      openSecurityAlerts: 0,
      errorGroups: 0,
      collectedAt: NOW.toISOString(),
    };
    const healthyReport = computeItomUsage(healthy);
    expect(healthyReport.dbLevel).toBe("saudavel");
    expect(healthyReport.storageLevel).toBe("saudavel");
    expect(healthyReport.warnings).toHaveLength(0);
    expect(formatBytes(healthy.dbBytes)).toBe("25.00 MB");

    const nearLimit: SystemHealthMetrics = {
      ...healthy,
      dbBytes: Math.round(SUPABASE_FREE_LIMITS.dbBytes * 0.8),
      storageBytes: Math.round(SUPABASE_FREE_LIMITS.storageBytes * 0.92),
      pendingPayments: 8,
    };
    const warnReport = computeItomUsage(nearLimit);
    expect(warnReport.dbLevel).toBe("atencao");
    expect(warnReport.storageLevel).toBe("critico");
    expect(warnReport.warnings.length).toBeGreaterThanOrEqual(3);
  });

  it("actualiza o histórico NOC das últimas 24h e calcula estado global e latência média", () => {
    const old26h: NocHistorySample = {
      timestamp: new Date(NOW.getTime() - 26 * 3_600_000).toISOString(),
      overallStatus: "operacional",
      avgLatencyMs: 90,
      checks: { database: 80, auth: 90, storage: 100, site: 90 },
    };
    const recent1h: NocHistorySample = {
      timestamp: new Date(NOW.getTime() - 1 * 3_600_000).toISOString(),
      overallStatus: "operacional",
      avgLatencyMs: 110,
      checks: { database: 100, auth: 110, storage: 120, site: 110 },
    };

    const checks: NocServiceCheck[] = [
      { id: "database", label: "Base de Dados", status: "operacional", latencyMs: 60, detail: "OK", checkedAt: NOW.toISOString() },
      { id: "auth", label: "Login e OTP", status: "degradado", latencyMs: 1700, detail: "Lento", checkedAt: NOW.toISOString() },
      { id: "storage", label: "Storage de Fotos", status: "operacional", latencyMs: 120, detail: "OK", checkedAt: NOW.toISOString() },
      { id: "site", label: "Portal Web", status: "operacional", latencyMs: 40, detail: "OK", checkedAt: NOW.toISOString() },
    ];

    const updated = appendNocHistorySample([old26h, recent1h], checks, NOW);
    expect(updated).toHaveLength(2);
    expect(updated.some((s) => s.timestamp === old26h.timestamp)).toBe(false);
    expect(updated[1].overallStatus).toBe("degradado");
    expect(updated[1].avgLatencyMs).toBe(480);
    expect(updated[1].checks.auth).toBe(1700);
  });

  it("classifica regras SOC e localiza conta/loja alvo para bloqueio directo", () => {
    const ev: SystemEvent = {
      id: "ev-1",
      type: "TENTATIVA_ALTERAR_PAPEL",
      severity: "critica",
      userId: "u-suspect",
      userEmail: "suspeito@uige.ao",
      detail: "Tentativa na loja LJ-0042",
      resolved: false,
      createdAt: NOW.toISOString(),
    };

    const rule = classifySocRule(ev);
    expect(rule.category).toBe("Privilegios");

    const users: User[] = [
      {
        id: "u-suspect",
        code: "CL-0042",
        name: "Conta Suspeita",
        email: "suspeito@uige.ao",
        role: "comerciante",
        walletBalance: 0,
        createdAt: NOW.toISOString(),
      },
    ];
    const stores: Store[] = [
      {
        id: "st-42",
        code: "LJ-0042",
        ownerId: "u-suspect",
        name: "Banca Teste",
        description: "",
        category: "Moda",
        storeType: "loja_fixa",
        province: "Uíge",
        municipality: "Uíge",
        logo: "",
        isApproved: true,
        isVip: false,
        rating: 5,
        salesCount: 0,
        createdAt: NOW.toISOString(),
      },
    ];

    const targets = findSocBlockTargets(ev, users, stores);
    expect(targets.targetUser?.id).toBe("u-suspect");
    expect(targets.targetStore?.id).toBe("st-42");
  });

  it("bloqueia acesso ao Centro de Controlo para moderadores e renderiza Centro de Comando para super_admin", () => {
    const moderator: User = {
      id: "mod-1",
      name: "Moderador Uíge",
      email: "mod@uige.ao",
      role: "moderador",
      walletBalance: 0,
      createdAt: NOW.toISOString(),
    };
    const superAdmin: User = {
      ...moderator,
      id: "sa-1",
      name: "Super Admin",
      email: "tvvibeoficial@gmail.com",
      role: "super_admin",
    };

    const baseProps = {
      systemConfig: DEFAULT_SYSTEM_CONFIG,
      nocChecks: [
        { id: "database" as const, label: "Base de Dados", status: "operacional" as const, latencyMs: 42, detail: "OK", checkedAt: NOW.toISOString() },
        { id: "auth" as const, label: "Login e OTP", status: "operacional" as const, latencyMs: 65, detail: "OK", checkedAt: NOW.toISOString() },
        { id: "storage" as const, label: "Storage de Fotos", status: "operacional" as const, latencyMs: 88, detail: "OK", checkedAt: NOW.toISOString() },
        { id: "site" as const, label: "Portal Web", status: "operacional" as const, latencyMs: 19, detail: "OK", checkedAt: NOW.toISOString() },
      ],
      nocHistory: [],
      nocRunning: false,
      systemEvents: [],
      metrics: {
        dbBytes: 1024,
        storageBytes: 2048,
        storageFiles: 3,
        totalUsers: 12,
        storesCount: 4,
        productsCount: 18,
        ordersCount: 7,
        pendingPayments: 0,
        openSecurityAlerts: 0,
        errorGroups: 0,
        collectedAt: NOW.toISOString(),
      },
      appErrors: [],
      operationTimings: [],
      users: [superAdmin],
      stores: [],
      onRunNocChecks: async () => {},
      onRefreshMetrics: async () => {},
      onRequestToggleMaintenance: () => {},
      onResolveSystemEvent: () => {},
      onBlockUserFromSoc: () => {},
      onSuspendStoreFromSoc: () => {},
      onRequestClearAppErrors: () => {},
    };

    const modHtml = renderToStaticMarkup(
      React.createElement(ControlCenterSection, { ...baseProps, currentUser: moderator })
    );
    expect(modHtml).toContain("Acesso Restrito ao Super Admin");
    expect(modHtml).not.toContain("Interruptor de Modo de Manutenção");

    const saHtml = renderToStaticMarkup(
      React.createElement(ControlCenterSection, { ...baseProps, currentUser: superAdmin })
    );
    expect(saHtml).toContain("Interruptor de Modo de Manutenção");
    expect(saHtml).toContain("Base de Dados");
    expect(saHtml).toContain("42 ms");
  });

  it("renderiza AdminErrorBoundary sem erros", () => {
    const html = renderToStaticMarkup(
      React.createElement(AdminErrorBoundary, null, React.createElement("div", null, "Painel Seguro"))
    );
    expect(html).toContain("Painel Seguro");
  });
});
