#!/usr/bin/env bash
# Atalho compatível para a configuração automática do wildcard MRO.BIO.

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
exec sudo bash "$SCRIPT_DIR/fix-published-subdomains.sh"