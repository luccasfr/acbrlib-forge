import { join } from "node:path";
import { Box, Text, render, useApp, useInput, useWindowSize } from "ink";
import Spinner from "ink-spinner";
import { useState } from "react";
import { ROOT, readLock } from "./lock.ts";
import { exec, isModulePath, svnLog, type SvnEntry } from "./svn.ts";

const PAGE = 100;

type Screen =
  | { kind: "list" }
  | { kind: "detail"; entry: SvnEntry }
  | { kind: "approval"; entry: SvnEntry }
  | { kind: "running"; entry: SvnEntry; action: string }
  | { kind: "result"; entry: SvnEntry; message: string; ok: boolean };

function action(revision: number, current: number): string {
  if (revision > current) return "Atualizar";
  if (revision < current) return "Voltar";
  return "Reaprovar";
}

function App({ initial }: { initial: SvnEntry[] }) {
  const { exit } = useApp();
  const { rows, columns } = useWindowSize();
  const [entries, setEntries] = useState(initial);
  const [screen, setScreen] = useState<Screen>({ kind: "list" });
  const [relevant, setRelevant] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [scroll, setScroll] = useState(0);
  const [run, setRun] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [current, setCurrent] = useState(readLock);
  const visible = relevant ? entries.filter((entry) => entry.relevant || entry.revision === current.revision) : entries;
  const height = Math.max(3, rows - 8);
  const page = Math.floor(cursor / height) * height;

  function more() {
    const oldest = entries.at(-1)?.revision;
    if (!oldest || oldest <= 1 || loading) return;
    setLoading(true);
    setError("");
    svnLog(PAGE, oldest - 1).then((older) => setEntries((loaded) => [...loaded, ...older]))
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  }

  function execute(entry: SvnEntry, command: "review" | "approve") {
    const args = [join(ROOT, "cli.ts"), command, String(entry.revision)];
    if (command === "approve") args.push("--run", run);
    setScreen({ kind: "running", entry, action: command === "approve" ? "Verificando e assinando" : "Compilando candidata" });
    exec(process.execPath, args, ROOT).then((result) => {
      setCurrent(readLock());
      setScreen({
        kind: "result", entry, ok: result.code === 0,
        message: (result.code === 0 ? result.stdout : result.stderr || result.stdout).trim(),
      });
    }).catch((reason: Error) => setScreen({ kind: "result", entry, message: reason.message, ok: false }));
  }

  useInput((input, key) => {
    switch (screen.kind) {
      case "list": {
        const move = (index: number) => setCursor(Math.max(0, Math.min(visible.length - 1, index)));
        if (key.upArrow) move(cursor - 1);
        else if (key.downArrow) move(cursor + 1);
        else if (key.pageUp) move(cursor - height);
        else if (key.pageDown) move(cursor + height);
        else if (key.return && visible[cursor]) {
          setScroll(0);
          setScreen({ kind: "detail", entry: visible[cursor] });
        } else if (input === "m") more();
        else if (input === "f") {
          setRelevant(!relevant);
          setCursor(0);
        } else if (input === "q") exit();
        break;
      }
      case "detail":
        if (key.escape) setScreen({ kind: "list" });
        else if (key.upArrow) setScroll((offset) => Math.max(0, offset - 1));
        else if (key.downArrow) setScroll((offset) => Math.min(Math.max(0, screen.entry.paths.length - 1), offset + 1));
        else if (input === "b") execute(screen.entry, "review");
        else if (input === "a") {
          setRun("");
          setScreen({ kind: "approval", entry: screen.entry });
        }
        break;
      case "approval":
        if (key.escape) setScreen({ kind: "detail", entry: screen.entry });
        else if (key.backspace || key.delete) setRun((value) => value.slice(0, -1));
        else if (key.return && /^[1-9][0-9]*$/.test(run)) execute(screen.entry, "approve");
        else if (/^[0-9]+$/.test(input)) setRun((value) => (value + input).slice(0, 20));
        break;
      case "result":
        if (key.escape) setScreen({ kind: "list" });
        else if (input === "q") exit();
        break;
      case "running":
        break;
    }
  });

  return (
    <Box flexDirection="column">
      <Text bold>ACBrLib Forge · Aprovação de revisão</Text>
      <Text color={current.approvedBy ? "green" : "yellow"}>
        r{current.revision} {current.approvedBy ? `· aprovada por ${current.approvedBy}` : "· aguardando aprovação"}
      </Text>
      {screen.kind === "list" ? <>
        {visible.slice(page, page + height).map((entry, index) => (
          <Text key={entry.revision} inverse={page + index === cursor} wrap="truncate-end">
            {entry.revision === current.revision ? "●" : entry.relevant ? "◆" : " "} r{entry.revision} {entry.date} {entry.message.split("\n")[0]?.slice(0, Math.max(10, columns - 32))}
          </Text>
        ))}
        {loading ? <Text><Spinner /> Consultando SVN…</Text> : null}
        {error ? <Text color="red">{error}</Text> : null}
        <Text dimColor>↑↓ PgUp PgDn navegar · Enter abrir · f filtrar · m mais antigas · q sair</Text>
      </> : null}
      {screen.kind === "detail" ? <>
        <Text bold>r{screen.entry.revision} · {screen.entry.date} · {screen.entry.author}</Text>
        <Text>{screen.entry.message}</Text>
        {screen.entry.paths.slice(scroll, scroll + Math.max(1, height - 3)).map((path, index) => (
          <Text key={`${scroll + index}:${path}`} color={isModulePath(path) ? "cyan" : undefined} wrap="truncate-end">{path}</Text>
        ))}
        <Text dimColor>↑↓ caminhos · b compilar candidata · a {action(screen.entry.revision, current.revision).toLowerCase()} com CI · Esc voltar</Text>
      </> : null}
      {screen.kind === "approval" ? <>
        <Text>{action(screen.entry.revision, current.revision)} r{screen.entry.revision}</Text>
        <Text>ID da execução de validação no GitHub Actions: {run}▏</Text>
        <Text dimColor>Enter verificar a matriz e criar o commit assinado · Esc voltar</Text>
      </> : null}
      {screen.kind === "running" ? <Text><Spinner /> {screen.action} r{screen.entry.revision}…</Text> : null}
      {screen.kind === "result" ? <>
        <Text color={screen.ok ? "green" : "red"}>{screen.ok ? "Concluído" : "Falhou"} · r{screen.entry.revision}</Text>
        <Text>{screen.message.split("\n").slice(-height).join("\n")}</Text>
        <Text dimColor>Esc voltar à lista · q sair</Text>
      </> : null}
    </Box>
  );
}

export async function review(): Promise<void> {
  if (!process.stdin.isTTY) throw new Error("Abra a interface de aprovação em um terminal interativo.");
  const initial = await svnLog(PAGE);
  await render(<App initial={initial} />).waitUntilExit();
}
