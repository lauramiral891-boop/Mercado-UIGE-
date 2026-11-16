import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  supabase,
  validatePasswordPair,
  translateErrorMessage,
  signUpWithPassword,
  verifyRegistrationOtp,
  signInWithPassword,
  sendPasswordResetOtp,
  confirmPasswordResetWithOtp,
} from "../../index";

describe("FASE 1 — Autenticação com Palavra-passe, Registo e Recuperação", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    (globalThis as any).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, String(v)),
      removeItem: (k: string) => store.delete(k),
      clear: () => store.clear(),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("valida palavra-passe mínima de 8 caracteres e coincidência", () => {
    expect(validatePasswordPair("1234567", "1234567")).toContain("pelo menos 8 caracteres");
    expect(validatePasswordPair("segura123", "outra123")).toContain("não coincidem");
    expect(validatePasswordPair("Mercado@2026", "Mercado@2026")).toBeNull();
  });

  it("traduz erros técnicos do Supabase Auth para português de Angola", () => {
    expect(translateErrorMessage("Invalid login credentials")).toBe("E-mail ou palavra-passe incorretos.");
    expect(translateErrorMessage("Email not confirmed")).toContain("Conta ainda não confirmada");
    expect(translateErrorMessage("User already registered")).toContain("Já existe uma conta registada");
    expect(translateErrorMessage("Password should be at least 8 characters")).toContain("pelo menos 8 caracteres");
    expect(
      translateErrorMessage("Password should contain at least one character of each: a-z, A-Z, 0-9")
    ).toContain("maiúsculas, minúsculas, números e símbolos");
    expect(translateErrorMessage("New password should be different from the old password")).toContain(
      "diferente da actual"
    );
  });

  it("rejeita registo fora da província do Uíge ou com palavra-passe curta", async () => {
    const shortRes = await signUpWithPassword("ana@uige.ao", "1234", {
      provincia: "Uíge",
      reside_uige: true,
    });
    expect(shortRes.error?.message).toContain("8 caracteres");

    const luandaRes = await signUpWithPassword("ana@uige.ao", "Mercado@2026", {
      provincia: "Luanda",
      reside_uige: true,
    });
    expect(luandaRes.error?.message).toContain("província do Uíge");
  });

  it("fluxo completo: registo com OTP, login diário sem código e recuperação de palavra-passe", async () => {
    let currentHash = "Mercado@2026";
    const fakeUser = { id: "user-uige-1", email: "joao@uige.ao", identities: [{ id: "id-1" }] } as any;
    const fakeSession = { access_token: "tok", user: fakeUser } as any;

    const signUpSpy = vi.spyOn(supabase.auth, "signUp").mockResolvedValue({
      data: { user: fakeUser, session: null },
      error: null,
    });

    const verifyOtpSpy = vi.spyOn(supabase.auth, "verifyOtp").mockImplementation(async (params: any) => {
      if (params.token !== "123456" && params.token !== "654321") {
        return { data: { user: null, session: null }, error: new Error("Invalid OTP token") as any };
      }
      return { data: { user: fakeUser, session: fakeSession }, error: null };
    });

    const signInSpy = vi
      .spyOn(supabase.auth, "signInWithPassword")
      .mockImplementation(async (creds: any) => {
        if (creds.password !== currentHash) {
          return { data: { user: null, session: null }, error: new Error("Invalid login credentials") as any };
        }
        return { data: { user: fakeUser, session: fakeSession }, error: null };
      });

    const resetEmailSpy = vi.spyOn(supabase.auth, "resetPasswordForEmail").mockResolvedValue({
      data: {},
      error: null,
    });

    const updateUserSpy = vi.spyOn(supabase.auth, "updateUser").mockImplementation(async (attrs: any) => {
      if (attrs.password) currentHash = attrs.password;
      return { data: { user: fakeUser }, error: null };
    });

    // 1. Registo envia signUp com metadados do Uíge
    const signUp = await signUpWithPassword("joao@uige.ao", "Mercado@2026", {
      nome: "João Manuel",
      papel: "cliente",
      provincia: "Uíge",
      municipio: "Uíge",
      bairro: "Centro da Cidade",
      reside_uige: true,
    });
    expect(signUp.error).toBeNull();
    expect(signUpSpy).toHaveBeenCalledTimes(1);

    // 2. Código verificado apenas no registo (type: "signup")
    const otpOk = await verifyRegistrationOtp("joao@uige.ao", "123456");
    expect(otpOk.error).toBeNull();
    expect(verifyOtpSpy).toHaveBeenCalledWith({
      email: "joao@uige.ao",
      token: "123456",
      type: "signup",
    });

    // 3. Login diário directo com signInWithPassword (sem OTP)
    const loginOk = await signInWithPassword("joao@uige.ao", "Mercado@2026");
    expect(loginOk.error).toBeNull();
    expect(signInSpy).toHaveBeenCalledWith({
      email: "joao@uige.ao",
      password: "Mercado@2026",
    });

    // 4. Palavra-passe errada devolve mensagem traduzida
    const loginBad = await signInWithPassword("joao@uige.ao", "errada999");
    expect(loginBad.error).not.toBeNull();
    expect(translateErrorMessage(loginBad.error)).toBe("E-mail ou palavra-passe incorretos.");

    // 5. Recuperação de palavra-passe com código por email + nova palavra-passe
    const resetReq = await sendPasswordResetOtp("joao@uige.ao");
    expect(resetReq.error).toBeNull();
    expect(resetEmailSpy).toHaveBeenCalledWith("joao@uige.ao");

    const resetConfirm = await confirmPasswordResetWithOtp({
      email: "joao@uige.ao",
      token: "654321",
      newPassword: "NovaSenha@2026",
    });
    expect(resetConfirm.error).toBeNull();
    expect(verifyOtpSpy).toHaveBeenCalledWith({
      email: "joao@uige.ao",
      token: "654321",
      type: "recovery",
    });
    expect(updateUserSpy).toHaveBeenCalledWith({ password: "NovaSenha@2026" });

    // 6. Login passa com a nova palavra-passe e rejeita a antiga
    expect((await signInWithPassword("joao@uige.ao", "Mercado@2026")).error).not.toBeNull();
    expect((await signInWithPassword("joao@uige.ao", "NovaSenha@2026")).error).toBeNull();
  });
});
