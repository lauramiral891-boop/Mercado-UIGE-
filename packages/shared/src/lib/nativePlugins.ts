/**
 * Abstração de Plugins Nativos e APIs do Dispositivo (Capacitor / Android Web)
 */
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Network } from "@capacitor/network";
import { StatusBar, Style } from "@capacitor/status-bar";
import { Share } from "@capacitor/share";
import { Haptics, ImpactStyle } from "@capacitor/haptics";

export interface NetworkStatus {
  online: boolean;
  type?: string;
}

export const nativePlugins = {
  isNative(): boolean {
    return Capacitor.isNativePlatform();
  },

  /**
   * Monitoriza o estado de rede em tempo real (Capacitor Network + Web API fallback)
   */
  onNetworkChange(callback: (status: NetworkStatus) => void): () => void {
    if (Capacitor.isPluginAvailable("Network")) {
      Network.getStatus().then((status) => {
        callback({ online: status.connected, type: status.connectionType });
      });

      const handle = Network.addListener("networkStatusChange", (status) => {
        callback({ online: status.connected, type: status.connectionType });
      });

      return () => {
        handle.then((h) => h.remove());
      };
    }

    const handleOnline = () => callback({ online: true });
    const handleOffline = () => callback({ online: false });

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    callback({ online: typeof navigator !== "undefined" ? navigator.onLine : true });

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  },

  /**
   * Partilha nativa com o sistema Android (Capacitor Share + Web Share fallback)
   */
  async shareContent(title: string, text: string, url: string): Promise<boolean> {
    if (Capacitor.isPluginAvailable("Share")) {
      try {
        await Share.share({
          title,
          text,
          url,
          dialogTitle: "Partilhar no Mercado Uíge",
        });
        return true;
      } catch (err: any) {
        if (err.message?.includes("canceled")) return false;
      }
    }

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, text, url });
        return true;
      } catch {
        return false;
      }
    }

    try {
      await navigator.clipboard.writeText(`${title} - ${url}`);
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Feedback tátil / vibração (Android Haptics)
   */
  async hapticFeedback(durationMs = 25) {
    if (Capacitor.isPluginAvailable("Haptics")) {
      try {
        await Haptics.impact({ style: ImpactStyle.Light });
        return;
      } catch {}
    }

    if (typeof navigator !== "undefined" && navigator.vibrate) {
      try {
        navigator.vibrate(durationMs);
      } catch {}
    }
  },

  /**
   * Actualiza a cor da barra de estado (Status Bar)
   */
  async setStatusBarColor(color: string, isDarkContent = false) {
    if (Capacitor.isPluginAvailable("StatusBar")) {
      try {
        await StatusBar.setBackgroundColor({ color });
        await StatusBar.setStyle({ style: isDarkContent ? Style.Light : Style.Dark });
      } catch {}
    }

    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute("content", color);
    }
  },

  /**
   * Regista manipulador para o botão físico de voltar do Android
   */
  onBackButton(callback: () => void): () => void {
    if (Capacitor.isPluginAvailable("App")) {
      const handle = App.addListener("backButton", () => {
        callback();
      });
      return () => {
        handle.then((h) => h.remove());
      };
    }

    const handlePopState = (e: PopStateEvent) => {
      e.preventDefault();
      callback();
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  },
};
