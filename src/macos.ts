// Compila a ACBrLib (ConsoleMT) nativamente no macOS, sem contêiner: o FPC
// não gera Mach-O a partir do Linux. Usa a mesma revisão de `acbr.lock`, o
// mesmo Lazarus da imagem Docker e grava em `out/macos-<arquitetura>/`.
import { spawnSync, type SpawnSyncOptions } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { DEFAULT_MODULES, OFFICIAL_ACBR_URL, PATCHES_PATH, ROOT, readLock } from "./lock.ts";
import { darwinPatches } from "../patches/darwin.ts";

const LAZARUS_TAG = "lazarus_3_6";
const LAZARUS_EXPECTED_SHA256 =
  "535c01c9f6dc00867753b2a4d4e08b12fc8939ed314b5179c8bcb19f7d836f35";
const ACBR_URL = process.env.ACBR_URL ?? OFFICIAL_ACBR_URL;

// ACBR_OUT separa o build de uma revisão candidata (`update.ts`) do aprovado.
const output = resolve(process.env.ACBR_OUT ?? join(ROOT, "out"));
const cache = resolve(process.env.ACBR_CACHE ?? join(homedir(), ".cache/acbrlib-forge"));
const cpu = process.arch === "arm64" ? "aarch64" : "x86_64";
const lazarus = join(cache, `lazarus-${LAZARUS_TAG}-${cpu}`);
const acbr = join(cache, `acbr-${cpu}-svn-v1`);
const target = `macos-${cpu}`;
const targetDirectory = join(output, target);
const sharedPatchesPath = PATCHES_PATH;
const sharedPatches = JSON.parse(readFileSync(sharedPatchesPath, "utf8")) as { id: string; file: string; from: string; to: string }[];

const revision = process.env.ACBR_REV ?? String(readLock().revision);
const modules = (process.env.ACBR_MODULES ?? DEFAULT_MODULES.join(" "))
  .split(/\s+/)
  .filter(Boolean);

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function run(command: string, args: string[], options: SpawnSyncOptions = {}): string {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  if (result.error || result.status !== 0) {
    const detail = [result.stderr, result.stdout].filter(Boolean).join("\n").trim();
    fail(`${command} ${args.join(" ")} falhou${detail ? `:\n${detail.slice(-4000)}` : ""}`);
  }
  return String(result.stdout ?? "");
}

function has(command: string): boolean {
  return spawnSync("/usr/bin/which", [command]).status === 0;
}

/** O SVN do SourceForge trunca respostas; a cópia retoma de onde parou. */
function svn(args: string[]): void {
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    if (spawnSync("svn", args, { stdio: "inherit" }).status === 0) return;
    console.error(`svn falhou (tentativa ${attempt}); repetindo`);
    if (existsSync(join(acbr, ".svn"))) spawnSync("svn", ["cleanup", acbr]);
    Bun.sleepSync(attempt * 5000);
  }
  fail(`svn ${args.join(" ")} falhou.`);
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function ensureTools(): string {
  if (process.platform !== "darwin") fail("Este build é exclusivo do macOS.");
  revision || fail("Informe ACBR_REV ou mantenha acbr.lock.");
  const missing = ["fpc", "svn", "make", "install_name_tool", "codesign"].filter(
    (command) => !has(command),
  );
  if (missing.length)
    fail(`Ferramentas ausentes: ${missing.join(", ")}. Instale com: brew install fpc subversion`);
  const openssl = spawnSync("brew", ["--prefix", "openssl@3"], { encoding: "utf8" });
  const prefix = openssl.status === 0 ? openssl.stdout.trim() : "";
  if (!prefix || !existsSync(join(prefix, "lib/libcrypto.3.dylib")))
    fail("OpenSSL 3 não encontrado. Instale com: brew install openssl@3");
  return prefix;
}

function ensureLazbuild(): string {
  const lazbuild = join(lazarus, "lazbuild");
  if (existsSync(lazbuild)) return lazbuild;
  mkdirSync(cache, { recursive: true });
  const archive = join(cache, `lazarus-${cpu}.tar.gz`);
  run("curl", [
    "-fsSL",
    "-o",
    archive,
    `https://gitlab.com/freepascal.org/lazarus/lazarus/-/archive/${LAZARUS_TAG}/lazarus-${LAZARUS_TAG}.tar.gz`,
  ]);
  if (sha256(archive) !== LAZARUS_EXPECTED_SHA256) fail("SHA-256 do Lazarus não confere.");
  rmSync(lazarus, { recursive: true, force: true });
  mkdirSync(lazarus, { recursive: true });
  run("tar", ["-xzf", archive, "-C", lazarus, "--strip-components=1"]);
  rmSync(archive);
  console.log("==> lazbuild");
  run("make", ["-C", lazarus, "lazbuild"], { maxBuffer: 256 * 1024 * 1024 });
  return lazbuild;
}

function ensureSources(): void {
  // A cópia de trabalho é reaproveitada: desfaz os patches comuns antes de atualizar.
  if (existsSync(join(acbr, ".svn"))) svn(["revert", "--quiet", "--recursive", acbr]);
  if (!existsSync(join(acbr, ".svn")))
    svn(["checkout", "--quiet", "--depth", "empty", "-r", revision!, ACBR_URL, acbr]);
  // Só na primeira vez: repetir --set-depth empty apagaria as subpastas.
  if (!existsSync(join(acbr, "Projetos/ACBrLib")))
    svn([
      "update", "--quiet", "-r", revision!, "--set-depth", "empty",
      join(acbr, "Projetos"), join(acbr, "Projetos/ACBrLib"),
    ]);
  svn([
    "update", "--quiet", "-r", revision!, "--set-depth", "infinity",
    join(acbr, "Fontes"), join(acbr, "Projetos/ACBrLib/Fontes"),
  ]);
}

function applyPatches(): void {
  for (const { file, from, to } of [...sharedPatches, ...darwinPatches]) {
    const path = join(acbr, file);
    // Os fontes do ACBr são ISO-8859-1; latin1 preserva cada byte.
    const source = readFileSync(path, "latin1");
    if (source.includes(to)) continue;
    if (source.split(from).length !== 2)
      fail(`Patch não aplicável (zero ou várias ocorrências) em ${file}: revise patches/.`);
    writeFileSync(path, source.replace(from, () => to), "latin1");
  }
}

/** Mach-O carregado por caminho: identifica-se e às dependências pela pasta. */
function relink(path: string, dependencies: Record<string, string> = {}): void {
  chmodSync(path, 0o755);
  run("install_name_tool", [
    "-id",
    `@loader_path/${basename(path)}`,
    ...Object.entries(dependencies).flatMap(([from, to]) => ["-change", from, to]),
    path,
  ]);
  // install_name_tool invalida a assinatura; arm64 exige ao menos a ad hoc.
  run("codesign", ["--force", "--sign", "-", path]);
}

/** Dependência de `path` cujo nome termina em `suffix`, como gravada no Mach-O. */
function linkedLibrary(path: string, suffix: string): string | undefined {
  return run("otool", ["-L", path])
    .split("\n")
    .slice(1)
    .map((line) => line.trim().split(" ")[0])
    .find((name) => name.endsWith(suffix));
}

/**
 * OpenSSL 3 ao lado da ACBrLib, como as DLLs do Windows. O provedor `legacy`
 * fica na mesma pasta e passa a apontar para o mesmo libcrypto: duas cópias
 * no processo tornam os algoritmos "unsupported".
 */
function bundleOpenSsl(prefix: string): void {
  const crypto = join(targetDirectory, "libcrypto.3.dylib");
  const ssl = join(targetDirectory, "libssl.3.dylib");
  const legacy = join(targetDirectory, "legacy.dylib");
  copyFileSync(join(prefix, "lib/libcrypto.3.dylib"), crypto);
  copyFileSync(join(prefix, "lib/libssl.3.dylib"), ssl);
  copyFileSync(join(prefix, "lib/ossl-modules/legacy.dylib"), legacy);
  relink(crypto);
  for (const path of [ssl, legacy]) {
    const linked = linkedLibrary(path, "/libcrypto.3.dylib");
    relink(path, linked ? { [linked]: "@loader_path/libcrypto.3.dylib" } : {});
  }
}

function exportSchemas(): void {
  const schemas = join(output, "schemas/NFe");
  if (existsSync(schemas)) return;
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const result = spawnSync("svn", [
      "export", "--quiet", "--force", "-r", revision!,
      `${ACBR_URL}/Exemplos/ACBrDFe/Schemas/NFe`, schemas,
    ], { stdio: "inherit" });
    if (result.status === 0) return;
    Bun.sleepSync(attempt * 5000);
  }
  fail("Não foi possível exportar os schemas da NF-e.");
}

type Entry = { module: string; prefix: string; target: string; file: string; sha256: string };

function build(lazbuild: string, module: string): Entry[] {
  const directory = join(acbr, "Projetos/ACBrLib/Fontes", module);
  const project = join(directory, `ACBrLib${module}ConsoleMT.lpi`);
  if (!existsSync(project)) fail(`${module} não tem projeto ConsoleMT.`);
  // Não há modo darwin no ACBr: o modo Linux traz as definições MT e o
  // nome `libacbr<modulo>64`; alvo e CPU são substituídos na linha de comando.
  const mode = [...readFileSync(project, "utf8").matchAll(/<Item\d+ Name="([^"]+)"/g)]
    .map((match) => match[1])
    .find((name) => /^linux-x86_64(-mt)?$/i.test(name));
  if (!mode) fail(`${module} não tem modo Linux x86_64.`);
  const prefix =
    /([A-Za-z]+)_Inicializar\b/.exec(readFileSync(join(directory, `ACBrLib${module}.lpr`), "latin1"))?.[1] ??
    fail(`Prefixo de ${module} não encontrado.`);
  const binaries = join(directory, "bin/Linux/CONSOLE-MT");
  rmSync(binaries, { recursive: true, force: true });
  console.log(`==> ${module} (${target}, modo ${mode})`);
  const log = join(targetDirectory, `${module}.log`);
  const result = spawnSync(
    lazbuild,
    [
      "--quiet", `--lazarusdir=${lazarus}`, "--build-all", "--ws=nogui",
      "--os=darwin", `--cpu=${cpu}`, `--build-mode=${mode}`, project,
    ],
    { encoding: "utf8", env: { ...process.env, ACBR_HOME: acbr }, maxBuffer: 256 * 1024 * 1024 },
  );
  writeFileSync(log, `${result.stdout ?? ""}${result.stderr ?? ""}`);
  if (result.status !== 0) {
    const errors = readFileSync(log, "utf8")
      .split("\n")
      .filter((line) => /Error|Fatal/.test(line))
      .slice(-30);
    fail(errors.join("\n") || `lazbuild falhou para ${module}; veja ${log}`);
  }
  return readdirSync(binaries)
    .filter((name) => name.endsWith(".dylib"))
    .map((name) => {
      const destination = join(targetDirectory, name);
      copyFileSync(join(binaries, name), destination);
      relink(destination);
      return { module, prefix, target, file: `${target}/${name}`, sha256: sha256(destination) };
    });
}

function writeManifest(entries: Entry[], lazbuild: string, opensslPrefix: string): void {
  const path = join(output, "manifest.json");
  // Preserva as entradas dos outros alvos gerados pelo contêiner.
  const previous = existsSync(path)
    ? (JSON.parse(readFileSync(path, "utf8")) as { files?: Entry[] })
    : {};
  const manifest = {
    ...previous,
    acbrRevision: Number(revision),
    acbrUrl: ACBR_URL,
    patches: sha256(sharedPatchesPath),
    variant: "ConsoleMT",
    [`${target}Toolchain`]: {
      fpc: run("fpc", ["-iV"]).trim(),
      lazarus: run(lazbuild, ["--version"]).trim().split("\n").at(-1),
      openssl: run(join(opensslPrefix, "bin/openssl"), ["version"]).trim(),
    },
    files: [...(previous.files ?? []).filter((entry) => entry.target !== target), ...entries],
  };
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
}

const opensslPrefix = ensureTools();
const lazbuild = ensureLazbuild();
ensureSources();
applyPatches();
mkdirSync(targetDirectory, { recursive: true });
if (modules.includes("NFe")) {
  exportSchemas();
  bundleOpenSsl(opensslPrefix);
}
const entries = modules.flatMap((module) => build(lazbuild, module));
writeManifest(entries, lazbuild, opensslPrefix);
console.log(`Bibliotecas em ${targetDirectory}`);
// Python do sistema: não traz um OpenSSL já carregado que mascare a busca.
run("/usr/bin/python3", ["-I", join(ROOT, "scripts/smoke.py"), output, target], { stdio: "inherit" });
