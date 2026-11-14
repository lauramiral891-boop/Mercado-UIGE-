import React, { useRef, useState, useEffect } from "react";
import {
  Search,
  MapPin,
  Bell,
  Mic,
  SlidersHorizontal,
  Sun,
  Moon,
  Laptop,
  ShoppingCart,
  User as UserIcon,
  X,
  ChevronDown,
} from "lucide-react";
import { User, ThemeMode, formatUserRole } from "@mercado-uige/shared";
import { OnlineStatusIndicator } from "./OnlineStatusIndicator";

interface HeaderProps {
  currentLocation: string;
  onOpenLocationModal: () => void;
  query: string;
  onQueryChange: (q: string) => void;
  onSearch: (q: string) => void;
  onVoiceSearch: () => void;
  isListening: boolean;
  onToggleFilters: () => void;
  filtersActive: boolean;
  themeMode: ThemeMode;
  onSetThemeMode: (mode: ThemeMode) => void;
  unreadCount: number;
  onOpenNotifications: () => void;
  user: User | null;
  onOpenAuth: () => void;
  onOpenProfile: () => void;
  onNavigateHome: () => void;
  activeView: string;
  onSelectNav: (view: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentLocation,
  onOpenLocationModal,
  query,
  onQueryChange,
  onSearch,
  onVoiceSearch,
  isListening,
  onToggleFilters,
  filtersActive,
  themeMode,
  onSetThemeMode,
  unreadCount,
  onOpenNotifications,
  user,
  onOpenAuth,
  onOpenProfile,
  onNavigateHome,
  activeView,
  onSelectNav,
}) => {
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const themeMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (themeMenuRef.current && !themeMenuRef.current.contains(e.target as Node)) {
        setShowThemeMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      onSearch(query);
    }
  };

  return (
    <header
      className="sticky top-0 z-40 backdrop-blur-xl border-b transition-colors duration-200"
      style={{
        backgroundColor: "var(--header-bg)",
        borderColor: "var(--border)",
      }}
    >
      <div className="max-w-7xl mx-auto px-2.5 sm:px-4 py-2 sm:py-2.5">
        {/* Top Area: Logo + Location + Theme + Auth */}
        <div className="flex items-center justify-between gap-1.5 sm:gap-3">
          {/* Logo & Brand */}
          <button
            type="button"
            onClick={onNavigateHome}
            className="flex items-center gap-1.5 sm:gap-2 group text-left cursor-pointer focus:outline-none min-w-0"
            title="Mercado Uíge - Início"
          >
            <div
              className="relative w-8 h-8 sm:w-10 sm:h-10 grid place-items-center rounded-xl sm:rounded-2xl transition-transform group-hover:scale-105 duration-200 shadow-md shrink-0"
              style={{
                background: "linear-gradient(135deg, #246BFD 0%, #07111F 100%)",
                border: "1.5px solid rgba(183, 243, 74, 0.4)",
              }}
            >
              <ShoppingCart size={18} color="#B7F34A" strokeWidth={2.4} />
            </div>
            <div className="min-w-0">
              <span className="font-black text-sm sm:text-lg tracking-tight block leading-tight truncate">
                Mercado <span style={{ color: "var(--accent)" }}>Uíge</span>
              </span>
              <span
                className="text-[9px] sm:text-[10px] tracking-wider uppercase opacity-75 font-bold block truncate"
                style={{ color: "var(--text-secondary)" }}
              >
                Província do Uíge
              </span>
            </div>
          </button>

          {/* Desktop Location Selector */}
          <button
            type="button"
            onClick={onOpenLocationModal}
            className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-all duration-200 hover:border-[#246BFD] cursor-pointer"
            style={{
              backgroundColor: "var(--surface)",
              borderColor: "var(--border)",
              color: "var(--text-primary)",
            }}
          >
            <MapPin size={13} style={{ color: "var(--primary)" }} />
            <span className="max-w-[130px] truncate">{currentLocation}</span>
            <ChevronDown size={12} className="opacity-60" />
          </button>

          {/* Right Area: Online Status + Theme + Notifications + User */}
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            <OnlineStatusIndicator />

            {/* Theme Selector */}
            <div className="relative" ref={themeMenuRef}>
              <button
                type="button"
                onClick={() => setShowThemeMenu(!showThemeMenu)}
                className="p-1.5 sm:p-2 rounded-full border transition-colors cursor-pointer"
                style={{
                  backgroundColor: "var(--surface)",
                  borderColor: "var(--border)",
                  color: "var(--text-primary)",
                }}
                title="Alterar tema visual"
                aria-label="Alterar tema visual"
              >
                {themeMode === "dark" && <Moon size={15} />}
                {themeMode === "light" && <Sun size={15} />}
                {themeMode === "system" && <Laptop size={15} />}
              </button>

              {showThemeMenu && (
                <div
                  className="absolute right-0 mt-2 w-36 rounded-2xl border shadow-xl p-1 z-50 text-xs anim-pop"
                  style={{
                    backgroundColor: "var(--surface)",
                    borderColor: "var(--border)",
                    color: "var(--text-primary)",
                  }}
                >
                  {[
                    { id: "dark", label: "Modo Escuro", icon: Moon },
                    { id: "light", label: "Modo Claro", icon: Sun },
                    { id: "system", label: "Automático", icon: Laptop },
                  ].map((t) => {
                    const Icon = t.icon;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          onSetThemeMode(t.id as ThemeMode);
                          setShowThemeMenu(false);
                        }}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-left font-medium transition-colors cursor-pointer ${
                          themeMode === t.id ? "bg-[#246BFD] text-white" : "hover:bg-slate-500/10"
                        }`}
                      >
                        <Icon size={14} />
                        <span>{t.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Notifications Button */}
            <button
              type="button"
              onClick={onOpenNotifications}
              className="relative p-1.5 sm:p-2 rounded-full border transition-colors cursor-pointer"
              style={{
                backgroundColor: "var(--surface)",
                borderColor: "var(--border)",
                color: "var(--text-primary)",
              }}
              title="Notificações"
              aria-label="Abrir notificações"
            >
              <Bell size={15} />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-600 text-white text-[10px] font-black flex items-center justify-center shadow-md animate-pulse">
                  {unreadCount}
                </span>
              )}
            </button>

            {/* User Profile / Login */}
            {user ? (
              <button
                type="button"
                onClick={onOpenProfile}
                className="flex items-center gap-1.5 sm:gap-2 p-1 sm:pl-1 sm:pr-3 rounded-full border transition-colors cursor-pointer"
                style={{
                  backgroundColor: "var(--surface)",
                  borderColor: "var(--border)",
                }}
                aria-label="Abrir perfil da conta"
              >
                <div
                  className="w-7 h-7 rounded-full grid place-items-center font-black text-xs text-slate-950 shadow-sm shrink-0"
                  style={{ backgroundColor: "var(--accent)" }}
                >
                  {(user.name || "U").charAt(0).toUpperCase()}
                </div>
                <div className="hidden sm:block text-left leading-tight">
                  <span className="block text-xs font-bold truncate max-w-[90px]" style={{ color: "var(--text-primary)" }}>
                    {(user.name || "Utilizador").split(" ")[0]}
                  </span>
                  <span className="block text-[10px] opacity-65" style={{ color: "var(--text-secondary)" }}>
                    {formatUserRole(user.role)}
                  </span>
                </div>
              </button>
            ) : (
              <button
                type="button"
                onClick={onOpenAuth}
                className="px-2.5 sm:px-3.5 py-1.5 rounded-full font-bold text-xs text-white shadow-sm transition-transform active:scale-95 cursor-pointer flex items-center gap-1 shrink-0 whitespace-nowrap"
                style={{ backgroundColor: "var(--primary)" }}
              >
                <UserIcon size={13} />
                <span>Entrar</span>
              </button>
            )}
          </div>
        </div>

        {/* Second Area: Smart Search Bar */}
        <div className="mt-2 flex items-center gap-1.5 sm:gap-2">
          <div
            className="flex-1 min-w-0 flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-2xl border transition-all duration-200 focus-within:ring-2 focus-within:ring-[#246BFD]"
            style={{
              backgroundColor: "var(--surface)",
              borderColor: "var(--border)",
            }}
          >
            <Search size={15} className="opacity-50 shrink-0" style={{ color: "var(--text-secondary)" }} />
            <input
              type="text"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Pesquisar produtos ou lojas no Uíge…"
              className="flex-1 bg-transparent outline-none text-xs sm:text-sm min-w-0"
              style={{ color: "var(--text-primary)" }}
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  onQueryChange("");
                  onSearch("");
                }}
                className="p-1 opacity-60 hover:opacity-100 cursor-pointer shrink-0"
                aria-label="Limpar pesquisa"
              >
                <X size={14} />
              </button>
            )}
            <button
              type="button"
              onClick={onVoiceSearch}
              className={`p-1.5 rounded-full transition-colors cursor-pointer shrink-0 ${
                isListening ? "bg-red-500 text-white animate-pulse" : "hover:bg-slate-500/10 text-[#246BFD]"
              }`}
              title="Pesquisa por voz"
              aria-label="Pesquisa por voz"
            >
              <Mic size={15} />
            </button>
          </div>

          {/* Quick Filter Button */}
          <button
            type="button"
            onClick={onToggleFilters}
            className={`px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-2xl border font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
              filtersActive ? "bg-[#246BFD] text-white border-[#246BFD]" : "hover:border-[#246BFD]"
            }`}
            style={
              !filtersActive
                ? {
                    backgroundColor: "var(--surface)",
                    borderColor: "var(--border)",
                    color: "var(--text-primary)",
                  }
                : {}
            }
            title="Filtros e ordenação"
            aria-label="Filtros e ordenação"
          >
            <SlidersHorizontal size={14} />
            <span className="hidden sm:inline">Filtros</span>
          </button>
        </div>

        {/* Mobile Location Strip */}
        <div className="flex md:hidden items-center justify-between mt-1.5">
          <button
            type="button"
            onClick={onOpenLocationModal}
            className="inline-flex items-center gap-1 text-[11px] font-bold hover:text-[#246BFD] cursor-pointer max-w-full"
            style={{ color: "var(--text-secondary)" }}
          >
            <MapPin size={12} style={{ color: "var(--primary)" }} className="shrink-0" />
            <span className="truncate">{currentLocation}</span>
            <ChevronDown size={11} className="opacity-60 shrink-0" />
          </button>
        </div>

        {/* Desktop Quick Nav Tabs */}
        <nav className="hidden md:flex gap-1.5 mt-2.5 overflow-x-auto no-scrollbar text-xs font-bold pt-1">
          {[
            { id: "home", label: "Início" },
            { id: "used", label: "Usados" },
            { id: "categories", label: "Categorias" },
            { id: "stores", label: "Lojas" },
            { id: "search", label: "Pesquisa" },
            { id: "cart", label: "Carrinho" },
            { id: "orders", label: "Encomendas" },
            { id: "favorites", label: "Favoritos" },
            { id: "seller", label: "Vender no Uíge" },
            ...(user?.role === "entregador" ? [{ id: "courier", label: "Entregas" }] : []),
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelectNav(tab.id)}
              className={`px-3.5 py-1.5 rounded-full whitespace-nowrap transition-all duration-200 cursor-pointer ${
                activeView === tab.id
                  ? "bg-[#246BFD] text-white shadow-sm"
                  : "border hover:border-[#246BFD]"
              }`}
              style={
                activeView !== tab.id
                  ? {
                      backgroundColor: "var(--surface)",
                      borderColor: "var(--border)",
                      color: "var(--text-secondary)",
                    }
                  : {}
              }
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
};
