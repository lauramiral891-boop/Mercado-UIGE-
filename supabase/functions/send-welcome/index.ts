// Supabase Edge Function: send-welcome
// Disparada por Database Webhook quando o email do utilizador é confirmado (auth.users UPDATE ou perfis)
// Idempotente (não envia duas vezes via welcome_sent_at em public.perfis); falhas de envio NÃO bloqueiam o registo.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.119.0";
import nodemailer from "npm:nodemailer@6.9.16";

const SMTP_HOSTNAME = Deno.env.get("SMTP_HOSTNAME") || "smtp.gmail.com";
const SMTP_PORT = Number(Deno.env.get("SMTP_PORT") || 465);
const SMTP_USER = Deno.env.get("SMTP_USER") || "tvvibeoficial@gmail.com";
const SMTP_PASS = Deno.env.get("SMTP_PASS") || "";
const APP_URL = Deno.env.get("APP_URL") || "https://mercadouige.ao";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método não permitido" }), { status: 405 });
  }

  try {
    const payload = await req.json();
    const record = payload.record || payload;
    const oldRecord = payload.old_record || null;

    const userId = record.id;
    const userEmail = (record.email || "").trim().toLowerCase();

    if (!userEmail || !userEmail.includes("@")) {
      return new Response(JSON.stringify({ status: "skipped", reason: "invalid_email" }), { status: 200 });
    }

    // Se o webhook vier de auth.users, só prosseguir após confirmação de e-mail
    if ("email_confirmed_at" in record) {
      if (!record.email_confirmed_at) {
        return new Response(JSON.stringify({ status: "skipped", reason: "email_not_confirmed" }), { status: 200 });
      }
      if (oldRecord && oldRecord.email_confirmed_at) {
        return new Response(JSON.stringify({ status: "skipped", reason: "already_confirmed_previously" }), { status: 200 });
      }
    }

    const supabaseAdmin =
      SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
        ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
        : null;

    // 1. Verificação de Idempotência no servidor: consultar public.perfis.welcome_sent_at
    let resolvedName = (
      record.nome ||
      record.name ||
      record.raw_user_meta_data?.nome ||
      userEmail.split("@")[0] ||
      "Membro"
    ).trim();

    if (record.welcome_sent_at) {
      return new Response(JSON.stringify({ status: "skipped", reason: "already_sent" }), { status: 200 });
    }

    if (supabaseAdmin && userId) {
      const { data: profile } = await supabaseAdmin
        .from("perfis")
        .select("nome, welcome_sent_at")
        .eq("id", userId)
        .maybeSingle();

      if (profile?.welcome_sent_at) {
        return new Response(JSON.stringify({ status: "skipped", reason: "already_sent_db" }), { status: 200 });
      }
      if (profile?.nome) {
        resolvedName = profile.nome.trim();
      }
    }

    const firstName = resolvedName.split(" ")[0];

    // 2. Conteúdo HTML do Email de Boas-vindas (Identidade Visual Mercado Uíge)
    const emailHtml = `
<!DOCTYPE html>
<html lang="pt-AO">
<head>
  <meta charset="UTF-8">
  <title>Bem-vindo ao Mercado Uíge</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #07111F; color: #F8FAFC;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #07111F; padding: 40px 10px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width: 600px; width: 100%; background-color: #172338; border-radius: 24px; border: 1px solid #26354B; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.5);">
          <tr>
            <td style="padding: 35px 30px; text-align: center; background: linear-gradient(135deg, #246BFD 0%, #07111F 100%);">
              <div style="font-size: 26px; font-weight: 900; color: #FFFFFF; letter-spacing: -0.5px;">
                Mercado <span style="color: #B7F34A;">Uíge</span>
              </div>
              <p style="margin: 6px 0 0; font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #B7F34A; font-weight: bold;">
                Província do Uíge • Angola
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 35px 35px 25px;">
              <h1 style="margin: 0 0 16px; font-size: 22px; font-weight: 900; color: #F8FAFC; line-height: 1.3;">
                Olá, ${firstName}! A sua conta está confirmada.
              </h1>
              <p style="margin: 0 0 18px; font-size: 14px; line-height: 1.6; color: #A6B2C5;">
                É com enorme orgulho que lhe damos as boas-vindas ao <b>Mercado Uíge</b>, o ecossistema digital oficial que une compradores, comerciantes e produtores de toda a nossa província.
              </p>
              <div style="background-color: #111D30; border: 1px solid #26354B; border-radius: 16px; padding: 20px; margin-bottom: 24px;">
                <p style="margin: 0 0 8px; font-size: 13px; font-weight: bold; color: #B7F34A;">O que pode fazer agora:</p>
                <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #F8FAFC; line-height: 1.7;">
                  <li>Comprar telemóveis, computadores, moda e produtos frescos com entrega no Uíge e Negage.</li>
                  <li>Abrir a sua loja provincial para vender com pagamentos por Multicaixa Express.</li>
                  <li>Acompanhar as suas encomendas em tempo real, sem intermediários.</li>
                </ul>
              </div>
              <div style="text-align: center; padding: 15px 0;">
                <a href="${APP_URL}"
                   style="display: inline-block; padding: 14px 32px; font-size: 14px; font-weight: 900; color: #07111F; background-color: #B7F34A; text-decoration: none; border-radius: 14px;">
                  Entrar no Mercado Uíge
                </a>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding: 25px 35px; background-color: #111D30; border-top: 1px solid #26354B; text-align: center;">
              <p style="margin: 0; font-size: 11px; color: #64748B;">
                © 2025 Mercado Uíge • Comércio Provincial de Próxima Geração<br>
                Contacto de Apoio: tvvibeoficial@gmail.com • Uíge, Angola
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    // 3. Enviar via SMTP Gmail usando segredos configurados no Supabase
    if (SMTP_PASS) {
      const transporter = nodemailer.createTransport({
        host: SMTP_HOSTNAME,
        port: SMTP_PORT,
        secure: SMTP_PORT === 465,
        auth: {
          user: SMTP_USER,
          pass: SMTP_PASS,
        },
      });

      await transporter.sendMail({
        from: `Mercado Uíge <${SMTP_USER}>`,
        to: userEmail,
        subject: `Bem-vindo ao Mercado Uíge, ${firstName}!`,
        html: emailHtml,
      });

      console.log(`[send-welcome] Email enviado com sucesso para ${userEmail}`);
    } else {
      console.log(`[send-welcome] SMTP_PASS não configurado nos segredos do Supabase. Execução segura sem bloquear registo.`);
    }

    // 4. Actualizar base de dados marcando welcome_sent_at (idempotente)
    if (supabaseAdmin && userId) {
      await supabaseAdmin
        .from("perfis")
        .update({ welcome_sent_at: new Date().toISOString() })
        .eq("id", userId)
        .is("welcome_sent_at", null);
    }

    return new Response(JSON.stringify({ status: "success", email: userEmail }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    // Falhas no envio de email NUNCA bloqueiam o registo do utilizador
    console.error("[send-welcome] Erro ao enviar email (suprimido):", error);
    return new Response(JSON.stringify({ status: "error_suppressed", message: error.message }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  }
});
