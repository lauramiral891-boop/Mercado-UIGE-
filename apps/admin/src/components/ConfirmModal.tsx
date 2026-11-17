import React, { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { ServerErrorDetail } from "@mercado-uige/shared";

export interface ConfirmModalProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "warning" | "primary";
  requireReason?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  loading?: boolean;
  serverError?: ServerErrorDetail | null;
  onCancel: () => void;
  onConfirm: (reason?: string) => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  open,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  tone = "danger",
  requireReason = false,
  reasonLabel = "Motivo / Nota",
  reasonPlaceholder = "Escreve o motivo detalhado para o registo de auditoria...",
  loading = false,
  serverError = null,
  onCancel,
  onConfirm,
}) => {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setReason("");
      setError("");
    }
  }, [open]);

  if (!open) return null;

  const confirmClass =
    tone === "danger"
      ? "bg-red-500 hover:bg-red-600 text-white"
      : tone === "warning"
      ? "bg-amber-400 hover:bg-amber-500 text-slate-950"
      : "bg-[#246BFD] hover:bg-[#1a5ce0] text-white";

  const handleConfirm = () => {
    if (requireReason && reason.trim().length < 4) {
      setError("Indica um motivo ou nota com pelo menos 4 caracteres.");
      return;
    }
    onConfirm(reason.trim() || undefined);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-[#172338] border border-[#26354B] p-5 shadow-2xl space-y-4 anim-pop"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                tone === "danger"
                  ? "bg-red-500/15 text-red-400"
                  : tone === "warning"
                  ? "bg-amber-400/15 text-amber-300"
                  : "bg-[#246BFD]/15 text-[#246BFD]"
              }`}
            >
              <AlertTriangle size={18} />
            </div>
            <h3 id="confirm-modal-title" className="text-sm font-black text-white">
              {title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 rounded-lg text-[#A6B2C5] hover:text-white hover:bg-[#111D30] cursor-pointer"
            aria-label="Fechar confirmação"
          >
            <X size={16} />
          </button>
        </div>

        <p className="text-xs text-[#A6B2C5] leading-relaxed">{description}</p>

        {requireReason && (
          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold text-slate-300">{reasonLabel}</label>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (error) setError("");
              }}
              placeholder={reasonPlaceholder}
              className="w-full p-2.5 rounded-xl bg-[#111D30] border border-[#26354B] text-xs text-white outline-none focus:border-[#246BFD]"
            />
            {error && <p className="text-[11px] text-red-400 font-bold">{error}</p>}
          </div>
        )}

        {serverError && (
          <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/40 text-red-200 text-xs space-y-1">
            <p className="font-bold">{serverError.message}</p>
            {serverError.code && (
              <p className="text-[10px] font-mono text-red-300/90">Código técnico: {serverError.code}</p>
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#26354B]">
          <button
            type="button"
            disabled={loading}
            onClick={onCancel}
            className="px-4 py-2 rounded-xl border border-[#26354B] bg-[#111D30] text-xs font-bold text-[#A6B2C5] hover:text-white cursor-pointer whitespace-nowrap shrink-0"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={handleConfirm}
            className={`px-4 py-2 rounded-xl text-xs font-black cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50 ${confirmClass}`}
          >
            {loading ? "A processar..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
