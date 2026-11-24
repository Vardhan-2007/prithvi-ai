"""Every text file the Python code reads or writes must name its encoding.

Without `encoding="utf-8"`, Python uses the operating system's default: UTF-8 on Linux and macOS (where CI runs) but
cp1252 on Windows. The repo holds non-ASCII text (Telugu strings in the replay reports and narration, typographic
dashes in prose), so a bare `read_text()` fails on Windows with UnicodeDecodeError, and a bare `write_text()` can save
a file that is not valid UTF-8. This test fails on any such call, so the mistake cannot come back unnoticed.
"""
import ast
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SKIP_DIRS = {"node_modules", ".venv", "venv", "dist", ".git", "tts_venv", "models", "browsers", "frames", "__pycache__"}
NOT_FILE_OPEN = {"webbrowser", "os", "gzip", "io", "codecs", "zipfile", "tarfile"}   # objects whose .open() is not a text open


def has_keyword(call: ast.Call, name: str) -> bool:
    return any(kw.arg == name for kw in call.keywords)


def is_binary_open(call: ast.Call) -> bool:
    mode = call.args[1].value if len(call.args) > 1 and isinstance(call.args[1], ast.Constant) else None
    for kw in call.keywords:
        if kw.arg == "mode" and isinstance(kw.value, ast.Constant):
            mode = kw.value.value
    return isinstance(mode, str) and "b" in mode


def unsafe_calls(source: str) -> list[tuple[int, str]]:
    found = []
    for node in ast.walk(ast.parse(source)):
        if not isinstance(node, ast.Call):
            continue
        f = node.func
        if isinstance(f, ast.Attribute) and f.attr in ("read_text", "write_text"):
            if not has_keyword(node, "encoding"):
                found.append((node.lineno, f.attr))
        elif isinstance(f, ast.Name) and f.id == "open" or (
                isinstance(f, ast.Attribute) and f.attr == "open" and not (isinstance(f.value, ast.Name) and f.value.id in NOT_FILE_OPEN)):
            if not is_binary_open(node) and not has_keyword(node, "encoding"):
                found.append((node.lineno, "open"))
    return found


def python_files():
    for p in ROOT.rglob("*.py"):
        if not SKIP_DIRS.intersection(p.parts):
            yield p


def test_detector_flags_the_unsafe_patterns_and_accepts_the_safe_ones():
    bad = 'import json\nfrom pathlib import Path\na = Path("x").read_text()\nPath("y").write_text("z")\nb = open("f")\nc = open("f", "w")\nd = p.open("r")\n'
    assert [kind for _, kind in unsafe_calls(bad)] == ["read_text", "write_text", "open", "open", "open"]
    ok = ('a = Path("x").read_text(encoding="utf-8")\nPath("y").write_text("z", encoding="utf-8")\nb = open("f", encoding="utf-8")\n'
          'c = open("f", "rb")\nd = open("f", mode="wb")\nwebbrowser.open("http://x")\n')
    assert unsafe_calls(ok) == []


def test_no_text_file_is_read_or_written_without_an_encoding():
    offenders = []
    for p in python_files():
        for lineno, kind in unsafe_calls(p.read_text(encoding="utf-8")):
            offenders.append(f"{p.relative_to(ROOT)}:{lineno} {kind}")
    assert not offenders, 'add encoding="utf-8" to:\n  ' + "\n  ".join(sorted(offenders))
