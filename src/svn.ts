// Histórico do trunk2 do ACBr. No macOS usa o svn local; nas demais
// plataformas, o svn da imagem Docker da ACBrLib (construída se ausente).
import { spawn } from "node:child_process";
import { DEFAULT_MODULES, OFFICIAL_ACBR_URL, ROOT } from "./lock.ts";

export const IMAGE = "acbrlib-forge";
/**
 * Bases comuns, projetos selecionados e dependências exportadas.
 */
const MODULE_PATHS = [
  /^\/trunk2\/Fontes\/(ACBrComum|ACBrDiversos|ACBrOpenSSL|ACBrLibXML2|ACBrTCP|PCNComum)\//,
  /^\/trunk2\/Fontes\/ACBrDFe\/(ACBrNFe|Comum)\//,
  /^\/trunk2\/Fontes\/ACBrDFe\/[^/]+$/,
  /^\/trunk2\/Fontes\/ACBrSerial\/(ACBrAbecsPinPad|ACBrBAL|ACBrDevice|ACBrEsc|ACBrPosPrinter|ACBrWinUSBDevice)[^/]*$/,
  /^\/trunk2\/Exemplos\/ACBrDFe\/Schemas\/NFe\//,
  /^\/trunk2\/DLLs\/(OpenSSL|LibXml2)\//,
];

export function isModulePath(path: string): boolean {
  if (/Demo|IMendes|change-log\.txt$/i.test(path)) return false;
  const project = /^\/trunk2\/Projetos\/ACBrLib\/Fontes\/([^/]+)\//.exec(path)?.[1];
  return project === "Comum" || (project !== undefined && DEFAULT_MODULES.includes(project)) ||
    MODULE_PATHS.some((pattern) => pattern.test(path));
}

export type SvnEntry = {
  revision: number;
  author: string;
  /** dd/MM/yyyy HH:mm, horário local. */
  date: string;
  message: string;
  paths: string[];
  relevant: boolean;
};

function decode(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function brazilian(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const two = (value: number) => String(value).padStart(2, "0");
  return `${two(date.getDate())}/${two(date.getMonth() + 1)}/${date.getFullYear()} ${two(date.getHours())}:${two(date.getMinutes())}`;
}

export function parseLog(xml: string): SvnEntry[] {
  return [...xml.matchAll(/<logentry\s+revision="(\d+)">([\s\S]*?)<\/logentry>/g)].map(([, revision, body]) => {
    const paths = [...body.matchAll(/<path\b[^>]*>([^<]*)<\/path>/g)].map(([, path]) => decode(path));
    return {
      revision: Number(revision),
      author: decode(/<author>([^<]*)<\/author>/.exec(body)?.[1] ?? ""),
      date: brazilian(/<date>([^<]*)<\/date>/.exec(body)?.[1] ?? ""),
      message: decode(/<msg>([\s\S]*?)<\/msg>/.exec(body)?.[1] ?? "").trim(),
      paths,
      relevant: paths.some(isModulePath),
    };
  });
}

function svnCommand(args: string[]): [string, string[]] {
  return process.platform === "darwin"
    ? ["svn", args]
    : ["docker", ["run", "--platform", "linux/amd64", "--rm", "--entrypoint", "svn", IMAGE, ...args]];
}

/** Executa sem bloquear o processo (a TUI mantém o spinner girando). */
export function exec(command: string, args: string[], cwd?: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => (stdout += chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

/** Constrói a imagem da ACBrLib quando o svn vem do Docker. */
export async function ensureSvn(): Promise<void> {
  if (process.platform === "darwin") return;
  if ((await exec("docker", ["info"])).code !== 0)
    throw new Error("O Docker não está em execução: abra o Docker Desktop e tente de novo.");
  if ((await exec("docker", ["image", "inspect", IMAGE])).code === 0) return;
  const build = await exec("docker", ["build", "--platform", "linux/amd64", "-q", "-t", IMAGE, "-f", "docker/Dockerfile", "."], ROOT);
  if (build.code !== 0) throw new Error(`Não foi possível preparar o svn no Docker: ${build.stderr.trim()}`);
}

async function runSvn(args: string[]): Promise<string> {
  const [command, commandArgs] = svnCommand(args);
  const result = await exec(command, commandArgs);
  if (result.code !== 0) throw new Error(result.stderr.trim() || `svn terminou com código ${result.code}.`);
  return result.stdout;
}

/** Revisões de `to` para trás, mais recentes primeiro; `to` vazio é o HEAD. */
export async function svnLog(limit: number, to?: number): Promise<SvnEntry[]> {
  await ensureSvn();
  const range = to === undefined ? ["-r", "HEAD:1"] : ["-r", `${to}:1`];
  return parseLog(await runSvn(["log", "--xml", "-v", "-l", String(limit), ...range, OFFICIAL_ACBR_URL]));
}

/** Revisões no intervalo, em ordem crescente (relatório de atualização). */
export async function svnRange(from: number, to: number): Promise<SvnEntry[]> {
  await ensureSvn();
  return parseLog(await runSvn(["log", "--xml", "-v", "-r", `${from}:${to}`, OFFICIAL_ACBR_URL]));
}
