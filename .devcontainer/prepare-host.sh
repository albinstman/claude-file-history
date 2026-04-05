#!/bin/bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Extract credentials from the host (e.g. macOS Keychain) and write them to temp files for bind-mounting into the container
/usr/bin/env bash "${DIR}/extract-credentials.sh"