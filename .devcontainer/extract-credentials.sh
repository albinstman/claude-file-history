#!/bin/bash
# Runs on the HOST before container starts (initializeCommand)
# Extracts credentials from macOS Keychain and writes them to
# temp files that get bind-mounted into the container.

set -e

CLAUDE_CREDS_FILE="/tmp/claude-devcontainer-credentials.json"
GH_TOKEN_FILE="/tmp/gh-devcontainer-token"

# Ensure ~/.claude.json exists so the bind mount doesn't fail
if [[ ! -f "${HOME}/.claude.json" ]]; then
    echo "{}" > "${HOME}/.claude.json"
    chmod 600 "${HOME}/.claude.json"
    echo "Created empty ${HOME}/.claude.json for devcontainer bind mount"
fi

if [[ "$(uname)" == "Darwin" ]]; then
    # --- Claude Code OAuth credentials ---
    echo "macOS detected, extracting Claude Code credentials from Keychain..."
    CREDS=$(security find-generic-password -s "Claude Code-credentials" -w 2>/dev/null || true)
    # Remove .credentials.json from host ~/.claude/ if it exists.
    # On macOS, credentials live in Keychain — a stale file here can
    # interfere with host authentication.
    rm -f "${HOME}/.claude/.credentials.json"

    if [[ -n "$CREDS" ]]; then
        echo "$CREDS" > "$CLAUDE_CREDS_FILE"
        chmod 600 "$CLAUDE_CREDS_FILE"
        echo "Claude Code credentials written to $CLAUDE_CREDS_FILE"
    else
        echo "Warning: Could not find Claude Code credentials in Keychain"
        echo "{}" > "$CLAUDE_CREDS_FILE"
        chmod 600 "$CLAUDE_CREDS_FILE"
    fi

else
    echo "Not macOS, skipping Claude Code keychain extraction"
    if [[ ! -f "$CLAUDE_CREDS_FILE" ]]; then
        echo "{}" > "$CLAUDE_CREDS_FILE"
        chmod 600 "$CLAUDE_CREDS_FILE"
    fi
fi

# --- GitHub CLI token (works on any OS with gh installed) ---
echo "Extracting GitHub CLI token..."
GH_TOKEN=$(gh auth token 2>/dev/null || true)
if [[ -n "$GH_TOKEN" ]]; then
    echo "$GH_TOKEN" > "$GH_TOKEN_FILE"
    chmod 600 "$GH_TOKEN_FILE"
    echo "GitHub CLI token written to $GH_TOKEN_FILE"
else
    echo "Warning: Could not get GitHub CLI token (is 'gh auth login' done on the host?)"
    if [[ ! -f "$GH_TOKEN_FILE" ]]; then
        echo "" > "$GH_TOKEN_FILE"
        chmod 600 "$GH_TOKEN_FILE"
    fi
fi
