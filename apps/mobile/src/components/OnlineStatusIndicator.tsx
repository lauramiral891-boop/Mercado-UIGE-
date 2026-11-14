import React, { useEffect, useState } from "react";
import { Wifi, WifiOff } from "lucide-react";
import { nativePlugins } from "@mercado-uige/shared";

export const OnlineStatusIndicator: React.FC = () => {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const cleanup = nativePlugins.onNetworkChange((status) => {
      setIsOnline(status.online);
    });
    return cleanup;
  }, []);

  if (isOnline) {
    return (
      <div
        className="inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 rounded-full text-[10px] font-bold border transition-colors shadow-sm shrink-0"
        style={{
          backgroundColor: "rgba(183, 243, 74, 0.12)",
          borderColor: "rgba(183, 243, 74, 0.3)",
          color: "var(--accent)",
        }}
        title="Ligação activa à rede"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-[#B7F34A] animate-pulse" />
        <Wifi size={11} />
        <span className="hidden sm:inline">Online</span>
      </div>
    );
  }

  return (
    <div
      className="inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 rounded-full text-[10px] font-black border transition-colors shadow-sm animate-pulse shrink-0"
      style={{
        backgroundColor: "rgba(245, 158, 11, 0.15)",
        borderColor: "rgba(245, 158, 11, 0.4)",
        color: "#F59E0B",
      }}
      title="Sem ligação à Internet. Modo offline activo."
    >
      <WifiOff size={11} />
      <span className="sm:hidden">Offline</span>
      <span className="hidden sm:inline">Offline (Modo Uíge)</span>
    </div>
  );
};
