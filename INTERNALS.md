# Internals

Технические детали — для тех, кто будет ковырять или дописывать.

## Что патчится

Скрипт инжектится в `workbench.html` Cursor'а через `<script type="module">`. Никаких бинарей не модифицируется. Удаление одной командой (`uninstall.ps1`) возвращает Cursor в исходное состояние.

После авто-обновления Cursor `workbench.html` перезаписывается → инжект пропадает. Лечится повторным `install.ps1`.

## Структура

```
cursor_tags/
├── install.ps1                 # пропатчить
├── uninstall.ps1               # откатить
├── extract-composers.cjs       # читает composer.composerHeaders из state.vscdb
├── README.md
├── INTERNALS.md                # этот файл
├── patch/
│   ├── chat-labels.js          # сам инжект
│   └── labels.js               # конфиг ярлыков
└── .githooks/
    └── post-merge              # авто-применение после git pull
```

## Ключевые решения

- **Self-loop guard у MutationObserver** — флаги `suppressing` + `firedThisFrame`, плюс идемпотентные applyBadge / applyStatus (DOM трогается только если состояние реально отличается). Восстановление визуала после ререндеров Cursor'а — за один кадр (~16ms), без мерцания.
- **Делегированный `contextmenu`** на `document` с capture=true — listener не теряется при ререндерах строк чата.
- **Полоска ярлыка слева** — через `::before` pseudo-element c `--cl-color`. Раньше использовал `box-shadow inset` с `!important`, но Cursor на focus/contextmenu выставлял свой `box-shadow` inline — inline-style побеждает stylesheet `!important`. Pseudo-element не конфликтует с `box-shadow` вообще.
- **Цвет label для unread** — inline-style `!important` напрямую на элементе через JS. Stylesheet `!important` не побеждает CSS-in-JS Cursor'а / его inline-style. Inline `!important` — побеждает.
- **Pin / Unpin click** — мы скрываем нативную pin-кнопку через `display: none`. При клике из нашего меню — временно показываем её (inline `!important`), палим всю цепочку `pointerdown → mousedown → pointerup → mouseup → click → btn.click()` (Solid слушает pointer-события, обычный `click()` может не дойти), затем через rAF снова прячем.
- **Tagged header** — `cloneNode(true)` от первого дочернего div группы Pinned (всё, что не `.ui-sidebar-group-content`). Listeners при клонировании не копируются — Cursor сюда не подключится. Снимаем aria-expanded / state-классы / action-кнопки, рекурсивно вычищаем оставшиеся пустые wrapper-div'ы (spacer-areas) — иначе они держат «пробелы» перед chevron'ом. Текст «Pinned» меняется на «Tagged».
- **Tagged items** — нативная разметка row Cursor'а (`ui-sidebar-menu-item`, `ui-button`, `glass-sidebar-agent-menu-btn`, `ui-sidebar-menu-button-icon-wrapper`, `ui-text` + `ui-sidebar-menu-button-label` с `data-variant/size/weight`). Typography наследуется бесплатно.
- **Thinking-state** — defensive: aria-busy, regex по className row/btn/status-dot, spinner-элементы в icon-wrapper, animate/animateTransform/animate-spin в SVG. Если поймали — наш бейдж убираем, нативный spinner Cursor'а в слоте виден как обычно.

## Стоимость чата

- `install.ps1` через bundled-node Cursor'а (`resources/helpers/node.exe`) запускает `extract-composers.cjs`, который читает `composer.composerHeaders` из `state.vscdb` и пишет `composers.js` рядом с патчем (`composerId ↔ имя чата`). Снимок «холодных» чатов на момент установки.
- Для чатов созданных уже после установки работает **live capture**: патч перехватывает `window.fetch` и при походе Cursor'а на `api2.cursor.sh` с `composerId`/`cloudAgentId` в теле — связывает его с последним кликнутым в сайдбаре чатом. Пара уходит в localStorage.
- При открытии меню патч резолвит `имя чата → composerId` (сначала live-capture, потом снапшот; для дублей имени — самый свежий по `lastUpdatedAt`), дёргает `GetFilteredUsageEvents`, складывает события постранично.
- Bearer-токен и `teamId` ловятся на лету из исходящих запросов Cursor'а на `api2.cursor.sh` (та же подмена `window.fetch`).
- Кэш — 10 минут на `composerId`, клик по строке стоимости форс-рефрешит без закрытия меню.

**Ограничения**: 30/829 чатов в снапшоте имеют дублирующиеся имена (включая 56 безымянных) — берётся самый свежий, что не всегда совпадает с тем, на чём ткнули. Если этот чат хоть раз открывали после установки — live capture перекроет снапшот.

## DevTools helpers

```js
__cursorChatLabelsDebug()                 // состояние observer'а, найденные элементы
__cursorChatLabelsReloadConfig()          // перечитать labels.js без рестарта Cursor
__cursorChatLabelsInspect()               // дамп DOM-структуры row (для подгонки селекторов)
__cursorChatLabelsInspectStyles()         // computed CSS заголовков/items
__cursorChatLabelsClearCostCache()        // сброс кэша стоимости
__cursorChatLabelsClearRuntimeComposers() // сброс live-captured пар
__cursorChatLabelsCleanup()               // снять патч в текущем окне до рестарта
```

## Что делать если Cursor завис

Открой `workbench.html` в установке Cursor (путь печатает `install.ps1`), удали блок между `<!-- cursor-chat-labels:start -->` и `<!-- cursor-chat-labels:end -->`. Или просто запусти `.\uninstall.ps1` — снимет инжект и удалит папку патча из установки.
