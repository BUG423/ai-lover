#!/usr/bin/env python3
"""Check tracked sources, reachable Git history, or unpacked distribution contents.

Only filenames and counts are reported. Credentials are never printed or sent online.
Run: python3 scripts/audit-secrets.py --history artifacts/ai-lover-debug.apk
"""
import argparse
import os
from pathlib import Path
import re
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]
KEY_PATTERN = re.compile(rb"\b(?:sk|tp|ttp)-[A-Za-z0-9_-]{24,}")
SYNTHETIC_MARKERS = (b"not-a-real", b"synthetic", b"fake-plan-test-key")


def local_secrets():
    values = set()
    entries = list(os.environ.items())
    for path in ROOT.glob(".env*"):
        if path.name == ".env.example" or not path.is_file():
            continue
        for line in path.read_text().splitlines():
            if "=" not in line or line.lstrip().startswith("#"):
                continue
            name, value = line.split("=", 1)
            entries.append((name.strip(), value.strip().strip("\"'")))
    for name, value in entries:
        if re.search(r"api.?key|token|secret", name, re.I) and len(value) >= 12:
            values.add(value.encode())
    return values


def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--history", action="store_true", help="include all reachable Git blobs")
    parser.add_argument("targets", nargs="*", help="APK/ZIP archives, files, or directories")
    args = parser.parse_args()
    secrets = local_secrets()
    findings = []
    count = 0

    def check(label, data):
        nonlocal count
        count += 1
        known = any(secret in data for secret in secrets)
        shaped = any(
            not any(marker in candidate.lower() for marker in SYNTHETIC_MARKERS)
            for candidate in KEY_PATTERN.findall(data)
        )
        if known or shaped:
            findings.append(label)

    for name in git("ls-files", "--cached", "--others", "--exclude-standard", "-z").split(b"\0"):
        if not name:
            continue
        path = ROOT / os.fsdecode(name)
        if path.is_file():
            check(f"source:{os.fsdecode(name)}", path.read_bytes())

    if args.history:
        objects = git("rev-list", "--objects", "--all").splitlines()
        metadata = subprocess.run(
            ["git", "cat-file", "--batch-check=%(objectname) %(objecttype)"],
            cwd=ROOT,
            input=b"\n".join(item.split(b" ", 1)[0] for item in objects),
            stdout=subprocess.PIPE,
            check=True,
        ).stdout.splitlines()
        for item, info in zip(objects, metadata):
            object_id, object_type = info.split(b" ", 1)
            if object_type == b"blob":
                _, _, name = item.partition(b" ")
                check(
                    f"history:{object_id.decode()[:12]}:{os.fsdecode(name)}",
                    git("cat-file", "blob", object_id.decode()),
                )

    def check_path(path):
        if path.is_dir():
            for child in sorted(path.rglob("*")):
                if child.is_file():
                    check_path(child)
        elif zipfile.is_zipfile(path):
            with zipfile.ZipFile(path) as archive:
                for entry in archive.infolist():
                    if entry.is_dir():
                        continue
                    label = f"artifact:{path.name}:{entry.filename}"
                    if Path(entry.filename).name.startswith(".env"):
                        findings.append(label)
                    check(label, archive.read(entry))
        else:
            check(f"artifact:{path.name}", path.read_bytes())

    for target in args.targets:
        check_path(Path(target).resolve())
    if findings:
        for label in findings:
            print(f"Credential candidate detected: {label}")
        raise SystemExit(1)
    print(f"Secret audit passed: {count} files/blobs; no credential matches.")


if __name__ == "__main__":
    main()
