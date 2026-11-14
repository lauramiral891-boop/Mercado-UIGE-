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
 * Valida o código de 6 dígitos introduzido pelo utilizador
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

/**
 * Carrega fotografia comprimida (produto, fachada, BI ou comprovativo) para o Supabase Storage
 */
export async function uploadProductImage(file: File | Blob, fileName: string, folder = "produtos") {
  if (!isSupabaseConfigured) {
    return { url: URL.createObjectURL(file), error: null };
  }

  const safeFolder = folder.replace(/[^a-z0-9_-]/gi, "") || "produtos";
  const path = `${safeFolder}/${Date.now()}_${fileName}`;
  const { error } = await supabase.storage
    .from("produtos")
    .upload(path, file, {
      cacheControl: "3600",
      upsert: true,
    });

  if (error) return { url: null, error };

  const { data: publicUrlData } = supabase.storage
    .from("produtos")
    .getPublicUrl(path);

  return { url: publicUrlData.publicUrl, error: null };
}

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
