import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthError } from '@/lib/auth-helpers';
import {
  checkSpendLimit,
  recordCostCents,
  SpendLimitError,
} from '@/lib/ai/usage';
import { computeAnthropicCostCents, forwardToAnthropic } from '@/lib/ai/anthropic';

/**
 * Anthropic Messages API proxy with auth + per-user spend tracking.
 * Body shape mirrors https://docs.anthropic.com/en/api/messages so
 * clients (e.g. the iOS app) can use the full Claude feature set
 * including tools.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    await checkSpendLimit(user.id);

    const body = await req.json();
    if (!body?.model || !Array.isArray(body?.messages)) {
      return NextResponse.json(
        { error: 'model and messages are required' },
        { status: 400 },
      );
    }

    const { status, json } = await forwardToAnthropic(body);
    if (status !== 200) {
      return NextResponse.json(json, { status });
    }

    const response = json as { model?: string; usage?: Parameters<typeof computeAnthropicCostCents>[1] };
    const costCents = computeAnthropicCostCents(response.model ?? body.model, response.usage ?? {});
    const spend = await recordCostCents(user.id, costCents);

    return NextResponse.json({
      ...(json as object),
      _spend: {
        spentCents: spend.spentCents,
        limitCents: spend.limitCents,
        remainingCents: spend.remainingCents,
        period: spend.period,
      },
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof SpendLimitError) {
      return NextResponse.json({ error: err.message, spend: err.spend }, { status: 429 });
    }
    console.error('[ai/messages] Error:', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
