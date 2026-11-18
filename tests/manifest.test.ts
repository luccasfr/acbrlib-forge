import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { digest, finalizeOutput, verifyOutput } from "../src/manifest.ts";
import { TARGETS, assertMatrix } from "../src/review.ts";

it("binds the libraries, runtime files and schemas to the forge revision", () => {
  const root = mkdtempSync(join(tmpdir(), "forge-manifest-"));
  try {
    const library = "windows-x86_64/nfe.dll";
    const runtime = "windows-x86_64/libxml2.dll";
    const schema = "schemas/NFe/sample.xsd";
    mkdirSync(join(root, "windows-x86_64"));
    mkdirSync(join(root, "schemas/NFe"), { recursive: true });
    for (const path of [library, runtime, schema]) writeFileSync(join(root, path), path);
    writeFileSync(join(root, "manifest.json"), JSON.stringify({
      acbrRevision: 48681, acbrUrl: "https://example.org/svn", patches: "a",
      variant: "ConsoleMT", files: [{
        module: "NFe", prefix: "NFE", target: "windows-x86_64", file: library, sha256: digest(join(root, library)),
      }],
    }));
    expect(finalizeOutput(root, "forge-sha", false).assets.map(({ file }) => file)).toEqual([schema, runtime]);
    expect(() => verifyOutput(root, { forgeCommit: "other-sha" })).toThrow(/forgeCommit/);
    writeFileSync(join(root, schema), "corrupted");
    expect(() => verifyOutput(root)).toThrow(/sample\.xsd/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("requires one matching evidence record for each of the four native targets", () => {
  const inputs = { commit: "forge-sha", patches: "patch-sha", recipe: "recipe-sha", revision: 48681 };
  const records = TARGETS.map((target) => ({ ...inputs, target, archive: "a".repeat(64) }));
  expect(() => assertMatrix(records, inputs)).not.toThrow();
  expect(() => assertMatrix(records.slice(1), inputs)).toThrow(/quatro alvos/);
  expect(() => assertMatrix([...records.slice(1), records[1]], inputs)).toThrow(/quatro alvos/);
  expect(() => assertMatrix(records, { ...inputs, patches: "other" })).toThrow(/quatro alvos/);
  expect(() => assertMatrix([{ ...records[0], archive: "inválido" }, ...records.slice(1)], inputs)).toThrow(/quatro alvos/);
});
