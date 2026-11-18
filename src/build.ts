import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { DEFAULT_MODULES, OFFICIAL_ACBR_URL, PATCHES_PATH, ROOT, readLock } from "./lock.ts";
import { finalizeOutput } from "./manifest.ts";
import { IMAGE } from "./svn.ts";

function run(command: string, args: string[], env?: NodeJS.ProcessEnv): void {
  const result = spawnSync(command, args, { cwd: ROOT, env, stdio: "inherit", windowsHide: true });
  if (result.error || result.status !== 0)
    throw new Error(`Falha em ${command} (${result.error?.message ?? result.status}).`);
}

function capture(command: string, args: string[]): string {
  const result = spawnSync(command, args, { cwd: ROOT, encoding: "utf8", windowsHide: true });
  if (result.error || result.status !== 0) throw new Error(result.error?.message ?? (result.stderr.trim() || command));
  return result.stdout.trim();
}

export function git(args: string[]): string {
  return capture("git", args);
}

export function build(): void {
  const revision = process.env.ACBR_REV || String(readLock().revision);
  if (!/^[1-9][0-9]*$/.test(revision) || !Number.isSafeInteger(Number(revision)))
    throw new Error("ACBR_REV deve ser uma revisão SVN positiva.");
  const modules = process.env.ACBR_MODULES?.trim().split(/\s+/) ?? DEFAULT_MODULES;
  if (!modules.length || modules.some((module) => !/^[A-Za-z][A-Za-z0-9]*$/.test(module)) ||
      new Set(modules.map((module) => module.toLowerCase())).size !== modules.length)
    throw new Error("Informe módulos ConsoleMT distintos, separados por espaços.");

  const native = process.platform === "darwin" && process.env.ACBR_DOCKER !== "1";
  const target = process.arch === "arm64" ? "macos-aarch64" : "macos-x86_64";
  const targets = process.env.ACBR_TARGETS?.trim().split(/\s+/) ??
    (native ? [target] : ["linux-x86_64", "windows-x86_64"]);
  const allowed = native ? [target] : ["linux-x86_64", "windows-x86_64"];
  if (new Set(targets).size !== targets.length || targets.some((item) => !allowed.includes(item)))
    throw new Error(`Alvo indisponível neste host. Alvos disponíveis: ${allowed.join(", ")}.`);

  const output = resolve(process.env.ACBR_OUT ?? join(ROOT, "out"));
  if (existsSync(output) && readdirSync(output).length && !existsSync(join(output, "manifest.json")))
    throw new Error(`Escolha um diretório de saída vazio: ${output}`);
  mkdirSync(dirname(output), { recursive: true });
  const temporary = mkdtempSync(join(dirname(output), ".forge-"));
  let preserveBackup = false;
  try {
    const stage = join(temporary, "output");
    mkdirSync(stage);
    const sha = git(["rev-parse", "HEAD"]);
    const dirty = Boolean(git(["status", "--porcelain", "--untracked-files=normal"]));
    if (native) {
      const cache = resolve(process.env.ACBR_CACHE ?? join(homedir(), ".cache/acbrlib-forge"));
      mkdirSync(cache, { recursive: true });
      const guard = join(cache, `${target}-lock`);
      try {
        mkdirSync(guard);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        throw new Error(`Já existe uma compilação ativa ou interrompida. Verifique os processos do Forge e, se nenhum estiver ativo, remova a trava ${guard}.`);
      }
      try {
        run(process.execPath, [join(ROOT, "src/macos.ts")], {
          ...process.env, ACBR_REV: revision, ACBR_URL: OFFICIAL_ACBR_URL, ACBR_OUT: stage,
          ACBR_MODULES: modules.join(" "), ACBR_CACHE: cache,
        });
      } finally {
        rmSync(guard, { recursive: true });
      }
    } else {
      run("docker", ["build", "--platform", "linux/amd64", "-t", IMAGE, "-f", "docker/Dockerfile", "."]);
      const container = capture("docker", [
        "create", "--platform", "linux/amd64",
        "-e", `ACBR_REV=${revision}`, "-e", `ACBR_URL=${OFFICIAL_ACBR_URL}`,
        "-e", `ACBR_MODULES=${modules.join(" ")}`, "-e", `ACBR_TARGETS=${targets.join(" ")}`,
        "-v", `${IMAGE}-svn-cache-v1:/src`,
        IMAGE,
      ]);
      try {
        run("docker", ["cp", PATCHES_PATH, `${container}:/opt/acbrlib/patches.json`]);
        run("docker", ["start", "-a", container]);
        run("docker", ["cp", `${container}:/out/.`, stage]);
      } finally {
        run("docker", ["rm", "-fv", container]);
      }
    }
    const manifest = finalizeOutput(stage, sha, dirty);
    for (const wanted of targets) {
      for (const module of modules) {
        if (!manifest.files.some((entry) => entry.target === wanted && entry.module === module))
          throw new Error(`A compilação não gerou ${module} para ${wanted}.`);
      }
    }
    const previous = join(temporary, "previous");
    if (existsSync(output)) renameSync(output, previous);
    try {
      renameSync(stage, output);
    } catch (error) {
      if (existsSync(previous)) {
        preserveBackup = true;
        renameSync(previous, output);
        preserveBackup = false;
      }
      throw error;
    }
    console.log(`ACBrLib r${revision}: ${output}`);
  } finally {
    if (preserveBackup) console.error(`Saída anterior preservada em ${join(temporary, "previous")}`);
    else rmSync(temporary, { recursive: true, force: true });
  }
}
