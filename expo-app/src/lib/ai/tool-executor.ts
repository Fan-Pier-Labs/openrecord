/**
 * Local tool executor — runs MyChart scrapers on-device.
 *
 * Read-only scrapers run immediately. Write tools (send_message,
 * send_reply, request_refill, …) require a user confirmation popup
 * showing the exact payload before they execute, similar to the
 * Claude mobile app.
 */
import { Alert } from "react-native";
import { executeScraperTool as sessionExecute } from "@/lib/scrapers/session-manager";
import { CAPABILITIES } from "../../../../shared/capabilities";

/**
 * Every capability that mutates the record, keyed by tool name.
 *
 * Derived from the shared registry rather than hand-listed, so a write tool
 * added there is confirmation-gated here from the first build — the previous
 * hand-written list covered three of the eight writes the other clients had.
 */
const WRITE_TOOLS: Record<string, { title: string; description: string }> = Object.fromEntries(
  CAPABILITIES.filter((c) => c.kind === "write").map((c) => [
    c.id,
    { title: c.title, description: c.description },
  ]),
);

function formatArgs(input: Record<string, unknown>): string {
  const entries = Object.entries(input).filter(([k]) => k !== "instance");
  if (entries.length === 0) return "(no arguments)";
  return entries
    .map(([k, v]) => {
      const val = typeof v === "string" ? v : JSON.stringify(v);
      return `${k}:\n${val}`;
    })
    .join("\n\n");
}

function confirmWrite(
  toolName: string,
  input: Record<string, unknown>,
): Promise<boolean> {
  const meta = WRITE_TOOLS[toolName];
  if (!meta) return Promise.resolve(true);
  const body = `${meta.description}\n\n${formatArgs(input)}`;
  return new Promise((resolve) => {
    Alert.alert(
      `Confirm: ${meta.title}`,
      body,
      [
        { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
        { text: "Send", style: "destructive", onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

export async function executeLocalTool(
  toolName: string,
  input: Record<string, unknown>,
): Promise<string> {
  try {
    if (WRITE_TOOLS[toolName]) {
      const ok = await confirmWrite(toolName, input);
      if (!ok) {
        return JSON.stringify({
          cancelled: true,
          message: `User declined to run ${toolName}. Do not retry unless they ask again.`,
        });
      }
    }
    const result = await sessionExecute(toolName, input);
    return JSON.stringify(result, null, 2);
  } catch (err) {
    return JSON.stringify({
      error: `Failed to execute ${toolName}: ${(err as Error).message}`,
    });
  }
}
