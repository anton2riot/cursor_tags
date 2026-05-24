# cursor_tags

Прокачивает сайдбар чатов в Cursor.

![](./screenshot.png)

## Что делает

- Помечать чаты ярлыками — ПКМ по чату, выбрать.
- Отдельный раздел **Tagged** со всеми помеченными чатами.
- **Pin / Unpin** из того же ПКМ-меню.
- Непрочитанные чаты выделены цветом текста.
- Имена воркспейсов жирным.
- Видно стоимость чата в долларах (ПКМ → 💰).

## Установка

```powershell
git clone git@github.com:anton2riot/cursor_tags.git
cd cursor_tags
.\install.ps1
```

Перезапустить Cursor.

## Обновление

```powershell
git pull
```

`install.ps1` сам запустится из git-хука. Если нет — запусти руками.

После авто-обновления Cursor патч сотрётся — повтори `.\install.ps1`.

## Свои ярлыки

Открой `patch/labels.js`, поправь список:

```js
export const labels = [
    { id: 'important', title: 'ВАЖНО',     color: '#e34234', icon: '🔴' },
    { id: 'check',     title: 'ПРОВЕРИТЬ', color: '#9b59b6', icon: '🔍' },
    { id: 'todo',      title: 'TODO',      color: '#3498db', icon: '📌' }
];
```

Запусти `.\install.ps1`, перезапусти Cursor.

## Удаление

```powershell
.\uninstall.ps1
```
