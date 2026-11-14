import React, { useState } from "react";
import { MobileApp } from "@apps/mobile/src/App";
import { AdminApp } from "@apps/admin/src/App";
import { ShieldCheck, Smartphone } from "lucide-react";

export default function App() {
  const [appMode, setAppMode] = useState<"mobile" | "admin">(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const app = params.get("app");
      if (app === "admin") return "admin";
      return "mobile";
    } catch {
      return "mobile";
    }
  });

  const switchApp = (mode: "mobile" | "admin") => {
    setAppMode(mode);
    try {
      const url = new URL(window.location.href);
      if (mode === "admin") {
        url.searchParams.set("app", "admin");
      } else {
        url.searchParams.delete("app");
      }
      window.history.replaceState({}, "", url.toString());
    } catch {}
  };

  return (
    <div className="relative min-h-screen bg-[#07111F]">
      {/* Barra de alternância limpa no topo sem sobrepor botões do cabeçalho */}
      <div className="bg-[#050B16] border-b border-[#26354B] px-3 py-1.5 flex items-center justify-between gap-2 text-xs">
        <span className="text-[11px] font-bold text-[#A6B2C5] truncate">
          Mercado Uíge • Pré-visualização
        </span>
        <div className="flex items-center gap-1 p-0.5 rounded-xl bg-[#111D30] border border-[#26354B] shrink-0">
          <button
            type="button"
            onClick={() => switchApp("mobile")}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
              appMode === "mobile"
                ? "bg-[#246BFD] text-white font-black shadow-sm"
                : "text-[#A6B2C5] hover:text-white"
            }`}
          >
            <Smartphone size={12} />
            <span>App</span>
          </button>

          <button
            type="button"
            onClick={() => switchApp("admin")}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
              appMode === "admin"
                ? "bg-[#246BFD] text-white font-black shadow-sm"
                : "text-[#A6B2C5] hover:text-white"
            }`}
          >
            <ShieldCheck size={12} />
            <span>Admin</span>
          </button>
        </div>
      </div>

      {appMode === "admin" ? <AdminApp /> : <MobileApp />}
    </div>
  );
}
