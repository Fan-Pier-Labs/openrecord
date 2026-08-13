import { describe, it, expect } from "bun:test";
import { encodeWrapperFile } from "./generate_clo";
import { readPatientPosition, sortByPatientPosition } from "./sortByPatientPosition";
// fake-mychart may not import from outside its directory (its Docker build
// context is that directory alone), so the agreement test between its wrapper
// synthesizer and the real reader lives here, like the TOTP one in
// __tests__/totp.unit.test.ts.
import { buildCloWrapper } from "../../../fake-mychart/src/lib/cloWrapper";
import { parseWrapper } from "./clo_to_bitmap";

const BASE_METADATA = {
  photometricInterpretation: "MONOCHROME2",
  bitsStored: 16,
  windowCenter: 32768,
  windowWidth: 65536,
};

const wrapperAt = (z: number, x = -125, y = -125) =>
  encodeWrapperFile({ ...BASE_METADATA, positionPatient: { x, y, z } });

describe("readPatientPosition", () => {
  it("round-trips a position through encodeWrapperFile", () => {
    const pos = readPatientPosition(encodeWrapperFile({
      ...BASE_METADATA,
      positionPatient: { x: -125.5, y: -110.25, z: 42.75 },
    }));
    expect(pos).toEqual({ x: -125.5, y: -110.25, z: 42.75 });
  });

  it("returns null for a wrapper without a position (projection images)", () => {
    expect(readPatientPosition(encodeWrapperFile(BASE_METADATA))).toBeNull();
  });

  it("returns null for garbage and truncated buffers", () => {
    expect(readPatientPosition(Buffer.from("not a wrapper at all"))).toBeNull();
    expect(readPatientPosition(wrapperAt(40).subarray(0, 20))).toBeNull();
    expect(readPatientPosition(Buffer.alloc(0))).toBeNull();
  });
});

describe("sortByPatientPosition", () => {
  const image = (id: string, wrapperData?: Buffer) => ({ id, wrapperData });
  const ids = <T extends { id: string }>(result: { images: T[] }) => result.images.map((i) => i.id);

  it("sorts descending-z slices into ascending anatomical order", () => {
    const result = sortByPatientPosition([
      image("a", wrapperAt(200)),
      image("b", wrapperAt(160)),
      image("c", wrapperAt(120)),
      image("d", wrapperAt(80)),
      image("e", wrapperAt(40)),
    ]);
    expect(result.sortedBy).toBe("z");
    expect(result.rangeMm).toBe(160);
    expect(ids(result)).toEqual(["e", "d", "c", "b", "a"]);
  });

  it("sorts on the axis with the most variation", () => {
    const result = sortByPatientPosition([
      image("right", encodeWrapperFile({ ...BASE_METADATA, positionPatient: { x: 90, y: 0, z: 1 } })),
      image("left", encodeWrapperFile({ ...BASE_METADATA, positionPatient: { x: -90, y: 0, z: 2 } })),
      image("mid", encodeWrapperFile({ ...BASE_METADATA, positionPatient: { x: 0, y: 0, z: 3 } })),
    ]);
    expect(result.sortedBy).toBe("x");
    expect(ids(result)).toEqual(["left", "mid", "right"]);
  });

  it("keeps input order when no wrapper carries a position", () => {
    const result = sortByPatientPosition([
      image("a", encodeWrapperFile(BASE_METADATA)),
      image("b"),
      image("c", Buffer.from("garbage")),
    ]);
    expect(result.sortedBy).toBeNull();
    expect(result.rangeMm).toBe(0);
    expect(ids(result)).toEqual(["a", "b", "c"]);
  });

  it("keeps input order under 0.1mm of spread on every axis", () => {
    const result = sortByPatientPosition([
      image("a", wrapperAt(40.05)),
      image("b", wrapperAt(40)),
    ]);
    expect(result.sortedBy).toBeNull();
    expect(ids(result)).toEqual(["a", "b"]);
  });

  it("is stable: positionless slices (0,0,0) keep their relative order", () => {
    const result = sortByPatientPosition([
      image("no-wrapper-1"),
      image("no-wrapper-2"),
      image("positioned", wrapperAt(40, 0, 0)),
    ]);
    expect(result.sortedBy).toBe("z");
    expect(ids(result)).toEqual(["no-wrapper-1", "no-wrapper-2", "positioned"]);
  });

  it("handles an empty series", () => {
    const result = sortByPatientPosition([]);
    expect(result.sortedBy).toBeNull();
    expect(result.images).toEqual([]);
  });
});

describe("fake-mychart buildCloWrapper agreement with the real reader", () => {
  const FRAME_UID = "1.2.840.114350.2.362.2.742742.2.9876543210.1.2.2.0.0.0";

  it("produces a CLOHEADERZ01 wrapper the real parser reads", () => {
    const wrapper = buildCloWrapper({
      positionPatient: { x: -125, y: -125, z: 80 },
      frameOfReferenceUID: FRAME_UID,
    });
    expect(wrapper.subarray(0, 12).toString()).toBe("CLOHEADERZ01");

    // Display metadata must match the committed clo-images wrapper files so
    // pixel decoding/windowing is unchanged for per-instance responses.
    const metadata = parseWrapper(wrapper);
    expect(metadata.photometric).toBe("MONOCHROME2");
    expect(metadata.bits_stored).toBe(16);
    expect(metadata.window_center).toBe(32768);
    expect(metadata.window_width).toBe(65536);

    expect(readPatientPosition(wrapper)).toEqual({ x: -125, y: -125, z: 80 });
  });

  it("sorts slices synthesized by the fake", () => {
    const slice = (id: string, z: number) => ({
      id,
      wrapperData: buildCloWrapper({ positionPatient: { x: -125, y: -125, z }, frameOfReferenceUID: FRAME_UID }),
    });
    const result = sortByPatientPosition([slice("top", 200), slice("bottom", 40), slice("mid", 120)]);
    expect(result.sortedBy).toBe("z");
    expect(result.images.map((i) => i.id)).toEqual(["bottom", "mid", "top"]);
  });
});
