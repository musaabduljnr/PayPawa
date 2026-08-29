# Smart Electricity — Server Setup & Deployment Guide

This guide walks you through setting up your **Supabase backend**, applying database migrations, configuring Edge Functions, and connecting your **Smart Electricity** Expo application.

---

## 1. Supabase Project Setup

You can deploy the backend using either **Supabase Cloud** (recommended for production) or **Supabase Local CLI** (for local development).

### Option A: Supabase Cloud (Recommended)
1. Go to [database.new](https://database.new) and create a new Supabase project.
2. Choose a project name (e.g. `smart-electricity-prod`) and set a strong database password.
3. Select the closest region (e.g. `Europe (Frankfurt)` or `West US`).
4. Once the project is provisioned, go to **Project Settings → API** to copy:
   - **Project URL** (`https://<project-ref>.supabase.co`)
   - **anon / public key** (`eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`)
   - **service_role secret key** (Keep secret — for Edge Functions only)

---

## 2. Apply Database Schema & Migrations

To apply the complete 10-table schema, RLS policies, triggers, and financial RPCs:

### Method 1: Via Supabase SQL Editor (Fastest)
1. In your Supabase Dashboard, open the **SQL Editor** tab.
2. Open [`supabase/migrations/20260825000001_initial_schema.sql`](file:///c:/Users/Musa%20A.%20Abubakar/Desktop/smart-electricity-app/supabase/migrations/20260825000001_initial_schema.sql) from this repository.
3. Copy the entire SQL script and paste it into the Supabase SQL editor.
4. Click **Run** (or `Ctrl+Enter`).
5. Verify in the **Table Editor** that all 10 tables are present:
   - `profiles`, `wallet_accounts`, `meters`, `meter_verifications`, `payment_attempts`, `wallet_transactions`, `electricity_transactions`, `consumption_records`, `notifications`, `audit_logs`.

### Method 2: Via Supabase CLI
```bash
# Login to Supabase CLI
npx supabase login

# Link your local repo to your remote project
npx supabase link --project-ref <your-project-ref>

# Push the migration to the remote database
npx supabase db push
```

---

## 3. Configure Mobile App Environment Variables

1. Copy `.env.example` to create your local `.env` file:
   ```bash
   cp .env.example .env
   ```
2. Fill in your project keys in `.env`:
   ```ini
   EXPO_PUBLIC_APP_ENV=development
   EXPO_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY=pk_test_xxxxxxxxxxxxxxxxxxxxxxxx
   EXPO_PUBLIC_DEFAULT_CURRENCY=NGN
   EXPO_PUBLIC_SUPPORT_EMAIL=support@smartelectricity.ng
   ```
3. Restart your Expo development server so the new variables are loaded:
   ```bash
   npx expo start -c
   ```

---

## 4. Deploy Supabase Edge Functions (Phase 2 Roadmap)

The backend boundaries for third-party utilities and payment gateways are handled via Supabase Edge Functions:

### Required Edge Functions:
1. **`verify-meter`** (`supabase/functions/verify-meter/index.ts`):
   - Validates meter format and queries DISCO API.
2. **`vend-token`** (`supabase/functions/vend-token/index.ts`):
   - Executes atomic wallet debit RPC, calls VTpass token vending API, and delivers the 20-digit STS token.
3. **`paystack-webhook`** (`supabase/functions/paystack-webhook/index.ts`):
   - Validates Paystack HMAC signature and credits user wallets via the `credit_wallet_from_payment` RPC.

### Setting Server Secrets for Edge Functions:
```bash
npx supabase secrets set \
  PAYSTACK_SECRET_KEY="sk_test_xxxxxxxx" \
  PAYSTACK_WEBHOOK_SECRET="whsec_xxxxxxxx" \
  VTPASS_API_KEY="your_api_key" \
  VTPASS_SECRET_KEY="your_secret_key" \
  VTPASS_PUBLIC_KEY="your_public_key"
```

---

## 5. Verification Checklist

- [ ] Supabase project created.
- [ ] SQL migration `20260825000001_initial_schema.sql` applied with 0 errors.
- [ ] Row Level Security (RLS) active on all 10 tables.
- [ ] `.env` file configured with `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
- [ ] `npx tsc --noEmit` passes with 0 errors.
- [ ] App launches and connects to Supabase auth/data layer.
