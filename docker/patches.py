#!/usr/bin/env python3
"""Patches compartilhados sobre os fontes do ACBr (patches/shared.json).

  patches.py <acbr> <patches.json>   aplica cada substituição

Cada patch troca um trecho exato (`from`) por `to`. Se `to` já estiver no
arquivo, nada muda (revisão anterior à quebra ou ACBr já corrigido). Se nem
`from` nem `to` existirem, o build para: o código mudou e o patch precisa ser
revisto. Os fontes do ACBr são ISO-8859-1; latin1 preserva cada byte.
"""
import json
import sys
from pathlib import Path


def main() -> int:
    acbr, listing = Path(sys.argv[1]), Path(sys.argv[2])
    patches = json.loads(listing.read_text(encoding="utf-8"))
    for patch in patches:
        path = acbr / patch["file"]
        with open(path, encoding="latin1", newline="") as file:
            source = file.read()
        if patch["to"] in source:
            print(f"patch {patch['id']}: já presente")
            continue
        if source.count(patch["from"]) != 1:
            print(f"patch {patch['id']} não aplicável em {patch['file']}: revise patches/shared.json", file=sys.stderr)
            return 1
        with open(path, "w", encoding="latin1", newline="") as file:
            file.write(source.replace(patch["from"], patch["to"]))
        print(f"patch {patch['id']}: aplicado")
    return 0


if __name__ == "__main__":
    sys.exit(main())
