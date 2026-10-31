#!/usr/bin/env bash
# Throw hostile programs at a running deployment and check the isolation
# holds. Run after `docker compose up` (and in CI before a release):
#
#   scripts/security-check.sh [http://127.0.0.1:8080]
#
# Every program calls libc `system()` through ~>extern("C"), which any user
# can do, so this checks what a shell inside a job can reach.
set -uo pipefail
API="${1:-http://127.0.0.1:8080}"
fail=0

# run <shell command> -> prints JSON {exit, signal, timedOut, truncated, out}
# Waits and retries when the API's rate limit answers 429.
run() {
  local body headers status wait
  body="$(jq -n --arg c "$1" '{mode: "run", code: ("~>extern(\"C\")\ndef system(cmd: string) => int;\ndef main() => int { system(\"" + ($c | gsub("\""; "\\\"")) + "\"); give 0; }")}')"
  for _ in 1 2 3 4 5 6; do
    headers="$(mktemp)"
    out="$(curl -s --max-time 30 -D "$headers" "$API/api/compile" -H 'content-type: application/json' -d "$body")"
    status="$(head -1 "$headers" | awk '{print $2}')"
    wait="$(grep -i '^retry-after:' "$headers" | tr -dc '0-9')"
    rm -f "$headers"
    [[ "$status" == "429" ]] || break
    echo "      (rate limited, waiting ${wait:-5}s)" >&2
    sleep "${wait:-5}"
  done
  echo "$out" | jq -c '{exit: .run.exitCode, signal: .run.signal, timedOut: .run.timedOut, truncated: .run.truncated, out: ((.run.stdout // "") + (.run.stderr // "") + (.compilerOutput // "") + (.error // ""))}'
}

check() { # name, command, jq condition on the result
  local result
  result="$(run "$2")"
  if echo "$result" | jq -e "$3" >/dev/null 2>&1; then
    echo "PASS  $1"
  else
    echo "FAIL  $1: $result"
    fail=1
  fi
}

check "jobs do not run as root"          'id -u'                                              '.out | test("^0\\b") | not'
check "no internet access"               'bash -c "exec 3<>/dev/tcp/1.1.1.1/443" && echo OPEN' '.out | test("OPEN") | not'
check "no DNS"                           'getent hosts example.com && echo RESOLVED'          '.out | test("RESOLVED") | not'
check "worker token not readable"        'cat /proc/1/environ; env'                           '.out | test("WORKER_TOKEN") | not'
check "other job dirs not listable"      'ls /jobs && echo LISTED'                            '.out | test("LISTED") | not'
check "root filesystem read-only"        'touch /app/x /usr/x 2>/dev/null && echo WROTE'      '.out | test("WROTE") | not'
check "memory limit"                     'head -c 600m /dev/zero | tail -c 600m > /dev/null || echo LIMITED' '.out | test("LIMITED") or .signal != null'
check "process limit (fork bomb)"        'bash -c "f(){ f|f & }; f" >/dev/null 2>&1; sleep 1; echo done' '.exit != null or .timedOut'
check "slot usable after fork bomb"      'echo alive'                                         '.out | test("alive")'
check "slot usable after fork bomb (2)"  'echo alive'                                         '.out | test("alive")'
check "escaped process started"          'setsid sleep 300 </dev/null >/dev/null 2>&1 & echo started' '.out | test("started")'
check "escaped process was killed"       'ps -eo cmd | grep "[s]leep 300" || echo clean'      '.out | test("clean")'
check "escaped process was killed (2)"   'ps -eo cmd | grep "[s]leep 300" || echo clean'      '.out | test("clean")'
check "wall-clock timeout"               'sleep 60'                                           '.timedOut == true'
check "output cap"                       'yes'                                                '.truncated == true'

exit $fail
