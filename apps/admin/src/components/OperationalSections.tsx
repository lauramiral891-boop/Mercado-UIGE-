import React, { useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Ban,
  Check,
  Clock,
  Crown,
  Eye,
  Film,
  Image as ImageIcon,
  MousePointerClick,
  Pencil,
  Plus,
  Save,
  Send,
  Store as StoreIcon,
  Truck,
  CheckCircle2,
  Upload,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import {
  AD_VIDEO_TARGET_BYTES,
  AdAdvertiserType,
  AdDestinationType,
  AdPosition,
  AuditLogItem,
  BannerCategory,
  CourierMonthlyFee,
  DeliveryRecord,
  MAX_AD_VIDEO_BYTES,
  MAX_AD_VIDEO_DURATION_SEC,
  MerchantPayment,
  Product,
  ReportItem,
  ServerErrorDetail,
  SponsoredAd,
  Store,
  User,
  captureVideoFirstFrame,
  clampBannerDurationSec,
  compressBannerImage,
  compressImage,
  compressVideoOnDevice,
  computeAdCtrPercent,
  computeBannerDashboardStats,
  extractServerErrorDetail,
  fmtDate,
  fmtDateTime,
  fmtKz,
  formatLuandaDateTimeShort,
  formatPlanType,
  formatStoreType,
  formatUserRole,
  getNowLuandaInput,
  hasAdDestination,
  isBannerPaid,
  isFinanceRole,
  isModeratorRole,
  isSupabaseConfigured,
  luandaInputToUtcIso,
  resolveAdAdvertiserType,
  resolveAdLifecycleState,
  sortBannersForCarousel,
  storeHasActivePaidPlan,
  uploadMediaFile,
  utcIsoToLuandaInput,
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
  onVerifyStore?: (store: Store) => void;
  onToggleVip: (store: Store) => void;
}> = ({ currentUser, stores, onPreviewImage, onApproveStore, onSuspendStore, onVerifyStore, onToggleVip }) => {
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
                        <span
                          className={`block text-[10px] font-bold ${
                            s.verified ? "text-[#B7F34A]" : "text-[#A6B2C5]"
                          }`}
                        >
                          {s.verified ? "Loja verificada" : "Não verificada"}
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
                          {canMod && onVerifyStore && (
                            <button
                              type="button"
                              onClick={() => onVerifyStore(s)}
                              className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer border ${
                                s.verified
                                  ? "bg-[#B7F34A]/15 text-[#B7F34A] border-[#B7F34A]/40"
                                  : "bg-[#111D30] border-[#26354B] text-[#A6B2C5] hover:text-white"
                              }`}
                            >
                              {s.verified ? "Tirar verificação" : "Verificar"}
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
                  {canMod && onVerifyStore && (
                    <button
                      type="button"
                      onClick={() => onVerifyStore(s)}
                      className={`py-1.5 px-3 rounded-lg border font-bold cursor-pointer ${
                        s.verified
                          ? "bg-[#B7F34A]/15 text-[#B7F34A] border-[#B7F34A]/40"
                          : "border-[#26354B] text-[#A6B2C5]"
                      }`}
                    >
                      {s.verified ? "Tirar verificação" : "Verificar"}
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
  onBanUser?: (user: User) => void;
}> = ({ currentUser, users, onApproveUser, onSuspendUser, onBanUser }) => {
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
      if (statusFilter === "activos" && (u.isBanned || u.isSuspended || u.isApproved === false)) return false;
      if (statusFilter === "pendentes" && u.isApproved !== false) return false;
      if (statusFilter === "suspensos" && !u.isSuspended) return false;
      if (statusFilter === "banidos" && !u.isBanned) return false;

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
          { value: "banidos", label: "Banidos" },
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
                        {u.isBanned ? (
                          <div>
                            <span className="text-red-500 font-black block">Banido</span>
                            {u.banReason && (
                              <span className="text-[10px] text-[#A6B2C5] block max-w-[160px] truncate">
                                {u.banReason}
                              </span>
                            )}
                          </div>
                        ) : u.isSuspended ? (
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
                              <>
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
                                {onBanUser && (
                                  <button
                                    type="button"
                                    onClick={() => onBanUser(u)}
                                    className={`px-2.5 py-1 rounded-lg font-black cursor-pointer ${
                                      u.isBanned
                                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                                        : "bg-red-600 text-white"
                                    }`}
                                  >
                                    {u.isBanned ? "Desbanir" : "Banir"}
                                  </button>
                                )}
                              </>
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
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#26354B]">
                  <span className={u.isBanned || u.isSuspended ? "text-red-400 font-bold" : "text-emerald-400 font-bold"}>
                    {u.isBanned ? "Banido" : u.isSuspended ? "Suspenso" : u.isApproved === false ? "Pendente" : "Activo"}
                  </span>
                  {canMod && u.id !== currentUser.id && (
                    <div className="flex flex-wrap gap-2">
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
                      {onBanUser && (
                        <button
                          type="button"
                          onClick={() => onBanUser(u)}
                          className={`px-3 py-1 rounded-lg font-black cursor-pointer ${
                            u.isBanned
                              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                              : "bg-red-600 text-white"
                          }`}
                        >
                          {u.isBanned ? "Desbanir" : "Banir"}
                        </button>
                      )}
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
/* 4. BANNERS E PUBLICIDADE (PLATAFORMA, EXTERNO SEM LOJA E LOJA COM PLANO PAGO) */
/* -------------------------------------------------------------------------- */
export interface AdminAdFormPayload {
  advertiserType: AdAdvertiserType;
  advertiserName?: string;
  title: string;
  subtitle: string;
  description?: string;
  ctaText?: string;
  linkUrl?: string;
  order?: number;
  bannerCategory?: BannerCategory;
  priority?: number;
  durationSec?: number | null;
  isPaid?: boolean;
  storeId?: string;
  productId?: string;
  destinationType: AdDestinationType;
  destinationValue: string;
  position: AdPosition;
  mediaType: "imagem" | "video";
  imageUrl: string;
  videoUrl?: string;
  startDate: string | null;
  endDate: string | null;
  status?: SponsoredAd["status"];
  statusReason?: string | null;
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
      return "Carrossel Início (Topo)";
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

function formatBannerCategoryLabel(cat?: BannerCategory): string {
  if (cat === "publico") return "Público";
  if (cat === "promocional") return "Promocional";
  return "Patrocinado";
}

export const AdsSection: React.FC<{
  ads: SponsoredAd[];
  stores: Store[];
  products?: Product[];
  defaultAdvertiserType?: AdAdvertiserType;
  defaultBannerDurationSec?: number;
  onCreateAd: (payload: AdminAdFormPayload) => Promise<void>;
  onUpdateAd?: (id: string, payload: AdminAdFormPayload) => Promise<void>;
  onToggleAd: (ad: SponsoredAd, nextActive: boolean) => void;
  onReviewAd?: (ad: SponsoredAd, status: "aprovado" | "rejeitado") => void;
  onSuspendAd?: (ad: SponsoredAd, suspended: boolean) => void;
  onReorderAd?: (ad: SponsoredAd, delta: -1 | 1) => void;
  onDeleteAd: (ad: SponsoredAd) => void;
}> = ({
  ads,
  stores,
  products = [],
  defaultAdvertiserType = "plataforma",
  defaultBannerDurationSec = 8,
  onCreateAd,
  onUpdateAd,
  onToggleAd,
  onReviewAd,
  onSuspendAd,
  onReorderAd,
  onDeleteAd,
}) => {
  const defaultEndLuanda = () =>
    utcIsoToLuandaInput(new Date(Date.now() + 15 * 86400000).toISOString());

  const formRef = useRef<HTMLFormElement | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  const paidStores = useMemo(() => stores.filter((s) => storeHasActivePaidPlan(s)), [stores]);
  const activeStores = useMemo(() => stores.filter((s) => s.isApproved && !s.isSuspended), [stores]);
  const approvedProducts = useMemo(() => products.filter((p) => p.isApproved !== false), [products]);
  const stats = useMemo(() => computeBannerDashboardStats(ads, Date.now(), stores), [ads, stores]);

  const [editingAdId, setEditingAdId] = useState<string | null>(null);
  const [advertiserType, setAdvertiserType] = useState<AdAdvertiserType>(defaultAdvertiserType);
  const [advertiserName, setAdvertiserName] = useState(
    defaultAdvertiserType === "plataforma" ? "Mercado Uíge" : ""
  );
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [ctaText, setCtaText] = useState("");
  const [bannerCategory, setBannerCategory] = useState<BannerCategory>(
    defaultAdvertiserType === "plataforma" ? "publico" : "patrocinado"
  );
  const [order, setOrder] = useState("0");
  const [priority, setPriority] = useState("0");
  const [durationSec, setDurationSec] = useState("");
  const [isPaid, setIsPaid] = useState(defaultAdvertiserType !== "plataforma");
  const [storeId, setStoreId] = useState("");
  const [productId, setProductId] = useState("");
  const [destinationType, setDestinationType] = useState<AdDestinationType>(
    defaultAdvertiserType === "loja" ? "loja" : "nenhum"
  );
  const [destinationValue, setDestinationValue] = useState("");
  const [position, setPosition] = useState<AdPosition>("topo");
  const [mediaType, setMediaType] = useState<"imagem" | "video">("imagem");
  const [imageUrl, setImageUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [compressedImageInfo, setCompressedImageInfo] = useState<string | null>(null);
  const [compressedVideoInfo, setCompressedVideoInfo] = useState<string | null>(null);
  const [previewMuted, setPreviewMuted] = useState(true);
  const [previewProgress, setPreviewProgress] = useState(0);
  const [noDates, setNoDates] = useState(false);
  const [startLuanda, setStartLuanda] = useState(() => getNowLuandaInput());
  const [endLuanda, setEndLuanda] = useState(defaultEndLuanda);
  const [statusReason, setStatusReason] = useState("");

  // Pagamento de anunciante externo (registado em Pagamentos)
  const [paymentAmountKz, setPaymentAmountKz] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<MerchantPayment["method"]>("Transferência");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentProofUrl, setPaymentProofUrl] = useState("");

  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [mediaError, setMediaError] = useState<ServerErrorDetail | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [search, setSearch] = useState("");
  const [posFilter, setPosFilter] = useState("todos");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const now = Date.now();
    return sortBannersForCarousel(ads).filter((a) => {
      if (posFilter !== "todos" && a.position !== posFilter) return false;
      const lifecycle = resolveAdLifecycleState(a, stores, now);
      if (statusFilter === "activos" && lifecycle.key !== "activo") return false;
      if (statusFilter === "agendados" && lifecycle.key !== "agendado") return false;
      if (statusFilter === "rascunhos" && lifecycle.key !== "rascunho") return false;
      if (statusFilter === "pendentes" && lifecycle.key !== "pendente") return false;
      if (statusFilter === "expirados" && lifecycle.key !== "expirado") return false;
      if (statusFilter === "suspensos" && lifecycle.key !== "suspenso" && lifecycle.key !== "rejeitado") return false;
      if (statusFilter === "pagos" && !isBannerPaid(a)) return false;
      if (statusFilter === "gratuitos" && isBannerPaid(a)) return false;

      if (q) {
        return (
          (a.title || "").toLowerCase().includes(q) ||
          (a.description || a.subtitle || "").toLowerCase().includes(q) ||
          (a.advertiserName || "").toLowerCase().includes(q) ||
          (a.storeName || "").toLowerCase().includes(q) ||
          lifecycle.label.toLowerCase().includes(q) ||
          lifecycle.reason.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [ads, stores, search, posFilter, statusFilter]);

  const paged = useMemo(() => filtered.slice((page - 1) * pageSize, page * pageSize), [filtered, page, pageSize]);

  const resetForm = () => {
    setEditingAdId(null);
    setAdvertiserType(defaultAdvertiserType);
    setAdvertiserName(defaultAdvertiserType === "plataforma" ? "Mercado Uíge" : "");
    setTitle("");
    setSubtitle("");
    setCtaText("");
    setBannerCategory(defaultAdvertiserType === "plataforma" ? "publico" : "patrocinado");
    setOrder("0");
    setPriority("0");
    setDurationSec("");
    setIsPaid(defaultAdvertiserType !== "plataforma");
    setStoreId("");
    setProductId("");
    setDestinationType(defaultAdvertiserType === "loja" ? "loja" : "nenhum");
    setDestinationValue("");
    setPosition("topo");
    setMediaType("imagem");
    setImageUrl("");
    setVideoUrl("");
    setCompressedImageInfo(null);
    setCompressedVideoInfo(null);
    setPreviewMuted(true);
    setPreviewProgress(0);
    setNoDates(false);
    setStartLuanda(getNowLuandaInput());
    setEndLuanda(defaultEndLuanda());
    setStatusReason("");
    setPaymentAmountKz("");
    setPaymentMethod("Transferência");
    setPaymentReference("");
    setPaymentProofUrl("");
    setMediaError(null);
  };

  const handleSelectAdvertiserType = (nextType: AdAdvertiserType) => {
    setAdvertiserType(nextType);
    setMediaError(null);
    if (nextType === "plataforma") {
      setAdvertiserName("Mercado Uíge");
      setStoreId("");
      setBannerCategory("publico");
      setIsPaid(false);
      if (destinationType === "loja") {
        setDestinationType("nenhum");
      }
    } else if (nextType === "externo") {
      setAdvertiserName(advertiserName === "Mercado Uíge" ? "" : advertiserName);
      setStoreId("");
      setBannerCategory("patrocinado");
      setIsPaid(true);
      if (destinationType === "loja") {
        setDestinationType("nenhum");
      }
    } else {
      setDestinationType("loja");
      setBannerCategory("patrocinado");
      setIsPaid(true);
    }
  };

  const handleStartEdit = (ad: SponsoredAd) => {
    const type = resolveAdAdvertiserType(ad);
    const hasDates = Boolean(ad.startDate || ad.endDate);
    setEditingAdId(ad.id);
    setAdvertiserType(type);
    setAdvertiserName(
      ad.advertiserName || (type === "plataforma" ? "Mercado Uíge" : ad.storeName || "")
    );
    setTitle(ad.title || "");
    setSubtitle(ad.description ?? ad.subtitle ?? "");
    setCtaText(ad.ctaText || "");
    setBannerCategory(ad.bannerCategory || (type === "plataforma" ? "publico" : "patrocinado"));
    setOrder(String(ad.order ?? 0));
    setPriority(String(ad.priority ?? 0));
    setDurationSec(ad.durationSec ? String(ad.durationSec) : "");
    setIsPaid(isBannerPaid(ad));
    setStoreId(ad.storeId || "");
    setProductId(ad.productId || "");
    setDestinationType(
      ad.destinationType || (ad.productId ? "produto" : ad.storeId ? "loja" : ad.linkUrl ? "link" : "nenhum")
    );
    setDestinationValue(ad.destinationValue || ad.linkUrl || ad.storeId || ad.productId || "");
    setPosition(ad.position || "topo");
    setMediaType(ad.mediaType === "video" ? "video" : "imagem");
    setImageUrl(ad.imageUrl || "");
    setVideoUrl(ad.videoUrl || "");
    setCompressedImageInfo(null);
    setCompressedVideoInfo(null);
    setPreviewMuted(true);
    setPreviewProgress(0);
    setNoDates(!hasDates);
    setStartLuanda(ad.startDate ? utcIsoToLuandaInput(ad.startDate) : getNowLuandaInput());
    setEndLuanda(ad.endDate ? utcIsoToLuandaInput(ad.endDate) : "");
    setStatusReason(ad.statusReason || "");
    setPaymentAmountKz(ad.paymentAmountKz ? String(ad.paymentAmountKz) : "");
    setPaymentProofUrl(ad.paymentProofUrl || "");
    setMediaError(null);
    formRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  };

  const handleFocusCreateFirst = () => {
    resetForm();
    formRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    titleInputRef.current?.focus();
  };

  const handleUploadAdImage = async (file: File) => {
    setMediaError(null);
    setUploadingMedia(true);
    try {
      const { blob, dataUrl, sizeKB, width, height, mimeType } = await compressBannerImage(file);
      const ext = mimeType === "image/webp" ? "webp" : "jpg";
      const fmtLabel = mimeType === "image/webp" ? "WebP" : "JPEG";
      if (isSupabaseConfigured && navigator.onLine) {
        const res = await uploadMediaFile(blob, `banner_${width}x${height}_${Date.now()}.${ext}`, "anuncios");
        if (res.error) throw res.error;
        if (!res.url) throw new Error("O servidor não devolveu o URL público da imagem.");
        setImageUrl(res.url);
      } else {
        setImageUrl(dataUrl);
      }
      setCompressedImageInfo(`${sizeKB} KB · ${width}×${height} (${fmtLabel})`);
    } catch (err: unknown) {
      setMediaError(
        extractServerErrorDetail(
          err,
          "Falha ao carregar imagem do banner (recomendado 1600x900, 16:9, máx. 300 KB)."
        )
      );
    } finally {
      setUploadingMedia(false);
    }
  };

  const handleUploadAdVideo = async (file: File) => {
    setMediaError(null);
    setUploadingMedia(true);
    try {
      const { blob, previewUrl, durationSec: dur, sizeMB } = await compressVideoOnDevice(file, {
        maxDurationSec: MAX_AD_VIDEO_DURATION_SEC,
        maxBytes: MAX_AD_VIDEO_BYTES,
        targetBytes: AD_VIDEO_TARGET_BYTES,
      });

      if (isSupabaseConfigured && navigator.onLine) {
        const res = await uploadMediaFile(blob, `ad_video_${Date.now()}.webm`, "anuncios");
        if (res.error) throw res.error;
        if (!res.url) throw new Error("O servidor não devolveu o URL público do vídeo.");
        setVideoUrl(res.url);
      } else {
        setVideoUrl(previewUrl);
      }
      setCompressedVideoInfo(`${sizeMB} MB · ${dur}s`);

      // Gerar imagem de capa automática a partir do primeiro frame se ainda não houver capa
      if (!imageUrl.trim()) {
        try {
          const cover = await captureVideoFirstFrame(file);
          const ext = cover.mimeType === "image/webp" ? "webp" : "jpg";
          if (isSupabaseConfigured && navigator.onLine) {
            const coverRes = await uploadMediaFile(
              cover.blob,
              `banner_capa_${Date.now()}.${ext}`,
              "anuncios"
            );
            if (!coverRes.error && coverRes.url) {
              setImageUrl(coverRes.url);
              setCompressedImageInfo(`Capa automática: ${cover.sizeKB} KB · ${cover.width}×${cover.height}`);
            } else {
              setMediaError(
                extractServerErrorDetail(
                  coverRes.error || "Não foi possível guardar a capa automática do vídeo no Storage.",
                  "O vídeo foi carregado, mas falhou o envio da capa automática. Carrega uma imagem 16:9."
                )
              );
            }
          } else {
            setImageUrl(cover.dataUrl);
            setCompressedImageInfo(`Capa automática: ${cover.sizeKB} KB · ${cover.width}×${cover.height}`);
          }
        } catch {
          setMediaError({
            message:
              "O vídeo foi carregado, mas não foi possível extrair a capa automática. Carrega uma imagem de capa antes de publicar.",
            code: null,
          });
        }
      }
    } catch (err: unknown) {
      setMediaError(
        extractServerErrorDetail(
          err,
          "Falha ao carregar vídeo (máx. 15 s e 5 MB). Verifica o ficheiro e tenta novamente."
        )
      );
    } finally {
      setUploadingMedia(false);
    }
  };

  const handleUploadExternalProof = async (file: File) => {
    setMediaError(null);
    setUploadingMedia(true);
    try {
      const { blob, dataUrl } = await compressImage(file);
      if (isSupabaseConfigured && navigator.onLine) {
        const res = await uploadMediaFile(blob, file.name || `comprovativo_${Date.now()}.jpg`, "comprovativos");
        if (res.error) throw res.error;
        if (!res.url) throw new Error("O servidor não devolveu o URL do comprovativo.");
        setPaymentProofUrl(res.url);
      } else {
        setPaymentProofUrl(dataUrl);
      }
    } catch (err: unknown) {
      setMediaError(extractServerErrorDetail(err, "Falha ao carregar o comprovativo do anunciante."));
    } finally {
      setUploadingMedia(false);
    }
  };

  const submitAd = async (desiredStatus: "aprovado" | "rascunho", opts?: { publishNow?: boolean }) => {
    setMediaError(null);

    if (advertiserType === "externo" && !advertiserName.trim()) {
      setMediaError({ message: "Indica o nome do anunciante externo.", code: null });
      return;
    }

    if (advertiserType === "loja" && !storeId) {
      setMediaError({ message: "Seleciona uma loja com plano pago activo.", code: null });
      return;
    }

    const parsedDuration = durationSec.trim() ? Number(durationSec.trim()) : null;
    if (parsedDuration !== null && (!Number.isFinite(parsedDuration) || parsedDuration < 3 || parsedDuration > 60)) {
      setMediaError({
        message: "A duração do banner deve ficar entre 3 e 60 segundos (ou vazio para usar o padrão global).",
        code: null,
      });
      return;
    }

    const effectiveStoreId =
      advertiserType === "loja" ? storeId : destinationType === "loja" ? storeId : "";
    const effectiveProductId = destinationType === "produto" ? productId : "";

    // Link / destino é totalmente opcional quando deixado vazio (salvo se o utilizador introduzir algo inválido)
    const effectiveDestType: AdDestinationType =
      destinationType === "nenhum" ||
      ((destinationType === "link" || destinationType === "whatsapp") && !destinationValue.trim()) ||
      (destinationType === "loja" && !effectiveStoreId && advertiserType !== "loja") ||
      (destinationType === "produto" && !effectiveProductId)
        ? "nenhum"
        : destinationType;

    const destCheck = validateSafeAdDestination(effectiveDestType, destinationValue, {
      storeId: effectiveStoreId,
      productId: effectiveProductId,
    });
    if (!destCheck.ok) {
      setMediaError({ message: destCheck.error || "Destino do banner inválido.", code: null });
      return;
    }

    const selectedStore = stores.find((s) => s.id === effectiveStoreId);
    const resolvedImage =
      imageUrl.trim() ||
      (advertiserType === "loja" ? selectedStore?.facadeImage || selectedStore?.logo || "" : "");

    if (mediaType === "video") {
      if (!videoUrl.trim()) {
        setMediaError({
          message: "Obrigatório: carrega ou cola um vídeo para o banner (máx. 15 s e 5 MB).",
          code: null,
        });
        return;
      }
      if (!resolvedImage) {
        setMediaError({
          message: "Banners em vídeo exigem uma imagem de capa (carrega uma imagem 16:9 ou reenvia o vídeo).",
          code: null,
        });
        return;
      }
    } else if (!resolvedImage) {
      setMediaError({
        message: "Obrigatório: carrega ou cola a imagem do banner (recomendado 1600x900, 16:9).",
        code: null,
      });
      return;
    }

    let resolvedStartIso: string | null = null;
    let resolvedEndIso: string | null = null;

    if (opts?.publishNow) {
      const nowIso = new Date().toISOString();
      setNoDates(false);
      setStartLuanda(getNowLuandaInput());
      resolvedStartIso = nowIso;
      resolvedEndIso = endLuanda.trim() ? luandaInputToUtcIso(endLuanda) : null;
    } else if (!noDates) {
      resolvedStartIso = luandaInputToUtcIso(startLuanda);
      resolvedEndIso = luandaInputToUtcIso(endLuanda);
    }

    if (resolvedStartIso && resolvedEndIso && new Date(resolvedEndIso).getTime() < new Date(resolvedStartIso).getTime()) {
      setMediaError({
        message: "A data/hora de fim (Africa/Luanda) deve ser igual ou posterior ao início.",
        code: null,
      });
      return;
    }

    const cleanDescription = subtitle.trim();
    const payload: AdminAdFormPayload = {
      advertiserType,
      advertiserName:
        advertiserType === "plataforma"
          ? advertiserName.trim() || "Mercado Uíge"
          : advertiserType === "externo"
          ? advertiserName.trim()
          : selectedStore?.name,
      title: title.trim(),
      subtitle: cleanDescription,
      description: cleanDescription,
      ctaText: ctaText.trim(),
      linkUrl: effectiveDestType === "link" ? destCheck.normalizedValue || destinationValue.trim() : undefined,
      order: Number.isFinite(Number(order)) ? Number(order) : 0,
      priority: Number.isFinite(Number(priority)) ? Number(priority) : 0,
      bannerCategory,
      durationSec: parsedDuration !== null ? clampBannerDurationSec(parsedDuration, defaultBannerDurationSec) : null,
      isPaid,
      storeId: advertiserType === "loja" || effectiveDestType === "loja" ? effectiveStoreId || undefined : undefined,
      productId: effectiveProductId || undefined,
      destinationType: effectiveDestType,
      destinationValue: effectiveDestType === "nenhum" ? "" : destCheck.normalizedValue || destinationValue.trim(),
      position,
      mediaType,
      imageUrl: resolvedImage,
      videoUrl: mediaType === "video" ? videoUrl.trim() : undefined,
      startDate: resolvedStartIso,
      endDate: resolvedEndIso,
      status: desiredStatus,
      statusReason: statusReason.trim() || null,
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
      setMediaError(extractServerErrorDetail(err, "Erro ao gravar banner no servidor."));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitAd("aprovado");
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

  const previewCleanTitle = title.trim();
  const previewCleanDesc = subtitle.trim();
  const previewCleanCta = ctaText.trim();
  const previewHasOverlay = Boolean(previewCleanTitle || previewCleanDesc || previewCleanCta);
  const previewHasLink = hasAdDestination({
    destinationType,
    destinationValue,
    linkUrl: destinationType === "link" ? destinationValue : undefined,
    storeId: advertiserType === "loja" || destinationType === "loja" ? storeId : undefined,
    productId: destinationType === "produto" ? productId : undefined,
  });

  return (
    <div className="space-y-4 anim-fadeUp">
      {/* Indicadores de desempenho e distribuição de banners */}
      <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-2.5 text-xs">
        <div className="p-3 rounded-xl bg-[#172338] border border-[#26354B]">
          <span className="text-[10px] text-[#A6B2C5] uppercase font-bold block">Activos</span>
          <span className="text-lg font-black text-emerald-400 tabular-nums">{stats.activos}</span>
        </div>
        <div className="p-3 rounded-xl bg-[#172338] border border-[#26354B]">
          <span className="text-[10px] text-[#A6B2C5] uppercase font-bold block">Agendados</span>
          <span className="text-lg font-black text-blue-300 tabular-nums">{stats.agendados}</span>
        </div>
        <div className="p-3 rounded-xl bg-[#172338] border border-[#26354B]">
          <span className="text-[10px] text-[#A6B2C5] uppercase font-bold block">Rascunhos</span>
          <span className="text-lg font-black text-slate-300 tabular-nums">{stats.rascunhos}</span>
        </div>
        <div className="p-3 rounded-xl bg-[#172338] border border-[#26354B]">
          <span className="text-[10px] text-[#A6B2C5] uppercase font-bold block">Pendentes</span>
          <span className="text-lg font-black text-amber-300 tabular-nums">{stats.pendentes}</span>
        </div>
        <div className="p-3 rounded-xl bg-[#172338] border border-[#26354B]">
          <span className="text-[10px] text-[#A6B2C5] uppercase font-bold block">Expirados</span>
          <span className="text-lg font-black text-slate-300 tabular-nums">{stats.expirados}</span>
        </div>
        <div className="p-3 rounded-xl bg-[#172338] border border-[#26354B]">
          <span className="text-[10px] text-[#A6B2C5] uppercase font-bold block">Pagos</span>
          <span className="text-lg font-black text-[#246BFD] tabular-nums">{stats.pagos}</span>
        </div>
        <div className="p-3 rounded-xl bg-[#172338] border border-[#26354B]">
          <span className="text-[10px] text-[#A6B2C5] uppercase font-bold block">Gratuitos</span>
          <span className="text-lg font-black text-[#B7F34A] tabular-nums">{stats.gratuitos}</span>
        </div>
        <div className="p-3 rounded-xl bg-[#172338] border border-[#26354B]">
          <span className="text-[10px] text-[#A6B2C5] uppercase font-bold block">Visualizações</span>
          <span className="text-lg font-black text-white tabular-nums">{stats.totalViews}</span>
        </div>
        <div className="p-3 rounded-xl bg-[#172338] border border-[#26354B]">
          <span className="text-[10px] text-[#A6B2C5] uppercase font-bold block">Cliques</span>
          <span className="text-lg font-black text-white tabular-nums">{stats.totalClicks}</span>
        </div>
        <div className="p-3 rounded-xl bg-[#172338] border border-[#26354B]">
          <span className="text-[10px] text-[#A6B2C5] uppercase font-bold block">Taxa de cliques</span>
          <span className="text-lg font-black text-[#B7F34A] tabular-nums">{stats.ctrPercent}%</span>
        </div>
      </div>

      <form
        ref={formRef}
        onSubmit={handleSubmit}
        className="p-4 rounded-2xl bg-[#172338] border border-[#26354B] space-y-4 text-xs"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-black text-sm text-white">
              {editingAdId ? "Editar / Substituir Banner" : "Novo Banner / Publicidade"}
            </h3>
            <p className="text-[11px] text-[#A6B2C5]">
              Banners em 16:9 (recomendado 1600x900, WebP/JPEG até 300 KB) ou vídeo até 15 s e 5 MB. Título, descrição, botão e link são opcionais.
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
              <ImageIcon size={13} /> Imagem (1600x900)
            </button>
            <button
              type="button"
              onClick={() => setMediaType("video")}
              className={`px-3 py-1.5 rounded-lg font-bold inline-flex items-center gap-1.5 cursor-pointer ${
                mediaType === "video" ? "bg-[#246BFD] text-white" : "bg-[#111D30] text-[#A6B2C5] border border-[#26354B]"
              }`}
            >
              <Film size={13} /> Vídeo (15s · 5 MB)
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

        {/* 2. Conteúdo do Banner (Todos opcionais: Título, Descrição, Texto do Botão, Posição) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <input
            ref={titleInputRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Título (opcional)"
            className="p-2.5 rounded-xl bg-[#111D30] border border-[#26354B] text-white outline-none focus:border-[#246BFD]"
          />
          <input
            type="text"
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            placeholder="Descrição (opcional)"
            className="p-2.5 rounded-xl bg-[#111D30] border border-[#26354B] text-white outline-none focus:border-[#246BFD]"
          />
          <input
            type="text"
            value={ctaText}
            onChange={(e) => setCtaText(e.target.value)}
            placeholder="Texto do botão (opcional)"
            className="p-2.5 rounded-xl bg-[#111D30] border border-[#26354B] text-white outline-none focus:border-[#246BFD]"
          />

          <select
            aria-label="Posição do anúncio"
            value={position}
            onChange={(e) => setPosition(e.target.value as AdPosition)}
            className="p-2.5 rounded-xl bg-[#111D30] border border-[#26354B] text-white outline-none"
          >
            <option value="topo">Posição: Carrossel Início (Topo)</option>
            <option value="faixa">Posição: Faixa acima da barra</option>
            <option value="categoria">Posição: Categorias</option>
            <option value="pesquisa">Posição: Pesquisa</option>
            <option value="ecra_inteiro">Posição: Ecrã inteiro</option>
          </select>
        </div>

        {/* 3. Categoria, Ordem, Prioridade, Duração, Modelo Pago vs Gratuito */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
          <div>
            <label className="block text-[11px] font-bold text-[#A6B2C5] mb-1">Categoria do Banner</label>
            <select
              aria-label="Categoria do banner"
              value={bannerCategory}
              onChange={(e) => {
                const nextCat = e.target.value as BannerCategory;
                setBannerCategory(nextCat);
                if (nextCat === "publico") setIsPaid(false);
                if (nextCat === "patrocinado") setIsPaid(true);
              }}
              className="w-full p-2.5 rounded-xl bg-[#111D30] border border-[#26354B] text-white outline-none"
            >
              <option value="publico">Público (Plataforma)</option>
              <option value="patrocinado">Patrocinado</option>
              <option value="promocional">Promocional</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-[#A6B2C5] mb-1">Ordem (0 = primeiro)</label>
            <input
              type="number"
              min={0}
              value={order}
              onChange={(e) => setOrder(e.target.value)}
              className="w-full p-2.5 rounded-xl bg-[#111D30] border border-[#26354B] text-white outline-none"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-[#A6B2C5] mb-1">Prioridade (maior = topo)</label>
            <input
              type="number"
              min={0}
              max={100}
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full p-2.5 rounded-xl bg-[#111D30] border border-[#26354B] text-white outline-none"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-[#A6B2C5] mb-1">
              Duração (s) · vazio = padrão ({defaultBannerDurationSec}s)
            </label>
            <input
              type="number"
              min={3}
              max={60}
              value={durationSec}
              onChange={(e) => setDurationSec(e.target.value)}
              placeholder={`Padrão (${defaultBannerDurationSec}s)`}
              className="w-full p-2.5 rounded-xl bg-[#111D30] border border-[#26354B] text-white outline-none"
            />
          </div>

          <label className="p-2.5 rounded-xl bg-[#111D30] border border-[#26354B] flex items-center justify-between gap-2 cursor-pointer">
            <span className="font-bold text-white">Banner pago</span>
            <input
              type="checkbox"
              checked={isPaid}
              onChange={(e) => setIsPaid(e.target.checked)}
              className="w-4 h-4 accent-[#B7F34A] cursor-pointer"
            />
          </label>
        </div>

        {/* 4. Loja/Anunciante, Destino e Datas */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
          <div>
            <label className="block text-[11px] font-bold text-[#A6B2C5] mb-1">
              {advertiserType === "loja" ? "Loja Anunciante *" : "Nome do Anunciante"}
            </label>
            {advertiserType === "loja" ? (
              <select
                required
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
                className="w-full p-2.5 rounded-xl bg-[#111D30] border border-[#26354B] text-white outline-none"
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
                className="w-full p-2.5 rounded-xl bg-[#111D30] border border-[#26354B] text-white outline-none focus:border-[#246BFD]"
              />
            )}
          </div>

          <div>
            <label className="block text-[11px] font-bold text-[#A6B2C5] mb-1">Tipo de Destino (opcional)</label>
            <select
              aria-label="Tipo de destino do anúncio"
              value={destinationType}
              onChange={(e) => {
                setDestinationType(e.target.value as AdDestinationType);
                setMediaError(null);
              }}
              className="w-full p-2.5 rounded-xl bg-[#111D30] border border-[#26354B] text-white outline-none"
            >
              <option value="nenhum">Sem link (apenas banner)</option>
              <option value="loja">Abrir Loja</option>
              <option value="produto">Abrir Artigo / Produto</option>
              <option value="link">Link Externo (só https://)</option>
              <option value="whatsapp">WhatsApp</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-[#A6B2C5] mb-1">
              {destinationType === "nenhum"
                ? "Destino (opcional)"
                : destinationType === "link"
                ? "URL Externa (opcional, https://)"
                : destinationType === "whatsapp"
                ? "WhatsApp (opcional, 9 dígitos)"
                : destinationType === "produto"
                ? "Artigo de Destino"
                : "Loja de Destino"}
            </label>
            {destinationType === "nenhum" ? (
              <div className="p-2.5 rounded-xl bg-[#07111F] border border-[#26354B] text-[#A6B2C5] text-[11px]">
                Banner sem clique (apenas imagem/vídeo).
              </div>
            ) : destinationType === "loja" ? (
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
                  {approvedProducts.length === 0 ? "Sem artigos disponíveis" : "Selecionar artigo"}
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
                placeholder={destinationType === "link" ? "https://empresa.ao/promo (opcional)" : "923000000 (opcional)"}
                className="w-full p-2.5 rounded-xl bg-[#111D30] border border-[#26354B] text-white outline-none focus:border-[#246BFD]"
              />
            )}
          </div>

          <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-[#A6B2C5] mb-1">
                Início (Africa/Luanda · UTC+1)
              </label>
              <input
                type="datetime-local"
                disabled={noDates}
                value={startLuanda}
                onChange={(e) => setStartLuanda(e.target.value)}
                className="w-full p-2.5 rounded-xl bg-[#111D30] border border-[#26354B] text-white outline-none disabled:opacity-45"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[#A6B2C5] mb-1">
                Fim (Africa/Luanda · UTC+1)
              </label>
              <input
                type="datetime-local"
                disabled={noDates}
                value={endLuanda}
                onChange={(e) => setEndLuanda(e.target.value)}
                className="w-full p-2.5 rounded-xl bg-[#111D30] border border-[#26354B] text-white outline-none disabled:opacity-45"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-center p-3 rounded-xl bg-[#111D30] border border-[#26354B]">
          <div className="space-y-1">
            <label className="inline-flex items-center gap-2 font-bold text-white cursor-pointer">
              <input
                type="checkbox"
                checked={noDates}
                onChange={(e) => setNoDates(e.target.checked)}
                className="w-4 h-4 accent-[#B7F34A] cursor-pointer"
              />
              <span>Sem datas (no ar continuamente até pausar)</span>
            </label>
            <p className="text-[11px] text-[#A6B2C5] flex items-center gap-1">
              <Clock size={12} className="text-[#246BFD] shrink-0" />
              Hora escolhida em Africa/Luanda (UTC+1), gravada em UTC na base de dados e comparada com now().
            </p>
          </div>
          <div>
            <input
              type="text"
              value={statusReason}
              onChange={(e) => setStatusReason(e.target.value)}
              placeholder="Nota / motivo do estado (opcional — ex.: campanha de natal ou pausa técnica)"
              className="w-full p-2.5 rounded-xl bg-[#07111F] border border-[#26354B] text-white outline-none focus:border-[#246BFD]"
            />
          </div>
        </div>

        {/* 5. Mídia (Imagem 1600x900 <= 300 KB ou Vídeo <= 15s / 5 MB com capa) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
          <div className="space-y-1">
            <div className="flex gap-2 items-center">
              <input
                type="text"
                value={imageUrl}
                onChange={(e) => {
                  setImageUrl(e.target.value);
                  setCompressedImageInfo(null);
                }}
                placeholder={
                  mediaType === "video"
                    ? "Capa obrigatória (extraída automaticamente ou URL) *"
                    : "URL ou carregar imagem *"
                }
                className="flex-1 min-w-0 p-2.5 rounded-xl bg-[#111D30] border border-[#26354B] text-white outline-none"
              />
              <label className="px-3 py-2.5 rounded-xl bg-[#111D30] border border-[#26354B] text-[#B7F34A] font-bold cursor-pointer inline-flex items-center gap-1 shrink-0">
                <Upload size={13} /> {imageUrl ? "Substituir foto" : mediaType === "video" ? "Capa 16:9" : "Foto 1600x900"}
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
            <p className="text-[10px] text-[#A6B2C5]">
              recomendado 1600x900 (16:9) · JPEG ou WebP até 300 KB.
              {compressedImageInfo && (
                <span className="ml-1.5 font-bold text-[#B7F34A]">
                  Tamanho final: {compressedImageInfo}
                </span>
              )}
            </p>
          </div>

          {mediaType === "video" && (
            <div className="space-y-1">
              <div className="flex gap-2 items-center">
                <input
                  type="text"
                  value={videoUrl}
                  onChange={(e) => {
                    setVideoUrl(e.target.value);
                    setCompressedVideoInfo(null);
                  }}
                  placeholder="URL do vídeo (ou carrega mp4/webm) *"
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
                Vídeo até 15 s e 5 MB (comprimido no dispositivo; gera capa automática).
                {compressedVideoInfo && (
                  <span className="ml-1.5 font-bold text-[#B7F34A]">
                    Tamanho final: {compressedVideoInfo}
                  </span>
                )}
              </p>
            </div>
          )}
        </div>

        {/* 6. Pagamento de Anunciante Externo -> Pagamentos */}
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

        {/* 7. Pré-visualização ao vivo idêntica à app mobile (16:9, máx. 210px) */}
        <div
          data-testid="admin-ad-preview"
          className="p-3 rounded-xl bg-[#07111F] border border-[#246BFD]/35 space-y-2.5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#A6B2C5]">
            <span className="font-bold">
              Pré-visualização na app · {previewSponsorName} · {formatPositionLabel(position)} ·{" "}
              {durationSec.trim() ? `${durationSec.trim()}s` : `${defaultBannerDurationSec}s padrão`}
            </span>
            <span>
              {previewHasLink ? "Com link clicável" : "Sem link (não clicável)"}
              {isPaid ? " · Pago (Patrocinado)" : " · Gratuito"}
            </span>
          </div>

          <div
            className={`relative mx-auto w-full max-w-[400px] aspect-[16/9] max-h-[210px] rounded-2xl overflow-hidden bg-[#111D30] border border-[#26354B] ${
              previewHasLink ? "cursor-pointer" : "cursor-default"
            }`}
          >
            {mediaType === "video" && videoUrl.trim() ? (
              <>
                <video
                  src={videoUrl.trim()}
                  poster={previewPoster || undefined}
                  autoPlay
                  muted={previewMuted}
                  loop
                  playsInline
                  onTimeUpdate={(e) => {
                    const vid = e.currentTarget;
                    if (vid.duration && Number.isFinite(vid.duration) && vid.duration > 0) {
                      setPreviewProgress(Math.min(100, Math.max(0, (vid.currentTime / vid.duration) * 100)));
                    }
                  }}
                  className="w-full h-full object-cover object-center"
                />
                <button
                  type="button"
                  onClick={() => setPreviewMuted((prev) => !prev)}
                  aria-label={previewMuted ? "Activar som na pré-visualização" : "Silenciar pré-visualização"}
                  className="absolute top-2 left-2 z-20 px-2 py-1 rounded-lg bg-black/65 text-white border border-white/20 inline-flex items-center gap-1 text-[10px] font-bold cursor-pointer"
                >
                  {previewMuted ? <VolumeX size={13} /> : <Volume2 size={13} className="text-red-500" />}
                  <span>{previewMuted ? "Sem som" : "Som"}</span>
                </button>
                <div className="absolute inset-x-0 bottom-0 h-[3px] bg-white/25 z-20 overflow-hidden">
                  <div className="h-full bg-red-600" style={{ width: `${previewProgress}%` }} />
                </div>
              </>
            ) : previewPoster ? (
              <img
                src={previewPoster}
                alt={previewCleanTitle || "Pré-visualização do banner"}
                className="w-full h-full object-cover object-center"
              />
            ) : (
              <div className="w-full h-full grid place-items-center text-[11px] text-[#A6B2C5]">
                Carrega uma imagem (recomendado 1600x900) ou vídeo (16:9)
              </div>
            )}

            {isPaid && (
              <span className="absolute top-2 right-2 z-20 px-2 py-0.5 rounded bg-black/65 border border-white/20 text-[10px] font-bold text-white">
                Patrocinado
              </span>
            )}

            {previewHasOverlay && (
              <div className="absolute inset-x-0 bottom-0 z-10 bg-black/65 px-3.5 py-2.5 flex items-end justify-between gap-2.5">
                <div className="min-w-0 flex-1 space-y-0.5">
                  {previewCleanTitle && (
                    <p className="text-[14px] font-bold text-white leading-tight truncate">
                      {previewCleanTitle}
                    </p>
                  )}
                  {previewCleanDesc && (
                    <p className="text-[12px] text-white/90 leading-snug line-clamp-1">
                      {previewCleanDesc}
                    </p>
                  )}
                </div>
                {previewCleanCta && (
                  <span className="shrink-0 px-3 py-1 rounded-lg bg-red-600 text-white text-[11px] font-black">
                    {previewCleanCta}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] text-[#A6B2C5]">
            {mediaType === "video"
              ? "Vídeo 16:9: autoplay sem som, em ciclo, pausa fora do ecrã e mostra capa com Reproduzir em dados móveis."
              : "Imagens comprimidas em 1600x900 (16:9), WebP/JPEG até 300 KB."}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={submitting || uploadingMedia || (advertiserType === "loja" && paidStores.length === 0)}
              onClick={() => submitAd("rascunho")}
              className="px-3.5 py-2.5 rounded-xl bg-[#111D30] border border-[#26354B] text-slate-200 font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Save size={14} /> Guardar Rascunho
            </button>
            <button
              type="button"
              disabled={submitting || uploadingMedia || (advertiserType === "loja" && paidStores.length === 0)}
              onClick={() => submitAd("aprovado", { publishNow: true })}
              className="px-3.5 py-2.5 rounded-xl bg-[#246BFD] text-white font-black flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Send size={14} /> Publicar agora
            </button>
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
                ? "Publicar Banner em Vídeo"
                : "Publicar Banner"}
            </button>
          </div>
        </div>

        {mediaError && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/35 text-red-300 text-xs space-y-1">
            <p className="font-bold">{mediaError.message}</p>
            {mediaError.code && (
              <p className="text-[10px] font-mono text-red-400/90">Código técnico: {mediaError.code}</p>
            )}
          </div>
        )}
      </form>

      <TableToolbar
        title="Banners e Publicidade"
        subtitle="Gere banners do carrossel, campanhas gratuitas da plataforma, anunciantes externos e lojas pagas."
        search={search}
        onSearchChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        searchPlaceholder="Pesquisar por título, descrição, anunciante ou loja..."
        filterValue={posFilter}
        onFilterChange={(v) => {
          setPosFilter(v);
          setPage(1);
        }}
        filterOptions={[
          { value: "todos", label: "Todas as posições" },
          { value: "topo", label: "Carrossel Início (Topo)" },
          { value: "faixa", label: "Faixa inferior" },
          { value: "categoria", label: "Categoria" },
          { value: "pesquisa", label: "Pesquisa" },
          { value: "ecra_inteiro", label: "Ecrã inteiro" },
        ]}
        secondFilterValue={statusFilter}
        onSecondFilterChange={(v) => {
          setStatusFilter(v);
          setPage(1);
        }}
        secondFilterOptions={[
          { value: "todos", label: "Todos os estados" },
          { value: "activos", label: "Activos" },
          { value: "agendados", label: "Agendados" },
          { value: "rascunhos", label: "Rascunhos" },
          { value: "pendentes", label: "Pendentes" },
          { value: "expirados", label: "Expirados" },
          { value: "suspensos", label: "Suspensos" },
          { value: "pagos", label: "Pagos (Patrocinado)" },
          { value: "gratuitos", label: "Gratuitos" },
        ]}
        onExportCsv={() =>
          downloadCsv(
            "banners-mercado-uige",
            [
              "Título",
              "Categoria",
              "Tipo",
              "Ordem",
              "Prioridade",
              "Anunciante / Loja",
              "Destino",
              "Posição",
              "Duração (s)",
              "Visualizações",
              "Cliques",
              "CTR %",
              "Estado",
              "Motivo",
              "Início (Luanda)",
              "Fim (Luanda)",
            ],
            filtered.map((a) => {
              const lc = resolveAdLifecycleState(a, stores);
              return [
                a.title,
                formatBannerCategoryLabel(a.bannerCategory),
                isBannerPaid(a) ? "Pago" : "Gratuito",
                a.order ?? 0,
                a.priority ?? 0,
                a.advertiserName || a.storeName || "Mercado Uíge",
                `${a.destinationType || "loja"}: ${a.destinationValue || a.linkUrl || a.storeId || a.productId || ""}`,
                formatPositionLabel(a.position),
                a.durationSec ?? `${defaultBannerDurationSec} (global)`,
                a.views,
                a.clicks,
                `${computeAdCtrPercent(a)}%`,
                lc.label,
                lc.reason,
                a.startDate ? formatLuandaDateTimeShort(a.startDate) : "Sem datas",
                a.endDate ? formatLuandaDateTimeShort(a.endDate) : "Sem datas",
              ];
            })
          )
        }
        totalFiltered={filtered.length}
      />

      {ads.length === 0 ? (
        <div className="p-8 text-center rounded-2xl bg-[#172338] border border-[#26354B] space-y-3">
          <p className="font-bold text-sm text-white">Ainda não há banners ou anúncios criados.</p>
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
          Nenhum banner encontrado com os filtros aplicados.
        </div>
      ) : (
        <>
          <div className="hidden md:block rounded-2xl border border-[#26354B] bg-[#172338] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#111D30] text-[#A6B2C5] uppercase font-bold">
                  <tr>
                    <th className="p-3.5">Ordem</th>
                    <th className="p-3.5">Banner / Anunciante</th>
                    <th className="p-3.5">Tipo / Posição</th>
                    <th className="p-3.5">Desempenho (CTR)</th>
                    <th className="p-3.5">Datas (Luanda)</th>
                    <th className="p-3.5">Estado e Motivo</th>
                    <th className="p-3.5 text-right">Acções</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#26354B]">
                  {paged.map((ad) => {
                    const ctr = computeAdCtrPercent(ad);
                    const paid = isBannerPaid(ad);
                    const suspended = Boolean(ad.isSuspended) || ad.status === "suspenso";
                    const lifecycle = resolveAdLifecycleState(ad, stores);
                    const badgeColor =
                      lifecycle.key === "suspenso" || lifecycle.key === "rejeitado"
                        ? "bg-red-500/20 text-red-400"
                        : lifecycle.key === "activo"
                        ? "bg-emerald-500/20 text-emerald-400"
                        : lifecycle.key === "agendado"
                        ? "bg-[#246BFD]/25 text-blue-200"
                        : lifecycle.key === "rascunho" || lifecycle.key === "expirado"
                        ? "bg-slate-600/35 text-slate-300"
                        : "bg-amber-500/20 text-amber-300";
                    const scheduleText =
                      ad.startDate || ad.endDate
                        ? `${ad.startDate ? formatLuandaDateTimeShort(ad.startDate) : "Imediato"} → ${
                            ad.endDate ? formatLuandaDateTimeShort(ad.endDate) : "Sem fim"
                          }`
                        : "Sem datas (contínuo)";
                    return (
                      <tr key={ad.id} className="hover:bg-[#111D30]/40">
                        <td className="p-3.5 whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            <span className="font-black text-white tabular-nums w-6 text-center">
                              #{ad.order ?? 0}
                            </span>
                            {onReorderAd && (
                              <div className="flex flex-col gap-0.5">
                                <button
                                  type="button"
                                  aria-label={`Subir ordem de ${ad.title}`}
                                  onClick={() => onReorderAd(ad, -1)}
                                  className="p-0.5 rounded bg-[#111D30] border border-[#26354B] text-[#A6B2C5] hover:text-white cursor-pointer"
                                >
                                  <ArrowUp size={10} />
                                </button>
                                <button
                                  type="button"
                                  aria-label={`Descer ordem de ${ad.title}`}
                                  onClick={() => onReorderAd(ad, 1)}
                                  className="p-0.5 rounded bg-[#111D30] border border-[#26354B] text-[#A6B2C5] hover:text-white cursor-pointer"
                                >
                                  <ArrowDown size={10} />
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="p-3.5">
                          <div className="flex items-center gap-2.5">
                            {ad.imageUrl && (
                              <img
                                src={ad.imageUrl}
                                alt={(ad.title || "").trim() || "Banner"}
                                className="w-16 h-9 rounded object-cover object-center border border-[#26354B] shrink-0"
                              />
                            )}
                            <div className="min-w-0">
                              <span className="font-bold text-white block truncate max-w-[200px]">
                                {(ad.title || "").trim() || (ad.mediaType === "video" ? "Banner em vídeo (sem título)" : "Banner só imagem")}
                              </span>
                              <span className="text-[#A6B2C5] inline-flex items-center gap-1.5">
                                <span className="px-1.5 py-0.5 rounded bg-[#246BFD]/15 text-blue-200 text-[10px] font-bold">
                                  {formatAdvertiserLabel(ad)}
                                </span>
                                <span className="truncate max-w-[140px]">
                                  {ad.advertiserName || ad.storeName || "Mercado Uíge"}
                                </span>
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="p-3.5">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-black ${
                                  paid
                                    ? "bg-[#246BFD]/20 text-blue-200"
                                    : "bg-[#B7F34A]/20 text-[#B7F34A]"
                                }`}
                              >
                                {paid ? "Pago" : "Gratuito"}
                              </span>
                              <span className="px-2 py-0.5 rounded bg-[#111D30] border border-[#26354B] text-[10px] font-bold text-slate-200 inline-flex items-center gap-1">
                                {ad.mediaType === "video" ? <Film size={11} className="text-[#B7F34A]" /> : <ImageIcon size={11} className="text-[#246BFD]" />}
                                {ad.durationSec ? `${ad.durationSec}s` : `${defaultBannerDurationSec}s`}
                              </span>
                            </div>
                            <span className="block font-black text-[#246BFD] text-[11px]">
                              {formatPositionLabel(ad.position)} · P{ad.priority ?? 0}
                            </span>
                          </div>
                        </td>
                        <td className="p-3.5 text-[#A6B2C5] tabular-nums whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 mr-2.5">
                            <Eye size={13} /> {ad.views}
                          </span>
                          <span className="inline-flex items-center gap-1 mr-2.5">
                            <MousePointerClick size={13} /> {ad.clicks}
                          </span>
                          <span className="font-black text-[#B7F34A]">{ctr}%</span>
                        </td>
                        <td className="p-3.5 text-[#A6B2C5] whitespace-nowrap">{scheduleText}</td>
                        <td className="p-3.5">
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-black ${badgeColor}`}>
                            {lifecycle.label}
                          </span>
                          <span className="block text-[11px] text-[#A6B2C5] leading-snug mt-1 max-w-[230px]">
                            {lifecycle.reason}
                          </span>
                        </td>
                        <td className="p-3.5 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            {onUpdateAd && (
                              <button
                                type="button"
                                onClick={() => handleStartEdit(ad)}
                                className="px-2 py-1 rounded-lg bg-[#111D30] border border-[#26354B] text-white font-bold inline-flex items-center gap-1 cursor-pointer"
                              >
                                <Pencil size={11} /> Editar
                              </button>
                            )}
                            {onReviewAd && ad.status === "pendente" && (
                              <>
                                <button
                                  type="button"
                                  title="Aprovar banner"
                                  onClick={() => onReviewAd(ad, "aprovado")}
                                  className="px-2 py-1 rounded-lg bg-emerald-500 text-slate-950 font-black inline-flex items-center gap-1 cursor-pointer"
                                >
                                  <Check size={11} /> Aprovar
                                </button>
                                <button
                                  type="button"
                                  title="Rejeitar banner"
                                  onClick={() => onReviewAd(ad, "rejeitado")}
                                  className="px-2 py-1 rounded-lg bg-red-500/15 text-red-400 font-bold inline-flex items-center gap-1 cursor-pointer"
                                >
                                  <X size={11} /> Rejeitar
                                </button>
                              </>
                            )}
                            <button
                              type="button"
                              onClick={() => onToggleAd(ad, !ad.active)}
                              disabled={suspended}
                              className={`px-2 py-1 rounded-lg font-bold cursor-pointer disabled:opacity-40 ${
                                ad.active
                                  ? "bg-amber-500/15 text-amber-300"
                                  : "bg-emerald-500 text-slate-950 font-black"
                              }`}
                            >
                              {ad.active ? "Desactivar" : "Activar"}
                            </button>
                            {onSuspendAd && (
                              <button
                                type="button"
                                onClick={() => onSuspendAd(ad, !suspended)}
                                className={`px-2 py-1 rounded-lg font-bold inline-flex items-center gap-1 cursor-pointer ${
                                  suspended
                                    ? "bg-[#246BFD]/20 text-blue-200"
                                    : "bg-slate-700/60 text-slate-200"
                                }`}
                              >
                                <Ban size={11} /> {suspended ? "Reactivar" : "Suspender"}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => onDeleteAd(ad)}
                              className="px-2 py-1 rounded-lg bg-red-500/15 text-red-400 font-bold cursor-pointer"
                            >
                              Eliminar
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="md:hidden space-y-3">
            {paged.map((ad) => {
              const ctr = computeAdCtrPercent(ad);
              const suspended = Boolean(ad.isSuspended) || ad.status === "suspenso";
              const lifecycle = resolveAdLifecycleState(ad, stores);
              const scheduleText =
                ad.startDate || ad.endDate
                  ? `${ad.startDate ? formatLuandaDateTimeShort(ad.startDate) : "Imediato"} → ${
                      ad.endDate ? formatLuandaDateTimeShort(ad.endDate) : "Sem fim"
                    }`
                  : "Sem datas (contínuo)";
              return (
                <div key={ad.id} className="p-4 rounded-2xl bg-[#172338] border border-[#26354B] space-y-2 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-bold text-white block">
                        {(ad.title || "").trim() || (ad.mediaType === "video" ? "Banner em vídeo (sem título)" : "Banner só imagem")}
                      </span>
                      <span className="text-[#A6B2C5]">
                        #{ad.order ?? 0} · {isBannerPaid(ad) ? "Pago" : "Gratuito"} ·{" "}
                        {ad.advertiserName || ad.storeName || "Mercado Uíge"} · {formatPositionLabel(ad.position)}
                      </span>
                    </div>
                    <span className="text-[11px] text-[#A6B2C5] shrink-0">{scheduleText}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-[#111D30] border border-[#26354B] text-[10px] font-black text-white">
                      {lifecycle.label}
                    </span>
                    <span className="text-[11px] text-[#A6B2C5]">{lifecycle.reason}</span>
                  </div>
                  <div className="flex gap-4 text-[#A6B2C5] tabular-nums">
                    <span>{ad.views} vistas</span>
                    <span>{ad.clicks} cliques</span>
                    <span className="font-black text-[#B7F34A]">{ctr}% CTR</span>
                  </div>
                  <div className="pt-2 border-t border-[#26354B] flex flex-wrap gap-2">
                    {onUpdateAd && (
                      <button
                        type="button"
                        onClick={() => handleStartEdit(ad)}
                        className="px-3 py-1.5 rounded-lg bg-[#111D30] border border-[#26354B] text-white font-bold cursor-pointer"
                      >
                        Editar
                      </button>
                    )}
                    {onReviewAd && ad.status === "pendente" && (
                      <button
                        type="button"
                        onClick={() => onReviewAd(ad, "aprovado")}
                        className="px-3 py-1.5 rounded-lg bg-emerald-500 text-slate-950 font-black cursor-pointer"
                      >
                        Aprovar
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onToggleAd(ad, !ad.active)}
                      disabled={suspended}
                      className="flex-1 py-1.5 rounded-lg bg-[#246BFD] text-white font-bold cursor-pointer disabled:opacity-40"
                    >
                      {ad.active ? "Desactivar" : "Activar"}
                    </button>
                    {onSuspendAd && (
                      <button
                        type="button"
                        onClick={() => onSuspendAd(ad, !suspended)}
                        className="px-3 py-1.5 rounded-lg bg-slate-700/60 text-white font-bold cursor-pointer"
                      >
                        {suspended ? "Reactivar" : "Suspender"}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onDeleteAd(ad)}
                      className="px-3 py-1.5 rounded-lg bg-red-500/15 text-red-400 font-bold cursor-pointer"
                    >
                      Eliminar
                    </button>
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
  onModerateReportedProduct?: (productId: string, action: "restaurar" | "remover") => void;
}> = ({ reports, onResolveReport, onModerateReportedProduct }) => {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const formatReportTarget = (rep: ReportItem) => {
    if (rep.reviewId) {
      return `Avaliação (${rep.reviewType || "produto"}): ${rep.storeName || rep.productName || "Comentário"}`;
    }
    if (rep.productName) return `Artigo: ${rep.productName}`;
    if (rep.storeName) return `Loja: ${rep.storeName}`;
    return "Denúncia";
  };

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
        subtitle="Revê relatos contra artigos, lojas ou avaliações. Artigos com 3+ denúncias distintas ficam ocultos automaticamente até decisão da moderação."
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
            filtered.map((r) => [formatReportTarget(r), r.reason, r.status, fmtDateTime(r.createdAt)])
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
                      <td className="p-3.5 font-bold text-white">{formatReportTarget(rep)}</td>
                      <td className="p-3.5 text-[#A6B2C5]">{rep.reason}</td>
                      <td className="p-3.5 text-[#A6B2C5] whitespace-nowrap">{fmtDateTime(rep.createdAt)}</td>
                      <td className="p-3.5 capitalize font-bold text-white">{rep.status}</td>
                      <td className="p-3.5 text-right whitespace-nowrap">
                        <div className="inline-flex gap-1.5">
                          {rep.productId && onModerateReportedProduct && (
                            <>
                              <button
                                type="button"
                                onClick={() => onModerateReportedProduct(rep.productId!, "restaurar")}
                                className="px-2.5 py-1 rounded-lg bg-[#246BFD]/20 border border-[#246BFD]/40 text-blue-200 font-bold cursor-pointer"
                              >
                                Restaurar artigo
                              </button>
                              <button
                                type="button"
                                onClick={() => onModerateReportedProduct(rep.productId!, "remover")}
                                className="px-2.5 py-1 rounded-lg bg-red-500/15 border border-red-500/30 text-red-300 font-bold cursor-pointer"
                              >
                                Remover artigo
                              </button>
                            </>
                          )}
                          {rep.status === "pendente" && (
                            <>
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
                            </>
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
            {paged.map((rep) => (
              <div key={rep.id} className="p-4 rounded-2xl bg-[#172338] border border-[#26354B] space-y-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-white">{formatReportTarget(rep)}</span>
                  <span className="capitalize font-bold text-amber-300">{rep.status}</span>
                </div>
                <p className="text-[#A6B2C5]">{rep.reason}</p>
                {(rep.status === "pendente" || (rep.productId && onModerateReportedProduct)) && (
                  <div className="pt-2 border-t border-[#26354B] flex flex-wrap gap-2">
                    {rep.productId && onModerateReportedProduct && (
                      <>
                        <button
                          type="button"
                          onClick={() => onModerateReportedProduct(rep.productId!, "restaurar")}
                          className="px-3 py-1.5 rounded-lg bg-[#246BFD]/20 border border-[#246BFD]/40 text-blue-200 font-bold cursor-pointer"
                        >
                          Restaurar artigo
                        </button>
                        <button
                          type="button"
                          onClick={() => onModerateReportedProduct(rep.productId!, "remover")}
                          className="px-3 py-1.5 rounded-lg bg-red-500/15 border border-red-500/30 text-red-300 font-bold cursor-pointer"
                        >
                          Remover artigo
                        </button>
                      </>
                    )}
                    {rep.status === "pendente" && (
                      <>
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
                      </>
                    )}
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
  BAN_USER: "Banimento de utilizador",
  UNBAN_USER: "Remoção de banimento",
  APPROVE_USER: "Aprovação / Revisão de conta",
  REJECT_USER: "Rejeição de conta",
  REQUEST_CORRECTION_USER: "Pedido de correcção de conta",
  APPROVE_STORE: "Aprovação de loja",
  REJECT_STORE: "Rejeição de loja",
  REQUEST_CORRECTION_STORE: "Pedido de correcção de loja",
  SUSPEND_STORE: "Suspensão de loja",
  UNSUSPEND_STORE: "Reactivação de loja",
  VERIFY_STORE: "Atribuição de selo Loja Verificada",
  UNVERIFY_STORE: "Remoção de selo Loja Verificada",
  SET_STORE_VIP: "Atribuição de selo VIP",
  UNSET_STORE_VIP: "Remoção de selo VIP",
  APPROVE_PRODUCT: "Aprovação de artigo",
  RESTORE_PRODUCT: "Restauro de artigo",
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
