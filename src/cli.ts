#!/usr/bin/env bun
import { resolve } from "node:path";
import { build, git } from "./build.ts";
import { OFFICIAL_ACBR_URL, ROOT, patchesDigest, readLock } from "./lock.ts";
import { verifyOutput } from "./manifest.ts";
import { approve, record, verify } from "./review.ts";

const [command, ...args] = process.argv.slice(2);
try {
  switch (command) {
    case "build":
      if (args.length) throw new Error("Configure o build com ACBR_REV, ACBR_MODULES, ACBR_TARGETS e ACBR_OUT.");
      build();
      break;
    case "review":
      if (args.length === 0) {
        const { review } = await import("./terminal.tsx");
        await review();
      } else if (args.length === 1) {
        process.env.ACBR_REV = args[0];
        process.env.ACBR_OUT ??= resolve(ROOT, "out-candidate");
        build();
      } else throw new Error("Uso: acbrlib-forge review [revisão]");
      break;
    case "approve":
      if (args[1] !== "--run" || !args[2] || (args.length > 3 && (args[3] !== "--notes" || args.length !== 5)))
        throw new Error("Uso: acbrlib-forge approve <revisão> --run <id-do-ci> [--notes <observação>]");
      await approve(Number(args[0]), args[2], args[4]);
      break;
    case "verify": {
      const approval = verify();
      if (args.length === 2 && args[0] === "--output") {
        const lock = readLock();
        verifyOutput(resolve(args[1]), {
          forgeCommit: git(["rev-parse", "HEAD"]), forgeDirty: false,
          acbrUrl: OFFICIAL_ACBR_URL, acbrRevision: lock.revision, patches: patchesDigest(),
        });
      } else if (args.length) throw new Error("Uso: acbrlib-forge verify [--output <pasta>]");
      console.log(JSON.stringify(approval));
      break;
    }
    case "record":
      if (args.length !== 3) throw new Error("Uso: acbrlib-forge record <alvo> <pasta> <arquivo>");
      console.log(JSON.stringify(record(args[0], resolve(args[1]), resolve(args[2]))));
      break;
    case "--help":
    case undefined:
      console.log("acbrlib-forge build | review [revisão] | approve <revisão> --run <id> | verify [--output <pasta>]");
      break;
    default:
      throw new Error(`Comando desconhecido: ${command}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
