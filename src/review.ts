import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyApproval } from "./approval.ts";
import { git } from "./build.ts";
import { DEFAULT_MODULES, OFFICIAL_ACBR_URL, ROOT, patchesDigest, readLock, writeLock } from "./lock.ts";
import { digest, verifyOutput } from "./manifest.ts";
import { exec, svnRange } from "./svn.ts";

/** Alvos compilados e testados nativamente em toda aprovação. */
export const TARGETS = ["linux-x86_64", "linux-i386", "windows-x86_64", "windows-i386", "macos-aarch64", "macos-x86_64"] as const;
/**
 * Alvos publicados em Releases. Um alvo só entra aqui quando todas as
 * dependências do pacote têm fontes e receita comprovados (veja RELEASING.md).
 */
export const RELEASE_TARGETS = ["linux-x86_64", "linux-i386", "windows-x86_64", "windows-i386", "macos-aarch64", "macos-x86_64"] as const satisfies
  readonly (typeof TARGETS)[number][];
const REPOSITORY = "luccasfr/acbrlib-forge";
const WORKFLOW = ".github/workflows/validate.yml";
const RECIPE = [".gitattributes", ".dockerignore", ".github/workflows", "src", "scripts",
  "cli.ts", "docker", "patches", "modules.json", "package.json", "bun.lock"];
const buildsPath = join(ROOT, "approved-builds.json");

export type Evidence = {
  target: (typeof TARGETS)[number];
  commit: string;
  revision: number;
  patches: string;
  recipe: string;
  archive: string;
};

function recipeAt(commit: string): string {
  return createHash("sha256").update(git(["ls-tree", commit, "--", ...RECIPE])).digest("hex");
}

export function assertMatrix(records: Evidence[], expected: Omit<Evidence, "target" | "archive">): void {
  if (records.length !== TARGETS.length || TARGETS.some((target) =>
    records.filter((record) => record.target === target && record.commit === expected.commit &&
      record.revision === expected.revision && record.patches === expected.patches &&
      record.recipe === expected.recipe && /^[0-9a-f]{64}$/.test(record.archive)).length !== 1))
    throw new Error(`A matriz precisa de todos os alvos nativos (${TARGETS.join(", ")}) para a mesma revisão, patches e receita.`);
}

export function record(target: string, root: string, archive: string): Evidence {
  if (!TARGETS.some((item) => item === target)) throw new Error(`Alvo desconhecido: ${target}`);
  const commit = git(["rev-parse", "HEAD"]);
  const patches = patchesDigest();
  const manifest = verifyOutput(root, { forgeCommit: commit, forgeDirty: false, acbrUrl: OFFICIAL_ACBR_URL, patches });
  const revision = Number(process.env.ACBR_REV || readLock().revision);
  if (manifest.acbrRevision !== revision || !DEFAULT_MODULES.every((module) =>
    manifest.files.some((entry) => entry.target === target && entry.module === module)))
    throw new Error("O build não corresponde à revisão ou aos módulos padrão.");
  return { target: target as Evidence["target"], commit, revision, patches, recipe: recipeAt(commit), archive: digest(archive) };
}

export function approvedBuilds(): Evidence[] {
  const lock = readLock();
  if (!lock.builds || !existsSync(buildsPath) || digest(buildsPath) !== lock.builds)
    throw new Error("O inventário dos binários diverge da aprovação assinada.");
  const records = JSON.parse(readFileSync(buildsPath, "utf8")) as Evidence[];
  assertMatrix(records, { commit: records[0]?.commit, revision: lock.revision, patches: lock.patches, recipe: lock.recipe });
  return records;
}

export function verify(): ReturnType<typeof verifyApproval> {
  const approval = verifyApproval(ROOT);
  const lock = readLock();
  if (patchesDigest() !== lock.patches || recipeAt("HEAD") !== lock.recipe || !/^[1-9][0-9]*$/.test(lock.evidence))
    throw new Error("A receita, os patches e as evidências do CI precisam constar da aprovação assinada.");
  if (git(["status", "--porcelain", "--", ...RECIPE])) throw new Error("A receita tem alterações locais.");
  approvedBuilds();
  return approval;
}

async function gh(args: string[]): Promise<string> {
  const result = await exec("gh", args, ROOT);
  if (result.code !== 0) throw new Error(result.stderr.trim() || "Não foi possível consultar a execução no GitHub.");
  return result.stdout;
}

/** Relatório da aprovação: primeira aprovação, reaprovação ou troca de revisão. */
export function reportName(previous: number | undefined, revision: number, run: string): { report: string; title: string } {
  if (previous === undefined) return { report: `changes/r${revision}-ci${run}.md`, title: `# ACBr r${revision}` };
  if (previous === revision)
    return { report: `changes/r${revision}-reaprovacao-ci${run}.md`, title: `# ACBr r${revision} · reaprovação` };
  return { report: `changes/r${previous}-r${revision}-ci${run}.md`, title: `# ACBr r${previous} → r${revision}` };
}

export async function approve(revision: number, run: string, notes = ""): Promise<void> {
  if (!Number.isSafeInteger(revision) || revision <= 0 || !/^[1-9][0-9]*$/.test(run))
    throw new Error("Informe uma revisão positiva e o ID numérico da execução de CI.");
  if (git(["status", "--porcelain"])) throw new Error("Confirme ou guarde as alterações locais antes da aprovação.");
  const email = git(["config", "user.email"]);
  const name = git(["config", "user.name"]);
  if (git(["config", "gpg.format"]) !== "ssh" || !name || !email)
    throw new Error("Configure a identidade e a assinatura Git por SSH.");
  const signers = readFileSync(join(ROOT, "approvers"), "utf8");
  if (!signers.split(/\r?\n/).some((line) => line.split(/\s+/, 1)[0] === email))
    throw new Error("Cadastre o e-mail do Git e a chave pública em approvers por commit assinado.");

  const workflow = JSON.parse(await gh(["api", `repos/${REPOSITORY}/actions/runs/${run}`])) as {
    path: string; event: string; conclusion: string; head_sha: string; head_branch: string;
    head_repository?: { full_name: string };
  };
  if (workflow.path.split("@")[0] !== WORKFLOW || workflow.event !== "workflow_dispatch" ||
      workflow.conclusion !== "success" || workflow.head_branch !== "main" || workflow.head_repository?.full_name !== REPOSITORY ||
      !/^[a-f0-9]{40}$/.test(workflow.head_sha))
    throw new Error("Informe uma execução manual bem-sucedida do workflow de validação deste repositório.");
  const recipe = recipeAt("HEAD");
  const patches = patchesDigest();
  const temp = mkdtempSync(join(tmpdir(), "acbrlib-forge-evidence-"));
  let records: Evidence[];
  try {
    await gh(["run", "download", run, "--repo", REPOSITORY, "--pattern", "evidence-*", "--dir", temp]);
    records = TARGETS.map((target) => {
      const path = join(temp, `evidence-${target}`, "evidence.json");
      if (!existsSync(path)) throw new Error(`A execução ${run} não contém a evidência de ${target}. Rode a matriz completa antes de aprovar.`);
      return JSON.parse(readFileSync(path, "utf8")) as Evidence;
    });
    assertMatrix(records, { commit: workflow.head_sha, revision, recipe, patches });
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }

  const current = readLock();
  const changes = revision > current.revision ? await svnRange(current.revision + 1, revision) : [];
  const directory = join(ROOT, "changes");
  const { report, title } = reportName(current.approvedBy ? current.revision : undefined, revision, run);
  if (existsSync(join(ROOT, report))) throw new Error("Esta execução já consta do histórico; rode a matriz novamente.");
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(ROOT, report), [
    title, "",
    `[Validação nativa](https://github.com/${REPOSITORY}/actions/runs/${run}) em ${TARGETS.join(", ")}.`, "",
    ...changes.filter((change) => change.relevant).map(({ revision, message }) => `- r${revision} ${message.replace(/\s+/g, " ")}`),
    "",
  ].join("\n"));
  writeFileSync(buildsPath, `${JSON.stringify(records, null, 2)}\n`);
  writeLock({
    revision, approvedBy: `${name} <${email}>`, approvedAt: new Date().toISOString().slice(0, 10),
    notes, patches, recipe, evidence: run, builds: digest(buildsPath),
  });
  git(["add", "acbr.lock", "approved-builds.json", report]);
  git(["commit", "-S", "-m", `chore(acbr): approve r${revision}`, "--", "acbr.lock", "approved-builds.json", report]);
  console.log(JSON.stringify(verify()));
}
