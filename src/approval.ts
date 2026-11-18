// Aprovação da revisão do ACBr por commit assinado (SSH) de quem consta em
// `approvers`. Não depende de recursos pagos do GitHub: a conferência roda no
// empacotamento de release, em qualquer máquina com o histórico completo.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseLock } from "./lock.ts";

export const LOCK_FILE = "acbr.lock";
export const APPROVERS_FILE = "approvers";

export type Approval = { revision: number; approvedBy: string; approvedAt: string; commit: string };

function git(repo: string, args: string[], allowFailure = false): string | null {
  const result = spawnSync("git", args, { cwd: repo, encoding: "utf8", windowsHide: true });
  if (result.error) throw new Error(`Não foi possível executar git: ${result.error.message}`);
  if (result.status !== 0) {
    if (allowFailure) return null;
    throw new Error(`git ${args.join(" ")} falhou: ${result.stderr.trim()}`);
  }
  return result.stdout;
}

/** Linhas `principal [opções] tipo chave` do formato allowed_signers. */
export function signerKeys(content: string): string[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

function fileAt(repo: string, revision: string, path: string): string {
  return git(repo, ["show", `${revision}:${path}`], true) ?? "";
}

function signedBy(repo: string, commit: string, signers: string): boolean {
  if (!signerKeys(signers).length) return false;
  const directory = mkdtempSync(join(tmpdir(), "acbrlib-forge-signers-"));
  try {
    const file = join(directory, "allowed_signers");
    writeFileSync(file, `${signerKeys(signers).join("\n")}\n`);
    return (
      git(repo, ["-c", `gpg.ssh.allowedSignersFile=${file.replace(/\\/g, "/")}`, "verify-commit", commit], true) !== null
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function history(repo: string, path: string): string[] {
  return (git(repo, ["log", "--format=%H", "--reverse", "--", path]) ?? "").split(/\s+/).filter(Boolean);
}

/**
 * Lista de aprovadores confiável no HEAD. Cada mudança da lista precisa da
 * assinatura de alguém da versão anterior; só a primeira chave (lista vazia
 * antes) é aceita com a assinatura da própria chave adicionada.
 */
export function trustedApprovers(repo: string): string {
  for (const commit of history(repo, APPROVERS_FILE)) {
    const before = fileAt(repo, `${commit}^`, APPROVERS_FILE);
    const after = fileAt(repo, commit, APPROVERS_FILE);
    if (!signerKeys(before).length) {
      if (signerKeys(after).length && !signedBy(repo, commit, after))
        throw new Error(`A primeira chave de aprovação (${commit.slice(0, 7)}) não foi assinada por ela mesma.`);
      continue;
    }
    if (!signedBy(repo, commit, before))
      throw new Error(`A lista de aprovadores mudou em ${commit.slice(0, 7)} sem assinatura de um aprovador anterior.`);
  }
  const current = fileAt(repo, "HEAD", APPROVERS_FILE);
  if (!signerKeys(current).length)
    throw new Error("Nenhum aprovador cadastrado em approvers.");
  return current;
}

/** Revisão do ACBr aprovada no HEAD; recusa alteração local não confirmada. */
export function verifyApproval(repo: string): Approval {
  if (git(repo, ["rev-parse", "--is-shallow-repository"])?.trim() === "true")
    throw new Error("Histórico incompleto: a aprovação do ACBr exige o clone completo (fetch-depth: 0).");
  if (git(repo, ["status", "--porcelain", "--", LOCK_FILE, APPROVERS_FILE])?.trim())
    throw new Error("acbr.lock ou approvers alterados sem commit: aprove a revisão antes do release.");
  const lock = parseLock(fileAt(repo, "HEAD", LOCK_FILE));
  if (!lock.approvedBy || !lock.approvedAt)
    throw new Error(`A revisão ${lock.revision} do ACBr não tem aprovação registrada no acbr.lock.`);
  const email = /<([^<>]+)>$/.exec(lock.approvedBy)?.[1];
  const approvers = signerKeys(trustedApprovers(repo)).filter((line) => line.split(/\s+/, 1)[0] === email).join("\n");
  const commit = git(repo, ["log", "-1", "--format=%H", "--", LOCK_FILE])?.trim();
  if (!commit || !signedBy(repo, commit, approvers))
    throw new Error(
      `A revisão ${lock.revision} do ACBr não foi assinada pelo aprovador registrado em approvers.`,
    );
  return { revision: lock.revision, approvedBy: lock.approvedBy, approvedAt: lock.approvedAt, commit };
}
