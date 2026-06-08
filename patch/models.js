/*
 * cursor_tags — конфиг циклирования моделей (хоткей в чате Cursor)
 *
 * Хоткей (по умолчанию Ctrl+Space), нажатый когда фокус в инпуте чата,
 * переключает модель по кругу из списка modelCycle.
 *
 * Поля элемента списка:
 *   id    — testid модели без префикса "model-item-".
 *           Доступные id можно посмотреть так: открой пикер моделей в чате
 *           и выполни в DevTools-консоли  __cursorChatLabelsInspectModel()
 *   match — подстрока для определения ТЕКУЩЕЙ модели по тексту кнопки-триггера
 *           (span.ui-model-picker__trigger-text). Напр. триггер показывает
 *           "Opus 4.8" → match: 'Opus 4.8'. Если не задан, берётся id.
 *
 * Порядок в массиве = порядок цикла. Хоткей берёт следующую модель по кругу;
 * если текущую не удалось определить — переключает на первую.
 *
 * После правки запусти инсталлятор и перезапусти Cursor
 * (или __cursorChatLabelsReloadConfig() в консоли — без перезапуска).
 */
export const modelCycle = [
	{ id: 'claude-opus-4-8',  match: 'Opus 4.8' },
	{ id: 'gemini-3.5-flash', match: 'Gemini 3.5 Flash' },
	{ id: 'composer-2.5',     match: 'Composer 2.5' }
];

/*
 * Хоткей циклирования. Модификаторы — булевы; срабатывает только при точном
 * совпадении набора (Ctrl+Space здесь означает ctrl=true и все остальные false).
 *   code — значение KeyboardEvent.code (раскладко-независимо), напр. 'Space',
 *          'KeyM', 'Period'. Можно вместо него задать key (KeyboardEvent.key).
 */
export const cycleHotkey = { ctrl: true, meta: false, alt: false, shift: false, code: 'Space' };
