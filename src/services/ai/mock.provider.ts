import { IAIProvider } from './ai-provider.interface';
import {
  EnergyContext,
  StructuredAIResponse,
  InsightType,
  ConfidenceLevel,
  StructuredInsightsAnalytics,
  AIEngineHealthStatus,
} from '@/types/ai';

/**
 * Deterministic, offline-safe mock AI provider.
 * Uses exact mathematical heuristics from Phase 7 deterministic analytics
 * to generate grounded natural language explanations with zero hallucination risk.
 */
export class MockAIProvider implements IAIProvider {
  readonly name = 'mock';
  readonly modelName = 'deterministic-rules-engine-v1';

  async checkHealth(): Promise<{ status: AIEngineHealthStatus; message: string; latencyMs: number }> {
    return {
      status: 'CONNECTED',
      message: 'Deterministic rules engine online (fallback active).',
      latencyMs: 1,
    };
  }

  async generateAnalytics(context: EnergyContext, requestId = `REQ-${Date.now()}`): Promise<StructuredInsightsAnalytics> {
    const isInsufficient = context.dataQuality.grade === 'INSUFFICIENT' || context.purchasing.totalPurchases <= 1;

    return {
      dataQuality: {
        grade: context.dataQuality.grade,
        sampleSize: context.dataQuality.sampleSize,
        status: context.dataQuality.sampleSize > 0 ? 'ACTUAL' : 'INSUFFICIENT_DATA',
      },
      averageDailyUsage: {
        value: context.consumption.estimatedDailyUnitsKwh,
        unit: 'kWh/day',
        status: context.consumption.estimatedDailyUnitsKwh !== null ? 'AI_CALCULATED' : 'INSUFFICIENT_DATA',
      },
      estimatedDaysRemaining: {
        value: context.purchasing.medianIntervalDays,
        unit: 'days',
        status: context.purchasing.medianIntervalDays !== null ? 'AI_CALCULATED' : 'INSUFFICIENT_DATA',
        rangeText: context.forecast.estimatedDaysRemainingRange || undefined,
      },
      sevenDaySpend: {
        value: context.spending.currentPeriodSpendNaira,
        currency: 'NGN',
        status: 'ACTUAL',
      },
      periodSpend: {
        value: context.spending.currentPeriodSpendNaira,
        currency: 'NGN',
        status: 'ACTUAL',
      },
      unitsVended: {
        value: context.consumption.totalUnitsKwh,
        unit: 'kWh',
        status: context.consumption.totalUnitsKwh !== null ? 'ACTUAL' : 'UNAVAILABLE',
      },
      purchaseFrequency: {
        value: context.purchasing.totalPurchases,
        unit: 'purchases',
        status: 'ACTUAL',
      },
      purchaseCadence: {
        value: context.purchasing.medianIntervalDays,
        unit: 'days',
        status: context.purchasing.medianIntervalDays !== null ? 'AI_CALCULATED' : 'INSUFFICIENT_DATA',
        rangeText: context.purchasing.purchaseVelocity,
      },
      consumptionTrend: {
        direction: context.spending.direction,
        percentageChange: context.spending.percentageChange,
        status: context.spending.hasPreviousBaseline ? 'AI_CALCULATED' : 'INSUFFICIENT_DATA',
      },
      confidence: isInsufficient ? 'INSUFFICIENT_DATA' : context.dataQuality.grade === 'STRONG' ? 'HIGH' : 'MEDIUM',
      explanation: isInsufficient
        ? 'Insufficient purchase history on this meter to establish an authoritative cadence pattern.'
        : `Electricity purchase cadence is steady, recurring ${context.purchasing.purchaseVelocity}.`,
      insights: isInsufficient
        ? ['Record 2 or more electricity purchases to unlock cadence and burn rate projections.']
        : [
            `Median recharge interval is ~${context.purchasing.medianIntervalDays} days.`,
            `Total recorded spending in period is ₦${context.spending.currentPeriodSpendNaira.toLocaleString()}.`,
          ],
      recommendations: [
        'Keep recharge intervals consistent for optimal forecasting precision.',
        'Review major household appliances in your Energy Profile to estimate load drivers.',
      ],
      limitations: [
        'Calculated from authoritative platform transactions and user-reported profile data.',
      ],
      metadata: {
        requestId,
        provider: this.name,
        model: this.modelName,
        calculatedAt: new Date().toISOString(),
        latencyMs: 2,
        isAiCalculated: false,
      },
    };
  }

  async generateResponse(
    context: EnergyContext,
    question: string,
    history?: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<StructuredAIResponse> {
    const qLower = question.toLowerCase().trim();

    // 1. INSUFFICIENT DATA CHECK
    if (context.dataQuality.grade === 'INSUFFICIENT' || context.purchasing.totalPurchases <= 1) {
      return {
        answer:
          "I don't have enough electricity transaction history on this meter yet to provide a reliable pattern analysis. As you complete a few more token purchases, I will build an accurate consumption cadence for you.",
        insightType: 'INSUFFICIENT_DATA',
        confidence: 'INSUFFICIENT_DATA',
        evidence: [
          `Only ${context.purchasing.totalPurchases} electricity purchase recorded on this meter.`,
          'At least 2 to 3 purchases are required to calculate purchase interval cadence.',
        ],
        recommendations: [
          'Continue recharging your meter through the app to establish a consumption baseline.',
          'Add your major home appliances to your energy profile to estimate potential heavy-load areas.',
        ],
        limitations: [
          'No historical interval delta can be computed from a single purchase.',
          'Real-time physical meter telemetry is not available without IoT sensors.',
        ],
        isGroundTruthGrounded: true,
        dataQualityGrade: context.dataQuality.grade,
      };
    }

    // 2. "WHY DID ELECTRICITY FINISH FASTER?" / CADENCE QUESTIONS
    if (
      qLower.includes('finish faster') ||
      qLower.includes('faster') ||
      qLower.includes('run out') ||
      qLower.includes('finished quickly')
    ) {
      const isFaster = context.spending.direction === 'INCREASING' || (context.purchasing.shortestIntervalDays !== null && (context.purchasing.shortestIntervalDays < (context.purchasing.medianIntervalDays || 0)));
      const medianInt = context.purchasing.medianIntervalDays;
      const avgInt = context.purchasing.averageIntervalDays;
      const velocityText = context.purchasing.purchaseVelocity || `every ~${medianInt} days`;

      let answer = '';
      const evidence: string[] = [];
      const recommendations: string[] = [];

      if (isFaster) {
        answer = `Your recent electricity purchases have been occurring more frequently, with a current cadence of ${velocityText}. Compared to your typical interval of ~${avgInt || medianInt} days, your tokens appear to be depleting faster between recharges.`;
        evidence.push(`Recent purchase interval narrowed to ~${medianInt} days.`);
        if (context.spending.hasPreviousBaseline && context.spending.percentageChange > 0) {
          evidence.push(`Spending increased by +${context.spending.percentageChange}% over the previous period.`);
        }
      } else {
        answer = `Your electricity purchase cadence is currently steady at ${velocityText}. Based on your historical ledger, we have not detected an abnormal acceleration in your recharge intervals.`;
        evidence.push(`Median purchase interval is ~${medianInt} days across ${context.purchasing.totalPurchases} purchases.`);
      }

      if (context.appliances.items.length > 0) {
        const topApp = context.appliances.items[0];
        recommendations.push(
          `Review runtime on high-load equipment such as your ${topApp.name} (~${topApp.relativeContributionPct}% of estimated load).`
        );
      } else {
        recommendations.push('Add appliances to your Energy Profile to estimate which devices may be driving higher loads.');
      }
      recommendations.push('Ensure heavy appliances like water heaters and electric cookers are turned off when not in active use.');

      return {
        answer,
        insightType: 'PURCHASE_PATTERN',
        confidence: context.dataQuality.grade === 'STRONG' ? 'HIGH' : 'MEDIUM',
        evidence,
        recommendations,
        limitations: [
          'Calculated from transaction purchase frequency, not real-time sub-metered circuit telemetry.',
          'Load decomposition relies on self-reported appliance wattage and hours.',
        ],
        isGroundTruthGrounded: true,
        dataQualityGrade: context.dataQuality.grade,
      };
    }

    // 3. "HOW MUCH AM I SPENDING?" / MONTHLY SPEND
    if (
      qLower.includes('how much') ||
      qLower.includes('spending') ||
      qLower.includes('monthly spend') ||
      qLower.includes('cost per month')
    ) {
      const currSpend = context.spending.currentPeriodSpendNaira;
      const formattedSpend = `₦${currSpend.toLocaleString()}`;
      const changeText = context.spending.hasPreviousBaseline
        ? `${context.spending.percentageChange > 0 ? '+' : ''}${context.spending.percentageChange}% compared to the prior period`
        : 'with no prior baseline available for comparison';

      return {
        answer: `Your recorded electricity spending for the current period is ${formattedSpend} (${changeText}).`,
        insightType: 'SPENDING_SUMMARY',
        confidence: 'HIGH',
        evidence: [
          `Current period spend: ${formattedSpend} from ${context.purchasing.totalPurchases} verified transactions.`,
          context.spending.hasPreviousBaseline
            ? `Previous period baseline: ₦${context.spending.previousPeriodSpendNaira.toLocaleString()}.`
            : 'Initial baseline period established.',
        ],
        recommendations: [
          'Set a monthly electricity budget in your wallet to monitor cadence variance.',
          'Consider grouping recharges to optimize transaction tracking.',
        ],
        limitations: [
          'Reflects verified transaction spending on this specific meter.',
        ],
        isGroundTruthGrounded: true,
        dataQualityGrade: context.dataQuality.grade,
      };
    }

    // 4. "WHAT CHANGED COMPARED TO LAST MONTH?" / PERIOD COMPARISON
    if (
      qLower.includes('what changed') ||
      qLower.includes('compare') ||
      qLower.includes('last month') ||
      qLower.includes('difference')
    ) {
      const spendChange = context.spending.percentageChange;
      const hasBaseline = context.spending.hasPreviousBaseline;
      const currSpend = `₦${context.spending.currentPeriodSpendNaira.toLocaleString()}`;
      const prevSpend = `₦${context.spending.previousPeriodSpendNaira.toLocaleString()}`;

      let answer = '';
      if (!hasBaseline) {
        answer = `You spent ${currSpend} in the current period. We do not have sufficient previous-period transaction history on this meter to calculate a historical comparison yet.`;
      } else if (spendChange > 0) {
        answer = `Your electricity spending increased by +${spendChange}% this period (${currSpend} vs ${prevSpend} previously).`;
      } else if (spendChange < 0) {
        answer = `Your electricity spending decreased by ${spendChange}% this period (${currSpend} vs ${prevSpend} previously).`;
      } else {
        answer = `Your electricity spending remained virtually unchanged at ${currSpend} across both periods.`;
      }

      return {
        answer,
        insightType: 'SPENDING_CHANGE',
        confidence: hasBaseline ? 'HIGH' : 'LOW',
        evidence: [
          `Current period: ${currSpend}`,
          hasBaseline ? `Prior period: ${prevSpend}` : 'No previous baseline on record',
          `Purchase interval: ~${context.purchasing.medianIntervalDays} days`,
        ],
        recommendations: [
          'Monitor weekly recharge frequency to keep monthly expenditure predictable.',
          'Check if seasonal weather (heat/humidity) caused longer AC or fan running hours.',
        ],
        limitations: [
          'Comparative metrics require continuous multi-period transaction history.',
        ],
        isGroundTruthGrounded: true,
        dataQualityGrade: context.dataQuality.grade,
      };
    }

    // 5. "WHICH APPLIANCE USES THE MOST?" / APPLIANCE BREAKDOWN
    if (
      qLower.includes('appliance') ||
      qLower.includes('consuming the most') ||
      qLower.includes('which device') ||
      qLower.includes('uses the most')
    ) {
      if (!context.appliances.items || context.appliances.items.length === 0) {
        return {
          answer:
            "You haven't added appliances to your Energy Profile yet. Adding your household or business devices allows me to estimate which appliances account for the largest proportion of your energy bill.",
          insightType: 'APPLIANCE_INSIGHT',
          confidence: 'LOW',
          evidence: ['0 appliances registered in user energy profile.'],
          recommendations: [
            'Go to Profile > Energy Setup to add appliances, power ratings, and daily operating hours.',
          ],
          limitations: [
            'Appliance loads cannot be inferred without user-provided equipment details.',
          ],
          isGroundTruthGrounded: true,
          dataQualityGrade: context.dataQuality.grade,
        };
      }

      const sorted = [...context.appliances.items].sort(
        (a, b) => b.relativeContributionPct - a.relativeContributionPct
      );
      const topApp = sorted[0];
      const secondApp = sorted.length > 1 ? sorted[1] : null;

      const answer = `Based on your self-reported profile, your ${topApp.name} (${topApp.estimatedWattage}W, ~${topApp.dailyUsageHours}h/day) is estimated to be your largest load, accounting for approximately ${topApp.relativeContributionPct}% of estimated daily consumption.${
        secondApp ? ` Your ${secondApp.name} is second at ~${secondApp.relativeContributionPct}%.` : ''
      }`;

      return {
        answer,
        insightType: 'APPLIANCE_INSIGHT',
        confidence: 'MEDIUM',
        evidence: [
          `${topApp.name}: ~${topApp.estimatedDailyKwh} kWh/day (${topApp.relativeContributionPct}% of self-reported profile).`,
          secondApp
            ? `${secondApp.name}: ~${secondApp.estimatedDailyKwh} kWh/day (${secondApp.relativeContributionPct}%).`
            : 'Single dominant appliance profile.',
        ],
        recommendations: [
          `Manage operating duration of high-wattage equipment (${topApp.name}).`,
          'Use smart timers or turn off cooling/heating equipment when rooms are unoccupied.',
        ],
        limitations: [
          'Calculated from user-entered wattage and daily usage duration. Actual load sub-metering requires IoT telemetry.',
        ],
        isGroundTruthGrounded: true,
        dataQualityGrade: context.dataQuality.grade,
      };
    }

    // 6. "WHEN WILL I NEED ANOTHER TOKEN?" / FORECAST
    if (
      qLower.includes('when') ||
      qLower.includes('next token') ||
      qLower.includes('need another') ||
      qLower.includes('recharge') ||
      qLower.includes('days left')
    ) {
      const range = context.forecast.estimatedDaysRemainingRange;
      const conf = context.forecast.confidence === 'HIGH' ? 'HIGH' : 'MEDIUM';

      return {
        answer: `Based on your historical recharge cadence of every ~${context.purchasing.medianIntervalDays} days, you will likely need your next electricity token in ${range}.`,
        insightType: 'FORECAST',
        confidence: conf,
        evidence: [
          `Median interval: ~${context.purchasing.medianIntervalDays} days across ${context.purchasing.totalPurchases} purchases.`,
          `Confidence rating: ${context.forecast.confidence}.`,
        ],
        recommendations: [
          'Keep funds in your Smart Electricity wallet to enable 1-tap instant token vending when due.',
          'Consider recharging slightly before the projected window to ensure uninterrupted power.',
        ],
        limitations: [
          'Projected from statistical purchase intervals. Unforeseen high appliance usage or long travel will alter the exact exhaustion point.',
          'Exact live token balances cannot be polled from residential meters without smart telemetry.',
        ],
        isGroundTruthGrounded: true,
        dataQualityGrade: context.dataQuality.grade,
      };
    }

    // 7. "HOW CAN I REDUCE MY ELECTRICITY COST?" / COST OPTIMIZATION
    if (
      qLower.includes('reduce') ||
      qLower.includes('save') ||
      qLower.includes('lower') ||
      qLower.includes('cut cost') ||
      qLower.includes('optimize')
    ) {
      const recs: string[] = [];
      if (context.appliances.items.length > 0) {
        const topApp = context.appliances.items[0];
        recs.push(`Optimize runtime for your ${topApp.name} (estimated at ~${topApp.relativeContributionPct}% of usage).`);
      }
      recs.push('Unplug appliances on standby mode — transformers and idle TVs draw continuous phantom load.');
      recs.push('Switch remaining incandescent or fluorescent bulbs to high-efficiency LED lighting.');
      recs.push('Ensure air conditioner filters are cleaned regularly to maintain compressor efficiency.');

      return {
        answer:
          'To reduce your electricity expenditure safely, focus on your highest-wattage continuous loads, eliminate standby phantom draw, and align usage duration with actual need.',
        insightType: 'COST_REDUCTION',
        confidence: 'HIGH',
        evidence: [
          `Current period spend: ₦${context.spending.currentPeriodSpendNaira.toLocaleString()}`,
          `Purchase interval: ~${context.purchasing.medianIntervalDays} days`,
        ],
        recommendations: recs,
        limitations: [
          'Estimates do not guarantee exact percentage bill reductions; individual savings depend on real user habit changes.',
          'Never attempt electrical wiring modifications or meter tampering.',
        ],
        isGroundTruthGrounded: true,
        dataQualityGrade: context.dataQuality.grade,
      };
    }

    // 8. GENERAL ENERGY INQUIRY
    return {
      answer: `Here is an overview of your energy intelligence for ${context.meter.name || 'your meter'}: You have recorded ${context.purchasing.totalPurchases} purchases with a median recharge cadence of ~${context.purchasing.medianIntervalDays} days, and current period spending of ₦${context.spending.currentPeriodSpendNaira.toLocaleString()}.`,
      insightType: 'GENERAL_ENERGY',
      confidence: 'MEDIUM',
      evidence: [
        `Meter: ${context.meter.name || 'Default'} (${context.meter.discoName || 'DisCo'})`,
        `Spending: ₦${context.spending.currentPeriodSpendNaira.toLocaleString()}`,
        `Cadence: ~${context.purchasing.medianIntervalDays} days`,
      ],
      recommendations: [
        'Ask about your spending breakdown, purchase cadence, or appliance contributions for deeper insights.',
      ],
      limitations: [
        'Grounded on verified platform purchases and self-reported profile data.',
      ],
      isGroundTruthGrounded: true,
      dataQualityGrade: context.dataQuality.grade,
    };
  }
}
