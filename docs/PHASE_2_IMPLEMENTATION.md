# Smart Electricity — Phase 2: Authentication, User Profiles & Energy Onboarding

## Overview
Phase 2 turns authentication, profile management, and energy onboarding into a real, server-authoritative system backed by Supabase Auth, PostgreSQL tables with Row Level Security (RLS), and AsyncStorage session restoration in Expo SDK 57 / React Native.

---

## 1. Architecture & Services

### `AuthService` (`src/services/auth.service.ts`)
Authoritative interface to Supabase Auth:
- **`signUp(params)`**: Registers a new user with full name, email, password, phone, and account type (`household` | `business`). Profile row is created automatically via PostgreSQL database trigger.
- **`signIn(params)`**: Authenticates user credentials and issues a persistent JWT session.
- **`signOut()`**: Clears the session and invalidates local tokens.
- **`getProfile(userId)`**: Retrieves the authenticated user's profile row from `public.profiles`.
- **`updateProfile(userId, updates)`**: Persists profile updates (name, phone, account type) to Supabase.
- **`mapAuthError(err)`**: Translates technical Supabase Auth error codes into clean, user-friendly messages.

### `EnergyService` (`src/services/energy.service.ts`)
Handles structured energy profiling and appliance intelligence:
- **`saveCompleteEnergyProfile(userId, profileData, appliances)`**:
  - Upserts property attributes (occupants count, building structure, solar/generator flags) into `public.energy_profiles`.
  - Replaces and inserts structured records in `public.user_appliances`.
  - Sets `onboarding_completed = true` in `public.profiles`.
- **`getEnergyProfile(userId)`**: Fetches property metadata.
- **`getUserAppliances(userId)`**: Fetches all user appliances with quantities, usage frequencies, and calculated daily kWh baselines.
- **`calculateEstimatedDailyKwh(type, qty, freq)`**: Computes baseline estimation for energy planning.

---

## 2. Database Schema & Tables

### `public.profiles`
| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `UUID (PK)` | References `auth.users(id)` ON DELETE CASCADE |
| `full_name` | `TEXT` | User's full name |
| `email` | `TEXT UNIQUE` | User's registered email |
| `phone` | `TEXT` | Contact phone number |
| `account_type` | `TEXT` | `'household'` or `'business'` |
| `onboarding_completed` | `BOOLEAN` | `true` when energy onboarding is finished |
| `created_at` | `TIMESTAMPTZ` | Record creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | Record update timestamp |

### `public.energy_profiles`
| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `UUID (PK)` | Generated UUID |
| `user_id` | `UUID UNIQUE` | Foreign key to `public.profiles(id)` |
| `account_type` | `TEXT` | `'household'` or `'business'` |
| `occupants_count` | `INT` | Number of residents or staff |
| `building_type` | `TEXT` | Structure type (`flat`, `duplex`, `self_contain`, `commercial`) |
| `primary_cooking_source` | `TEXT` | Cooking energy source |
| `has_solar` | `BOOLEAN` | Solar / Inverter backup available |
| `has_generator` | `BOOLEAN` | Generator backup available |
| `created_at` / `updated_at` | `TIMESTAMPTZ` | Timestamps |

### `public.user_appliances`
| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `UUID (PK)` | Generated UUID |
| `user_id` | `UUID` | Foreign key to `public.profiles(id)` |
| `appliance_type` | `TEXT` | Controlled appliance enum |
| `quantity` | `INT` | Number of active units |
| `usage_frequency` | `TEXT` | `'rarely'`, `'occasionally'`, `'daily'`, `'multiple_daily'` |
| `weekly_hours` | `NUMERIC` | Operating hours per week |
| `estimated_daily_kwh` | `NUMERIC` | Calculated baseline daily energy |

---

## 3. Row Level Security (RLS) Policies

All user tables enforce Row Level Security (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`):

1. **`public.profiles`**:
   - `SELECT`: `USING (auth.uid() = id)`
   - `UPDATE`: `USING (auth.uid() = id)`
   - `INSERT`: `WITH CHECK (auth.uid() = id)`
2. **`public.energy_profiles`**:
   - `SELECT`, `INSERT`, `UPDATE`, `DELETE`: `USING (auth.uid() = user_id)`
3. **`public.user_appliances`**:
   - `SELECT`, `INSERT`, `UPDATE`, `DELETE`: `USING (auth.uid() = user_id)`
4. **`public.meters`**:
   - `SELECT`, `INSERT`, `UPDATE`, `DELETE`: `USING (auth.uid() = user_id)`

---

## 4. Navigation & Route Guard Logic

Root routing in `src/app/index.tsx` evaluates server-authoritative session state:

```text
App Launch
    │
    ▼
Check Supabase Session & Profile (AsyncStorage persistence)
    │
    ├─► Session is Null / Logged Out ──► Redirect to /signup
    │
    ├─► Session Valid & onboarding_completed == false ──► Redirect to /onboarding
    │
    └─► Session Valid & onboarding_completed == true ──► Redirect to /(tabs)/home
```

---

## 5. Energy Estimate Disclaimer

As required by regulatory and product guidelines:
> *Appliance energy calculations are strictly presented as baseline estimates to guide usage awareness and do not represent verified real-time IoT meter telemetry.*

---

## 6. Automated Test Suite

Run the automated test suite against Supabase:
```powershell
node scripts/test_phase2_runner.mjs
```

### Verified Test Cases:
1. User A registration & automatic profile provisioning
2. User A authentication & session token validation
3. User A energy profile & structured appliance persistence
4. User A profile editing & server synchronization
5. User B independent registration & session validation
6. **Cross-User RLS Isolation**: Verified User B receives 0 rows when attempting to read or modify User A's profile, energy profile, or appliances
7. Invalid password rejection & session logout validation
