#!/bin/bash
#
# install.sh — set up todobot
#

set -e

CYAN="\033[96m"
GREEN="\033[92m"
YELLOW="\033[93m"
RED="\033[91m"
DIM="\033[2m"
BOLD="\033[1m"
WHITE="\033[97m"
RESET="\033[0m"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TODO_BIN="$SCRIPT_DIR/todo"
LINK_DIR="$HOME/.local/bin"
LINK_PATH="$LINK_DIR/todo"

echo ""
echo -e "  ${YELLOW}  ┌─┤ ├─┐${RESET}  ${BOLD}${WHITE}t o d o b o t${RESET}"
echo -e "  ${YELLOW}  │ ◉ ◉ │${RESET}  ${DIM}installer${RESET}"
echo -e "  ${YELLOW}  └┬─┬─┬┘${RESET}"
echo ""

# ── Python ───────────────────────────────────────────────────────────────────
if ! command -v python3 &>/dev/null; then
    echo -e "  ${RED}✘${RESET}  python3 not found. Please install Python 3 first."
    exit 1
fi

PY_VERSION=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
echo -e "  ${GREEN}✔${RESET}  Found python3 ${DIM}(${PY_VERSION})${RESET}"

# ── gh CLI ───────────────────────────────────────────────────────────────────
if command -v gh &>/dev/null; then
    echo -e "  ${GREEN}✔${RESET}  Found gh CLI"
else
    echo -e "  ${DIM}  gh CLI not found — needed for cloud sync${RESET}"
    echo ""

    # Detect platform and offer install
    INSTALL_CMD=""
    if [[ "$(uname)" == "Darwin" ]]; then
        if command -v brew &>/dev/null; then
            INSTALL_CMD="brew install gh"
        else
            echo -e "  ${YELLOW}⚠${RESET}  Install Homebrew first (https://brew.sh) or get gh from https://cli.github.com"
        fi
    elif [[ "$(uname)" == "Linux" ]]; then
        if command -v apt-get &>/dev/null; then
            INSTALL_CMD="sudo apt-get install -y gh"
        elif command -v dnf &>/dev/null; then
            INSTALL_CMD="sudo dnf install -y gh"
        elif command -v pacman &>/dev/null; then
            INSTALL_CMD="sudo pacman -S --noconfirm github-cli"
        fi
    elif [[ "$(uname -s)" == MINGW* ]] || [[ "$(uname -s)" == MSYS* ]]; then
        if command -v winget &>/dev/null; then
            INSTALL_CMD="winget install --id GitHub.cli"
        elif command -v choco &>/dev/null; then
            INSTALL_CMD="choco install gh"
        fi
    fi

    if [ -n "$INSTALL_CMD" ]; then
        echo -ne "  ${CYAN}▸${RESET} Install gh with ${DIM}${INSTALL_CMD}${RESET}? [Y/n] "
        read -r answer
        if [[ ! "$answer" =~ ^[Nn]$ ]]; then
            echo ""
            eval "$INSTALL_CMD"
            echo ""
            if command -v gh &>/dev/null; then
                echo -e "  ${GREEN}✔${RESET}  gh CLI installed"
            else
                echo -e "  ${YELLOW}⚠${RESET}  gh install may need a new terminal to take effect"
            fi
        else
            echo -e "  ${DIM}  Skipped gh install — you can sync later with: todo sync${RESET}"
        fi
    elif [ -z "$INSTALL_CMD" ] && ! command -v gh &>/dev/null; then
        echo -e "  ${YELLOW}⚠${RESET}  Install gh manually from https://cli.github.com"
    fi
fi

# ── gh auth ──────────────────────────────────────────────────────────────────
if command -v gh &>/dev/null; then
    if gh auth status &>/dev/null; then
        GH_USER=$(gh api user --jq '.login' 2>/dev/null || echo "")
        if [ -n "$GH_USER" ]; then
            echo -e "  ${GREEN}✔${RESET}  gh authenticated as ${DIM}${GH_USER}${RESET}"
        else
            echo -e "  ${GREEN}✔${RESET}  gh authenticated"
        fi
    else
        echo -e "  ${DIM}  gh is not authenticated — needed for cloud sync${RESET}"
        echo -ne "  ${CYAN}▸${RESET} Run ${DIM}gh auth login${RESET} now? [Y/n] "
        read -r answer
        if [[ ! "$answer" =~ ^[Nn]$ ]]; then
            echo ""
            gh auth login
            echo ""
            if gh auth status &>/dev/null; then
                echo -e "  ${GREEN}✔${RESET}  gh authenticated"
            else
                echo -e "  ${YELLOW}⚠${RESET}  Auth incomplete — run ${DIM}gh auth login${RESET} later"
            fi
        else
            echo -e "  ${DIM}  Skipped — run ${DIM}gh auth login${RESET} when you're ready to sync"
        fi
    fi
fi
echo ""

# ── Make executable ──────────────────────────────────────────────────────────
chmod +x "$TODO_BIN"
echo -e "  ${GREEN}✔${RESET}  Marked ${DIM}todo${RESET} as executable"

# Create data directory (preserves existing data)
mkdir -p "$HOME/.todo"
echo -e "  ${GREEN}✔${RESET}  Data directory ${DIM}~/.todo/${RESET} ready"

# Create link directory and symlink
mkdir -p "$LINK_DIR"

if [ -L "$LINK_PATH" ]; then
    EXISTING=$(readlink "$LINK_PATH")
    if [ "$EXISTING" = "$TODO_BIN" ]; then
        echo -e "  ${GREEN}✔${RESET}  Symlink already in place"
    else
        echo -e "  ${YELLOW}⚠${RESET}  ${LINK_PATH} already points to ${DIM}${EXISTING}${RESET}"
        echo -ne "  ${CYAN}▸${RESET} Overwrite? [y/N] "
        read -r answer
        if [[ "$answer" =~ ^[Yy]$ ]]; then
            ln -sf "$TODO_BIN" "$LINK_PATH"
            echo -e "  ${GREEN}✔${RESET}  Symlink updated"
        else
            echo -e "  ${DIM}  Skipped symlink${RESET}"
        fi
    fi
elif [ -e "$LINK_PATH" ]; then
    echo -e "  ${YELLOW}⚠${RESET}  ${LINK_PATH} exists and is not a symlink"
    echo -e "  ${DIM}  Skipping — remove it manually if you want todobot there${RESET}"
else
    ln -s "$TODO_BIN" "$LINK_PATH"
    echo -e "  ${GREEN}✔${RESET}  Symlinked to ${DIM}${LINK_PATH}${RESET}"
fi

# Ensure ~/.local/bin is in PATH
SHELL_RC=""
if [ -n "$ZSH_VERSION" ] || [ "$(basename "$SHELL")" = "zsh" ]; then
    SHELL_RC="$HOME/.zshrc"
elif [ -n "$BASH_VERSION" ] || [ "$(basename "$SHELL")" = "bash" ]; then
    # On Linux, interactive terminals source .bashrc not .bash_profile
    if [ "$(uname)" = "Linux" ] && [ -f "$HOME/.bashrc" ]; then
        SHELL_RC="$HOME/.bashrc"
    else
        SHELL_RC="$HOME/.bash_profile"
    fi
fi

if echo "$PATH" | tr ':' '\n' | grep -qx "$LINK_DIR"; then
    echo -e "  ${GREEN}✔${RESET}  ${DIM}~/.local/bin${RESET} is already in PATH"
else
    if [ -n "$SHELL_RC" ]; then
        # Don't add if already present in the rc file
        if grep -qF 'export PATH="$HOME/.local/bin:$PATH"' "$SHELL_RC" 2>/dev/null; then
            echo -e "  ${GREEN}✔${RESET}  ${DIM}~/.local/bin${RESET} already in ${DIM}$(basename "$SHELL_RC")${RESET} (restart terminal to activate)"
        else
            echo '' >> "$SHELL_RC"
            echo '# todobot' >> "$SHELL_RC"
            echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$SHELL_RC"
            echo -e "  ${GREEN}✔${RESET}  Added ${DIM}~/.local/bin${RESET} to PATH in ${DIM}$(basename "$SHELL_RC")${RESET}"
            echo -e "  ${YELLOW}⚠${RESET}  Run ${CYAN}source ${SHELL_RC}${RESET} or open a new terminal to pick it up"
        fi
    else
        echo -e "  ${YELLOW}⚠${RESET}  Add ${DIM}~/.local/bin${RESET} to your PATH manually"
    fi
fi

echo ""
echo -e "  ${GREEN}${BOLD}All set!${RESET} Try it out:"
echo ""
echo -e "    ${CYAN}todo add \"my first task\"${RESET}"
echo -e "    ${CYAN}todo ls${RESET}"
echo -e "    ${CYAN}todo sync${RESET}  ${DIM}(set up cloud sync)${RESET}"
echo -e "    ${CYAN}todo${RESET}       ${DIM}(interactive mode)${RESET}"
echo ""
