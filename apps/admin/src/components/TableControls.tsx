import React from "react";
import { Download, Search, ChevronLeft, ChevronRight } from "lucide-react";

export interface TableFilterOption {
  value: string;
  label: string;
}

export interface TableToolbarProps {
  title: string;
  subtitle?: string;
  search: string;
  onSearchChange: (val: string) => void;
  searchPlaceholder?: string;
  filterValue?: string;
  onFilterChange?: (val: string) => void;
  filterOptions?: TableFilterOption[];
  secondFilterValue?: string;
  onSecondFilterChange?: (val: string) => void;
  secondFilterOptions?: TableFilterOption[];
  onExportCsv?: () => void;
  exportLabel?: string;
  totalFiltered: number;
}

export const TableToolbar: React.FC<TableToolbarProps> = ({
  title,
  subtitle,
  search,
  onSearchChange,
  searchPlaceholder = "Pesquisar por nome ou código (LJ- / CL-)...",
  filterValue,
  onFilterChange,
  filterOptions,
  secondFilterValue,
  onSecondFilterChange,
  secondFilterOptions,
  onExportCsv,
  exportLabel = "Exportar CSV",
  totalFiltered,
}) => {
  return (
    <div className="p-4 rounded-2xl bg-[#172338] border border-[#26354B] space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 className="font-black text-base text-white tracking-tight">{title}</h2>
          {subtitle && <p className="text-xs text-[#A6B2C5]">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-[#A6B2C5] tabular-nums">
            {totalFiltered} {totalFiltered === 1 ? "registo" : "registos"}
          </span>
          {onExportCsv && (
            <button
              type="button"
              onClick={onExportCsv}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#111D30] border border-[#26354B] hover:border-[#246BFD] text-xs font-bold text-slate-100 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Download size={13} className="text-[#B7F34A]" />
              <span>{exportLabel}</span>
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#111D30] border border-[#26354B] focus-within:border-[#246BFD] text-xs flex-1 min-w-0">
          <Search size={14} className="text-[#A6B2C5] shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="bg-transparent outline-none text-white w-full min-w-0 font-medium placeholder:text-slate-500"
          />
        </div>

        {filterOptions && onFilterChange && (
          <select
            value={filterValue}
            onChange={(e) => onFilterChange(e.target.value)}
            className="px-3 py-2 rounded-xl bg-[#111D30] border border-[#26354B] text-xs font-bold text-white outline-none focus:border-[#246BFD]"
          >
            {filterOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        )}

        {secondFilterOptions && onSecondFilterChange && (
          <select
            value={secondFilterValue}
            onChange={(e) => onSecondFilterChange(e.target.value)}
            className="px-3 py-2 rounded-xl bg-[#111D30] border border-[#26354B] text-xs font-bold text-white outline-none focus:border-[#246BFD]"
          >
            {secondFilterOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
};

export interface PaginationBarProps {
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (next: number) => void;
  onPageSizeChange?: (nextSize: number) => void;
}

export const PaginationBar: React.FC<PaginationBarProps> = ({
  page,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
}) => {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const startIdx = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endIdx = Math.min(totalItems, safePage * pageSize);

  if (totalItems === 0) return null;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 py-3 rounded-2xl bg-[#172338] border border-[#26354B] text-xs">
      <div className="flex items-center gap-3 text-[#A6B2C5]">
        <span className="tabular-nums">
          A mostrar <strong className="text-white">{startIdx}–{endIdx}</strong> de{" "}
          <strong className="text-white">{totalItems}</strong>
        </span>
        {onPageSizeChange && (
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            aria-label="Registos por página"
            className="px-2 py-1 rounded-lg bg-[#111D30] border border-[#26354B] text-white font-bold outline-none"
          >
            <option value={10}>10 / página</option>
            <option value={25}>25 / página</option>
            <option value={50}>50 / página</option>
          </select>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={safePage <= 1}
          onClick={() => onPageChange(safePage - 1)}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#111D30] border border-[#26354B] text-white font-bold disabled:opacity-40 cursor-pointer whitespace-nowrap shrink-0"
        >
          <ChevronLeft size={14} /> Anterior
        </button>
        <span className="text-[#A6B2C5] font-bold tabular-nums px-1">
          Página {safePage} / {totalPages}
        </span>
        <button
          type="button"
          disabled={safePage >= totalPages}
          onClick={() => onPageChange(safePage + 1)}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#111D30] border border-[#26354B] text-white font-bold disabled:opacity-40 cursor-pointer whitespace-nowrap shrink-0"
        >
          Seguinte <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
};
