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
├── install.ps1            # пропатчить
├── uninstall.ps1          # откатить
├── README.md
├── patch/
│   ├── chat-labels.js     # сам инжект
│   └── labels.js          # конфиг ярлыков — можно править
└── .githooks/
    └── post-merge         # авто-применение после git pull
```

## Отладка

Открой DevTools в Cursor (`Ctrl+Shift+I`) → Console:

```js
__cursorChatLabelsDebug()         // что нашлось, состояние observer'а
__cursorChatLabelsReloadConfig()  // перечитать labels.js без рестарта Cursor
__cursorChatLabelsCleanup()       // снять патч в текущем окне (до перезапуска)
```

При зависании — снять инжект руками: открой `workbench.html` в Cursor install и удали блок между `<!-- cursor-chat-labels:start -->` и `<!-- cursor-chat-labels:end -->`. Или просто запусти `uninstall.ps1`.
