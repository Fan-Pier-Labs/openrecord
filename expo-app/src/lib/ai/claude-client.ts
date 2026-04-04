import { getClaudeApiKey, getSelectedModel } from "@/lib/storage/secure-store";

const API_BASE = "https://api.anthropic.com";

export type ToolCall = {
  id: string;
  name: string;
  input: Record<string, unknown>;
};

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };

export type ChatMessage = {
  role: "user" | "assistant";
  content: string | ContentBlock[];
};

const SYSTEM_PROMPT = `You are a health assistant with access to the user's MyChart medical records. You can retrieve their health data using the available tools. Be helpful, accurate, and respectful of medical privacy.

When the user asks about their health data, use the appropriate tool to fetch it. Present the data clearly and offer to explain medical terminology.

Important:
- Never make medical diagnoses or treatment recommendations
- Suggest consulting a healthcare provider for medical decisions
- Be concise but thorough when presenting health data`;

// Tool definitions matching the MCP server tool-definitions.ts
const TOOLS = [
  { name: "get_profile", description: "Get the user's MyChart profile information", input_schema: { type: "object" as const, properties: { instance: { type: "string", description: "MyChart hostname (optional if only one account)" } } } },
  { name: "get_health_summary", description: "Get a summary of the user's health information", input_schema: { type: "object" as const, properties: { instance: { type: "string" } } } },
  { name: "get_medications", description: "Get current and past medications", input_schema: { type: "object" as const, properties: { instance: { type: "string" } } } },
  { name: "get_allergies", description: "Get allergy information", input_schema: { type: "object" as const, properties: { instance: { type: "string" } } } },
  { name: "get_health_issues", description: "Get health issues / problem list", input_schema: { type: "object" as const, properties: { instance: { type: "string" } } } },
  { name: "get_upcoming_visits", description: "Get upcoming appointments", input_schema: { type: "object" as const, properties: { instance: { type: "string" } } } },
  { name: "get_past_visits", description: "Get past visit history", input_schema: { type: "object" as const, properties: { instance: { type: "string" }, years_back: { type: "number" } } } },
  { name: "get_lab_results", description: "Get lab test results", input_schema: { type: "object" as const, properties: { instance: { type: "string" }, limit: { type: "number" }, offset: { type: "number" } } } },
  { name: "get_messages", description: "Get MyChart messages/conversations with providers", input_schema: { type: "object" as const, properties: { instance: { type: "string" }, limit: { type: "number" }, offset: { type: "number" } } } },
  { name: "get_billing", description: "Get billing history", input_schema: { type: "object" as const, properties: { instance: { type: "string" }, limit: { type: "number" }, offset: { type: "number" } } } },
  { name: "get_care_team", description: "Get care team members", input_schema: { type: "object" as const, properties: { instance: { type: "string" } } } },
  { name: "get_insurance", description: "Get insurance information", input_schema: { type: "object" as const, properties: { instance: { type: "string" } } } },
  { name: "get_immunizations", description: "Get immunization records", input_schema: { type: "object" as const, properties: { instance: { type: "string" } } } },
  { name: "get_preventive_care", description: "Get preventive care recommendations", input_schema: { type: "object" as const, properties: { instance: { type: "string" } } } },
  { name: "get_vitals", description: "Get vital signs history", input_schema: { type: "object" as const, properties: { instance: { type: "string" } } } },
  { name: "get_documents", description: "Get medical documents", input_schema: { type: "object" as const, properties: { instance: { type: "string" } } } },
  { name: "get_imaging_results", description: "Get imaging/radiology results", input_schema: { type: "object" as const, properties: { instance: { type: "string" }, limit: { type: "number" }, offset: { type: "number" } } } },
  { name: "get_letters", description: "Get letters from providers", input_schema: { type: "object" as const, properties: { instance: { type: "string" } } } },
  { name: "get_referrals", description: "Get referral information", input_schema: { type: "object" as const, properties: { instance: { type: "string" } } } },
  { name: "get_medical_history", description: "Get medical history", input_schema: { type: "object" as const, properties: { instance: { type: "string" } } } },
  { name: "get_emergency_contacts", description: "Get emergency contacts", input_schema: { type: "object" as const, properties: { instance: { type: "string" } } } },
  { name: "get_activity_feed", description: "Get recent activity feed", input_schema: { type: "object" as const, properties: { instance: { type: "string" } } } },
  { name: "get_care_journeys", description: "Get care journey information", input_schema: { type: "object" as const, properties: { instance: { type: "string" } } } },
  { name: "get_goals", description: "Get health goals", input_schema: { type: "object" as const, properties: { instance: { type: "string" } } } },
  { name: "get_education_materials", description: "Get patient education materials", input_schema: { type: "object" as const, properties: { instance: { type: "string" } } } },
];

export type StreamCallbacks = {
  onText: (text: string) => void;
  onToolCall: (toolCall: ToolCall) => void;
  onDone: (fullText: string, toolCalls: ToolCall[]) => void;
  onError: (error: Error) => void;
};

export type ToolExecutor = (toolName: string, input: Record<string, unknown>) => Promise<string>;

/**
 * Send a message to Claude, handling the tool use loop.
 * Uses non-streaming API since React Native's fetch doesn't support
 * ReadableStream. Text appears all at once per turn.
 *
 * When Claude requests tools, executes them locally via the toolExecutor,
 * then sends results back for the final response.
 */
export async function sendMessage(
  messages: ChatMessage[],
  callbacks: StreamCallbacks,
  executeLocalTool: ToolExecutor,
): Promise<void> {
  const apiKey = await getClaudeApiKey();
  if (!apiKey) {
    callbacks.onError(new Error("No Claude API key configured. Add one in Settings."));
    return;
  }

  const model = await getSelectedModel();

  const conversationMessages = [...messages];
  let continueLoop = true;

  while (continueLoop) {
    continueLoop = false;

    const response = await fetch(`${API_BASE}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        messages: conversationMessages,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      callbacks.onError(new Error(`API error ${response.status}: ${errorBody}`));
      return;
    }

    const result = await response.json();

    // Extract text and tool calls from the response
    let fullText = "";
    const toolCalls: ToolCall[] = [];

    for (const block of result.content || []) {
      if (block.type === "text") {
        fullText += block.text;
        callbacks.onText(block.text);
      } else if (block.type === "tool_use") {
        const tc: ToolCall = { id: block.id, name: block.name, input: block.input };
        toolCalls.push(tc);
        callbacks.onToolCall(tc);
      }
    }

    // If Claude wants to use tools, execute them and continue
    if (result.stop_reason === "tool_use" && toolCalls.length > 0) {
      // Add assistant message with tool calls
      const assistantContent: ContentBlock[] = [];
      if (fullText) {
        assistantContent.push({ type: "text", text: fullText });
      }
      for (const tc of toolCalls) {
        assistantContent.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.input });
      }
      conversationMessages.push({ role: "assistant", content: assistantContent });

      // Execute each tool and collect results
      const toolResults: ContentBlock[] = [];
      for (const tc of toolCalls) {
        try {
          const toolResult = await executeLocalTool(tc.name, tc.input);
          toolResults.push({ type: "tool_result", tool_use_id: tc.id, content: toolResult });
        } catch (err) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: tc.id,
            content: `Error: ${(err as Error).message}`,
            is_error: true,
          });
        }
      }
      conversationMessages.push({ role: "user", content: toolResults });

      // Reset text for next iteration
      fullText = "";
      continueLoop = true;
    } else {
      // Done — no more tool calls
      callbacks.onDone(fullText, toolCalls);
    }
  }
}
