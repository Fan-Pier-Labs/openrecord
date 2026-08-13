import { beforeEach, describe, expect, test, mock } from "bun:test";

const memory = new Map<string, string>();

mock.module("expo-secure-store", () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: "whenUnlockedThisDeviceOnly",
  getItemAsync: async (key: string) => memory.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    memory.set(key, value);
  },
  deleteItemAsync: async (key: string) => {
    memory.delete(key);
  },
}));

const store = await import("@/lib/storage/secure-store");

beforeEach(() => {
  memory.clear();
});

describe("generic secure values", () => {
  test("set / get / delete round-trip", async () => {
    await store.setSecureValue("k", "v");
    expect(await store.getSecureValue("k")).toBe("v");
    await store.deleteSecureValue("k");
    expect(await store.getSecureValue("k")).toBeNull();
  });
});

describe("MyChart accounts", () => {
  test("starts empty", async () => {
    expect(await store.getMyChartAccounts()).toEqual([]);
  });

  test("returns [] when the stored blob is corrupt", async () => {
    memory.set("mychart_accounts", "{not json");
    expect(await store.getMyChartAccounts()).toEqual([]);
  });

  test("addMyChartAccount assigns a unique id and persists", async () => {
    const a = await store.addMyChartAccount({
      hostname: "mychart.example.org",
      username: "homer",
      password: "donuts123",
    });
    const b = await store.addMyChartAccount({
      hostname: "localhost:4000",
      username: "marge",
      password: "donuts123",
    });
    expect(a.id).toBeTruthy();
    expect(b.id).toBeTruthy();
    expect(a.id).not.toBe(b.id);

    const accounts = await store.getMyChartAccounts();
    expect(accounts).toHaveLength(2);
    expect(accounts[0].hostname).toBe("mychart.example.org");
    expect(accounts[1].username).toBe("marge");
  });

  test("updateMyChartAccount merges fields for the matching id only", async () => {
    const a = await store.addMyChartAccount({
      hostname: "h1",
      username: "u1",
      password: "p1",
    });
    const b = await store.addMyChartAccount({
      hostname: "h2",
      username: "u2",
      password: "p2",
    });

    await store.updateMyChartAccount(a.id, { totpSecret: "SECRET" });

    const accounts = await store.getMyChartAccounts();
    expect(accounts.find((x) => x.id === a.id)?.totpSecret).toBe("SECRET");
    expect(accounts.find((x) => x.id === a.id)?.password).toBe("p1");
    expect(accounts.find((x) => x.id === b.id)?.totpSecret).toBeUndefined();
  });

  test("updateMyChartAccount is a no-op for unknown ids", async () => {
    await store.addMyChartAccount({ hostname: "h", username: "u", password: "p" });
    await store.updateMyChartAccount("missing", { password: "x" });
    const accounts = await store.getMyChartAccounts();
    expect(accounts).toHaveLength(1);
    expect(accounts[0].password).toBe("p");
  });

  test("removeMyChartAccount removes only the matching account", async () => {
    const a = await store.addMyChartAccount({ hostname: "h1", username: "u", password: "p" });
    await store.addMyChartAccount({ hostname: "h2", username: "u", password: "p" });

    await store.removeMyChartAccount(a.id);

    const accounts = await store.getMyChartAccounts();
    expect(accounts).toHaveLength(1);
    expect(accounts[0].hostname).toBe("h2");
  });
});

describe("AI provider settings", () => {
  test("defaults to the free tier", async () => {
    expect(await store.getAiProvider()).toBe("free");
  });

  test("persists a valid provider", async () => {
    await store.setAiProvider("anthropic");
    expect(await store.getAiProvider()).toBe("anthropic");
  });

  test("falls back to free for unrecognized stored values", async () => {
    memory.set("ai_provider", "skynet");
    expect(await store.getAiProvider()).toBe("free");
  });

  test("API keys round-trip", async () => {
    await store.setOpenAiApiKey("sk-test");
    expect(await store.getOpenAiApiKey()).toBe("sk-test");
    await store.setGeminiApiKey("g-test");
    expect(await store.getGeminiApiKey()).toBe("g-test");
    await store.setClaudeApiKey("c-test");
    expect(await store.getClaudeApiKey()).toBe("c-test");
  });
});

describe("model selection", () => {
  test("defaults to gemini-2.5-flash", async () => {
    expect(await store.getSelectedModel()).toBe("gemini-2.5-flash");
  });

  test("persists the chosen model", async () => {
    await store.setSelectedModel("claude-sonnet-4-6");
    expect(await store.getSelectedModel()).toBe("claude-sonnet-4-6");
  });
});
