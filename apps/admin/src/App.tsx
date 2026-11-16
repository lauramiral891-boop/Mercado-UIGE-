import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ShieldCheck,
  Users,
  Store,
  Package,
  AlertCircle,
  Megaphone,
  CheckCircle2,
  RefreshCw,
  LogOut,
  Mail,
  Lock,
  ArrowRight,
  FileText,
  Truck,
  CreditCard,
  LayoutDashboard,
  ClipboardCheck,
  Settings,
  Activity,
  Menu,
  X,
} from "lucide-react";
import {
  User,
  UserRole,
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
  AuditLogItem,
  SystemEvent,
  AppErrorRecord,
  SystemHealthMetrics,
  NocServiceCheck,
  NocHistorySample,
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
  notificationRepo,
  systemEventRepo,
  appErrorRepo,
  systemHealthRepo,
  getStoredNocHistory,
  saveNocHistory,
  sanitizeTelemetryText,
  sendEmailOtp,
  verifyEmailOtp,
  supabase,
  isSupabaseConfigured,
  saveCurrentUser,
  translateErrorMessage,
  formatUserRole,
  isAnyAdminRole,
  isSuperAdminRole,
} from "@mercado-uige/shared";
import { AdminSection, canAccessAdminSection } from "./lib/adminHelpers";
import { appendNocHistorySample, OperationTiming } from "./lib/controlCenterHelpers";
import { ConfirmModal } from "./components/ConfirmModal";
import { OverviewSection } from "./components/OverviewSection";
import { ApprovalsSection } from "./components/ApprovalsSection";
import { OrdersSection } from "./components/OrdersSection";
import { ConfigSection } from "./components/ConfigSection";
import { ControlCenterSection } from "./components/ControlCenterSection";
import {
  StoresSection,
  UsersSection,
  PaymentsSection,
  AdsSection,
  DeliveriesSection,
  ReportsSection,
  AuditSection,
} from "./components/OperationalSections";

const INITIAL_METRICS: SystemHealthMetrics = {
  dbBytes: 0,
  storageBytes: 0,
  storageFiles: 0,
  totalUsers: 0,
  storesCount: 0,
  productsCount: 0,
  ordersCount: 0,
  pendingPayments: 0,
  openSecurityAlerts: 0,
  errorGroups: 0,
  collectedAt: new Date().toISOString(),
};

interface ConfirmState {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  tone: "danger" | "warning" | "primary";
  requireReason?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  action: (reason?: string) => Promise<void>;
}

export const AdminApp: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<AdminSection>("resumo");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Login OTP
  const [loginEmail, setLoginEmail] = useState("tvvibeoficial@gmail.com");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpAttemptsCount, setOtpAttemptsCount] = useState(0);
  const [resendTimer, setResendTimer] = useState(0);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");

  // Dados operacionais
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
  const [loading, setLoading] = useState(false);

  // Centro de Controlo (só super_admin)
  const [systemEvents, setSystemEvents] = useState<SystemEvent[]>([]);
  const [appErrors, setAppErrors] = useState<AppErrorRecord[]>([]);
  const [healthMetrics, setHealthMetrics] = useState<SystemHealthMetrics>(INITIAL_METRICS);
  const [nocChecks, setNocChecks] = useState<NocServiceCheck[]>([]);
  const [nocHistory, setNocHistory] = useState<NocHistorySample[]>(() => getStoredNocHistory());
  const [nocRunning, setNocRunning] = useState(false);
  const [operationTimings, setOperationTimings] = useState<OperationTiming[]>([]);

  const activeTabRef = React.useRef<AdminSection>(activeTab);
  activeTabRef.current = activeTab;

  // Lightbox & Toast & Confirmação
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => {
      setToast((prev) => (prev === msg ? null : prev));
    }, 3800);
  }, []);

  const recordOperationTiming = useCallback((operation: string, durationMs: number, ok: boolean) => {
    const entry: OperationTiming = {
      id: `op-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      operation,
      durationMs: Math.max(1, Math.round(durationMs)),
      ok,
      recordedAt: new Date().toISOString(),
    };
    setOperationTimings((prev) => [entry, ...prev].slice(0, 20));
  }, []);

  useEffect(() => {
    userRepo.getCurrentUser().then((u) => {
      if (u && isAnyAdminRole(u.role) && !u.isSuspended) {
        setCurrentUser(u);
      }
    });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleWindowError = (ev: ErrorEvent) => {
      const msg = sanitizeTelemetryText(ev.message || "Erro de execução no painel", 160);
      appErrorRepo
        .report({ screen: activeTabRef.current, message: msg, source: "window.error" })
        .catch(() => {});
    };
    const handleUnhandledRejection = (ev: PromiseRejectionEvent) => {
      const raw =
        ev.reason instanceof Error
          ? ev.reason.message
          : typeof ev.reason === "string"
          ? ev.reason
          : "Falha assíncrona no painel";
      appErrorRepo
        .report({ screen: activeTabRef.current, message: sanitizeTelemetryText(raw, 160), source: "promise" })
        .catch(() => {});
    };
    window.addEventListener("error", handleWindowError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    return () => {
      window.removeEventListener("error", handleWindowError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, []);

  useEffect(() => {
    if (resendTimer <= 0) return;
    const interval = setInterval(() => setResendTimer((t) => Math.max(0, t - 1)), 1000);
    return () => clearInterval(interval);
  }, [resendTimer]);

  const runNocProbes = useCallback(async () => {
    setNocRunning(true);
    const start = performance.now();
    try {
      const checks = await systemHealthRepo.runNocChecks();
      const elapsed = performance.now() - start;
      setNocChecks(checks);
      setNocHistory((prev) => {
        const updated = appendNocHistorySample(prev, checks);
        saveNocHistory(updated);
        return updated;
      });
      recordOperationTiming("Sondas NOC", elapsed, true);
    } catch (err: unknown) {
      const elapsed = performance.now() - start;
      recordOperationTiming("Sondas NOC", elapsed, false);
      appErrorRepo
        .report({
          screen: "controlo_noc",
          message: sanitizeTelemetryText(translateErrorMessage(err, "Falha nas sondas NOC"), 160),
          source: "noc",
          durationMs: Math.round(elapsed),
        })
        .catch(() => {});
    } finally {
      setNocRunning(false);
    }
  }, [recordOperationTiming]);

  const refreshHealthMetrics = useCallback(async () => {
    const start = performance.now();
    try {
      const m = await systemHealthRepo.getMetrics();
      setHealthMetrics(m);
      recordOperationTiming("Métricas ITOM", performance.now() - start, true);
    } catch (err: unknown) {
      const elapsed = performance.now() - start;
      recordOperationTiming("Métricas ITOM", elapsed, false);
      appErrorRepo
        .report({
          screen: "controlo_itom",
          message: sanitizeTelemetryText(translateErrorMessage(err, "Falha ao recolher métricas ITOM"), 160),
          source: "itom",
          durationMs: Math.round(elapsed),
        })
        .catch(() => {});
    }
  }, [recordOperationTiming]);

  const loadData = useCallback(async () => {
    setLoading(true);
    const start = performance.now();
    try {
      const isSuper = isSuperAdminRole(currentUser?.role);
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
      setAuditLogs(aList);

      if (isSuper) {
        const [evList, errList, mData] = await Promise.all([
          systemEventRepo.getAll(),
          appErrorRepo.getAll(),
          systemHealthRepo.getMetrics(),
        ]);
        setSystemEvents(evList);
        setAppErrors(errList);
        setHealthMetrics(mData);
      }

      recordOperationTiming("Carregar Painel", performance.now() - start, true);
    } catch (err: unknown) {
      const elapsed = performance.now() - start;
      recordOperationTiming("Carregar Painel", elapsed, false);
      const msg = translateErrorMessage(err, "Não foi possível carregar os dados do painel.");
      showToast(msg);
      appErrorRepo
        .report({
          screen: activeTabRef.current,
          message: sanitizeTelemetryText(msg, 160),
          source: "loadData",
          durationMs: Math.round(elapsed),
        })
        .catch(() => {});
    } finally {
      setLoading(false);
    }
  }, [showToast, currentUser?.role, recordOperationTiming]);

  useEffect(() => {
    if (currentUser && isAnyAdminRole(currentUser.role)) {
      loadData();
      if (isSuperAdminRole(currentUser.role)) {
        runNocProbes();
      }
    }
  }, [currentUser, loadData, runNocProbes]);

  useEffect(() => {
    if (currentUser && !canAccessAdminSection(currentUser.role, activeTab)) {
      setActiveTab("resumo");
    }
  }, [currentUser, activeTab]);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    const cleanEmail = loginEmail.trim().toLowerCase();

    if (!cleanEmail.includes("@")) {
      setLoginError("Introduz um endereço de e-mail válido.");
      return;
    }

    const nextAttempts = otpAttemptsCount + 1;
    setOtpAttemptsCount(nextAttempts);
    if (nextAttempts > 3) {
      await systemEventRepo.record({
        type: "EXCESSO_PEDIDOS_OTP",
        severity: "alta",
        userEmail: cleanEmail,
        detail: `Solicitação repetida de código OTP (${nextAttempts} pedidos) no painel admin.`,
      });
    }

    setLoginLoading(true);
    try {
      const { error } = await sendEmailOtp(cleanEmail);
      if (error) {
        const msg = translateErrorMessage(error, "Não foi possível enviar o código de verificação.");
        setLoginError(msg);
        await systemEventRepo.record({
          type: "ENVIO_OTP_ADMIN_FALHADO",
          severity: "aviso",
          userEmail: cleanEmail,
          detail: msg,
        });
      } else {
        setOtpCode("");
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
    const cleanLoginEmail = loginEmail.trim().toLowerCase();

    if (otpCode.length < 6) {
      setLoginError("O código deve ter 6 dígitos.");
      return;
    }

    setLoginLoading(true);
    try {
      const { error } = await verifyEmailOtp(cleanLoginEmail, otpCode);
      if (error) {
        const msg = translateErrorMessage(error, "Código inválido ou expirado.");
        setLoginError(msg);
        await systemEventRepo.record({
          type: "LOGIN_ADMIN_FALHADO",
          severity: "alta",
          userEmail: cleanLoginEmail,
          detail: `Falha ao validar código OTP no painel: ${msg}`,
        });
        setLoginLoading(false);
        return;
      }

      let matched = await userRepo.getCurrentUser();
      if (!matched || matched.email.toLowerCase() !== cleanLoginEmail) {
        const allUsers = await userRepo.getAll();
        matched = allUsers.find((u) => u.email.toLowerCase() === cleanLoginEmail) || null;
      }

      if (!matched || !isAnyAdminRole(matched.role) || matched.isSuspended) {
        if (isSupabaseConfigured) {
          await supabase.auth.signOut();
        }
        await systemEventRepo.record({
          type: "ACESSO_NAO_AUTORIZADO",
          severity: "critica",
          userEmail: cleanLoginEmail,
          detail: "Tentativa de entrada no painel administrativo com conta sem papel administrativo ou suspensa.",
        });
        setLoginError("Acesso restrito. Esta conta não tem permissões de equipa administrativa.");
        setLoginLoading(false);
        return;
      }

      setCurrentUser(matched);
      setOtpAttemptsCount(0);
      await auditRepo.log(matched.id, "LOGIN_ADMIN", "painel_web", {
        email: matched.email,
        role: matched.role,
      });
    } catch (err: unknown) {
      setLoginError(translateErrorMessage(err, "Não foi possível validar o acesso."));
    } finally {
      setLoginLoading(false);
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
    setMobileMenuOpen(false);
  };

  const openConfirm = (cfg: Omit<ConfirmState, "open">) => {
    setConfirmState({ ...cfg, open: true });
  };

  const handleRunConfirmedAction = async (reason?: string) => {
    if (!confirmState) return;
    setConfirmLoading(true);
    const start = performance.now();
    try {
      await confirmState.action(reason);
      recordOperationTiming(confirmState.confirmLabel, performance.now() - start, true);
      setConfirmState(null);
      await loadData();
    } catch (err: unknown) {
      const elapsed = performance.now() - start;
      recordOperationTiming(confirmState.confirmLabel, elapsed, false);
      const msg = translateErrorMessage(err, "Não foi possível concluir a operação.");
      showToast(msg);
      appErrorRepo
        .report({
          screen: activeTabRef.current,
          message: sanitizeTelemetryText(msg, 160),
          source: "action",
          durationMs: Math.round(elapsed),
        })
        .catch(() => {});
    } finally {
      setConfirmLoading(false);
    }
  };

  // Acções de moderação e aprovação com confirmação + auditoria
  const requestApproveEntry = (entry: { kind: "loja" | "utilizador"; store?: StoreType; user?: User }) => {
    if (!currentUser) return;
    if (entry.kind === "loja" && entry.store) {
      const st = entry.store;
      openConfirm({
        title: `Aprovar loja "${st.name}"?`,
        description: `A loja (${st.code || "LJ"}) ficará visível para todos os clientes no Uíge.`,
        confirmLabel: "Aprovar Loja",
        tone: "primary",
        action: async () => {
          await storeRepo.updateApproval(st.id, "aprovado");
          await auditRepo.log(currentUser.id, "APPROVE_STORE", `${st.name} (${st.code || st.id})`);
          await notificationRepo.create({
            userId: st.ownerId,
            title: "Loja aprovada no Mercado Uíge",
            body: `A tua loja "${st.name}" foi aprovada e já está activa para vendas.`,
            type: "info",
          });
          showToast(`Loja ${st.name} aprovada.`);
        },
      });
    } else if (entry.kind === "utilizador" && entry.user) {
      const usr = entry.user;
      openConfirm({
        title: `Aprovar conta de ${usr.name}?`,
        description: `O utilizador (${usr.code || "CL"} · ${formatUserRole(usr.role)}) poderá operar normalmente na plataforma.`,
        confirmLabel: "Aprovar Conta",
        tone: "primary",
        action: async () => {
          await userRepo.updateApproval(usr.id, "aprovado");
          await auditRepo.log(currentUser.id, "APPROVE_USER", `${usr.name} (${usr.code || usr.id})`);
          await notificationRepo.create({
            userId: usr.id,
            title: "Conta aprovada",
            body: "A tua conta profissional no Mercado Uíge foi verificada e aprovada.",
            type: "info",
          });
          showToast(`Conta de ${usr.name} aprovada.`);
        },
      });
    }
  };

  const requestRejectEntry = (entry: { kind: "loja" | "utilizador"; store?: StoreType; user?: User }) => {
    if (!currentUser) return;
    if (entry.kind === "loja" && entry.store) {
      const st = entry.store;
      openConfirm({
        title: `Rejeitar loja "${st.name}"`,
        description: "A loja permanecerá inactiva e o comerciante receberá o motivo por notificação.",
        confirmLabel: "Confirmar Rejeição",
        tone: "danger",
        requireReason: true,
        reasonLabel: "Motivo da rejeição *",
        reasonPlaceholder: "Ex.: Foto da fachada ilegível ou morada incompleta no Uíge...",
        action: async (reason) => {
          await storeRepo.updateApproval(st.id, "rejeitado", reason);
          await auditRepo.log(currentUser.id, "REJECT_STORE", `${st.name} (${st.code || st.id})`, { reason });
          await notificationRepo.create({
            userId: st.ownerId,
            title: "Pedido de loja rejeitado",
            body: `A loja "${st.name}" não foi aprovada: ${reason}`,
            type: "security",
          });
          showToast("Loja rejeitada e registada na auditoria.");
        },
      });
    } else if (entry.kind === "utilizador" && entry.user) {
      const usr = entry.user;
      openConfirm({
        title: `Rejeitar conta de ${usr.name}`,
        description: "O utilizador não será activado como comerciante/entregador e verá o motivo.",
        confirmLabel: "Confirmar Rejeição",
        tone: "danger",
        requireReason: true,
        reasonLabel: "Motivo da rejeição *",
        reasonPlaceholder: "Ex.: Foto do Bilhete de Identidade incompatível...",
        action: async (reason) => {
          await userRepo.updateApproval(usr.id, "rejeitado", reason);
          await auditRepo.log(currentUser.id, "REJECT_USER", `${usr.name} (${usr.code || usr.id})`, { reason });
          await notificationRepo.create({
            userId: usr.id,
            title: "Cadastro não aprovado",
            body: `O teu pedido de conta não foi aprovado: ${reason}`,
            type: "security",
          });
          showToast("Conta rejeitada.");
        },
      });
    }
  };

  const requestCorrectionEntry = (entry: { kind: "loja" | "utilizador"; store?: StoreType; user?: User }) => {
    if (!currentUser) return;
    if (entry.kind === "loja" && entry.store) {
      const st = entry.store;
      openConfirm({
        title: `Pedir correcção para "${st.name}"`,
        description: "Informa exactamente o que o comerciante precisa corrigir (BI, foto da fachada ou bairro).",
        confirmLabel: "Enviar Pedido de Correcção",
        tone: "warning",
        requireReason: true,
        reasonLabel: "Instruções de correcção *",
        reasonPlaceholder: "Ex.: Envia uma foto mais nítida da fachada e confirma o bairro...",
        action: async (reason) => {
          await storeRepo.updateApproval(st.id, "correcao", reason);
          await auditRepo.log(currentUser.id, "REQUEST_CORRECTION_STORE", `${st.name} (${st.code || st.id})`, {
            reason,
          });
          await notificationRepo.create({
            userId: st.ownerId,
            title: "Correcção solicitada na tua loja",
            body: `A moderação pediu uma correcção em "${st.name}": ${reason}`,
            type: "info",
          });
          showToast("Pedido de correcção enviado ao comerciante.");
        },
      });
    } else if (entry.kind === "utilizador" && entry.user) {
      const usr = entry.user;
      openConfirm({
        title: `Pedir correcção a ${usr.name}`,
        description: "O utilizador será notificado sobre os documentos ou dados que precisa reenviar.",
        confirmLabel: "Enviar Pedido",
        tone: "warning",
        requireReason: true,
        reasonLabel: "Dados ou documentos a corrigir *",
        reasonPlaceholder: "Ex.: Carrega novamente a foto do BI frente e verso...",
        action: async (reason) => {
          await userRepo.updateApproval(usr.id, "correcao", reason);
          await auditRepo.log(currentUser.id, "REQUEST_CORRECTION_USER", `${usr.name} (${usr.code || usr.id})`, {
            reason,
          });
          await notificationRepo.create({
            userId: usr.id,
            title: "Correcção necessária no cadastro",
            body: `A moderação pediu uma correcção na tua conta: ${reason}`,
            type: "info",
          });
          showToast("Pedido de correcção enviado.");
        },
      });
    }
  };

  const requestSuspendStore = (store: StoreType) => {
    if (!currentUser) return;
    const suspending = !store.isSuspended;
    openConfirm({
      title: suspending ? `Suspender loja "${store.name}"?` : `Reactivar loja "${store.name}"?`,
      description: suspending
        ? "A loja e os seus artigos deixarão de aparecer imediatamente para os clientes."
        : "A loja voltará a ficar operacional para receber encomendas.",
      confirmLabel: suspending ? "Suspender Loja" : "Reactivar Loja",
      tone: suspending ? "danger" : "primary",
      requireReason: suspending,
      reasonLabel: "Motivo da suspensão *",
      action: async (reason) => {
        await storeRepo.suspendStore(store.id, suspending, reason || undefined);
        await auditRepo.log(
          currentUser.id,
          suspending ? "SUSPEND_STORE" : "UNSUSPEND_STORE",
          `${store.name} (${store.code || store.id})`,
          reason ? { reason } : undefined
        );
        showToast(suspending ? "Loja suspensa." : "Loja reactivada.");
      },
    });
  };

  const requestToggleVip = (store: StoreType) => {
    if (!currentUser) return;
    const nextVip = !store.isVip;
    openConfirm({
      title: nextVip ? `Atribuir selo VIP a "${store.name}"?` : `Remover selo VIP de "${store.name}"?`,
      description: nextVip
        ? "A loja passará a ter destaque prioritário no Mercado Uíge."
        : "A loja deixará de apresentar o selo VIP aos compradores.",
      confirmLabel: nextVip ? "Atribuir VIP" : "Remover VIP",
      tone: nextVip ? "primary" : "warning",
      action: async () => {
        await storeRepo.toggleVip(store.id, nextVip);
        await auditRepo.log(
          currentUser.id,
          nextVip ? "SET_STORE_VIP" : "UNSET_STORE_VIP",
          `${store.name} (${store.code || store.id})`
        );
        showToast(nextVip ? "Selo VIP atribuído." : "Selo VIP removido.");
      },
    });
  };

  const requestSuspendUser = (targetUser: User) => {
    if (!currentUser) return;
    const suspending = !targetUser.isSuspended;
    openConfirm({
      title: suspending ? `Suspender conta de ${targetUser.name}?` : `Reactivar conta de ${targetUser.name}?`,
      description: suspending
        ? "O utilizador perderá acesso às funcionalidades de venda, entrega e checkout."
        : "A conta voltará a ter acesso normal.",
      confirmLabel: suspending ? "Suspender Conta" : "Reactivar Conta",
      tone: suspending ? "danger" : "primary",
      requireReason: suspending,
      reasonLabel: "Motivo da suspensão *",
      action: async (reason) => {
        await userRepo.suspendUser(targetUser.id, suspending);
        await auditRepo.log(
          currentUser.id,
          suspending ? "SUSPEND_USER" : "UNSUSPEND_USER",
          `${targetUser.name} (${targetUser.email})`,
          reason ? { reason } : undefined
        );
        showToast(suspending ? "Utilizador suspenso." : "Utilizador reactivado.");
      },
    });
  };

  const requestDeleteProduct = (product: Product) => {
    if (!currentUser) return;
    openConfirm({
      title: `Remover artigo "${product.name}"?`,
      description: "Esta acção elimina o artigo permanentemente do catálogo provincial e regista na auditoria.",
      confirmLabel: "Remover Artigo",
      tone: "danger",
      requireReason: true,
      reasonLabel: "Motivo da remoção *",
      action: async (reason) => {
        await productRepo.delete(product.id);
        await auditRepo.log(currentUser.id, "DELETE_PRODUCT", product.name, { productId: product.id, reason });
        showToast("Artigo removido do catálogo.");
      },
    });
  };

  const requestConfirmPayment = (pay: MerchantPayment) => {
    if (!currentUser) return;
    openConfirm({
      title: "Confirmar pagamento e activar plano/anúncio?",
      description: `Valor de ${pay.amountKz.toLocaleString("pt-AO")} Kz (${pay.method}) para ${pay.storeName || pay.sellerName || "comerciante"}.`,
      confirmLabel: "Confirmar Pagamento",
      tone: "primary",
      action: async () => {
        await paymentRepo.review(pay.id, "confirmado");
        await auditRepo.log(currentUser.id, "REVIEW_PAYMENT", pay.storeName || pay.id, {
          status: "confirmado",
          amountKz: pay.amountKz,
        });
        showToast("Pagamento confirmado e activado automaticamente.");
      },
    });
  };

  const requestRejectPayment = (pay: MerchantPayment) => {
    if (!currentUser) return;
    openConfirm({
      title: "Rejeitar comprovativo de pagamento?",
      description: "O plano ou anúncio não será activado e o utilizador poderá enviar novo comprovativo.",
      confirmLabel: "Rejeitar Pagamento",
      tone: "danger",
      requireReason: true,
      reasonLabel: "Motivo da rejeição *",
      action: async (reason) => {
        await paymentRepo.review(pay.id, "rejeitado");
        await auditRepo.log(currentUser.id, "REVIEW_PAYMENT", pay.storeName || pay.id, {
          status: "rejeitado",
          reason,
        });
        await notificationRepo.create({
          userId: pay.sellerId,
          title: "Comprovativo não validado",
          body: `O pagamento de ${pay.amountKz} Kz foi rejeitado: ${reason}`,
          type: "security",
        });
        showToast("Pagamento rejeitado.");
      },
    });
  };

  const requestToggleAd = (ad: SponsoredAd, nextActive: boolean) => {
    if (!currentUser) return;
    openConfirm({
      title: nextActive ? `Activar anúncio "${ad.title}"?` : `Pausar anúncio "${ad.title}"?`,
      description: nextActive
        ? "O anúncio voltará a ser exibido no carrossel patrocinado dentro da validade."
        : "O anúncio deixará de aparecer aos compradores enquanto estiver pausado.",
      confirmLabel: nextActive ? "Activar Anúncio" : "Pausar Anúncio",
      tone: nextActive ? "primary" : "warning",
      action: async () => {
        await adRepo.updateStatus(ad.id, nextActive ? "aprovado" : ad.status, nextActive);
        await auditRepo.log(currentUser.id, "REVIEW_AD", ad.title, { active: nextActive });
        showToast(nextActive ? "Anúncio activado." : "Anúncio pausado.");
      },
    });
  };

  const requestDeleteAd = (ad: SponsoredAd) => {
    if (!currentUser) return;
    openConfirm({
      title: `Eliminar anúncio "${ad.title}"?`,
      description: "A campanha patrocinada será apagada em definitivo.",
      confirmLabel: "Eliminar Anúncio",
      tone: "danger",
      action: async () => {
        await adRepo.delete(ad.id);
        await auditRepo.log(currentUser.id, "DELETE_AD", ad.title, { adId: ad.id });
        showToast("Anúncio eliminado.");
      },
    });
  };

  const requestConfirmMonthlyFee = (fee: CourierMonthlyFee) => {
    if (!currentUser) return;
    openConfirm({
      title: `Confirmar mensalidade de ${fee.courierName || "Entregador"}?`,
      description: `Referente ao mês ${fee.referenceMonth} no valor de ${fee.amountKz} Kz.`,
      confirmLabel: "Marcar como Pago",
      tone: "primary",
      action: async () => {
        await deliveryRepo.updateMonthlyFeeStatus(fee.id, "pago");
        await auditRepo.log(currentUser.id, "REVIEW_COURIER_FEE", fee.courierName || fee.id, {
          month: fee.referenceMonth,
          amountKz: fee.amountKz,
        });
        showToast("Mensalidade marcada como paga.");
      },
    });
  };

  const requestResolveReport = (report: ReportItem, status: "resolvido" | "rejeitado") => {
    if (!currentUser) return;
    openConfirm({
      title: status === "resolvido" ? "Marcar denúncia como resolvida?" : "Rejeitar denúncia?",
      description: `Alvo: ${report.storeName || report.productName || "Denúncia"} — "${report.reason}"`,
      confirmLabel: status === "resolvido" ? "Marcar Resolvida" : "Rejeitar Denúncia",
      tone: status === "resolvido" ? "primary" : "warning",
      action: async () => {
        await reportRepo.resolve(report.id, status);
        await auditRepo.log(currentUser.id, "RESOLVE_REPORT", report.storeName || report.productName || report.id, {
          status,
        });
        showToast(status === "resolvido" ? "Denúncia resolvida." : "Denúncia rejeitada.");
      },
    });
  };

  const requestSaveConfig = (updates: Partial<SystemConfig>, summaryLabel: string) => {
    if (!currentUser) return;
    openConfirm({
      title: "Guardar novas configurações globais?",
      description: summaryLabel,
      confirmLabel: "Guardar Configurações",
      tone: "primary",
      action: async () => {
        const updated = await systemConfigRepo.update(updates);
        setSystemConfig(updated);
        await auditRepo.log(currentUser.id, "UPDATE_CONFIG", "system_config", updates);
        showToast("Configurações guardadas no servidor.");
      },
    });
  };

  const requestChangeRole = (targetUser: User, nextRole: UserRole) => {
    if (!currentUser) return;
    openConfirm({
      title: `Alterar papel de ${targetUser.name}?`,
      description: `O acesso será alterado de "${formatUserRole(targetUser.role)}" para "${formatUserRole(nextRole)}" com aplicação por RLS.`,
      confirmLabel: "Alterar Papel",
      tone: "warning",
      requireReason: true,
      reasonLabel: "Justificação para auditoria *",
      action: async (reason) => {
        try {
          await userRepo.setRole(targetUser.id, nextRole);
          await auditRepo.log(currentUser.id, "CHANGE_ROLE", `${targetUser.email} -> ${nextRole}`, { reason });
          showToast(`Papel de ${targetUser.name} actualizado para ${formatUserRole(nextRole)}.`);
        } catch (err: unknown) {
          await systemEventRepo.record({
            type: "TENTATIVA_ALTERAR_PAPEL",
            severity: "critica",
            userEmail: currentUser.email,
            detail: `Tentativa bloqueada ao alterar papel de ${targetUser.email} para ${nextRole}.`,
          });
          throw err;
        }
      },
    });
  };

  const handleSendBroadcast = async (title: string, body: string) => {
    if (!currentUser) return;
    await notificationRepo.create({
      userId: "all",
      title,
      body,
      type: "system",
    });
    await auditRepo.log(currentUser.id, "SEND_BROADCAST", "all_users", { title });
    showToast("Aviso provincial enviado.");
    await loadData();
  };

  const handleCreateAdminAd = async (payload: {
    title: string;
    subtitle: string;
    storeId: string;
    position: AdPosition;
    days: number;
  }) => {
    if (!currentUser) return;
    const st = stores.find((s) => s.id === payload.storeId);
    await adRepo.create({
      sellerId: st?.ownerId || currentUser.id,
      storeId: st?.id,
      storeName: st?.name || "Mercado Uíge",
      title: payload.title,
      subtitle: payload.subtitle,
      imageUrl: st?.facadeImage || st?.logo || "",
      position: payload.position,
      startDate: new Date().toISOString(),
      endDate: new Date(Date.now() + payload.days * 86400000).toISOString(),
      active: true,
      status: "aprovado",
    });
    await auditRepo.log(currentUser.id, "CREATE_AD", st?.name || "global", { title: payload.title });
    showToast("Anúncio patrocinado publicado!");
    await loadData();
  };

  // Acções exclusivas do Centro de Controlo (super_admin)
  const requestToggleMaintenance = (nextMode: boolean, message: string) => {
    if (!currentUser) return;
    openConfirm({
      title: nextMode ? "Activar Modo de Manutenção?" : "Desactivar Modo de Manutenção?",
      description: nextMode
        ? "Os utilizadores verão o aviso de manutenção programada enquanto este modo estiver activo."
        : "A plataforma voltará imediatamente à operação normal.",
      confirmLabel: nextMode ? "Activar Manutenção" : "Repor Operação Normal",
      tone: nextMode ? "warning" : "primary",
      action: async () => {
        const updated = await systemConfigRepo.update({
          maintenanceMode: nextMode,
          maintenanceMessage: message || systemConfig.maintenanceMessage,
        });
        setSystemConfig(updated);
        await auditRepo.log(currentUser.id, "TOGGLE_MAINTENANCE", "system_config", {
          maintenanceMode: nextMode,
        });
        await systemEventRepo.record({
          type: "MODO_MANUTENCAO",
          severity: nextMode ? "alta" : "info",
          userEmail: currentUser.email,
          detail: nextMode ? "Modo de manutenção activado no Centro de Comando." : "Modo de manutenção desactivado.",
        });
        showToast(nextMode ? "Modo de manutenção activado." : "Sistema reposto em operação normal.");
      },
    });
  };

  const handleResolveSystemEvent = async (ev: SystemEvent) => {
    try {
      await systemEventRepo.resolve(ev.id, true);
      showToast("Alerta marcado como resolvido.");
      await loadData();
    } catch (err: unknown) {
      showToast(translateErrorMessage(err, "Não foi possível resolver o alerta."));
    }
  };

  const requestBlockUserFromSoc = (targetUser: User, ev: SystemEvent) => {
    if (!currentUser) return;
    openConfirm({
      title: `Bloquear conta "${targetUser.name}" via SOC?`,
      description: `Suspende imediatamente a conta (${targetUser.email}) associada ao evento "${ev.type}" e resolve o alerta.`,
      confirmLabel: "Bloquear Conta",
      tone: "danger",
      requireReason: true,
      reasonLabel: "Motivo de segurança *",
      action: async (reason) => {
        await userRepo.suspendUser(targetUser.id, true);
        await systemEventRepo.resolve(ev.id, true);
        await auditRepo.log(currentUser.id, "BLOCK_FROM_SOC", targetUser.email, {
          eventId: ev.id,
          reason,
        });
        await systemEventRepo.record({
          type: "SUSPENSAO_CONTA_SOC",
          severity: "alta",
          userEmail: targetUser.email,
          detail: `Conta bloqueada pelo Super Admin via SOC: ${reason}`,
        });
        showToast(`Conta de ${targetUser.name} bloqueada.`);
      },
    });
  };

  const requestSuspendStoreFromSoc = (targetStore: StoreType, ev: SystemEvent) => {
    if (!currentUser) return;
    openConfirm({
      title: `Suspender loja "${targetStore.name}" via SOC?`,
      description: `Suspende a loja (${targetStore.code || "LJ"}) associada ao alerta "${ev.type}" e fecha o incidente.`,
      confirmLabel: "Suspender Loja",
      tone: "danger",
      requireReason: true,
      reasonLabel: "Motivo de segurança *",
      action: async (reason) => {
        await storeRepo.suspendStore(targetStore.id, true, reason);
        await systemEventRepo.resolve(ev.id, true);
        await auditRepo.log(currentUser.id, "BLOCK_FROM_SOC", `${targetStore.name} (${targetStore.code || targetStore.id})`, {
          eventId: ev.id,
          reason,
        });
        showToast(`Loja ${targetStore.name} suspensa via SOC.`);
      },
    });
  };

  const requestClearAppErrors = () => {
    if (!currentUser) return;
    openConfirm({
      title: "Limpar todos os registos de erros da Observabilidade?",
      description: "Os contadores agrupados por ecrã em erros_app serão removidos após análise.",
      confirmLabel: "Limpar Registos",
      tone: "warning",
      action: async () => {
        await appErrorRepo.clearAll();
        await auditRepo.log(currentUser.id, "CLEAR_APP_ERRORS", "erros_app");
        showToast("Registos de erros limpos.");
      },
    });
  };

  // Contadores da barra lateral
  const counters = useMemo(() => {
    const pendingStores = stores.filter((s) => !s.isApproved && s.approvalStatus !== "rejeitado").length;
    const pendingAccounts = users.filter(
      (u) => u.isApproved === false && u.role !== "cliente" && u.approvalStatus !== "rejeitado"
    ).length;
    const pendingPayments =
      payments.filter((p) => p.status === "pendente").length +
      courierFees.filter((f) => f.status === "pendente").length;
    const pendingReports = reports.filter((r) => r.status === "pendente").length;
    const delayedDeliveries = deliveries.filter(
      (d) => d.status !== "Entregue" && (d.hasDelay || d.status === "Com problema")
    ).length;
    const openSecurityAlerts = systemEvents.filter((e) => !e.resolved).length;

    return {
      approvals: pendingStores + pendingAccounts,
      stores: stores.length,
      users: users.length,
      orders: orders.length,
      payments: pendingPayments,
      ads: ads.length,
      deliveries: delayedDeliveries > 0 ? delayedDeliveries : deliveries.length,
      deliveriesAlert: delayedDeliveries > 0,
      reports: pendingReports,
      securityAlerts: openSecurityAlerts,
    };
  }, [stores, users, payments, courierFees, reports, deliveries, orders, ads, systemEvents]);

  // Ecrã de Login
  if (!currentUser || !isAnyAdminRole(currentUser.role)) {
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
            <span>Acesso restrito a Super Admin, Moderadores e equipa Financeira.</span>
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
                <label className="block text-xs font-bold text-[#A6B2C5] mb-1.5">E-mail da Equipa</label>
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
                {loginLoading ? "A enviar código..." : "Enviar Código de Acesso"}
                <ArrowRight size={16} />
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#A6B2C5] mb-1.5">
                  Código enviado para {loginEmail}
                </label>
                <div className="flex items-center gap-2.5 px-3.5 py-3 rounded-2xl bg-[#111D30] border border-[#26354B] focus-within:border-[#B7F34A]">
                  <Lock size={16} className="text-[#B7F34A]" />
                  <input
                    type="text"
                    inputMode="numeric"
                    required
                    maxLength={8}
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

  const navItems: Array<{
    id: AdminSection;
    label: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
    badge?: number;
    badgeTone?: "amber" | "blue" | "lime";
  }> = [
    { id: "resumo", label: "Resumo", icon: LayoutDashboard },
    {
      id: "aprovacoes",
      label: "Aprovações",
      icon: ClipboardCheck,
      badge: counters.approvals,
      badgeTone: counters.approvals > 0 ? "amber" : "blue",
    },
    { id: "lojas", label: "Lojas", icon: Store, badge: counters.stores, badgeTone: "blue" },
    { id: "utilizadores", label: "Utilizadores", icon: Users, badge: counters.users, badgeTone: "blue" },
    { id: "encomendas", label: "Encomendas", icon: Package, badge: counters.orders, badgeTone: "blue" },
    {
      id: "pagamentos",
      label: "Pagamentos",
      icon: CreditCard,
      badge: counters.payments,
      badgeTone: counters.payments > 0 ? "amber" : "blue",
    },
    { id: "anuncios", label: "Anúncios", icon: Megaphone, badge: counters.ads, badgeTone: "blue" },
    {
      id: "entregas",
      label: "Entregas",
      icon: Truck,
      badge: counters.deliveries,
      badgeTone: counters.deliveriesAlert ? "amber" : "blue",
    },
    {
      id: "denuncias",
      label: "Denúncias",
      icon: AlertCircle,
      badge: counters.reports,
      badgeTone: counters.reports > 0 ? "amber" : "blue",
    },
    { id: "configuracoes", label: "Configurações", icon: Settings },
    { id: "auditoria", label: "Auditoria", icon: FileText },
    {
      id: "controlo",
      label: "Centro de Controlo",
      icon: Activity,
      badge: counters.securityAlerts > 0 ? counters.securityAlerts : undefined,
      badgeTone: counters.securityAlerts > 0 ? "amber" : "lime",
    },
  ];

  const visibleNavItems = navItems.filter((item) => canAccessAdminSection(currentUser.role, item.id));

  const renderSidebarContent = () => (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-[#26354B] flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#246BFD] to-[#07111F] flex items-center justify-center text-[#B7F34A] shrink-0">
          <ShieldCheck size={20} />
        </div>
        <div className="min-w-0">
          <span className="font-black text-sm text-white block truncate">
            Mercado <span className="text-[#B7F34A]">Uíge</span>
          </span>
          <span className="text-[11px] font-bold text-[#246BFD] block truncate">
            {formatUserRole(currentUser.role)}
          </span>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-3 space-y-1 text-xs" aria-label="Navegação administrativa">
        {visibleNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setActiveTab(item.id);
                setMobileMenuOpen(false);
              }}
              className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl font-bold transition-colors cursor-pointer ${
                isActive
                  ? "bg-[#246BFD] text-white shadow-lg shadow-[#246BFD]/20"
                  : "text-[#A6B2C5] hover:bg-[#111D30] hover:text-white"
              }`}
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <Icon size={16} className={isActive ? "text-[#B7F34A] shrink-0" : "shrink-0"} />
                <span className="truncate">{item.label}</span>
              </span>
              {typeof item.badge === "number" && (
                <span
                  className={`px-2 py-0.5 rounded-md text-[10px] font-black tabular-nums shrink-0 ${
                    isActive
                      ? "bg-[#07111F]/40 text-[#B7F34A]"
                      : item.badgeTone === "amber" && item.badge > 0
                      ? "bg-amber-400/20 text-amber-300"
                      : "bg-[#111D30] text-[#A6B2C5]"
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="p-3 border-t border-[#26354B] space-y-2 text-xs">
        <div className="px-3 py-2 rounded-xl bg-[#111D30] border border-[#26354B]">
          <span className="text-[10px] text-[#A6B2C5] block">Sessão activa</span>
          <span className="font-bold text-white block truncate">{currentUser.email}</span>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 font-bold hover:bg-red-500/20 cursor-pointer"
        >
          <LogOut size={14} /> Terminar Sessão
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#07111F] text-slate-100 flex">
      {/* Menu Lateral Desktop */}
      <aside className="hidden lg:flex w-64 shrink-0 bg-[#172338] border-r border-[#26354B] flex-col sticky top-0 h-screen">
        {renderSidebarContent()}
      </aside>

      {/* Drawer Mobile */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden bg-black/70 backdrop-blur-sm flex"
          onClick={() => setMobileMenuOpen(false)}
        >
          <aside
            className="w-72 max-w-[85vw] bg-[#172338] border-r border-[#26354B] h-full"
            onClick={(e) => e.stopPropagation()}
          >
            {renderSidebarContent()}
          </aside>
        </div>
      )}

      {/* Área Principal */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-40 bg-[#172338]/95 backdrop-blur-md border-b border-[#26354B] px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-xl bg-[#111D30] border border-[#26354B] text-white cursor-pointer"
              aria-label="Abrir menu lateral"
            >
              <Menu size={18} />
            </button>
            <div className="min-w-0">
              <h1 className="font-black text-sm sm:text-base text-white truncate">
                {visibleNavItems.find((i) => i.id === activeTab)?.label || "Painel Administrativo"}
              </h1>
              <span className="text-[11px] text-[#A6B2C5] hidden sm:block truncate">
                Operação Provincial · Província do Uíge
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => loadData()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#111D30] border border-[#26354B] text-xs font-bold text-[#A6B2C5] hover:text-white cursor-pointer"
              aria-label="Recarregar dados"
            >
              <RefreshCw size={14} className={loading ? "animate-spin text-[#B7F34A]" : ""} />
              <span className="hidden sm:inline">Actualizar</span>
            </button>
          </div>
        </header>

        <main className="flex-1 w-full max-w-7xl mx-auto p-4 sm:p-6">
          {activeTab === "resumo" && (
            <OverviewSection
              currentUser={currentUser}
              users={users}
              stores={stores}
              products={products}
              orders={orders}
              reports={reports}
              payments={payments}
              courierFees={courierFees}
              deliveries={deliveries}
              onNavigate={setActiveTab}
              onSendBroadcast={handleSendBroadcast}
              onRequestDeleteProduct={requestDeleteProduct}
            />
          )}

          {activeTab === "aprovacoes" && (
            <ApprovalsSection
              stores={stores}
              users={users}
              onPreviewImage={setPreviewImageUrl}
              onApprove={requestApproveEntry}
              onReject={requestRejectEntry}
              onRequestCorrection={requestCorrectionEntry}
            />
          )}

          {activeTab === "lojas" && (
            <StoresSection
              currentUser={currentUser}
              stores={stores}
              onPreviewImage={setPreviewImageUrl}
              onApproveStore={(s) => requestApproveEntry({ kind: "loja", store: s })}
              onSuspendStore={requestSuspendStore}
              onToggleVip={requestToggleVip}
            />
          )}

          {activeTab === "utilizadores" && (
            <UsersSection
              currentUser={currentUser}
              users={users}
              onApproveUser={(u) => requestApproveEntry({ kind: "utilizador", user: u })}
              onSuspendUser={requestSuspendUser}
            />
          )}

          {activeTab === "encomendas" && <OrdersSection orders={orders} stores={stores} />}

          {activeTab === "pagamentos" && (
            <PaymentsSection
              payments={payments}
              onPreviewImage={setPreviewImageUrl}
              onConfirmPayment={requestConfirmPayment}
              onRejectPayment={requestRejectPayment}
            />
          )}

          {activeTab === "anuncios" && (
            <AdsSection
              ads={ads}
              stores={stores}
              onCreateAd={handleCreateAdminAd}
              onToggleAd={requestToggleAd}
              onDeleteAd={requestDeleteAd}
            />
          )}

          {activeTab === "entregas" && (
            <DeliveriesSection
              currentUser={currentUser}
              deliveries={deliveries}
              courierFees={courierFees}
              onPreviewImage={setPreviewImageUrl}
              onConfirmMonthlyFee={requestConfirmMonthlyFee}
            />
          )}

          {activeTab === "denuncias" && (
            <ReportsSection reports={reports} onResolveReport={requestResolveReport} />
          )}

          {activeTab === "configuracoes" && (
            <ConfigSection
              currentUser={currentUser}
              systemConfig={systemConfig}
              users={users}
              onRequestSaveConfig={requestSaveConfig}
              onRequestChangeRole={requestChangeRole}
            />
          )}

          {activeTab === "auditoria" && <AuditSection auditLogs={auditLogs} users={users} />}

          {activeTab === "controlo" && isSuperAdminRole(currentUser.role) && (
            <ControlCenterSection
              currentUser={currentUser}
              systemConfig={systemConfig}
              nocChecks={nocChecks}
              nocHistory={nocHistory}
              nocRunning={nocRunning}
              systemEvents={systemEvents}
              metrics={healthMetrics}
              appErrors={appErrors}
              operationTimings={operationTimings}
              users={users}
              stores={stores}
              onRunNocChecks={runNocProbes}
              onRefreshMetrics={refreshHealthMetrics}
              onRequestToggleMaintenance={requestToggleMaintenance}
              onResolveSystemEvent={handleResolveSystemEvent}
              onBlockUserFromSoc={requestBlockUserFromSoc}
              onSuspendStoreFromSoc={requestSuspendStoreFromSoc}
              onRequestClearAppErrors={requestClearAppErrors}
            />
          )}
        </main>
      </div>

      {/* Modal de Confirmação Antes de Acções Graves */}
      <ConfirmModal
        open={Boolean(confirmState?.open)}
        title={confirmState?.title || ""}
        description={confirmState?.description || ""}
        confirmLabel={confirmState?.confirmLabel}
        tone={confirmState?.tone}
        requireReason={confirmState?.requireReason}
        reasonLabel={confirmState?.reasonLabel}
        reasonPlaceholder={confirmState?.reasonPlaceholder}
        loading={confirmLoading}
        onCancel={() => !confirmLoading && setConfirmState(null)}
        onConfirm={handleRunConfirmedAction}
      />

      {/* Lightbox para BI, Fachada e Comprovativos */}
      {previewImageUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setPreviewImageUrl(null)}
        >
          <div className="relative max-w-2xl w-full bg-[#172338] rounded-2xl p-3 border border-[#26354B]">
            <button
              type="button"
              onClick={() => setPreviewImageUrl(null)}
              className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-white text-slate-900 flex items-center justify-center shadow-lg cursor-pointer"
              aria-label="Fechar pré-visualização"
            >
              <X size={16} />
            </button>
            <img
              src={previewImageUrl}
              alt="Documento em análise"
              className="w-full max-h-[75vh] object-contain rounded-xl"
            />
          </div>
        </div>
      )}

      {/* Toast Flutuante */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded-xl bg-[#B7F34A] text-slate-950 font-black text-xs shadow-2xl anim-pop">
          {toast}
        </div>
      )}
    </div>
  );
};
