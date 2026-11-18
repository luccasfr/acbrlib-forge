// Revisão aprovada do ACBr (`acbr.lock`), a única usada nos pacotes, e o
// SHA-256 da lista de patches compartilhados (`patches/shared.json`).
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const OFFICIAL_ACBR_URL = "https://svn.code.sf.net/p/acbr/code/trunk2";
export const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const LOCK_PATH = join(ROOT, "acbr.lock");
export const PATCHES_PATH = join(ROOT, "patches/shared.json");
export const DEFAULT_MODULES = JSON.parse(readFileSync(join(ROOT, "modules.json"), "utf8")) as string[];

/** SHA-256 da lista de patches, o mesmo gravado no manifesto do build. */
export function patchesDigest(path = PATCHES_PATH): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export type AcbrLock = {
  revision: number;
  approvedBy: string;
  approvedAt: string;
  notes: string;
  /** SHA-256 de `patches.json` aprovado com a revisão; vazio em locks antigos. */
  patches: string;
  recipe: string;
  evidence: string;
  builds?: string;
};

/** `NOME=valor` por linha; o valor pode conter `=`. */
export function parseLock(text: string): AcbrLock {
  const values = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const index = line.indexOf("=");
    if (index > 0) values.set(line.slice(0, index).trim(), line.slice(index + 1).trim());
  }
  const revision = Number(values.get("ACBR_REV"));
  if (!Number.isInteger(revision) || revision <= 0)
    throw new Error("acbr.lock sem ACBR_REV válido.");
  return {
    revision,
    approvedBy: values.get("ACBR_APPROVED_BY") ?? "",
    approvedAt: values.get("ACBR_APPROVED_AT") ?? "",
    notes: values.get("ACBR_NOTES") ?? "",
    patches: values.get("ACBR_PATCHES") ?? "",
    recipe: values.get("ACBR_RECIPE") ?? "",
    evidence: values.get("ACBR_EVIDENCE") ?? "",
    builds: values.get("ACBR_BUILDS"),
  };
}

export function readLock(path = LOCK_PATH): AcbrLock {
  return parseLock(readFileSync(path, "utf8"));
}

function line(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

export function formatLock(lock: AcbrLock): string {
  return [
    `ACBR_REV=${lock.revision}`,
    `ACBR_APPROVED_BY=${line(lock.approvedBy)}`,
    `ACBR_APPROVED_AT=${line(lock.approvedAt)}`,
    `ACBR_NOTES=${line(lock.notes)}`,
    ...(lock.patches ? [`ACBR_PATCHES=${line(lock.patches)}`] : []),
    ...(lock.recipe ? [`ACBR_RECIPE=${line(lock.recipe)}`] : []),
    ...(lock.evidence ? [`ACBR_EVIDENCE=${line(lock.evidence)}`] : []),
    ...(lock.builds ? [`ACBR_BUILDS=${line(lock.builds)}`] : []),
    "",
  ].join("\n");
}

export function writeLock(lock: AcbrLock, path = LOCK_PATH): void {
  writeFileSync(path, formatLock(lock));
}
