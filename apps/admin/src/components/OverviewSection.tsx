import React, { useMemo, useState } from "react";
import {
  ShoppingBag,
  Coins,
  Store as StoreIcon,
  CreditCard,
  AlertTriangle,
  Truck,
  Clock,
  ArrowUpRight,
  Megaphone,
  Package,
  Trash2,
} from "lucide-react";
import {
  User,
  Store,
  Product,
  Order,
  ReportItem,
  MerchantPayment,
  CourierMonthlyFee,
  DeliveryRecord,
  fmtKz,
  isModeratorRole,
} from "@mercado-uige/shared";
import {
  AdminSection,
  buildLast7DaysStats,
  collectAttentionQueue,
  computeMonthlyCommissionsKz,
  computeTodayOrdersCount,
} from "../lib/adminHelpers";

interface OverviewSectionProps {
  currentUser: User;
  users: User[];
  stores: Store[];
  products: Product[];
  orders: Order[];
  reports: ReportItem[];
  payments: MerchantPayment[];
  courierFees: CourierMonthlyFee[];
  deliveries: DeliveryRecord[];
  onNavigate: (section: AdminSection) => void;
  onSendBroadcast: (title: string, body: string) => Promise<void>;
  onRequestDeleteProduct: (product: Product) => void;
}

export const OverviewSection: React.FC<OverviewSectionProps> = ({
  currentUser,
  users,
  stores,
  products,
  orders,
  reports,
  payments,
  courierFees,
  deliveries,
  onNavigate,
  onSendBroadcast,
  onRequestDeleteProduct,
}) => {
  const [broadcastTitle, setBroadcastTitle] = useState("");
  const [broadcastBody, setBroadcastBody] = useState("");
  const [sendingBroadcast, setSendingBroadcast] = useState(false);

  const canModerate = isModeratorRole(currentUser.role);

  const kpis = useMemo(() => {
    const ordersToday = computeTodayOrdersCount(orders);
    const monthlyCommissions = computeMonthlyCommissionsKz(deliveries);
    const pendingStores = stores.filter((s) => !s.isApproved && s.approvalStatus !== "rejeitado").length;
    const pendingProofs =
      payments.filter((p) => p.status === "pendente").length +
      courierFees.filter((f) => f.status === "pendente").length;
    const openReports = reports.filter((r) => r.status === "pendente").length;
    const delayedDeliveries = deliveries.filter(
      (d) => d.status !== "Entregue" && (d.hasDelay || d.status === "Com problema")
    ).length;

    return {
      ordersToday,
      monthlyCommissions,
      pendingStores,
      pendingProofs,
      openReports,
      delayedDeliveries,
    };
  }, [orders, deliveries, stores, payments, courierFees, reports]);

  const chartStats = useMemo(() => buildLast7DaysStats(orders, deliveries), [orders, deliveries]);
  const attentionQueue = useMemo(
    () =>
      collectAttentionQueue({
        stores,
        users,
        payments,
        courierFees,
        reports,
        orders,
        deliveries,
      }),
    [stores, users, payments, courierFees, reports, orders, deliveries]
  );

  const maxOrders = Math.max(1, ...chartStats.map((d) => d.ordersCount));
  const maxRevenue = Math.max(1, ...chartStats.map((d) => d.revenueKz));

  const handleBroadcastSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastTitle.trim() || !broadcastBody.trim()) return;
    setSendingBroadcast(true);
    try {
      await onSendBroadcast(broadcastTitle.trim(), broadcastBody.trim());
      setBroadcastTitle("");
      setBroadcastBody("");
    } finally {
      setSendingBroadcast(false);
    }
  };

  return (
    <div className="space-y-6 anim-fadeUp">
      {/* 6 Cartões KPI Principais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <button
          type="button"
          onClick={() => onNavigate("encomendas")}
          className="text-left p-4 rounded-2xl bg-[#172338] border border-[#26354B] hover:border-[#246BFD] transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between text-[#A6B2C5] mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Encomendas hoje</span>
            <ShoppingBag size={15} className="text-[#246BFD]" />
          </div>
          <div className="text-2xl font-black text-white tabular-nums">{kpis.ordersToday}</div>
          <span className="text-[11px] text-[#A6B2C5]">{orders.length} total registadas</span>
        </button>

        <button
          type="button"
          onClick={() => onNavigate("entregas")}
          className="text-left p-4 rounded-2xl bg-[#172338] border border-[#26354B] hover:border-[#B7F34A] transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between text-[#A6B2C5] mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Comissões do mês</span>
            <Coins size={15} className="text-[#B7F34A]" />
          </div>
          <div className="text-xl font-black text-[#B7F34A] tabular-nums break-words">
            {fmtKz(kpis.monthlyCommissions)}
          </div>
          <span className="text-[11px] text-[#A6B2C5]">Cobradas após entrega</span>
        </button>

        <button
          type="button"
          onClick={() => canModerate && onNavigate("aprovacoes")}
          className="text-left p-4 rounded-2xl bg-[#172338] border border-[#26354B] hover:border-[#246BFD] transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between text-[#A6B2C5] mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Lojas pendentes</span>
            <StoreIcon size={15} className="text-amber-400" />
          </div>
          <div className="text-2xl font-black text-amber-400 tabular-nums">{kpis.pendingStores}</div>
          <span className="text-[11px] text-[#A6B2C5]">{stores.length} lojas no sistema</span>
        </button>

        <button
          type="button"
          onClick={() => onNavigate("pagamentos")}
          className="text-left p-4 rounded-2xl bg-[#172338] border border-[#26354B] hover:border-[#246BFD] transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between text-[#A6B2C5] mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Comprovativos</span>
            <CreditCard size={15} className="text-[#246BFD]" />
          </div>
          <div className="text-2xl font-black text-white tabular-nums">{kpis.pendingProofs}</div>
          <span className="text-[11px] text-[#A6B2C5]">Por confirmar agora</span>
        </button>

        <button
          type="button"
          onClick={() => canModerate && onNavigate("denuncias")}
          className="text-left p-4 rounded-2xl bg-[#172338] border border-[#26354B] hover:border-[#246BFD] transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between text-[#A6B2C5] mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Denúncias abertas</span>
            <AlertTriangle size={15} className="text-red-400" />
          </div>
          <div className="text-2xl font-black text-red-400 tabular-nums">{kpis.openReports}</div>
          <span className="text-[11px] text-[#A6B2C5]">Em análise de moderação</span>
        </button>

        <button
          type="button"
          onClick={() => onNavigate("entregas")}
          className="text-left p-4 rounded-2xl bg-[#172338] border border-[#26354B] hover:border-[#246BFD] transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between text-[#A6B2C5] mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Entregas atrasadas</span>
            <Truck size={15} className="text-amber-400" />
          </div>
          <div className="text-2xl font-black text-amber-300 tabular-nums">{kpis.delayedDeliveries}</div>
          <span className="text-[11px] text-[#A6B2C5]">{deliveries.length} entregas totais</span>
        </button>
      </div>

      {/* Gráfico de 7 dias + Lista Precisa de Atenção (>24h) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        {/* Gráfico SVG 7 dias */}
        <div className="xl:col-span-7 p-5 rounded-2xl bg-[#172338] border border-[#26354B] space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-black text-sm text-white">Actividade dos Últimos 7 Dias</h3>
              <p className="text-xs text-[#A6B2C5]">Encomendas diárias e volume transaccionado (Kz)</p>
            </div>
            <div className="flex items-center gap-4 text-[11px] font-bold">
              <span className="flex items-center gap-1.5 text-slate-200">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#246BFD]" /> Encomendas
              </span>
              <span className="flex items-center gap-1.5 text-[#B7F34A]">
                <span className="w-2.5 h-2.5 rounded-full bg-[#B7F34A]" /> Volume (Kz)
              </span>
            </div>
          </div>

          <div className="w-full overflow-x-auto">
            <svg viewBox="0 0 640 220" className="w-full min-w-[460px] h-52 select-none" role="img" aria-label="Gráfico de 7 dias">
              {[0.25, 0.5, 0.75, 1].map((frac) => {
                const y = 170 - frac * 135;
                return (
                  <line
                    key={frac}
                    x1={28}
                    y1={y}
                    x2={620}
                    y2={y}
                    stroke="#26354B"
                    strokeDasharray="3 4"
                    strokeWidth={1}
                  />
                );
              })}

              {chartStats.map((day, idx) => {
                const slotW = 84;
                const centerX = 68 + idx * slotW;
                const barH = Math.max(4, Math.round((day.ordersCount / maxOrders) * 130));
                const barY = 170 - barH;
                return (
                  <g key={day.dateKey}>
                    <rect
                      x={centerX - 18}
                      y={barY}
                      width={36}
                      height={barH}
                      rx={6}
                      fill="#246BFD"
                      fillOpacity={0.85}
                    />
                    <text
                      x={centerX}
                      y={barY - 6}
                      textAnchor="middle"
                      fill="#F8FAFC"
                      fontSize="11"
                      fontWeight="700"
                    >
                      {day.ordersCount}
                    </text>
                    <text x={centerX} y={192} textAnchor="middle" fill="#A6B2C5" fontSize="10" fontWeight="600">
                      {day.label}
                    </text>
                    <text x={centerX} y={208} textAnchor="middle" fill="#B7F34A" fontSize="9" fontWeight="700">
                      {day.revenueKz > 0 ? `${Math.round(day.revenueKz / 1000)}k` : "0"}
                    </text>
                  </g>
                );
              })}

              {/* Linha de tendência do volume */}
              <polyline
                fill="none"
                stroke="#B7F34A"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                points={chartStats
                  .map((day, idx) => {
                    const cx = 68 + idx * 84;
                    const y = 166 - Math.round((day.revenueKz / maxRevenue) * 125);
                    return `${cx},${y}`;
                  })
                  .join(" ")}
              />
              {chartStats.map((day, idx) => {
                const cx = 68 + idx * 84;
                const y = 166 - Math.round((day.revenueKz / maxRevenue) * 125);
                return <circle key={`pt-${day.dateKey}`} cx={cx} cy={y} r={4} fill="#07111F" stroke="#B7F34A" strokeWidth={2.5} />;
              })}
            </svg>
          </div>
        </div>

        {/* Lista Precisa de Atenção (>24h parado) */}
        <div className="xl:col-span-5 p-5 rounded-2xl bg-[#172338] border border-[#26354B] flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="font-black text-sm text-white flex items-center gap-2">
                <Clock size={15} className="text-amber-400" />
                Precisa de atenção (&gt; 24h)
              </h3>
              <p className="text-xs text-[#A6B2C5]">Itens pendentes ou parados há mais de 24 horas</p>
            </div>
            <span className="px-2.5 py-1 rounded-lg bg-[#111D30] border border-[#26354B] text-xs font-black text-amber-400 tabular-nums">
              {attentionQueue.length}
            </span>
          </div>

          {attentionQueue.length === 0 ? (
            <div className="flex-1 flex items-center justify-center p-6 rounded-xl bg-[#111D30] border border-[#26354B] text-xs text-[#A6B2C5] text-center">
              Tudo em dia. Não existem aprovações, pagamentos ou entregas parados há mais de 24h.
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {attentionQueue.slice(0, 12).map((item) => (
                <div
                  key={item.id}
                  className="p-3 rounded-xl bg-[#111D30] border border-[#26354B] flex items-center justify-between gap-3 text-xs"
                >
                  <div className="min-w-0">
                    <span className="font-bold text-white block truncate">{item.title}</span>
                    <span className="text-[11px] text-amber-300 block truncate">{item.subtitle}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigate(item.targetSection)}
                    className="px-2.5 py-1.5 rounded-lg bg-[#246BFD]/15 border border-[#246BFD]/30 text-[#246BFD] font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0 hover:bg-[#246BFD] hover:text-white transition-colors"
                  >
                    Abrir <ArrowUpRight size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Difusão Provincial e Catálogo Recente */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {canModerate && (
          <form
            onSubmit={handleBroadcastSubmit}
            className="p-5 rounded-2xl bg-[#172338] border border-[#26354B] space-y-3 text-xs"
          >
            <h3 className="font-black text-sm text-white flex items-center gap-2">
              <Megaphone size={16} className="text-[#B7F34A]" /> Difusão de Aviso Provincial
            </h3>
            <input
              type="text"
              required
              value={broadcastTitle}
              onChange={(e) => setBroadcastTitle(e.target.value)}
              placeholder="Título do comunicado oficial..."
              className="w-full p-2.5 rounded-xl bg-[#111D30] border border-[#26354B] text-white outline-none focus:border-[#246BFD]"
            />
            <textarea
              required
              rows={3}
              value={broadcastBody}
              onChange={(e) => setBroadcastBody(e.target.value)}
              placeholder="Mensagem entregue a todos os utilizadores no Uíge..."
              className="w-full p-2.5 rounded-xl bg-[#111D30] border border-[#26354B] text-white outline-none focus:border-[#246BFD]"
            />
            <button
              type="submit"
              disabled={sendingBroadcast}
              className="w-full py-2.5 rounded-xl font-black bg-[#246BFD] text-white cursor-pointer disabled:opacity-50"
            >
              {sendingBroadcast ? "A enviar aviso..." : "Enviar Notificação Provincial"}
            </button>
          </form>
        )}

        <div
          className={`p-5 rounded-2xl bg-[#172338] border border-[#26354B] space-y-3 text-xs ${
            !canModerate ? "lg:col-span-2" : ""
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-black text-sm text-white flex items-center gap-2">
              <Package size={16} className="text-[#246BFD]" /> Catálogo Recente ({products.length})
            </h3>
          </div>
          {products.length === 0 ? (
            <div className="p-6 text-center rounded-xl bg-[#111D30] border border-[#26354B] text-[#A6B2C5]">
              Ainda sem artigos publicados no catálogo provincial.
            </div>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {products.slice(0, 12).map((p) => (
                <div
                  key={p.id}
                  className="p-2.5 rounded-xl bg-[#111D30] border border-[#26354B] flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <span className="font-bold text-white block truncate">
                      {p.name} {p.condition === "usado" ? "(Usado)" : ""}
                    </span>
                    <span className="text-[#B7F34A] font-black tabular-nums">{fmtKz(p.price)}</span>
                    <span className="text-[#A6B2C5] ml-2">{p.storeName || p.municipality}</span>
                  </div>
                  {canModerate && (
                    <button
                      type="button"
                      onClick={() => onRequestDeleteProduct(p)}
                      className="p-2 text-red-400 hover:text-red-500 cursor-pointer shrink-0"
                      aria-label={`Remover ${p.name}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
