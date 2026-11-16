import { describe, it, expect } from "vitest";
import {
  fmtKz,
  fmtDate,
  fmtDateTime,
  formatUserRole,
  translateErrorMessage,
} from "../utils";

describe("Utilitários de formatação e mensagens em pt-AO", () => {
  it("fmtKz formata valores numéricos e protege contra NaN/undefined/null", () => {
    expect(fmtKz(1500)).toContain("Kz");
    expect(fmtKz(undefined)).toBe("0 Kz");
    expect(fmtKz(null)).toBe("0 Kz");
    expect(fmtKz("abc")).toBe("0 Kz");
    expect(fmtKz(Number.NaN)).toBe("0 Kz");
    expect(fmtKz(-500)).toBe("0 Kz");
    expect(fmtKz(1500)).not.toContain("NaN");
  });

  it("fmtDate e fmtDateTime evitam 'Invalid Date'", () => {
    expect(fmtDate(undefined)).toBe("Hoje");
    expect(fmtDate("data-invalida")).toBe("Hoje");
    expect(fmtDateTime(null)).toBe("Agora");
    expect(fmtDateTime("data-invalida")).toBe("Agora");
    expect(fmtDate("2026-01-15T10:00:00Z")).not.toContain("Invalid");
  });

  it("formatUserRole devolve rótulos amigáveis em Português", () => {
    expect(formatUserRole("admin")).toBe("Administrador");
    expect(formatUserRole("comerciante")).toBe("Comerciante");
    expect(formatUserRole("cliente")).toBe("Cliente");
    expect(formatUserRole(undefined)).toBe("Cliente");
  });

  it("translateErrorMessage converte erros técnicos em mensagens curtas pt-AO", () => {
    expect(translateErrorMessage(new Error("Failed to fetch"))).toBe(
      "Sem ligação. Verifica a internet e tenta novamente."
    );
    expect(translateErrorMessage({ message: "For security purposes, you can only request this after 40 seconds" })).toBe(
      "Muitos pedidos seguidos. Aguarda 60 segundos."
    );
    expect(translateErrorMessage({ message: "Token has expired or is invalid" })).toBe(
      "O código expirou. Pede um novo código."
    );
    expect(translateErrorMessage({ message: "Invalid login credentials" })).toBe(
      "E-mail ou palavra-passe incorretos."
    );
    expect(translateErrorMessage({ message: "Invalid OTP token" })).toBe(
      "Código inválido ou incorreto. Verifica e tenta novamente."
    );
    expect(translateErrorMessage({ message: "new row violates row-level security policy" })).toBe(
      "Sem permissão para esta acção. Inicia sessão novamente."
    );
  });
});
