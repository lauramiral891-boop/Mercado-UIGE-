import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

const rootEnvPath = path.resolve(import.meta.dirname, "../../.env");
if (process.env.VITE_SUPABASE_ANON_KEY?.startsWith("sb_secret_") && fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath, override: true });
}

export default defineConfig({
  root: path.resolve(import.meta.dirname),
  envDir: path.resolve(import.meta.dirname, "../.."),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@mercado-uige/shared": path.resolve(import.meta.dirname, "../../packages/shared/src"),
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  build: {
    outDir: path.resolve(import.meta.dirname, "../../dist/admin"),
    emptyOutDir: true,
    target: "es2022",
  },
});
