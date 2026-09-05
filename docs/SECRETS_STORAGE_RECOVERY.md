# PayPawa — Secrets & Storage Recovery Architecture

---

## 1. Secrets Management & Disaster Recovery Matrix

| Secret Identifier | Environment | Authorized Owner | Recovery Location | Rotation Window |
|---|---|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Server / Backend | Lead DevOps | Supabase Dashboard (Settings -> API) | 90 Days |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Mobile Client | Mobile Tech Lead | Supabase Dashboard (Settings -> API) | 180 Days |
| `SQUAD_SECRET_KEY` | Server / Backend | Finance / CTO | SquadCo Merchant Portal (API Keys) | 90 Days |
| `EXPO_PUBLIC_SQUAD_BASE_URL` | Client / Server | DevOps | SquadCo VAS Documentation | Static |
| `PAYSTACK_SECRET_KEY` | Server / Backend | Finance Lead | Paystack Dashboard (Settings -> API Keys) | 90 Days |
| `PAYSTACK_WEBHOOK_SECRET` | Server / Backend | Backend Lead | Paystack Dashboard (Webhooks) | 90 Days |
| `EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY`| Mobile Client | Mobile Tech Lead | Paystack Dashboard (API Keys) | 180 Days |
| `GEMINI_API_KEY` | Server / Backend | AI Engineer | Google Cloud Console (AI Studio) | 90 Days |

### Security Constraints:
- **Never Commit Secrets**: Secrets must never be stored in Git repositories, documentation, client bundles, or database rows.
- **Client-Safe vs Server-Only**: Only variables prefixed with `EXPO_PUBLIC_` may exist in client code. Secret keys (`SQUAD_SECRET_KEY`, `PAYSTACK_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) must reside exclusively in server environments (Supabase Edge Functions / backend hosting).

---

## 2. Storage Recovery Architecture

### Storage Buckets & Policies:
1. **`meter-receipts` (Private)**:
   - **Contents**: Meter verification receipts, purchase transaction PDF receipts.
   - **Access**: Private only (`public = false`).
   - **Access Policy**: Authenticated users can only read objects prefixed with their own user ID (`auth.uid() = split_part(name, '/', 1)`).
   - **Signed URLs**: Temporary signed URLs with 15-minute expiration for viewing.
2. **`user-avatars` (Public/Restricted)**:
   - **Contents**: Customer profile pictures.
   - **Access Policy**: Authenticated user can upload to `avatars/{user_id}.jpg`.

### Storage Recovery Procedures:
1. **Orphaned File Detection**:
   - Run audit script checking if `electricity_transactions.metadata->>'receipt_url'` points to valid objects.
2. **Bucket Recreation**:
   - If storage bucket is accidentally deleted:
     ```sql
     INSERT INTO storage.buckets (id, name, public) VALUES ('meter-receipts', 'meter-receipts', false);
     ```
3. **Restoration from Backup**:
   - Restore binary objects from S3/Supabase Storage snapshot archive.
