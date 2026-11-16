import React, { useMemo, useRef, useState } from "react";
import {
  Crown,
  Eye,
  Film,
  Image as ImageIcon,
  MousePointerClick,
  Pencil,
  Plus,
  Store as StoreIcon,
  Truck,
  CheckCircle2,
  Upload,
} from "lucide-react";
import {
  AD_VIDEO_TARGET_BYTES,
  AdAdvertiserType,
  AdDestinationType,
  AdPosition,
  AuditLogItem,
  CourierMonthlyFee,
  DeliveryRecord,
  MAX_AD_VIDEO_BYTES,
  MAX_AD_VIDEO_DURATION_SEC,
  MerchantPayment,
  Product,
  ReportItem,
  SponsoredAd,
  Store,
  User,
  compressImage,
  compressVideoOnDevice,
  fmtDate,
  fmtDateTime,
  fmtKz,
  formatPlanType,
  formatStoreType,
  formatUserRole,
  isFinanceRole,
  isModeratorRole,
  isSupabaseConfigured,
  resolveAdAdvertiserType,
  storeHasActivePaidPlan,
  translateErrorMessage,
  uploadMediaFile,
  validateSafeAdDestination,
} from "@mercado-uige/shared";
import { PaginationBar, TableToolbar } from "./TableControls";
import { downloadCsv } from "../lib/adminHelpers";

/* -------------------------------------------------------------------------- */
/* 1. LOJAS                                                                   */
/* -------------------------------------------------------------------------- */
export const StoresSection: React.FC<{
  currentUser: User;
  stores: Store[];
  onPreviewImage: (url: string) => void;
  onApproveStore: (store: Store) => void;
  onSuspendStore: (store: Store) => void;
  onToggleVip: (store: Store) => void;
}> = ({ currentUser, stores, onPreviewImage, onApproveStore, onSuspendStore, onToggleVip }) => {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("todas");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const canMod = isModeratorRole(currentUser.role);
  const canFin = isFinanceRole(currentUser.role);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return stores.filter((s) => {
      if (typeFilter !== "todos" && typeFilter !== "todas" && s.storeType !== typeFilter) return false;
      if (statusFilter === "aprovadas" && (!s.isApproved || s.isSuspended)) return false;
      if (statusFilter === "pendentes" && s.isApproved) return false;
      if (statusFilter === "suspensas" && !s.isSuspended) return false;
      if (statusFilter === "vip" && !s.isVip) return false;

      if (q) {
        return (
          s.name.toLowerCase().includes(q) ||
          (s.code || "").toLowerCase().includes(q) ||
          (s.municipality || "").toLowerCase().includes(q) ||
          (s.phone || "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [stores, search, typeFilter, statusFilter]);

  const paged = useMemo(() => filtered.slice((page - 1) * pageSize, page * pageSize), [filtered, page, pageSize]);

  const handleExport = () => {
    downloadCsv(
      "lojas-mercado-uige",
      ["Código", "Nome", "Tipo", "Plano", "Município", "Bairro", "Telefone", "Aprovada", "Suspensa", "Denúncias", "Criado em"],
      filtered.map((s) => [
        s.code || "LJ",
        s.name,
        formatStoreType(s.storeType),
        formatPlanType(s.planType),
        s.municipality,
        s.bairro || "",
        s.phone || "",
        s.isApproved ? "Sim" : "Não",
        s.isSuspended ? "Sim" : "Não",
        s.reportsCount || 0,
        fmtDateTime(s.createdAt),
      ])
    );
  };

  return (
    <div className="space-y-4 anim-fadeUp">
      <TableToolbar
        title="Gestão de Lojas e Vendedores Ambulantes"
        subtitle="Pesquisa por nome ou código LJ-, filtra por tipo ou estado e gere suspensões ou selos VIP."
        search={search}
        onSearchChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        searchPlaceholder="Pesquisar por nome da loja, código LJ- ou telefone..."
        filterValue={statusFilter}
        onFilterChange={(v) => {
          setStatusFilter(v);
          setPage(1);
        }}
        filterOptions={[
          { value: "todos", label: "Todos os estados" },
          { value: "aprovadas", label: "Activas e aprovadas" },
          { value: "pendentes", label: "Pendentes de aprovação" },
          { value: "suspensas", label: "Suspensas" },
          { value: "vip", label: "Apenas VIP" },
        ]}
        secondFilterValue={typeFilter}
        onSecondFilterChange={(v) => {
          setTypeFilter(v);
          setPage(1);
        }}
        secondFilterOptions={[
          { value: "todos", label: "Todos os tipos" },
          { value: "loja_fixa", label: "Loja fixa" },
          { value: "vendedor_ambulante", label: "Vendedor ambulante" },
        ]}
        onExportCsv={handleExport}
        totalFiltered={filtered.length}
      />

      {paged.length === 0 ? (
        <div className="p-8 text-center rounded-2xl bg-[#172338] border border-[#26354B] text-xs text-[#A6B2C5]">
          Nenhuma loja encontrada com estes critérios.
        </div>
      ) : (
        <>
          <div className="hidden md:block rounded-2xl border border-[#26354B] bg-[#172338] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#111D30] text-[#A6B2C5] uppercase font-bold">
                  <tr>
                    <th className="p-3.5">Código</th>
                    <th className="p-3.5">Loja / Tipo</th>
                    <th className="p-3.5">Localização</th>
                    <th className="p-3.5">Plano</th>
                    <th className="p-3.5">Estado</th>
                    <th className="p-3.5">Documentos</th>
                    <th className="p-3.5 text-right">Acções</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#26354B]">
                  {paged.map((s) => (
                    <tr key={s.id} className="hover:bg-[#111D30]/40">
                      <td className="p-3.5 font-black text-[#B7F34A] whitespace-nowrap">{s.code || "LJ-0000"}</td>
                      <td className="p-3.5">
                        <div className="flex items-center gap-1.5 font-bold text-white">
                          <span>{s.name}</span>
                          {s.isVip && <Crown size={13} className="text-amber-400 fill-amber-400 shrink-0" />}
                        </div>
                        <span className="text-[11px] text-[#A6B2C5]">{formatStoreType(s.storeType)}</span>
                      </td>
                      <td className="p-3.5 text-[#A6B2C5]">
                        {s.bairro ? `${s.bairro}, ` : ""}
                        {s.municipality}
                      </td>
                      <td className="p-3.5 font-bold text-white whitespace-nowrap">{formatPlanType(s.planType)}</td>
                      <td className="p-3.5 whitespace-nowrap space-y-1">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-black ${
                            s.isSuspended
                              ? "bg-red-500/20 text-red-400"
                              : s.isApproved
                              ? "bg-emerald-500/20 text-emerald-400"
                              : "bg-amber-500/20 text-amber-300"
                          }`}
                        >
                          {s.isSuspended ? "Suspensa" : s.isApproved ? "Activa" : "Pendente"}
                        </span>
                        {(s.reportsCount || 0) > 0 && (
                          <span className="block text-[10px] text-red-300 font-bold">
                            {s.reportsCount} denúncia(s)
                          </span>
                        )}
                      </td>
                      <td className="p-3.5 whitespace-nowrap">
                        <div className="flex gap-1.5">
                          {s.facadeImage && (
                            <button
                              type="button"
                              onClick={() => onPreviewImage(s.facadeImage!)}
                              className="px-2 py-1 rounded bg-[#111D30] border border-[#26354B] text-[#246BFD] font-bold cursor-pointer"
                            >
                              Fachada
                            </button>
                          )}
                          {s.biPhotoUrl && (
                            <button
                              type="button"
                              onClick={() => onPreviewImage(s.biPhotoUrl!)}
                              className="px-2 py-1 rounded bg-[#111D30] border border-[#26354B] text-[#B7F34A] font-bold cursor-pointer"
                            >
                              BI
                            </button>
                          )}
                          {!s.facadeImage && !s.biPhotoUrl && <span className="text-slate-500">—</span>}
                        </div>
                      </td>
                      <td className="p-3.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          {canMod && !s.isApproved && (
                            <button
                              type="button"
                              onClick={() => onApproveStore(s)}
                              className="px-2.5 py-1 rounded-lg bg-emerald-500 text-slate-950 font-black cursor-pointer"
                            >
                              Aprovar
                            </button>
                          )}
                          {canMod && (
                            <button
                              type="button"
                              onClick={() => onSuspendStore(s)}
                              className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer ${
                                s.isSuspended
                                  ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                                  : "bg-red-500/15 text-red-400 border border-red-500/30"
                              }`}
                            >
                              {s.isSuspended ? "Reactivar" : "Suspender"}
                            </button>
                          )}
                          {canFin && (
                            <button
                              type="button"
                              onClick={() => onToggleVip(s)}
                              className={`px-2.5 py-1 rounded-lg font-black cursor-pointer border ${
                                s.isVip
                                  ? "bg-amber-400 text-slate-950 border-amber-400"
                                  : "border-[#26354B] text-white"
                              }`}
                            >
                              {s.isVip ? "Tirar VIP" : "VIP"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="md:hidden space-y-3">
            {paged.map((s) => (
              <div key={s.id} className="p-4 rounded-2xl bg-[#172338] border border-[#26354B] space-y-2.5 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-[11px] font-black text-[#B7F34A]">{s.code || "LJ"}</span>
                    <h3 className="font-black text-sm text-white flex items-center gap-1.5">
                      <span className="truncate">{s.name}</span>
                      {s.isVip && <Crown size={13} className="text-amber-400 fill-amber-400 shrink-0" />}
                    </h3>
                    <span className="text-[#A6B2C5]">
                      {formatStoreType(s.storeType)} · {s.municipality}
                    </span>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-black ${
                      s.isSuspended
                        ? "bg-red-500/20 text-red-400"
                        : s.isApproved
                        ? "bg-emerald-500/20 text-emerald-400"
                        : "bg-amber-500/20 text-amber-300"
                    }`}
                  >
                    {s.isSuspended ? "Suspensa" : s.isApproved ? "Activa" : "Pendente"}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {s.facadeImage && (
                    <button
                      type="button"
                      onClick={() => onPreviewImage(s.facadeImage!)}
                      className="px-2.5 py-1 rounded-lg bg-[#111D30] border border-[#26354B] text-[#246BFD] font-bold cursor-pointer"
                    >
                      Ver Fachada
                    </button>
                  )}
                  {s.biPhotoUrl && (
                    <button
                      type="button"
                      onClick={() => onPreviewImage(s.biPhotoUrl!)}
                      className="px-2.5 py-1 rounded-lg bg-[#111D30] border border-[#26354B] text-[#B7F34A] font-bold cursor-pointer"
                    >
                      Ver BI
                    </button>
                  )}
                </div>

                <div className="pt-2 border-t border-[#26354B] flex flex-wrap gap-2">
                  {canMod && !s.isApproved && (
                    <button
                      type="button"
                      onClick={() => onApproveStore(s)}
                      className="flex-1 py-1.5 px-3 rounded-lg bg-emerald-500 text-slate-950 font-black cursor-pointer"
                    >
                      Aprovar
                    </button>
                  )}
                  {canMod && (
                    <button
                      type="button"
                      onClick={() => onSuspendStore(s)}
                      className="flex-1 py-1.5 px-3 rounded-lg bg-red-500/15 border border-red-500/30 text-red-300 font-bold cursor-pointer"
                    >
                      {s.isSuspended ? "Reactivar" : "Suspender"}
                    </button>
                  )}
                  {canFin && (
                    <button
                      type="button"
                      onClick={() => onToggleVip(s)}
                      className="py-1.5 px-3 rounded-lg border border-[#26354B] text-white font-bold cursor-pointer"
                    >
                      {s.isVip ? "Tirar VIP" : "VIP"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <PaginationBar
        page={page}
        pageSize={pageSize}
        totalItems={filtered.length}
        onPageChange={setPage}
        onPageSizeChange={(n) => {
          setPageSize(n);
          setPage(1);
        }}
      />
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* 2. UTILIZADORES                                                            */
/* -------------------------------------------------------------------------- */
export const UsersSection: React.FC<{
  currentUser: User;
  users: User[];
  onApproveUser: (user: User) => void;
  onSuspendUser: (user: User) => void;
}> = ({ currentUser, users, onApproveUser, onSuspendUser }) => {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("todos");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const canMod = isModeratorRole(currentUser.role);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== "todos" && u.role !== roleFilter) return false;
      if (statusFilter === "activos" && (u.isSuspended || u.isApproved === false)) return false;
      if (statusFilter === "pendentes" && u.isApproved !== false) return false;
      if (statusFilter === "suspensos" && !u.isSuspended) return false;

      if (q) {
        return (
          (u.name || "").toLowerCase().includes(q) ||
          (u.email || "").toLowerCase().includes(q) ||
          (u.code || "").toLowerCase().includes(q) ||
          (u.phone || "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [users, search, roleFilter, statusFilter]);

  const paged = useMemo(() => filtered.slice((page - 1) * pageSize, page * pageSize), [filtered, page, pageSize]);

  const handleExport = () => {
    downloadCsv(
      "utilizadores-mercado-uige",
      ["Código", "Nome", "E-mail", "Telefone", "Papel", "Município", "Bairro", "Aprovado", "Suspenso", "Registo"],
      filtered.map((u) => [
        u.code || "CL",
        u.name,
        u.email,
        u.phone || "",
        formatUserRole(u.role),
        u.municipality || "Uíge",
        u.bairro || "",
        u.isApproved === false ? "Não" : "Sim",
        u.isSuspended ? "Sim" : "Não",
        fmtDateTime(u.createdAt),
      ])
    );
  };

  return (
    <div className="space-y-4 anim-fadeUp">
      <TableToolbar
        title="Gestão de Utilizadores e Contas"
        subtitle="Pesquisa por nome ou código CL-, filtra por papel/estado e exporta a lista completa."
        search={search}
        onSearchChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        searchPlaceholder="Pesquisar por código CL-, nome, e-mail ou telefone..."
        filterValue={roleFilter}
        onFilterChange={(v) => {
          setRoleFilter(v);
          setPage(1);
        }}
        filterOptions={[
          { value: "todos", label: "Todos os papéis" },
          { value: "cliente", label: "Clientes" },
          { value: "comerciante", label: "Comerciantes" },
          { value: "entregador", label: "Entregadores" },
          { value: "moderador", label: "Moderadores" },
          { value: "financeiro", label: "Financeiro" },
          { value: "super_admin", label: "Super Admin" },
        ]}
        secondFilterValue={statusFilter}
        onSecondFilterChange={(v) => {
          setStatusFilter(v);
          setPage(1);
        }}
        secondFilterOptions={[
          { value: "todos", label: "Todos os estados" },
          { value: "activos", label: "Activos" },
          { value: "pendentes", label: "Pendentes" },
          { value: "suspensos", label: "Suspensos" },
        ]}
        onExportCsv={handleExport}
        totalFiltered={filtered.length}
      />

      {paged.length === 0 ? (
        <div className="p-8 text-center rounded-2xl bg-[#172338] border border-[#26354B] text-xs text-[#A6B2C5]">
          Nenhum utilizador encontrado com estes critérios.
        </div>
      ) : (
        <>
          <div className="hidden md:block rounded-2xl border border-[#26354B] bg-[#172338] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#111D30] text-[#A6B2C5] uppercase font-bold">
                  <tr>
                    <th className="p-3.5">Código</th>
                    <th className="p-3.5">Nome / E-mail</th>
                    <th className="p-3.5">Papel</th>
                    <th className="p-3.5">Município / Bairro</th>
                    <th className="p-3.5">Estado</th>
                    <th className="p-3.5 text-right">Acções</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#26354B]">
                  {paged.map((u) => (
                    <tr key={u.id} className="hover:bg-[#111D30]/40">
                      <td className="p-3.5 font-black text-[#B7F34A] whitespace-nowrap">{u.code || "—"}</td>
                      <td className="p-3.5">
                        <span className="font-bold text-white block">{u.name}</span>
                        <span className="text-[#A6B2C5]">{u.email}</span>
                      </td>
                      <td className="p-3.5 whitespace-nowrap font-bold text-white">{formatUserRole(u.role)}</td>
                      <td className="p-3.5 text-[#A6B2C5]">
                        {u.bairro ? `${u.bairro}, ` : ""}
                        {u.municipality || "Uíge"}
                      </td>
                      <td className="p-3.5 whitespace-nowrap">
                        {u.isSuspended ? (
                          <span className="text-red-400 font-bold">Suspenso</span>
                        ) : u.isApproved === false ? (
                          <span className="text-amber-400 font-bold">Pendente</span>
                        ) : (
                          <span className="text-emerald-400 font-bold">Activo</span>
                        )}
                      </td>
                      <td className="p-3.5 text-right whitespace-nowrap">
                        {canMod && (
                          <div className="inline-flex items-center gap-1.5">
                            {u.isApproved === false && (
                              <button
                                type="button"
                                onClick={() => onApproveUser(u)}
                                className="px-2.5 py-1 rounded-lg bg-emerald-500 text-slate-950 font-black cursor-pointer"
                              >
                                Aprovar
                              </button>
                            )}
                            {u.id !== currentUser.id && (
                              <button
                                type="button"
                                onClick={() => onSuspendUser(u)}
                                className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer ${
                                  u.isSuspended
                                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                                    : "bg-red-500/15 text-red-400 border border-red-500/30"
                                }`}
                              >
                                {u.isSuspended ? "Reactivar" : "Suspender"}
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="md:hidden space-y-3">
            {paged.map((u) => (
              <div key={u.id} className="p-4 rounded-2xl bg-[#172338] border border-[#26354B] space-y-2 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="font-black text-[#B7F34A]">{u.code || "CL"}</span>
                    <h3 className="font-bold text-white truncate">{u.name}</h3>
                    <span className="text-[#A6B2C5] block truncate">{u.email}</span>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-[#111D30] text-white font-bold shrink-0">
                    {formatUserRole(u.role)}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-[#26354B]">
                  <span className={u.isSuspended ? "text-red-400 font-bold" : "text-emerald-400 font-bold"}>
                    {u.isSuspended ? "Suspenso" : u.isApproved === false ? "Pendente" : "Activo"}
                  </span>
                  {canMod && u.id !== currentUser.id && (
                    <div className="flex gap-2">
                      {u.isApproved === false && (
                        <button
                          type="button"
                          onClick={() => onApproveUser(u)}
                          className="px-3 py-1 rounded-lg bg-emerald-500 text-slate-950 font-black cursor-pointer"
                        >
                          Aprovar
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onSuspendUser(u)}
                        className="px-3 py-1 rounded-lg bg-red-500/15 text-red-300 border border-red-500/30 font-bold cursor-pointer"
                      >
                        {u.isSuspended ? "Reactivar" : "Suspender"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <PaginationBar
        page={page}
        pageSize={pageSize}
        totalItems={filtered.length}
        onPageChange={setPage}
        onPageSizeChange={(n) => {
          setPageSize(n);
          setPage(1);
        }}
      />
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* 3. PAGAMENTOS                                                              */
/* -------------------------------------------------------------------------- */
export const PaymentsSection: React.FC<{
  payments: MerchantPayment[];
  onPreviewImage: (url: string) => void;
  onConfirmPayment: (pay: MerchantPayment) => void;
  onRejectPayment: (pay: MerchantPayment) => void;
}> = ({ payments, onPreviewImage, onConfirmPayment, onRejectPayment }) => {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [typeFilter, setTypeFilter] = useState("todos");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return payments.filter((p) => {
      if (statusFilter !== "todos" && p.status !== statusFilter) return false;
      if (typeFilter !== "todos" && p.type !== typeFilter) return false;
      if (q) {
        return (
          (p.storeName || "").toLowerCase().includes(q) ||
          (p.advertiserName || "").toLowerCase().includes(q) ||
          (p.sellerName || "").toLowerCase().includes(q) ||
          (p.reference || "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [payments, search, statusFilter, typeFilter]);

  const paged = useMemo(() => filtered.slice((page - 1) * pageSize, page * pageSize), [filtered, page, pageSize]);

  const handleExport = () => {
    downloadCsv(
      "pagamentos-planos-mercado-uige",
      ["Loja/Anunciante", "Perfil", "Tipo", "Plano", "Valor (Kz)", "Método", "Referência", "Estado", "Data"],
      filtered.map((p) => [
        p.advertiserName || p.storeName || p.sellerName || "Utilizador",
        p.userRoleType || (p.type === "anuncio_externo" ? "Anunciante externo" : ""),
        p.type,
        p.targetPlan || "",
        p.amountKz,
        p.method,
        p.reference || "",
        p.status,
        fmtDateTime(p.createdAt),
      ])
    );
  };

  const formatPaymentTypeBadge = (pay: MerchantPayment) => {
    if (pay.type === "plano") return `Plano ${formatPlanType(pay.targetPlan)}`;
    if (pay.type === "anuncio_externo") return "Anúncio Externo";
    return "Anúncio de Loja";
  };

  return (
    <div className="space-y-4 anim-fadeUp">
      <TableToolbar
        title="Pagamentos de Planos e Anúncios"
        subtitle="Confirma ou rejeita comprovativos Multicaixa Express, Transferência e anúncios de anunciantes externos."
        search={search}
        onSearchChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        searchPlaceholder="Pesquisar por loja, anunciante, nome ou referência..."
        filterValue={statusFilter}
        onFilterChange={(v) => {
          setStatusFilter(v);
          setPage(1);
        }}
        filterOptions={[
          { value: "todos", label: "Todos os estados" },
          { value: "pendente", label: "Por confirmar" },
          { value: "confirmado", label: "Confirmados" },
          { value: "rejeitado", label: "Rejeitados" },
        ]}
        secondFilterValue={typeFilter}
        onSecondFilterChange={(v) => {
          setTypeFilter(v);
          setPage(1);
        }}
        secondFilterOptions={[
          { value: "todos", label: "Planos e Anúncios" },
          { value: "plano", label: "Planos" },
          { value: "anuncio", label: "Anúncios de Lojas" },
          { value: "anuncio_externo", label: "Anúncios Externos" },
        ]}
        onExportCsv={handleExport}
        totalFiltered={filtered.length}
      />

      {paged.length === 0 ? (
        <div className="p-8 text-center rounded-2xl bg-[#172338] border border-[#26354B] text-xs text-[#A6B2C5]">
          Nenhum pagamento encontrado com estes filtros.
        </div>
      ) : (
        <>
          <div className="hidden md:block rounded-2xl border border-[#26354B] bg-[#172338] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#111D30] text-[#A6B2C5] uppercase font-bold">
                  <tr>
                    <th className="p-3.5">Comerciante / Anunciante</th>
                    <th className="p-3.5">Tipo / Plano</th>
                    <th className="p-3.5">Valor</th>
                    <th className="p-3.5">Método / Data</th>
                    <th className="p-3.5">Comprovativo</th>
                    <th className="p-3.5 text-right">Acções</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#26354B]">
                  {paged.map((pay) => (
                    <tr key={pay.id} className="hover:bg-[#111D30]/40">
                      <td className="p-3.5">
                        <span className="font-bold text-white block">
                          {pay.advertiserName || pay.storeName || pay.sellerName || "Utilizador"}
                        </span>
                        {pay.type === "anuncio_externo" ? (
                          <span className="text-[11px] text-[#B7F34A]">Anunciante externo</span>
                        ) : (
                          pay.userRoleType && (
                            <span className="text-[11px] text-[#A6B2C5]">
                              {pay.userRoleType === "entregador" ? "Entregador" : formatStoreType(pay.userRoleType)}
                            </span>
                          )
                        )}
                      </td>
                      <td className="p-3.5">
                        <span className="px-2 py-0.5 rounded bg-[#246BFD]/15 text-blue-200 font-bold">
                          {formatPaymentTypeBadge(pay)}
                        </span>
                      </td>
                      <td className="p-3.5 font-black text-[#B7F34A] tabular-nums whitespace-nowrap">
                        {fmtKz(pay.amountKz)}
                      </td>
                      <td className="p-3.5 text-[#A6B2C5]">
                        <span className="block text-white font-semibold">{pay.method}</span>
                        <span>{pay.reference ? `Ref: ${pay.reference} · ` : ""}{fmtDateTime(pay.createdAt)}</span>
                      </td>
                      <td className="p-3.5 whitespace-nowrap">
                        {pay.proofUrl ? (
                          <button
                            type="button"
                            onClick={() => onPreviewImage(pay.proofUrl)}
                            className="px-2.5 py-1 rounded bg-[#111D30] border border-[#26354B] text-[#246BFD] font-bold cursor-pointer"
                          >
                            Ver Comprovativo
                          </button>
                        ) : (
                          <span className="text-slate-500">Sem anexo</span>
                        )}
                      </td>
                      <td className="p-3.5 text-right whitespace-nowrap">
                        {pay.status === "pendente" ? (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => onConfirmPayment(pay)}
                              className="px-3 py-1.5 rounded-lg bg-emerald-500 text-slate-950 font-black cursor-pointer"
                            >
                              Confirmar
                            </button>
                            <button
                              type="button"
                              onClick={() => onRejectPayment(pay)}
                              className="px-2.5 py-1.5 rounded-lg bg-red-500/15 text-red-400 border border-red-500/30 font-bold cursor-pointer"
                            >
                              Rejeitar
                            </button>
                          </div>
                        ) : (
                          <span
                            className={`px-2.5 py-1 rounded font-black capitalize ${
                              pay.status === "confirmado"
                                ? "bg-emerald-500/20 text-emerald-400"
                                : "bg-red-500/20 text-red-400"
                            }`}
                          >
                            {pay.status}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="md:hidden space-y-3">
            {paged.map((pay) => (
              <div key={pay.id} className="p-4 rounded-2xl bg-[#172338] border border-[#26354B] space-y-2.5 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="font-black text-white block">
                      {pay.advertiserName || pay.storeName || pay.sellerName || "Utilizador"}
                    </span>
                    <span className="text-[#A6B2C5]">
                      {formatPaymentTypeBadge(pay)} · {pay.method}
                    </span>
                  </div>
                  <span className="font-black text-[#B7F34A] tabular-nums">{fmtKz(pay.amountKz)}</span>
                </div>
                {pay.proofUrl && (
                  <button
                    type="button"
                    onClick={() => onPreviewImage(pay.proofUrl)}
                    className="text-[#246BFD] font-bold underline cursor-pointer"
                  >
                    Ver Comprovativo
                  </button>
                )}
                <div className="pt-2 border-t border-[#26354B] flex gap-2">
                  {pay.status === "pendente" ? (
                    <>
                      <button
                        type="button"
                        onClick={() => onConfirmPayment(pay)}
                        className="flex-1 py-1.5 rounded-lg bg-emerald-500 text-slate-950 font-black cursor-pointer"
                      >
                        Confirmar
                      </button>
                      <button
                        type="button"
                        onClick={() => onRejectPayment(pay)}
                        className="py-1.5 px-3 rounded-lg bg-red-500/15 text-red-400 font-bold cursor-pointer"
                      >
                        Rejeitar
                      </button>
                    </>
                  ) : (
                    <span className="font-bold capitalize text-[#A6B2C5]">Estado: {pay.status}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <PaginationBar
        page={page}
        pageSize={pageSize}
        totalItems={filtered.length}
        onPageChange={setPage}
        onPageSizeChange={(n) => {
          setPageSize(n);
          setPage(1);
        }}
      />
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* 4. ANÚNCIOS (PLATAFORMA, EXTERNO SEM LOJA E LOJA COM PLANO PAGO)           */
/* -------------------------------------------------------------------------- */
export interface AdminAdFormPayload {
  advertiserType: AdAdvertiserType;
  advertiserName?: string;
  title: string;
  subtitle: string;
  storeId?: string;
  productId?: string;
  destinationType: AdDestinationType;
  destinationValue: string;
  position: AdPosition;
  mediaType: "imagem" | "video";
  imageUrl: string;
  videoUrl?: string;
  startDate: string;
  endDate: string;
  paymentAmountKz?: number;
  paymentMethod?: MerchantPayment["method"];
  paymentReference?: string;
  paymentProofUrl?: string;
}

function formatPositionLabel(pos: AdPosition): string {
  switch (pos) {
    case "faixa":
      return "Faixa inferior";
    case "topo":
      return "Topo (Início)";
    case "categoria":
      return "Categorias";
    case "pesquisa":
      return "Pesquisa";
    case "ecra_inteiro":
      return "Ecrã inteiro";
    default:
      return pos;
  }
}

function formatAdvertiserLabel(ad: SponsoredAd): string {
  const type = resolveAdAdvertiserType(ad);
  if (type === "plataforma") return "Plataforma";
  if (type === "externo") return "Externo";
  return "Loja";
}

export const AdsSection: React.FC<{
  ads: SponsoredAd[];
  stores: Store[];
  products?: Product[];
  defaultAdvertiserType?: AdAdvertiserType;
  onCreateAd: (payload: AdminAdFormPayload) => Promise<void>;
  onUpdateAd?: (id: string, payload: AdminAdFormPayload) => Promise<void>;
  onToggleAd: (ad: SponsoredAd, nextActive: boolean) => void;
  onDeleteAd: (ad: SponsoredAd) => void;
}> = ({
  ads,
  stores,
  products = [],
  defaultAdvertiserType = "plataforma",
  onCreateAd,
  onUpdateAd,
  onToggleAd,
  onDeleteAd,
}) => {
  const todayIso = () => new Date().toISOString().slice(0, 10);
  const plusDaysIso = (d: number) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);

  const formRef = useRef<HTMLFormElement | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  const paidStores = useMemo(() => stores.filter((s) => storeHasActivePaidPlan(s)), [stores]);
  const activeStores = useMemo(() => stores.filter((s) => s.isApproved && !s.isSuspended), [stores]);
  const approvedProducts = useMemo(() => products.filter((p) => p.isApproved !== false), [products]);

  const [editingAdId, setEditingAdId] = useState<string | null>(null);
  const [advertiserType, setAdvertiserType] = useState<AdAdvertiserType>(defaultAdvertiserType);
  const [advertiserName, setAdvertiserName] = useState(
    defaultAdvertiserType === "plataforma" ? "Mercado Uíge" : ""
  );
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [storeId, setStoreId] = useState("");
  const [productId, setProductId] = useState("");
  const [destinationType, setDestinationType] = useState<AdDestinationType>(
    defaultAdvertiserType === "loja" ? "loja" : "link"
  );
  const [destinationValue, setDestinationValue] = useState("");
  const [position, setPosition] = useState<AdPosition>("faixa");
  const [mediaType, setMediaType] = useState<"imagem" | "video">("imagem");
  const [imageUrl, setImageUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [startDate, setStartDate] = useState(todayIso);
  const [endDate, setEndDate] = useState(() => plusDaysIso(15));

  // Pagamento de anunciante externo (registado em Pagamentos)
  const [paymentAmountKz, setPaymentAmountKz] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<MerchantPayment["method"]>("Transferência");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentProofUrl, setPaymentProofUrl] = useState("");

  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [mediaError, setMediaError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [search, setSearch] = useState("");
  const [posFilter, setPosFilter] = useState("todos");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ads.filter((a) => {
      if (posFilter !== "todos" && a.position !== posFilter) return false;
      if (q) {
        return (
          a.title.toLowerCase().includes(q) ||
          (a.advertiserName || "").toLowerCase().includes(q) ||
          (a.storeName || "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [ads, search, posFilter]);

  const paged = useMemo(() => filtered.slice((page - 1) * pageSize, page * pageSize), [filtered, page, pageSize]);

  const resetForm = () => {
    setEditingAdId(null);
    setAdvertiserType("plataforma");
    setAdvertiserName("Mercado Uíge");
    setTitle("");
    setSubtitle("");
    setStoreId("");
    setProductId("");
    setDestinationType("loja");
    setDestinationValue("");
    setPosition("faixa");
    setMediaType("imagem");
    setImageUrl("");
    setVideoUrl("");
    setStartDate(todayIso());
    setEndDate(plusDaysIso(15));
    setPaymentAmountKz("");
    setPaymentMethod("Transferência");
    setPaymentReference("");
    setPaymentProofUrl("");
    setMediaError("");
  };

  const handleSelectAdvertiserType = (nextType: AdAdvertiserType) => {
    setAdvertiserType(nextType);
    setMediaError("");
    if (nextType === "plataforma") {
      setAdvertiserName("Mercado Uíge");
      setStoreId("");
    } else if (nextType === "externo") {
      setAdvertiserName(advertiserName === "Mercado Uíge" ? "" : advertiserName);
      setStoreId("");
      if (destinationType === "loja") {
        setDestinationType("link");
      }
    } else {
      setDestinationType("loja");
    }
  };

  const handleStartEdit = (ad: SponsoredAd) => {
    const type = resolveAdAdvertiserType(ad);
    setEditingAdId(ad.id);
    setAdvertiserType(type);
    setAdvertiserName(
      ad.advertiserName || (type === "plataforma" ? "Mercado Uíge" : ad.storeName || "")
    );
    setTitle(ad.title || "");
    setSubtitle(ad.subtitle || "");
    setStoreId(ad.storeId || "");
    setProductId(ad.productId || "");
    setDestinationType(ad.destinationType || (ad.productId ? "produto" : "loja"));
    setDestinationValue(ad.destinationValue || ad.storeId || ad.productId || "");
    setPosition(ad.position || "topo");
    setMediaType(ad.mediaType === "video" ? "video" : "imagem");
    setImageUrl(ad.imageUrl || "");
    setVideoUrl(ad.videoUrl || "");
    setStartDate((ad.startDate || todayIso()).slice(0, 10));
    setEndDate((ad.endDate || plusDaysIso(15)).slice(0, 10));
    setPaymentAmountKz(ad.paymentAmountKz ? String(ad.paymentAmountKz) : "");
    setPaymentProofUrl(ad.paymentProofUrl || "");
    setMediaError("");
    formRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  };

  const handleFocusCreateFirst = () => {
    resetForm();
    formRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    titleInputRef.current?.focus();
  };

  const handleUploadAdImage = async (file: File) => {
    setMediaError("");
    setUploadingMedia(true);
    try {
      const { blob, dataUrl } = await compressImage(file);
      if (isSupabaseConfigured && navigator.onLine) {
        const res = await uploadMediaFile(blob, file.name || `ad_${Date.now()}.jpg`, "anuncios");
        if (res.error) throw res.error;
        if (!res.url) throw new Error("Não foi possível obter o URL público da imagem.");
        setImageUrl(res.url);
      } else {
        setImageUrl(dataUrl);
      }
    } catch (err: unknown) {
      setMediaError(translateErrorMessage(err, "Falha ao carregar imagem do anúncio. Verifica o ficheiro e a ligação."));
    } finally {
      setUploadingMedia(false);
    }
  };

  const handleUploadAdVideo = async (file: File) => {
    setMediaError("");
    setUploadingMedia(true);
    try {
      const { blob, previewUrl } = await compressVideoOnDevice(file, {
        maxDurationSec: MAX_AD_VIDEO_DURATION_SEC,
        maxBytes: MAX_AD_VIDEO_BYTES,
        targetBytes: AD_VIDEO_TARGET_BYTES,
      });
      if (isSupabaseConfigured && navigator.onLine) {
        const res = await uploadMediaFile(blob, `ad_video_${Date.now()}.webm`, "anuncios");
        if (res.error) throw res.error;
        if (!res.url) throw new Error("Não foi possível obter o URL público do vídeo.");
        setVideoUrl(res.url);
      } else {
        setVideoUrl(previewUrl);
      }
    } catch (err: unknown) {
      setMediaError(
        translateErrorMessage(
          err,
          "Falha ao carregar vídeo (máx. 30 s e 20 MB). Verifica o ficheiro e tenta novamente."
        )
      );
    } finally {
      setUploadingMedia(false);
    }
  };

  const handleUploadExternalProof = async (file: File) => {
    setMediaError("");
    setUploadingMedia(true);
    try {
      const { blob, dataUrl } = await compressImage(file);
      if (isSupabaseConfigured && navigator.onLine) {
        const res = await uploadMediaFile(blob, file.name || `comprovativo_${Date.now()}.jpg`, "comprovativos");
        if (res.error) throw res.error;
        if (!res.url) throw new Error("Não foi possível obter o URL do comprovativo.");
        setPaymentProofUrl(res.url);
      } else {
        setPaymentProofUrl(dataUrl);
      }
    } catch (err: unknown) {
      setMediaError(translateErrorMessage(err, "Falha ao carregar o comprovativo do anunciante."));
    } finally {
      setUploadingMedia(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMediaError("");
    if (!title.trim()) {
      setMediaError("Indica o título da campanha.");
      return;
    }

    if (advertiserType === "externo" && !advertiserName.trim()) {
      setMediaError("Indica o nome do anunciante externo.");
      return;
    }

    if (advertiserType === "loja" && !storeId) {
      setMediaError("Seleciona uma loja com plano pago activo.");
      return;
    }

    const effectiveStoreId =
      advertiserType === "loja" ? storeId : destinationType === "loja" ? storeId : "";
    const effectiveProductId = destinationType === "produto" ? productId : "";

    const destCheck = validateSafeAdDestination(destinationType, destinationValue, {
      storeId: effectiveStoreId,
      productId: effectiveProductId,
    });
    if (!destCheck.ok) {
      setMediaError(destCheck.error || "Destino de anúncio inválido.");
      return;
    }

    if (mediaType === "video" && !videoUrl.trim()) {
      setMediaError("Carrega ou cola o link do vídeo promocional.");
      return;
    }

    if (new Date(endDate).getTime() < new Date(startDate).getTime()) {
      setMediaError("A data de fim deve ser igual ou posterior à data de início.");
      return;
    }

    const selectedStore = stores.find((s) => s.id === effectiveStoreId);
    const resolvedImage =
      imageUrl.trim() ||
      (advertiserType === "loja" ? selectedStore?.facadeImage || selectedStore?.logo || "" : "");

    const payload: AdminAdFormPayload = {
      advertiserType,
      advertiserName:
        advertiserType === "plataforma"
          ? advertiserName.trim() || "Mercado Uíge"
          : advertiserType === "externo"
          ? advertiserName.trim()
          : selectedStore?.name,
      title: title.trim(),
      subtitle: subtitle.trim(),
      storeId: effectiveStoreId || undefined,
      productId: effectiveProductId || undefined,
      destinationType,
      destinationValue: destCheck.normalizedValue || destinationValue.trim(),
      position,
      mediaType,
      imageUrl: resolvedImage,
      videoUrl: mediaType === "video" ? videoUrl.trim() : undefined,
      startDate: new Date(`${startDate}T00:00:00`).toISOString(),
      endDate: new Date(`${endDate}T23:59:59`).toISOString(),
      paymentAmountKz:
        advertiserType === "externo" && Number(paymentAmountKz) > 0
          ? Number(paymentAmountKz)
          : undefined,
      paymentMethod: advertiserType === "externo" ? paymentMethod : undefined,
      paymentReference: advertiserType === "externo" ? paymentReference.trim() : undefined,
      paymentProofUrl: advertiserType === "externo" ? paymentProofUrl.trim() || undefined : undefined,
    };

    setSubmitting(true);
    try {
      if (editingAdId && onUpdateAd) {
        await onUpdateAd(editingAdId, payload);
      } else {
        await onCreateAd(payload);
      }
      resetForm();
    } catch (err: unknown) {
      setMediaError(translateErrorMessage(err, "Não foi possível guardar o anúncio."));
    } finally {
      setSubmitting(false);
    }
  };

  const previewSponsorName =
    advertiserType === "plataforma"
      ? advertiserName.trim() || "Mercado Uíge"
      : advertiserType === "externo"
      ? advertiserName.trim() || "Anunciante Externo"
      : stores.find((s) => s.id === storeId)?.name || "Loja Patrocinada";

  const previewPoster =
    imageUrl.trim() ||
    (advertiserType === "loja"
      ? stores.find((s) => s.id === storeId)?.facadeImage || stores.find((s) => s.id === storeId)?.logo || ""
      : "");

  return (
    <div className="space-y-4 anim-fadeUp">
      <form
        ref={formRef}
        onSubmit={handleSubmit}
        className="p-4 rounded-2xl bg-[#172338] border border-[#26354B] space-y-4 text-xs"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-black text-sm text-white">
              {editingAdId ? "Editar Anúncio" : "Novo Anúncio"}
            </h3>
            <p className="text-[11px] text-[#A6B2C5]">
              Cria anúncios da plataforma Mercado Uíge, de anunciantes externos (sem loja) ou de lojas com plano pago activo.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setMediaType("imagem")}
              className={`px-3 py-1.5 rounded-lg font-bold inline-flex items-center gap-1.5 cursor-pointer ${
                mediaType === "imagem" ? "bg-[#246BFD] text-white" : "bg-[#111D30] text-[#A6B2C5] border border-[#26354B]"
              }`}
            >
              <ImageIcon size={13} /> Imagem
            </button>
            <button
              type="button"
              onClick={() => setMediaType("video")}
              className={`px-3 py-1.5 rounded-lg font-bold inline-flex items-center gap-1.5 cursor-pointer ${
                mediaType === "video" ? "bg-[#246BFD] text-white" : "bg-[#111D30] text-[#A6B2C5] border border-[#26354B]"
              }`}
            >
              <Film size={13} /> Vídeo
            </button>
            {editingAdId && (
              <button
                type="button"
                onClick={resetForm}
                className="px-3 py-1.5 rounded-lg font-bold bg-slate-700/60 text-white cursor-pointer"
              >
                Cancelar edição
              </button>
            )}
          </div>
        </div>

        {/* 1. Tipo de anunciante (3 tipos) */}
        <div className="space-y-1.5">
          <label className="block text-[11px] font-bold text-[#A6B2C5]">Tipo de Anunciante</label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {[
              { id: "plataforma" as const, label: "Plataforma (Mercado Uíge)", desc: "Sem loja nem plano" },
              { id: "externo" as const, label: "Externo (Cliente sem loja)", desc: "Com nome + pagamento opcional" },
              { id: "loja" as const, label: "Loja (Com plano pago)", desc: `${paidStores.length} loja(s) elegível(is)` },
            ].map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleSelectAdvertiserType(opt.id)}
                className={`p-2.5 rounded-xl border text-left transition-colors cursor-pointer ${
                  advertiserType === opt.id
                    ? "bg-[#246BFD]/20 border-[#246BFD] text-white"
                    : "bg-[#111D30] border-[#26354B] text-[#A6B2C5]"
                }`}
              >
                <span className="font-black block">{opt.label}</span>
                <span className="text-[10px] opacity-80">{opt.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 2. Identificação, Título, Subtítulo e Posição */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <input
            ref={titleInputRef}
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Título da campanha *"
            className="p-2.5 rounded-xl bg-[#111D30] border border-[#26354B] text-white outline-none focus:border-[#246BFD]"
          />
          <input
            type="text"
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            placeholder="Subtítulo promocional"
            className="p-2.5 rounded-xl bg-[#111D30] border border-[#26354B] text-white outline-none focus:border-[#246BFD]"
          />

          {advertiserType === "loja" ? (
            <select
              required
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              className="p-2.5 rounded-xl bg-[#111D30] border border-[#26354B] text-white outline-none"
            >
              <option value="">
                {paidStores.length === 0 ? "Sem lojas com plano pago activo" : "Selecionar loja (plano pago) *"}
              </option>
              {paidStores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code || "LJ"} · {formatPlanType(s.planType)})
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              required={advertiserType === "externo"}
              value={advertiserName}
              onChange={(e) => setAdvertiserName(e.target.value)}
              placeholder={
                advertiserType === "plataforma"
                  ? "Nome exibido (Mercado Uíge)"
                  : "Nome do anunciante externo *"
              }
              className="p-2.5 rounded-xl bg-[#111D30] border border-[#26354B] text-white outline-none focus:border-[#246BFD]"
            />
          )}

          <select
            aria-label="Posição do anúncio"
            value={position}
            onChange={(e) => setPosition(e.target.value as AdPosition)}
            className="p-2.5 rounded-xl bg-[#111D30] border border-[#26354B] text-white outline-none"
          >
            <option value="faixa">Posição: Faixa acima da barra</option>
            <option value="topo">Posição: Topo (Início)</option>
            <option value="categoria">Posição: Categorias</option>
            <option value="pesquisa">Posição: Pesquisa</option>
            <option value="ecra_inteiro">Posição: Ecrã inteiro</option>
          </select>
        </div>

        {/* 3. Destino e Datas */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
          <div>
            <label className="block text-[11px] font-bold text-[#A6B2C5] mb-1">Tipo de Destino</label>
            <select
              aria-label="Tipo de destino do anúncio"
              value={destinationType}
              onChange={(e) => {
                setDestinationType(e.target.value as AdDestinationType);
                setMediaError("");
              }}
              className="w-full p-2.5 rounded-xl bg-[#111D30] border border-[#26354B] text-white outline-none"
            >
              <option value="loja">Abrir Loja</option>
              <option value="produto">Abrir Artigo / Produto</option>
              <option value="link">Link Externo (só https://)</option>
              <option value="whatsapp">WhatsApp</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-[#A6B2C5] mb-1">
              {destinationType === "link"
                ? "URL Externa (https://) *"
                : destinationType === "whatsapp"
                ? "Número WhatsApp (9 dígitos) *"
                : destinationType === "produto"
                ? "Artigo de Destino *"
                : "Loja de Destino *"}
            </label>
            {destinationType === "loja" ? (
              <select
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
                className="w-full p-2.5 rounded-xl bg-[#111D30] border border-[#26354B] text-white outline-none"
              >
                <option value="">Selecionar loja de destino</option>
                {(advertiserType === "loja" ? paidStores : activeStores).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.code || "LJ"})
                  </option>
                ))}
              </select>
            ) : destinationType === "produto" ? (
              <select
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                className="w-full p-2.5 rounded-xl bg-[#111D30] border border-[#26354B] text-white outline-none"
              >
                <option value="">
                  {approvedProducts.length === 0 ? "Sem artigos disponíveis" : "Selecionar artigo *"}
                </option>
                {approvedProducts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({fmtKz(p.price)})
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={destinationValue}
                onChange={(e) => setDestinationValue(e.target.value)}
                placeholder={destinationType === "link" ? "https://empresa.ao/promo" : "923000000"}
                className="w-full p-2.5 rounded-xl bg-[#111D30] border border-[#26354B] text-white outline-none focus:border-[#246BFD]"
              />
            )}
          </div>

          <div>
            <label className="block text-[11px] font-bold text-[#A6B2C5] mb-1">Data de início</label>
            <input
              type="date"
              required
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full p-2.5 rounded-xl bg-[#111D30] border border-[#26354B] text-white outline-none"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-[#A6B2C5] mb-1">Data de fim</label>
            <input
              type="date"
              required
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full p-2.5 rounded-xl bg-[#111D30] border border-[#26354B] text-white outline-none"
            />
          </div>
        </div>

        {/* 4. Mídia (Upload de Imagem ou Vídeo) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-end">
          <div className="flex gap-2 items-center">
            <input
              type="text"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder={mediaType === "video" ? "Capa/poster (opcional)" : "URL ou carregar imagem"}
              className="flex-1 min-w-0 p-2.5 rounded-xl bg-[#111D30] border border-[#26354B] text-white outline-none"
            />
            <label className="px-3 py-2.5 rounded-xl bg-[#111D30] border border-[#26354B] text-[#B7F34A] font-bold cursor-pointer inline-flex items-center gap-1 shrink-0">
              <Upload size={13} /> Foto
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUploadAdImage(f);
                  e.target.value = "";
                }}
              />
            </label>
          </div>

          {mediaType === "video" && (
            <div className="space-y-1">
              <div className="flex gap-2 items-center">
                <input
                  type="text"
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  placeholder="URL do vídeo (ou carrega mp4/webm)"
                  className="flex-1 min-w-0 p-2.5 rounded-xl bg-[#111D30] border border-[#26354B] text-white outline-none"
                />
                <label className="px-3 py-2.5 rounded-xl bg-[#111D30] border border-[#26354B] text-[#B7F34A] font-bold cursor-pointer inline-flex items-center gap-1 shrink-0">
                  <Film size={13} /> Vídeo
                  <input
                    type="file"
                    accept="video/mp4,video/webm,video/quicktime"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleUploadAdVideo(f);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
              <p className="text-[10px] text-[#A6B2C5]">
                Vídeo até 30 s e 20 MB (comprimido no dispositivo para ~8 MB).
              </p>
            </div>
          )}
        </div>

        {/* 5. Pagamento de Anunciante Externo -> Pagamentos */}
        {advertiserType === "externo" && !editingAdId && (
          <div className="p-3 rounded-xl bg-[#111D30] border border-[#26354B] space-y-2">
            <span className="font-bold text-[#B7F34A] block">
              Pagamento do Anunciante Externo (registado automaticamente em Pagamentos)
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              <input
                type="number"
                min={0}
                value={paymentAmountKz}
                onChange={(e) => setPaymentAmountKz(e.target.value)}
                placeholder="Valor pago (Kz)"
                className="p-2 rounded-lg bg-[#07111F] border border-[#26354B] text-white outline-none"
              />
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as MerchantPayment["method"])}
                className="p-2 rounded-lg bg-[#07111F] border border-[#26354B] text-white outline-none"
              >
                <option value="Transferência">Transferência</option>
                <option value="Multicaixa Express">Multicaixa Express</option>
                <option value="Referência">Referência</option>
              </select>
              <input
                type="text"
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
                placeholder="Referência / Borderô"
                className="p-2 rounded-lg bg-[#07111F] border border-[#26354B] text-white outline-none"
              />
              <div className="flex gap-1.5 items-center">
                <input
                  type="text"
                  value={paymentProofUrl}
                  onChange={(e) => setPaymentProofUrl(e.target.value)}
                  placeholder="Comprovativo (URL ou foto)"
                  className="flex-1 min-w-0 p-2 rounded-lg bg-[#07111F] border border-[#26354B] text-white outline-none"
                />
                <label className="px-2.5 py-2 rounded-lg bg-[#172338] border border-[#26354B] text-[#B7F34A] font-bold cursor-pointer inline-flex items-center gap-1 shrink-0">
                  <Upload size={12} />
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleUploadExternalProof(f);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
            </div>
          </div>
        )}

        {/* 6. Pré-visualização ao vivo */}
        <div
          data-testid="admin-ad-preview"
          className="p-3 rounded-xl bg-[#07111F] border border-[#246BFD]/35 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
        >
          <div className="space-y-1 min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="px-2 py-0.5 rounded bg-[#B7F34A] text-slate-950 font-black text-[10px] uppercase">
                Patrocinado
              </span>
              <span className="text-[11px] font-bold text-[#A6B2C5]">
                Pré-visualização · {previewSponsorName} · {formatPositionLabel(position)}
              </span>
            </div>
            <p className="font-black text-sm text-white truncate">
              {title.trim() || "Título do teu anúncio"}
            </p>
            {subtitle.trim() && (
              <p className="text-[11px] text-[#A6B2C5] truncate">{subtitle.trim()}</p>
            )}
          </div>

          {(mediaType === "video" ? videoUrl.trim() : previewPoster) && (
            <div className="w-full sm:w-44 h-24 rounded-lg overflow-hidden bg-[#111D30] border border-[#26354B] shrink-0">
              {mediaType === "video" && videoUrl.trim() ? (
                <video
                  src={videoUrl.trim()}
                  poster={previewPoster || undefined}
                  controls
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                />
              ) : (
                <img
                  src={previewPoster}
                  alt="Pré-visualização do anúncio"
                  className="w-full h-full object-cover"
                />
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] text-[#A6B2C5]">
            {mediaType === "video"
              ? "Em vídeo: autoplay sem som com controlo de som; em dados móveis exibe só a capa com botão Reproduzir."
              : "Apenas links externos seguros com https:// são aceites."}
          </span>
          <button
            type="submit"
            disabled={submitting || uploadingMedia || (advertiserType === "loja" && paidStores.length === 0)}
            className="px-4 py-2.5 rounded-xl bg-[#B7F34A] text-slate-950 font-black flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Plus size={14} />
            {uploadingMedia
              ? "A processar ficheiro…"
              : submitting
              ? "A guardar…"
              : editingAdId
              ? "Guardar Alterações"
              : mediaType === "video"
              ? "Publicar Anúncio em Vídeo"
              : "Publicar Anúncio"}
          </button>
        </div>

        {mediaError && (
          <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 font-bold text-xs">
            {mediaError}
          </div>
        )}
      </form>

      <TableToolbar
        title="Anúncios Patrocinados"
        subtitle="Controlo de campanhas da plataforma, anunciantes externos e lojas com plano pago."
        search={search}
        onSearchChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        searchPlaceholder="Pesquisar por título, anunciante ou loja..."
        filterValue={posFilter}
        onFilterChange={(v) => {
          setPosFilter(v);
          setPage(1);
        }}
        filterOptions={[
          { value: "todos", label: "Todas as posições" },
          { value: "faixa", label: "Faixa inferior" },
          { value: "topo", label: "Topo" },
          { value: "categoria", label: "Categoria" },
          { value: "pesquisa", label: "Pesquisa" },
          { value: "ecra_inteiro", label: "Ecrã inteiro" },
        ]}
        onExportCsv={() =>
          downloadCsv(
            "anuncios-mercado-uige",
            ["Título", "Tipo Anunciante", "Anunciante / Loja", "Destino", "Mídia", "Posição", "Visualizações", "Cliques", "Estado", "Início", "Fim"],
            filtered.map((a) => [
              a.title,
              formatAdvertiserLabel(a),
              a.advertiserName || a.storeName || "Mercado Uíge",
              `${a.destinationType || "loja"}: ${a.destinationValue || a.storeId || a.productId || ""}`,
              a.mediaType === "video" ? "Vídeo" : "Imagem",
              formatPositionLabel(a.position),
              a.views,
              a.clicks,
              a.active ? "Activo" : a.status,
              fmtDate(a.startDate),
              fmtDate(a.endDate),
            ])
          )
        }
        totalFiltered={filtered.length}
      />

      {ads.length === 0 ? (
        <div className="p-8 text-center rounded-2xl bg-[#172338] border border-[#26354B] space-y-3">
          <p className="font-bold text-sm text-white">Ainda não há anúncios criados.</p>
          <p className="text-xs text-[#A6B2C5] max-w-md mx-auto">
            Cria campanhas da própria plataforma Mercado Uíge, de anunciantes externos ou de lojas parceiras com plano pago activo.
          </p>
          <button
            type="button"
            onClick={handleFocusCreateFirst}
            className="px-4 py-2.5 rounded-xl bg-[#B7F34A] text-slate-950 font-black text-xs inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Plus size={14} /> Criar o primeiro anúncio
          </button>
        </div>
      ) : paged.length === 0 ? (
        <div className="p-8 text-center rounded-2xl bg-[#172338] border border-[#26354B] text-xs text-[#A6B2C5]">
          Nenhum anúncio encontrado com os filtros aplicados.
        </div>
      ) : (
        <>
          <div className="hidden md:block rounded-2xl border border-[#26354B] bg-[#172338] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#111D30] text-[#A6B2C5] uppercase font-bold">
                  <tr>
                    <th className="p-3.5">Campanha / Anunciante</th>
                    <th className="p-3.5">Mídia / Posição</th>
                    <th className="p-3.5">Métricas</th>
                    <th className="p-3.5">Datas</th>
                    <th className="p-3.5">Estado</th>
                    <th className="p-3.5 text-right">Acções</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#26354B]">
                  {paged.map((ad) => (
                    <tr key={ad.id} className="hover:bg-[#111D30]/40">
                      <td className="p-3.5">
                        <span className="font-bold text-white block">{ad.title}</span>
                        <span className="text-[#A6B2C5] inline-flex items-center gap-1.5">
                          <span className="px-1.5 py-0.5 rounded bg-[#246BFD]/15 text-blue-200 text-[10px] font-bold">
                            {formatAdvertiserLabel(ad)}
                          </span>
                          <span>{ad.advertiserName || ad.storeName || "Mercado Uíge"}</span>
                        </span>
                      </td>
                      <td className="p-3.5">
                        <div className="flex items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded bg-[#111D30] border border-[#26354B] text-[10px] font-bold text-slate-200 inline-flex items-center gap-1">
                            {ad.mediaType === "video" ? <Film size={11} className="text-[#B7F34A]" /> : <ImageIcon size={11} className="text-[#246BFD]" />}
                            {ad.mediaType === "video" ? "Vídeo" : "Imagem"}
                          </span>
                          <span className="font-black text-[#246BFD]">{formatPositionLabel(ad.position)}</span>
                        </div>
                      </td>
                      <td className="p-3.5 text-[#A6B2C5] tabular-nums">
                        <span className="inline-flex items-center gap-1 mr-3">
                          <Eye size={13} /> {ad.views}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <MousePointerClick size={13} /> {ad.clicks}
                        </span>
                      </td>
                      <td className="p-3.5 text-[#A6B2C5] whitespace-nowrap">
                        {fmtDate(ad.startDate)} → {fmtDate(ad.endDate)}
                      </td>
                      <td className="p-3.5 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-black capitalize ${
                            ad.active && ad.status === "aprovado"
                              ? "bg-emerald-500/20 text-emerald-400"
                              : "bg-amber-500/20 text-amber-300"
                          }`}
                        >
                          {ad.active && ad.status === "aprovado" ? "Activo" : ad.status}
                        </span>
                      </td>
                      <td className="p-3.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          {onUpdateAd && (
                            <button
                              type="button"
                              onClick={() => handleStartEdit(ad)}
                              className="px-2.5 py-1 rounded-lg bg-[#111D30] border border-[#26354B] text-white font-bold inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Pencil size={11} /> Editar
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onToggleAd(ad, !ad.active)}
                            className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer ${
                              ad.active
                                ? "bg-amber-500/15 text-amber-300"
                                : "bg-emerald-500 text-slate-950 font-black"
                            }`}
                          >
                            {ad.active ? "Pausar" : "Activar"}
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteAd(ad)}
                            className="px-2.5 py-1 rounded-lg bg-red-500/15 text-red-400 font-bold cursor-pointer"
                          >
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="md:hidden space-y-3">
            {paged.map((ad) => (
              <div key={ad.id} className="p-4 rounded-2xl bg-[#172338] border border-[#26354B] space-y-2 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="font-bold text-white block">{ad.title}</span>
                    <span className="text-[#A6B2C5]">
                      {formatAdvertiserLabel(ad)} · {ad.advertiserName || ad.storeName || "Mercado Uíge"} ·{" "}
                      {ad.mediaType === "video" ? "Vídeo" : "Imagem"} · {formatPositionLabel(ad.position)}
                    </span>
                  </div>
                  <span className="text-[11px] text-[#A6B2C5] shrink-0">
                    {fmtDate(ad.startDate)} → {fmtDate(ad.endDate)}
                  </span>
                </div>
                <div className="flex gap-4 text-[#A6B2C5] tabular-nums">
                  <span>{ad.views} vistas</span>
                  <span>{ad.clicks} cliques</span>
                </div>
                <div className="pt-2 border-t border-[#26354B] flex gap-2">
                  {onUpdateAd && (
                    <button
                      type="button"
                      onClick={() => handleStartEdit(ad)}
                      className="px-3 py-1.5 rounded-lg bg-[#111D30] border border-[#26354B] text-white font-bold cursor-pointer"
                    >
                      Editar
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onToggleAd(ad, !ad.active)}
                    className="flex-1 py-1.5 rounded-lg bg-[#246BFD] text-white font-bold cursor-pointer"
                  >
                    {ad.active ? "Pausar" : "Activar"}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteAd(ad)}
                    className="px-3 py-1.5 rounded-lg bg-red-500/15 text-red-400 font-bold cursor-pointer"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <PaginationBar
        page={page}
        pageSize={pageSize}
        totalItems={filtered.length}
        onPageChange={setPage}
        onPageSizeChange={(n) => {
          setPageSize(n);
          setPage(1);
        }}
      />
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* 5. ENTREGAS E MENSALIDADES                                                 */
/* -------------------------------------------------------------------------- */
export const DeliveriesSection: React.FC<{
  currentUser: User;
  deliveries: DeliveryRecord[];
  courierFees: CourierMonthlyFee[];
  onPreviewImage: (url: string) => void;
  onConfirmMonthlyFee: (fee: CourierMonthlyFee) => void;
}> = ({ currentUser, deliveries, courierFees, onPreviewImage, onConfirmMonthlyFee }) => {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const canFin = isFinanceRole(currentUser.role);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return deliveries.filter((d) => {
      if (statusFilter === "atraso" && !d.hasDelay && d.status !== "Com problema") return false;
      else if (statusFilter !== "todos" && statusFilter !== "atraso" && d.status !== statusFilter) return false;
      if (q) {
        return (
          (d.orderCode || d.orderId).toLowerCase().includes(q) ||
          (d.storeName || "").toLowerCase().includes(q) ||
          (d.courierName || "").toLowerCase().includes(q) ||
          (d.deliveryAddress || "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [deliveries, search, statusFilter]);

  const paged = useMemo(() => filtered.slice((page - 1) * pageSize, page * pageSize), [filtered, page, pageSize]);

  return (
    <div className="space-y-5 anim-fadeUp">
      <TableToolbar
        title="Monitorização de Entregas, Atrasos e Ocorrências"
        subtitle="Acompanha o estado em tempo real, comissões cobradas e ocorrências reportadas."
        search={search}
        onSearchChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        searchPlaceholder="Pesquisar por código encomenda, entregador, loja ou morada..."
        filterValue={statusFilter}
        onFilterChange={(v) => {
          setStatusFilter(v);
          setPage(1);
        }}
        filterOptions={[
          { value: "todos", label: "Todos os estados" },
          { value: "atraso", label: "Apenas Atrasos / Problemas" },
          { value: "Pedido", label: "Pedido" },
          { value: "Aceite pelo entregador", label: "Aceite pelo entregador" },
          { value: "Recolhido", label: "Recolhido" },
          { value: "A caminho", label: "A caminho" },
          { value: "Entregue", label: "Entregue" },
          { value: "Com problema", label: "Com problema" },
        ]}
        onExportCsv={() =>
          downloadCsv(
            "entregas-mercado-uige",
            ["Encomenda", "Loja", "Entregador", "Destino", "Taxa (Kz)", "Comissão (Kz)", "Estado", "Atraso", "Data"],
            filtered.map((d) => [
              d.orderCode || d.orderId,
              d.storeName || "",
              d.courierName || "Pendente",
              d.deliveryAddress,
              d.deliveryFee,
              d.commissionCharged ? d.commissionAmount : 0,
              d.status,
              d.hasDelay ? "Sim" : "Não",
              fmtDateTime(d.createdAt),
            ])
          )
        }
        totalFiltered={filtered.length}
      />

      {paged.length === 0 ? (
        <div className="p-8 text-center rounded-2xl bg-[#172338] border border-[#26354B] text-xs text-[#A6B2C5]">
          Nenhuma entrega registada neste filtro.
        </div>
      ) : (
        <>
          <div className="hidden md:block rounded-2xl border border-[#26354B] bg-[#172338] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#111D30] text-[#A6B2C5] uppercase font-bold">
                  <tr>
                    <th className="p-3.5">Encomenda</th>
                    <th className="p-3.5">Loja / Destino</th>
                    <th className="p-3.5">Entregador</th>
                    <th className="p-3.5">Taxa / Comissão</th>
                    <th className="p-3.5">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#26354B]">
                  {paged.map((d) => (
                    <tr key={d.id} className="hover:bg-[#111D30]/40">
                      <td className="p-3.5 font-black text-[#B7F34A] whitespace-nowrap">
                        #{d.orderCode || d.orderId.slice(0, 6)}
                      </td>
                      <td className="p-3.5">
                        <span className="font-bold text-white block">{d.storeName || "Loja Uíge"}</span>
                        <span className="text-[#A6B2C5]">{d.deliveryAddress}</span>
                        {d.issueDescription && (
                          <span className="block text-amber-300 font-bold mt-0.5">{d.issueDescription}</span>
                        )}
                      </td>
                      <td className="p-3.5 text-white">{d.courierName || "A aguardar"}</td>
                      <td className="p-3.5 tabular-nums whitespace-nowrap">
                        <span className="font-bold text-white block">{fmtKz(d.deliveryFee)}</span>
                        <span className="text-[11px] text-[#A6B2C5]">
                          Comissão: {d.commissionCharged ? fmtKz(d.commissionAmount) : "Após entrega"}
                        </span>
                      </td>
                      <td className="p-3.5 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded bg-[#246BFD]/20 text-blue-200 font-bold">{d.status}</span>
                        {(d.hasDelay || d.status === "Com problema") && (
                          <span className="block mt-1 text-[10px] font-black text-red-400">Atraso / Problema</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="md:hidden space-y-3">
            {paged.map((d) => (
              <div key={d.id} className="p-4 rounded-2xl bg-[#172338] border border-[#26354B] space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-black text-[#B7F34A]">#{d.orderCode || d.orderId.slice(0, 6)}</span>
                  <span className="px-2 py-0.5 rounded bg-[#246BFD]/20 text-blue-200 font-bold">{d.status}</span>
                </div>
                <p className="text-white font-semibold">{d.storeName || "Loja"} → {d.deliveryAddress}</p>
                <p className="text-[#A6B2C5]">
                  Entregador: {d.courierName || "A aguardar"} · Taxa {fmtKz(d.deliveryFee)}
                </p>
                {d.issueDescription && <p className="text-amber-300 font-bold">{d.issueDescription}</p>}
              </div>
            ))}
          </div>
        </>
      )}

      <PaginationBar
        page={page}
        pageSize={pageSize}
        totalItems={filtered.length}
        onPageChange={setPage}
        onPageSizeChange={(n) => {
          setPageSize(n);
          setPage(1);
        }}
      />

      {/* Mensalidades dos Entregadores */}
      <div className="p-4 rounded-2xl bg-[#172338] border border-[#26354B] space-y-3 text-xs">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-black text-sm text-white flex items-center gap-2">
            <Truck size={15} className="text-[#B7F34A]" /> Controlo de Mensalidades da Equipa ({courierFees.length})
          </h3>
        </div>
        {courierFees.length === 0 ? (
          <p className="text-[#A6B2C5]">Sem mensalidades registadas até ao momento.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {courierFees.map((f) => (
              <div
                key={f.id}
                className="p-3 rounded-xl bg-[#111D30] border border-[#26354B] flex items-center justify-between gap-2"
              >
                <div>
                  <span className="font-bold text-white block">
                    {f.courierName || "Entregador"} · {f.referenceMonth}
                  </span>
                  <span className="text-[#B7F34A] font-black tabular-nums">{fmtKz(f.amountKz)}</span>
                  {f.proofUrl && (
                    <button
                      type="button"
                      onClick={() => onPreviewImage(f.proofUrl!)}
                      className="ml-2 text-[#246BFD] underline cursor-pointer"
                    >
                      Comprovativo
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {canFin && f.status !== "pago" && (
                    <button
                      type="button"
                      onClick={() => onConfirmMonthlyFee(f)}
                      className="px-3 py-1 rounded-lg bg-emerald-500 text-slate-950 font-black cursor-pointer"
                    >
                      Confirmar
                    </button>
                  )}
                  <span
                    className={`px-2 py-0.5 rounded font-black capitalize ${
                      f.status === "pago"
                        ? "bg-emerald-500/20 text-emerald-400"
                        : f.status === "atrasado"
                        ? "bg-red-500/20 text-red-400"
                        : "bg-amber-500/20 text-amber-300"
                    }`}
                  >
                    {f.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* 6. DENÚNCIAS                                                               */
/* -------------------------------------------------------------------------- */
export const ReportsSection: React.FC<{
  reports: ReportItem[];
  onResolveReport: (report: ReportItem, status: "resolvido" | "rejeitado") => void;
}> = ({ reports, onResolveReport }) => {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return reports.filter((r) => {
      if (statusFilter !== "todos" && r.status !== statusFilter) return false;
      if (q) {
        return (
          (r.storeName || "").toLowerCase().includes(q) ||
          (r.productName || "").toLowerCase().includes(q) ||
          (r.reason || "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [reports, search, statusFilter]);

  const paged = useMemo(() => filtered.slice((page - 1) * pageSize, page * pageSize), [filtered, page, pageSize]);

  return (
    <div className="space-y-4 anim-fadeUp">
      <TableToolbar
        title="Denúncias e Moderação"
        subtitle="Revê relatos contra lojas ou produtos. Lojas atingindo o limite configurado são suspensas no servidor."
        search={search}
        onSearchChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        searchPlaceholder="Pesquisar por loja, produto ou motivo..."
        filterValue={statusFilter}
        onFilterChange={(v) => {
          setStatusFilter(v);
          setPage(1);
        }}
        filterOptions={[
          { value: "todos", label: "Todos os estados" },
          { value: "pendente", label: "Abertas" },
          { value: "resolvido", label: "Resolvidas" },
          { value: "rejeitado", label: "Rejeitadas" },
        ]}
        onExportCsv={() =>
          downloadCsv(
            "denuncias-mercado-uige",
            ["Alvo", "Motivo", "Estado", "Data"],
            filtered.map((r) => [r.storeName || r.productName || "Relato", r.reason, r.status, fmtDateTime(r.createdAt)])
          )
        }
        totalFiltered={filtered.length}
      />

      {paged.length === 0 ? (
        <div className="p-8 text-center rounded-2xl bg-[#172338] border border-[#26354B] text-xs text-[#A6B2C5]">
          Nenhuma denúncia encontrada neste filtro.
        </div>
      ) : (
        <>
          <div className="hidden md:block rounded-2xl border border-[#26354B] bg-[#172338] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#111D30] text-[#A6B2C5] uppercase font-bold">
                  <tr>
                    <th className="p-3.5">Alvo</th>
                    <th className="p-3.5">Motivo</th>
                    <th className="p-3.5">Data</th>
                    <th className="p-3.5">Estado</th>
                    <th className="p-3.5 text-right">Acções</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#26354B]">
                  {paged.map((rep) => (
                    <tr key={rep.id} className="hover:bg-[#111D30]/40">
                      <td className="p-3.5 font-bold text-white">{rep.storeName ? `Loja: ${rep.storeName}` : rep.productName || "Denúncia"}</td>
                      <td className="p-3.5 text-[#A6B2C5]">{rep.reason}</td>
                      <td className="p-3.5 text-[#A6B2C5] whitespace-nowrap">{fmtDateTime(rep.createdAt)}</td>
                      <td className="p-3.5 capitalize font-bold text-white">{rep.status}</td>
                      <td className="p-3.5 text-right whitespace-nowrap">
                        {rep.status === "pendente" && (
                          <div className="inline-flex gap-1.5">
                            <button
                              type="button"
                              onClick={() => onResolveReport(rep, "resolvido")}
                              className="px-2.5 py-1 rounded-lg bg-emerald-500 text-slate-950 font-black cursor-pointer"
                            >
                              Resolver
                            </button>
                            <button
                              type="button"
                              onClick={() => onResolveReport(rep, "rejeitado")}
                              className="px-2.5 py-1 rounded-lg bg-[#111D30] border border-[#26354B] text-[#A6B2C5] font-bold cursor-pointer"
                            >
                              Rejeitar
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="md:hidden space-y-3">
            {paged.map((rep) => (
              <div key={rep.id} className="p-4 rounded-2xl bg-[#172338] border border-[#26354B] space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white">{rep.storeName || rep.productName || "Denúncia"}</span>
                  <span className="capitalize font-bold text-amber-300">{rep.status}</span>
                </div>
                <p className="text-[#A6B2C5]">{rep.reason}</p>
                {rep.status === "pendente" && (
                  <div className="pt-2 border-t border-[#26354B] flex gap-2">
                    <button
                      type="button"
                      onClick={() => onResolveReport(rep, "resolvido")}
                      className="flex-1 py-1.5 rounded-lg bg-emerald-500 text-slate-950 font-black cursor-pointer"
                    >
                      Resolver
                    </button>
                    <button
                      type="button"
                      onClick={() => onResolveReport(rep, "rejeitado")}
                      className="px-3 py-1.5 rounded-lg bg-[#111D30] border border-[#26354B] text-[#A6B2C5] font-bold cursor-pointer"
                    >
                      Rejeitar
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <PaginationBar
        page={page}
        pageSize={pageSize}
        totalItems={filtered.length}
        onPageChange={setPage}
        onPageSizeChange={(n) => {
          setPageSize(n);
          setPage(1);
        }}
      />
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* 7. AUDITORIA                                                               */
/* -------------------------------------------------------------------------- */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  LOGIN_ADMIN: "Acesso ao painel",
  SUSPEND_USER: "Suspensão de utilizador",
  UNSUSPEND_USER: "Reactivação de utilizador",
  APPROVE_USER: "Aprovação / Revisão de conta",
  REJECT_USER: "Rejeição de conta",
  REQUEST_CORRECTION_USER: "Pedido de correcção de conta",
  APPROVE_STORE: "Aprovação de loja",
  REJECT_STORE: "Rejeição de loja",
  REQUEST_CORRECTION_STORE: "Pedido de correcção de loja",
  SUSPEND_STORE: "Suspensão de loja",
  UNSUSPEND_STORE: "Reactivação de loja",
  SET_STORE_VIP: "Atribuição de selo VIP",
  UNSET_STORE_VIP: "Remoção de selo VIP",
  DELETE_PRODUCT: "Remoção de artigo",
  RESOLVE_REPORT: "Resolução de denúncia",
  SEND_BROADCAST: "Envio de aviso provincial",
  REVIEW_PAYMENT: "Revisão de pagamento",
  REVIEW_AD: "Moderação de anúncio",
  CREATE_AD: "Criação de anúncio patrocinado",
  DELETE_AD: "Remoção de anúncio",
  UPDATE_CONFIG: "Alteração de configurações",
  CHANGE_ROLE: "Alteração de papel de equipa",
  REVIEW_COURIER_FEE: "Confirmação de mensalidade",
  TOGGLE_MAINTENANCE: "Modo de manutenção",
  BLOCK_FROM_SOC: "Bloqueio via Centro de Segurança",
};

export const AuditSection: React.FC<{
  auditLogs: AuditLogItem[];
  users: User[];
}> = ({ auditLogs, users }) => {
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("todas");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return auditLogs.filter((log) => {
      if (actionFilter !== "todas" && log.action !== actionFilter) return false;
      const actor = userMap.get(log.adminId);
      const actorStr = `${actor?.name || ""} ${actor?.email || ""} ${log.adminEmail || ""}`.toLowerCase();
      if (q) {
        return (
          actorStr.includes(q) ||
          (AUDIT_ACTION_LABELS[log.action] || log.action).toLowerCase().includes(q) ||
          (log.targetId || "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [auditLogs, search, actionFilter, userMap]);

  const paged = useMemo(() => filtered.slice((page - 1) * pageSize, page * pageSize), [filtered, page, pageSize]);

  return (
    <div className="space-y-4 anim-fadeUp">
      <TableToolbar
        title="Registo de Auditoria (Quem, O Quê, Quando)"
        subtitle="Todas as acções graves, aprovações, pagamentos e alterações de configuração ficam registadas."
        search={search}
        onSearchChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        searchPlaceholder="Pesquisar por responsável, acção ou alvo..."
        filterValue={actionFilter}
        onFilterChange={(v) => {
          setActionFilter(v);
          setPage(1);
        }}
        filterOptions={[
          { value: "todas", label: "Todas as acções" },
          ...Object.entries(AUDIT_ACTION_LABELS).map(([k, label]) => ({ value: k, label })),
        ]}
        onExportCsv={() =>
          downloadCsv(
            "auditoria-mercado-uige",
            ["Quando", "Quem", "O Quê", "Alvo"],
            filtered.map((l) => {
              const actor = userMap.get(l.adminId);
              return [fmtDateTime(l.createdAt), actor?.email || l.adminEmail, AUDIT_ACTION_LABELS[l.action] || l.action, l.targetId];
            })
          )
        }
        totalFiltered={filtered.length}
      />

      {paged.length === 0 ? (
        <div className="p-8 text-center rounded-2xl bg-[#172338] border border-[#26354B] text-xs text-[#A6B2C5]">
          Nenhum registo de auditoria encontrado.
        </div>
      ) : (
        <>
          <div className="hidden md:block rounded-2xl border border-[#26354B] bg-[#172338] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#111D30] text-[#A6B2C5] uppercase font-bold">
                  <tr>
                    <th className="p-3.5">Quando</th>
                    <th className="p-3.5">Quem</th>
                    <th className="p-3.5">O Quê</th>
                    <th className="p-3.5">Alvo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#26354B]">
                  {paged.map((log) => {
                    const actor = userMap.get(log.adminId);
                    return (
                      <tr key={log.id} className="hover:bg-[#111D30]/40">
                        <td className="p-3.5 text-[#A6B2C5] whitespace-nowrap">{fmtDateTime(log.createdAt)}</td>
                        <td className="p-3.5 text-white font-semibold">
                          {actor ? `${actor.name} (${actor.email})` : log.adminEmail}
                        </td>
                        <td className="p-3.5 font-bold text-[#B7F34A]">
                          {AUDIT_ACTION_LABELS[log.action] || log.action}
                        </td>
                        <td className="p-3.5 text-[#A6B2C5] truncate max-w-xs">{log.targetId || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="md:hidden space-y-2.5">
            {paged.map((log) => {
              const actor = userMap.get(log.adminId);
              return (
                <div key={log.id} className="p-3.5 rounded-2xl bg-[#172338] border border-[#26354B] space-y-1 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-[#B7F34A]">{AUDIT_ACTION_LABELS[log.action] || log.action}</span>
                    <span className="text-[11px] text-[#A6B2C5]">{fmtDateTime(log.createdAt)}</span>
                  </div>
                  <p className="text-white">{actor ? actor.email : log.adminEmail}</p>
                  <p className="text-[#A6B2C5] truncate">Alvo: {log.targetId || "—"}</p>
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
        onPageSizeChange={(n) => {
          setPageSize(n);
          setPage(1);
        }}
      />
    </div>
  );
};

// Satisfy unused icon import lint if any
void StoreIcon;
void CheckCircle2;
