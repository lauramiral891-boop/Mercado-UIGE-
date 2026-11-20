import React, { useMemo, useState } from "react";
import { CheckCircle2, XCircle, AlertCircle, Eye, FileText, Store as StoreIcon, UserCheck } from "lucide-react";
import {
  Product,
  Store,
  User,
  SafeImage,
  fmtDateTime,
  fmtKz,
  formatStoreType,
  formatUserRole,
} from "@mercado-uige/shared";
import { PaginationBar, TableToolbar } from "./TableControls";
import { downloadCsv } from "../lib/adminHelpers";

interface ApprovalEntry {
  id: string;
  kind: "loja" | "utilizador" | "produto";
  code: string;
  name: string;
  subtitle: string;
  location: string;
  phone: string;
  biNumber?: string | null;
  biPhotoUrl?: string | null;
  facadeImage?: string | null;
  approvalStatus: "pendente" | "aprovado" | "rejeitado" | "correcao";
  note?: string | null;
  createdAt: string;
  rawStore?: Store;
  rawUser?: User;
  rawProduct?: Product;
}

interface ApprovalsSectionProps {
  stores: Store[];
  users: User[];
  products?: Product[];
  onPreviewImage: (url: string) => void;
  onApprove: (entry: { kind: "loja" | "utilizador"; store?: Store; user?: User }) => void;
  onReject: (entry: { kind: "loja" | "utilizador"; store?: Store; user?: User }) => void;
  onRequestCorrection: (entry: { kind: "loja" | "utilizador"; store?: Store; user?: User }) => void;
  onApproveProduct?: (product: Product) => void;
  onRejectProduct?: (product: Product) => void;
}

export const ApprovalsSection: React.FC<ApprovalsSectionProps> = ({
  stores,
  users,
  products = [],
  onPreviewImage,
  onApprove,
  onReject,
  onRequestCorrection,
  onApproveProduct,
  onRejectProduct,
}) => {
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<string>("todos");
  const [statusFilter, setStatusFilter] = useState<string>("pendentes_ou_correcao");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const allEntries = useMemo<ApprovalEntry[]>(() => {
    const storeEntries: ApprovalEntry[] = stores.map((s) => ({
      id: `store_${s.id}`,
      kind: "loja",
      code: s.code || "LJ-0000",
      name: s.name,
      subtitle: `${formatStoreType(s.storeType)} · ${s.category}`,
      location: `${s.bairro ? `${s.bairro}, ` : ""}${s.municipality}${s.address ? ` · ${s.address}` : ""}`,
      phone: s.phone || "Não informado",
      biPhotoUrl: s.biPhotoUrl || null,
      facadeImage: s.facadeImage || s.logo || null,
      approvalStatus: s.approvalStatus || (s.isApproved ? "aprovado" : "pendente"),
      note: s.rejectionReason || s.correctionNote || null,
      createdAt: s.createdAt,
      rawStore: s,
    }));

    const userEntries: ApprovalEntry[] = users
      .filter((u) => u.role === "entregador" || u.role === "comerciante")
      .map((u) => ({
        id: `user_${u.id}`,
        kind: "utilizador",
        code: u.code || "CL-0000",
        name: u.name,
        subtitle: `${formatUserRole(u.role)} · ${u.email}`,
        location: `${u.bairro ? `${u.bairro}, ` : ""}${u.municipality || "Uíge"}`,
        phone: u.phone || "Não informado",
        biNumber: u.biNumber || null,
        biPhotoUrl: u.biPhotoUrl || null,
        facadeImage: null,
        approvalStatus: u.approvalStatus || (u.isApproved === false ? "pendente" : "aprovado"),
        note: u.rejectionReason || u.correctionNote || null,
        createdAt: u.createdAt,
        rawUser: u,
      }));

    const productEntries: ApprovalEntry[] = products.map((p) => {
      const modStatus =
        p.moderationStatus === "removido"
          ? "rejeitado"
          : p.moderationStatus === "em_revisao"
          ? "correcao"
          : p.isApproved
          ? "aprovado"
          : "pendente";
      const noteParts = [
        p.moderationReason || null,
        (p.reportsCount || 0) > 0 ? `${p.reportsCount} denúncia(s)` : null,
      ].filter(Boolean);
      return {
        id: `prod_${p.id}`,
        kind: "produto",
        code: p.storeCode || "ART",
        name: p.name,
        subtitle: `${fmtKz(p.price)} · ${p.condition === "usado" ? "Usado" : "Novo"} · ${p.categoryName}`,
        location: `${p.storeName || "Loja Local"} · ${p.municipality || "Uíge"}`,
        phone: p.videoUrl ? "Com vídeo" : "Com fotografia",
        biPhotoUrl: null,
        facadeImage: p.image || p.images?.[0] || null,
        approvalStatus: modStatus,
        note: noteParts.length > 0 ? noteParts.join(" · ") : null,
        createdAt: p.createdAt,
        rawProduct: p,
      };
    });

    return [...storeEntries, ...userEntries, ...productEntries].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [stores, users, products]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allEntries.filter((e) => {
      if (kindFilter !== "todos" && e.kind !== kindFilter) return false;
      if (statusFilter === "pendentes_ou_correcao") {
        if (e.approvalStatus !== "pendente" && e.approvalStatus !== "correcao") return false;
      } else if (statusFilter !== "todos" && e.approvalStatus !== statusFilter) {
        return false;
      }
      if (q) {
        return (
          e.name.toLowerCase().includes(q) ||
          e.code.toLowerCase().includes(q) ||
          e.subtitle.toLowerCase().includes(q) ||
          e.phone.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [allEntries, search, kindFilter, statusFilter]);

  const paged = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const handleExport = () => {
    downloadCsv(
      "aprovacoes-mercado-uige",
      ["Código", "Tipo", "Nome", "Detalhes", "Localização", "Telefone", "Estado", "Nota", "Data"],
      filtered.map((e) => [
        e.code,
        e.kind === "loja" ? "Loja" : e.kind === "produto" ? "Artigo" : "Conta",
        e.name,
        e.subtitle,
        e.location,
        e.phone,
        e.approvalStatus,
        e.note || "",
        fmtDateTime(e.createdAt),
      ])
    );
  };

  return (
    <div className="space-y-4 anim-fadeUp">
      <TableToolbar
        title="Fila de Aprovações (Lojas, Ambulantes e Entregadores)"
        subtitle="Valida documentos (BI e fachada) com opções de aprovar, rejeitar com motivo ou pedir correcção."
        search={search}
        onSearchChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        searchPlaceholder="Pesquisar por nome ou código (LJ- / CL-)..."
        filterValue={statusFilter}
        onFilterChange={(v) => {
          setStatusFilter(v);
          setPage(1);
        }}
        filterOptions={[
          { value: "pendentes_ou_correcao", label: "Pendentes e Correcção" },
          { value: "pendente", label: "Só Pendentes" },
          { value: "correcao", label: "Em Correcção" },
          { value: "rejeitado", label: "Rejeitados" },
          { value: "aprovado", label: "Aprovados" },
          { value: "todos", label: "Todos os estados" },
        ]}
        secondFilterValue={kindFilter}
        onSecondFilterChange={(v) => {
          setKindFilter(v);
          setPage(1);
        }}
        secondFilterOptions={[
          { value: "todos", label: "Lojas, Contas e Artigos" },
          { value: "loja", label: "Apenas Lojas" },
          { value: "utilizador", label: "Apenas Comerciantes / Entregadores" },
          { value: "produto", label: "Apenas Artigos" },
        ]}
        onExportCsv={handleExport}
        totalFiltered={filtered.length}
      />

      {paged.length === 0 ? (
        <div className="p-8 text-center rounded-2xl bg-[#172338] border border-[#26354B] text-xs text-[#A6B2C5]">
          Nenhum pedido de aprovação encontrado com estes filtros.
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {paged.map((entry) => (
            <div
              key={entry.id}
              className="p-4 rounded-2xl bg-[#172338] border border-[#26354B] flex flex-col justify-between gap-4 text-xs"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2 py-0.5 rounded-md bg-[#111D30] border border-[#26354B] font-black text-[#B7F34A]">
                        {entry.code}
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-[#246BFD]/15 text-[#246BFD] font-bold flex items-center gap-1">
                        {entry.kind === "loja" ? <StoreIcon size={11} /> : <UserCheck size={11} />}
                        {entry.kind === "loja" ? "Loja" : entry.kind === "produto" ? "Artigo" : "Conta"}
                      </span>
                    </div>
                    <h3 className="font-black text-sm text-white mt-1.5 truncate">{entry.name}</h3>
                    <p className="text-[#A6B2C5] truncate">{entry.subtitle}</p>
                  </div>

                  <span
                    className={`px-2.5 py-1 rounded-lg font-black capitalize whitespace-nowrap shrink-0 ${
                      entry.approvalStatus === "aprovado"
                        ? "bg-emerald-500/15 text-emerald-400"
                        : entry.approvalStatus === "rejeitado"
                        ? "bg-red-500/15 text-red-400"
                        : entry.approvalStatus === "correcao"
                        ? "bg-[#246BFD]/20 text-blue-300"
                        : "bg-amber-500/15 text-amber-300"
                    }`}
                  >
                    {entry.approvalStatus === "correcao"
                      ? entry.kind === "produto"
                        ? "Em revisão"
                        : "Em correcção"
                      : entry.approvalStatus}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3 rounded-xl bg-[#111D30] border border-[#26354B] text-[11px]">
                  <div>
                    <span className="text-[#A6B2C5] block">Localização</span>
                    <span className="text-white font-semibold">{entry.location}</span>
                  </div>
                  <div>
                    <span className="text-[#A6B2C5] block">Telefone / BI</span>
                    <span className="text-white font-semibold">
                      {entry.phone}
                      {entry.biNumber ? ` · BI ${entry.biNumber}` : ""}
                    </span>
                  </div>
                </div>

                {/* BI e Foto da Fachada sempre visíveis quando presentes */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-2.5 rounded-xl bg-[#111D30] border border-[#26354B] space-y-2">
                    <span className="text-[11px] font-bold text-[#A6B2C5] flex items-center gap-1">
                      <FileText size={12} className="text-[#B7F34A]" /> Foto do BI
                    </span>
                    {entry.biPhotoUrl ? (
                      <button
                        type="button"
                        onClick={() => onPreviewImage(entry.biPhotoUrl!)}
                        className="group relative w-full h-28 rounded-lg overflow-hidden bg-[#07111F] block cursor-pointer"
                      >
                        <SafeImage src={entry.biPhotoUrl} alt={`BI de ${entry.name}`} className="w-full h-full object-cover" />
                        <span className="absolute bottom-1.5 right-1.5 px-2 py-0.5 rounded bg-black/75 text-white text-[10px] font-bold flex items-center gap-1">
                          <Eye size={10} /> Ampliar
                        </span>
                      </button>
                    ) : (
                      <div className="h-28 rounded-lg bg-[#07111F] border border-dashed border-[#26354B] flex items-center justify-center text-[11px] text-slate-500">
                        Sem foto do BI
                      </div>
                    )}
                  </div>

                  <div className="p-2.5 rounded-xl bg-[#111D30] border border-[#26354B] space-y-2">
                    <span className="text-[11px] font-bold text-[#A6B2C5] flex items-center gap-1">
                      <StoreIcon size={12} className="text-[#246BFD]" /> Foto da Fachada
                    </span>
                    {entry.facadeImage ? (
                      <button
                        type="button"
                        onClick={() => onPreviewImage(entry.facadeImage!)}
                        className="group relative w-full h-28 rounded-lg overflow-hidden bg-[#07111F] block cursor-pointer"
                      >
                        <SafeImage
                          src={entry.facadeImage}
                          alt={`Fachada de ${entry.name}`}
                          className="w-full h-full object-cover"
                        />
                        <span className="absolute bottom-1.5 right-1.5 px-2 py-0.5 rounded bg-black/75 text-white text-[10px] font-bold flex items-center gap-1">
                          <Eye size={10} /> Ampliar
                        </span>
                      </button>
                    ) : (
                      <div className="h-28 rounded-lg bg-[#07111F] border border-dashed border-[#26354B] flex items-center justify-center text-[11px] text-slate-500">
                        {entry.kind === "utilizador" ? "Conta individual" : "Sem foto da fachada"}
                      </div>
                    )}
                  </div>
                </div>

                {entry.note && (
                  <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-200">
                    <strong>Observação registada:</strong> {entry.note}
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-[#26354B] flex flex-wrap gap-2">
                {entry.kind === "produto" && entry.rawProduct ? (
                  <>
                    {(!entry.rawProduct.isApproved || entry.rawProduct.moderationStatus !== "publicado") && (
                      <button
                        type="button"
                        onClick={() => onApproveProduct?.(entry.rawProduct!)}
                        className="flex-1 px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                      >
                        <CheckCircle2 size={14} /> Restaurar Artigo
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onRejectProduct?.(entry.rawProduct!)}
                      className="px-3 py-2 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 hover:bg-red-500 hover:text-white font-bold flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <XCircle size={14} /> Remover Artigo
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        onApprove({
                          kind: entry.kind as "loja" | "utilizador",
                          store: entry.rawStore,
                          user: entry.rawUser,
                        })
                      }
                      className="flex-1 px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <CheckCircle2 size={14} /> Aprovar
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onRequestCorrection({
                          kind: entry.kind as "loja" | "utilizador",
                          store: entry.rawStore,
                          user: entry.rawUser,
                        })
                      }
                      className="flex-1 px-3 py-2 rounded-xl bg-[#246BFD]/15 border border-[#246BFD]/40 text-blue-200 hover:bg-[#246BFD] hover:text-white font-bold flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <AlertCircle size={14} /> Pedir correcção
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onReject({
                          kind: entry.kind as "loja" | "utilizador",
                          store: entry.rawStore,
                          user: entry.rawUser,
                        })
                      }
                      className="px-3 py-2 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 hover:bg-red-500 hover:text-white font-bold flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <XCircle size={14} /> Rejeitar
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
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
