/**
 * Local tool executor — runs MyChart scrapers on-device.
 *
 * Bridges Claude API tool_use calls to the session manager,
 * which executes scrapers against connected MyChart accounts.
 */
import { executeScraperTool as sessionExecute } from "@/lib/scrapers/session-manager";

/**
 * Execute a tool call locally. Called by the Claude streaming client
 * when Claude requests a tool.
 */
export async function executeLocalTool(
  toolName: string,
  input: Record<string, unknown>,
): Promise<string> {
  try {
    const result = await sessionExecute(toolName, input);
    return JSON.stringify(result, null, 2);
  } catch (err) {
    return JSON.stringify({
      error: `Failed to execute ${toolName}: ${(err as Error).message}`,
    });
  }
}
