#!/bin/sh
# Sign native Node.js addons for macOS Gatekeeper.
# Uses a Developer ID if available, otherwise falls back to ad-hoc signing.
# Also removes the quarantine flag that macOS sets on downloaded binaries.
# Runs automatically as an npm postinstall hook.

set -e

# Only run on macOS
case "$(uname -s)" in
    Darwin) ;;
    *) exit 0 ;;
esac

# Find argon2.node (may not exist if optional dep was skipped)
ARGON2_NODE="$(find node_modules/argon2 -name 'argon2.node' 2>/dev/null | head -1)"
if [ -z "$ARGON2_NODE" ]; then
    exit 0
fi

# Remove quarantine flag (set by macOS on downloaded/npm-installed binaries)
xattr -dr com.apple.quarantine node_modules/argon2 2>/dev/null || true

# Try to find a signing identity (Developer ID first, then Apple Development)
IDENTITY=$(security find-identity -v -p codesigning 2>/dev/null \
    | grep -E "Developer ID Application|Apple Development" \
    | head -1 \
    | sed 's/.*"\(.*\)".*/\1/' || true)

if [ -n "$IDENTITY" ]; then
    echo "Signing $ARGON2_NODE with: $IDENTITY"
    codesign -s "$IDENTITY" --force "$ARGON2_NODE"
else
    echo "No signing identity found — ad-hoc signing $ARGON2_NODE"
    codesign -s - --force "$ARGON2_NODE"
fi

codesign -dv "$ARGON2_NODE" 2>&1 | grep -E "^(Signature|TeamIdentifier)"
