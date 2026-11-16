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
} from "lucide-react";
import {
  User,
  UserRole,
  UIGE_MUNICIPALITIES,
  getBairrosByMunicipality,
  getStoredUsers,
  saveUsers,
  saveCurrentUser,
  sendEmailOtp,
  verifyEmailOtp,
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

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  initialMode = "login",
  onSuccess,
  showToast,
}) => {
  const [mode, setMode] = useState<"login" | "register" | "otp">(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
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
      setMode(initialMode);
      setError("");
    }
  }, [isOpen, initialMode]);

  useEffect(() => {
    const validBairros = getBairrosByMunicipality(municipality);
    if (!validBairros.includes(bairro)) {
      setBairro(validBairros[0]);
    }
  }, [municipality]);

  useEffect(() => {
    let timer: any;
    if (resendTimer > 0) {
      timer = setInterval(() => setResendTimer((t) => t - 1), 1000);
    }
    return () => clearInterval(timer);
  }, [resendTimer]);

  if (!isOpen) return null;

  const availableBairros = getBairrosByMunicipality(municipality);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !cleanEmail.includes("@")) {
      setError("Introduz um endereço de e-mail válido.");
      return;
    }

    if (mode === "register") {
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
    }

    setLoading(true);
    try {
      const { error: otpErr } = await sendEmailOtp(
        cleanEmail,
        mode === "register"
          ? {
              nome: name.trim(),
              papel: role,
              provincia: "Uíge",
              municipio: municipality,
              bairro,
              telefone: phone.trim() || undefined,
              bi_numero: role === "entregador" ? biNumber.trim() : undefined,
              reside_uige: resideConfirmed,
            }
          : undefined
      );
      if (otpErr) {
        setError(translateErrorMessage(otpErr, "Não foi possível enviar o código de verificação."));
        return;
      }

      setOtpCode("");
      setMode("otp");
      setResendTimer(60);
      showToast(`Código enviado para ${cleanEmail}`);
    } catch (err: unknown) {
      setError(translateErrorMessage(err, "Sem ligação. Tenta novamente."));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (otpCode.length < 6) {
      setError("O código de verificação deve ter 6 dígitos.");
      return;
    }

    setLoading(true);
    try {
      const cleanEmail = email.trim().toLowerCase();
      const { data, error: verifyErr } = await verifyEmailOtp(cleanEmail, otpCode);

      if (verifyErr) {
        setError(translateErrorMessage(verifyErr, "Código inválido ou expirado. Tenta novamente."));
        return;
      }

      if (isSupabaseConfigured && data?.user) {
        if (name.trim() || phone.trim() || biNumber.trim()) {
          await userRepo.updateProfile(data.user.id, {
            name: name.trim() || undefined,
            phone: phone.trim() || undefined,
            municipality,
            bairro,
            biNumber: biNumber.trim() || undefined,
          });
        }
        const serverProfile = await userRepo.getCurrentUser();
        if (serverProfile) {
          saveCurrentUser(serverProfile);
          onSuccess(serverProfile);
          showToast(
            serverProfile.role !== "cliente" && serverProfile.isApproved === false
              ? "Conta registada! Aguarda aprovação do administrador."
              : `Bem-vindo ao Mercado Uíge, ${(serverProfile.name || "").split(" ")[0] || "Cliente"}!`
          );
          onClose();
          return;
        }
      }

      const users = getStoredUsers();
      let matched = users.find((u) => u.email.toLowerCase() === cleanEmail);

      if (!matched) {
        const safeRole: UserRole =
          role === "comerciante" ? "comerciante" : role === "entregador" ? "entregador" : "cliente";
        const nextNum = String(users.length + 1).padStart(4, "0");
        matched = {
          id: data?.user?.id || `user_${Date.now()}`,
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
      } else {
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
      onSuccess(matched);
      showToast(
        matched.role !== "cliente" && matched.isApproved === false
          ? "Conta registada! Aguarda aprovação do administrador."
          : `Bem-vindo ao Mercado Uíge, ${(matched.name || "").split(" ")[0] || "Cliente"}!`
      );
      onClose();
    } catch (err: unknown) {
      setError(translateErrorMessage(err, "Não foi possível validar o código. Tenta novamente."));
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
        <div className="flex items-center justify-between gap-2 pb-3 border-b mb-4" style={{ borderColor: "var(--border)" }}>
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
                {mode === "otp" && "Confirmar Código"}
              </h2>
              <p className="text-[11px] sm:text-xs truncate" style={{ color: "var(--text-secondary)" }}>
                Acesso seguro por código de 6 dígitos
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full border grid place-items-center hover:bg-slate-500/10 cursor-pointer shrink-0"
            style={{ borderColor: "var(--border)" }}
            aria-label="Fechar janela de acesso"
          >
            <X size={16} />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-2xl bg-red-500/15 border border-red-500/30 text-red-500 text-xs font-bold mb-4 flex items-center gap-2">
            <AlertCircle size={15} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* MODE: LOGIN OR REGISTER */}
        {(mode === "login" || mode === "register") && (
          <form onSubmit={handleSendOtp} className="space-y-3.5">
            <div
              className="flex rounded-2xl p-1 border text-xs font-bold mb-2"
              style={{ borderColor: "var(--border)", backgroundColor: "var(--surface-secondary)" }}
            >
              <button
                type="button"
                onClick={() => {
                  setMode("login");
                  setError("");
                }}
                className={`flex-1 py-1.5 rounded-xl transition-all cursor-pointer ${
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
                className={`flex-1 py-1.5 rounded-xl transition-all cursor-pointer ${
                  mode === "register" ? "bg-[#246BFD] text-white shadow-sm" : "hover:text-[#246BFD]"
                }`}
              >
                Criar Conta
              </button>
            </div>

            {mode === "register" && (
              <>
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
                    className="flex items-center gap-2 px-3 py-2.5 rounded-xl border"
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
                        className={`p-2 rounded-xl text-[11px] sm:text-xs font-bold border transition-colors cursor-pointer text-center ${
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
                      className="w-full p-2.5 rounded-xl border text-xs outline-none cursor-pointer"
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
                      Bairro (Lista Oficial)
                    </label>
                    <select
                      value={bairro}
                      onChange={(e) => setBairro(e.target.value)}
                      className="w-full p-2.5 rounded-xl border text-xs outline-none cursor-pointer"
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
                      className="flex items-center gap-2 px-3 py-2.5 rounded-xl border"
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
                    className="flex items-center gap-2 px-3 py-2.5 rounded-xl border"
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

                <label className="flex items-start gap-2 text-xs cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={resideConfirmed}
                    onChange={(e) => setResideConfirmed(e.target.checked)}
                    className="mt-0.5 shrink-0"
                  />
                  <span className="font-semibold leading-snug">
                    Confirmo que resido na província do Uíge (contas de outras províncias não são permitidas).
                  </span>
                </label>
              </>
            )}

            <div>
              <label className="block text-xs font-bold mb-1" style={{ color: "var(--text-secondary)" }}>
                Endereço de E-mail
              </label>
              <div
                className="flex items-center gap-2 px-3 py-2.5 rounded-xl border"
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
              <p className="text-[11px] mt-1 opacity-70">
                Receberá um código de 6 dígitos no seu e-mail para aceder com segurança.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-2xl font-black text-sm text-white shadow-lg flex items-center justify-center gap-2 cursor-pointer transition-transform active:scale-95 disabled:opacity-50 mt-2"
              style={{ backgroundColor: "var(--primary)" }}
            >
              <span>{loading ? "A enviar código..." : "Enviar Código de Verificação"}</span>
              <ArrowRight size={16} />
            </button>
          </form>
        )}

        {/* MODE: CODE VERIFICATION */}
        {mode === "otp" && (
          <form onSubmit={handleVerifyOtp} className="space-y-4 pt-1">
            <div className="p-3 rounded-2xl bg-[#246BFD]/10 border border-[#246BFD]/30 text-xs text-[#246BFD] flex items-center gap-2">
              <Mail size={16} className="shrink-0" />
              <span className="break-all">
                Introduz o código de 6 dígitos enviado para: <b>{email}</b>
              </span>
            </div>

            <div>
              <label className="block text-xs font-bold mb-1.5 text-center" style={{ color: "var(--text-secondary)" }}>
                Código de 6 Dígitos
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
              className="w-full py-3.5 rounded-2xl font-black text-sm text-slate-950 shadow-lg flex items-center justify-center gap-2 cursor-pointer transition-transform active:scale-95 disabled:opacity-50"
              style={{ backgroundColor: "var(--accent)" }}
            >
              <CheckCircle2 size={16} />
              <span>{loading ? "A validar..." : "Confirmar e Entrar"}</span>
            </button>

            <div className="flex items-center justify-between text-xs pt-2">
              <button
                type="button"
                onClick={() => {
                  setMode("login");
                  setError("");
                }}
                className="text-[#246BFD] hover:underline cursor-pointer font-semibold"
              >
                Alterar e-mail
              </button>

              <button
                type="button"
                disabled={resendTimer > 0 || loading}
                onClick={handleSendOtp}
                className="hover:underline cursor-pointer disabled:opacity-50 font-semibold"
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
