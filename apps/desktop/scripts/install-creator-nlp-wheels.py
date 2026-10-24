"""Install pinned library wheels for a target Python, without pip or bytecode.

Only library payloads are needed: console scripts are intentionally not shipped.
Wheel archives are SHA-256 verified by the caller before invoking this script.
"""
import pathlib
import shutil
import sys
import zipfile

destination = pathlib.Path(sys.argv[1]).resolve()
destination.mkdir(parents=True, exist_ok=True)
for wheel_path in sys.argv[2:]:
    with zipfile.ZipFile(wheel_path) as wheel:
        for entry in wheel.infolist():
            parts = pathlib.PurePosixPath(entry.filename).parts
            if not parts or entry.is_dir():
                continue
            if ".." in parts or entry.filename.startswith(("/", "\\")) or "\\" in entry.filename:
                raise ValueError("Invalid wheel member: " + entry.filename)
            if (entry.external_attr >> 16) & 0o170000 == 0o120000:
                raise ValueError("Wheel symlinks are not supported")
            if parts[0].endswith(".data"):
                if len(parts) < 3 or parts[1] not in {"purelib", "platlib"}:
                    if len(parts) >= 3 and parts[1] in {"scripts", "headers"}:
                        continue
                    raise ValueError("Unsupported wheel data: " + entry.filename)
                parts = parts[2:]
            if "__pycache__" in parts or parts[-1].endswith((".pyc", ".pyo")):
                continue
            target = destination.joinpath(*parts)
            target.parent.mkdir(parents=True, exist_ok=True)
            with wheel.open(entry) as source, target.open("wb") as output:
                shutil.copyfileobj(source, output)
