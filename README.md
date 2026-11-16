# Mercado Uíge — Arquitectura Monorepo a CUSTO ZERO

> **Comprar • Vender • Conectar na Província do Uíge, Angola**  
> **Identidade Visual:** Azul Eléctrico (`#246BFD`), Azul Profundo (`#07111F`), Verde Tecnológico (`#B7F34A`)  
> **Moeda:** Kwanza (Kz) | **Idioma:** Português de Angola  
> **Remetente e Administrador Principal:** `tvvibeoficial@gmail.com`

---

## 1. Estrutura do Monorepo (Separação Real de Builds)

O projecto está estruturado como um monorepo com builds Vite independentes, garantindo que **nenhuma linha de código, rota ou menu administrativo** entre no bundle Android (`dist/mobile`):

```
mercado-uige/
├── apps/
│   ├── mobile/                          # App Cliente/Vendedor (APK / AAB / PWA) -> dist/mobile
│   │   ├── src/
│   │   │   ├── components/              # Header, BottomNav, ProductCard, Modais
│   │   │   └── App.tsx
│   │   └── vite.config.ts
│   └── admin/                           # Painel Administrativo Web Separado -> dist/admin
│       ├── src/App.tsx
│       └── vite.config.ts
├── packages/
│   └── shared/                          # Pacote partilhado (@mercado-uige/shared)
│       └── src/
│           ├── lib/                     # supabase, imageCompression (≤800 KB), nativePlugins, utils
│           ├── repositories/            # Interfaces, Offline (SyncQueue), Supabase + Testes Vitest
│           └── types/
├── android/                             # Projecto Capacitor Android (ao.mercadouige.app)
│   ├── app/build.gradle                 # R8 (minifyEnabled + shrinkResources) + keystore.properties
│   └── keystore.properties.example      # Modelo de assinatura (ficheiro real fora do Git)
├── scripts/
│   └── verify-mobile-bundle.js          # Auditoria automática de isolamento em dist/mobile
├── supabase/
│   ├── functions/send-welcome/index.ts  # Edge Function gratuita de boas-vindas (idempotente)
│   ├── migrations/
│   │   ├── 20250101_mercado_uige_schema.sql
│   │   ├── 20250102_security_hardening.sql
│   │   ├── 20250103_marketplace_v2_features.sql
│   │   ├── 20250104_whatsapp_orders_and_typed_plans.sql
│   │   └── 20250105_server_price_and_admin_field_locks.sql
│   └── templates/
│       ├── email_verification_otp.html
│       ├── email_recovery_otp.html
│       └── email_welcome.html
└── src/App.tsx                          # Alternador local de desenvolvimento (?app=mobile | ?app=admin)
```

---

## 2. Backend Supabase (Custo Zero) & Segurança RLS

1. Crie um projecto gratuito em [https://supabase.com](https://supabase.com).
2. Copie `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (NUNCA utilize a `service_role key` no cliente).
3. No **SQL Editor** do Supabase, execute os ficheiros pela ordem exacta:
   - `supabase/migrations/20250101_mercado_uige_schema.sql`
   - `supabase/migrations/20250102_security_hardening.sql`
   - `supabase/migrations/20250103_marketplace_v2_features.sql`
   - `supabase/migrations/20250104_whatsapp_orders_and_typed_plans.sql`
   - `supabase/migrations/20250105_server_price_and_admin_field_locks.sql`
4. A segunda migração activa:
   - Função `public.is_admin()` (`SECURITY DEFINER`) para validar privilégios sem recursão RLS.
   - Trigger `trg_prevent_role_escalation` para impedir auto-promoção a `admin` por qualquer cliente da API.
   - Colunas `welcome_sent_at` e `client_mutation_id` (idempotência de emails e fila offline).
   - RPC `delete_user_account()` que elimina definitivamente perfil, lojas, artigos, encomendas, mensagens, fotos no bucket `produtos` e conta `auth.users`.

---

## 3. SMTP Gmail, Templates OTP & Edge Function `send-welcome`

### A. Palavra-passe de Aplicação no Gmail (`tvvibeoficial@gmail.com`)
1. Aceda a [https://myaccount.google.com/security](https://myaccount.google.com/security) e active a **Verificação em 2 passos**.
2. Aceda a **Palavras-passe de aplicações (App passwords)**, crie uma senha com o nome `Mercado Uíge Supabase` e guarde o código de 16 caracteres.

### B. Configuração no Painel do Supabase (Authentication)
1. **SMTP Settings** (`Project Settings > Authentication > SMTP Settings`):
   - **Enable Custom SMTP:** Activado
   - **Sender email:** `tvvibeoficial@gmail.com`
   - **Sender name:** `Mercado Uíge`
   - **Host:** `smtp.gmail.com` | **Port:** `465` (SSL) ou `587` (TLS)
   - **Username:** `tvvibeoficial@gmail.com` | **Password:** *(Palavra-passe de aplicação do Gmail)*
2. **Expiração OTP e Limites** (`Authentication > Providers > Email` e `Rate Limits`):
   - **Email OTP Expiration:** `600` segundos (**10 minutos**)
   - **OTP Length:** `6` dígitos
   - **Rate Limit (Email):** `4` a `10` emails/hora por IP/utilizador (em conjunto com o cooldown de **60s** no cliente)
3. **Templates HTML** (`Authentication > Email Templates`):
   - **Confirm signup / Magic Link:** Cole `supabase/templates/email_verification_otp.html`
   - **Reset password:** Cole `supabase/templates/email_recovery_otp.html`

### C. Deploy da Edge Function `send-welcome` & Database Webhook
```bash
# Definir segredos no painel/CLI do Supabase (nunca no código fonte)
supabase secrets set SMTP_USER=tvvibeoficial@gmail.com SMTP_PASS="SUA_APP_PASSWORD_16_DIGITOS" SMTP_HOSTNAME=smtp.gmail.com SMTP_PORT=465

# Publicar Edge Function gratuita
supabase functions deploy send-welcome
```
No painel do Supabase, vá a **Database > Webhooks > Create a new hook**:
- **Table:** `auth.users` (Event: `UPDATE`, ou `public.perfis` após confirmação)
- **Type:** Supabase Edge Function -> `send-welcome`
- A função verifica `email_confirmed_at` e `perfis.welcome_sent_at`: é **100% idempotente** (nunca envia duas vezes) e qualquer falha SMTP é registada sem bloquear o registo.

---

## 4. Promoção do Administrador Inicial

1. Abra o painel web administrativo (`apps/admin` ou `?app=admin` em desenvolvimento) ou a app e faça o primeiro login/registo com `tvvibeoficial@gmail.com`, validando o código OTP de 6 dígitos enviado por email.
2. Só depois de verificar o e-mail, execute no **SQL Editor** do Supabase:
```sql
UPDATE public.perfis
SET papel = 'admin'
WHERE email = 'tvvibeoficial@gmail.com';
```

---

## 5. Offline-First & Testes Automatizados (Vitest)

```bash
# Executar suite de testes de sincronização offline e idempotência
npm test
```
- Encomendas e mensagens criadas offline são guardadas localmente com `clientMutationId` único na `SyncQueue` e sincronizadas automaticamente em envio único quando a rede regressa.
- Fotografias são comprimidas automaticamente no dispositivo para **≤ 800 KB**.

---

## 6. Compilação, Auditoria de Isolamento & Release Android (.aab)

```bash
# 1. Compilar mobile e admin em builds separados
npm run build

# 2. Verificar que dist/mobile não contém código de administração
npm run verify:mobile-bundle

# 3. Sincronizar assets com Capacitor Android
npm run android:sync
```

### Assinatura e Compilação Android Release (Play Store)
1. Gere a keystore (fora do Git):
```bash
keytool -genkey -v -keystore android/mercado-uige-release.keystore \
  -alias mercado-uige -keyalg RSA -keysize 2048 -validity 10000
```
2. Copie `android/keystore.properties.example` para `android/keystore.properties` (ignorado pelo `.gitignore`) e preencha as palavras-passe.
3. Compile o App Bundle (`.aab`) com R8 (`minifyEnabled true`, `shrinkResources true`):
```bash
npm run build:mobile
npm run android:sync
cd android
./gradlew bundleRelease
```
Ficheiro gerado: `android/app/build/outputs/bundle/release/app-release.aab`.
