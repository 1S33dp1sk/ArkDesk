# ===== ArkDesk Makefile (MSYS npm i + PowerShell build + DLL/EXE copy) =====

SHELL := /usr/bin/bash

.ONESHELL:
.SHELLFLAGS := -eo pipefail -c

ARKDESK_DIR := $(abspath .)
SRC_TAURI   := $(ARKDESK_DIR)/src-tauri
RES_DIR     := $(SRC_TAURI)/resources
BIN_DIR     := $(RES_DIR)/bin
WHEELS_DIR  := $(RES_DIR)/wheels
VENV_DIR    := $(ARKDESK_DIR)/.venv-build
LOG_DIR     := $(ARKDESK_DIR)/.build-logs

# --- Robust venv python finder (handles Windows/MSYS layouts) ---
define _GET_PYV
if [ -x "$(VENV_DIR)/Scripts/python.exe" ]; then PYV="$(VENV_DIR)/Scripts/python.exe"; \
elif [ -x "$(VENV_DIR)/Scripts/python3.exe" ]; then PYV="$(VENV_DIR)/Scripts/python3.exe"; \
elif [ -x "$(VENV_DIR)/bin/python3" ]; then PYV="$(VENV_DIR)/bin/python3"; \
elif [ -x "$(VENV_DIR)/bin/python3.exe" ]; then PYV="$(VENV_DIR)/bin/python3.exe"; \
elif [ -x "$(VENV_DIR)/bin/python" ]; then PYV="$(VENV_DIR)/bin/python"; \
elif [ -x "$(VENV_DIR)/bin/python.exe" ]; then PYV="$(VENV_DIR)/bin/python.exe"; \
else \
  echo "[venv] could not locate python inside $(VENV_DIR)"; \
  echo "[venv] contents:"; (ls -la "$(VENV_DIR)"; ls -la "$(VENV_DIR)/bin" 2>/dev/null || true; ls -la "$(VENV_DIR)/Scripts" 2>/dev/null || true); \
  exit 1; \
fi
endef

# Repos (override if paths differ)
ARKNETX_DIR ?= $(abspath ../ArknetX)
ARKPY_DIR   ?= $(abspath ../ArkPy)

# Tools
NPM ?= npm
POWERSHELL ?= $(or \
  $(shell command -v pwsh.exe 2>/dev/null), \
  $(shell command -v powershell.exe 2>/dev/null), \
  powershell.exe)

# Windows path for PowerShell
HAVE_CYGPATH := $(shell command -v cygpath 2>/dev/null)
ARKDESK_WIN := $(ARKDESK_DIR)
ifeq ($(OS),Windows_NT)
ifneq ($(HAVE_CYGPATH),)
  ARKDESK_WIN := $(shell cygpath -w '$(ARKDESK_DIR)')
endif
endif

# Python (py -3 | python3 | python)
PY := $(strip \
  $(shell (py -3 -c "import sys;print(1)" >/dev/null 2>&1 && echo py -3) || \
                (python3 -c "import sys;print(1)" >/dev/null 2>&1 && echo python3) || \
                (python  -c "import sys;print(1)" >/dev/null 2>&1 && echo python)))
ifeq ($(PY),)
  $(error No Python 3 found. Install Python 3.9+ or run: make PY=python3)
endif

# Non-interactive npm/pip
export CI=1
export npm_config_audit=false
export npm_config_fund=false
export npm_config_progress=false
export npm_config_update_notifier=false
export npm_config_loglevel=warn
export MSYS2_ARG_CONV_EXCL=*
export PIP_DISABLE_PIP_VERSION_CHECK=1

.PHONY: all prepare bins copy-binaries venv wheels-all wheels node-deps \
        ps-build tauri web check-stage clean-stage clean print

# ---------------------------------------------------------------------------

all: prepare ps-build

prepare: bins copy-binaries wheels-all check-stage

# --- ArknetX bins ------------------------------------------------------------
bins:
	@echo "==> ArknetX ship → $(SRC_TAURI)/resources/bin/<os>"
	@$(MAKE) -C "$(ARKNETX_DIR)" ship ARKDESK_ROOT="$(SRC_TAURI)"

# Copy .exe and .dll from common ArknetX output dirs to windows staging
copy-binaries:
	@echo "==> Staging ArknetX *.exe/*.dll → $(SRC_TAURI)/resources/bin/windows"
	@dst="$(SRC_TAURI)/resources/bin/windows"; \
	mkdir -p "$$dst"; \
	for d in \
	  "$(ARKNETX_DIR)/build/bin/windows" \
	  "$(ARKNETX_DIR)/build/bin" \
	  "$(ARKNETX_DIR)/bin/windows" \
	  "$(ARKNETX_DIR)/bin" \
	  "$(ARKNETX_DIR)/target/release" \
	  "$(ARKNETX_DIR)/target/debug" ; do \
	  if [ -d "$$d" ]; then \
	    find "$$d" -maxdepth 1 -type f \( -name '*.exe' -o -name '*.dll' \) -exec cp -f {} "$$dst/" \; ; \
	  fi; \
	done || true
	@echo "Shipped → $(SRC_TAURI)/resources/bin/windows"

# --- ArkPy wheels in private venv -------------------------------------------

# --- ArkPy wheels in private venv -------------------------------------------

venv:
	@echo "==> Creating build venv at $(VENV_DIR) using [$(PY)]"
	# If a folder exists but is missing its config, nuke and recreate
	if [ -d "$(VENV_DIR)" ] && [ ! -f "$(VENV_DIR)/pyvenv.cfg" ]; then
	  echo "[venv] existing folder looks broken; removing"
	  rm -rf "$(VENV_DIR)"
	fi

	ok=0
	echo "[venv] trying: $(PY) -m venv '$(VENV_DIR)'"
	if $(PY) -m venv "$(VENV_DIR)"; then ok=1; fi

	if [ "$$ok" -ne 1 ] && command -v py >/dev/null 2>&1; then
	  echo "[venv] trying: py -3 -m venv '$(VENV_DIR)'"
	  if py -3 -m venv "$(VENV_DIR)"; then ok=1; fi
	fi

	if [ "$$ok" -ne 1 ] && command -v python >/dev/null 2>&1; then
	  echo "[venv] trying: python -m venv '$(VENV_DIR)'"
	  if python -m venv "$(VENV_DIR)"; then ok=1; fi
	fi

	# Verify it actually exists and is a real venv
	if [ "$$ok" -ne 1 ] || [ ! -f "$(VENV_DIR)/pyvenv.cfg" ]; then
	  echo "[venv] failed to create virtualenv at $(VENV_DIR)"
	  echo "[venv] $(PY) resolves to: $$(command -v $(PY) || true)"
	  exit 1
	fi

	# Locate interpreter inside venv and upgrade bootstrap pkgs
	$(call _GET_PYV)
	echo "==> Upgrading pip/setuptools/wheel in venv (using $$PYV)"
	unset PYTHONHOME PYTHONPATH
	"$$PYV" -m pip --version >/dev/null 2>&1 || true
	"$$PYV" -m pip install -U pip setuptools wheel

wheels-all: venv
	@echo "==> Building ArkPy wheels (with deps) → $(WHEELS_DIR)"
	mkdir -p "$(WHEELS_DIR)"
	test -d "$(ARKPY_DIR)" && test -f "$(ARKPY_DIR)/pyproject.toml" \
	  || { echo "ArkPy not found (ARKPY_DIR=$(ARKPY_DIR))"; exit 2; }

	$(call _GET_PYV)
	unset PYTHONHOME PYTHONPATH

	cd "$(ARKPY_DIR)"
	rm -rf wheelhouse && mkdir -p wheelhouse
	"$$PYV" -m pip wheel --no-cache-dir --wheel-dir wheelhouse .
	cp -f wheelhouse/*.whl "$(WHEELS_DIR)/"

wheels: venv
	@echo "==> Building ArkPy wheel (no deps) → $(WHEELS_DIR)"
	mkdir -p "$(WHEELS_DIR)"
	test -d "$(ARKPY_DIR)" && test -f "$(ARKPY_DIR)/pyproject.toml" \
	  || { echo "ArkPy not found (ARKPY_DIR=$(ARKPY_DIR))"; exit 2; }

	$(call _GET_PYV)
	unset PYTHONHOME PYTHONPATH

	"$$PYV" -m pip install -U build
	cd "$(ARKPY_DIR)"
	"$$PYV" -m build --wheel
	cp -f dist/*.whl "$(WHEELS_DIR)/"

# --- Frontend ---------------------------------------------------------------
node-deps:
	@echo "==> npm install (MSYS) using $(NPM)"
	@cd "$(ARKDESK_DIR)" && "$(NPM)" i

# Build using a temp PowerShell script (pins Windows Node/npm)
ps-build: node-deps
	@mkdir -p "$(LOG_DIR)"
	@echo "==> npm run build via PowerShell"
	@PS1="$(LOG_DIR)/arkdesk-build.ps1"; \
	{ \
	  printf "param([Parameter(Mandatory=\$$true)][string]\$$ProjectPath)\n\n"; \
	  printf "if (-not (Test-Path -LiteralPath \$$ProjectPath)) { Write-Error 'Project path not found: ' + \$$ProjectPath; exit 1 }\n"; \
	  printf "\$$nodeCmd = Get-Command node.exe -ErrorAction SilentlyContinue -All | Where-Object { \$$_.Path -match '\\\\Program Files\\\\nodejs\\\\' } | Select-Object -First 1\n"; \
	  printf "if (-not \$$nodeCmd) { \$$nodeCmd = Get-Command node.exe -ErrorAction SilentlyContinue | Select-Object -First 1 }\n"; \
	  printf "if (-not \$$nodeCmd) { Write-Error 'node.exe not found on PATH'; exit 1 }\n"; \
	  printf "\$$nodeDir = Split-Path -LiteralPath (\$$nodeCmd.Path) -Parent\n"; \
	  printf "\$$npmCmd  = Join-Path \$$nodeDir 'npm.cmd'\n"; \
	  printf "if (-not (Test-Path -LiteralPath \$$npmCmd)) { Write-Error ('npm.cmd not found next to node.exe at ' + \$$nodeDir); exit 1 }\n"; \
	  printf "\$$env:Path = \$$nodeDir + ';' + \$$env:SystemRoot + '\\\\System32'\n"; \
	  printf "Remove-Item Env:NODE_PATH -ErrorAction SilentlyContinue | Out-Null\n"; \
	  printf "Set-Location -LiteralPath \$$ProjectPath\n"; \
	  printf "if (-not (Test-Path -LiteralPath 'package.json')) { Write-Error ('package.json not found in ' + \$$ProjectPath); exit 1 }\n"; \
	  printf "& \$$npmCmd run build\n"; \
	  printf "exit \$$LASTEXITCODE\n"; \
	} > "$$PS1"; \
	"$(POWERSHELL)" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "$$PS1" "$(ARKDESK_WIN)"

# Aliases
tauri: ps-build
web: ps-build

# --- Sanity & Cleaning ------------------------------------------------------
check-stage:
	@echo "==> Verifying staged payload"
	@bins_found=$$(find "$(BIN_DIR)" -maxdepth 2 -type f 2>/dev/null | head -n 1); \
	if [ -z "$$bins_found" ]; then echo "no bins staged under $(BIN_DIR)"; exit 1; fi; \
	wheels_found=$$(ls -1 "$(WHEELS_DIR)"/*.whl 2>/dev/null | head -n 1 || true); \
	if [ -z "$$wheels_found" ]; then echo "no wheels in $(WHEELS_DIR)"; exit 1; fi; \
	echo "ok"

clean-stage:
	@rm -rf "$(BIN_DIR)" "$(WHEELS_DIR)"

clean:
	@$(MAKE) -C "$(ARKNETX_DIR)" clean || true
	@rm -rf "$(SRC_TAURI)/target" "$(VENV_DIR)"
	@$(MAKE) clean-stage

print:
	@echo ARKDESK_DIR=$(ARKDESK_DIR)
	@echo SRC_TAURI=$(SRC_TAURI)
	@echo RES_DIR=$(RES_DIR)
	@echo ARKNETX_DIR=$(ARKNETX_DIR)
	@echo ARKPY_DIR=$(ARKPY_DIR)
	@echo BIN_DIR=$(BIN_DIR)
	@echo WHEELS_DIR=$(WHEELS_DIR)
	@echo VENV_DIR=$(VENV_DIR)
	@echo PY=$(PY)
	@echo NPM=$(NPM)
	@echo POWERSHELL=$(POWERSHELL)
	@echo ARKDESK_WIN=$(ARKDESK_WIN)
