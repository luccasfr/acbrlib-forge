import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type Library = {
  module: string;
  prefix: string;
  target: string;
  file: string;
  sha256: string;
};

type Asset = { file: string; sha256: string };

export type Manifest = {
  formatVersion: 1;
  forgeCommit: string;
  forgeDirty: boolean;
  acbrRevision: number;
  acbrUrl: string;
  patches: string;
  variant: "ConsoleMT";
  files: Library[];
  assets: Asset[];
};

export function digest(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function inventory(root: string, directory = ""): Asset[] {
  return readdirSync(join(root, directory), { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name, "en"))
    .flatMap((entry) => {
      const path = [directory, entry.name].filter(Boolean).join("/");
      if (entry.isDirectory()) return inventory(root, path);
      if (!entry.isFile()) throw new Error(`Tipo de arquivo inesperado: ${path}`);
      if (path === "manifest.json" || path.endsWith(".log")) return [];
      return [{ file: path, sha256: digest(join(root, path)) }];
    });
}

export function verifyOutput(root: string, expected?: Partial<Pick<Manifest,
  "acbrRevision" | "acbrUrl" | "forgeCommit" | "forgeDirty" | "patches">>): Manifest {
  const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8")) as Manifest;
  if (manifest.formatVersion !== 1 || manifest.variant !== "ConsoleMT")
    throw new Error("Formato de manifesto da ACBrLib incompatível.");
  for (const [key, value] of Object.entries(expected ?? {})) {
    if (manifest[key as keyof Manifest] !== value) throw new Error(`Campo divergente no manifesto da ACBrLib: ${key}`);
  }
  const actual = new Map(inventory(root).map(({ file, sha256 }) => [file, sha256]));
  const declared = [...manifest.files, ...manifest.assets];
  if (!manifest.files.length || declared.length !== actual.size)
    throw new Error("O inventário de saída diverge do manifesto.");
  for (const { file, sha256 } of declared) {
    if (actual.get(file) !== sha256) throw new Error(`Arquivo ausente ou modificado: ${file}`);
    actual.delete(file);
  }
  return manifest;
}

export function finalizeOutput(root: string, forgeCommit: string, forgeDirty: boolean): Manifest {
  const path = join(root, "manifest.json");
  const base = JSON.parse(readFileSync(path, "utf8")) as Omit<Manifest,
    "formatVersion" | "forgeCommit" | "forgeDirty" | "assets">;
  const libraries = new Set(base.files.map(({ file }) => file));
  const assets = inventory(root).filter(({ file }) => !libraries.has(file));
  const manifest = { ...base, formatVersion: 1, forgeCommit, forgeDirty, assets } satisfies Manifest;
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
  return verifyOutput(root);
}
