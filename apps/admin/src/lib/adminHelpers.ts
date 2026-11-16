import {
  User,
  Store,
  Order,
  MerchantPayment,
  CourierMonthlyFee,
  ReportItem,
  DeliveryRecord,
  isSuperAdminRole,
  isModeratorRole,
  isFinanceRole,
  isAnyAdminRole,
  normalizeAngolanPhone,
  fmtKz,
} from "@mercado-uige/shared";

export type AdminSection =
  | "resumo"
  | "aprovacoes"
  | "lojas"
  | "utilizadores"
  | "encomendas"
  | "pagamentos"
  | "anuncios"
  | "entregas"
  | "denuncias"
  | "configuracoes"
  | "auditoria"
  | "controlo";

export interface AttentionItem {
  id: string;
  kind: "loja" | "conta" | "pagamento" | "mensalidade" | "denuncia" | "encomenda" | "entrega";
  title: string;
  subtitle: string;
  hoursStalled: number;
  createdAt: string;
  targetSection: AdminSection;
}

export interface DailyOrderStat {
  dateKey: string;
  label: string;
  ordersCount: number;
  revenueKz: number;
  commissionsKz: number;
}

export function canAccessAdminSection(role: string | undefined | null, section: AdminSection): boolean {
  if (!isAnyAdminRole(role)) return false;
  if (section === "controlo") return isSuperAdminRole(role);
  if (section === "resumo" || section === "auditoria" || section === "encomendas" || section === "entregas") {
    return true;
  }
  if (section === "aprovacoes" || section === "lojas" || section === "utilizadores" || section === "denuncias" || section === "anuncios") {
    return isModeratorRole(role);
  }
  if (section === "pagamentos" || section === "configuracoes") {
    return isFinanceRole(role);
  }
  return false;
}

export function hoursSince(isoDate?: string | null, nowMs = Date.now()): number {
  if (!isoDate) return 0;
  const ts = new Date(isoDate).getTime();
  if (Number.isNaN(ts)) return 0;
  return Math.max(0, Math.floor((nowMs - ts) / 3_600_000));
}

export function isStalledOver24h(isoDate?: string | null, nowMs = Date.now()): boolean {
  return hoursSince(isoDate, nowMs) >= 24;
}

export function computeMonthlyCommissionsKz(deliveries: DeliveryRecord[], now = new Date()): number {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  return deliveries.reduce((sum, d) => {
    if (!d.commissionCharged && d.status !== "Entregue") return sum;
    const refDate = new Date(d.deliveredAt || d.createdAt);
    if (Number.isNaN(refDate.getTime())) return sum;
    if (refDate.getUTCFullYear() === year && refDate.getUTCMonth() === month) {
      return sum + Number(d.commissionAmount || 0);
    }
    return sum;
  }, 0);
}

export function computeTodayOrdersCount(orders: Order[], now = new Date()): number {
  const todayKey = now.toISOString().slice(0, 10);
  return orders.filter((o) => String(o.createdAt || "").slice(0, 10) === todayKey).length;
}

export function buildLast7DaysStats(
  orders: Order[],
  deliveries: DeliveryRecord[],
  now = new Date()
): DailyOrderStat[] {
  const days: DailyOrderStat[] = [];
  const weekdayFormatter = new Intl.DateTimeFormat("pt-AO", { weekday: "short", timeZone: "UTC" });

  for (let offset = 6; offset >= 0; offset--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - offset));
    const dateKey = d.toISOString().slice(0, 10);
    const label = `${weekdayFormatter.format(d).replace(".", "")} ${String(d.getUTCDate()).padStart(2, "0")}`;

    const dayOrders = orders.filter(
      (o) => String(o.createdAt || "").slice(0, 10) === dateKey && o.status !== "Cancelada"
    );
    const dayCommissions = deliveries
      .filter((del) => (del.commissionCharged || del.status === "Entregue") && String(del.deliveredAt || del.createdAt).slice(0, 10) === dateKey)
      .reduce((s, del) => s + Number(del.commissionAmount || 0), 0);

    days.push({
      dateKey,
      label,
      ordersCount: dayOrders.length,
      revenueKz: dayOrders.reduce((s, o) => s + Number(o.total || 0), 0),
      commissionsKz: dayCommissions,
    });
  }

  return days;
}

export function collectAttentionQueue(
  params: {
    stores: Store[];
    users: User[];
    payments: MerchantPayment[];
    courierFees: CourierMonthlyFee[];
    reports: ReportItem[];
    orders: Order[];
    deliveries: DeliveryRecord[];
  },
  nowMs = Date.now()
): AttentionItem[] {
  const items: AttentionItem[] = [];

  for (const s of params.stores) {
    if (!s.isApproved && s.approvalStatus !== "rejeitado" && isStalledOver24h(s.createdAt, nowMs)) {
      items.push({
        id: `att_store_${s.id}`,
        kind: "loja",
        title: `Loja pendente: ${s.name} (${s.code || "LJ"})`,
        subtitle: `À espera de moderação há ${hoursSince(s.createdAt, nowMs)}h`,
        hoursStalled: hoursSince(s.createdAt, nowMs),
        createdAt: s.createdAt,
        targetSection: "aprovacoes",
      });
    }
  }

  for (const u of params.users) {
    if (u.isApproved === false && u.role !== "cliente" && u.approvalStatus !== "rejeitado" && isStalledOver24h(u.createdAt, nowMs)) {
      items.push({
        id: `att_user_${u.id}`,
        kind: "conta",
        title: `Conta ${u.role} pendente: ${u.name}`,
        subtitle: `${u.code || "CL"} parado há ${hoursSince(u.createdAt, nowMs)}h`,
        hoursStalled: hoursSince(u.createdAt, nowMs),
        createdAt: u.createdAt,
        targetSection: "aprovacoes",
      });
    }
  }

  for (const p of params.payments) {
    if (p.status === "pendente" && isStalledOver24h(p.createdAt, nowMs)) {
      items.push({
        id: `att_pay_${p.id}`,
        kind: "pagamento",
        title: `Comprovativo por confirmar: ${p.storeName || p.sellerName || "Comerciante"}`,
        subtitle: `${fmtKz(p.amountKz)} parado há ${hoursSince(p.createdAt, nowMs)}h`,
        hoursStalled: hoursSince(p.createdAt, nowMs),
        createdAt: p.createdAt,
        targetSection: "pagamentos",
      });
    }
  }

  for (const f of params.courierFees) {
    if (f.status === "pendente" && isStalledOver24h(f.createdAt, nowMs)) {
      items.push({
        id: `att_fee_${f.id}`,
        kind: "mensalidade",
        title: `Mensalidade por validar: ${f.courierName || "Entregador"}`,
        subtitle: `${f.referenceMonth} · ${fmtKz(f.amountKz)} há ${hoursSince(f.createdAt, nowMs)}h`,
        hoursStalled: hoursSince(f.createdAt, nowMs),
        createdAt: f.createdAt,
        targetSection: "entregas",
      });
    }
  }

  for (const r of params.reports) {
    if (r.status === "pendente" && isStalledOver24h(r.createdAt, nowMs)) {
      items.push({
        id: `att_rep_${r.id}`,
        kind: "denuncia",
        title: `Denúncia aberta: ${r.storeName || r.productName || "Relato"}`,
        subtitle: `Sem resolução há ${hoursSince(r.createdAt, nowMs)}h`,
        hoursStalled: hoursSince(r.createdAt, nowMs),
        createdAt: r.createdAt,
        targetSection: "denuncias",
      });
    }
  }

  for (const o of params.orders) {
    if ((o.status === "Pendente" || o.status === "Confirmada") && isStalledOver24h(o.createdAt, nowMs)) {
      items.push({
        id: `att_ord_${o.id}`,
        kind: "encomenda",
        title: `Encomenda atrasada: #${o.code}`,
        subtitle: `${o.storeName || "Loja"} · em "${o.status}" há ${hoursSince(o.createdAt, nowMs)}h`,
        hoursStalled: hoursSince(o.createdAt, nowMs),
        createdAt: o.createdAt,
        targetSection: "encomendas",
      });
    }
  }

  for (const d of params.deliveries) {
    if (
      d.status !== "Entregue" &&
      (d.hasDelay || d.status === "Com problema" || isStalledOver24h(d.createdAt, nowMs))
    ) {
      items.push({
        id: `att_del_${d.id}`,
        kind: "entrega",
        title: `Entrega com alerta: #${d.orderCode || d.orderId.slice(0, 6)}`,
        subtitle: d.issueDescription || `Parada em "${d.status}" há ${hoursSince(d.createdAt, nowMs)}h`,
        hoursStalled: Math.max(24, hoursSince(d.createdAt, nowMs)),
        createdAt: d.createdAt,
        targetSection: "entregas",
      });
    }
  }

  return items.sort((a, b) => b.hoursStalled - a.hoursStalled);
}

export function buildCsvContent(headers: string[], rows: (string | number | boolean | null | undefined)[][]): string {
  const escapeCell = (val: string | number | boolean | null | undefined): string => {
    const raw = val === null || val === undefined ? "" : String(val);
    const neutralized = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
    if (/[",\n\r;]/.test(neutralized)) {
      return `"${neutralized.replace(/"/g, '""')}"`;
    }
    return neutralized;
  };

  const lines = [headers.map(escapeCell).join(","), ...rows.map((r) => r.map(escapeCell).join(","))];
  return `\uFEFF${lines.join("\r\n")}`;
}

export function downloadCsv(
  filename: string,
  headers: string[],
  rows: (string | number | boolean | null | undefined)[][]
): void {
  const csv = buildCsvContent(headers, rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function buildDirectWhatsappHref(phone?: string | null, prefillText?: string): string | null {
  const digits = normalizeAngolanPhone(phone);
  if (!digits) return null;
  if (!prefillText) return `https://wa.me/${digits}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(prefillText.slice(0, 1400))}`;
}
