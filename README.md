# cursor_tags

A patch that upgrades the chat sidebar in Cursor: labels, a separate Tagged section, Fork Chat back in the right-click menu, unread indication relocated to the title color, and a hotkey to cycle the chat model.

## What it does

- **Labels on chats.** Right-click a chat → pick a label (IMPORTANT / REVIEW / TODO or whatever you define). The label icon takes the slot of the native status dot, and a thin colored stripe appears on the left side of the chat row.
- **Tagged section** in the sidebar. A separate group below Pinned that lists every chat with a label. Click switches to the chat; right-click opens the same menu as on the original.
- **Fork Chat in the context menu.** Replacing the native right-click menu hid Cursor's "Fork Chat" action — we bring it back as a menu item that triggers the native fork.
- **Switch model by hotkey.** Press `Ctrl+Space` while the chat input is focused to cycle through a model pool you define (see below).
- **Unread indication via title color.** Cursor used to show that a chat has a new reply by coloring the dot — we covered the dot with our icon, so the state was moved onto the chat title color (blue = there's something new).
- **Workspace names in bold.** So they stand out from chat names below them.

## Install

**Windows:**
```powershell
git clone git@github.com:anton2riot/cursor_tags.git
cd cursor_tags
.\install.ps1
```

**macOS / Linux:**
```bash
git clone git@github.com:anton2riot/cursor_tags.git
cd cursor_tags
./install.sh
```

Restart Cursor.

## Update

```bash
git pull
```

The installer for your OS runs automatically via a git hook. If for any reason it doesn't, run it manually.

When Cursor auto-updates itself, the patch is wiped — just re-run the installer.

## Custom labels

The label set lives in `patch/labels.js`:

```js
export const labels = [
    { id: 'important', title: 'IMPORTANT', color: '#e34234', icon: '🔴' },
    { id: 'review',    title: 'REVIEW',    color: '#9b59b6', icon: '🔍' },
    { id: 'todo',      title: 'TODO',      color: '#3498db', icon: '📌' }
];
```

`id` is an internal key (not shown in the UI — don't change it on labels already in use or you'll lose the marks on chats). `title`, `color`, `icon` are what shows up in the menu and on the chat.

After editing, run the installer for your OS and restart Cursor (or run `__cursorChatLabelsReloadConfig()` in DevTools to reload without restarting).

## Model-switch hotkey

`Ctrl+Space` cycles the chat model. The pool and the hotkey live in `patch/models.js`:

```js
export const modelCycle = [
    { id: 'claude-opus-4-8',  match: 'Opus 4.8' },
    { id: 'gemini-3.5-flash', match: 'Gemini 3.5 Flash' },
    { id: 'composer-2.5',     match: 'Composer 2.5' }
];

export const cycleHotkey = { ctrl: true, meta: false, alt: false, shift: false, code: 'Space' };
```

- `id` — the model's testid in Cursor's picker (the part after `model-item-`). To see the available ids, open the model dropdown in a chat and run `__cursorChatLabelsInspectModel()` in DevTools.
- `match` — a substring used to recognize the *current* model from the picker button, so the hotkey knows where to continue the cycle from. If omitted, `id` is used.
- Order in the array = cycle order. The hotkey fires **only when the chat input is focused**, so it won't clobber `Ctrl+Space` (IntelliSense) in the code editor.
- `cycleHotkey` — change the combo here. Modifiers are booleans; `code` is a `KeyboardEvent.code` value (e.g. `Space`, `KeyM`, `Period`), or set `key` instead.

After editing, run the installer and restart Cursor (or `__cursorChatLabelsReloadConfig()` in DevTools to reload without restarting).

## Uninstall

```powershell
# Windows
.\uninstall.ps1
```

(macOS / Linux uninstall script not yet bundled — remove the `cursor-chat-labels/` folder from the workbench directory and the `<!-- cursor-chat-labels:start --> … :end -->` block from `workbench.html` by hand.)

Marks on chats stay in `localStorage` — if you reinstall later, they come back.

---

Implementation details and dev helpers — see [INTERNALS.md](./INTERNALS.md).
