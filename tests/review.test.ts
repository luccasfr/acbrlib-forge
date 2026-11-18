import { expect, it } from "vitest";
import { RELEASE_TARGETS, reportName, TARGETS } from "../src/review.ts";

it("nomeia o relatório pela situação da aprovação", () => {
  expect(reportName(undefined, 48681, "7")).toEqual({ report: "changes/r48681-ci7.md", title: "# ACBr r48681" });
  expect(reportName(48681, 48681, "8")).toEqual({
    report: "changes/r48681-reaprovacao-ci8.md", title: "# ACBr r48681 · reaprovação",
  });
  expect(reportName(48681, 48700, "9")).toEqual({
    report: "changes/r48681-r48700-ci9.md", title: "# ACBr r48681 → r48700",
  });
});

it("publica só alvos que passam na matriz nativa", () => {
  expect(RELEASE_TARGETS.every((target) => (TARGETS as readonly string[]).includes(target))).toBe(true);
  expect(RELEASE_TARGETS).not.toContain("windows-x86_64");
});
