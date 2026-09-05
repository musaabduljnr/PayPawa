# Phase 7: Consumption Intelligence Engine Architecture & Documentation

## 1. Overview & Core Principles

The **Consumption Intelligence Engine** transforms longitudinal electricity purchase records into an authoritative, explainable, and trustworthy energy analytics system.

### Non-Negotiable Tenets
1. **Honest Data Lineage**: Every data point is tagged with its precise provenance (`PROVIDER`, `USER_REPORTED`, `METER`, `IOT`, `ESTIMATED`, `INFERRED`, `UNAVAILABLE`).
2. **Zero Fabricated Precision**: Missing units from distribution companies (DisCos) are **never** filled with hardcoded calculations (e.g. `₦206.8/kWh` or `₦235.3/kWh`). Missing values remain `UNAVAILABLE` and analytics degrade gracefully.
3. **Statistical Robustness**:
   - Outliers and irregular bursts are insulated using **median** purchase intervals rather than sensitive arithmetic means.
   - Zero-baseline periods (e.g. `₦0` previous spend) are safely reported with `hasPreviousBaseline: false` without triggering `Infinity%` or `NaN`.
4. **Multi-Meter Isolation**: Consumption ledgers, intervals, and cadence predictions are strictly partitioned per meter (`meter_id`).
5. **Human-in-the-Loop Ground Truth**: Users can record cumulative meter readings directly from their physical meter displays, with automatic drop/jump anomaly detection.

---

## 2. Architecture & Data Model

```
┌───────────────────────────┐      ┌─────────────────────────────┐
│  Electricity Transactions │      │   Physical Meter Readings   │
│  (Authoritative Billing)  │      │   (Cumulative kWh Display)  │
└─────────────┬─────────────┘      └──────────────┬──────────────┘
              │                                   │
              ▼                                   ▼
┌────────────────────────────────────────────────────────────────┐
│               Consumption Intelligence Engine                  │
│  - Interval Statistics (Mean, Median, Min, Max, Velocity)      │
│  - Zero-Baseline Safe Period Comparisons                       │
│  - Anomaly & Rollover Validation                               │
│  - Data Quality Grading (INSUFFICIENT, LIMITED, GOOD, STRONG)  │
│  - Explainable Rule-Based Insights                             │
└───────────────────────────────┬────────────────────────────────┘
                                │
                                ▼
┌────────────────────────────────────────────────────────────────┐
│                 Client-Side & Mobile Presentation              │
│  - Scoped by Active Meter                                      │
│  - Explicit [ACTUAL] vs [ESTIMATED] Visual Badges              │
│  - Purchase Cadence Bézier Line Graph                          │
│  - Self-Reported Appliance Breakdown with Honest Caveats       │
└────────────────────────────────────────────────────────────────┘
```

---

## 3. Data Source Lineage Types

| Source Type | Meaning | Trust Level | Example Usage |
| :--- | :--- | :--- | :--- |
| `PROVIDER` | Authoritative units returned directly by DisCo API | 100% | VTpass transaction response |
| `USER_REPORTED` | Cumulative reading manually logged by customer from physical meter | 95% | Meter display entry |
| `METER` | Direct digital reading from smart meter hardware | 99% | Smart meter pulse counter |
| `IOT` | Telemetry from home energy monitor / smart plug | 90% | Circuit breaker clamp |
| `ESTIMATED` | Statistical interval & payment cadence projections | 60%–80% | Days remaining forecast |
| `INFERRED` | Mathematical deduction from tariff codes and appliance surveys | 50%–70% | Appliance load percentage |
| `UNAVAILABLE` | Explicit missing state when upstream provider omits unit count | N/A | Gracefully degraded cards |

---

## 4. Anomaly Detection Rules for Meter Readings

When a user submits a cumulative meter reading $R_t$ at timestamp $t$:
1. **Drop Detection**: If $R_t < R_{t-1}$, the reading is flagged as `isAnomalous: true` with reason `"Reading lower than previous reading. Possible rollover or typo."` and no negative consumption is calculated.
2. **Extreme Jump Detection**: If $R_t - R_{t-1} > 5,000\text{ kWh}$, the reading is flagged for user verification.
3. **Future Date & Sign Validation**: $R_t \ge 0$ and $t \le \text{now()}$.

---

## 5. Automated Verification Results

The automated test suite in [`scripts/test_phase7_runner.mjs`](file:///c:/Users/Musa%20A.%20Abubakar/Desktop/smart-electricity-app/scripts/test_phase7_runner.mjs) validates all 6 critical dimensions:
- **Test 1: Unit Source Classification**: Preserves exact DisCo units; records `null` without hardcoded math.
- **Test 2: Purchase Interval & Cadence**: Accurate median and mean calculation across historical purchases.
- **Test 3: Zero-Baseline Safety**: Handles `₦0` previous period safely.
- **Test 4: Manual Meter Readings & Anomaly Detection**: Correct delta extraction and drop detection.
- **Test 5: Multi-Meter Isolation**: Strict partition between Home and Office meters.
- **Test 6: Data Quality Grading**: Deterministic grading (`INSUFFICIENT` $\to$ `STRONG`).
