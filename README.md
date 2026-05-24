# cursor_tags

A patch that upgrades the chat sidebar in Cursor: labels, a separate Tagged section, pin moved into the context menu, unread indication relocated to the title color, and per-chat cost.

## What it does

- **Labels on chats.** Right-click a chat → pick a label (IMPORTANT / REVIEW / TODO or whatever you define). The label icon takes the slot of the native status dot, and a thin colored stripe appears on the left side of the chat row.
- **Tagged section** in the sidebar. A separate group below Pinned that lists every chat with a label. Click switches to the chat; right-click opens the same menu as on the original.
- **Pin / Unpin moved into the context menu.** The native dot/pin button is now occupied by our label icon, so Pin/Unpin lives in our menu.
- **Unread indication via title color.** Cursor used to show that a chat has a new reply by coloring the dot — we covered the dot with our icon, so the state was moved onto the chat title color (blue = there's something new).
- **Workspace names in bold.** So they stand out from chat names below them.
- **Per-chat cost.** A `💰 Cost: $X.XX` line in the context menu shows the total spent on this chat (via Cursor's private billing API). Click the line to force-refresh; otherwise the value is cached for 10 minutes.

## Install

```powershell
git clone git@github.com:anton2riot/cursor_tags.git
cd cursor_tags
.\install.ps1
```

Restart Cursor.

## Update

```powershell
git pull
```

`install.ps1` runs automatically via a git hook. If for any reason it doesn't, run it manually.

When Cursor auto-updates itself, the patch is wiped — just re-run `.\install.ps1`.

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

After editing, run `.\install.ps1` and restart Cursor.

## Uninstall

```powershell
.\uninstall.ps1
```

Marks on chats stay in `localStorage` — if you reinstall later, they come back.

---

Implementation details and dev helpers — see [INTERNALS.md](./INTERNALS.md).
