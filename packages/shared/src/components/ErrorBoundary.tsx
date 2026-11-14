import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(): void {
    // Suprimido para evitar exposição de stack traces ao utilizador
  }

  handleReset = () => {
    this.setState({ hasError: false });
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="min-h-screen flex items-center justify-center p-6 text-center"
          style={{ backgroundColor: "#07111F", color: "#F8FAFC" }}
        >
          <div
            className="w-full max-w-sm rounded-3xl p-6 border space-y-4 shadow-2xl"
            style={{ backgroundColor: "#172338", borderColor: "#26354B" }}
          >
            <div
              className="w-14 h-14 mx-auto rounded-2xl grid place-items-center"
              style={{ backgroundColor: "rgba(36, 107, 253, 0.16)", color: "#B7F34A" }}
            >
              <AlertTriangle size={28} />
            </div>
            <h1 className="text-lg font-black">Ocorreu um problema inesperado</h1>
            <p className="text-xs leading-relaxed" style={{ color: "#A6B2C5" }}>
              Não foi possível mostrar este ecrã neste momento. Toca no botão abaixo para reabrir o Mercado Uíge.
            </p>
            <button
              type="button"
              onClick={this.handleReset}
              className="w-full py-3 rounded-2xl font-black text-xs text-slate-950 inline-flex items-center justify-center gap-2 cursor-pointer shadow-lg"
              style={{ backgroundColor: "#B7F34A" }}
            >
              <RefreshCw size={15} />
              <span>Recarregar Aplicação</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
