import { beforeEach, describe, expect, test, mock } from "bun:test";
import type { AlertInput } from "@/lib/storage/database";

/**
 * Scripted scraper results, keyed by tool name. Tests set these before
 * calling regenerateAlerts. A value of Error makes the tool throw.
 */
const scraperResults = new Map<string, unknown>();
const scraperCalls: Array<{ tool: string; input: Record<string, unknown> }> = [];
let upserted: AlertInput[] = [];

mock.module("@/lib/scrapers/session-manager", () => ({
  executeScraperTool: async (tool: string, input: Record<string, unknown>) => {
    scraperCalls.push({ tool, input });
    const result = scraperResults.get(tool);
    if (result instanceof Error) throw result;
    if (result === undefined) throw new Error(`no scripted result for ${tool}`);
    return result;
  },
}));

mock.module("@/lib/storage/database", () => ({
  upsertAlerts: async (inputs: AlertInput[]) => {
    upserted = inputs;
    return { added: inputs.length, skipped: 0 };
  },
}));

const { regenerateAlerts } = await import("@/lib/alerts/generator");

const emptyBilling: unknown[] = [];
const emptyMeds = { medications: [] };
const emptyLabs: unknown[] = [];

beforeEach(() => {
  scraperResults.clear();
  scraperCalls.length = 0;
  upserted = [];
  scraperResults.set("get_billing", emptyBilling);
  scraperResults.set("get_medications", emptyMeds);
  scraperResults.set("get_lab_results", emptyLabs);
});

describe("bill alerts", () => {
  const billing = [
    {
      guarantorNumber: "G123",
      patientName: "Homer Simpson",
      billingDetails: {
        Data: {
          URLMakePayment: "/MyChart/Billing/Payment",
          UnifiedVisitList: [
            {
              Index: 0,
              HospitalAccountId: "HA1",
              SelfAmountDueRaw: 125.5,
              SelfAmountDue: "$125.50",
              Description: "Annual physical",
              StartDateDisplay: "1/10/2026",
            },
            // Paid off — must not produce an alert.
            { Index: 1, SelfAmountDueRaw: 0, Description: "Flu shot" },
          ],
          InformationalVisitList: [
            {
              Index: 2,
              SelfAmountDueRaw: 50,
              Description: "",
              StartDateDisplay: "",
            },
          ],
        },
      },
    },
  ];

  test("creates one alert per visit with a balance due", async () => {
    scraperResults.set("get_billing", billing);
    await regenerateAlerts("mychart.example.org");

    const bills = upserted.filter((a) => a.type === "bill");
    expect(bills).toHaveLength(2);

    const [first, second] = bills;
    expect(first.title).toBe("Outstanding bill");
    expect(first.description).toBe("$125.50 for Annual physical — 1/10/2026");
    expect(first.dedup_key).toBe("bill:G123:HA1");
    expect(first.metadata.amount_cents).toBe(12550);
    expect(first.action_kind).toBe("open_url");
    expect(first.action_payload.url).toBe(
      "https://mychart.example.org/MyChart/Billing/Payment",
    );

    // Missing description falls back, missing HospitalAccountId uses Index.
    expect(second.description).toBe("$50.00 for Medical visit");
    expect(second.dedup_key).toBe("bill:G123:2");
  });

  test("falls back to an AI chat action when there is no payment URL", async () => {
    const noUrl = structuredClone(billing);
    noUrl[0].billingDetails.Data.URLMakePayment = undefined as never;
    scraperResults.set("get_billing", noUrl);

    await regenerateAlerts();

    const bill = upserted.find((a) => a.type === "bill");
    expect(bill?.action_kind).toBe("ai_chat");
    expect(bill?.action_payload.prompt).toContain("Annual physical");
  });

  test("keeps absolute payment URLs as-is", async () => {
    const absolute = structuredClone(billing);
    absolute[0].billingDetails.Data.URLMakePayment = "https://pay.example.com/x";
    scraperResults.set("get_billing", absolute);

    await regenerateAlerts("mychart.example.org");

    const bill = upserted.find((a) => a.type === "bill");
    expect(bill?.action_payload.url).toBe("https://pay.example.com/x");
  });
});

describe("refill alerts", () => {
  const meds = {
    medications: [
      {
        name: "Lisinopril 10mg tablet",
        commonName: "Lisinopril",
        medicationKey: "med-1",
        isRefillable: true,
        sig: "Take 1 tablet daily",
        dateToDisplay: "5/1/2026",
        refillDetails: { daySupply: "90" },
        authorizingProviderName: "Julius Hibbert, MD",
      },
      {
        name: "Ibuprofen",
        isRefillable: false,
      },
    ],
  };

  test("creates alerts only for refillable medications", async () => {
    scraperResults.set("get_medications", meds);
    await regenerateAlerts("localhost:4000");

    const refills = upserted.filter((a) => a.type === "refill");
    expect(refills).toHaveLength(1);

    const [refill] = refills;
    expect(refill.title).toBe("Lisinopril");
    expect(refill.description).toBe(
      "Take 1 tablet daily · 90-day supply · last filled 5/1/2026",
    );
    expect(refill.dedup_key).toBe("refill:med-1");
    expect(refill.action_kind).toBe("request_refill");
    expect(refill.action_payload).toEqual({
      medication_name: "Lisinopril 10mg tablet",
      instance: "localhost:4000",
    });
    expect(refill.metadata.prescriber).toBe("Julius Hibbert, MD");
  });

  test("falls back to the raw name and a generic description", async () => {
    scraperResults.set("get_medications", {
      medications: [{ name: "Mystery Med", isRefillable: true }],
    });
    await regenerateAlerts();

    const [refill] = upserted.filter((a) => a.type === "refill");
    expect(refill.title).toBe("Mystery Med");
    expect(refill.description).toBe("Refillable prescription");
    expect(refill.dedup_key).toBe("refill:Mystery Med");
  });
});

describe("lab alerts", () => {
  const labs = [
    {
      orderName: "Lipid Panel",
      results: [
        {
          name: "Lipid Panel",
          key: "lab-1",
          isAbnormal: true,
          orderMetadata: {
            resultTimestampDisplay: "4/20/2026",
            orderProviderName: "Julius Hibbert, MD",
          },
          resultComponents: [
            {
              componentInfo: { commonName: "LDL Cholesterol", units: "mg/dL" },
              componentResultInfo: {
                value: "162",
                abnormalFlagCategoryValue: 2,
                referenceRange: { formattedReferenceRange: "<100" },
              },
            },
            {
              componentInfo: { commonName: "HDL Cholesterol", units: "mg/dL" },
              componentResultInfo: { value: "55", abnormalFlagCategoryValue: 0 },
            },
          ],
        },
        { name: "CBC", isAbnormal: false, resultComponents: [] },
      ],
    },
  ];

  test("creates alerts for abnormal results, summarizing flagged components", async () => {
    scraperResults.set("get_lab_results", labs);
    await regenerateAlerts();

    const labAlerts = upserted.filter((a) => a.type === "lab");
    expect(labAlerts).toHaveLength(1);

    const [alert] = labAlerts;
    expect(alert.title).toBe("Abnormal: Lipid Panel");
    expect(alert.description).toBe("LDL Cholesterol: 162 mg/dL (4/20/2026)");
    expect(alert.dedup_key).toBe("lab:lab-1");
    expect(alert.uses_ai).toBe(true);
    expect(alert.action_kind).toBe("ai_chat");
    expect(alert.action_payload.prompt).toContain("Lipid Panel");
    // Only the flagged component appears in metadata.
    expect(alert.metadata.flagged).toEqual([
      { name: "LDL Cholesterol", value: "162", range: "<100" },
    ]);
  });
});

describe("regenerateAlerts orchestration", () => {
  test("passes the instance hostname to every scraper call", async () => {
    await regenerateAlerts("mychart.example.org");
    expect(scraperCalls.map((c) => c.tool).sort()).toEqual([
      "get_billing",
      "get_lab_results",
      "get_medications",
    ]);
    for (const call of scraperCalls) {
      expect(call.input).toEqual({ instance: "mychart.example.org" });
    }
  });

  test("omits the instance arg when no hostname is given", async () => {
    await regenerateAlerts();
    for (const call of scraperCalls) {
      expect(call.input).toEqual({});
    }
  });

  test("a failing scraper category is skipped, others still produce alerts", async () => {
    scraperResults.set("get_billing", new Error("session expired"));
    scraperResults.set("get_medications", {
      medications: [{ name: "Lisinopril", isRefillable: true }],
    });

    await regenerateAlerts();

    expect(upserted).toHaveLength(1);
    expect(upserted[0].type).toBe("refill");
  });

  test("concurrent calls share one in-flight run", async () => {
    const [a, b] = await Promise.all([regenerateAlerts(), regenerateAlerts()]);
    expect(a).toEqual(b);
    // Three scrapers, called once each — not twice.
    expect(scraperCalls).toHaveLength(3);
  });
});
