#!/usr/bin/env bash
# Copy a built biton compiler and its standard library into vendor/biton,
# where the worker image (Dockerfile target "worker") picks it up.
#
#   scripts/stage-compiler.sh [path/to/biton-repo] [build-dir]
#
# The build directory defaults to the first of build-release/ (what
# ../biton/install.sh builds) and build/ that holds a compiler. The binary
# must be built for the worker's base image (Ubuntu 24.04, glibc 2.39).
set -euo pipefail

repo="${1:-../biton}"
out="$(cd "$(dirname "$0")/.." && pwd)/vendor/biton"

if [[ $# -ge 2 ]]; then
  build="$2"
else
  build=""
  for d in "$repo/build-release" "$repo/build"; do
    if [[ -x "$d/cli/biton" && -s "$d/cli/biton" ]]; then build="$d"; break; fi
  done
  [[ -n "$build" ]] || { echo "no compiler in $repo/build-release or $repo/build (run $repo/install.sh or cmake --build)" >&2; exit 1; }
fi
bin="$build/cli/biton"
[[ -x "$bin" && -s "$bin" ]] || { echo "no compiler at $bin (build it first: cmake --build $build)" >&2; exit 1; }
ls "$repo"/stdlib/*.bit >/dev/null 2>&1 || { echo "no standard library in $repo/stdlib" >&2; exit 1; }

rm -rf "$out"
mkdir -p "$out/bin" "$out/share/biton/stdlib"
cp "$bin" "$out/bin/biton"
strip "$out/bin/biton" 2>/dev/null || true
cp "$repo"/stdlib/*.bit "$out/share/biton/stdlib/"

# The staged compiler must find the staged stdlib, not the source tree it was built from.
probe="$(mktemp -d)"
trap 'rm -rf "$probe"' EXIT
printf 'import std.vec.{vec}\nfn main() int {\n    v := vec[int]()\n    v.push(1)\n    print("ok {v.len()}")\n    return 0\n}\n' > "$probe/main.bit"
BITON_SOURCE_DIR="$out/share/biton" "$out/bin/biton" --check "$probe/main.bit" \
  || { echo "the staged compiler cannot check a program against the staged stdlib" >&2; exit 1; }

"$out/bin/biton" --version > "$out/VERSION"
if git -C "$repo" rev-parse --short HEAD >/dev/null 2>&1; then
  echo "source $(git -C "$repo" log -1 --format='%h %s')" >> "$out/VERSION"
fi
echo "staged $(head -1 "$out/VERSION") ($(basename "$build")) into $out"
