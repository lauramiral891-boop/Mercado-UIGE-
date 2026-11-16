import React, { useMemo, useState } from "react";
import { MessageCircle, Clock } from "lucide-react";
import { Order, Store, fmtDateTime, fmtKz } from "@mercado-uige/shared";
import { PaginationBar, TableToolbar } from "./TableControls";
import { buildDirectWhatsappHref, downloadCsv, hoursSince, isStalledOver24h } from "../lib/adminHelpers";

interface OrdersSectionProps {
  orders: Order[];
  stores: Store[];
}

export const OrdersSection: React.FC<OrdersSectionProps> = ({ orders, stores }) => {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("todas");
  const [storeFilter, setStoreFilter] = useState("todas");
  const [delayFilter, setDelayFilter] = useState<"todas" | "atrasadas" | "no_prazo">("todas");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const storeMap = useMemo(() => new Map(stores.map((s) => [s.id, s])), [stores]);

  const isOrderDelayed = (o: Order) =>
    o.status !== "Entregue" && o.status !== "Cancelada" && isStalledOver24h(o.createdAt);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (statusFilter !== "todas" && o.status !== statusFilter) return false;
      if (storeFilter !== "todas" && o.storeId !== storeFilter) return false;
      if (delayFilter === "atrasadas" && !isOrderDelayed(o)) return false;
      if (delayFilter === "no_prazo" && isOrderDelayed(o)) return false;

      if (q) {
        const st = o.storeId ? storeMap.get(o.storeId) : undefined;
        return (
          (o.code || "").toLowerCase().includes(q) ||
          (o.userName || "").toLowerCase().includes(q) ||
          (o.userPhone || "").toLowerCase().includes(q) ||
          (o.storeName || "").toLowerCase().includes(q) ||
          (st?.code || "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [orders, search, statusFilter, storeFilter, delayFilter, storeMap]);

  const paged = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const handleExport = () => {
    downloadCsv(
      "encomendas-mercado-uige",
      ["Código", "Loja", "Cliente", "Telefone Cliente", "Tipo Entrega", "Subtotal (Kz)", "Taxa (Kz)", "Total (Kz)", "Pagamento", "Estado", "Atraso", "Data"],
      filtered.map((o) => [
        o.code,
        o.storeName || "Loja Uíge",
        o.userName || "Cliente",
        o.userPhone || "",
        o.deliveryType || "entrega",
        o.subtotal,
        o.deliveryFee,
        o.total,
        o.paymentStatus === "pago" ? "Pago" : "Por pagar",
        o.status,
        isOrderDelayed(o) ? `Sim (${hoursSince(o.createdAt)}h)` : "Não",
        fmtDateTime(o.createdAt),
      ])
    );
  };

  return (
    <div className="space-y-4 anim-fadeUp">
      <TableToolbar
        title="Gestão Global de Encomendas"
        subtitle="Filtra por estado, loja ou atraso (>24h) e contacta cliente ou loja directamente pelo WhatsApp."
        search={search}
        onSearchChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        searchPlaceholder="Pesquisar por código (MU-UG), cliente ou loja (LJ-)..."
        filterValue={statusFilter}
        onFilterChange={(v) => {
          setStatusFilter(v);
          setPage(1);
        }}
        filterOptions={[
          { value: "todas", label: "Todos os estados" },
          { value: "Pendente", label: "Pendente" },
          { value: "Confirmada", label: "Confirmada" },
          { value: "Em preparação", label: "Em preparação" },
          { value: "Pronta para levantamento", label: "Pronta para levantamento" },
          { value: "Em entrega", label: "Em entrega" },
          { value: "Entregue", label: "Entregue" },
          { value: "Cancelada", label: "Cancelada" },
        ]}
        secondFilterValue={storeFilter}
        onSecondFilterChange={(v) => {
          setStoreFilter(v);
          setPage(1);
        }}
        secondFilterOptions={[
          { value: "todas", label: "Todas as lojas" },
          ...stores.map((s) => ({
            value: s.id,
            label: `${s.name} (${s.code || "LJ"})`,
          })),
        ]}
        onExportCsv={handleExport}
        totalFiltered={filtered.length}
      />

      {/* Filtro rápido de atraso */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {[
          { id: "todas", label: `Todas (${orders.length})` },
          {
            id: "atrasadas",
            label: `Com atraso >24h (${orders.filter(isOrderDelayed).length})`,
          },
          { id: "no_prazo", label: "Dentro do prazo" },
        ].map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => {
              setDelayFilter(f.id as any);
              setPage(1);
            }}
            className={`px-3 py-1.5 rounded-lg border font-bold cursor-pointer ${
              delayFilter === f.id
                ? "bg-[#246BFD] text-white border-[#246BFD]"
                : "bg-[#172338] border-[#26354B] text-[#A6B2C5] hover:text-white"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {paged.length === 0 ? (
        <div className="p-8 text-center rounded-2xl bg-[#172338] border border-[#26354B] text-xs text-[#A6B2C5]">
          Nenhuma encomenda encontrada neste filtro.
        </div>
      ) : (
        <>
          {/* Tabela Desktop */}
          <div className="hidden md:block rounded-2xl border border-[#26354B] bg-[#172338] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#111D30] text-[#A6B2C5] uppercase font-bold">
                  <tr>
                    <th className="p-3.5">Código / Data</th>
                    <th className="p-3.5">Loja</th>
                    <th className="p-3.5">Cliente</th>
                    <th className="p-3.5">Total</th>
                    <th className="p-3.5">Pagamento / Estado</th>
                    <th className="p-3.5 text-right">WhatsApp Directo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#26354B]">
                  {paged.map((ord) => {
                    const st = ord.storeId ? storeMap.get(ord.storeId) : undefined;
                    const delayed = isOrderDelayed(ord);
                    const clientWa = buildDirectWhatsappHref(
                      ord.userPhone,
                      `Olá ${ord.userName || ""}, da equipa Mercado Uíge sobre a encomenda #${ord.code}.`
                    );
                    const storeWa = buildDirectWhatsappHref(
                      ord.storePhone || st?.phone,
                      `Olá ${ord.storeName || ""}, da equipa Mercado Uíge sobre a encomenda #${ord.code}.`
                    );

                    return (
                      <tr key={ord.id} className="hover:bg-[#111D30]/40">
                        <td className="p-3.5 whitespace-nowrap">
                          <span className="font-black text-[#B7F34A] block">#{ord.code}</span>
                          <span className="text-[11px] text-[#A6B2C5]">{fmtDateTime(ord.createdAt)}</span>
                        </td>
                        <td className="p-3.5">
                          <span className="font-bold text-white block">{ord.storeName || st?.name || "Loja Uíge"}</span>
                          <span className="text-[11px] text-[#A6B2C5]">{st?.code || "—"}</span>
                        </td>
                        <td className="p-3.5">
                          <span className="font-semibold text-white block">{ord.userName || "Cliente"}</span>
                          <span className="text-[11px] text-[#A6B2C5]">{ord.userPhone || "Sem telefone"}</span>
                        </td>
                        <td className="p-3.5 font-black text-white tabular-nums whitespace-nowrap">
                          {fmtKz(ord.total)}
                        </td>
                        <td className="p-3.5 whitespace-nowrap space-y-1">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-black ${
                                ord.paymentStatus === "pago"
                                  ? "bg-emerald-500/20 text-emerald-400"
                                  : "bg-amber-500/20 text-amber-300"
                              }`}
                            >
                              {ord.paymentStatus === "pago" ? "Pago" : "Por pagar"}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-[#246BFD]/20 text-blue-200 text-[10px] font-bold">
                              {ord.status}
                            </span>
                          </div>
                          {delayed && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-black text-red-400">
                              <Clock size={11} /> Atrasada ({hoursSince(ord.createdAt)}h)
                            </span>
                          )}
                        </td>
                        <td className="p-3.5 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            {clientWa ? (
                              <a
                                href={clientWa}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-2.5 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-bold inline-flex items-center gap-1 hover:bg-emerald-500 hover:text-slate-950"
                              >
                                <MessageCircle size={12} /> Cliente
                              </a>
                            ) : (
                              <span className="px-2 py-1 text-[10px] text-slate-500">Cliente s/ WhatsApp</span>
                            )}
                            {storeWa ? (
                              <a
                                href={storeWa}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-2.5 py-1.5 rounded-lg bg-[#246BFD]/15 border border-[#246BFD]/30 text-blue-200 font-bold inline-flex items-center gap-1 hover:bg-[#246BFD] hover:text-white"
                              >
                                <MessageCircle size={12} /> Loja
                              </a>
                            ) : (
                              <span className="px-2 py-1 text-[10px] text-slate-500">Loja s/ WhatsApp</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Cartões Mobile */}
          <div className="md:hidden space-y-3">
            {paged.map((ord) => {
              const st = ord.storeId ? storeMap.get(ord.storeId) : undefined;
              const delayed = isOrderDelayed(ord);
              const clientWa = buildDirectWhatsappHref(
                ord.userPhone,
                `Olá ${ord.userName || ""}, da equipa Mercado Uíge sobre a encomenda #${ord.code}.`
              );
              const storeWa = buildDirectWhatsappHref(
                ord.storePhone || st?.phone,
                `Olá ${ord.storeName || ""}, da equipa Mercado Uíge sobre a encomenda #${ord.code}.`
              );
              return (
                <div key={ord.id} className="p-4 rounded-2xl bg-[#172338] border border-[#26354B] space-y-2.5 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-black text-[#B7F34A]">#{ord.code}</span>
                      <span className="font-bold text-white block">{ord.storeName || st?.name || "Loja Uíge"}</span>
                      <span className="text-[11px] text-[#A6B2C5]">
                        {ord.userName || "Cliente"} {ord.userPhone ? `· ${ord.userPhone}` : ""}
                      </span>
                    </div>
                    <span className="font-black text-white tabular-nums">{fmtKz(ord.total)}</span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="px-2 py-0.5 rounded bg-[#246BFD]/20 text-blue-200 text-[10px] font-bold">
                      {ord.status}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-black ${
                        ord.paymentStatus === "pago"
                          ? "bg-emerald-500/20 text-emerald-400"
                          : "bg-amber-500/20 text-amber-300"
                      }`}
                    >
                      {ord.paymentStatus === "pago" ? "Pago" : "Por pagar"}
                    </span>
                    {delayed && (
                      <span className="px-2 py-0.5 rounded bg-red-500/20 text-red-300 text-[10px] font-black">
                        Atrasada ({hoursSince(ord.createdAt)}h)
                      </span>
                    )}
                  </div>

                  <div className="pt-2 border-t border-[#26354B] flex gap-2">
                    {clientWa && (
                      <a
                        href={clientWa}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-bold text-center inline-flex items-center justify-center gap-1"
                      >
                        <MessageCircle size={13} /> WhatsApp Cliente
                      </a>
                    )}
                    {storeWa && (
                      <a
                        href={storeWa}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 py-2 rounded-xl bg-[#246BFD]/15 border border-[#246BFD]/30 text-blue-200 font-bold text-center inline-flex items-center justify-center gap-1"
                      >
                        <MessageCircle size={13} /> WhatsApp Loja
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <PaginationBar
        page={page}
        pageSize={pageSize}
        totalItems={filtered.length}
        onPageChange={setPage}
        onPageSizeChange={(next) => {
          setPageSize(next);
          setPage(1);
        }}
      />
    </div>
  );
};
