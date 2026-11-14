import { createRoot } from "react-dom/client";
import { ErrorBoundary } from "@mercado-uige/shared";
import { AdminApp } from "./App";
import "@/index.css";

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <AdminApp />
  </ErrorBoundary>
);
