import {
  NocHistorySample,
  NocServiceCheck,
  Store,
  SystemEvent,
  SystemHealthMetrics,
  User,
} from "@mercado-uige/shared";

export const SUPABASE_FREE_LIMITS = {
  dbBytes: 500 * 1024 * 1024, // 500 MB
  storageBytes: 1024 * 1024 * 1024, // 1 GB
  users: 50_000, // 50k MAU
};

export interface OperationTiming {
  id: string;
  operation: string;
  durationMs: number;
  ok: boolean;
  recordedAt: string;
}

export type ThresholdLevel = "saudavel" | "atencao" | "critico";

export interface ItomUsageReport {
  dbPercent: number;
  storagePercent: number;
  usersPercent: number;
  dbLevel: ThresholdLevel;
  storageLevel: ThresholdLevel;
  usersLevel: ThresholdLevel;
  warnings: string[];
}

export function formatBytes(bytes: number): string {
  const safe = Math.max(0, Number(bytes || 0));
  if (safe < 1024) return `${safe} B`;
  if (safe < 1024 * 1024) return `${(safe / 1024).toFixed(1)} KB`;
  if (safe < 1024 * 1024 * 1024) return `${(safe / (1024 * 1024)).toFixed(2)} MB`;
  return `${(safe / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function getLevel(pct: number): ThresholdLevel {
  if (pct >= 90) return "critico";
  if (pct >= 75) return "atencao";
  return "saudavel";
}

export function computeItomUsage(metrics: SystemHealthMetrics): ItomUsageReport {
  const dbPercent = Math.min(100, Math.round((Math.max(0, metrics.dbBytes) / SUPABASE_FREE_LIMITS.dbBytes) * 1000) / 10);
  const storagePercent = Math.min(
    100,
    Math.round((Math.max(0, metrics.storageBytes) / SUPABASE_FREE_LIMITS.storageBytes) * 1000) / 10
  );
  const usersPercent = Math.min(
    100,
    Math.round((Math.max(0, metrics.totalUsers) / SUPABASE_FREE_LIMITS.users) * 1000) / 10
  );

  const dbLevel = getLevel(dbPercent);
  const storageLevel = getLevel(storagePercent);
  const usersLevel = getLevel(usersPercent);

  const warnings: string[] = [];
  if (dbLevel !== "saudavel") {
    warnings.push(
      `Base de dados a ${dbPercent}% do limite grátis de 500 MB (${formatBytes(metrics.dbBytes)} usados).`
    );
  }
  if (storageLevel !== "saudavel") {
    warnings.push(
      `Storage de fotos a ${storagePercent}% do limite grátis de 1 GB (${metrics.storageFiles} ficheiros).`
    );
  }
  if (usersLevel !== "saudavel") {
    warnings.push(
      `Utilizadores activos a ${usersPercent}% do limite grátis de 50.000 MAU (${metrics.totalUsers} contas).`
    );
  }
  if (metrics.pendingPayments > 5) {
    warnings.push(`${metrics.pendingPayments} comprovativos de pagamento pendentes aguardam validação.`);
  }

  return {
    dbPercent,
    storagePercent,
    usersPercent,
    dbLevel,
    storageLevel,
    usersLevel,
    warnings,
  };
}

export function appendNocHistorySample(
  existing: NocHistorySample[],
  checks: NocServiceCheck[],
  now = new Date()
): NocHistorySample[] {
  const cutoffMs = now.getTime() - 24 * 3_600_000;
  const recent = existing.filter((s) => {
    const t = new Date(s.timestamp).getTime();
    return !Number.isNaN(t) && t >= cutoffMs;
  });

  const overallStatus: NocHistorySample["overallStatus"] = checks.some((c) => c.status === "indisponivel")
    ? "indisponivel"
    : checks.some((c) => c.status === "degradado")
    ? "degradado"
    : "operacional";

  const avgLatencyMs =
    checks.length > 0
      ? Math.round(checks.reduce((sum, c) => sum + Number(c.latencyMs || 0), 0) / checks.length)
      : 0;

  const checkMap: Record<NocServiceCheck["id"], number> = {
    database: 0,
    auth: 0,
    storage: 0,
    site: 0,
  };
  for (const c of checks) {
    checkMap[c.id] = c.latencyMs;
  }

  const nextSample: NocHistorySample = {
    timestamp: now.toISOString(),
    overallStatus,
    avgLatencyMs,
    checks: checkMap,
  };

  return [...recent, nextSample].slice(-96);
}

export function classifySocRule(event: Pick<SystemEvent, "type" | "severity">): {
  ruleName: string;
  category: "Autenticação" | "Privilegios" | "Encomendas" | "Moderação" | "Sistema";
} {
  const t = (event.type || "").toUpperCase();
  if (t.includes("LOGIN") || t.includes("OTP")) {
    return {
      ruleName: t.includes("EXCESSO") ? "Regra: Abuso de pedidos OTP" : "Regra: Falha de autenticação",
      category: "Autenticação",
    };
  }
  if (t.includes("PAPEL") || t.includes("ROLE") || t.includes("NAO_AUTORIZADO")) {
    return {
      ruleName: "Regra: Tentativa de escalada de privilégios",
      category: "Privilegios",
    };
  }
  if (t.includes("ENCOMENDA")) {
    return {
      ruleName: "Regra: Volume ou montante anormal de encomenda",
      category: "Encomendas",
    };
  }
  if (t.includes("SUSPENSAO") || t.includes("APROVACAO") || t.includes("DENUNCIA") || t.includes("MANUTENCAO")) {
    return {
      ruleName: "Regra: Acção crítica de governação",
      category: "Moderação",
    };
  }
  return {
    ruleName: `Regra: ${event.type}`,
    category: "Sistema",
  };
}

export function findSocBlockTargets(
  event: SystemEvent,
  users: User[],
  stores: Store[]
): { targetUser?: User; targetStore?: Store } {
  const emailLower = (event.userEmail || "").trim().toLowerCase();
  const detailLower = (event.detail || "").toLowerCase();

  const targetUser =
    users.find((u) => (event.userId && u.id === event.userId) || (emailLower && u.email.toLowerCase() === emailLower)) ||
    undefined;

  let targetStore = targetUser ? stores.find((s) => s.ownerId === targetUser.id) : undefined;
  if (!targetStore && detailLower) {
    targetStore = stores.find(
      (s) =>
        (s.code && detailLower.includes(s.code.toLowerCase())) ||
        (s.name.length >= 4 && detailLower.includes(s.name.toLowerCase()))
    );
  }

  return { targetUser, targetStore };
}
