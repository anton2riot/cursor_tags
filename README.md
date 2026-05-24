# cursor_tags

Патч для Cursor: ставит на чаты в сайдбаре цветные ярлыки (ВАЖНО / ПРОВЕРИТЬ / TODO и любые свои). ПКМ по чату → выбрать ярлык.

![](./screenshot.png)

## Что патчится

Скрипт инжектится в `workbench.html` Cursor'а через `<script>`-тег. Никаких бинарей не модифицируется, обновление Cursor (или новая установка) — обратимо, удаление патча в одну команду.

## Установка

1. Склонировать репо в любое место:
   ```powershell
   git clone <url> C:\path\to\cursor_tags
   cd C:\path\to\cursor_tags
   ```
2. Запустить (PowerShell):
   ```powershell
   .\install.ps1
   ```
3. Перезапустить Cursor.

`install.ps1` найдёт установку Cursor сам (`%LOCALAPPDATA%\Programs\cursor` или `C:\Program Files\cursor`).

## Обновление

```powershell
git pull
```

Этого достаточно — `install.ps1` запускается автоматически из git-хука `post-merge`. Если хук не сработал (например хук-провайдер блокирует, антивирь, или после Cursor auto-update), запусти `install.ps1` руками.

> При первом клоне хук активируется когда `install.ps1` сделает `git config --local core.hooksPath .githooks`. То есть запусти `install.ps1` хотя бы раз — дальше пулл сам всё применит.

## Использование

- **ПКМ на любом чате в сайдбаре** → выбрать ярлык из меню.
- **«Без ярлыка»** — снять метку.
- Метки хранятся в `localStorage` Cursor'а, переживают перезапуск.

### Стоимость чата (💰)

В контекстном меню снизу появилась строка `💰 Стоимость:` — суммарные траты на этот чат, через приватный billing API Cursor (`GetFilteredUsageEvents`, ключ — `composerId = cloudAgentId`).

Как это работает:
- `install.ps1` через bundled Cursor node читает `composer.composerHeaders` из `state.vscdb` и пишет `composers.js` рядом с патчем (`composerId ↔ имя чата`). 829 чатов ≈ 138 KB — это снапшот для «старых» чатов.
- Для **новых чатов** (созданных уже после `install.ps1`) работает live capture: патч перехватывает `window.fetch` и при походе Cursor'а на `api2.cursor.sh` с `composerId`/`cloudAgentId` в теле — связывает его с последним кликнутым в сайдбаре чатом. Достаточно один раз открыть новый чат и что-нибудь там сделать — пара `title → composerId` уйдёт в `localStorage`, и ПКМ → Стоимость заработает.
- При open контекстного меню патч резолвит `имя чата → composerId` (сначала live-capture, потом снапшот; для дублей имени — самый свежий по `lastUpdatedAt`), дёргает API, складывает события постранично и показывает `$X.XX (N событий)`.
- Bearer-токен и `teamId` так же ловятся на лету. Если первый показ говорит «нет токена / нет teamId» — открой любой чат и страницу **Settings → Usage**, дальше всё подцепится.
- Результат кэшируется 10 минут на `composerId`. Клик по строке стоимости — форс-рефреш без закрытия меню.
- Хоткеи в DevTools:
  - `__cursorChatLabelsClearCostCache()` — сбросить кэш стоимости.
  - `__cursorChatLabelsClearRuntimeComposers()` — сбросить live-captured пары (если что-то склеилось не так).

Ограничения:
- 30/829 чатов в снапшоте имеют дублирующиеся имена (включая 56 безымянных) — для них берётся самый свежий, что не всегда совпадает с тем, на чём ткнули. Если этот чат хоть раз открывали после установки — live capture перекроет снапшот и точность вернётся.
- Совсем «холодный» чат (создал, ни разу не ткнул) → live capture пуст, и его нет в снапшоте → меню скажет «composerId не известен, открой чат и сделай запрос». После этого работает.

## Кастомизация

Открой `patch/labels.js` — список ярлыков лежит там:

```js
export const labels = [
    { id: 'important', title: 'ВАЖНО',     color: '#e34234', icon: '🔴' },
    { id: 'check',     title: 'ПРОВЕРИТЬ', color: '#9b59b6', icon: '🔍' },
    { id: 'todo',      title: 'TODO',      color: '#3498db', icon: '📌' }
];
```

- `id` — уникальный ключ (используется в localStorage, в UI не виден). Не меняй у уже использующихся ярлыков — потеряешь метки.
- `title` — подпись в меню.
- `color` — любой CSS-цвет.
- `icon` — эмодзи или Unicode-символ.

**Применить правку:**

```powershell
.\install.ps1
```

После этого:
- **С перезапуском Cursor** — закрыл/открыл, готово.
- **Без перезапуска** — открой DevTools (`Ctrl+Shift+I`) → Console:
  ```js
  __cursorChatLabelsReloadConfig()
  ```
  Подхватит свежий `labels.js` и переприменит ярлыки. Удобно при подборе цветов/иконок.

> Важно: правки в `C:\playrix\cursor_tags\patch\labels.js` сами по себе на Cursor не влияют — Cursor читает копию в установке (`...\Programs\cursor\_\resources\app\out\vs\code\electron-sandbox\workbench\cursor-chat-labels\labels.js`). `install.ps1` копирует туда `patch/*`.

## Удаление

```powershell
.\uninstall.ps1
```

Снимает инжект из `workbench.html` и удаляет папку с патчем из установки Cursor. Метки в `localStorage` остаются — если потом снова поставишь, восстановятся.

## После auto-update Cursor

Cursor умеет тихо обновляться сам — это перезаписывает `workbench.html` и стирает наш инжект. Решение: запустить `install.ps1` снова. (Можно повесить на shortcut/Task Scheduler если надоест.)

## Структура репо

```
cursor_tags/
├── install.ps1                 # пропатчить
├── uninstall.ps1               # откатить
├── extract-composers.cjs       # читает composer.composerHeaders из state.vscdb
├── README.md
├── patch/
│   ├── chat-labels.js          # сам инжект
│   └── labels.js               # конфиг ярлыков — можно править
└── .githooks/
    └── post-merge              # авто-применение после git pull
```

## Отладка

Открой DevTools в Cursor (`Ctrl+Shift+I`) → Console:

```js
__cursorChatLabelsDebug()         // что нашлось, состояние observer'а
__cursorChatLabelsReloadConfig()  // перечитать labels.js без рестарта Cursor
__cursorChatLabelsCleanup()       // снять патч в текущем окне (до перезапуска)
```

При зависании — снять инжект руками: открой `workbench.html` в Cursor install и удали блок между `<!-- cursor-chat-labels:start -->` и `<!-- cursor-chat-labels:end -->`. Или просто запусти `uninstall.ps1`.
