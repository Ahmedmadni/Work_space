import { describe, expect, it } from "bun:test";
import { isTaskOverdue, localPlanningDay, planningStatusPatch } from "./personal-planning";

describe("personal board planning", () => {
  const task = { kind: "task", status: "planned", due_date: "2026-10-28" };
  it("lists unfinished tasks with a past due date", () => {
    expect(isTaskOverdue(task, "2026-10-29")).toBe(true);
  });
  it("does not mark tasks due today or later as overdue", () => {
    expect(isTaskOverdue({ ...task, due_date: "2026-10-29" }, "2026-10-29")).toBe(false);
    expect(isTaskOverdue({ ...task, due_date: "2026-10-30" }, "2026-10-29")).toBe(false);
  });
  it("excludes completed tasks from overdue tasks", () => {
    expect(isTaskOverdue({ ...task, status: "done" }, "2026-10-29")).toBe(false);
  });
  it("excludes undated tasks and non-task board items", () => {
    expect(isTaskOverdue({ ...task, due_date: null }, "2026-10-29")).toBe(false);
    expect(isTaskOverdue({ ...task, kind: "note" }, "2026-10-29")).toBe(false);
  });
  it("sets completion to 100 and resets it when reopened", () => {
    expect(planningStatusPatch({ progress: 40 }, "done")).toEqual({ status: "done", progress: 100 });
    expect(planningStatusPatch({ progress: 100 }, "planned")).toEqual({ status: "planned", progress: 0 });
  });
  it("uses the local calendar date", () => {
    expect(localPlanningDay(new Date(2026, 9, 29, 0, 15))).toBe("2026-10-29");
  });
});