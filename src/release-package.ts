import { spawnSync } from "node:child_process";
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { OFFICIAL_ACBR_URL, ROOT } from "./lock.ts";
import { verifyOutput } from "./manifest.ts";
import { approvedBuilds, RELEASE_TARGETS, TARGETS } from "./review.ts";

export function sourceLink(value: string): string {
  const url = URL.parse(value);
  if (!url || url.protocol !== "https:" || url.username || url.password)
    throw new Error("Defina ACBRLIB_CORRESPONDING_SOURCE_URL com a URL HTTPS dos fontes correspondentes.");
  return url.href;
}

export function stageTarget(input: string, output: string, target: (typeof TARGETS)[number]): void {
  const manifest = verifyOutput(input);
  const files = manifest.files.filter((entry) => entry.target === target && entry.file.startsWith(`${target}/`));
  if (!files.length || files.length !== manifest.files.filter((entry) => entry.target === target).length)
    throw new Error(`Inventário de bibliotecas inválido para ${target}.`);
  const assets = manifest.assets.filter(({ file }) => file.startsWith(`${target}/`) || file.startsWith("schemas/"));
  mkdirSync(output, { recursive: true });
  for (const { file } of [...files, ...assets]) {
    const path = join(output, file);
    mkdirSync(dirname(path), { recursive: true });
    copyFileSync(join(input, file), path);
  }
  writeFileSync(join(output, "manifest.json"), `${JSON.stringify({ ...manifest, files, assets }, null, 2)}\n`);
  verifyOutput(output);
}

function packageTarget(target: string, input: string): void {
  if (!RELEASE_TARGETS.some((item) => item === target))
    throw new Error(`${target} não faz parte dos alvos publicados: ${RELEASE_TARGETS.join(", ")}.`);
  const { version } = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { version: string };
  const tag = process.env.ACBRLIB_RELEASE_TAG;
  if (tag !== `v${version}` || !/^v\d+\.\d+\.\d+$/.test(tag))
    throw new Error("A tag de release deve corresponder à versão em package.json.");
  const source = sourceLink(process.env.ACBRLIB_CORRESPONDING_SOURCE_URL ?? "");
  const evidence = approvedBuilds().find((entry) => entry.target === target);
  if (!evidence) throw new Error(`Não há evidência aprovada para ${target}.`);
  verifyOutput(input, {
    forgeCommit: evidence.commit, forgeDirty: false, acbrUrl: OFFICIAL_ACBR_URL,
    acbrRevision: evidence.revision, patches: evidence.patches,
  });
  const scratch = mkdtempSync(join(tmpdir(), "forge-release-"));
  try {
    stageTarget(input, join(scratch, "out"), evidence.target);
    copyFileSync(join(ROOT, "THIRD_PARTY_NOTICES.md"), join(scratch, "THIRD_PARTY_NOTICES.md"));
    copyFileSync(join(ROOT, "LICENSE"), join(scratch, "LICENSE"));
    cpSync(join(ROOT, "LICENSES"), join(scratch, "LICENSES"), { recursive: true });
    writeFileSync(join(scratch, "SOURCES.md"), [
      "# Fontes correspondentes", "",
      `- Revisão SVN do ACBr: \`r${evidence.revision}\``,
      `- Commit do Forge: \`${evidence.commit}\``,
      `- SHA-256 dos patches compartilhados: \`${evidence.patches}\``,
      `- Distribuição dos fontes: <${source}>`, "",
    ].join("\n"));
    const dist = join(ROOT, "dist");
    mkdirSync(dist, { recursive: true });
    const archive = join(dist, `acbrlib-forge-${tag}-${target}.tar.gz`);
    const result = spawnSync("tar", [
      "-czf", archive, "-C", scratch, "out", "SOURCES.md", "THIRD_PARTY_NOTICES.md", "LICENSE", "LICENSES",
    ], {
      stdio: "inherit",
      windowsHide: true,
    });
    if (result.error || result.status !== 0) {
      rmSync(archive, { force: true });
      throw new Error(result.error?.message ?? `Falha no tar (${result.status}).`);
    }
    console.log(archive);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  const [target, input] = process.argv.slice(2);
  try {
    if (target === "--targets" && !input) console.log(RELEASE_TARGETS.join(" "));
    else if (!target || !input) throw new Error("Uso: bun src/release-package.ts <alvo> <saída-do-build> | --targets");
    else packageTarget(target, resolve(input));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
