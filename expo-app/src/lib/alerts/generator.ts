import { executeScraperTool } from "@/lib/scrapers/session-manager";
import { upsertAlerts, type AlertInput } from "@/lib/storage/database";
import type { BillingStandard, BillingAccountStandard } from "../../../../scrapers/myChart/chart/bills/bills";
import type { MedicationsStandard, PrescriptionStandard } from "../../../../scrapers/myChart/chart/medications/medications";
import type { LabResultsStandard, LabOrderStandard } from "../../../../scrapers/myChart/chart/labs/labResults";
import { isOutOfRange } from "./outOfRange";

let inFlight: Promise<{ added: number; skipped: number }> | null = null;

export async function regenerateAlerts(hostname?: string): Promise<{ added: number; skipped: number }> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const inputs: AlertInput[] = [];
    try {
      const bills = (await executeScraperTool("get_billing", { ...(hostname ? { instance: hostname } : {}), mode: "json" })) as BillingStandard;
      inputs.push(...buildBillAlerts(bills.accounts, hostname));
    } catch (err) {
      console.warn("[alerts] get_billing failed:", (err as Error).message);
    }
    try {
      const meds = (await executeScraperTool("get_medications", { ...(hostname ? { instance: hostname } : {}), mode: "json" })) as MedicationsStandard;
      inputs.push(...buildRefillAlerts(meds.prescriptions, hostname));
    } catch (err) {
      console.warn("[alerts] get_medications failed:", (err as Error).message);
    }
    try {
      const labs = (await executeScraperTool("get_lab_results", { ...(hostname ? { instance: hostname } : {}), mode: "json" })) as LabResultsStandard;
      inputs.push(...buildLabAlerts(labs.orders));
    } catch (err) {
      console.warn("[alerts] get_lab_results failed:", (err as Error).message);
    }
    return upsertAlerts(inputs);
  })();
  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

function buildBillAlerts(accounts: BillingAccountStandard[], hostname?: string): AlertInput[] {
  const out: AlertInput[] = [];
  for (const acct of accounts) {
    const payUrl = acct.paymentUrl ?? acct.URLMakePayment;
    for (const v of acct.visits) {
      if (!v.SelfAmountDueRaw || v.SelfAmountDueRaw <= 0) continue;
      const amount = v.SelfAmountDue ?? `$${v.SelfAmountDueRaw.toFixed(2)}`;
      const service = v.Description?.trim() || "Medical visit";
      const date = v.StartDateDisplay?.trim();
      const description = date ? `${amount} for ${service} — ${date}` : `${amount} for ${service}`;
      const fullPayUrl = payUrl ? toAbsoluteUrl(payUrl, hostname ?? acct.guarantorNumber) : null;
      out.push({
        type: "bill",
        title: "Outstanding bill",
        description,
        metadata: {
          amount,
          amount_cents: Math.round(v.SelfAmountDueRaw * 100),
          service,
          service_date: date ?? null,
          patient: acct.patientName,
        },
        cta_label: "Pay bill",
        uses_ai: false,
        action_kind: fullPayUrl ? "open_url" : "ai_chat",
        action_payload: fullPayUrl
          ? { url: fullPayUrl }
          : { prompt: `Help me pay my bill for ${service} (${amount}).` },
        dedup_key: `bill:${acct.guarantorNumber}:${v.HospitalAccountId ?? `${v.StartDateDisplay ?? ""}:${service}`}`,
      });
    }
  }
  return out;
}

function buildRefillAlerts(meds: PrescriptionStandard[], hostname?: string): AlertInput[] {
  const out: AlertInput[] = [];
  for (const m of meds) {
    if (!m.refillDetails?.isRefillable) continue;
    const name = m.name ?? "";
    const drug = m.patientFriendlyName.text?.trim() || name.trim();
    const dose = m.sig?.trim();
    const lastFilled = m.dateToDisplay?.trim();
    const daySupply = m.refillDetails.daySupply?.trim();
    const parts: string[] = [];
    if (dose) parts.push(dose);
    if (daySupply) parts.push(`${daySupply}-day supply`);
    if (lastFilled) parts.push(`last filled ${lastFilled}`);
    const description = parts.length > 0 ? parts.join(" · ") : "Refillable prescription";
    out.push({
      type: "refill",
      title: drug,
      description,
      metadata: {
        medication_name: name,
        common_name: m.patientFriendlyName.text,
        sig: m.sig,
        last_filled: lastFilled ?? null,
        day_supply: daySupply ?? null,
        prescriber: m.authorizingProvider.name ?? m.orderingProvider.name ?? null,
      },
      cta_label: "Request refill",
      uses_ai: false,
      action_kind: "request_refill",
      action_payload: { medication_name: name, instance: hostname },
      dedup_key: `refill:${m.id ?? name}`,
    });
  }
  return out;
}

function buildLabAlerts(orders: LabOrderStandard[]): AlertInput[] {
  const out: AlertInput[] = [];
  for (const order of orders) {
    for (const r of order.results) {
      const flagged = r.resultComponents.filter(isOutOfRange);
      if (flagged.length === 0) continue;
      const summary = flagged.slice(0, 2).map((c) => {
        const name = c.componentInfo.commonName || c.componentInfo.name || "Component";
        const value = c.componentResultInfo.valueText ?? "";
        const units = c.componentInfo.units ?? "";
        return `${name}: ${value}${units ? ` ${units}` : ""}`;
      });
      const date = r.orderMetadata.resultTimestampDisplay?.trim();
      const testName = r.name || order.orderName || "Lab result";
      const description = [summary.join(", "), date ? `(${date})` : null].filter(Boolean).join(" ") || "Out-of-range lab result";
      out.push({
        type: "lab",
        title: `Out of range: ${testName}`,
        description,
        metadata: {
          test_name: testName,
          date: date ?? null,
          provider: r.orderMetadata.orderProviderName ?? null,
          flagged: flagged.map((c) => ({
            name: c.componentInfo.commonName || c.componentInfo.name,
            value: c.componentResultInfo.valueText,
            range: c.componentResultInfo.referenceRange.formattedReferenceRange,
          })),
        },
        cta_label: "Discuss",
        uses_ai: true,
        action_kind: "ai_chat",
        action_payload: {
          prompt: `My recent ${testName} result came back outside its reference range${date ? ` on ${date}` : ""}: ${summary.join(", ")}. What does this mean and should I be concerned?`,
        },
        dedup_key: `lab:${r.key || testName}`,
      });
    }
  }
  return out;
}

function toAbsoluteUrl(maybeRelative: string, hostname: string): string {
  if (/^https?:\/\//i.test(maybeRelative)) return maybeRelative;
  const base = hostname.startsWith("http") ? hostname : `https://${hostname}`;
  const path = maybeRelative.startsWith("/") ? maybeRelative : `/${maybeRelative}`;
  return `${base}${path}`;
}
