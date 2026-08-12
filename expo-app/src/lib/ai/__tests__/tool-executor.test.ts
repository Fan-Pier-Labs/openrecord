import { beforeEach, describe, expect, test, mock } from "bun:test";

/**
 * Captured Alert.alert invocations. Tests choose which button to "press"
 * via nextAlertAction before triggering a write tool.
 */
type AlertButton = { text: string; style?: string; onPress?: () => void };
let alertCalls: Array<{ title: string; message: string; buttons: AlertButton[] }> = [];
let nextAlertAction: "send" | "cancel" | "dismiss" = "send";

mock.module("react-native", () => ({
  Alert: {
    alert: (
      title: string,
      message: string,
      buttons: AlertButton[],
      options?: { onDismiss?: () => void },
    ) => {
      alertCalls.push({ title, message, buttons });
      if (nextAlertAction === "dismiss") {
        options?.onDismiss?.();
        return;
      }
      const wanted = nextAlertAction === "cancel" ? "Cancel" : "Send";
      buttons.find((b) => b.text === wanted)?.onPress?.();
    },
  },
}));

const scraperCalls: Array<{ tool: string; input: Record<string, unknown> }> = [];
let scraperResult: unknown = { ok: true };

mock.module("@/lib/scrapers/session-manager", () => ({
  executeScraperTool: async (tool: string, input: Record<string, unknown>) => {
    scraperCalls.push({ tool, input });
    if (scraperResult instanceof Error) throw scraperResult;
    return scraperResult;
  },
}));

const { executeLocalTool } = await import("@/lib/ai/tool-executor");

beforeEach(() => {
  alertCalls = [];
  scraperCalls.length = 0;
  scraperResult = { ok: true };
  nextAlertAction = "send";
});

describe("read tools", () => {
  test("run without any confirmation prompt", async () => {
    scraperResult = { medications: ["Lisinopril"] };
    const result = await executeLocalTool("get_medications", {});
    expect(alertCalls).toHaveLength(0);
    expect(scraperCalls).toEqual([{ tool: "get_medications", input: {} }]);
    expect(JSON.parse(result)).toEqual({ medications: ["Lisinopril"] });
  });

  test("scraper failures come back as an error payload, not a throw", async () => {
    scraperResult = new Error("session expired");
    const result = await executeLocalTool("get_billing", {});
    expect(JSON.parse(result)).toEqual({
      error: "Failed to execute get_billing: session expired",
    });
  });
});

describe("write tools", () => {
  const input = {
    recipient_name: "Billing Department",
    subject: "Itemized bill",
    message_body: "Please send an itemized statement.",
    instance: "localhost:4000",
  };

  test("prompt for confirmation and execute when the user confirms", async () => {
    nextAlertAction = "send";
    const result = await executeLocalTool("send_message", input);

    expect(alertCalls).toHaveLength(1);
    expect(alertCalls[0].title).toBe("Confirm: Send Message");
    // The exact payload is shown to the user — minus the instance plumbing.
    expect(alertCalls[0].message).toContain("Please send an itemized statement.");
    expect(alertCalls[0].message).not.toContain("localhost:4000");

    expect(scraperCalls).toEqual([{ tool: "send_message", input }]);
    expect(JSON.parse(result)).toEqual({ ok: true });
  });

  test("cancelling skips execution and tells the model not to retry", async () => {
    nextAlertAction = "cancel";
    const result = await executeLocalTool("request_refill", { medication_name: "Lisinopril" });

    expect(scraperCalls).toHaveLength(0);
    const parsed = JSON.parse(result);
    expect(parsed.cancelled).toBe(true);
    expect(parsed.message).toContain("request_refill");
    expect(parsed.message).toContain("Do not retry");
  });

  test("dismissing the dialog counts as a decline", async () => {
    nextAlertAction = "dismiss";
    const result = await executeLocalTool("send_reply", { conversation_id: "c1", message_body: "hi" });
    expect(scraperCalls).toHaveLength(0);
    expect(JSON.parse(result).cancelled).toBe(true);
  });

  test("all three write tools are gated", async () => {
    nextAlertAction = "cancel";
    for (const tool of ["send_message", "send_reply", "request_refill"]) {
      await executeLocalTool(tool, {});
    }
    expect(alertCalls).toHaveLength(3);
    expect(scraperCalls).toHaveLength(0);
  });

  test("empty args render a placeholder in the confirmation", async () => {
    nextAlertAction = "cancel";
    await executeLocalTool("send_message", { instance: "x" });
    expect(alertCalls[0].message).toContain("(no arguments)");
  });
});
