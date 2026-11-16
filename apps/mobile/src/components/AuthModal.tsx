import React, { useState, useEffect } from "react";
import {
  X,
  User as UserIcon,
  Mail,
  Phone,
  AlertCircle,
  ShoppingCart,
  ArrowRight,
  CheckCircle2,
  MapPin,
  IdCard,
  Lock,
  Eye,
  EyeOff,
  KeyRound,
} from "lucide-react";
import {
  User,
  UserRole,
  UIGE_MUNICIPALITIES,
  getBairrosByMunicipality,
  getStoredUsers,
  saveUsers,
  saveCurrentUser,
  signUpWithPassword,
  resendRegistrationOtp,
  verifyRegistrationOtp,
  signInWithPassword,
  sendPasswordResetOtp,
  confirmPasswordResetWithOtp,
  validatePasswordPair,
  isSupabaseConfigured,
  userRepo,
  translateErrorMessage,
} from "@mercado-uige/shared";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: "login" | "register" | "otp";
  onSuccess: (user: User) => void;
  showToast: (msg: string) => void;
}

type AuthMode = "login" | "register" | "register-otp" | "forgot-email" | "forgot-reset";

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  initialMode = "login",
  onSuccess,
  showToast,
}) => {
  const mapInitialMode = (m: "login" | "register" | "otp"): AuthMode =>
    m === "otp" ? "register-otp" : m;

  const [mode, setMode] = useState<AuthMode>(mapInitialMode(initialMode));
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<UserRole>("cliente");
  const [municipality, setMunicipality] = useState("Uíge");
  const [bairro, setBairro] = useState(getBairrosByMunicipality("Uíge")[0]);
  const [biNumber, setBiNumber] = useState("");
  const [resideConfirmed, setResideConfirmed] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [resendTimer, setResendTimer] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMode(mapInitialMode(initialMode));
      setError("");
      setOtpCode("");
    }
  }, [isOpen, initialMode]);

  useEffect(() => {
    const validBairros = getBairrosByMunicipality(municipality);
    if (!validBairros.includes(bairro)) {
      setBairro(validBairros[0]);
    }
  }, [municipality]);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    if (resendTimer > 0) {
      timer = setInterval(() => setResendTimer((t) => Math.max(0, t - 1)), 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [resendTimer]);

  if (!isOpen) return null;

  const availableBairros = getBairrosByMunicipality(municipality);

  const resolveAndSyncProfile = async (
    cleanEmail: string,
    authUserId?: string,
    fromRegistration = false
  ): Promise<User> => {
    if (isSupabaseConfigured && authUserId) {
      if (fromRegistration && (name.trim() || phone.trim() || biNumber.trim())) {
        try {
          await userRepo.updateProfile(authUserId, {
            name: name.trim() || undefined,
            phone: phone.trim() || undefined,
            municipality,
            bairro,
            biNumber: biNumber.trim() || undefined,
          });
        } catch {}
      }
      const serverProfile = await userRepo.getCurrentUser();
      if (serverProfile) {
        saveCurrentUser(serverProfile);
        return serverProfile;
      }
    }

    const users = getStoredUsers();
    let matched = users.find((u) => u.email.toLowerCase() === cleanEmail);

    if (!matched) {
      const safeRole: UserRole =
        role === "comerciante" ? "comerciante" : role === "entregador" ? "entregador" : "cliente";
      const nextNum = String(users.length + 1).padStart(4, "0");
      matched = {
        id: authUserId || `user_${Date.now()}`,
        code: `CL-${nextNum}`,
        name: name.trim() || cleanEmail.split("@")[0],
        email: cleanEmail,
        phone: phone.trim() || null,
        role: safeRole,
        province: "Uíge",
        municipality,
        bairro,
        biNumber: safeRole === "entregador" ? biNumber.trim() : null,
        residesInUigeConfirmed: true,
        isApproved: safeRole === "cliente",
        walletBalance: 0,
        isVerified: true,
        createdAt: new Date().toISOString(),
      };
      saveUsers([...users, matched]);
    } else if (fromRegistration) {
      matched = {
        ...matched,
        isVerified: true,
        name: name.trim() || matched.name,
        phone: phone.trim() || matched.phone,
        municipality: municipality || matched.municipality,
        bairro: bairro || matched.bairro,
      };
      saveUsers(users.map((u) => (u.id === matched!.id ? matched! : u)));
    }

    saveCurrentUser(matched);
    return matched;
  };

  // LOGIN DIÁRIO (email + palavra-passe, sem OTP)
  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !cleanEmail.includes("@")) {
      setError("Introduz um endereço de e-mail válido.");
      return;
    }
    if (!password) {
      setError("Introduz a tua palavra-passe.");
      return;
    }

    setLoading(true);
    try {
      const { data, error: loginErr } = await signInWithPassword(cleanEmail, password);
      if (loginErr) {
        const translated = translateErrorMessage(loginErr, "E-mail ou palavra-passe incorretos.");
        setError(translated);
        const rawMsg = (loginErr.message || "").toLowerCase();
        if (rawMsg.includes("email not confirmed")) {
          setOtpCode("");
          setMode("register-otp");
          setResendTimer(60);
          await resendRegistrationOtp(cleanEmail).catch(() => {});
          showToast(`Conta por confirmar. Novo código enviado para ${cleanEmail}.`);
        }
        return;
      }

      const loggedUser = await resolveAndSyncProfile(cleanEmail, data?.user?.id, false);
      onSuccess(loggedUser);
      showToast(`Bem-vindo de volta, ${(loggedUser.name || "").split(" ")[0] || "Cliente"}!`);
      onClose();
    } catch (err: unknown) {
      setError(translateErrorMessage(err, "Sem ligação. Tenta novamente."));
    } finally {
      setLoading(false);
    }
  };

  // REGISTO (email + palavra-passe + confirmação + Uíge -> envia OTP de registo)
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const cleanEmail = email.trim().toLowerCase();

    if (!name.trim()) {
      setError("Introduz o teu nome completo.");
      return;
    }
    if (!UIGE_MUNICIPALITIES.includes(municipality)) {
      setError("O registo é exclusivo para residentes da província do Uíge.");
      return;
    }
    if (!resideConfirmed) {
      setError("Confirma que resides na província do Uíge para criar conta.");
      return;
    }
    if (role === "entregador") {
      if (!biNumber.trim() || biNumber.trim().length < 6) {
        setError("Entregadores devem indicar o número do Bilhete de Identidade (BI).");
        return;
      }
      if (!phone.trim() || phone.trim().length < 9) {
        setError("Entregadores devem indicar um número de telefone válido.");
        return;
      }
    }
    if (!cleanEmail || !cleanEmail.includes("@")) {
      setError("Introduz um endereço de e-mail válido.");
      return;
    }

    const passErr = validatePasswordPair(password, confirmPassword);
    if (passErr) {
      setError(passErr);
      return;
    }

    setLoading(true);
    try {
      const { data, error: signUpErr } = await signUpWithPassword(cleanEmail, password, {
        nome: name.trim(),
        papel: role,
        provincia: "Uíge",
        municipio: municipality,
        bairro,
        telefone: phone.trim() || undefined,
        bi_numero: role === "entregador" ? biNumber.trim() : undefined,
        reside_uige: resideConfirmed,
      });

      if (signUpErr) {
        setError(translateErrorMessage(signUpErr, "Não foi possível criar a conta."));
        return;
      }

      // Caso o Supabase autentique imediatamente (ex.: confirmação automática), entra directo
      if (isSupabaseConfigured && data?.session && data?.user) {
        const createdUser = await resolveAndSyncProfile(cleanEmail, data.user.id, true);
        onSuccess(createdUser);
        showToast(
          createdUser.role !== "cliente" && createdUser.isApproved === false
            ? "Conta registada! Aguarda aprovação do administrador."
            : `Bem-vindo ao Mercado Uíge, ${(createdUser.name || "").split(" ")[0] || "Cliente"}!`
        );
        onClose();
        return;
      }

      setOtpCode("");
      setMode("register-otp");
      setResendTimer(60);
      showToast(`Código de verificação enviado para ${cleanEmail}`);
    } catch (err: unknown) {
      setError(translateErrorMessage(err, "Sem ligação. Tenta novamente."));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyRegistrationOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const cleanEmail = email.trim().toLowerCase();

    if (otpCode.trim().length < 6) {
      setError("O código de verificação deve ter 6 dígitos.");
      return;
    }

    setLoading(true);
    try {
      const { data, error: verifyErr } = await verifyRegistrationOtp(cleanEmail, otpCode);
      if (verifyErr) {
        setError(translateErrorMessage(verifyErr, "Código inválido ou expirado. Tenta novamente."));
        return;
      }

      const verifiedUser = await resolveAndSyncProfile(cleanEmail, data?.user?.id, true);
      onSuccess(verifiedUser);
      showToast(
        verifiedUser.role !== "cliente" && verifiedUser.isApproved === false
          ? "Conta confirmada! Aguarda aprovação do administrador."
          : `Bem-vindo ao Mercado Uíge, ${(verifiedUser.name || "").split(" ")[0] || "Cliente"}!`
      );
      onClose();
    } catch (err: unknown) {
      setError(translateErrorMessage(err, "Não foi possível validar o código. Tenta novamente."));
    } finally {
      setLoading(false);
    }
  };

  const handleResendSignupCode = async () => {
    setError("");
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) return;
    setLoading(true);
    try {
      const { error: resendErr } = await resendRegistrationOtp(cleanEmail);
      if (resendErr) {
        setError(translateErrorMessage(resendErr, "Não foi possível reenviar o código."));
        return;
      }
      setResendTimer(60);
      showToast(`Novo código enviado para ${cleanEmail}`);
    } catch (err: unknown) {
      setError(translateErrorMessage(err, "Sem ligação. Tenta novamente."));
    } finally {
      setLoading(false);
    }
  };

  // RECUPERAÇÃO DE PALAVRA-PASSE
  const handleSendRecoveryCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      setError("Introduz um endereço de e-mail válido.");
      return;
    }

    setLoading(true);
    try {
      const { error: resetErr } = await sendPasswordResetOtp(cleanEmail);
      if (resetErr) {
        setError(translateErrorMessage(resetErr, "Não foi possível enviar o código de recuperação."));
        return;
      }
      setOtpCode("");
      setPassword("");
      setConfirmPassword("");
      setMode("forgot-reset");
      setResendTimer(60);
      showToast(`Código de recuperação enviado para ${cleanEmail}`);
    } catch (err: unknown) {
      setError(translateErrorMessage(err, "Sem ligação. Tenta novamente."));
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const cleanEmail = email.trim().toLowerCase();

    if (otpCode.trim().length < 6) {
      setError("Introduz o código de 6 dígitos enviado para o teu e-mail.");
      return;
    }

    const passErr = validatePasswordPair(password, confirmPassword);
    if (passErr) {
      setError(passErr);
      return;
    }

    setLoading(true);
    try {
      const { error: resetErr } = await confirmPasswordResetWithOtp({
        email: cleanEmail,
        token: otpCode.trim(),
        newPassword: password,
      });

      if (resetErr) {
        setError(translateErrorMessage(resetErr, "Código inválido ou expirado."));
        return;
      }

      setPassword("");
      setConfirmPassword("");
      setOtpCode("");
      setMode("login");
      showToast("Palavra-passe redefinida com sucesso! Inicia sessão com a nova palavra-passe.");
    } catch (err: unknown) {
      setError(translateErrorMessage(err, "Não foi possível redefinir a palavra-passe."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-2.5 sm:p-4 bg-black/80 backdrop-blur-md anim-fadeUp"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-3xl p-4 sm:p-6 border shadow-2xl anim-pop max-h-[92vh] overflow-y-auto"
        style={{
          backgroundColor: "var(--surface)",
          borderColor: "var(--border)",
          color: "var(--text-primary)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between gap-2 pb-3 border-b mb-4"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="w-9 h-9 rounded-2xl grid place-items-center shrink-0"
              style={{ background: "linear-gradient(135deg, #246BFD 0%, #07111F 100%)" }}
            >
              <ShoppingCart size={18} color="#B7F34A" />
            </div>
            <div className="min-w-0">
              <h2 className="font-black text-base sm:text-lg leading-tight truncate">
                {mode === "login" && "Entrar no Mercado Uíge"}
                {mode === "register" && "Criar Conta no Uíge"}
                {mode === "register-otp" && "Confirmar E-mail de Registo"}
                {mode === "forgot-email" && "Recuperar Palavra-passe"}
                {mode === "forgot-reset" && "Definir Nova Palavra-passe"}
              </h2>
              <p className="text-[11px] sm:text-xs truncate" style={{ color: "var(--text-secondary)" }}>
                {mode === "login" && "Acesso rápido com e-mail e palavra-passe"}
                {mode === "register" && "Código enviado por e-mail apenas na criação da conta"}
                {mode === "register-otp" && "Introduz o código recebido por e-mail"}
                {(mode === "forgot-email" || mode === "forgot-reset") && "Reposição segura por código no e-mail"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] rounded-full border grid place-items-center hover:bg-slate-500/10 cursor-pointer shrink-0"
            style={{ borderColor: "var(--border)" }}
            aria-label="Fechar janela de acesso"
          >
            <X size={16} />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-2xl bg-red-500/15 border border-red-500/30 text-red-400 text-xs font-bold mb-4 flex items-center gap-2">
            <AlertCircle size={15} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Tabs Login / Registo */}
        {(mode === "login" || mode === "register") && (
          <div
            className="flex rounded-2xl p-1 border text-xs font-bold mb-4"
            style={{ borderColor: "var(--border)", backgroundColor: "var(--surface-secondary)" }}
          >
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setError("");
              }}
              className={`flex-1 min-h-[40px] py-2 rounded-xl transition-all cursor-pointer ${
                mode === "login" ? "bg-[#246BFD] text-white shadow-sm" : "hover:text-[#246BFD]"
              }`}
            >
              Já Tenho Conta
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("register");
                setError("");
              }}
              className={`flex-1 min-h-[40px] py-2 rounded-xl transition-all cursor-pointer ${
                mode === "register" ? "bg-[#246BFD] text-white shadow-sm" : "hover:text-[#246BFD]"
              }`}
            >
              Criar Conta
            </button>
          </div>
        )}

        {/* MODO: LOGIN DIÁRIO */}
        {mode === "login" && (
          <form onSubmit={handlePasswordLogin} className="space-y-3.5">
            <div>
              <label className="block text-xs font-bold mb-1" style={{ color: "var(--text-secondary)" }}>
                Endereço de E-mail
              </label>
              <div
                className="flex items-center gap-2 px-3 min-h-[44px] rounded-xl border"
                style={{ borderColor: "var(--border)", backgroundColor: "var(--surface-secondary)" }}
              >
                <Mail size={15} className="opacity-50 shrink-0" />
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="exemplo@gmail.com"
                  className="w-full min-w-0 bg-transparent text-xs sm:text-sm outline-none font-medium"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold" style={{ color: "var(--text-secondary)" }}>
                  Palavra-passe
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setMode("forgot-email");
                    setError("");
                  }}
                  className="text-xs font-bold text-[#246BFD] hover:underline cursor-pointer py-1"
                >
                  Esqueci a palavra-passe
                </button>
              </div>
              <div
                className="flex items-center gap-2 px-3 min-h-[44px] rounded-xl border"
                style={{ borderColor: "var(--border)", backgroundColor: "var(--surface-secondary)" }}
              >
                <Lock size={15} className="opacity-50 shrink-0" />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="A tua palavra-passe"
                  className="w-full min-w-0 bg-transparent text-xs sm:text-sm outline-none font-medium"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="p-1.5 opacity-60 hover:opacity-100 cursor-pointer"
                  aria-label={showPassword ? "Ocultar palavra-passe" : "Mostrar palavra-passe"}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-[48px] py-3 rounded-2xl font-black text-sm text-white shadow-lg flex items-center justify-center gap-2 cursor-pointer transition-transform active:scale-95 disabled:opacity-50 mt-2"
              style={{ backgroundColor: "var(--primary)" }}
            >
              <span>{loading ? "A iniciar sessão..." : "Entrar na Conta"}</span>
              <ArrowRight size={16} />
            </button>
          </form>
        )}

        {/* MODO: REGISTO COMPLETO */}
        {mode === "register" && (
          <form onSubmit={handleRegister} className="space-y-3.5">
            <div
              className="p-2.5 rounded-xl border text-[11px] font-bold flex items-center gap-2 text-[#246BFD]"
              style={{ borderColor: "rgba(36, 107, 253, 0.3)", backgroundColor: "rgba(36, 107, 253, 0.08)" }}
            >
              <MapPin size={14} className="shrink-0" />
              <span>Província: Uíge (registo exclusivo para residentes no Uíge)</span>
            </div>

            <div>
              <label className="block text-xs font-bold mb-1" style={{ color: "var(--text-secondary)" }}>
                Nome Completo
              </label>
              <div
                className="flex items-center gap-2 px-3 min-h-[44px] rounded-xl border"
                style={{ borderColor: "var(--border)", backgroundColor: "var(--surface-secondary)" }}
              >
                <UserIcon size={15} className="opacity-50 shrink-0" />
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Manuel António Domingos"
                  className="w-full min-w-0 bg-transparent text-xs sm:text-sm outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold mb-1" style={{ color: "var(--text-secondary)" }}>
                Tipo de Conta
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { id: "cliente", label: "Cliente" },
                  { id: "comerciante", label: "Comerciante" },
                  { id: "entregador", label: "Entregador" },
                ].map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setRole(r.id as UserRole)}
                    className={`min-h-[44px] p-2 rounded-xl text-[11px] sm:text-xs font-bold border transition-colors cursor-pointer text-center ${
                      role === r.id ? "bg-[#246BFD] text-white border-[#246BFD]" : "border-[var(--border)]"
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              {(role === "comerciante" || role === "entregador") && (
                <p className="text-[11px] text-amber-400 font-semibold mt-1">
                  Novas contas de {role === "comerciante" ? "comerciante" : "entregador"} passam por aprovação do administrador.
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-bold mb-1" style={{ color: "var(--text-secondary)" }}>
                  Município (Uíge)
                </label>
                <select
                  value={municipality}
                  onChange={(e) => setMunicipality(e.target.value)}
                  className="w-full min-h-[44px] p-2.5 rounded-xl border text-xs outline-none cursor-pointer"
                  style={{
                    borderColor: "var(--border)",
                    backgroundColor: "var(--surface-secondary)",
                    color: "var(--text-primary)",
                  }}
                >
                  {UIGE_MUNICIPALITIES.map((m) => (
                    <option key={m} value={m} className="bg-slate-900 text-white">
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold mb-1" style={{ color: "var(--text-secondary)" }}>
                  Bairro do Uíge
                </label>
                <select
                  value={bairro}
                  onChange={(e) => setBairro(e.target.value)}
                  className="w-full min-h-[44px] p-2.5 rounded-xl border text-xs outline-none cursor-pointer"
                  style={{
                    borderColor: "var(--border)",
                    backgroundColor: "var(--surface-secondary)",
                    color: "var(--text-primary)",
                  }}
                >
                  {availableBairros.map((b) => (
                    <option key={b} value={b} className="bg-slate-900 text-white">
                      {b}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {role === "entregador" && (
              <div>
                <label className="block text-xs font-bold mb-1" style={{ color: "var(--text-secondary)" }}>
                  Número do Bilhete de Identidade (BI) *
                </label>
                <div
                  className="flex items-center gap-2 px-3 min-h-[44px] rounded-xl border"
                  style={{ borderColor: "var(--border)", backgroundColor: "var(--surface-secondary)" }}
                >
                  <IdCard size={15} className="opacity-50 shrink-0" />
                  <input
                    type="text"
                    required
                    value={biNumber}
                    onChange={(e) => setBiNumber(e.target.value)}
                    placeholder="Ex: 004512389UE042"
                    className="w-full min-w-0 bg-transparent text-xs sm:text-sm outline-none"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold mb-1" style={{ color: "var(--text-secondary)" }}>
                Telefone (WhatsApp){role === "entregador" ? " *" : ""}
              </label>
              <div
                className="flex items-center gap-2 px-3 min-h-[44px] rounded-xl border"
                style={{ borderColor: "var(--border)", backgroundColor: "var(--surface-secondary)" }}
              >
                <Phone size={15} className="opacity-50 shrink-0" />
                <input
                  type="tel"
                  required={role === "entregador"}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+244 923 000 000"
                  className="w-full min-w-0 bg-transparent text-xs sm:text-sm outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold mb-1" style={{ color: "var(--text-secondary)" }}>
                Endereço de E-mail *
              </label>
              <div
                className="flex items-center gap-2 px-3 min-h-[44px] rounded-xl border"
                style={{ borderColor: "var(--border)", backgroundColor: "var(--surface-secondary)" }}
              >
                <Mail size={15} className="opacity-50 shrink-0" />
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="exemplo@gmail.com"
                  className="w-full min-w-0 bg-transparent text-xs sm:text-sm outline-none font-medium"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-bold mb-1" style={{ color: "var(--text-secondary)" }}>
                  Palavra-passe (mín. 8) *
                </label>
                <div
                  className="flex items-center gap-1.5 px-3 min-h-[44px] rounded-xl border"
                  style={{ borderColor: "var(--border)", backgroundColor: "var(--surface-secondary)" }}
                >
                  <Lock size={14} className="opacity-50 shrink-0" />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mín. 8 caracteres"
                    className="w-full min-w-0 bg-transparent text-xs outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="p-1 opacity-60 hover:opacity-100 cursor-pointer"
                    aria-label={showPassword ? "Ocultar palavra-passe" : "Mostrar palavra-passe"}
                  >
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold mb-1" style={{ color: "var(--text-secondary)" }}>
                  Confirmar Palavra-passe *
                </label>
                <div
                  className="flex items-center gap-1.5 px-3 min-h-[44px] rounded-xl border"
                  style={{ borderColor: "var(--border)", backgroundColor: "var(--surface-secondary)" }}
                >
                  <Lock size={14} className="opacity-50 shrink-0" />
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repetir palavra-passe"
                    className="w-full min-w-0 bg-transparent text-xs outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    className="p-1 opacity-60 hover:opacity-100 cursor-pointer"
                    aria-label={showConfirmPassword ? "Ocultar confirmação" : "Mostrar confirmação"}
                  >
                    {showConfirmPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
            </div>

            <label className="flex items-start gap-2.5 text-xs cursor-pointer pt-1 min-h-[44px]">
              <input
                type="checkbox"
                checked={resideConfirmed}
                onChange={(e) => setResideConfirmed(e.target.checked)}
                className="mt-0.5 shrink-0 w-4 h-4"
              />
              <span className="font-semibold leading-snug">
                Confirmo que resido na província do Uíge (contas de outras províncias não são permitidas).
              </span>
            </label>

            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-[48px] py-3 rounded-2xl font-black text-sm text-slate-950 shadow-lg flex items-center justify-center gap-2 cursor-pointer transition-transform active:scale-95 disabled:opacity-50 mt-2"
              style={{ backgroundColor: "var(--accent)" }}
            >
              <span>{loading ? "A criar conta..." : "Criar Conta e Enviar Código"}</span>
              <ArrowRight size={16} />
            </button>
          </form>
        )}

        {/* MODO: CONFIRMAÇÃO DE CÓDIGO NO REGISTO */}
        {mode === "register-otp" && (
          <form onSubmit={handleVerifyRegistrationOtp} className="space-y-4 pt-1">
            <div className="p-3 rounded-2xl bg-[#246BFD]/10 border border-[#246BFD]/30 text-xs text-[#246BFD] flex items-center gap-2">
              <Mail size={16} className="shrink-0" />
              <span className="break-all">
                Introduz o código de verificação enviado apenas para concluir o registo de <b>{email}</b>.
              </span>
            </div>

            <div>
              <label className="block text-xs font-bold mb-1.5 text-center" style={{ color: "var(--text-secondary)" }}>
                Código de Verificação
              </label>
              <input
                type="text"
                inputMode="numeric"
                required
                maxLength={8}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                className="w-full p-3.5 rounded-2xl border text-center font-black text-xl tracking-widest bg-transparent outline-none focus:border-[#246BFD]"
                style={{ borderColor: "var(--border)" }}
                autoFocus
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-[48px] py-3 rounded-2xl font-black text-sm text-slate-950 shadow-lg flex items-center justify-center gap-2 cursor-pointer transition-transform active:scale-95 disabled:opacity-50"
              style={{ backgroundColor: "var(--accent)" }}
            >
              <CheckCircle2 size={16} />
              <span>{loading ? "A validar..." : "Confirmar Conta e Entrar"}</span>
            </button>

            <div className="flex items-center justify-between text-xs pt-2">
              <button
                type="button"
                onClick={() => {
                  setMode("register");
                  setError("");
                }}
                className="text-[#246BFD] hover:underline cursor-pointer font-semibold min-h-[44px]"
              >
                Voltar ao registo
              </button>

              <button
                type="button"
                disabled={resendTimer > 0 || loading}
                onClick={handleResendSignupCode}
                className="hover:underline cursor-pointer disabled:opacity-50 font-semibold min-h-[44px]"
                style={{ color: "var(--text-secondary)" }}
              >
                {resendTimer > 0 ? `Reenviar em ${resendTimer}s` : "Reenviar código"}
              </button>
            </div>
          </form>
        )}

        {/* MODO: ESQUECI A PALAVRA-PASSE (PEDIR CÓDIGO POR EMAIL) */}
        {mode === "forgot-email" && (
          <form onSubmit={handleSendRecoveryCode} className="space-y-4 pt-1">
            <div className="p-3 rounded-2xl bg-[#246BFD]/10 border border-[#246BFD]/30 text-xs text-[#246BFD] flex items-center gap-2">
              <KeyRound size={16} className="shrink-0" />
              <span>
                Indica o teu e-mail registado. Vamos enviar um código de recuperação para definires uma nova palavra-passe.
              </span>
            </div>

            <div>
              <label className="block text-xs font-bold mb-1" style={{ color: "var(--text-secondary)" }}>
                Endereço de E-mail
              </label>
              <div
                className="flex items-center gap-2 px-3 min-h-[44px] rounded-xl border"
                style={{ borderColor: "var(--border)", backgroundColor: "var(--surface-secondary)" }}
              >
                <Mail size={15} className="opacity-50 shrink-0" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="exemplo@gmail.com"
                  className="w-full min-w-0 bg-transparent text-xs sm:text-sm outline-none font-medium"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-[48px] py-3 rounded-2xl font-black text-sm text-white shadow-lg flex items-center justify-center gap-2 cursor-pointer transition-transform active:scale-95 disabled:opacity-50"
              style={{ backgroundColor: "var(--primary)" }}
            >
              <span>{loading ? "A enviar código..." : "Enviar Código de Recuperação"}</span>
              <ArrowRight size={16} />
            </button>

            <button
              type="button"
              onClick={() => {
                setMode("login");
                setError("");
              }}
              className="w-full min-h-[44px] text-xs font-bold text-[#246BFD] hover:underline cursor-pointer text-center"
            >
              Voltar ao início de sessão
            </button>
          </form>
        )}

        {/* MODO: DEFINIR NOVA PALAVRA-PASSE COM CÓDIGO */}
        {mode === "forgot-reset" && (
          <form onSubmit={handleConfirmResetPassword} className="space-y-3.5 pt-1">
            <div className="p-3 rounded-2xl bg-[#246BFD]/10 border border-[#246BFD]/30 text-xs text-[#246BFD] flex items-center gap-2">
              <Mail size={16} className="shrink-0" />
              <span className="break-all">
                Introduz o código recebido em <b>{email}</b> e escolhe a tua nova palavra-passe.
              </span>
            </div>

            <div>
              <label className="block text-xs font-bold mb-1" style={{ color: "var(--text-secondary)" }}>
                Código Recebido por E-mail
              </label>
              <input
                type="text"
                inputMode="numeric"
                required
                maxLength={8}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                className="w-full p-3 rounded-2xl border text-center font-black text-lg tracking-widest bg-transparent outline-none focus:border-[#246BFD]"
                style={{ borderColor: "var(--border)" }}
                autoFocus
              />
            </div>

            <div>
              <label className="block text-xs font-bold mb-1" style={{ color: "var(--text-secondary)" }}>
                Nova Palavra-passe (mín. 8 caracteres)
              </label>
              <div
                className="flex items-center gap-2 px-3 min-h-[44px] rounded-xl border"
                style={{ borderColor: "var(--border)", backgroundColor: "var(--surface-secondary)" }}
              >
                <Lock size={15} className="opacity-50 shrink-0" />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Nova palavra-passe"
                  className="w-full min-w-0 bg-transparent text-xs sm:text-sm outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="p-1.5 opacity-60 hover:opacity-100 cursor-pointer"
                  aria-label={showPassword ? "Ocultar palavra-passe" : "Mostrar palavra-passe"}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold mb-1" style={{ color: "var(--text-secondary)" }}>
                Confirmar Nova Palavra-passe
              </label>
              <div
                className="flex items-center gap-2 px-3 min-h-[44px] rounded-xl border"
                style={{ borderColor: "var(--border)", backgroundColor: "var(--surface-secondary)" }}
              >
                <Lock size={15} className="opacity-50 shrink-0" />
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repetir nova palavra-passe"
                  className="w-full min-w-0 bg-transparent text-xs sm:text-sm outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  className="p-1.5 opacity-60 hover:opacity-100 cursor-pointer"
                  aria-label={showConfirmPassword ? "Ocultar confirmação" : "Mostrar confirmação"}
                >
                  {showConfirmPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-[48px] py-3 rounded-2xl font-black text-sm text-slate-950 shadow-lg flex items-center justify-center gap-2 cursor-pointer transition-transform active:scale-95 disabled:opacity-50"
              style={{ backgroundColor: "var(--accent)" }}
            >
              <CheckCircle2 size={16} />
              <span>{loading ? "A guardar..." : "Guardar Nova Palavra-passe"}</span>
            </button>

            <div className="flex items-center justify-between text-xs pt-1">
              <button
                type="button"
                onClick={() => {
                  setMode("login");
                  setError("");
                }}
                className="text-[#246BFD] hover:underline cursor-pointer font-semibold min-h-[44px]"
              >
                Voltar ao login
              </button>
              <button
                type="button"
                disabled={resendTimer > 0 || loading}
                onClick={handleSendRecoveryCode}
                className="hover:underline cursor-pointer disabled:opacity-50 font-semibold min-h-[44px]"
                style={{ color: "var(--text-secondary)" }}
              >
                {resendTimer > 0 ? `Reenviar em ${resendTimer}s` : "Reenviar código"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
