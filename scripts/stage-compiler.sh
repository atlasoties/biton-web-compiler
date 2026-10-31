#!/usr/bin/env bash
# Copy a built biton compiler and its standard library into vendor/biton,
# where the worker image (Dockerfile target "worker") picks it up.
#
#   scripts/stage-compiler.sh [path/to/biton-repo] [build-dir]
#
# The binary must be built for the worker's base image (Ubuntu 24.04, glibc 2.39).
set -euo pipefail

repo="${1:-../biton}"
build="${2:-$repo/build}"
bin="$build/cli/biton"
out="$(dirname "$0")/../vendor/biton"

[[ -x "$bin" && -s "$bin" ]] || { echo "no compiler at $bin (build it first: cmake --build $build)" >&2; exit 1; }
ls "$repo"/lib/*.bit >/dev/null 2>&1 || { echo "no stdlib in $repo/lib" >&2; exit 1; }

rm -rf "$out"
mkdir -p "$out/bin" "$out/share/biton/lib"
cp "$bin" "$out/bin/biton"
strip "$out/bin/biton" 2>/dev/null || true
cp "$repo"/lib/*.bit "$out/share/biton/lib/"
"$out/bin/biton" --version > "$out/VERSION"
echo "staged $(cat "$out/VERSION") into $out"
