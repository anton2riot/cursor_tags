# Internals

Implementation notes — for anyone who wants to dig in or extend the patch.

## What gets patched

The script is injected into Cursor's `workbench.html` via a `<script type="module">` tag. No binaries are modified. `uninstall.ps1` removes the injection and restores Cursor to its original state.

When Cursor auto-updates, `workbench.html` is overwritten and the injection is lost. Fix: re-run `install.ps1`.

## Layout

```
cursor_tags/
├── install.ps1                 # apply the patch
├── uninstall.ps1               # revert
├── extract-composers.cjs       # reads composer.composerHeaders from state.vscdb
├── README.md
├── INTERNALS.md                # this file
├── patch/
│   ├── chat-labels.js          # the injected script
│   └── labels.js               # label config
└── .githooks/
    └── post-merge              # auto-applies after git pull
```

## Key decisions

- **MutationObserver self-loop guard** — `suppressing` + `firedThisFrame` flags, plus idempotent `applyBadge` / `applyStatus` (the DOM is only touched if the state actually differs). Visual is restored after Cursor's re-renders within one animation frame (~16ms), no flicker.
- **Delegated `contextmenu`** on `document` with `capture=true` — the listener doesn't get lost when chat rows are re-rendered.
- **Left label stripe** — drawn via a `::before` pseudo-element with `--cl-color`. The earlier implementation used `box-shadow: inset` with `!important`, but Cursor sets its own inline `box-shadow` on focus/contextmenu, and inline-style beats stylesheet `!important`. A pseudo-element doesn't conflict with `box-shadow` at all.
- **Unread title color** — applied as an inline `!important` style directly on the element from JS. Stylesheet `!important` doesn't win against Cursor's CSS-in-JS or its own inline styles. Inline `!important` does.
- **Pin / Unpin click** — the native pin button is hidden via `display: none`. When our menu item fires, we temporarily un-hide it (inline `!important`) and dispatch the full chain `pointerdown → mousedown → pointerup → mouseup → click → btn.click()` (Solid listens on pointer events; a plain `click()` may not reach the handler), then hide it back on the next rAF.
- **Tagged header** — `cloneNode(true)` of the first child of the Pinned group (everything except `.ui-sidebar-group-content`). Event listeners aren't copied during cloning, so Cursor never wires itself to our copy. We strip `aria-expanded` / state classes / action buttons, then recursively remove the leftover empty wrapper divs (spacer areas) — otherwise they leave a gap before the chevron. The "Pinned" text is replaced with "Tagged".
- **Tagged items** — use Cursor's native row markup (`ui-sidebar-menu-item`, `ui-button`, `glass-sidebar-agent-menu-btn`, `ui-sidebar-menu-button-icon-wrapper`, `ui-text` + `ui-sidebar-menu-button-label` with the right `data-variant/size/weight`). Typography is inherited for free.
- **Thinking state** — defensive detection: `aria-busy`, regex against `className` of row/btn/status-dot, spinner-like elements inside the icon-wrapper, `animate`/`animateTransform`/`animate-spin` inside SVGs. When matched, our badge is removed so Cursor's native spinner remains visible in the slot.

## Cost feature

- `install.ps1` runs `extract-composers.cjs` via Cursor's bundled Node (`resources/helpers/node.exe`). The script reads `composer.composerHeaders` from `state.vscdb` and writes `composers.js` next to the patch — a `composerId ↔ chat title` map for the chats that existed at install time.
- For chats created after install, **live capture** kicks in: the patch wraps `window.fetch` and, whenever Cursor calls `api2.cursor.sh` with a `composerId`/`cloudAgentId` in the body, it pairs that id with the last chat clicked in the sidebar. The pair is stored in `localStorage`.
- When the context menu opens, the patch resolves `chat title → composerId` (live capture first, snapshot second; for duplicate titles, the most recent by `lastUpdatedAt`), calls `GetFilteredUsageEvents`, paginates through the events.
- Bearer token and `teamId` are captured on the fly from Cursor's own requests to `api2.cursor.sh` (same `fetch` wrapper).
- The result is cached for 10 minutes per `composerId`. Clicking the cost row force-refreshes without closing the menu.

**Limitations**: 30/829 chats in the snapshot share titles with other chats (including 56 untitled). For these, we take the most recent one, which may not match what you clicked. Once that chat is opened, live capture overrides the snapshot.

## DevTools helpers

```js
__cursorChatLabelsDebug()                 // observer state, found elements
__cursorChatLabelsReloadConfig()          // re-read labels.js without restarting Cursor
__cursorChatLabelsInspect()               // dump DOM of a chat row (for tweaking selectors)
__cursorChatLabelsInspectStyles()         // computed CSS of headers/items
__cursorChatLabelsClearCostCache()        // clear the cost cache
__cursorChatLabelsClearRuntimeComposers() // clear live-captured pairs
__cursorChatLabelsCleanup()               // remove the patch in the current window until restart
```

## If Cursor hangs

Open `workbench.html` inside Cursor's install directory (the path is printed by `install.ps1`) and delete the block between `<!-- cursor-chat-labels:start -->` and `<!-- cursor-chat-labels:end -->`. Or just run `.\uninstall.ps1` — it removes the injection and the patch directory from the install.
