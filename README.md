# cursor_tags

Патч для Cursor: дотачивает sidebar чатов — ярлыки, раздел Tagged, замена pin-точки, индикация unread цветом, стоимость чата через приватный billing API.

![](./screenshot.png)

## Возможности

**Ярлыки (теги) на чатах**
- ПКМ по чату → меню со списком ярлыков. Иконка ярлыка занимает слот нативной точки/пина (а не висит рядом).
- Слева от строки чата — тонкая цветная полоска цвета ярлыка.
- Набор ярлыков (название/цвет/иконка) задаётся в `patch/labels.js`. Изменения видны без рестарта Cursor — `__cursorChatLabelsReloadConfig()` в DevTools.

**Pin / Unpin в нашем меню**
- Нативная точка/пин-кнопка скрыта (когда есть ярлык), функция «Закрепить/Открепить» переехала в наше ПКМ-меню — программный клик по скрытой нативной кнопке через цепочку pointer/mouse событий (Solid-friendly).

**Раздел Tagged**
- Новая группа в sidebar рядом с Pinned / Workspaces. Заголовок и items клонированы из нативной разметки — typography/отступы/chevron 1-в-1.
- Список всех тагированных чатов, сортировка по порядку ярлыков из `labels.js`. Группа сворачивается, состояние сохраняется в localStorage.
- Активный чат подсвечивается. Клик по клону → переключение на оригинал. ПКМ на клоне открывает меню для оригинального чата.

**Unread-индикатор**
- У Cursor состояние «новое сообщение» рисуется цветом точки. Точку мы прячем под ярлык → перенесли состояние на цвет label: непрочитанные подсвечиваются `#2371a8` через inline-style !important (побеждает CSS-in-JS Cursor'а).

**Thinking-анимация остаётся нативной**
- Пока чат «думает» — наш бейдж убирается, нативный spinner Cursor'а в слоте виден как обычно. Полоска ярлыка остаётся.

**Имена workspaces жирным**
- `Home / am_miroai / aquascapes / …` — bold, чтобы отделить от названий чатов. Заголовки групп (Pinned/Workspaces/Tagged) не затронуты.

**Стоимость чата (💰)** — см. раздел ниже. Открытие меню резолвит чат в `composerId` и тянет суммарные траты через приватный billing API (`GetFilteredUsageEvents`), показывает строкой в меню. Bearer-токен и `teamId` ловятся на лету через подмену `window.fetch`. Результат кэшируется 10 минут.

**DevTools helpers**
- `__cursorChatLabelsReloadConfig()` — перечитать `labels.js` без рестарта.
- `__cursorChatLabelsDebug()` — состояние observer'а, найденные элементы.
- `__cursorChatLabelsInspect()` — дамп DOM-структуры одной строки чата (для подгонки селекторов).
- `__cursorChatLabelsInspectStyles()` — computed CSS заголовков/items.
- `__cursorChatLabelsClearCostCache()` — сброс кэша стоимости.
- `__cursorChatLabelsCleanup()` — снять патч в текущем окне до рестарта.

## Под капотом

- Инжект `<script type="module">` в `workbench.html` Cursor'а. Никаких бинарей не модифицируется, удаление одной командой.
- MutationObserver с защитой от self-loop (`suppressing` + `firedThisFrame` + идемпотентные применения DOM). Восстановление визуала после ререндеров Cursor'а — за один кадр (~16ms), без мерцания.
- Делегированный `contextmenu` на `document` (capture=true) — listener не теряется при ререндерах строк.
- Левая полоска ярлыка — через `::before` pseudo-element с `--cl-color`, не конфликтует с `box-shadow` Cursor'а.
- Цвет label для unread — inline-style `!important` на самом элементе.
- Tagged-header — `cloneNode(true)` от нативной группы Pinned, чистка state-атрибутов и action-кнопок.
- Composer-карта (`composerId ↔ имя чата`) экспортируется в `composers.js` из `state.vscdb` через bundled-node Cursor'а в `install.ps1`.

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
