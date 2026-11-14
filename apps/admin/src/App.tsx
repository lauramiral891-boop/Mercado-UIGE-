import React, { useState, useEffect } from "react";
import {
  ShieldCheck,
  Users,
  Store,
  Package,
  AlertCircle,
  Megaphone,
  CheckCircle2,
  Trash2,
  Crown,
  RefreshCw,
  LogOut,
  Mail,
  Lock,
  ArrowRight,
  Search,
  FileText,
  Truck,
  CreditCard,
  LayoutDashboard,
  Eye,
  MousePointerClick,
  Plus,
  X,
} from "lucide-react";
import {
  User,
  Store as StoreType,
  Product,
  Order,
  ReportItem,
  SponsoredAd,
  MerchantPayment,
  DeliveryRecord,
  CourierMonthlyFee,
  SystemConfig,
  AdPosition,
  fmtKz,
  fmtDate,
  fmtDateTime,
  formatUserRole,
  formatStoreType,
  formatPlanType,
  translateErrorMessage,
  DEFAULT_SYSTEM_CONFIG,
  userRepo,
  storeRepo,
  productRepo,
  orderRepo,
  reportRepo,
  adRepo,
  paymentRepo,
  deliveryRepo,
  systemConfigRepo,
  auditRepo,
  AuditLogItem,
  sendEmailOtp,
  verifyEmailOtp,
  supabase,
  saveCurrentUser,
  notificationRepo,
  SafeImage,
} from "@mercado-uige/shared";

const AUDIT_ACTION_LABELS: Record<string, string> = {
  LOGIN_ADMIN: "Acesso ao painel",
  SUSPEND_USER: "Suspensão de utilizador",
  UNSUSPEND_USER: "Reactivação de utilizador",
  APPROVE_USER: "Aprovação de utilizador",
  APPROVE_STORE: "Aprovação de loja",
  SUSPEND_STORE: "Suspensão de loja",
  UNSUSPEND_STORE: "Reactivação de loja",
  SET_STORE_VIP: "Atribuição de selo VIP",
  UNSET_STORE_VIP: "Remoção de selo VIP",
  DELETE_PRODUCT: "Remoção de artigo",
  RESOLVE_REPORT: "Resolução de denúncia",
  SEND_BROADCAST: "Envio de aviso provincial",
  REVIEW_PAYMENT: "Confirmação de pagamento",
  REVIEW_AD: "Moderação de anúncio",
  CREATE_AD: "Criação de anúncio patrocinado",
  UPDATE_CONFIG: "Alteração de configurações",
  REVIEW_COURIER_FEE: "Controlo de mensalidade",
};

type AdminSection =
  | "resumo"
  | "lojas"
  | "utilizadores"
  | "anuncios"
  | "pagamentos"
  | "denuncias"
  | "entregadores"
  | "auditoria";

function formatAuditTarget(target?: string | null): string {
  if (!target) return "—";
  if (target === "painel_web") return "Painel Web";
  if (target === "all_users") return "Todos os utilizadores";
  if (target === "system_config") return "Configurações";
  return target.length > 24 ? `${target.slice(0, 8)}…` : target;
}

export const AdminApp: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<AdminSection>("resumo");

  // Admin Login via OTP 6-digits
  const [loginEmail, setLoginEmail] = useState("tvvibeoficial@gmail.com");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");

  // Data states
  const [users, setUsers] = useState<User[]>([]);
  const [stores, setStores] = useState<StoreType[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [ads, setAds] = useState<SponsoredAd[]>([]);
  const [payments, setPayments] = useState<MerchantPayment[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryRecord[]>([]);
  const [courierFees, setCourierFees] = useState<CourierMonthlyFee[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [systemConfig, setSystemConfig] = useState<SystemConfig>(DEFAULT_SYSTEM_CONFIG);
  const [configDraft, setConfigDraft] = useState<SystemConfig>(DEFAULT_SYSTEM_CONFIG);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [loading, setLoading] = useState(false);

  // Filters & inline modals
  const [searchTerm, setSearchTerm] = useState("");
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>("todas");
  const [storeFilter, setStoreFilter] = useState<"todas" | "pendentes" | "loja_fixa" | "vendedor_ambulante" | "suspensas">("todas");
  const [broadcastTitle, setBroadcastTitle] = useState("");
  const [broadcastBody, setBroadcastBody] = useState("");
  const [pendingDeleteProduct, setPendingDeleteProduct] = useState<Product | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  // Admin Create Ad form
  const [newAdTitle, setNewAdTitle] = useState("");
  const [newAdSubtitle, setNewAdSubtitle] = useState("");
  const [newAdStoreId, setNewAdStoreId] = useState("");
  const [newAdPosition, setNewAdPosition] = useState<AdPosition>("topo");
  const [newAdDays, setNewAdDays] = useState("15");

  const [toast, setToast] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    userRepo.getCurrentUser().then((u) => {
      if (u && u.role === "admin") {
        setCurrentUser(u);
      }
    });
  }, []);

  useEffect(() => {
    let interval: any;
    if (resendTimer > 0) {
      interval = setInterval(() => setResendTimer((t) => t - 1), 1000);
    }
    return () => clearInterval(interval);
  }, [resendTimer]);

  // Load admin data
  const loadData = async () => {
    setLoading(true);
    try {
      const [uList, sList, pList, oList, rList, adList, payList, delList, feeList, cfg, aList] =
        await Promise.all([
          userRepo.getAll(),
          storeRepo.getAll(true),
          productRepo.getAll(),
          orderRepo.getAll(),
          reportRepo.getAll(),
          adRepo.getAll(true),
          paymentRepo.getAll(),
          deliveryRepo.getAll(),
          deliveryRepo.getMonthlyFees(),
          systemConfigRepo.get(),
          auditRepo.getAll(),
        ]);

      setUsers(uList);
      setStores(sList);
      setProducts(pList);
      setOrders(oList);
      setReports(rList);
      setAds(adList);
      setPayments(payList);
      setDeliveries(delList);
      setCourierFees(feeList);
      setSystemConfig(cfg);
      setConfigDraft(cfg);
      setAuditLogs(aList);

      const rev = oList
        .filter((o) => o.status !== "Cancelada")
        .reduce((sum, o) => sum + Number(o.total || 0), 0);
      setTotalRevenue(rev);
    } catch (err: unknown) {
      showToast(translateErrorMessage(err, "Não foi possível carregar os dados do painel."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser && currentUser.role === "admin") {
      loadData();
    }
  }, [currentUser]);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    const cleanEmail = loginEmail.trim().toLowerCase();

    if (!cleanEmail.includes("@")) {
      setLoginError("Introduz um endereço de e-mail válido.");
      return;
    }

    setLoginLoading(true);
    try {
      const { error } = await sendEmailOtp(cleanEmail);
      if (error) {
        setLoginError(translateErrorMessage(error, "Não foi possível enviar o código de verificação."));
      } else {
        setOtpSent(true);
        setResendTimer(60);
      }
    } catch (err: unknown) {
      setLoginError(translateErrorMessage(err, "Sem ligação. Verifica a internet e tenta novamente."));
    } finally {
      setLoginLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");

    if (otpCode.length < 6) {
      setLoginError("O código deve ter 6 dígitos.");
      return;
    }

    setLoginLoading(true);
    try {
      const { error } = await verifyEmailOtp(loginEmail, otpCode);
      if (error) {
        setLoginError(translateErrorMessage(error, "Código inválido ou expirado."));
        setLoginLoading(false);
        return;
      }

      const cleanLoginEmail = loginEmail.trim().toLowerCase();
      let matched = await userRepo.getCurrentUser();
      if (!matched || matched.email.toLowerCase() !== cleanLoginEmail) {
        const allUsers = await userRepo.getAll();
        matched = allUsers.find((u) => u.email.toLowerCase() === cleanLoginEmail) || null;
      }

      if (!matched || matched.role !== "admin") {
        setLoginError("Acesso restrito. Esta conta não tem permissões de Administrador.");
        setLoginLoading(false);
        return;
      }

      setCurrentUser(matched);
      await auditRepo.log(matched.id, "LOGIN_ADMIN", "painel_web", { email: matched.email });
    } catch (err: unknown) {
      setLoginError(translateErrorMessage(err, "Não foi possível validar o acesso."));
    } finally {
      setLoginLoading(false);
    }
  };

  // Actions
  const handleToggleSuspendUser = async (targetUser: User) => {
    if (!currentUser) return;
    try {
      const newStatus = !targetUser.isSuspended;
      await userRepo.suspendUser(targetUser.id, newStatus);
      await auditRepo.log(currentUser.id, newStatus ? "SUSPEND_USER" : "UNSUSPEND_USER", targetUser.id);
      showToast(newStatus ? "Utilizador suspenso." : "Utilizador reactivado.");
      loadData();
    } catch (err: unknown) {
      showToast(translateErrorMessage(err, "Não foi possível actualizar o estado do utilizador."));
    }
  };

  const handleApproveUser = async (targetUser: User, approved: boolean) => {
    if (!currentUser) return;
    try {
      await userRepo.approveUser(targetUser.id, approved);
      await auditRepo.log(currentUser.id, "APPROVE_USER", targetUser.id, { approved });
      showToast(approved ? "Conta aprovada com sucesso." : "Aprovação revogada.");
      loadData();
    } catch (err: unknown) {
      showToast(translateErrorMessage(err, "Não foi possível actualizar a aprovação."));
    }
  };

  const handleToggleStoreVip = async (store: StoreType) => {
    if (!currentUser) return;
    try {
      const newVip = !store.isVip;
      await storeRepo.toggleVip(store.id, newVip);
      await auditRepo.log(currentUser.id, newVip ? "SET_STORE_VIP" : "UNSET_STORE_VIP", store.id);
      showToast(newVip ? "Selo VIP atribuído à loja." : "Selo VIP removido.");
      loadData();
    } catch (err: unknown) {
      showToast(translateErrorMessage(err, "Não foi possível actualizar o selo VIP."));
    }
  };

  const handleApproveStore = async (store: StoreType, approved: boolean) => {
    if (!currentUser) return;
    try {
      await storeRepo.toggleApproval(store.id, approved);
      await auditRepo.log(currentUser.id, "APPROVE_STORE", store.id, { approved });
      showToast(approved ? `Loja ${store.name} aprovada!` : "Loja marcada como pendente.");
      loadData();
    } catch (err: unknown) {
      showToast(translateErrorMessage(err, "Não foi possível aprovar a loja."));
    }
  };

  const handleSuspendStore = async (store: StoreType) => {
    if (!currentUser) return;
    try {
      const next = !store.isSuspended;
      await storeRepo.suspendStore(store.id, next, next ? "Suspensa pela administração" : undefined);
      await auditRepo.log(currentUser.id, next ? "SUSPEND_STORE" : "UNSUSPEND_STORE", store.id);
      showToast(next ? "Loja suspensa." : "Loja reactivada.");
      loadData();
    } catch (err: unknown) {
      showToast(translateErrorMessage(err, "Não foi possível alterar a suspensão da loja."));
    }
  };

  const handleConfirmRemoveProduct = async () => {
    if (!currentUser || !pendingDeleteProduct) return;
    try {
      await productRepo.delete(pendingDeleteProduct.id);
      await auditRepo.log(currentUser.id, "DELETE_PRODUCT", pendingDeleteProduct.id, {
        name: pendingDeleteProduct.name,
      });
      setPendingDeleteProduct(null);
      showToast("Artigo removido do catálogo provincial.");
      loadData();
    } catch (err: unknown) {
      showToast(translateErrorMessage(err, "Não foi possível remover o artigo."));
    }
  };

  const handleResolveReport = async (report: ReportItem, status: "resolvido" | "rejeitado" = "resolvido") => {
    if (!currentUser) return;
    try {
      await reportRepo.resolve(report.id, status);
      await auditRepo.log(currentUser.id, "RESOLVE_REPORT", report.id, { status });
      showToast(status === "resolvido" ? "Denúncia marcada como resolvida." : "Denúncia rejeitada.");
      loadData();
    } catch (err: unknown) {
      showToast(translateErrorMessage(err, "Não foi possível actualizar a denúncia."));
    }
  };

  const handleSendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !broadcastTitle.trim() || !broadcastBody.trim()) return;

    try {
      await notificationRepo.create({
        userId: "all",
        title: broadcastTitle.trim(),
        body: broadcastBody.trim(),
        type: "system",
      });

      await auditRepo.log(currentUser.id, "SEND_BROADCAST", "all_users", { title: broadcastTitle.trim() });
      setBroadcastTitle("");
      setBroadcastBody("");
      showToast("Aviso enviado a todos os utilizadores.");
      loadData();
    } catch (err: unknown) {
      showToast(translateErrorMessage(err, "Não foi possível enviar o aviso."));
    }
  };

  const handleSaveSystemConfig = async (updates: Partial<SystemConfig>, successMsg: string) => {
    if (!currentUser) return;
    try {
      const updated = await systemConfigRepo.update(updates);
      setSystemConfig(updated);
      setConfigDraft(updated);
      await auditRepo.log(currentUser.id, "UPDATE_CONFIG", "system_config", updates);
      showToast(successMsg);
    } catch (err: unknown) {
      showToast(translateErrorMessage(err, "Não foi possível guardar as configurações."));
    }
  };

  const handleCreateAdminAd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !newAdTitle.trim()) return;
    try {
      const st = stores.find((s) => s.id === newAdStoreId);
      const days = Math.max(1, Number(newAdDays || 15));
      await adRepo.create({
        sellerId: st?.ownerId || currentUser.id,
        storeId: st?.id,
        storeName: st?.name || "Mercado Uíge",
        title: newAdTitle.trim(),
        subtitle: newAdSubtitle.trim(),
        imageUrl: st?.facadeImage || st?.logo || "",
        position: newAdPosition,
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + days * 86400000).toISOString(),
        active: true,
        status: "aprovado",
      });
      await auditRepo.log(currentUser.id, "CREATE_AD", st?.id || "global", { title: newAdTitle.trim() });
      setNewAdTitle("");
      setNewAdSubtitle("");
      showToast("Anúncio patrocinado publicado e activo!");
      loadData();
    } catch (err: unknown) {
      showToast(translateErrorMessage(err, "Não foi possível criar o anúncio."));
    }
  };

  const handleReviewPayment = async (pay: MerchantPayment, status: "confirmado" | "rejeitado") => {
    if (!currentUser) return;
    try {
      await paymentRepo.review(pay.id, status);
      await auditRepo.log(currentUser.id, "REVIEW_PAYMENT", pay.id, { status, type: pay.type });
      showToast(
        status === "confirmado"
          ? "Pagamento confirmado e plano/anúncio activado automaticamente!"
          : "Pagamento rejeitado."
      );
      loadData();
    } catch (err: unknown) {
      showToast(translateErrorMessage(err, "Não foi possível processar o pagamento."));
    }
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch {}
    saveCurrentUser(null);
    setCurrentUser(null);
    setOtpSent(false);
    setOtpCode("");
  };

  // Login screen
  if (!currentUser || currentUser.role !== "admin") {
    return (
      <div className="min-h-screen bg-[#07111F] text-slate-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md p-6 sm:p-8 rounded-3xl bg-[#172338] border border-[#26354B] shadow-2xl">
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#246BFD] to-[#07111F] border border-[#246BFD]/40 flex items-center justify-center text-[#B7F34A]">
              <ShieldCheck size={28} />
            </div>
            <div>
              <h1 className="text-xl font-black text-white">
                Mercado <span className="text-[#B7F34A]">Uíge</span>
              </h1>
              <p className="text-xs text-[#A6B2C5] font-semibold">Painel Administrativo Web</p>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-[#111D30] border border-[#26354B] mb-6 text-xs text-[#A6B2C5] flex items-center gap-2">
            <Lock size={15} className="text-[#246BFD] shrink-0" />
            <span>Acesso exclusivo para administradores autorizados do Mercado Uíge.</span>
          </div>

          {loginError && (
            <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-bold mb-4 flex items-center gap-2">
              <AlertCircle size={15} className="shrink-0" />
              <span>{loginError}</span>
            </div>
          )}

          {!otpSent ? (
            <form onSubmit={handleSendOtp} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#A6B2C5] mb-1.5">E-mail do Administrador</label>
                <div className="flex items-center gap-2.5 px-3.5 py-3 rounded-2xl bg-[#111D30] border border-[#26354B] focus-within:border-[#246BFD]">
                  <Mail size={16} className="text-[#A6B2C5] shrink-0" />
                  <input
                    type="email"
                    required
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="tvvibeoficial@gmail.com"
                    className="bg-transparent text-sm w-full min-w-0 outline-none text-white font-medium"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loginLoading}
                className="w-full py-3.5 rounded-2xl font-black text-sm bg-[#246BFD] text-white shadow-lg cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loginLoading ? "A enviar código..." : "Enviar Código de 6 Dígitos"}
                <ArrowRight size={16} />
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#A6B2C5] mb-1.5">
                  Código de 6 Dígitos enviado para {loginEmail}
                </label>
                <div className="flex items-center gap-2.5 px-3.5 py-3 rounded-2xl bg-[#111D30] border border-[#26354B] focus-within:border-[#B7F34A]">
                  <Lock size={16} className="text-[#B7F34A]" />
                  <input
                    type="text"
                    required
                    maxLength={6}
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                    placeholder="123456"
                    className="bg-transparent text-lg tracking-widest text-center font-black w-full outline-none text-white"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loginLoading}
                className="w-full py-3.5 rounded-2xl font-black text-sm bg-[#B7F34A] text-slate-950 shadow-lg cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loginLoading ? "A verificar..." : "Validar e Entrar no Painel"}
                <CheckCircle2 size={16} />
              </button>

              <div className="text-center pt-2">
                <button
                  type="button"
                  disabled={resendTimer > 0}
                  onClick={handleSendOtp}
                  className="text-xs text-[#246BFD] hover:underline cursor-pointer disabled:text-slate-500 font-semibold"
                >
                  {resendTimer > 0 ? `Aguarde ${resendTimer}s para novo código` : "Reenviar código por email"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    );
  }

  const pendingStoresCount = stores.filter((s) => !s.isApproved).length;
  const pendingUsersCount = users.filter((u) => u.isApproved === false && u.role !== "cliente").length;
  const pendingPaymentsCount = payments.filter((p) => p.status === "pendente").length;
  const pendingReportsCount = reports.filter((r) => r.status === "pendente").length;
  const delayedDeliveriesCount = deliveries.filter((d) => d.hasDelay || d.status === "Com problema").length;

  const filteredStores = stores.filter((s) => {
    if (storeFilter === "pendentes") return !s.isApproved;
    if (storeFilter === "loja_fixa") return s.storeType === "loja_fixa";
    if (storeFilter === "vendedor_ambulante") return s.storeType === "vendedor_ambulante";
    if (storeFilter === "suspensas") return Boolean(s.isSuspended);
    return true;
  });

  const couriers = users.filter((u) => u.role === "entregador");

  return (
    <div className="min-h-screen bg-[#07111F] text-slate-100 flex flex-col">
      {/* Top Admin Bar */}
      <header className="sticky top-0 z-40 bg-[#172338]/95 backdrop-blur-md border-b border-[#26354B] px-3 sm:px-4 py-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#246BFD] to-[#07111F] flex items-center justify-center text-[#B7F34A] font-black shrink-0">
            <ShieldCheck size={20} />
          </div>
          <div className="min-w-0">
            <span className="font-black text-sm tracking-tight text-white block truncate">
              Mercado <span className="text-[#B7F34A]">Uíge</span> • Administração
            </span>
            <span className="text-[10px] text-[#A6B2C5] block truncate">
              Sessão: <strong className="text-white">{currentUser.email}</strong>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            type="button"
            onClick={loadData}
            className="p-2 rounded-xl bg-[#111D30] border border-[#26354B] text-[#A6B2C5] hover:text-white cursor-pointer"
            title="Recarregar dados"
            aria-label="Recarregar dados"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          </button>

          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold hover:bg-red-500/20 cursor-pointer"
          >
            <LogOut size={13} />
            <span>Sair</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-6 space-y-5 sm:space-y-6">
        {/* 8 Secções Organizadas */}
        <nav className="flex gap-2 overflow-x-auto no-scrollbar pb-1 text-xs font-black">
          {[
            { id: "resumo", label: "Resumo", icon: LayoutDashboard },
            {
              id: "lojas",
              label: pendingStoresCount > 0 ? `Lojas e aprovações (${pendingStoresCount})` : "Lojas e aprovações",
              icon: Store,
            },
            {
              id: "utilizadores",
              label: pendingUsersCount > 0 ? `Utilizadores (${pendingUsersCount})` : "Utilizadores",
              icon: Users,
            },
            { id: "anuncios", label: `Anúncios (${ads.length})`, icon: Megaphone },
            {
              id: "pagamentos",
              label: pendingPaymentsCount > 0 ? `Pagamentos e planos (${pendingPaymentsCount})` : "Pagamentos e planos",
              icon: CreditCard,
            },
            {
              id: "denuncias",
              label: pendingReportsCount > 0 ? `Denúncias (${pendingReportsCount})` : "Denúncias",
              icon: AlertCircle,
            },
            {
              id: "entregadores",
              label: delayedDeliveriesCount > 0 ? `Entregadores (${delayedDeliveriesCount} alertas)` : "Entregadores",
              icon: Truck,
            },
            { id: "auditoria", label: "Auditoria", icon: FileText },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as AdminSection)}
                className={`flex items-center gap-1.5 px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-2xl whitespace-nowrap cursor-pointer transition-all shrink-0 ${
                  isActive
                    ? "bg-[#246BFD] text-white shadow-lg shadow-[#246BFD]/20 font-black"
                    : "bg-[#172338] text-[#A6B2C5] border border-[#26354B] hover:border-[#246BFD]"
                }`}
              >
                <Icon size={14} className={isActive ? "text-[#B7F34A]" : ""} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>

        {/* 1. RESUMO */}
        {activeTab === "resumo" && (
          <div className="space-y-6 anim-fadeUp">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="p-4 rounded-3xl bg-[#172338] border border-[#26354B]">
                <span className="text-[11px] text-[#A6B2C5] font-bold block mb-1">Utilizadores</span>
                <span className="text-2xl font-black text-white tabular-nums">{users.length}</span>
              </div>
              <div className="p-4 rounded-3xl bg-[#172338] border border-[#26354B]">
                <span className="text-[11px] text-[#A6B2C5] font-bold block mb-1">Lojas</span>
                <span className="text-2xl font-black text-[#B7F34A] tabular-nums">{stores.length}</span>
              </div>
              <div className="p-4 rounded-3xl bg-[#172338] border border-[#26354B]">
                <span className="text-[11px] text-[#A6B2C5] font-bold block mb-1">Artigos</span>
                <span className="text-2xl font-black text-white tabular-nums">{products.length}</span>
              </div>
              <div className="p-4 rounded-3xl bg-[#172338] border border-[#26354B]">
                <span className="text-[11px] text-[#A6B2C5] font-bold block mb-1">Entregas</span>
                <span className="text-2xl font-black text-[#246BFD] tabular-nums">{deliveries.length}</span>
              </div>
              <div className="p-4 rounded-3xl bg-[#172338] border border-[#26354B]">
                <span className="text-[11px] text-[#A6B2C5] font-bold block mb-1">Pendentes</span>
                <span className="text-2xl font-black text-amber-400 tabular-nums">
                  {pendingStoresCount + pendingUsersCount + pendingPaymentsCount + pendingReportsCount}
                </span>
              </div>
              <div className="p-4 rounded-3xl bg-[#172338] border border-[#26354B]">
                <span className="text-[11px] text-[#A6B2C5] font-bold block mb-1">Volume de Vendas</span>
                <span className="text-lg font-black text-[#B7F34A] tabular-nums break-words">{fmtKz(totalRevenue)}</span>
              </div>
            </div>

            {/* Avisos Provinciais */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <form
                onSubmit={handleSendBroadcast}
                className="p-5 rounded-3xl bg-[#172338] border border-[#26354B] space-y-3 text-xs"
              >
                <h2 className="font-black text-sm flex items-center gap-2">
                  <Megaphone size={16} className="text-[#B7F34A]" /> Difusão de Aviso Provincial
                </h2>
                <input
                  type="text"
                  required
                  value={broadcastTitle}
                  onChange={(e) => setBroadcastTitle(e.target.value)}
                  placeholder="Título do comunicado oficial..."
                  className="w-full p-3 rounded-2xl bg-[#111D30] border border-[#26354B] text-white outline-none focus:border-[#246BFD]"
                />
                <textarea
                  required
                  rows={3}
                  value={broadcastBody}
                  onChange={(e) => setBroadcastBody(e.target.value)}
                  placeholder="Mensagem entregue a todos os utilizadores no Uíge..."
                  className="w-full p-3 rounded-2xl bg-[#111D30] border border-[#26354B] text-white outline-none focus:border-[#246BFD]"
                />
                <button
                  type="submit"
                  className="w-full py-3 rounded-2xl font-black bg-[#246BFD] text-white cursor-pointer"
                >
                  Enviar Notificação Provincial
                </button>
              </form>

              {/* Remoção rápida de artigos do catálogo */}
              <div className="p-5 rounded-3xl bg-[#172338] border border-[#26354B] space-y-3 text-xs">
                <h2 className="font-black text-sm flex items-center gap-2">
                  <Package size={16} className="text-[#246BFD]" /> Catálogo Recente ({products.length})
                </h2>
                {pendingDeleteProduct && (
                  <div className="p-3 rounded-2xl bg-red-500/15 border border-red-500/40 flex flex-wrap items-center justify-between gap-2">
                    <span>
                      Remover <b>{pendingDeleteProduct.name}</b>?
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setPendingDeleteProduct(null)}
                        className="px-2.5 py-1 rounded-xl border border-[#26354B] cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={handleConfirmRemoveProduct}
                        className="px-2.5 py-1 rounded-xl bg-red-600 text-white font-bold cursor-pointer"
                      >
                        Remover
                      </button>
                    </div>
                  </div>
                )}
                {products.length === 0 ? (
                  <p className="text-[#A6B2C5]">Ainda sem artigos publicados no catálogo.</p>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {products.slice(0, 12).map((p) => (
                      <div
                        key={p.id}
                        className="p-2.5 rounded-2xl bg-[#111D30] border border-[#26354B] flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <span className="font-bold text-white block truncate">
                            {p.name} {p.condition === "usado" ? "(Usado)" : ""}
                          </span>
                          <span className="text-[#B7F34A] font-black tabular-nums">{fmtKz(p.price)}</span>
                          <span className="text-[#A6B2C5] ml-2">{p.storeName || p.municipality}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setPendingDeleteProduct(p)}
                          className="p-2 text-red-400 hover:text-red-500 cursor-pointer shrink-0"
                          aria-label="Remover artigo"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Monitorização Global de Todas as Encomendas */}
            <div className="p-5 rounded-3xl bg-[#172338] border border-[#26354B] space-y-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-black text-sm flex items-center gap-2">
                  <Package size={16} className="text-[#B7F34A]" /> Estado de Todas as Encomendas ({orders.length})
                </h2>
                <select
                  value={orderStatusFilter}
                  onChange={(e) => setOrderStatusFilter(e.target.value)}
                  className="p-2 rounded-xl bg-[#111D30] border border-[#26354B] text-white font-bold outline-none"
                >
                  <option value="todas">Todos os estados</option>
                  <option value="Pendente">Pendente</option>
                  <option value="Confirmada">Confirmada</option>
                  <option value="Em preparação">Em preparação</option>
                  <option value="Pronta para levantamento">Pronta para levantamento</option>
                  <option value="Em entrega">Em entrega</option>
                  <option value="Entregue">Entregue</option>
                  <option value="Cancelada">Cancelada</option>
                </select>
              </div>

              {(() => {
                const visibleOrders =
                  orderStatusFilter === "todas"
                    ? orders
                    : orders.filter((o) => o.status === orderStatusFilter);
                if (visibleOrders.length === 0) {
                  return <p className="text-[#A6B2C5]">Nenhuma encomenda registada neste estado.</p>;
                }
                return (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#111D30] text-[#A6B2C5] uppercase font-bold">
                        <tr>
                          <th className="p-3">Código</th>
                          <th className="p-3">Loja</th>
                          <th className="p-3">Cliente</th>
                          <th className="p-3">Total</th>
                          <th className="p-3">Pagamento</th>
                          <th className="p-3">Estado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#26354B]">
                        {visibleOrders.map((ord) => (
                          <tr key={ord.id} className="hover:bg-[#111D30]/40">
                            <td className="p-3 font-black text-[#B7F34A] whitespace-nowrap">#{ord.code}</td>
                            <td className="p-3 text-white whitespace-nowrap">{ord.storeName || "Loja Uíge"}</td>
                            <td className="p-3 text-[#A6B2C5] whitespace-nowrap">
                              {ord.userName || "Cliente"}{ord.userPhone ? ` (${ord.userPhone})` : ""}
                            </td>
                            <td className="p-3 font-bold text-white tabular-nums whitespace-nowrap">{fmtKz(ord.total)}</td>
                            <td className="p-3 whitespace-nowrap">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                                  ord.paymentStatus === "pago"
                                    ? "bg-emerald-500/20 text-emerald-400"
                                    : "bg-amber-500/20 text-amber-300"
                                }`}
                              >
                                {ord.paymentStatus === "pago" ? "Pago" : "Por pagar"}
                              </span>
                            </td>
                            <td className="p-3 whitespace-nowrap">
                              <span className="px-2.5 py-0.5 rounded-full bg-[#246BFD] text-white text-[10px] font-bold">
                                {ord.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* 2. LOJAS E APROVAÇÕES */}
        {activeTab === "lojas" && (
          <div className="space-y-4 anim-fadeUp">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-black text-base sm:text-lg">Moderação de Lojas, Ambulantes e Selos VIP</h2>
              <div className="flex flex-wrap gap-1.5 text-xs font-bold">
                {[
                  { id: "todas", label: `Todas (${stores.length})` },
                  { id: "pendentes", label: `Pendentes (${pendingStoresCount})` },
                  { id: "loja_fixa", label: "Loja fixa" },
                  { id: "vendedor_ambulante", label: "Ambulantes" },
                  { id: "suspensas", label: "Suspensas" },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setStoreFilter(f.id as any)}
                    className={`px-3 py-1.5 rounded-full border cursor-pointer ${
                      storeFilter === f.id
                        ? "bg-[#246BFD] text-white border-[#246BFD]"
                        : "bg-[#172338] border-[#26354B] text-[#A6B2C5]"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {filteredStores.length === 0 ? (
              <div className="p-8 text-center rounded-3xl bg-[#172338] border border-[#26354B] text-xs text-[#A6B2C5]">
                Nenhuma loja encontrada neste filtro.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredStores.map((s) => (
                  <div
                    key={s.id}
                    className="p-4 rounded-3xl bg-[#172338] border border-[#26354B] flex flex-col justify-between gap-3 text-xs shadow-lg"
                  >
                    <div className="space-y-2.5">
                      <div className="flex items-start gap-3">
                        <div className="w-14 h-14 rounded-2xl overflow-hidden shrink-0 bg-[#111D30]">
                          <SafeImage
                            src={s.facadeImage || s.logo}
                            alt={s.name}
                            className="w-full h-full object-cover"
                            fallbackIcon={<Store size={22} className="text-[#246BFD]" />}
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <h3 className="font-black text-sm text-white truncate">{s.name}</h3>
                            {s.isVip && <Crown size={14} className="text-amber-400 fill-amber-400 shrink-0" />}
                          </div>
                          <span className="text-[11px] font-bold text-[#246BFD] block">
                            {s.code || "LJ-0000"} · {formatStoreType(s.storeType)} · Plano {formatPlanType(s.planType)}
                          </span>
                          <span className="text-[11px] text-[#A6B2C5] block truncate">
                            {s.bairro ? `${s.bairro}, ` : ""}
                            {s.municipality}, Uíge
                          </span>
                        </div>
                      </div>

                      {s.address && <p className="text-[11px] text-[#A6B2C5]">Morada: {s.address}</p>}
                      {s.phone && <p className="text-[11px] text-[#A6B2C5]">Telefone: {s.phone}</p>}

                      <div className="flex flex-wrap gap-1.5 text-[10px] font-bold">
                        <span
                          className={`px-2 py-0.5 rounded-full ${
                            s.isApproved ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"
                          }`}
                        >
                          {s.isApproved ? "Aprovada" : "Pendente de Aprovação"}
                        </span>
                        {s.isSuspended && (
                          <span className="px-2 py-0.5 rounded-full bg-red-500/20 text-red-400">Suspensa</span>
                        )}
                        {(s.reportsCount || 0) > 0 && (
                          <span className="px-2 py-0.5 rounded-full bg-red-500/15 text-red-300">
                            {s.reportsCount} denúncia(s)
                          </span>
                        )}
                      </div>

                      {(s.facadeImage || s.biPhotoUrl) && (
                        <div className="flex gap-2">
                          {s.facadeImage && (
                            <button
                              type="button"
                              onClick={() => setPreviewImageUrl(s.facadeImage!)}
                              className="px-2.5 py-1 rounded-xl bg-[#111D30] border border-[#26354B] text-[#246BFD] font-bold cursor-pointer"
                            >
                              Ver Fachada
                            </button>
                          )}
                          {s.biPhotoUrl && (
                            <button
                              type="button"
                              onClick={() => setPreviewImageUrl(s.biPhotoUrl!)}
                              className="px-2.5 py-1 rounded-xl bg-[#111D30] border border-[#26354B] text-[#B7F34A] font-bold cursor-pointer"
                            >
                              Ver Foto do BI
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="pt-3 border-t border-[#26354B] flex flex-wrap gap-1.5">
                      {!s.isApproved && (
                        <button
                          type="button"
                          onClick={() => handleApproveStore(s, true)}
                          className="flex-1 py-1.5 px-2.5 rounded-xl bg-emerald-500 text-slate-950 font-black cursor-pointer"
                        >
                          Aprovar
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleSuspendStore(s)}
                        className={`flex-1 py-1.5 px-2.5 rounded-xl font-bold cursor-pointer ${
                          s.isSuspended
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                            : "bg-red-500/20 text-red-400 border border-red-500/30"
                        }`}
                      >
                        {s.isSuspended ? "Reactivar" : "Suspender"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleStoreVip(s)}
                        className={`py-1.5 px-2.5 rounded-xl font-black cursor-pointer border ${
                          s.isVip
                            ? "bg-amber-400 text-slate-950 border-amber-400"
                            : "border-[#26354B] text-white"
                        }`}
                      >
                        {s.isVip ? "Tirar VIP" : "VIP"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 3. UTILIZADORES */}
        {activeTab === "utilizadores" && (() => {
          const filteredUsers = users.filter(
            (u) =>
              (u.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
              (u.email || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
              (u.code || "").toLowerCase().includes(searchTerm.toLowerCase())
          );
          return (
            <div className="space-y-4 anim-fadeUp">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <h2 className="font-black text-base sm:text-lg">Gestão de Utilizadores e Aprovações</h2>
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#111D30] border border-[#26354B] text-xs w-full sm:w-72">
                  <Search size={14} className="text-[#A6B2C5] shrink-0" />
                  <input
                    type="text"
                    placeholder="Filtrar por código (CL-0001), nome ou e-mail..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="bg-transparent outline-none text-white font-medium w-full min-w-0"
                  />
                </div>
              </div>

              {filteredUsers.length === 0 ? (
                <div className="p-8 text-center rounded-3xl bg-[#172338] border border-[#26354B] text-xs text-[#A6B2C5]">
                  Nenhum utilizador encontrado.
                </div>
              ) : (
                <div className="rounded-3xl border border-[#26354B] bg-[#172338] overflow-hidden shadow-lg">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#111D30] text-[#A6B2C5] uppercase tracking-wider font-bold">
                        <tr>
                          <th className="p-3.5">Código</th>
                          <th className="p-3.5">Nome / E-mail</th>
                          <th className="p-3.5">Papel</th>
                          <th className="p-3.5">Município / Bairro</th>
                          <th className="p-3.5">Aprovação</th>
                          <th className="p-3.5 text-right">Acções</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#26354B]">
                        {filteredUsers.map((user) => (
                          <tr key={user.id} className="hover:bg-[#111D30]/50">
                            <td className="p-3.5 font-black text-[#B7F34A] whitespace-nowrap">
                              {user.code || "—"}
                            </td>
                            <td className="p-3.5">
                              <span className="font-bold text-white block">{user.name}</span>
                              <span className="text-[#A6B2C5]">{user.email}</span>
                            </td>
                            <td className="p-3.5 whitespace-nowrap font-bold">{formatUserRole(user.role)}</td>
                            <td className="p-3.5 text-[#A6B2C5] whitespace-nowrap">
                              {user.bairro ? `${user.bairro}, ` : ""}
                              {user.municipality || "Uíge"}
                            </td>
                            <td className="p-3.5 whitespace-nowrap">
                              {user.isSuspended ? (
                                <span className="text-red-400 font-bold">Suspenso</span>
                              ) : user.isApproved === false ? (
                                <span className="text-amber-400 font-bold">Pendente</span>
                              ) : (
                                <span className="text-emerald-400 font-bold">Activo</span>
                              )}
                            </td>
                            <td className="p-3.5 text-right whitespace-nowrap space-x-1.5">
                              {user.isApproved === false && (
                                <button
                                  type="button"
                                  onClick={() => handleApproveUser(user, true)}
                                  className="px-3 py-1 rounded-full bg-emerald-500 text-slate-950 font-black cursor-pointer"
                                >
                                  Aprovar
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleToggleSuspendUser(user)}
                                className={`px-3 py-1 rounded-full text-xs font-bold cursor-pointer ${
                                  user.isSuspended
                                    ? "bg-emerald-500 text-slate-950"
                                    : "bg-red-500/20 text-red-400 border border-red-500/30"
                                }`}
                              >
                                {user.isSuspended ? "Reactivar" : "Suspender"}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* 4. ANÚNCIOS PATROCINADOS */}
        {activeTab === "anuncios" && (
          <div className="space-y-5 anim-fadeUp">
            <h2 className="font-black text-base sm:text-lg">Gestão de Anúncios Patrocinados</h2>

            <form
              onSubmit={handleCreateAdminAd}
              className="p-4 sm:p-5 rounded-3xl bg-[#172338] border border-[#26354B] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs"
            >
              <input
                type="text"
                required
                value={newAdTitle}
                onChange={(e) => setNewAdTitle(e.target.value)}
                placeholder="Título do anúncio *"
                className="p-2.5 rounded-xl bg-[#111D30] border border-[#26354B] text-white outline-none"
              />
              <input
                type="text"
                value={newAdSubtitle}
                onChange={(e) => setNewAdSubtitle(e.target.value)}
                placeholder="Subtítulo promocional"
                className="p-2.5 rounded-xl bg-[#111D30] border border-[#26354B] text-white outline-none"
              />
              <select
                value={newAdStoreId}
                onChange={(e) => setNewAdStoreId(e.target.value)}
                className="p-2.5 rounded-xl bg-[#111D30] border border-[#26354B] text-white outline-none"
              >
                <option value="">Selecionar loja</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.code || "LJ"})
                  </option>
                ))}
              </select>
              <select
                value={newAdPosition}
                onChange={(e) => setNewAdPosition(e.target.value as AdPosition)}
                className="p-2.5 rounded-xl bg-[#111D30] border border-[#26354B] text-white outline-none"
              >
                <option value="topo">Posição: Topo</option>
                <option value="categoria">Posição: Categoria</option>
                <option value="pesquisa">Posição: Pesquisa</option>
              </select>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="1"
                  max="180"
                  value={newAdDays}
                  onChange={(e) => setNewAdDays(e.target.value)}
                  className="w-20 p-2.5 rounded-xl bg-[#111D30] border border-[#26354B] text-white outline-none"
                  title="Dias de duração"
                />
                <button
                  type="submit"
                  className="flex-1 px-3 py-2.5 rounded-xl bg-[#B7F34A] text-slate-950 font-black flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Plus size={14} /> Publicar
                </button>
              </div>
            </form>

            {ads.length === 0 ? (
              <div className="p-8 text-center rounded-3xl bg-[#172338] border border-[#26354B] text-xs text-[#A6B2C5]">
                Nenhum anúncio patrocinado registado até ao momento.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {ads.map((ad) => (
                  <div
                    key={ad.id}
                    className="p-4 rounded-3xl bg-[#172338] border border-[#26354B] space-y-2.5 text-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-[#246BFD]/20 text-[#246BFD] uppercase">
                          {ad.position}
                        </span>
                        <h3 className="font-black text-sm text-white mt-1 truncate">{ad.title}</h3>
                        <p className="text-[#A6B2C5] truncate">{ad.storeName || "Campanha Provincial"}</p>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold capitalize shrink-0 ${
                          ad.active && ad.status === "aprovado"
                            ? "bg-emerald-500/20 text-emerald-400"
                            : "bg-amber-500/20 text-amber-400"
                        }`}
                      >
                        {ad.active && ad.status === "aprovado" ? "Activo" : ad.status}
                      </span>
                    </div>

                    <div className="flex items-center gap-4 text-[#A6B2C5]">
                      <span className="flex items-center gap-1 tabular-nums">
                        <Eye size={13} /> {ad.views}
                      </span>
                      <span className="flex items-center gap-1 tabular-nums">
                        <MousePointerClick size={13} /> {ad.clicks}
                      </span>
                      <span>Até {fmtDate(ad.endDate)}</span>
                    </div>

                    <div className="pt-2 border-t border-[#26354B] flex gap-2">
                      {!ad.active ? (
                        <button
                          type="button"
                          onClick={async () => {
                            await adRepo.updateStatus(ad.id, "aprovado", true);
                            await auditRepo.log(currentUser.id, "REVIEW_AD", ad.id, { active: true });
                            showToast("Anúncio activado.");
                            loadData();
                          }}
                          className="flex-1 py-1.5 rounded-xl bg-emerald-500 text-slate-950 font-black cursor-pointer"
                        >
                          Activar
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={async () => {
                            await adRepo.updateStatus(ad.id, "aprovado", false);
                            await auditRepo.log(currentUser.id, "REVIEW_AD", ad.id, { active: false });
                            showToast("Anúncio pausado.");
                            loadData();
                          }}
                          className="flex-1 py-1.5 rounded-xl bg-amber-500/20 text-amber-300 font-bold cursor-pointer"
                        >
                          Pausar
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={async () => {
                          await adRepo.delete(ad.id);
                          showToast("Anúncio removido.");
                          loadData();
                        }}
                        className="px-3 py-1.5 rounded-xl bg-red-500/15 text-red-400 font-bold cursor-pointer"
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 5. PAGAMENTOS E PLANOS */}
        {activeTab === "pagamentos" && (
          <div className="space-y-5 anim-fadeUp">
            <h2 className="font-black text-base sm:text-lg">Preços por Tipo, WhatsApp do Admin e Pagamentos</h2>

            <div className="p-4 sm:p-5 rounded-3xl bg-[#172338] border border-[#26354B] space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div className="sm:col-span-2 lg:col-span-3">
                  <label className="block font-bold text-[#A6B2C5] mb-1">
                    Número de WhatsApp de Fallback / Apoio do Admin (Angola)
                  </label>
                  <input
                    type="tel"
                    value={configDraft.adminWhatsapp}
                    onChange={(e) => setConfigDraft({ ...configDraft, adminWhatsapp: e.target.value })}
                    placeholder="945379003"
                    className="w-full sm:w-80 p-2.5 rounded-xl bg-[#111D30] border border-[#26354B] text-white font-bold outline-none"
                  />
                  <span className="text-[11px] text-[#A6B2C5] block mt-1">
                    Usado automaticamente quando a loja não tem um WhatsApp válido registado.
                  </span>
                </div>

                <div className="p-3 rounded-2xl bg-[#111D30] border border-[#26354B] space-y-2">
                  <span className="font-black text-[#B7F34A] block">Planos: Loja Fixa (Kz / mês)</span>
                  <div>
                    <label className="block text-[11px] text-[#A6B2C5] mb-0.5">Básico</label>
                    <input
                      type="number"
                      min="0"
                      value={configDraft.fixedStoreBasicPrice}
                      onChange={(e) =>
                        setConfigDraft({
                          ...configDraft,
                          fixedStoreBasicPrice: Number(e.target.value),
                          basicPlanPrice: Number(e.target.value),
                        })
                      }
                      className="w-full p-2 rounded-xl bg-[#172338] border border-[#26354B] text-white font-bold outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#A6B2C5] mb-0.5">Destaque / VIP</label>
                    <input
                      type="number"
                      min="0"
                      value={configDraft.fixedStoreVipPrice}
                      onChange={(e) =>
                        setConfigDraft({
                          ...configDraft,
                          fixedStoreVipPrice: Number(e.target.value),
                          vipPlanPrice: Number(e.target.value),
                        })
                      }
                      className="w-full p-2 rounded-xl bg-[#172338] border border-[#26354B] text-white font-bold outline-none"
                    />
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-[#111D30] border border-[#26354B] space-y-2">
                  <span className="font-black text-[#246BFD] block">Planos: Vendedor Ambulante (Kz / mês)</span>
                  <div>
                    <label className="block text-[11px] text-[#A6B2C5] mb-0.5">Básico</label>
                    <input
                      type="number"
                      min="0"
                      value={configDraft.ambulantBasicPrice}
                      onChange={(e) =>
                        setConfigDraft({ ...configDraft, ambulantBasicPrice: Number(e.target.value) })
                      }
                      className="w-full p-2 rounded-xl bg-[#172338] border border-[#26354B] text-white font-bold outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#A6B2C5] mb-0.5">Destaque / VIP</label>
                    <input
                      type="number"
                      min="0"
                      value={configDraft.ambulantVipPrice}
                      onChange={(e) =>
                        setConfigDraft({ ...configDraft, ambulantVipPrice: Number(e.target.value) })
                      }
                      className="w-full p-2 rounded-xl bg-[#172338] border border-[#26354B] text-white font-bold outline-none"
                    />
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-[#111D30] border border-[#26354B] space-y-2">
                  <span className="font-black text-emerald-400 block">Planos: Entregador (Kz / mês)</span>
                  <div>
                    <label className="block text-[11px] text-[#A6B2C5] mb-0.5">Básico</label>
                    <input
                      type="number"
                      min="0"
                      value={configDraft.courierBasicPrice}
                      onChange={(e) =>
                        setConfigDraft({ ...configDraft, courierBasicPrice: Number(e.target.value) })
                      }
                      className="w-full p-2 rounded-xl bg-[#172338] border border-[#26354B] text-white font-bold outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#A6B2C5] mb-0.5">Destaque / VIP</label>
                    <input
                      type="number"
                      min="0"
                      value={configDraft.courierVipPrice}
                      onChange={(e) =>
                        setConfigDraft({ ...configDraft, courierVipPrice: Number(e.target.value) })
                      }
                      className="w-full p-2 rounded-xl bg-[#172338] border border-[#26354B] text-white font-bold outline-none"
                    />
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() =>
                  handleSaveSystemConfig(
                    {
                      adminWhatsapp: configDraft.adminWhatsapp.trim() || "945379003",
                      basicPlanPrice: configDraft.fixedStoreBasicPrice,
                      vipPlanPrice: configDraft.fixedStoreVipPrice,
                      fixedStoreBasicPrice: configDraft.fixedStoreBasicPrice,
                      fixedStoreVipPrice: configDraft.fixedStoreVipPrice,
                      ambulantBasicPrice: configDraft.ambulantBasicPrice,
                      ambulantVipPrice: configDraft.ambulantVipPrice,
                      courierBasicPrice: configDraft.courierBasicPrice,
                      courierVipPrice: configDraft.courierVipPrice,
                    },
                    "Preços por tipo e WhatsApp do administrador guardados ✓"
                  )
                }
                className="py-2.5 px-5 rounded-xl bg-[#B7F34A] text-slate-950 font-black cursor-pointer"
              >
                Guardar Definições de Planos e WhatsApp
              </button>
            </div>

            {payments.length === 0 ? (
              <div className="p-8 text-center rounded-3xl bg-[#172338] border border-[#26354B] text-xs text-[#A6B2C5]">
                Ainda não existem comprovativos de pagamento enviados pelos comerciantes ou entregadores.
              </div>
            ) : (
              <div className="space-y-3">
                {payments.map((pay) => (
                  <div
                    key={pay.id}
                    className="p-4 rounded-3xl bg-[#172338] border border-[#26354B] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-black text-sm text-white">
                          {pay.storeName || pay.sellerName || "Utilizador"}
                        </span>
                        {pay.userRoleType && (
                          <span className="px-2 py-0.5 rounded-full bg-white/10 text-white font-bold text-[10px]">
                            {pay.userRoleType === "entregador"
                              ? "Entregador"
                              : formatStoreType(pay.userRoleType)}
                          </span>
                        )}
                        <span className="px-2 py-0.5 rounded-full bg-[#246BFD]/20 text-[#246BFD] font-bold">
                          {pay.type === "plano" ? `Plano ${formatPlanType(pay.targetPlan)}` : "Anúncio Patrocinado"}
                        </span>
                        <span className="font-black text-[#B7F34A] tabular-nums">{fmtKz(pay.amountKz)}</span>
                      </div>
                      <p className="text-[#A6B2C5]">
                        {pay.method} {pay.reference ? `· Ref: ${pay.reference}` : ""} · {fmtDateTime(pay.createdAt)}
                      </p>
                      {pay.proofUrl && (
                        <button
                          type="button"
                          onClick={() => setPreviewImageUrl(pay.proofUrl)}
                          className="text-[#246BFD] font-bold hover:underline cursor-pointer"
                        >
                          Ver Comprovativo
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {pay.status === "pendente" ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleReviewPayment(pay, "confirmado")}
                            className="px-4 py-2 rounded-xl bg-emerald-500 text-slate-950 font-black cursor-pointer"
                          >
                            Confirmar e Activar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleReviewPayment(pay, "rejeitado")}
                            className="px-3 py-2 rounded-xl bg-red-500/20 text-red-400 font-bold cursor-pointer"
                          >
                            Rejeitar
                          </button>
                        </>
                      ) : (
                        <span
                          className={`px-3 py-1 rounded-full font-black capitalize ${
                            pay.status === "confirmado"
                              ? "bg-emerald-500/20 text-emerald-400"
                              : "bg-red-500/20 text-red-400"
                          }`}
                        >
                          {pay.status}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 6. DENÚNCIAS */}
        {activeTab === "denuncias" && (
          <div className="space-y-4 anim-fadeUp">
            <h2 className="font-black text-base sm:text-lg">Denúncias e Suspensão Automática</h2>

            <div className="p-4 rounded-3xl bg-[#172338] border border-[#26354B] flex flex-wrap items-end justify-between gap-3 text-xs">
              <div>
                <label className="block font-bold text-[#A6B2C5] mb-1">
                  Número de denúncias para suspender loja automaticamente
                </label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={configDraft.autoSuspendReportsThreshold}
                  onChange={(e) =>
                    setConfigDraft({ ...configDraft, autoSuspendReportsThreshold: Number(e.target.value) })
                  }
                  className="w-32 p-2 rounded-xl bg-[#111D30] border border-[#26354B] text-white font-bold outline-none"
                />
              </div>
              <button
                type="button"
                onClick={() =>
                  handleSaveSystemConfig(
                    { autoSuspendReportsThreshold: Math.max(1, configDraft.autoSuspendReportsThreshold) },
                    "Limite automático de denúncias actualizado ✓"
                  )
                }
                className="px-4 py-2 rounded-xl bg-[#B7F34A] text-slate-950 font-black cursor-pointer"
              >
                Guardar Regra
              </button>
            </div>

            {reports.length === 0 ? (
              <div className="p-8 text-center rounded-3xl bg-[#172338] border border-[#26354B] text-xs text-[#A6B2C5]">
                Nenhuma denúncia pendente de resolução.
              </div>
            ) : (
              <div className="space-y-3">
                {reports.map((rep) => (
                  <div
                    key={rep.id}
                    className="p-4 rounded-2xl bg-[#172338] border border-[#26354B] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0">
                      <span className="font-bold text-white block text-sm truncate">
                        {rep.storeName ? `Loja: ${rep.storeName}` : rep.productName || "Denúncia"}
                      </span>
                      <p className="text-[#A6B2C5] mt-0.5 break-words">Motivo: {rep.reason}</p>
                      <span className="text-[10px] text-slate-400 block mt-1 capitalize">Estado: {rep.status}</span>
                    </div>

                    {rep.status === "pendente" && (
                      <div className="flex gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleResolveReport(rep, "resolvido")}
                          className="px-3.5 py-1.5 rounded-full font-black bg-emerald-500 text-slate-950 cursor-pointer"
                        >
                          Marcar Resolvida
                        </button>
                        <button
                          type="button"
                          onClick={() => handleResolveReport(rep, "rejeitado")}
                          className="px-3.5 py-1.5 rounded-full font-bold bg-[#111D30] border border-[#26354B] text-[#A6B2C5] cursor-pointer"
                        >
                          Rejeitar
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 7. ENTREGADORES E ENTREGAS */}
        {activeTab === "entregadores" && (
          <div className="space-y-6 anim-fadeUp">
            <h2 className="font-black text-base sm:text-lg">Equipa de Entregas, Taxas e Ocorrências</h2>

            {/* Configurações de Entregas */}
            <div className="p-4 sm:p-5 rounded-3xl bg-[#172338] border border-[#26354B] grid grid-cols-1 sm:grid-cols-4 gap-3 items-end text-xs">
              <div>
                <label className="block font-bold text-[#A6B2C5] mb-1">Taxa de Entrega (Kz)</label>
                <input
                  type="number"
                  min="0"
                  value={configDraft.defaultDeliveryFee}
                  onChange={(e) => setConfigDraft({ ...configDraft, defaultDeliveryFee: Number(e.target.value) })}
                  className="w-full p-2.5 rounded-xl bg-[#111D30] border border-[#26354B] text-white font-bold outline-none"
                />
              </div>
              <div>
                <label className="block font-bold text-[#A6B2C5] mb-1">Comissão após entrega (%)</label>
                <input
                  type="number"
                  min="0"
                  max="90"
                  value={configDraft.deliveryCommissionPercent}
                  onChange={(e) =>
                    setConfigDraft({ ...configDraft, deliveryCommissionPercent: Number(e.target.value) })
                  }
                  className="w-full p-2.5 rounded-xl bg-[#111D30] border border-[#26354B] text-white font-bold outline-none"
                />
              </div>
              <div>
                <label className="block font-bold text-[#A6B2C5] mb-1">Mensalidade Entregador (Kz)</label>
                <input
                  type="number"
                  min="0"
                  value={configDraft.courierMonthlyFee}
                  onChange={(e) => setConfigDraft({ ...configDraft, courierMonthlyFee: Number(e.target.value) })}
                  className="w-full p-2.5 rounded-xl bg-[#111D30] border border-[#26354B] text-white font-bold outline-none"
                />
              </div>
              <button
                type="button"
                onClick={() =>
                  handleSaveSystemConfig(
                    {
                      defaultDeliveryFee: configDraft.defaultDeliveryFee,
                      deliveryCommissionPercent: configDraft.deliveryCommissionPercent,
                      courierMonthlyFee: configDraft.courierMonthlyFee,
                    },
                    "Configurações de entregas actualizadas ✓"
                  )
                }
                className="py-2.5 px-4 rounded-xl bg-[#B7F34A] text-slate-950 font-black cursor-pointer"
              >
                Guardar Taxas
              </button>
            </div>

            {/* Entregadores e Mensalidades */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
              <div className="p-4 rounded-3xl bg-[#172338] border border-[#26354B] space-y-3">
                <h3 className="font-black text-sm">Entregadores Registados ({couriers.length})</h3>
                {couriers.length === 0 ? (
                  <p className="text-[#A6B2C5]">Nenhum entregador cadastrado ainda.</p>
                ) : (
                  <div className="space-y-2">
                    {couriers.map((c) => (
                      <div
                        key={c.id}
                        className="p-3 rounded-2xl bg-[#111D30] border border-[#26354B] flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <span className="font-bold text-white block truncate">
                            {c.name} ({c.code || "—"})
                          </span>
                          <span className="text-[#A6B2C5] block truncate">
                            BI: {c.biNumber || "—"} · Tel: {c.phone || "—"} · {c.bairro || c.municipality}
                          </span>
                        </div>
                        <div className="flex gap-1.5 shrink-0">
                          {c.isApproved === false && (
                            <button
                              type="button"
                              onClick={() => handleApproveUser(c, true)}
                              className="px-3 py-1 rounded-xl bg-emerald-500 text-slate-950 font-black cursor-pointer"
                            >
                              Aprovar
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleToggleSuspendUser(c)}
                            className="px-2.5 py-1 rounded-xl border border-[#26354B] text-[#A6B2C5] cursor-pointer"
                          >
                            {c.isSuspended ? "Reactivar" : "Suspender"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-4 rounded-3xl bg-[#172338] border border-[#26354B] space-y-3">
                <h3 className="font-black text-sm">Controlo de Mensalidades ({courierFees.length})</h3>
                {courierFees.length === 0 ? (
                  <p className="text-[#A6B2C5]">Sem mensalidades registadas ainda.</p>
                ) : (
                  <div className="space-y-2">
                    {courierFees.map((f) => (
                      <div
                        key={f.id}
                        className="p-3 rounded-2xl bg-[#111D30] border border-[#26354B] flex items-center justify-between gap-2"
                      >
                        <div>
                          <span className="font-bold text-white block">
                            {f.courierName || "Entregador"} · {f.referenceMonth}
                          </span>
                          <span className="text-[#B7F34A] font-black">{fmtKz(f.amountKz)}</span>
                          {f.proofUrl && (
                            <button
                              type="button"
                              onClick={() => setPreviewImageUrl(f.proofUrl!)}
                              className="ml-2 text-[#246BFD] underline cursor-pointer"
                            >
                              Ver comprovativo
                            </button>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          {f.status !== "pago" && (
                            <button
                              type="button"
                              onClick={async () => {
                                await deliveryRepo.updateMonthlyFeeStatus(f.id, "pago");
                                await auditRepo.log(currentUser.id, "REVIEW_COURIER_FEE", f.id, { status: "pago" });
                                showToast("Mensalidade confirmada como paga.");
                                loadData();
                              }}
                              className="px-3 py-1 rounded-xl bg-emerald-500 text-slate-950 font-black cursor-pointer"
                            >
                              Confirmar
                            </button>
                          )}
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-black capitalize ${
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
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Monitorização de Todas as Entregas */}
            <div className="p-4 rounded-3xl bg-[#172338] border border-[#26354B] space-y-3 text-xs">
              <h3 className="font-black text-sm">Monitorização de Entregas, Atrasos e Problemas ({deliveries.length})</h3>
              {deliveries.length === 0 ? (
                <p className="text-[#A6B2C5]">Ainda não existem entregas registadas.</p>
              ) : (
                <div className="space-y-2">
                  {deliveries.map((d) => (
                    <div
                      key={d.id}
                      className={`p-3.5 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                        d.hasDelay || d.status === "Com problema"
                          ? "bg-red-500/10 border-red-500/40"
                          : "bg-[#111D30] border-[#26354B]"
                      }`}
                    >
                      <div className="space-y-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-black text-white">#{d.orderCode || d.orderId.slice(0, 6)}</span>
                          <span className="px-2 py-0.5 rounded-full bg-[#246BFD] text-white text-[10px] font-bold">
                            {d.status}
                          </span>
                          {(d.hasDelay || d.status === "Com problema") && (
                            <span className="px-2 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-black">
                              Atraso / Problema
                            </span>
                          )}
                        </div>
                        <p className="text-[#A6B2C5]">
                          Loja: {d.storeName || "—"} → Destino: {d.deliveryAddress}
                        </p>
                        <p className="text-[#A6B2C5]">
                          Entregador: <b>{d.courierName || "A aguardar aceitação"}</b> · Taxa: {fmtKz(d.deliveryFee)} ·
                          Comissão: {d.commissionCharged ? fmtKz(d.commissionAmount) : "Só após entrega"}
                        </p>
                        {d.issueDescription && (
                          <p className="text-amber-300 font-bold">Ocorrência: {d.issueDescription}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 8. AUDITORIA */}
        {activeTab === "auditoria" && (
          <div className="space-y-4 anim-fadeUp">
            <h2 className="font-black text-base sm:text-lg">Registo de Acções Administrativas</h2>
            {auditLogs.length === 0 ? (
              <div className="p-8 text-center rounded-3xl bg-[#172338] border border-[#26354B] text-xs text-[#A6B2C5]">
                Nenhum registo de auditoria até ao momento.
              </div>
            ) : (
              <div className="rounded-3xl border border-[#26354B] bg-[#172338] overflow-hidden shadow-lg">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#111D30] text-[#A6B2C5] uppercase font-bold">
                      <tr>
                        <th className="p-3.5">Data e Hora</th>
                        <th className="p-3.5">Acção</th>
                        <th className="p-3.5">Alvo</th>
                        <th className="p-3.5">Administrador</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#26354B]">
                      {auditLogs.map((log) => {
                        const adminMatch = users.find((u) => u.id === log.adminId);
                        const adminLabel = adminMatch ? adminMatch.name || adminMatch.email : "Administrador";
                        return (
                          <tr key={log.id} className="hover:bg-[#111D30]/40">
                            <td className="p-3.5 text-[#A6B2C5] whitespace-nowrap">{fmtDateTime(log.createdAt)}</td>
                            <td className="p-3.5 font-bold text-[#B7F34A] whitespace-nowrap">
                              {AUDIT_ACTION_LABELS[log.action] || "Acção administrativa"}
                            </td>
                            <td className="p-3.5 text-white whitespace-nowrap">{formatAuditTarget(log.targetId)}</td>
                            <td className="p-3.5 text-[#A6B2C5] truncate max-w-xs whitespace-nowrap">{adminLabel}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Image Preview Modal */}
      {previewImageUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setPreviewImageUrl(null)}
        >
          <div
            className="relative max-w-lg w-full rounded-3xl overflow-hidden bg-[#172338] border border-[#26354B] p-3"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setPreviewImageUrl(null)}
              className="absolute top-4 right-4 p-2 rounded-full bg-black/70 text-white cursor-pointer"
              aria-label="Fechar imagem"
            >
              <X size={16} />
            </button>
            <img src={previewImageUrl} alt="Documento ou Comprovativo" className="w-full max-h-[75vh] object-contain rounded-2xl" />
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 max-w-[calc(100vw-24px)] px-4 sm:px-5 py-3 rounded-2xl font-black text-xs shadow-2xl bg-[#B7F34A] text-slate-950 flex items-center justify-center gap-2 text-center">
          <CheckCircle2 size={16} className="shrink-0" />
          <span className="break-words">{toast}</span>
        </div>
      )}
    </div>
  );
};
