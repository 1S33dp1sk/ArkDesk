# ArkDesk/scripts/unix-orchestrate.sh
#!/usr/bin/env bash
set -euo pipefail

# Sibling layout:
#   <workspace>/ArkDesk   (this script lives here)
#   <workspace>/ArkPy
#   <workspace>/ArknetX

# Defaults
ARKPY_TARGET="build"
ARKNETX_TARGET="all"
SKIP_NODE=0
CI_MODE=0
WORKSPACE=""
ARKPY_PATH=""
ARKNETX_PATH=""
COPY_DEPS=0   # copies shared libs (*.so/.dylib) alongside executables

# Args
while [[ $# -gt 0 ]]; do
  case "$1" in
    --arkpy-target)      ARKPY_TARGET="$2"; shift 2;;
    --arknetx-target)    ARKNETX_TARGET="$2"; shift 2;;
    --skip-node)         SKIP_NODE=1; shift;;
    --ci)                CI_MODE=1; shift;;
    --workspace)         WORKSPACE="$2"; shift 2;;
    --arkpy)             ARKPY_PATH="$2"; shift 2;;
    --arknetx)           ARKNETX_PATH="$2"; shift 2;;
    --copy-deps)         COPY_DEPS=1; shift;;
    -h|--help) cat <<EOF
Usage: bash scripts/unix-orchestrate.sh [options]
  --arkpy-target <t>       Make target for ArkPy (default: build)
  --arknetx-target <t>     Make target for ArknetX (default: all)
  --workspace <dir>        Override siblings root
  --arkpy <dir>            Override ArkPy path
  --arknetx <dir>          Override ArknetX path
  --skip-node              Skip npm step
  --ci                     Use npm ci (no audit/fund)
  --copy-deps              Also copy *.so (Linux) / *.dylib (macOS)
EOF
      exit 0;;
    *) echo "error: unknown arg '$1'"; exit 2;;
  esac
done

# Paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ARKDESK="$(cd "$SCRIPT_DIR/.." && pwd)"
if [[ -z "${WORKSPACE}" ]]; then WORKSPACE="$(cd "$ARKDESK/.." && pwd)"; fi
[[ -z "${ARKPY_PATH}"   ]] && ARKPY_PATH="$WORKSPACE/ArkPy"
[[ -z "${ARKNETX_PATH}" ]] && ARKNETX_PATH="$WORKSPACE/ArknetX"

# OS mapping
uname_s="$(uname -s)"
case "$uname_s" in
  Darwin*) OS_TAG="macos";  BIN_OS="darwin"; SHLIB_EXT="dylib";;
  Linux*)  OS_TAG="linux";  BIN_OS="linux";  SHLIB_EXT="so";;
  *) echo "error: unsupported OS: $uname_s"; exit 1;;
esac

echo "== Orchestrate Build =="
printf '%-10s %s\n' "ArkDesk:"  "$ARKDESK"
printf '%-10s %s\n' "ArkPy:"    "$ARKPY_PATH"
printf '%-10s %s\n' "ArknetX:"  "$ARKNETX_PATH"
printf '%-10s %s\n' "OS:"       "$OS_TAG"

# 1) ArkPy → wheelhouse
echo
echo "[ArkPy] make ${ARKPY_TARGET}"
make -C "$ARKPY_PATH" "${ARKPY_TARGET}"

# 2) ArknetX → native bins
echo
echo "[ArknetX] make ${ARKNETX_TARGET}"
make -C "$ARKNETX_PATH" "${ARKNETX_TARGET}"

# 3) Stage outputs → ArkDesk/resources/bin/<os> and mirror to src-tauri/bin
BIN_SRC="$ARKNETX_PATH/build/bin/${BIN_OS}"
RES_ROOT="$ARKDESK/resources/bin"
WIN_RES="$RES_ROOT/windows"  # created empty for consistency
MAC_RES="$RES_ROOT/macos"
LIN_RES="$RES_ROOT/linux"
DEV_BIN="$ARKDESK/src-tauri/bin"

mkdir -p "$WIN_RES" "$MAC_RES" "$LIN_RES" "$DEV_BIN"

if [[ -d "$BIN_SRC" ]]; then
  echo "[bundle] source: $BIN_SRC"
  case "$OS_TAG" in
    macos)
      # executables (+ optional dylibs with --copy-deps)
      find "$BIN_SRC" -maxdepth 1 -type f -perm -111 -print0 \
        | xargs -0 -I{} cp -f "{}" "$MAC_RES/"
      if [[ $COPY_DEPS -eq 1 ]]; then
        find "$BIN_SRC" -maxdepth 1 -type f -name '*.dylib' -print0 \
          | xargs -0 -I{} cp -f "{}" "$MAC_RES/"
      fi
      cp -f "$MAC_RES/"* "$DEV_BIN/" 2>/dev/null || true
      ;;
    linux)
      find "$BIN_SRC" -maxdepth 1 -type f -perm -111 -print0 \
        | xargs -0 -I{} cp -f "{}" "$LIN_RES/"
      if [[ $COPY_DEPS -eq 1 ]]; then
        find "$BIN_SRC" -maxdepth 1 -type f \( -name '*.so' -o -name '*.so.*' \) -print0 \
          | xargs -0 -I{} cp -f "{}" "$LIN_RES/"
      fi
      cp -f "$LIN_RES/"* "$DEV_BIN/" 2>/dev/null || true
      ;;
  esac
  echo "[bundle] staged -> $RES_ROOT/$OS_TAG and mirrored -> $DEV_BIN"
else
  echo "[bundle] warn: bin source not found: $BIN_SRC"
fi


# 4) Node/Tauri — anti-recursion (install only in npm prebuild)
if [[ $SKIP_NODE -eq 0 ]]; then
  pushd "$ARKDESK" >/dev/null
  if [[ -f package-lock.json ]]; then
    if [[ $CI_MODE -eq 1 ]]; then npm ci --no-audit --no-fund; else npm ci; fi
  else
    if [[ $CI_MODE -eq 1 ]]; then npm install --no-audit --no-fund; else npm install; fi
  fi
  if [[ "${npm_lifecycle_event:-}" != "prebuild" && "${npm_config_lifecycle_event:-}" != "prebuild" ]]; then
    npm run build
  else
    echo "[node] prebuild context -> install only (skip 'npm run build')"
  fi
  popd >/dev/null
fi

echo
echo "OK."
