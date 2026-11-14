import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
  },
  resolve: {
    alias: {
      "@mercado-uige/shared": path.resolve(import.meta.dirname, "packages/shared/src"),
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
});
