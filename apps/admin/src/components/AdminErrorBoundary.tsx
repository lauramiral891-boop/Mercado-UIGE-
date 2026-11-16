import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { appErrorRepo, sanitizeTelemetryText } from "@mercado-uige/shared";

interface AdminErrorBoundaryProps {
  children: React.ReactNode;
}

interface AdminErrorBoundaryState {
  hasError: boolean;
}

export class AdminErrorBoundary extends React.Component<
  AdminErrorBoundaryProps,
  AdminErrorBoundaryState
> {
  constructor(props: AdminErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): AdminErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error): void {
    const safeMsg = sanitizeTelemetryText(error?.message || "Erro de renderização no painel", 160);
    appErrorRepo
      .report({
        screen: "painel_admin",
        message: safeMsg,
        source: "ErrorBoundary",
      })
      .catch(() => {});
  }

  handleReload = () => {
    this.setState({ hasError: false });
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#07111F] text-slate-100 flex items-center justify-center p-6 text-center">
          <div className="w-full max-w-md rounded-3xl p-6 bg-[#172338] border border-[#26354B] space-y-4 shadow-2xl">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-[#246BFD]/20 text-[#B7F34A] flex items-center justify-center">
              <AlertTriangle size={28} />
            </div>
            <h1 className="text-lg font-black text-white">Ocorreu uma falha no ecrã do painel</h1>
            <p className="text-xs text-[#A6B2C5] leading-relaxed">
              O incidente foi registado de forma segura na Observabilidade para análise da equipa técnica.
            </p>
            <button
              type="button"
              onClick={this.handleReload}
              className="w-full py-3 rounded-2xl font-black text-xs text-slate-950 bg-[#B7F34A] inline-flex items-center justify-center gap-2 cursor-pointer shadow-lg"
            >
              <RefreshCw size={15} /> Recarregar Painel
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
