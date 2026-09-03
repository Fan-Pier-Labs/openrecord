/**
 * The app's tool-input check. This is the only client whose args reach the
 * registry straight from a model's JSON with nothing in between — the MCPB has
 * zod, the CLI has `coerceCapabilityArgs` — so a gap here is a gap in the
 * product, and it is silent: the value reaches the scraper looking like a
 * string and goes out to the patient's provider as "[object Object]".
 */
import { describe, it, expect } from "bun:test";
import { toCapabilityArgs } from "../tool-args";

describe("toCapabilityArgs", () => {
  it("passes scalars through unchanged", () => {
    expect(
      toCapabilityArgs({ csn: "CSN-1", years_back: 5, include_all: true }),
    ).toEqual({ csn: "CSN-1", years_back: 5, include_all: true });
  });

  it("keeps a numeric id a number rather than pre-stringifying it", () => {
    // The registry's own accessors decide how to render it; narrowing at the
    // edge must not make that decision for them.
    expect(toCapabilityArgs({ csn: 12345 })).toEqual({ csn: 12345 });
  });

  it("drops absent values so optional params keep their fallbacks", () => {
    expect(toCapabilityArgs({ topic: undefined, patient: null })).toEqual({});
  });

  it("rejects an object in a message body, naming the argument", () => {
    // The case this exists for: send_message's body is sent to a provider.
    expect(() => toCapabilityArgs({ message: { text: "hi" } })).toThrow(
      /Argument "message" must be a string, number or boolean; received an object\./,
    );
  });

  it("names the kind it got, with an article that matches it", () => {
    expect(() => toCapabilityArgs({ recipient_name: ["Dr A", "Dr B"] })).toThrow(
      /received an array\./,
    );
    expect(() => toCapabilityArgs({ csn: () => "x" })).toThrow(/received a function\./);
  });

  it("rejects rather than partially applying a call", () => {
    // A write must not go out with the good half of its args and a dropped
    // body — the whole call fails and the model is told which arg was wrong.
    expect(() =>
      toCapabilityArgs({ recipient_name: "Dr A", subject: "Refill", message: {} }),
    ).toThrow(/"message"/);
  });
});
