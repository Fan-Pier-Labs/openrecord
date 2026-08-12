import { describe, expect, test } from "bun:test";
import { SKILLS, getSkillById } from "../catalog";

describe("SKILLS catalog", () => {
  test("every skill has the required fields", () => {
    for (const skill of SKILLS) {
      expect(skill.id).toBeTruthy();
      expect(skill.title).toBeTruthy();
      expect(skill.description).toBeTruthy();
      expect(skill.icon).toBeTruthy();
      expect(skill.kickoffMessage.trim().length).toBeGreaterThan(0);
      expect(skill.playbook.trim().length).toBeGreaterThan(0);
    }
  });

  test("skill ids are unique", () => {
    const ids = SKILLS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("playbooks identify themselves as skills", () => {
    for (const skill of SKILLS) {
      expect(skill.playbook).toMatch(/^\[Skill: /);
    }
  });

  test("skills that send messages require confirmation before send_message", () => {
    const billSkill = getSkillById("bill_itemization");
    expect(billSkill).toBeDefined();
    expect(billSkill!.playbook).toContain("Confirm BEFORE every send_message");
  });

  test("medical-adjacent skills carry a not-a-doctor guardrail", () => {
    expect(getSkillById("analyze_history")!.playbook).toContain("NOT a doctor");
    expect(getSkillById("recommend_insurance")!.playbook).toContain("NOT an insurance advisor");
  });
});

describe("getSkillById", () => {
  test("returns the matching skill", () => {
    expect(getSkillById("bill_itemization")?.title).toBe("Find bills to itemize");
  });

  test("returns undefined for unknown ids", () => {
    expect(getSkillById("nope")).toBeUndefined();
  });
});
