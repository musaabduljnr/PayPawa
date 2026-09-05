# Phase 8: AI Energy Intelligence Engine Architecture & Documentation

## 1. System Overview

The **Phase 8 AI Energy Intelligence Engine** transforms deterministic longitudinal consumption analytics (established in Phase 7) into natural-language, mathematically grounded, and explainable energy intelligence.

### Architectural Hierarchy

```text
Database (Authoritative Ledger)
  └── Deterministic Analytics Engine (Phase 7 Math Baseline)
       └── Privacy-Sanitized Context Builder
            └── AI Guardrails & Prompt Injection Protection
                 ├── Primary Provider (Google Gemini Structured JSON)
                 └── Deterministic Fallback Engine (MockAIProvider)
                      └── Structured Response Validation (Anti-Hallucination)
                           └── UI Presentation (Insights Screen Chat & Bento Grid)
```

---

## 2. Core Components

### 2.1 Provider-Agnostic Abstraction Layer
- **`IAIProvider`**: Common contract (`name`, `modelName`, `generateResponse(context, question)`).
- **`GeminiAIProvider`**: Connects to Google Gemini with `responseMimeType: "application/json"` and strict JSON schema generation parameters.
- **`MockAIProvider`**: Purely deterministic rule engine translating mathematical deltas (velocity, median interval, spend shifts, top appliance contributions) into natural language without external network dependencies or hallucination risk.
- **`AIProviderFactory`**: Automatically selects the primary provider from environment variables (`AI_PROVIDER`, `GEMINI_API_KEY`) and guarantees instant fallback to `MockAIProvider` upon timeout or error.

### 2.2 Privacy-Sanitized Context Builder (`EnergyContextBuilder`)
- Enforces strict meter-level scoping (`user_id` + `meter_id`).
- Formats only relevant aggregated metrics (spending totals, cadence intervals, relative appliance loads) and recent transaction timestamps without leaking raw PII or financial credentials.
- Categorizes data lineage and source quality (`STRONG`, `MODERATE`, `BUILDING`, `INSUFFICIENT`).

### 2.3 Comprehensive AI Guardrails (`AIGuardrails`)
- **Prompt Injection Defense**: Filters out adversarial keywords, jailbreak attempts, schema snooping, and SQL queries.
- **Numerical & Appliance Grounding**: Validates that figures cited in the response match the backend context and ensures non-existent appliances (e.g. unowned air conditioners) are never fabricated.
- **Anti-Telemetry Guard**: Forbids false claims of live real-time residential circuit telemetry without hardware IoT meters.
- **Multi-Meter Scoped Cache**: 5-minute TTL cache keyed by composite hash `(userId:meterId:period:question)` to ensure cross-meter isolation.
- **Sliding Window Rate Limiting**: Enforces limits (15 queries/min, 100 queries/day) to prevent abuse and denial of service.

---

## 3. Database Schema & Migration

File: `supabase/migrations/20260829000002_phase8_ai_energy_intelligence.sql`

1. **`ai_conversations`**: Multi-turn sessions scoped to users and meters.
2. **`ai_messages`**: Chat messages storing raw text, structured JSON responses, confidence ratings, and user feedback (`is_helpful`, `feedback_reason`).
3. **`ai_audit_logs`**: Telemetry recording latency, provider, model, token usage, and status.
4. **`ai_rate_limits`**: Sliding window tracker for quota enforcement.
5. **`ai_forecast_accuracy_logs`**: Continuous learning feedback loop comparing predicted recharge intervals with subsequent real purchases.

---

## 4. UI/UX Implementation

File: `src/app/(tabs)/insights.tsx`
- **Dynamic Suggested Questions**: Pills filtered based on real data availability (e.g., questions requiring baseline comparisons are grayed out if previous data does not exist).
- **Conversation Thread**: User queries and assistant responses rendered with distinct visual themes.
- **Structured Evidence Block**: Expandable *"Why this insight?"* drawer exposing underlying mathematical evidence.
- **Optimization Tips**: Actionable energy efficiency recommendations.
- **User Feedback Loop**: 1-tap Helpful / Not Helpful buttons.

---

## 5. Verification & Test Suite

Automated test runner: `scripts/test_phase8_ai_runner.mjs`
- **Groundedness & Numerical Consistency**: ₦20,000 spend verified.
- **Hallucination Resistance**: Verified refrigerator vs unowned AC.
- **Multi-Meter Isolation**: Home (₦20,000) vs Office (₦25,000) verified.
- **Insufficient Data Handling**: 1-purchase meter gracefully handled.
- **Prompt Injection Defense**: Blocked 3 injection attack variations.
- **Hallucination Validator**: Caught false real-time telemetry claim.
- **Rate Limiting Simulation**: Enforced sliding window quota.
- **Scoped Cache**: Verified hit/miss behavior across users and meters.
- **Cross-User Meter Ownership**: Unauthorized foreign meter access dropped.

**Result**: 26/26 tests passed with 0 failures.
