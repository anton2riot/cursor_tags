#!/usr/bin/env bash
# cursor_tags - install/update patch (macOS / Linux)
# Idempotent: safe to run multiple times.
#
# composers.js (static snapshot of composerId↔name) is NOT generated on
# non-Windows: the runtime fetch/XHR hook in chat-labels.js captures composerId
# on first open. Chats created or opened after install will get costs without
# any extra step.

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PATCH_DIR="$SCRIPT_DIR/patch"

if [ ! -d "$PATCH_DIR" ]; then
    echo "[cursor_tags] ERROR: patch/ folder not found next to install.sh" >&2
    exit 1
fi

# 1. Locate Cursor install
case "$(uname -s)" in
    Darwin)
        CANDIDATES=(
            "/Applications/Cursor.app/Contents/Resources/app/out/vs/code/electron-sandbox/workbench"
            "$HOME/Applications/Cursor.app/Contents/Resources/app/out/vs/code/electron-sandbox/workbench"
        )
        ;;
    Linux)
        CANDIDATES=(
            "/opt/Cursor/resources/app/out/vs/code/electron-sandbox/workbench"
            "/opt/cursor/resources/app/out/vs/code/electron-sandbox/workbench"
            "/usr/share/cursor/resources/app/out/vs/code/electron-sandbox/workbench"
            "$HOME/.local/share/cursor/resources/app/out/vs/code/electron-sandbox/workbench"
        )
        ;;
    *)
        echo "[cursor_tags] ERROR: unsupported OS: $(uname -s)" >&2
        echo "  Use install.ps1 on Windows." >&2
        exit 1
        ;;
esac

if [ -n "$CURSOR_WORKBENCH" ]; then
    CANDIDATES=("$CURSOR_WORKBENCH" "${CANDIDATES[@]}")
fi

WORKBENCH_DIR=""
for c in "${CANDIDATES[@]}"; do
    if [ -f "$c/workbench.html" ]; then
        WORKBENCH_DIR="$c"
        break
    fi
done
if [ -z "$WORKBENCH_DIR" ]; then
    echo "[cursor_tags] ERROR: Cursor install not found. Checked:" >&2
    for c in "${CANDIDATES[@]}"; do echo "  $c" >&2; done
    echo "" >&2
    echo "  Pass the path explicitly: CURSOR_WORKBENCH=/path/to/.../workbench ./install.sh" >&2
    exit 1
fi
echo "[cursor_tags] Cursor found: $WORKBENCH_DIR"

TARGET_PATCH_DIR="$WORKBENCH_DIR/cursor-chat-labels"
WORKBENCH_HTML="$WORKBENCH_DIR/workbench.html"

# 2. Decide whether we need sudo for writes
SUDO=""
if ! { [ -w "$WORKBENCH_DIR" ] && { [ ! -e "$WORKBENCH_HTML" ] || [ -w "$WORKBENCH_HTML" ]; }; }; then
    if command -v sudo >/dev/null 2>&1; then
        echo "[cursor_tags] note: $WORKBENCH_DIR needs elevated write — re-running operations under sudo"
        SUDO="sudo"
    else
        echo "[cursor_tags] ERROR: no write permission and sudo not available" >&2
        exit 1
    fi
fi

# 3. Copy patch/* into cursor-chat-labels/
$SUDO mkdir -p "$TARGET_PATCH_DIR"
$SUDO cp -R "$PATCH_DIR"/. "$TARGET_PATCH_DIR/"
echo "[cursor_tags] Patch files copied to $TARGET_PATCH_DIR"

# 4. Idempotent <script> injection into workbench.html via perl.
# Strip any previous block, then insert before </head>.
TMP="$(mktemp)"
$SUDO cp "$WORKBENCH_HTML" "$TMP"
perl -i -0pe 's|\s*<!-- cursor-chat-labels:start -->.*?<!-- cursor-chat-labels:end -->\s*|\n\t|gs' "$TMP"
if ! grep -q '</head>' "$TMP"; then
    echo "[cursor_tags] ERROR: </head> not found in workbench.html" >&2
    rm -f "$TMP"
    exit 1
fi
perl -i -0pe 's|</head>|\n\t\t<!-- cursor-chat-labels:start -->\n\t\t<script src="./cursor-chat-labels/chat-labels.js" type="module"></script>\n\t\t<!-- cursor-chat-labels:end -->\n\t</head>|' "$TMP"
$SUDO cp "$TMP" "$WORKBENCH_HTML"
rm -f "$TMP"
echo "[cursor_tags] workbench.html updated"

# 5. Set up git hook (once)
if [ -d "$SCRIPT_DIR/.git" ]; then
    if [ "$(cd "$SCRIPT_DIR" && git config --local core.hooksPath 2>/dev/null)" != ".githooks" ]; then
        (cd "$SCRIPT_DIR" && git config --local core.hooksPath .githooks)
        echo "[cursor_tags] git hooks enabled (core.hooksPath = .githooks)"
    fi
fi

# 6. composers.js note
echo "[cursor_tags] note: composers.js not generated on non-Windows."
echo "[cursor_tags]       Cost feature works via runtime capture — open each chat once"
echo "[cursor_tags]       and the cost line will populate from the next right-click."

# 7. Check if Cursor is running
if pgrep -ix Cursor >/dev/null 2>&1 || pgrep -ix cursor >/dev/null 2>&1; then
    echo ""
    echo "[cursor_tags] NOTE: Cursor is running. Restart it for the patch to activate."
else
    echo ""
    echo "[cursor_tags] Done. You can start Cursor now."
fi
