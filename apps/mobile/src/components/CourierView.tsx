import React, { useState } from "react";
import {
  Truck,
  CheckCircle2,
  Package,
  MapPin,
  Clock,
  AlertTriangle,
  Wallet,
  Calendar,
  Upload,
  Crown,
} from "lucide-react";
import {
  User,
  DeliveryRecord,
  CourierMonthlyFee,
  MerchantPayment,
  PlanType,
  SystemConfig,
  fmtKz,
  fmtDate,
  formatPlanType,
  getPlanPriceForType,
  deliveryRepo,
  paymentRepo,
  compressImage,
  uploadProductImage,
  isSupabaseConfigured,
  translateErrorMessage,
} from "@mercado-uige/shared";

interface CourierViewProps {
  user: User | null;
  deliveries: DeliveryRecord[];
  monthlyFees: CourierMonthlyFee[];
  myPayments?: MerchantPayment[];
  systemConfig: SystemConfig;
  onOpenAuth: () => void;
  onReload: () => Promise<void>;
  showToast: (msg: string) => void;
}

export const CourierView: React.FC<CourierViewProps> = ({
  user,
  deliveries,
  monthlyFees,
  myPayments = [],
  systemConfig,
  onOpenAuth,
  onReload,
  showToast,
}) => {
  const [subTab, setSubTab] = useState<"available" | "mine" | "earnings" | "fee" | "plans">("available");
  const [codeInputs, setCodeInputs] = useState<Record<string, string>>({});
  const [issueInputs, setIssueInputs] = useState<Record<string, string>>({});
  const [reportingId, setReportingId] = useState<string | null>(null);
  const [feeMonth, setFeeMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [feeProofPreview, setFeeProofPreview] = useState("");
  const [feeProofBlob, setFeeProofBlob] = useState<{ blob: Blob; fileName: string } | null>(null);
  const [submittingFee, setSubmittingFee] = useState(false);

  const [courierTargetPlan, setCourierTargetPlan] = useState<PlanType>("basico");
  const [planMethod, setPlanMethod] = useState<"Multicaixa Express" | "Referência" | "Transferência">(
    "Multicaixa Express"
  );
  const [planRef, setPlanRef] = useState("");
  const [planProofPreview, setPlanProofPreview] = useState("");
  const [planProofBlob, setPlanProofBlob] = useState<{ blob: Blob; fileName: string } | null>(null);
  const [submittingPlan, setSubmittingPlan] = useState(false);

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto p-8 text-center rounded-3xl border space-y-3" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}>
        <Truck size={40} className="mx-auto text-[#246BFD] opacity-75" />
        <h2 className="font-black text-base">Portal do Entregador</h2>
        <p className="text-xs opacity-75">Inicia sessão com a tua conta de entregador para ver pedidos e gerir entregas no Uíge.</p>
        <button
          type="button"
          onClick={onOpenAuth}
          className="px-5 py-2.5 rounded-2xl font-black text-xs text-white cursor-pointer"
          style={{ backgroundColor: "var(--primary)" }}
        >
          Entrar como Entregador
        </button>
      </div>
    );
  }

  if (user.role !== "entregador") {
    return (
      <div className="max-w-2xl mx-auto p-8 text-center rounded-3xl border space-y-2" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}>
        <Truck size={36} className="mx-auto opacity-50 text-[#246BFD]" />
        <h2 className="font-black text-base">Conta não registada como Entregador</h2>
        <p className="text-xs opacity-70">Esta área é exclusiva para contas de entregador da equipa Mercado Uíge.</p>
      </div>
    );
  }

  if (user.isApproved === false) {
    return (
      <div className="max-w-2xl mx-auto p-6 sm:p-8 rounded-3xl border space-y-3 text-center" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}>
        <Clock size={40} className="mx-auto text-amber-400" />
        <h2 className="font-black text-base">Cadastro de Entregador em Aprovação</h2>
        <p className="text-xs opacity-75 max-w-md mx-auto">
          Os teus dados (BI: <b>{user.biNumber || "Em análise"}</b>, Telefone: <b>{user.phone || "—"}</b>, Bairro: <b>{user.bairro || user.municipality || "Uíge"}</b>) estão a ser verificados. Assim que fores aprovado, poderás aceitar entregas.
        </p>
      </div>
    );
  }

  const availableDeliveries = deliveries.filter((d) => d.status === "Pedido" && !d.courierId);
  const myDeliveries = deliveries.filter((d) => d.courierId === user.id);
  const activeDeliveries = myDeliveries.filter((d) => d.status !== "Entregue");
  const completedDeliveries = myDeliveries.filter((d) => d.status === "Entregue");
  const myFees = monthlyFees.filter((f) => f.courierId === user.id);

  const totalEarned = completedDeliveries.reduce((s, d) => s + Number(d.courierEarning || 0), 0);
  const totalCommission = completedDeliveries.reduce((s, d) => s + Number(d.commissionAmount || 0), 0);

  const handleAccept = async (deliveryId: string) => {
    try {
      await deliveryRepo.accept(deliveryId, user.id, user.name);
      showToast("Pedido de entrega aceite! Recolhe na loja.");
      await onReload();
      setSubTab("mine");
    } catch (err: unknown) {
      showToast(translateErrorMessage(err, "Não foi possível aceitar a entrega."));
    }
  };

  const handleAdvanceStatus = async (deliveryId: string, nextStatus: "Recolhido" | "A caminho") => {
    try {
      await deliveryRepo.updateStatus(deliveryId, nextStatus);
      showToast(`Estado actualizado para: ${nextStatus}`);
      await onReload();
    } catch (err: unknown) {
      showToast(translateErrorMessage(err, "Não foi possível actualizar o estado."));
    }
  };

  const handleConfirmCode = async (deliveryId: string) => {
    const code = (codeInputs[deliveryId] || "").trim();
    if (code.length < 4) {
      showToast("Introduz o código de entrega fornecido pelo cliente.");
      return;
    }
    try {
      const res = await deliveryRepo.confirmWithCode(deliveryId, code);
      showToast(res.message);
      if (res.ok) {
        setCodeInputs((prev) => ({ ...prev, [deliveryId]: "" }));
        await onReload();
      }
    } catch (err: unknown) {
      showToast(translateErrorMessage(err, "Não foi possível confirmar a entrega."));
    }
  };

  const handleReportIssue = async (deliveryId: string) => {
    const desc = (issueInputs[deliveryId] || "").trim();
    if (!desc) {
      showToast("Descreve o atraso ou problema ocorrido.");
      return;
    }
    try {
      await deliveryRepo.reportIssue(deliveryId, desc, true);
      setReportingId(null);
      setIssueInputs((prev) => ({ ...prev, [deliveryId]: "" }));
      showToast("Ocorrência registada para acompanhamento.");
      await onReload();
    } catch (err: unknown) {
      showToast(translateErrorMessage(err, "Não foi possível registar o problema."));
    }
  };

  const handleUploadFeeProof = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { blob, dataUrl, sizeKB } = await compressImage(file);
      setFeeProofPreview(dataUrl);
      setFeeProofBlob({ blob, fileName: file.name || `mensalidade_${Date.now()}.jpg` });
      showToast(`Comprovativo comprimido (${sizeKB} KB) ✓`);
    } catch (err: unknown) {
      showToast(translateErrorMessage(err, "Não foi possível processar a imagem."));
    }
  };

  const handleSubmitFee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feeProofPreview) {
      showToast("Anexa o comprovativo do pagamento da mensalidade.");
      return;
    }
    setSubmittingFee(true);
    try {
      let proofUrl = feeProofPreview;
      if (isSupabaseConfigured && feeProofBlob && navigator.onLine) {
        const { url } = await uploadProductImage(feeProofBlob.blob, feeProofBlob.fileName, "mensalidades");
        if (url) proofUrl = url;
      }
      await deliveryRepo.submitMonthlyFee({
        courierId: user.id,
        courierName: user.name,
        referenceMonth: feeMonth,
        amountKz: systemConfig.courierMonthlyFee,
        proofUrl,
      });
      setFeeProofPreview("");
      setFeeProofBlob(null);
      showToast("Comprovativo de mensalidade enviado para confirmação!");
      await onReload();
    } catch (err: unknown) {
      showToast(translateErrorMessage(err, "Não foi possível enviar a mensalidade."));
    } finally {
      setSubmittingFee(false);
    }
  };

  const courierBasicPrice = getPlanPriceForType(systemConfig, "entregador", "basico");
  const courierVipPrice = getPlanPriceForType(systemConfig, "entregador", "vip");

  const handleUploadPlanProof = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { blob, dataUrl, sizeKB } = await compressImage(file);
      setPlanProofPreview(dataUrl);
      setPlanProofBlob({ blob, fileName: file.name || `plano_entregador_${Date.now()}.jpg` });
      showToast(`Comprovativo comprimido (${sizeKB} KB) ✓`);
    } catch (err: unknown) {
      showToast(translateErrorMessage(err, "Não foi possível processar a imagem."));
    }
  };

  const handleSubmitCourierPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!planProofPreview) {
      showToast("Anexa o comprovativo de pagamento do plano.");
      return;
    }
    setSubmittingPlan(true);
    try {
      let proofUrl = planProofPreview;
      if (isSupabaseConfigured && planProofBlob && navigator.onLine) {
        const { url } = await uploadProductImage(planProofBlob.blob, planProofBlob.fileName, "comprovativos");
        if (url) proofUrl = url;
      }
      const amountKz = getPlanPriceForType(systemConfig, "entregador", courierTargetPlan);
      await paymentRepo.create({
        sellerId: user.id,
        sellerName: user.name,
        userRoleType: "entregador",
        type: "plano",
        targetPlan: courierTargetPlan,
        amountKz,
        method: planMethod,
        reference: planRef.trim(),
        proofUrl,
      });
      setPlanProofPreview("");
      setPlanProofBlob(null);
      setPlanRef("");
      showToast("Comprovativo do plano enviado! Será activado após validação.");
      await onReload();
    } catch (err: unknown) {
      showToast(translateErrorMessage(err, "Não foi possível enviar o comprovativo do plano."));
    } finally {
      setSubmittingPlan(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-4 anim-fadeUp">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-black">Painel do Entregador</h1>
          <p className="text-xs opacity-70">
            Código: <b>{user.code || "—"}</b> · {user.bairro || user.municipality || "Uíge"} · Plano{" "}
            <b className="text-[#B7F34A]">{formatPlanType(user.planType)}</b>
          </p>
        </div>
        <div className="text-right">
          <span className="text-[11px] opacity-65 block">Ganhos Líquidos</span>
          <span className="text-base font-black tabular-nums" style={{ color: "var(--accent)" }}>
            {fmtKz(totalEarned)}
          </span>
        </div>
      </div>

      {/* Sub-navigation tabs */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5 text-[11px] sm:text-xs font-bold">
        {[
          { id: "available", label: `Disponíveis (${availableDeliveries.length})` },
          { id: "mine", label: `Activas (${activeDeliveries.length})` },
          { id: "earnings", label: `Histórico (${completedDeliveries.length})` },
          { id: "fee", label: "Mensalidade" },
          { id: "plans", label: "Planos" },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSubTab(t.id as any)}
            className={`py-2 px-2 rounded-2xl border cursor-pointer transition-colors truncate ${
              subTab === t.id ? "bg-[#246BFD] text-white border-[#246BFD]" : "border-[var(--border)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* TAB: AVAILABLE DELIVERIES */}
      {subTab === "available" && (
        <div className="space-y-3">
          {availableDeliveries.length === 0 ? (
            <div className="p-8 text-center rounded-3xl border space-y-2" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}>
              <Package size={36} className="mx-auto opacity-40 text-[#246BFD]" />
              <p className="font-bold text-sm">Sem pedidos disponíveis no momento</p>
              <p className="text-xs opacity-65">Novas encomendas com entrega aparecem aqui automaticamente.</p>
            </div>
          ) : (
            availableDeliveries.map((d) => (
              <div
                key={d.id}
                className="p-4 rounded-3xl border space-y-2.5 text-xs"
                style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-black text-sm">Encomenda #{d.orderCode || d.orderId.slice(0, 6)}</span>
                  <span className="font-black text-sm tabular-nums" style={{ color: "var(--accent)" }}>
                    Taxa: {fmtKz(d.deliveryFee)}
                  </span>
                </div>
                <div className="space-y-1 opacity-85">
                  <p className="flex items-center gap-1.5">
                    <MapPin size={13} className="text-[#246BFD] shrink-0" />
                    <span>Recolha: <b>{d.storeName || "Loja Uíge"}</b> ({d.pickupAddress || "Centro"})</span>
                  </p>
                  <p className="flex items-center gap-1.5">
                    <Truck size={13} className="text-emerald-400 shrink-0" />
                    <span>Entrega: <b>{d.deliveryAddress}</b></span>
                  </p>
                  <p className="text-[11px] opacity-70">
                    Comissão da equipa ({d.commissionPercent}%): cobrada apenas após entrega confirmada.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleAccept(d.id)}
                  className="w-full py-2.5 rounded-2xl font-black text-xs text-slate-950 cursor-pointer"
                  style={{ backgroundColor: "var(--accent)" }}
                >
                  Aceitar Entrega
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* TAB: ACTIVE DELIVERIES */}
      {subTab === "mine" && (
        <div className="space-y-3">
          {activeDeliveries.length === 0 ? (
            <div className="p-8 text-center rounded-3xl border space-y-2" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}>
              <Truck size={36} className="mx-auto opacity-40" />
              <p className="font-bold text-sm">Sem entregas activas</p>
              <p className="text-xs opacity-65">Aceita um pedido na aba "Disponíveis" para iniciar.</p>
            </div>
          ) : (
            activeDeliveries.map((d) => (
              <div
                key={d.id}
                className="p-4 rounded-3xl border space-y-3 text-xs"
                style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-black text-sm">#{d.orderCode || d.orderId.slice(0, 6)}</span>
                  <span className="px-2.5 py-0.5 rounded-full bg-[#246BFD] text-white text-[10px] font-bold">
                    {d.status}
                  </span>
                </div>
                <div className="space-y-1 opacity-85">
                  <p>Recolha: <b>{d.storeName || "Loja Uíge"}</b> — {d.pickupAddress || "Centro"}</p>
                  <p>Destino: <b>{d.deliveryAddress}</b></p>
                  <p>Cliente: {d.customerName || "Cliente"} {d.customerPhone ? `(${d.customerPhone})` : ""}</p>
                </div>

                {/* Step Buttons */}
                <div className="flex flex-wrap gap-2">
                  {d.status === "Aceite pelo entregador" && (
                    <button
                      type="button"
                      onClick={() => handleAdvanceStatus(d.id, "Recolhido")}
                      className="flex-1 py-2.5 px-3 rounded-2xl bg-[#246BFD] text-white font-black cursor-pointer"
                    >
                      Marcar como Recolhido
                    </button>
                  )}
                  {d.status === "Recolhido" && (
                    <button
                      type="button"
                      onClick={() => handleAdvanceStatus(d.id, "A caminho")}
                      className="flex-1 py-2.5 px-3 rounded-2xl bg-[#246BFD] text-white font-black cursor-pointer"
                    >
                      Marcar A Caminho
                    </button>
                  )}
                </div>

                {(d.status === "A caminho" || d.status === "Recolhido" || d.status === "Aceite pelo entregador") && (
                  <div className="p-3 rounded-2xl border space-y-2" style={{ backgroundColor: "var(--surface-secondary)", borderColor: "var(--border)" }}>
                    <label className="block font-bold">Confirmar Entrega com Código do Cliente</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        value={codeInputs[d.id] || ""}
                        onChange={(e) => setCodeInputs({ ...codeInputs, [d.id]: e.target.value.replace(/\D/g, "") })}
                        placeholder="Código (4 dígitos)"
                        className="flex-1 min-w-0 px-3 py-2 rounded-xl border bg-transparent outline-none font-black tracking-widest"
                        style={{ borderColor: "var(--border)" }}
                      />
                      <button
                        type="button"
                        onClick={() => handleConfirmCode(d.id)}
                        className="px-4 py-2 rounded-xl font-black text-slate-950 cursor-pointer shrink-0"
                        style={{ backgroundColor: "var(--accent)" }}
                      >
                        Entregue
                      </button>
                    </div>
                  </div>
                )}

                {reportingId !== d.id ? (
                  <button
                    type="button"
                    onClick={() => setReportingId(d.id)}
                    className="inline-flex items-center gap-1 text-[11px] text-amber-400 font-bold cursor-pointer"
                  >
                    <AlertTriangle size={12} /> Reportar atraso ou problema
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={issueInputs[d.id] || ""}
                      onChange={(e) => setIssueInputs({ ...issueInputs, [d.id]: e.target.value })}
                      placeholder="Ex: Estrada bloqueada / cliente não atende"
                      className="flex-1 min-w-0 px-3 py-1.5 rounded-xl border bg-transparent outline-none"
                      style={{ borderColor: "var(--border)" }}
                    />
                    <button
                      type="button"
                      onClick={() => handleReportIssue(d.id)}
                      className="px-3 py-1.5 rounded-xl bg-amber-500 text-slate-950 font-black cursor-pointer"
                    >
                      Enviar
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* TAB: EARNINGS & HISTORY */}
      {subTab === "earnings" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-4 rounded-3xl border" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}>
              <span className="opacity-65 block">Total Ganho (Líquido)</span>
              <span className="text-lg font-black tabular-nums" style={{ color: "var(--accent)" }}>
                {fmtKz(totalEarned)}
              </span>
            </div>
            <div className="p-4 rounded-3xl border" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}>
              <span className="opacity-65 block">Comissão Cobrada ({systemConfig.deliveryCommissionPercent}%)</span>
              <span className="text-lg font-black tabular-nums">{fmtKz(totalCommission)}</span>
            </div>
          </div>

          {completedDeliveries.length === 0 ? (
            <div className="p-8 text-center rounded-3xl border space-y-2" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}>
              <Wallet size={36} className="mx-auto opacity-40" />
              <p className="font-bold text-sm">Ainda sem entregas concluídas</p>
            </div>
          ) : (
            completedDeliveries.map((d) => (
              <div
                key={d.id}
                className="p-3.5 rounded-2xl border flex items-center justify-between gap-2 text-xs"
                style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}
              >
                <div className="min-w-0">
                  <span className="font-bold block truncate">#{d.orderCode || d.orderId.slice(0, 6)} · {d.deliveryAddress}</span>
                  <span className="text-[11px] opacity-65">
                    Concluída em {fmtDate(d.deliveredAt || d.createdAt)} · Comissão: {fmtKz(d.commissionAmount)}
                  </span>
                </div>
                <span className="font-black text-emerald-400 tabular-nums shrink-0">+{fmtKz(d.courierEarning)}</span>
              </div>
            ))
          )}
        </div>
      )}

      {/* TAB: TEAM MONTHLY FEE */}
      {subTab === "fee" && (
        <div className="space-y-4">
          <form onSubmit={handleSubmitFee} className="p-4 rounded-3xl border space-y-3 text-xs" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}>
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-black text-sm flex items-center gap-1.5">
                <Calendar size={15} className="text-[#246BFD]" /> Mensalidade da Equipa
              </h3>
              <span className="font-black text-sm tabular-nums" style={{ color: "var(--accent)" }}>
                {fmtKz(systemConfig.courierMonthlyFee)} / mês
              </span>
            </div>
            <p className="opacity-75">
              Envia o comprovativo de pagamento (Multicaixa Express ou Transferência) para manter a tua conta activa na equipa.
            </p>
            <div>
              <label className="block font-bold mb-1">Mês de Referência</label>
              <input
                type="month"
                value={feeMonth}
                onChange={(e) => setFeeMonth(e.target.value)}
                className="w-full p-2.5 rounded-xl border bg-transparent outline-none"
                style={{ borderColor: "var(--border)" }}
              />
            </div>
            <div>
              <label className="block font-bold mb-1">Comprovativo (Imagem)</label>
              <label className="flex items-center justify-center gap-2 p-3 rounded-2xl border border-dashed cursor-pointer hover:border-[#246BFD]" style={{ borderColor: "var(--border)" }}>
                <Upload size={15} className="text-[#246BFD]" />
                <span>{feeProofPreview ? "Comprovativo carregado ✓" : "Selecionar fotografia do comprovativo"}</span>
                <input type="file" accept="image/*" onChange={handleUploadFeeProof} className="hidden" />
              </label>
            </div>
            <button
              type="submit"
              disabled={submittingFee}
              className="w-full py-3 rounded-2xl font-black text-slate-950 cursor-pointer disabled:opacity-50"
              style={{ backgroundColor: "var(--accent)" }}
            >
              {submittingFee ? "A enviar..." : "Enviar Comprovativo da Mensalidade"}
            </button>
          </form>

          <div className="space-y-2">
            <h4 className="font-black text-xs">Histórico de Mensalidades</h4>
            {myFees.length === 0 ? (
              <p className="text-xs opacity-60">Nenhum pagamento de mensalidade registado.</p>
            ) : (
              myFees.map((f) => (
                <div
                  key={f.id}
                  className="p-3 rounded-2xl border flex items-center justify-between text-xs"
                  style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}
                >
                  <div>
                    <span className="font-bold block">Mês: {f.referenceMonth}</span>
                    <span className="opacity-65">{fmtKz(f.amountKz)}</span>
                  </div>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-black capitalize ${
                      f.status === "pago"
                        ? "bg-emerald-500/20 text-emerald-400"
                        : f.status === "atrasado"
                        ? "bg-red-500/20 text-red-400"
                        : "bg-amber-500/20 text-amber-400"
                    }`}
                  >
                    {f.status}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB: COURIER PLANS */}
      {subTab === "plans" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
            {[
              { id: "gratis", title: "Grátis", price: 0, desc: "Acesso padrão aos pedidos de entrega." },
              { id: "basico", title: "Básico", price: courierBasicPrice, desc: "Prioridade nos pedidos do município." },
              { id: "vip", title: "Destaque / VIP", price: courierVipPrice, desc: "Prioridade máxima e selo Entregador VIP." },
            ].map((pl) => {
              const isCurrent = (user.planType || "gratis") === pl.id;
              return (
                <div
                  key={pl.id}
                  className={`p-3.5 rounded-2xl border space-y-1 ${isCurrent ? "border-[#B7F34A]" : ""}`}
                  style={{ backgroundColor: "var(--surface)", borderColor: isCurrent ? "var(--accent)" : "var(--border)" }}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-black text-sm">{pl.title}</span>
                    {isCurrent && <span className="text-[10px] font-black text-[#B7F34A]">Actual</span>}
                  </div>
                  <div className="font-black text-base tabular-nums" style={{ color: "var(--accent)" }}>
                    {pl.price === 0 ? "0 Kz" : `${fmtKz(pl.price)} / mês`}
                  </div>
                  <p className="opacity-70 text-[11px]">{pl.desc}</p>
                </div>
              );
            })}
          </div>

          <form
            onSubmit={handleSubmitCourierPlan}
            className="p-4 rounded-3xl border space-y-3 text-xs"
            style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}
          >
            <h3 className="font-black text-sm flex items-center gap-1.5">
              <Crown size={15} className="text-amber-400" /> Activar Plano de Entregador (30 dias)
            </h3>

            <div>
              <label className="block font-bold mb-1">Escolher Plano</label>
              <select
                value={courierTargetPlan}
                onChange={(e) => setCourierTargetPlan(e.target.value as PlanType)}
                className="w-full p-2.5 rounded-xl border outline-none"
                style={{ borderColor: "var(--border)", backgroundColor: "var(--surface-secondary)", color: "var(--text-primary)" }}
              >
                <option value="basico" className="bg-slate-900 text-white">
                  Plano Básico — {fmtKz(courierBasicPrice)}
                </option>
                <option value="vip" className="bg-slate-900 text-white">
                  Plano Destaque / VIP — {fmtKz(courierVipPrice)}
                </option>
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <select
                value={planMethod}
                onChange={(e) => setPlanMethod(e.target.value as any)}
                className="w-full p-2.5 rounded-xl border outline-none"
                style={{ borderColor: "var(--border)", backgroundColor: "var(--surface-secondary)", color: "var(--text-primary)" }}
              >
                <option value="Multicaixa Express" className="bg-slate-900 text-white">Multicaixa Express</option>
                <option value="Referência" className="bg-slate-900 text-white">Pagamento por Referência</option>
                <option value="Transferência" className="bg-slate-900 text-white">Transferência Bancária</option>
              </select>
              <input
                type="text"
                value={planRef}
                onChange={(e) => setPlanRef(e.target.value)}
                placeholder="Nº da operação / Referência"
                className="w-full p-2.5 rounded-xl border bg-transparent outline-none"
                style={{ borderColor: "var(--border)" }}
              />
            </div>

            <label className="flex items-center justify-center gap-2 p-3 rounded-2xl border border-dashed cursor-pointer hover:border-[#246BFD]" style={{ borderColor: "var(--border)" }}>
              <Upload size={15} className="text-[#246BFD]" />
              <span>{planProofPreview ? "Comprovativo anexado ✓" : "Selecionar comprovativo de pagamento *"}</span>
              <input type="file" accept="image/*" onChange={handleUploadPlanProof} className="hidden" />
            </label>

            <button
              type="submit"
              disabled={submittingPlan}
              className="w-full py-3 rounded-2xl font-black text-slate-950 cursor-pointer disabled:opacity-50"
              style={{ backgroundColor: "var(--accent)" }}
            >
              {submittingPlan ? "A enviar..." : "Enviar Comprovativo para Activação"}
            </button>
          </form>

          {myPayments.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-black text-xs">Os Meus Pagamentos de Planos</h4>
              {myPayments.map((p) => (
                <div
                  key={p.id}
                  className="p-3 rounded-2xl border flex items-center justify-between text-xs"
                  style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}
                >
                  <div>
                    <span className="font-bold block">Plano {formatPlanType(p.targetPlan)} · {p.method}</span>
                    <span className="opacity-65">{fmtKz(p.amountKz)} · {fmtDate(p.createdAt)}</span>
                  </div>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-black capitalize ${
                      p.status === "confirmado"
                        ? "bg-emerald-500/20 text-emerald-400"
                        : p.status === "rejeitado"
                        ? "bg-red-500/20 text-red-400"
                        : "bg-amber-500/20 text-amber-400"
                    }`}
                  >
                    {p.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
