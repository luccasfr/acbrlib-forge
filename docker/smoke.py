"""Compatibilidade com consumidores da receita original."""

from pathlib import Path
from runpy import run_path

run_path(str(Path(__file__).resolve().parents[1] / "scripts" / "smoke.py"), run_name="__main__")
