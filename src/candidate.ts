import { spawnSync } from "node:child_process";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { digest, verifyOutput } from "./manifest.ts";
import { stageTarget } from "./release-package.ts";
import { approvedBuilds, record, TARGETS } from "./review.ts";

function key(): Buffer {
  const value = process.env.ACBRLIB_CANDIDATE_KEY ?? "";
  if (!/^[0-9a-fA-F]{64}$/.test(value))
    throw new Error("Configure o segredo ACBRLIB_CANDIDATE_KEY com 32 bytes em hexadecimal.");
  return Buffer.from(value, "hex");
}

export function encrypt(data: Buffer, key: Buffer): Buffer {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), encrypted]);
}

export function decrypt(data: Buffer, key: Buffer): Buffer {
  if (data.length < 28) throw new Error("Artefato cifrado incompleto.");
  const decipher = createDecipheriv("aes-256-gcm", key, data.subarray(0, 12));
  decipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]);
}

function tar(args: string[]): void {
  const result = spawnSync("tar", args, { stdio: "inherit", windowsHide: true });
  if (result.error || result.status !== 0)
    throw new Error(result.error?.message ?? `Falha no tar (${result.status}).`);
}

function seal(target: (typeof TARGETS)[number], input: string, output: string): void {
  const encryptionKey = key();
  const scratch = mkdtempSync(join(tmpdir(), "forge-candidate-"));
  try {
    stageTarget(input, join(scratch, "out"), target);
    const archive = join(scratch, "candidate.tar.gz");
    tar(["-czf", archive, "-C", scratch, "out"]);
    const evidence = record(target, join(scratch, "out"), archive);
    mkdirSync(output, { recursive: true });
    writeFileSync(join(output, "bundle.enc"), encrypt(readFileSync(archive), encryptionKey));
    writeFileSync(join(output, "evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

function open(target: (typeof TARGETS)[number], input: string, output: string, approved: boolean): void {
  const evidence = approved ? approvedBuilds().find((entry) => entry.target === target) : undefined;
  const data = decrypt(readFileSync(input), key());
  mkdirSync(output, { recursive: true });
  const archive = join(output, "candidate.tar.gz");
  writeFileSync(archive, data, { flag: "wx" });
  if (approved && (!evidence || digest(archive) !== evidence.archive))
    throw new Error(`O artefato de ${target} diverge do SHA-256 aprovado.`);
  tar(["-xzf", archive, "-C", output]);
  const manifest = verifyOutput(join(output, "out"), evidence && { forgeCommit: evidence.commit });
  if (!manifest.files.every((entry) => entry.target === target))
    throw new Error(`O artefato não corresponde ao alvo ${target}.`);
}

if (import.meta.main) {
  const [mode, inputTarget, input, output, option] = process.argv.slice(2);
  try {
    const target = TARGETS.find((item) => item === inputTarget);
    if (!target || !input || !output) throw new Error("Uso: candidate.ts seal|open <alvo> <entrada> <saída> [--approved]");
    if (mode === "seal" && !option) seal(target, input, output);
    else if (mode === "open" && (!option || option === "--approved")) open(target, input, output, option === "--approved");
    else throw new Error("Modo de candidato inválido.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
