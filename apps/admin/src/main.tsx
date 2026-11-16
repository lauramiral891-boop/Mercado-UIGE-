import { createRoot } from "react-dom/client";
import { AdminErrorBoundary } from "./components/AdminErrorBoundary";
import { AdminApp } from "./App";
import "@/index.css";

createRoot(document.getElementById("root")!).render(
  <AdminErrorBoundary>
    <AdminApp />
  </AdminErrorBoundary>
);
