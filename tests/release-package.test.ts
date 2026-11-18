import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { digest, finalizeOutput, verifyOutput } from "../src/manifest.ts";
import { sourceLink, stageTarget } from "../src/release-package.ts";

it("packages one target with its runtime and schemas and excludes build logs", () => {
  const root = mkdtempSync(join(tmpdir(), "forge-package-"));
  try {
    const build = join(root, "build");
    const staged = join(root, "package");
    for (const file of ["linux-x86_64/nfe.so", "windows-x86_64/nfe.dll",
      "windows-x86_64/libcrypto.dll", "windows-x86_64/NFe.log", "schemas/NFe/nfe.xsd"]) {
      const path = join(build, file);
      mkdirSync(join(path, ".."), { recursive: true });
      writeFileSync(path, file);
    }
    const targets = ["linux-x86_64", "windows-x86_64"];
    const files = targets.map((target, index) => {
      const file = `${target}/nfe.${index === 0 ? "so" : "dll"}`;
      return { module: "NFe", prefix: "NFE", target, file, sha256: digest(join(build, file)) };
    });
    writeFileSync(join(build, "manifest.json"), JSON.stringify({ variant: "ConsoleMT", files }));
    finalizeOutput(build, "release-sha", false);
    stageTarget(build, staged, "windows-x86_64");
    const manifest = verifyOutput(staged, { forgeCommit: "release-sha" });
    expect(manifest.files).toEqual([files[1]]);
    expect(manifest.assets.map(({ file }) => file)).toEqual(["schemas/NFe/nfe.xsd", "windows-x86_64/libcrypto.dll"]);
    expect(readdirSync(join(staged, "windows-x86_64")).sort()).toEqual(["libcrypto.dll", "nfe.dll"]);
    writeFileSync(join(build, "schemas/NFe/nfe.xsd"), "modified");
    expect(() => stageTarget(build, join(root, "reject"), "windows-x86_64")).toThrow(/ausente ou modificado/);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

it("requires a public HTTPS source address without embedded credentials", () => {
  expect(sourceLink("https://example.org/sources/r48681")).toBe("https://example.org/sources/r48681");
  for (const url of ["", "http://example.org/source", "https://user:pass@example.org/source"])
    expect(() => sourceLink(url)).toThrow(/ACBRLIB_CORRESPONDING_SOURCE_URL/);
});
