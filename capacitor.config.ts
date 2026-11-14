import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "ao.mercadouige.app",
  appName: "Mercado Uíge",
  webDir: "dist/mobile",
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: "#07111F",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
    },
    StatusBar: {
      backgroundColor: "#07111F",
      style: "DARK",
      overlaysWebView: false,
    },
    Network: {},
    App: {},
    Share: {},
    Haptics: {},
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
};

export default config;
