import { describe, expect, it } from "bun:test";
import { normalizeTasks, validateTaskDrafts } from "./ai-tasks-data";

const task = (title, priority = "medium") => ({ title, description: "", priority, reason: "" });
describe("notes task review", () => {
  it("rejects empty task titles before saving", () => {
    expect(() => validateTaskDrafts([task("  ")])).toThrow();
  });
  it("keeps at most 20 suggestions", () => {
    expect(normalizeTasks(Array.from({ length: 25 }, (_, i) => task(`Task ${i}`)))).toHaveLength(20);
  });
  it("sorts suggestions by critical, high, medium, low", () => {
    expect(normalizeTasks([task("Low", "low"), task("High", "high"), task("Normal"), task("Urgent", "critical")]).map((row) => row.priority)).toEqual(["critical", "high", "medium", "low"]);
  });
});