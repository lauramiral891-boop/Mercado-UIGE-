import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { translateErrorMessage } from "./utils";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://placeholder-uige.supabase.co";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "placeholder-anon-key";

export const isSupabaseConfigured = Boolean(
  import.meta.env.VITE_SUPABASE_URL &&
  import.meta.env.VITE_SUPABASE_ANON_KEY &&
  !import.meta.env.VITE_SUPABASE_URL.includes("placeholder")
);

// Cliente inicializado ESTRITAMENTE com a chave anon (RLS enforced no Postgres)
export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: "mu_supabase_auth_session",
  },
});

export interface OtpRegisterMetadata {
  nome?: string;
  papel?: string;
  provincia?: string;
  municipio?: string;
  bairro?: string;
  telefone?: string;
  bi_numero?: string;
  reside_uige?: boolean;
  termos_aceites_em?: string;
}

/**
 * Envia código de 6 dígitos para o e-mail via SMTP do Supabase (registo exclusivo Uíge)
 */
export async function sendEmailOtp(
  email: string,
  metadata?: OtpRegisterMetadata
) {
  if (!isSupabaseConfigured) {
    return { error: null, data: { user: null, session: null } };
  }

  if (metadata?.provincia && metadata.provincia !== "Uíge") {
    return {
      error: new Error("O registo é exclusivo para residentes da província do Uíge."),
      data: { user: null, session: null },
    };
  }

  const cleanEmail = email.trim().toLowerCase();
  const safeRole =
    metadata?.papel === "comerciante"
      ? "comerciante"
      : metadata?.papel === "entregador"
      ? "entregador"
      : "cliente";

  const { data, error } = await supabase.auth.signInWithOtp({
    email: cleanEmail,
    options: {
      shouldCreateUser: true,
      data: metadata
        ? {
            nome: metadata.nome?.trim() || undefined,
            papel: safeRole,
            provincia: "Uíge",
            municipio: metadata.municipio || "Uíge",
            bairro: metadata.bairro || undefined,
            telefone: metadata.telefone?.trim() || undefined,
            bi_numero: metadata.bi_numero?.trim() || undefined,
            reside_uige: metadata.reside_uige ?? true,
          }
        : undefined,
    },
  });

  return { data, error };
}

/**
 * Valida o código de 6 dígitos introduzido pelo utilizador (usado pelo painel admin e fluxos OTP)
 */
export async function verifyEmailOtp(email: string, token: string) {
  if (!isSupabaseConfigured) {
    return { error: null, data: { user: null, session: null } };
  }

  const { data, error } = await supabase.auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: token.trim(),
    type: "email",
  });

  return { data, error };
}

const OFFLINE_CRED_HASHES_KEY = "mu_offline_cred_hashes_v1";

function hashOfflineCredential(email: string, password: string): string {
  const input = `${email.trim().toLowerCase()}::${password}`;
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= ch + ((i + 1) << 3);
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  return `${(h1 >>> 0).toString(16)}_${(h2 >>> 0).toString(16)}`;
}

function getOfflineCredentialHashes(): Record<string, string> {
  try {
    if (typeof localStorage === "undefined") return {};
    return JSON.parse(localStorage.getItem(OFFLINE_CRED_HASHES_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveOfflineCredentialHash(email: string, password: string): void {
  try {
    if (typeof localStorage === "undefined") return;
    const map = getOfflineCredentialHashes();
    map[email.trim().toLowerCase()] = hashOfflineCredential(email, password);
    localStorage.setItem(OFFLINE_CRED_HASHES_KEY, JSON.stringify(map));
  } catch {}
}

/**
 * Registo com email, palavra-passe (mínimo 8) e metadados exclusivos do Uíge.
 * Envia código de confirmação apenas no registo.
 */
export async function signUpWithPassword(
  email: string,
  password: string,
  metadata?: OtpRegisterMetadata
) {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes("@")) {
    return { error: new Error("E-mail inválido. Verifica o endereço."), data: { user: null, session: null } };
  }
  if (!password || password.length < 8) {
    return {
      error: new Error("A palavra-passe deve ter pelo menos 8 caracteres."),
      data: { user: null, session: null },
    };
  }
  if (metadata?.provincia && metadata.provincia !== "Uíge") {
    return {
      error: new Error("O registo é exclusivo para residentes da província do Uíge."),
      data: { user: null, session: null },
    };
  }
  if (metadata && metadata.reside_uige === false) {
    return {
      error: new Error("O registo é exclusivo para residentes da província do Uíge."),
      data: { user: null, session: null },
    };
  }

  if (!isSupabaseConfigured) {
    saveOfflineCredentialHash(cleanEmail, password);
    return { error: null, data: { user: null, session: null } };
  }

  const safeRole =
    metadata?.papel === "comerciante"
      ? "comerciante"
      : metadata?.papel === "entregador"
      ? "entregador"
      : "cliente";

  const { data, error } = await supabase.auth.signUp({
    email: cleanEmail,
    password,
    options: {
      data: {
        nome: metadata?.nome?.trim() || undefined,
        papel: safeRole,
        provincia: "Uíge",
        municipio: metadata?.municipio || "Uíge",
        bairro: metadata?.bairro || undefined,
        telefone: metadata?.telefone?.trim() || undefined,
        bi_numero: metadata?.bi_numero?.trim() || undefined,
        reside_uige: metadata?.reside_uige ?? true,
        termos_aceites_em: metadata?.termos_aceites_em || undefined,
      },
    },
  });

  if (!error && data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    return {
      data,
      error: new Error("User already registered"),
    };
  }

  return { data, error };
}

/**
 * Reenvia código de confirmação de registo por e-mail
 */
export async function resendRegistrationOtp(email: string) {
  const cleanEmail = email.trim().toLowerCase();
  if (!isSupabaseConfigured) {
    return { error: null, data: {} };
  }
  return supabase.auth.resend({
    type: "signup",
    email: cleanEmail,
  });
}

/**
 * Valida o código de verificação enviado no registo (type: "signup")
 */
export async function verifyRegistrationOtp(email: string, token: string) {
  const cleanToken = token.trim();
  if (!cleanToken || cleanToken.length < 6) {
    return {
      error: new Error("O código de verificação deve ter 6 dígitos."),
      data: { user: null, session: null },
    };
  }

  if (!isSupabaseConfigured) {
    return { error: null, data: { user: null, session: null } };
  }

  const { data, error } = await supabase.auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: cleanToken,
    type: "signup",
  });

  return { data, error };
}

/**
 * Login diário directo com email e palavra-passe (sem pedir código OTP)
 */
export async function signInWithPassword(email: string, password: string) {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes("@")) {
    return { error: new Error("E-mail inválido. Verifica o endereço."), data: { user: null, session: null } };
  }
  if (!password) {
    return { error: new Error("Introduz a tua palavra-passe."), data: { user: null, session: null } };
  }

  if (!isSupabaseConfigured) {
    const hashes = getOfflineCredentialHashes();
    const expected = hashes[cleanEmail];
    if (!expected || expected !== hashOfflineCredential(cleanEmail, password)) {
      return {
        error: new Error("Invalid login credentials"),
        data: { user: null, session: null },
      };
    }
    return { error: null, data: { user: null, session: null } };
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: cleanEmail,
    password,
  });

  return { data, error };
}

/**
 * Envia código de recuperação por email para redefinir palavra-passe
 */
export async function sendPasswordResetOtp(email: string) {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes("@")) {
    return { error: new Error("Introduz um endereço de e-mail válido."), data: null };
  }

  if (!isSupabaseConfigured) {
    return { error: null, data: {} };
  }

  const { data, error } = await supabase.auth.resetPasswordForEmail(cleanEmail);
  return { data, error };
}

/**
 * Verifica código de recuperação enviado por email e define nova palavra-passe (mínimo 8)
 */
export async function confirmPasswordResetWithOtp(params: {
  email: string;
  token: string;
  newPassword: string;
}) {
  const cleanEmail = params.email.trim().toLowerCase();
  const cleanToken = params.token.trim();

  if (!cleanToken || cleanToken.length < 6) {
    return { error: new Error("O código de recuperação deve ter 6 dígitos."), data: null };
  }
  if (!params.newPassword || params.newPassword.length < 8) {
    return { error: new Error("A palavra-passe deve ter pelo menos 8 caracteres."), data: null };
  }

  if (!isSupabaseConfigured) {
    saveOfflineCredentialHash(cleanEmail, params.newPassword);
    return { error: null, data: { user: null } };
  }

  const { data: verifyData, error: verifyErr } = await supabase.auth.verifyOtp({
    email: cleanEmail,
    token: cleanToken,
    type: "recovery",
  });

  if (verifyErr) {
    return { data: null, error: verifyErr };
  }

  const { data: updateData, error: updateErr } = await supabase.auth.updateUser({
    password: params.newPassword,
  });

  if (updateErr) {
    return { data: null, error: updateErr };
  }

  return { data: updateData?.user ? updateData : verifyData, error: null };
}


export const MAX_STORAGE_UPLOAD_BYTES = 20 * 1024 * 1024; // 20 MB (bucket 'produtos')

const MIME_TO_EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/webm": "webm",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
};

const EXTENSION_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  webm: "video/webm",
  mp4: "video/mp4",
  mov: "video/quicktime",
};

export function normalizeUploadFileName(
  fileName: string,
  mimeType?: string
): { safeFileName: string; contentType?: string } {
  const normalizedMime = (mimeType || "").split(";")[0].trim().toLowerCase();
  const asciiName = (fileName || "media")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const dotIdx = asciiName.lastIndexOf(".");
  const rawBase = dotIdx > 0 ? asciiName.slice(0, dotIdx) : asciiName;
  const rawExt = dotIdx > 0 ? asciiName.slice(dotIdx + 1).toLowerCase().replace(/[^a-z0-9]/g, "") : "";

  const cleanBase =
    rawBase
      .replace(/[^a-zA-Z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 48) || "media";

  const extFromMime = normalizedMime ? MIME_TO_EXTENSION[normalizedMime] : undefined;
  const finalExt = extFromMime || (rawExt && EXTENSION_TO_MIME[rawExt] ? rawExt : "jpg");
  const contentType =
    (normalizedMime && normalizedMime.includes("/") ? normalizedMime : undefined) ||
    EXTENSION_TO_MIME[finalExt];

  return {
    safeFileName: `${cleanBase}.${finalExt}`,
    contentType,
  };
}

/**
 * Carrega fotografia ou vídeo comprimido (produto, anúncio, fachada, BI ou comprovativo) para o Supabase Storage
 */
export async function uploadProductImage(file: File | Blob, fileName: string, folder = "produtos") {
  if (file.size > MAX_STORAGE_UPLOAD_BYTES) {
    return {
      url: null,
      error: new Error("O ficheiro excede o limite de 20 MB do Storage."),
    };
  }

  if (!isSupabaseConfigured) {
    return { url: URL.createObjectURL(file), error: null };
  }

  const safeFolder = folder.replace(/[^a-z0-9_-]/gi, "") || "produtos";
  const { safeFileName, contentType } = normalizeUploadFileName(fileName, file.type);
  const path = `${safeFolder}/${Date.now()}_${safeFileName}`;
  const { error } = await supabase.storage
    .from("produtos")
    .upload(path, file, {
      cacheControl: "3600",
      upsert: true,
      contentType: contentType || undefined,
    });

  if (error) {
    const rawMsg = String((error as { message?: string }).message || "").toLowerCase();
    if (rawMsg.includes("maximum allowed size") || rawMsg.includes("payload too large") || rawMsg.includes("413")) {
      return {
        url: null,
        error: new Error("O ficheiro excede o limite de 20 MB no Storage do servidor."),
      };
    }
    return { url: null, error };
  }

  const { data: publicUrlData } = supabase.storage
    .from("produtos")
    .getPublicUrl(path);

  return { url: publicUrlData.publicUrl, error: null };
}

export const uploadMediaFile = uploadProductImage;

/**
 * Elimina completamente a conta do utilizador (dados, fotos e registos) no servidor
 */
export async function deleteUserAccountServer(): Promise<{ success: boolean; error: string | null }> {
  if (!isSupabaseConfigured) {
    return { success: true, error: null };
  }

  try {
    const { error } = await supabase.rpc("delete_user_account");
    if (error) {
      return { success: false, error: translateErrorMessage(error, "Não foi possível eliminar a conta.") };
    }
    await supabase.auth.signOut();
    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: translateErrorMessage(err, "Sem ligação. Tenta novamente.") };
  }
}
