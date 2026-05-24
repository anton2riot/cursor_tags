/*
 * cursor_tags — патч Cursor: ярлыки + замена pin-слота + раздел Tagged.
 *
 * Точная разметка Cursor 3.5.x (определена через __cursorChatLabelsInspect):
 *   li.ui-sidebar-menu-item
 *     div.ui-button.ui-sidebar-menu-button.glass-sidebar-agent-menu-btn[role="button"]
 *       div.ui-sidebar-menu-button-icon-wrapper          ← слот для точки/пина
 *         span.ui-sidebar-menu-button-status-icon         ← точка (.agent-status-dot)
 *         span.ui-sidebar-menu-button-pin-button          ← обёртка pin-кнопки
 *           button.ui-icon-button[aria-label="Pin"|"Unpin"]
 *       div.ui-sidebar-menu-button-content
 *         span.ui-sidebar-menu-button-label "Имя чата"
 *       div.ui-sidebar-menu-button-end
 *
 * Группы Pinned/Workspaces — это div.ui-sidebar-group с
 * span.ui-sidebar-label-row-title.ui-sidebar-group-label-title в хедере.
 */
(function() {
	'use strict';

	const CSS = `
/* Прячем нативную точку и pin-кнопку, когда у чата есть наш ярлык */
.cl-has-label .ui-sidebar-menu-button-status-icon,
.cl-has-label .ui-sidebar-menu-button-pin-button { display: none !important; }

/* Наш бейдж в слоте иконки */
.cl-badge { display: inline-flex; align-items: center; justify-content: center; font-size: 12px; line-height: 1; flex-shrink: 0; }
.cl-badge-pin { width: 14px; height: 14px; }

/* Левая цветная полоска через ::before pseudo-element.
   Раньше использовался box-shadow, но Cursor на focus/contextmenu выставляет
   свой box-shadow inline (inline побеждает stylesheet !important), и полоска
   пропадала. Pseudo-element не конфликтует с box-shadow вообще. */
.cl-has-label { position: relative; }
.cl-has-label::before {
	content: '';
	position: absolute;
	left: 0;
	top: 2px;
	bottom: 2px;
	width: 3px;
	background: var(--cl-color, transparent);
	border-radius: 2px;
	pointer-events: none;
	z-index: 1;
}

/* Контекстное меню */
.cl-menu { position: fixed; z-index: 999999; min-width: 200px; background: var(--vscode-menu-background, #2d2d2d); color: var(--vscode-menu-foreground, #f0f0f0); border: 1px solid var(--vscode-menu-border, rgba(255,255,255,0.1)); border-radius: 4px; box-shadow: 0 4px 12px rgba(0,0,0,0.5); padding: 4px 0; font-size: 12px; font-family: var(--vscode-font-family, -apple-system, sans-serif); user-select: none; }
.cl-menu-header { padding: 4px 12px 6px; font-size: 11px; text-transform: uppercase; opacity: 0.6; border-bottom: 1px solid var(--vscode-menu-separatorBackground, rgba(255,255,255,0.05)); margin-bottom: 4px; }
.cl-menu-item { display: flex; align-items: center; padding: 5px 12px; cursor: pointer; gap: 8px; }
.cl-menu-item:hover { background: var(--vscode-menu-selectionBackground, #094771); color: var(--vscode-menu-selectionForeground, #ffffff); }
.cl-menu-item.cl-menu-disabled { opacity: 0.4; cursor: not-allowed; }
.cl-menu-item.cl-menu-disabled:hover { background: transparent; color: inherit; }
.cl-menu-sep { height: 1px; background: var(--vscode-menu-separatorBackground, rgba(255,255,255,0.08)); margin: 4px 0; }
.cl-menu-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.cl-menu-dot-none { border: 1px solid currentColor; background: transparent !important; }
.cl-menu-icon { width: 14px; text-align: center; flex-shrink: 0; }

/* Unread-индикация: раньше Cursor показывал точку (синюю/серую), но мы её
   скрываем. Цвет/жирность label теперь показывают, что чат ожидает прочтения. */
.cl-status-unseen .ui-sidebar-menu-button-label { color: var(--vscode-foreground, #fff) !important; font-weight: 600 !important; }
.cl-status-seen .ui-sidebar-menu-button-label { color: var(--vscode-descriptionForeground, rgba(255,255,255,0.55)) !important; }

/* Имена воркспейсов (Home / am_miroai / aquascapes / …) — жирным. У них
   ui-sidebar-label-row-title без ui-sidebar-group-label-title (последний
   только у заголовков групп Pinned/Workspaces/Tagged). */
.ui-sidebar-label-row-title:not(.ui-sidebar-group-label-title) { font-weight: 600 !important; }

/* Tagged group — клонированный header из Pinned даёт нам typography бесплатно. */
.cl-tagged-header { cursor: pointer; user-select: none; }
/* Когда наша группа свёрнута, поворачиваем chevron нативного header'а */
.cl-tagged-group.cl-collapsed [class*="chevron"],
.cl-tagged-group.cl-collapsed [class*="caret"],
.cl-tagged-group.cl-collapsed .codicon-chevron-down { transform: rotate(-90deg); transition: transform 0.12s; }
.cl-tagged-group.cl-collapsed > .ui-sidebar-group-content { display: none; }
.cl-tagged-count { margin-left: 6px; opacity: 0.55; font-size: 11px; font-weight: 400; }
.cl-tagged-count:empty { display: none; }
.cl-tagged-item.cl-active-chat .glass-sidebar-agent-menu-btn { background: var(--vscode-list-activeSelectionBackground, rgba(80,120,200,0.25)) !important; }
`;

	if (window.__cursorChatLabelsCleanup) {
		try { window.__cursorChatLabelsCleanup(); } catch (e) { /* ignore */ }
	}

	const styleEl = document.createElement('style');
	styleEl.id = 'cursor-chat-labels-style';
	styleEl.textContent = CSS;
	document.head.appendChild(styleEl);

	const STORAGE_KEY = 'cursor-chat-labels-v1';
	const COLLAPSED_KEY = 'cursor-chat-labels-tagged-collapsed';

	const DEFAULT_LABELS = [
		{ id: 'important', title: 'ВАЖНО',     color: '#ffb02e', icon: '⚠️' },
		{ id: 'check',     title: 'ПРОВЕРИТЬ', color: '#e34234', icon: '❓' },
		{ id: 'todo',      title: 'TODO',      color: '#9b59b6', icon: '🔜' }
	];
	const NONE_LABEL = { id: 'none', title: 'Без ярлыка', color: 'transparent', icon: '' };

	let userLabels = DEFAULT_LABELS;
	let LABELS = [NONE_LABEL, ...userLabels];

	const SELECTORS = {
		row:           ['li.ui-sidebar-menu-item'],
		rowButton:     ['.glass-sidebar-agent-menu-btn'],
		rowContent:    ['.ui-sidebar-menu-button-content'],
		rowTitle:      ['.ui-sidebar-menu-button-label'],
		// слот, в который нативный Cursor рисует точку статуса / pin-кнопку:
		pinSlot:       ['.ui-sidebar-menu-button-icon-wrapper'],
		// сам button pin/unpin (его и кликаем для toggle):
		pinAction:     ['.ui-sidebar-menu-button-pin-button button'],
		// группы вида Pinned/Workspaces:
		groupRoot:     ['.ui-sidebar-group'],
		groupTitle:    ['.ui-sidebar-group-label-title', '.ui-sidebar-label-row-title'],
		groupContent:  ['.ui-sidebar-group-content']
	};

	function loadStoredLabels() {
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			if (!raw) return {};
			const parsed = JSON.parse(raw);
			return parsed && typeof parsed === 'object' ? parsed : {};
		} catch (err) { return {}; }
	}

	function saveStoredLabels(map) {
		try { localStorage.setItem(STORAGE_KEY, JSON.stringify(map)); }
		catch (err) { console.warn('[chat-labels] save failed', err); }
	}

	function findFirst(root, list) {
		for (const sel of list) { const el = root.querySelector(sel); if (el) return el; }
		return null;
	}
	function findAll(root, list) {
		const all = [];
		for (const sel of list) root.querySelectorAll(sel).forEach(el => all.push(el));
		return Array.from(new Set(all));
	}

	function getChatKey(row) {
		const dataKeys = ['data-id', 'data-chat-id', 'data-agent-id'];
		for (const k of dataKeys) {
			const v = row.getAttribute(k);
			if (v) return v;
		}
		const titleEl = findFirst(row, SELECTORS.rowTitle);
		if (titleEl) return (titleEl.textContent || '').trim();
		return null;
	}

	function findPinSlot(row)   { return findFirst(row, SELECTORS.pinSlot); }
	function findPinAction(row) { return findFirst(row, SELECTORS.pinAction); }

	function isRowPinned(row) {
		const btn = findPinAction(row);
		if (!btn) return false;
		const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
		return aria.includes('unpin');
	}

	function togglePinForRow(row) {
		const btn = findPinAction(row);
		if (!btn) return false;
		// Cursor мог реагировать не на click, а на pointer/mouse-цепочку
		// (Solid/React handlers часто слушают pointerdown). И сама pin-button у
		// нас скрыта через CSS — это могло мешать обработчику. Сейчас:
		//  1. Временно показываем pin-button (через inline !important, чтобы
		//     перебить наш CSS hide).
		//  2. Палим всю цепочку pointer/mouse событий + click().
		//  3. На след. rAF возвращаем display обратно (наш CSS снова скроет
		//     элемент, но к этому моменту Cursor уже обработал событие).
		const wrap = btn.closest('.ui-sidebar-menu-button-pin-button');
		const oldDisplay = wrap ? wrap.style.getPropertyValue('display') : '';
		const oldPriority = wrap ? wrap.style.getPropertyPriority('display') : '';
		if (wrap) {
			wrap.style.setProperty('display', 'flex', 'important');
			void wrap.offsetWidth;
		}
		const rect = btn.getBoundingClientRect();
		const opts = {
			bubbles: true, cancelable: true,
			clientX: rect.left + rect.width / 2,
			clientY: rect.top + rect.height / 2,
			button: 0
		};
		try {
			btn.dispatchEvent(new PointerEvent('pointerdown', { ...opts, pointerId: 1, pointerType: 'mouse' }));
			btn.dispatchEvent(new MouseEvent('mousedown', opts));
			btn.dispatchEvent(new PointerEvent('pointerup', { ...opts, pointerId: 1, pointerType: 'mouse' }));
			btn.dispatchEvent(new MouseEvent('mouseup', opts));
			btn.dispatchEvent(new MouseEvent('click', opts));
			btn.click();
		} catch (err) {
			console.warn('[chat-labels] pin dispatch failed', err);
		}
		if (wrap) {
			requestAnimationFrame(() => requestAnimationFrame(() => {
				if (oldDisplay) wrap.style.setProperty('display', oldDisplay, oldPriority);
				else wrap.style.removeProperty('display');
			}));
		}
		return true;
	}

	function isRowActive(row) {
		if (!row) return false;
		if (row.getAttribute('aria-selected') === 'true' || row.getAttribute('aria-current') === 'true') return true;
		const cls = (row.className + '');
		if (/(?:^|\s)(?:active|selected|is-active|is-selected)(?:\s|$)/.test(cls)) return true;
		const btn = findFirst(row, SELECTORS.rowButton);
		if (btn) {
			if (btn.getAttribute('aria-selected') === 'true' || btn.getAttribute('aria-current') === 'true') return true;
			const bcls = (btn.className + '');
			if (/(?:^|\s)(?:active|selected|is-active|is-selected)(?:\s|$)/.test(bcls)) return true;
		}
		return false;
	}

	// Идемпотентный apply: наш бейдж в слоте иконки нативной точки.
	function applyBadge(row, labels) {
		const key = getChatKey(row);
		if (!key) return;
		const btn = findFirst(row, SELECTORS.rowButton) || row;
		const slot = findPinSlot(row);

		const labelId = labels[key];
		const label = LABELS.find(l => l.id === labelId);
		const hasLabel = label && label.id !== 'none';

		if (!hasLabel) {
			row.querySelectorAll('.cl-badge').forEach(el => el.remove());
			if (btn.classList.contains('cl-has-label')) btn.classList.remove('cl-has-label');
			if (btn.style.getPropertyValue('--cl-color')) btn.style.removeProperty('--cl-color');
			return;
		}

		if (!btn.classList.contains('cl-has-label')) btn.classList.add('cl-has-label');
		if (btn.style.getPropertyValue('--cl-color') !== label.color) {
			btn.style.setProperty('--cl-color', label.color);
		}

		// Если слот иконки найден — наш бейдж туда. Если нет — fallback на label.
		if (slot) {
			let badge = slot.querySelector(':scope > .cl-badge-pin');
			if (!badge) {
				badge = document.createElement('span');
				badge.className = 'cl-badge cl-badge-pin';
				slot.appendChild(badge);
			}
			if (badge.textContent !== label.icon) badge.textContent = label.icon;
			if (badge.title !== label.title) badge.title = label.title;
			// Подчистим возможный fallback-бейдж из label-слота
			const labelEl = findFirst(row, SELECTORS.rowTitle);
			if (labelEl) {
				const inLabel = labelEl.querySelector(':scope > .cl-badge:not(.cl-badge-pin)');
				if (inLabel) inLabel.remove();
			}
			return;
		}

		// Fallback (если разметка Cursor другая)
		const labelEl = findFirst(row, SELECTORS.rowTitle);
		if (!labelEl) return;
		const existing = labelEl.querySelector(':scope > .cl-badge');
		if (existing) {
			if (existing.textContent !== label.icon) existing.textContent = label.icon;
			return;
		}
		const badge = document.createElement('span');
		badge.className = 'cl-badge';
		badge.textContent = label.icon;
		badge.title = label.title;
		labelEl.insertBefore(badge, labelEl.firstChild);
	}

	// ---- Tagged group --------------------------------------------------------
	function isTaggedCollapsed() { return localStorage.getItem(COLLAPSED_KEY) === '1'; }
	function setTaggedCollapsed(v) { localStorage.setItem(COLLAPSED_KEY, v ? '1' : '0'); }

	function findPinnedGroup() {
		const titles = document.querySelectorAll('.ui-sidebar-group-label-title');
		for (const t of titles) {
			if ((t.textContent || '').trim().toLowerCase() === 'pinned') {
				return t.closest('.ui-sidebar-group');
			}
		}
		return null;
	}

	function findGroupsContainer() {
		// Любая существующая группа Pinned/Workspaces даёт нам контейнер.
		const anyGroup = document.querySelector('.ui-sidebar-group:not(.cl-tagged-group)');
		return anyGroup ? anyGroup.parentElement : null;
	}

	function buildHeaderFromPinned(pinned) {
		// Header — первый child Pinned-группы, который НЕ group-content.
		const headerSrc = Array.from(pinned.children).find(c => !c.classList.contains('ui-sidebar-group-content'));
		if (!headerSrc) return null;
		// cloneNode(true) копирует DOM, но не event listeners — Cursor сюда уже не подключится.
		const cloned = headerSrc.cloneNode(true);
		// Снимаем state-атрибуты Pinned (свёрнут/раскрыт, выбранный, действия).
		const stateAttrs = ['aria-expanded', 'aria-collapsed', 'aria-selected', 'aria-pressed', 'data-state', 'data-collapsed', 'data-expanded'];
		const purgeClasses = ['collapsed', 'expanded', 'is-collapsed', 'is-expanded', 'active', 'selected', 'is-active', 'is-selected'];
		const purgeNode = (el) => {
			if (!(el instanceof Element)) return;
			for (const a of stateAttrs) el.removeAttribute(a);
			for (const c of purgeClasses) el.classList.remove(c);
		};
		purgeNode(cloned);
		cloned.querySelectorAll('*').forEach(purgeNode);
		// Убираем action-кнопки Pinned (Add chat / Pin all / …) — они не относятся к Tagged
		// и могли бы случайно сработать через делегацию click на parent.
		cloned.querySelectorAll('button, [role="button"]').forEach(b => b.remove());
		// После удаления кнопок могут остаться пустые wrapper-divs (spacer / actions-area),
		// которые держат «лишние пробелы» перед нативным chevron'ом. Удаляем рекурсивно.
		const isKeeper = (el) => {
			const cls = ((el.className || '') + '').toLowerCase();
			if (/chevron|caret|codicon/.test(cls)) return true;
			if (cls.includes('group-label-title') || cls.includes('label-row-title')) return true;
			return false;
		};
		let removedAny = true;
		while (removedAny) {
			removedAny = false;
			for (const el of Array.from(cloned.querySelectorAll('*'))) {
				if (!el.isConnected) continue;
				if (isKeeper(el)) continue;
				if (el.children.length === 0 && (el.textContent || '').trim() === '') {
					el.remove();
					removedAny = true;
				}
			}
		}
		// Меняем текст "Pinned" → "Tagged"
		let titleReplaced = false;
		const allText = cloned.querySelectorAll('*');
		for (const el of allText) {
			if (el.children.length === 0 && el.textContent) {
				const t = el.textContent.trim();
				if (t.toLowerCase() === 'pinned') {
					el.textContent = 'Tagged';
					titleReplaced = true;
				}
			}
		}
		if (!titleReplaced) {
			// fallback: добавить наш title если в шаблоне не нашлось
			const span = document.createElement('span');
			span.className = 'ui-sidebar-label-row-title ui-sidebar-group-label-title';
			span.textContent = 'Tagged';
			cloned.insertBefore(span, cloned.firstChild);
		}
		return cloned;
	}

	function ensureTaggedGroup() {
		const container = findGroupsContainer();
		if (!container) return null;
		let group = container.querySelector(':scope > .cl-tagged-group');
		if (group) return group;

		group = document.createElement('div');
		group.className = 'ui-sidebar-group cl-tagged-group';
		if (isTaggedCollapsed()) group.classList.add('cl-collapsed');

		const pinned = findPinnedGroup();
		let header = pinned ? buildHeaderFromPinned(pinned) : null;
		if (!header) {
			// Fallback — собираем сами (старый путь)
			header = document.createElement('div');
			const title = document.createElement('span');
			title.className = 'ui-sidebar-label-row-title ui-sidebar-group-label-title';
			title.textContent = 'Tagged';
			header.appendChild(title);
		}
		header.classList.add('cl-tagged-header');

		// Счётчик ставим после текста, перед нативным chevron'ом (если он есть).
		const count = document.createElement('span');
		count.className = 'cl-tagged-count';
		const titleSpan = header.querySelector('.ui-sidebar-group-label-title, .ui-sidebar-label-row-title');
		if (titleSpan && titleSpan.parentElement) {
			titleSpan.parentElement.insertBefore(count, titleSpan.nextSibling);
		} else {
			header.appendChild(count);
		}

		header.addEventListener('click', (ev) => {
			ev.preventDefault();
			ev.stopPropagation();
			const wasCollapsed = group.classList.contains('cl-collapsed');
			group.classList.toggle('cl-collapsed');
			setTaggedCollapsed(!wasCollapsed);
		});

		const content = document.createElement('div');
		content.className = 'ui-sidebar-group-content';
		const list = document.createElement('ul');
		list.className = 'ui-sidebar-menu cl-tagged-list';
		content.appendChild(list);

		group.appendChild(header);
		group.appendChild(content);

		if (pinned && pinned.parentElement === container) {
			container.insertBefore(group, pinned.nextSibling);
		} else {
			container.insertBefore(group, container.firstChild);
		}
		return group;
	}

	function createTaggedItem(key, label) {
		const li = document.createElement('li');
		li.className = 'ui-sidebar-menu-item cl-tagged-item';
		li.dataset.clKey = key;

		const btn = document.createElement('div');
		btn.className = 'ui-button ui-sidebar-menu-button glass-sidebar-agent-menu-btn cl-tagged-btn';
		btn.setAttribute('role', 'button');
		btn.tabIndex = 0;
		btn.setAttribute('data-variant', 'ghost');
		btn.setAttribute('data-label-tone', 'default');

		const iconWrap = document.createElement('div');
		iconWrap.className = 'ui-sidebar-menu-button-icon-wrapper';
		const badge = document.createElement('span');
		badge.className = 'cl-badge cl-badge-pin';
		iconWrap.appendChild(badge);

		const content = document.createElement('div');
		content.className = 'ui-sidebar-menu-button-content';
		const labelEl = document.createElement('span');
		labelEl.className = 'ui-text ui-sidebar-menu-button-label';
		labelEl.setAttribute('data-variant', 'default');
		labelEl.setAttribute('data-size', 'md');
		labelEl.setAttribute('data-weight', 'regular');
		content.appendChild(labelEl);

		btn.appendChild(iconWrap);
		btn.appendChild(content);
		li.appendChild(btn);

		const clickHandler = (ev) => {
			ev.preventDefault();
			ev.stopPropagation();
			ev.stopImmediatePropagation();
			const orig = li.__clOriginalRow;
			const tryClick = (r) => {
				const b = findFirst(r, SELECTORS.rowButton);
				if (b) { b.click(); return true; }
				return false;
			};
			if (orig && orig.isConnected && tryClick(orig)) return;
			for (const r of findAll(document, SELECTORS.row)) {
				if (r.closest('.cl-tagged-group')) continue;
				if (getChatKey(r) === li.dataset.clKey) { tryClick(r); return; }
			}
		};
		btn.addEventListener('click', clickHandler, true);
		btn.addEventListener('mousedown', (ev) => { ev.stopPropagation(); }, true);

		return li;
	}

	function updateTaggedGroup() {
		const group = ensureTaggedGroup();
		if (!group) return;
		const list = group.querySelector('.cl-tagged-list');
		const countEl = group.querySelector('.cl-tagged-count');

		const labels = loadStoredLabels();
		const rows = findAll(document, SELECTORS.row).filter(r => !r.closest('.cl-tagged-group'));

		const tagged = [];
		for (const row of rows) {
			const key = getChatKey(row);
			if (!key) continue;
			const labelId = labels[key];
			if (!labelId || labelId === 'none') continue;
			const label = LABELS.find(l => l.id === labelId);
			if (!label) continue;
			tagged.push({ row, key, label });
		}
		tagged.sort((a, b) => {
			const ai = LABELS.findIndex(l => l.id === a.label.id);
			const bi = LABELS.findIndex(l => l.id === b.label.id);
			if (ai !== bi) return ai - bi;
			return a.key.localeCompare(b.key);
		});

		// Идемпотентное обновление
		const wantedKeys = new Set(tagged.map(t => t.key));
		const existing = new Map();
		list.querySelectorAll(':scope > .cl-tagged-item').forEach(item => {
			const k = item.dataset.clKey;
			if (k && wantedKeys.has(k)) existing.set(k, item);
			else item.remove();
		});
		for (const { row, key, label } of tagged) {
			let item = existing.get(key);
			if (!item) {
				item = createTaggedItem(key, label);
				list.appendChild(item);
			}
			item.__clOriginalRow = row;
			const badge = item.querySelector('.cl-badge');
			if (badge && badge.textContent !== label.icon) badge.textContent = label.icon;
			if (badge) badge.title = label.title;
			const labelEl = item.querySelector('.ui-sidebar-menu-button-label');
			if (labelEl && labelEl.textContent !== key) labelEl.textContent = key;

			// Цветная полоска и статус unread/seen — переносим с оригинала на клон.
			const cloneBtn = item.querySelector('.cl-tagged-btn');
			if (cloneBtn) {
				if (!cloneBtn.classList.contains('cl-has-label')) cloneBtn.classList.add('cl-has-label');
				if (cloneBtn.style.getPropertyValue('--cl-color') !== label.color) {
					cloneBtn.style.setProperty('--cl-color', label.color);
				}
				const status = getRowStatus(row);
				const wantSeen = status === 'seen';
				const wantUnseen = status === 'unseen';
				if (cloneBtn.classList.contains('cl-status-seen') !== wantSeen) cloneBtn.classList.toggle('cl-status-seen', wantSeen);
				if (cloneBtn.classList.contains('cl-status-unseen') !== wantUnseen) cloneBtn.classList.toggle('cl-status-unseen', wantUnseen);
			}

			const isActive = isRowActive(row);
			if (item.classList.contains('cl-active-chat') !== isActive) item.classList.toggle('cl-active-chat', isActive);
		}
		// порядок по sorted
		for (const t of tagged) {
			const item = list.querySelector(`:scope > .cl-tagged-item[data-cl-key="${CSS.escape(t.key)}"]`);
			if (item) list.appendChild(item);
		}

		const newCount = tagged.length > 0 ? String(tagged.length) : '';
		if (countEl && countEl.textContent !== newCount) countEl.textContent = newCount;
		const shouldHide = tagged.length === 0;
		const isHidden = group.style.display === 'none';
		if (shouldHide && !isHidden) group.style.display = 'none';
		if (!shouldHide && isHidden) group.style.display = '';
	}

	// Unread/seen статус — берём из нативного .agent-status-dot, переносим
	// на btn классом, CSS красит/жирнит label. Применяется ко всем чатам,
	// даже без ярлыка — индикация полезна сама по себе.
	function getRowStatus(row) {
		const dot = row.querySelector('.agent-status-dot');
		if (!dot) return null;
		const cls = (dot.className + '').toLowerCase();
		if (cls.includes('done-unseen') || cls.includes('--unseen')) return 'unseen';
		if (cls.includes('done-seen') || cls.includes('--seen')) return 'seen';
		return null;
	}

	function applyStatus(row) {
		const btn = findFirst(row, SELECTORS.rowButton);
		if (!btn) return null;
		const state = getRowStatus(row);
		const wantSeen = state === 'seen';
		const wantUnseen = state === 'unseen';
		// classList.toggle с условием не вызывает мутацию, если состояние совпадает —
		// observer-loop не запускается.
		if (btn.classList.contains('cl-status-seen') !== wantSeen) btn.classList.toggle('cl-status-seen', wantSeen);
		if (btn.classList.contains('cl-status-unseen') !== wantUnseen) btn.classList.toggle('cl-status-unseen', wantUnseen);
		return state;
	}

	function decorateAll() {
		const labels = loadStoredLabels();
		const rows = findAll(document, SELECTORS.row).filter(r => !r.closest('.cl-tagged-group'));
		for (const row of rows) {
			applyBadge(row, labels);
			applyStatus(row);
		}
		updateTaggedGroup();
		return rows.length;
	}

	// ---- Цикло-безопасный планировщик ----------------------------------------
	let suppressing = false;
	let inDecorate = false;
	let observerDisabled = false;
	let firedThisFrame = false;

	function runDecorateNow() {
		if (inDecorate) return;
		inDecorate = true;
		suppressing = true;
		try { decorateAll(); }
		catch (err) { console.warn('[chat-labels] decorate err', err); }
		finally {
			inDecorate = false;
			requestAnimationFrame(() => { suppressing = false; });
		}
	}

	let observerErrors = 0;
	const observer = new MutationObserver(() => {
		if (suppressing || observerDisabled || firedThisFrame) return;
		firedThisFrame = true;
		requestAnimationFrame(() => { firedThisFrame = false; });
		try { runDecorateNow(); }
		catch (err) {
			observerErrors++;
			console.warn('[chat-labels] observer err', err);
			if (observerErrors > 10) { observer.disconnect(); observerDisabled = true; }
		}
	});

	// ---- Контекстное меню ----------------------------------------------------
	function showMenu(row, x, y) {
		document.querySelectorAll('.cl-menu').forEach(m => m.remove());
		const key = getChatKey(row);
		if (!key) return;
		const menu = document.createElement('div');
		menu.className = 'cl-menu';
		menu.style.left = x + 'px';
		menu.style.top = y + 'px';

		const header = document.createElement('div');
		header.className = 'cl-menu-header';
		header.textContent = (key.length > 30 ? key.slice(0, 30) + '…' : key);
		menu.appendChild(header);

		// Pin / Unpin
		const pinBtn = findPinAction(row);
		const pinned = isRowPinned(row);
		const pinItem = document.createElement('div');
		pinItem.className = 'cl-menu-item';
		if (!pinBtn) pinItem.classList.add('cl-menu-disabled');
		const pinIcon = document.createElement('span');
		pinIcon.className = 'cl-menu-icon';
		pinIcon.textContent = pinned ? '📍' : '📌';
		pinItem.appendChild(pinIcon);
		const pinText = document.createElement('span');
		pinText.textContent = pinned ? 'Открепить' : 'Закрепить';
		pinItem.appendChild(pinText);
		if (pinBtn) {
			pinItem.addEventListener('click', () => {
				togglePinForRow(row);
				menu.remove();
				runDecorateNow();
				requestAnimationFrame(runDecorateNow);
			});
		}
		menu.appendChild(pinItem);

		const sep = document.createElement('div');
		sep.className = 'cl-menu-sep';
		menu.appendChild(sep);

		for (const label of LABELS) {
			const item = document.createElement('div');
			item.className = 'cl-menu-item';
			const dot = document.createElement('span');
			dot.className = 'cl-menu-dot';
			dot.style.background = label.color;
			if (label.id === 'none') dot.classList.add('cl-menu-dot-none');
			item.appendChild(dot);
			const icon = document.createElement('span');
			icon.className = 'cl-menu-icon';
			icon.textContent = label.icon || ' ';
			item.appendChild(icon);
			const text = document.createElement('span');
			text.textContent = label.title;
			item.appendChild(text);
			item.addEventListener('click', () => {
				const current = loadStoredLabels();
				if (label.id === 'none') delete current[key];
				else current[key] = label.id;
				saveStoredLabels(current);
				menu.remove();
				runDecorateNow();
				requestAnimationFrame(runDecorateNow);
			});
			menu.appendChild(item);
		}

		document.body.appendChild(menu);
		const closeOnce = (ev) => {
			if (!menu.contains(ev.target)) {
				menu.remove();
				document.removeEventListener('mousedown', closeOnce, true);
				document.removeEventListener('keydown', escListener, true);
			}
		};
		const escListener = (ev) => {
			if (ev.key === 'Escape') {
				menu.remove();
				document.removeEventListener('mousedown', closeOnce, true);
				document.removeEventListener('keydown', escListener, true);
			}
		};
		setTimeout(() => {
			document.addEventListener('mousedown', closeOnce, true);
			document.addEventListener('keydown', escListener, true);
		}, 0);
	}

	const contextMenuHandler = (ev) => {
		const target = ev.target;
		if (!(target instanceof Element)) return;
		const row = target.closest('li.ui-sidebar-menu-item');
		if (!row) return;
		if (!row.querySelector('.glass-sidebar-agent-menu-btn')) return;

		// Если ПКМ на клоне в Tagged — открыть меню для оригинального чата.
		let actual = row;
		if (row.closest('.cl-tagged-group')) {
			actual = row.__clOriginalRow && row.__clOriginalRow.isConnected ? row.__clOriginalRow : null;
			if (!actual) {
				const key = row.dataset.clKey;
				for (const r of findAll(document, SELECTORS.row)) {
					if (r.closest('.cl-tagged-group')) continue;
					if (getChatKey(r) === key) { actual = r; break; }
				}
			}
			if (!actual) return;
		}

		ev.preventDefault();
		ev.stopPropagation();
		ev.stopImmediatePropagation();
		showMenu(actual, ev.clientX, ev.clientY);
	};
	document.addEventListener('contextmenu', contextMenuHandler, true);

	// ---- Загрузка конфига ----------------------------------------------------
	const CONFIG_BASE_URL = new URL('./labels.js', import.meta.url).href;
	async function loadConfig({ bust = false } = {}) {
		const url = bust ? `${CONFIG_BASE_URL}?t=${Date.now()}` : CONFIG_BASE_URL;
		try {
			const mod = await import(url);
			const loaded = mod.labels || mod.default;
			if (Array.isArray(loaded) && loaded.length > 0) {
				userLabels = loaded.filter(l => l && l.id && l.id !== 'none');
				LABELS = [NONE_LABEL, ...userLabels];
				console.log('[chat-labels] config loaded:', userLabels.length, 'labels');
				return true;
			}
			console.warn('[chat-labels] labels.js пустой / некорректный, используются дефолты');
		} catch (err) {
			console.warn('[chat-labels] labels.js не загрузился', err);
		}
		return false;
	}

	(async () => {
		await loadConfig();
		observer.observe(document.body, { childList: true, subtree: true });
		runDecorateNow();
		const initialCount = findAll(document, SELECTORS.row).length;
		console.log('%c[chat-labels v7] booted', 'color: #27ae60; font-weight: bold', { rowsDecorated: initialCount, labels: userLabels.length });
	})();

	// ---- Public helpers ------------------------------------------------------
	window.__cursorChatLabelsReloadConfig = async function() {
		const ok = await loadConfig({ bust: true });
		document.querySelectorAll('.cl-badge').forEach(el => el.remove());
		document.querySelectorAll('.cl-has-label').forEach(el => {
			el.classList.remove('cl-has-label');
			el.style.removeProperty('--cl-color');
		});
		runDecorateNow();
		return ok ? 'config reloaded' : 'config not loaded — using defaults';
	};

	window.__cursorChatLabelsCleanup = function() {
		observerDisabled = true;
		observer.disconnect();
		document.removeEventListener('contextmenu', contextMenuHandler, true);
		document.querySelectorAll('.cl-badge, .cl-menu, .cl-tagged-group, #cursor-chat-labels-style').forEach(el => el.remove());
		document.querySelectorAll('.cl-has-label').forEach(el => {
			el.classList.remove('cl-has-label');
			el.style.removeProperty('--cl-color');
		});
		document.querySelectorAll('.cl-status-seen, .cl-status-unseen').forEach(el => {
			el.classList.remove('cl-status-seen');
			el.classList.remove('cl-status-unseen');
		});
		delete window.__cursorChatLabelsCleanup;
		console.log('[chat-labels] cleaned up');
	};

	window.__cursorChatLabelsDebug = function() {
		console.group('[chat-labels] debug');
		console.log('Rows found:', findAll(document, SELECTORS.row).length);
		console.log('Stored labels:', loadStoredLabels());
		console.log('Active label set:', LABELS);
		console.log('Suppressing:', suppressing, '| FiredThisFrame:', firedThisFrame, '| Disabled:', observerDisabled);
		console.log('Observer errors:', observerErrors);
		console.groupEnd();
	};

	// Дампит computed CSS заголовков и items группы Pinned (или Workspaces),
	// чтобы можно было точно подогнать стиль Tagged.
	window.__cursorChatLabelsInspectStyles = function() {
		const lines = [];
		const log = (s) => lines.push(s);
		log('=== chat-labels inspect styles ===');

		const props = [
			'fontFamily', 'fontSize', 'fontWeight', 'letterSpacing', 'textTransform',
			'color', 'opacity', 'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
			'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
			'display', 'alignItems', 'gap', 'lineHeight', 'background', 'borderRadius'
		];
		function dumpComputed(label, el) {
			if (!el) { log(`--- ${label}: NOT FOUND ---\n`); return; }
			const cs = getComputedStyle(el);
			log(`--- ${label} ---`);
			log(`tag: ${el.tagName.toLowerCase()}, class: "${el.className}"`);
			for (const p of props) log(`  ${p}: ${cs[p]}`);
			log('');
		}

		// Заголовки нативных групп
		const allTitles = Array.from(document.querySelectorAll('.ui-sidebar-group-label-title'));
		const pinnedTitle = allTitles.find(t => (t.textContent || '').trim().toLowerCase() === 'pinned');
		const workspacesTitle = allTitles.find(t => (t.textContent || '').trim().toLowerCase() === 'workspaces');
		dumpComputed('Pinned title span', pinnedTitle);
		dumpComputed('Workspaces title span', workspacesTitle);

		// Контейнер заголовка (parent span'а)
		if (pinnedTitle) {
			dumpComputed('Pinned title parent', pinnedTitle.parentElement);
			let p = pinnedTitle.parentElement;
			let depth = 0;
			while (p && depth < 5 && !p.classList.contains('ui-sidebar-group')) {
				dumpComputed(`Pinned ancestor [${depth}]`, p);
				p = p.parentElement;
				depth++;
			}
			if (p) dumpComputed('Pinned group root', p);
		}

		// Один item чата
		const firstRow = document.querySelector('li.ui-sidebar-menu-item:not(.cl-tagged-item)');
		if (firstRow) {
			dumpComputed('Row item li', firstRow);
			dumpComputed('Row btn', firstRow.querySelector('.glass-sidebar-agent-menu-btn'));
			dumpComputed('Row label', firstRow.querySelector('.ui-sidebar-menu-button-label'));
			dumpComputed('Row icon-wrapper', firstRow.querySelector('.ui-sidebar-menu-button-icon-wrapper'));
		}

		// Наш заголовок Tagged для сравнения
		const taggedHeader = document.querySelector('.cl-tagged-header');
		if (taggedHeader) {
			dumpComputed('OUR Tagged header div', taggedHeader);
			dumpComputed('OUR Tagged title span', taggedHeader.querySelector('.ui-sidebar-group-label-title'));
		}

		const out = lines.join('\n');
		console.log(out);
		try { if (navigator.clipboard) navigator.clipboard.writeText(out); } catch(e) {}
		return out;
	};

	window.__cursorChatLabelsInspect = function() {
		const lines = [];
		const log = (s) => lines.push(s);
		log('=== chat-labels inspect ===');
		log('UA: ' + navigator.userAgent);
		log('');
		const rows = Array.from(document.querySelectorAll('li.ui-sidebar-menu-item')).filter(r => !r.closest('.cl-tagged-group'));
		log(`Total rows (excl. Tagged clones): ${rows.length}`);
		const pinned = rows.find(r => isRowPinned(r));
		const unpinned = rows.find(r => !isRowPinned(r));
		const active = rows.find(r => isRowActive(r));
		function dump(label, row) {
			if (!row) { log(`--- ${label}: NOT FOUND ---\n`); return; }
			log(`--- ${label}: outerHTML (3500) ---`);
			log(row.outerHTML.slice(0, 3500));
			log(`--- ${label}: pinSlot=${!!findPinSlot(row)} pinAction=${!!findPinAction(row)} isPinned=${isRowPinned(row)} isActive=${isRowActive(row)} ---\n`);
		}
		dump('UNPINNED', unpinned);
		dump('PINNED', pinned);
		if (active && active !== unpinned && active !== pinned) dump('ACTIVE', active);

		const out = lines.join('\n');
		console.log(out);
		try { if (navigator.clipboard) navigator.clipboard.writeText(out); } catch(e) {}
		return out;
	};
})();
