import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { APPROVERS_FILE, LOCK_FILE, verifyApproval } from "../src/approval.ts";
import { formatLock } from "../src/lock.ts";

let repo: string;

// Integration cases launch real Git/SSH processes for several commits.
// Windows process startup can exceed Vitest's default 5-second limit.
const signedGitTimeout = 15_000;

function sh(command: string, args: string[]) {
  const result = spawnSync(command, args, { cwd: repo, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")}: ${result.stderr}`);
  return result.stdout;
}

function key(name: string, email: string): { private: string; line: string } {
  const path = join(repo, "..", `${name}-key`);
  sh("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-C", email, "-f", path]);
  const pub = readFileSync(`${path}.pub`, "utf8").trim();
  return { private: path.replace(/\\/g, "/"), line: `${email} namespaces="git" ${pub}` };
}

function write(path: string, content: string) {
  mkdirSync(join(repo, path, ".."), { recursive: true });
  writeFileSync(join(repo, path), content);
}

function commit(message: string, signer?: string) {
  sh("git", ["add", "-A"]);
  sh("git", [
    ...(signer ? ["-c", "gpg.format=ssh", "-c", `user.signingkey=${signer}`] : []),
    "commit", "-q", ...(signer ? ["-S"] : ["--no-gpg-sign"]), "-m", message,
  ]);
}

const approvedLock = formatLock({
  revision: 48484, approvedBy: "Pai <pai@example.org>", approvedAt: "2026-10-14", notes: "", patches: "", recipe: "", evidence: "",
});

beforeEach(() => {
  const root = mkdtempSync(join(tmpdir(), "forge-approval-"));
  repo = join(root, "repo");
  mkdirSync(repo);
  sh("git", ["init", "-q"]);
  sh("git", ["config", "user.name", "Teste"]);
  sh("git", ["config", "user.email", "teste@example.org"]);
  write(LOCK_FILE, "ACBR_REV=48484\n");
  write(APPROVERS_FILE, "# lista vazia\n");
  commit("base");
});

afterEach(() => rmSync(join(repo, ".."), { recursive: true, force: true }));

describe("aprovação da revisão do ACBr", () => {
  it("aceita só o lock confirmado por commit assinado de um aprovador", () => {
    const pai = key("pai", "pai@example.org");
    write(APPROVERS_FILE, `${pai.line}\n`);
    commit("aprovador", pai.private);
    expect(() => verifyApproval(repo)).toThrow(/não tem aprovação registrada/);

    write(LOCK_FILE, approvedLock);
    commit("aprova sem assinatura");
    expect(() => verifyApproval(repo)).toThrow(/assinada pelo aprovador/);

    write(LOCK_FILE, approvedLock.replace("2026-10-14", "2026-10-15"));
    commit("aprova", pai.private);
    expect(verifyApproval(repo)).toMatchObject({ revision: 48484, approvedBy: "Pai <pai@example.org>" });

    write(LOCK_FILE, approvedLock.replace("48484", "48500"));
    expect(() => verifyApproval(repo)).toThrow(/sem commit/);
  }, signedGitTimeout);

  it("recusa outra chave que se coloque na lista ou assine o lock", () => {
    const pai = key("pai", "pai@example.org");
    const outro = key("outro", "outro@exemplo.com");
    write(APPROVERS_FILE, `${pai.line}\n`);
    commit("aprovador", pai.private);
    write(LOCK_FILE, approvedLock);
    commit("aprova por outro", outro.private);
    expect(() => verifyApproval(repo)).toThrow(/assinada pelo aprovador/);

    write(APPROVERS_FILE, `${outro.line}\n`);
    commit("troca a lista", outro.private);
    expect(() => verifyApproval(repo)).toThrow(/sem assinatura de um aprovador anterior/);
  }, signedGitTimeout);

  it("aceita um novo aprovador incluído por quem já aprova", () => {
    const pai = key("pai", "pai@example.org");
    const filho = key("filho", "filho@example.org");
    write(APPROVERS_FILE, `${pai.line}\n`);
    commit("aprovador", pai.private);
    write(APPROVERS_FILE, `${pai.line}\n${filho.line}\n`);
    commit("inclui", pai.private);
    write(LOCK_FILE, approvedLock.replace("Pai <pai@example.org>", "Filho <filho@example.org>"));
    commit("aprova", filho.private);
    expect(verifyApproval(repo).revision).toBe(48484);
  }, signedGitTimeout);

  it("exige ao menos um aprovador cadastrado", () => {
    write(LOCK_FILE, approvedLock);
    commit("aprova");
    expect(() => verifyApproval(repo)).toThrow(/Nenhum aprovador/);
  }, signedGitTimeout);
});
