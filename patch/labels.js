/*
 * cursor_tags — конфиг ярлыков
 *
 * Можно править этот файл прямо на месте, в установке Cursor.
 * Файл подгружается как ES-module скриптом chat-labels.js.
 *
 * Поля:
 *   id     — уникальный идентификатор (a-z, цифры, дефис). Используется
 *            как ключ в localStorage, не показывается в UI.
 *   title  — подпись в контекстном меню
 *   color  — CSS-цвет (любой формат: #RRGGBB, rgb(...), name)
 *   icon   — эмодзи или любой Unicode символ (1-2 символа)
 *
 * Порядок в массиве = порядок в меню. Удаляй/добавляй сколько хочешь.
 */
export const labels = [
	{ id: 'important', title: 'ВАЖНО',     color: '#e34234', icon: '🔴' },
	{ id: 'check',     title: 'ПРОВЕРИТЬ', color: '#9b59b6', icon: '🔍' },
	{ id: 'todo',      title: 'TODO',      color: '#3498db', icon: '📌' }
];
