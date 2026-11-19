"""Carrega cada ACBrLib (MT, cdecl) de um alvo e chama Inicializar/Versao/Finalizar.

Uso: smoke.py <pasta out> <alvo>
"""

from __future__ import annotations

import ctypes
from contextlib import nullcontext
import json
import os
import platform
import sys
import tempfile


def check(path: str, prefix: str) -> str | None:
    """Devolve a mensagem de erro, ou None quando a biblioteca responde."""
    try:
        lib = ctypes.CDLL(path)
    except OSError as error:
        return f"não carregou: {error}"
    handle = ctypes.c_void_p()
    with tempfile.TemporaryDirectory() as tmp:
        config = os.path.join(tmp, "acbrlib.ini").encode()
        code = getattr(lib, f"{prefix}_Inicializar")(ctypes.byref(handle), config, b"")
        if code != 0:
            return f"{prefix}_Inicializar={code}"
        buffer = ctypes.create_string_buffer(64)
        size = ctypes.c_int(len(buffer))
        versao = getattr(lib, f"{prefix}_Versao")
        versao.argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.POINTER(ctypes.c_int)]
        code = versao(handle, buffer, ctypes.byref(size))
        finalizar = getattr(lib, f"{prefix}_Finalizar")
        finalizar.argtypes = [ctypes.c_void_p]
        end = finalizar(handle)
    if code != 0 or end != 0:
        return f"{prefix}_Versao={code} {prefix}_Finalizar={end}"
    print(f"ok {os.path.basename(path)} versao {buffer.value.decode(errors='replace')}")
    return None


def check_windows_runtime(directory: str) -> int:
    """Carrega as DLLs de terceiros do pacote e chama uma função de cada biblioteca."""
    failures = 0
    for name in sorted(os.listdir(directory)):
        if not name.lower().endswith(".dll") or name.lower().startswith("acbr"):
            continue
        try:
            lib = ctypes.CDLL(os.path.join(directory, name))
        except OSError as error:
            print(f"FALHA {name}: não carregou: {error}")
            failures += 1
            continue
        detail = ""
        if name.lower().startswith("libcrypto"):
            lib.OpenSSL_version.restype = ctypes.c_char_p
            detail = f" ({lib.OpenSSL_version(0).decode()})"
        elif name.lower() == "libxml2.dll":
            lib.xmlInitParser()
            try:
                version = ctypes.c_char_p.in_dll(lib, "xmlParserVersion").value
            except ValueError:
                version = None
            detail = f" (libxml2 {version.decode() if version else 'inicializada'})"
        print(f"ok {name}{detail}")
    return failures


def main() -> int:
    out, target = os.path.abspath(sys.argv[1]), sys.argv[2]
    # O tamanho do ponteiro identifica um Python de 32 bits mesmo num kernel
    # ou Windows de 64 bits (contêiner linux/386, Python x86 no Windows).
    machine = platform.machine().lower()
    arm = machine in {"arm64", "aarch64"}
    if ctypes.sizeof(ctypes.c_void_p) == 4:
        architecture = "arm" if arm else "i386"
    else:
        architecture = "aarch64" if arm else "x86_64"
    system = "macos" if sys.platform == "darwin" else "windows" if sys.platform == "win32" else sys.platform
    if target != f"{system}-{architecture}":
        print(f"O teste de carga exige {target} nativo; o Python é {system}-{architecture}", file=sys.stderr)
        return 2
    with open(os.path.join(out, "manifest.json"), encoding="utf-8") as file:
        entries = [e for e in json.load(file)["files"] if e["target"] == target]
    # As DLLs de terceiros (OpenSSL, libxml2) ficam ao lado das bibliotecas.
    dlls = os.add_dll_directory(os.path.join(out, target)) if sys.platform == "win32" else nullcontext()
    failures = 0
    with dlls:
        if sys.platform == "win32":
            failures += check_windows_runtime(os.path.join(out, target))
        for entry in entries:
            error = check(os.path.join(out, entry["file"]), entry["prefix"])
            if error:
                failures += 1
                print(f"FALHA {entry['file']}: {error}")
    return 1 if failures or not entries else 0


if __name__ == "__main__":
    sys.exit(main())
