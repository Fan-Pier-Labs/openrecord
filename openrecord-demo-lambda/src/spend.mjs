// Per-user monthly spend ledger for the signed-in tier.
//
// One DynamoDB item per (Google sub × calendar month), atomically incremented
// with the estimated cost of each call. Durable across cold starts, no
// infrastructure beyond a single on-demand table (created by deploy.sh, name
// in SPEND_TABLE).
//
// The AWS SDK v3 ships inside the Lambda Node runtime, so importing it adds
// no package weight — but it isn't installed for local `bun test`, so the
// import is lazy and tests use `createMemorySpendStore()` instead.

// USD per 1M tokens (input, output). Rough list prices — this meters an
// included allowance, it does not bill anyone, so cents-level drift is fine.
const PRICING_PER_MTOK = {
  'gemini-2.5-flash': { input: 0.3, output: 2.5 },
  'gemini-2.5-flash-lite': { input: 0.1, output: 0.4 },
  'gemini-2.5-pro': { input: 1.25, output: 10 },
};

/** Estimated cost of one call in micro-dollars (1e-6 USD). */
export function estimateCostMicros(model, usage) {
  const price = PRICING_PER_MTOK[model] ?? PRICING_PER_MTOK['gemini-2.5-flash'];
  const inputTokens = usage?.promptTokenCount ?? 0;
  const outputTokens = usage?.candidatesTokenCount ?? 0;
  return Math.ceil(inputTokens * price.input + outputTokens * price.output);
}

/** e.g. "2026-08" — the ledger's period key. */
export function monthKey(now = new Date()) {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function ledgerKey(sub, now = new Date()) {
  return `${sub}#${monthKey(now)}`;
}

/** DynamoDB-backed store. `table` in SPEND_TABLE's region. */
export function createDynamoSpendStore(table, region) {
  let clientPromise = null;
  async function client() {
    if (!clientPromise) {
      clientPromise = import('@aws-sdk/client-dynamodb').then((sdk) => ({
        sdk,
        ddb: new sdk.DynamoDBClient({ region }),
      }));
    }
    return clientPromise;
  }

  return {
    /** Micro-dollars spent under this ledger key. */
    async get(key) {
      const { sdk, ddb } = await client();
      const out = await ddb.send(
        new sdk.GetItemCommand({ TableName: table, Key: { pk: { S: key } } })
      );
      return Number(out.Item?.spendMicros?.N ?? 0);
    },
    /** Atomically add to the ledger; returns nothing. */
    async add(key, micros) {
      const { sdk, ddb } = await client();
      await ddb.send(
        new sdk.UpdateItemCommand({
          TableName: table,
          Key: { pk: { S: key } },
          UpdateExpression: 'ADD spendMicros :d',
          ExpressionAttributeValues: { ':d': { N: String(micros) } },
        })
      );
    },
  };
}

/** In-memory store for tests and for running without SPEND_TABLE configured. */
export function createMemorySpendStore() {
  const ledger = new Map();
  return {
    async get(key) {
      return ledger.get(key) ?? 0;
    },
    async add(key, micros) {
      ledger.set(key, (ledger.get(key) ?? 0) + micros);
    },
  };
}
