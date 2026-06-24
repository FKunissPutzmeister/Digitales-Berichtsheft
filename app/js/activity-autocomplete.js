/* ===================================================================
   ACTIVITY-AUTOCOMPLETE.JS
   Typeahead-Overlay für Quill-Editoren. Kein DB-Wissen.
   Liest die aktuelle Zeile über die Quill-Text-API, rendert ein an
   document.body gehängtes Dropdown und fängt Navigationstasten nur bei
   offenem Dropdown ab (Capture-Phase auf quill.container, damit Quills
   eigene Keyboard-Bindings nicht zuerst feuern).
   =================================================================== */
(function (global) {
  'use strict';

  let _openController = null;   // nur ein Dropdown global gleichzeitig
  let _idSeq = 0;

  function attach(quill, opts) {
    opts = opts || {};
    const kind = opts.kind || '';
    const getSuggestions = opts.getSuggestions || function () { return []; };
    const onAccept = opts.onAccept || function () {};
    const limit = opts.limit || 7;

    const root = quill.root;                 // .ql-editor (contenteditable)
    const dropdownId = 'ac-dd-' + (++_idSeq);

    let dropdown = null;
    let items = [];
    let activeIdx = -1;
    let open = false;
    let lineStart = 0;
    let queryLen = 0;
    let accepting = false;

    root.setAttribute('aria-autocomplete', 'list');
    root.setAttribute('aria-expanded', 'false');

    function esc(s) {
      return String(s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // Aktuelle Cursor-Zeile bis zum Cursor als Query lesen.
    function readQuery() {
      const sel = quill.getSelection();
      if (!sel) return null;
      const lineInfo = quill.getLine(sel.index);   // [blot, offsetInLine]
      const line = lineInfo && lineInfo[0];
      if (!line) return null;
      const ls = quill.getIndex(line);
      return { lineStart: ls, cursor: sel.index, q: quill.getText(ls, sel.index - ls) };
    }

    function refresh() {
      const info = readQuery();
      if (!info) return close();
      const list = getSuggestions(info.q.trim()) || [];
      if (!list.length) return close();
      items = list.slice(0, limit);
      lineStart = info.lineStart;
      queryLen = info.cursor - info.lineStart;
      activeIdx = -1;
      renderDropdown();
      position(info.cursor);
      setOpen(true);
    }

    function renderDropdown() {
      if (!dropdown) {
        dropdown = document.createElement('div');
        dropdown.className = 'ac-dropdown';
        dropdown.id = dropdownId;
        dropdown.setAttribute('role', 'listbox');
        dropdown.addEventListener('mousedown', onDropdownMousedown);
        dropdown.addEventListener('mousemove', onDropdownMousemove);
        document.body.appendChild(dropdown);
      }
      dropdown.innerHTML = items.map(function (it, i) {
        const on = i === activeIdx;
        return '<div class="ac-option' + (on ? ' ac-option--active' : '') +
          '" role="option" id="' + dropdownId + '-opt-' + i + '" data-idx="' + i +
          '" aria-selected="' + (on ? 'true' : 'false') + '">' + highlight(it) + '</div>';
      }).join('');
    }

    function highlight(it) {
      const text = it.text;
      if (it.matchStart == null || it.matchStart < 0 || !it.matchLen) return esc(text);
      const a = text.slice(0, it.matchStart);
      const b = text.slice(it.matchStart, it.matchStart + it.matchLen);
      const c = text.slice(it.matchStart + it.matchLen);
      return esc(a) + '<span class="ac-option__match">' + esc(b) + '</span>' + esc(c);
    }

    // getBounds ist relativ zu quill.container → dessen Viewport-Rect addieren.
    function position(cursorIndex) {
      const b = quill.getBounds(cursorIndex);
      const r = quill.container.getBoundingClientRect();
      dropdown.style.left = (r.left + b.left) + 'px';
      dropdown.style.top = (r.top + b.top + b.height + 2) + 'px';
    }

    function setOpen(v) {
      open = v;
      root.setAttribute('aria-expanded', v ? 'true' : 'false');
      if (v) {
        root.setAttribute('aria-controls', dropdownId);
        if (_openController && _openController !== controller) _openController.close();
        _openController = controller;
        if (dropdown) dropdown.style.display = 'block';
      } else {
        root.removeAttribute('aria-activedescendant');
        if (dropdown) dropdown.style.display = 'none';
        if (_openController === controller) _openController = null;
      }
    }

    function setActive(i) {
      if (!items.length) return;
      activeIdx = (i + items.length) % items.length;
      const kids = dropdown.children;
      for (let k = 0; k < kids.length; k++) {
        const on = k === activeIdx;
        kids[k].classList.toggle('ac-option--active', on);
        kids[k].setAttribute('aria-selected', on ? 'true' : 'false');
      }
      const activeEl = kids[activeIdx];
      if (activeEl) {
        root.setAttribute('aria-activedescendant', activeEl.id);
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }

    function accept(i) {
      const it = items[i];
      if (!it) return;
      accepting = true;
      quill.deleteText(lineStart, queryLen, 'user');
      quill.insertText(lineStart, it.text, 'user');
      quill.setSelection(lineStart + it.text.length, 0, 'user');
      accepting = false;
      onAccept(it.text);
      close();
    }

    function close() {
      if (open || (dropdown && dropdown.style.display !== 'none')) setOpen(false);
      activeIdx = -1;
    }

    function onKeydown(e) {
      if (!open) return;                       // sonst Quill ganz normal
      switch (e.key) {
        case 'ArrowDown': e.preventDefault(); e.stopPropagation(); setActive(activeIdx + 1); break;
        case 'ArrowUp':   e.preventDefault(); e.stopPropagation(); setActive(activeIdx - 1); break;
        case 'Enter':
        case 'Tab':
          if (activeIdx >= 0) { e.preventDefault(); e.stopPropagation(); accept(activeIdx); }
          else { close(); }
          break;
        case 'Escape': e.preventDefault(); e.stopPropagation(); close(); break;
        default: break;
      }
    }

    function onTextChange(delta, old, source) { if (!accepting && source === 'user') refresh(); }
    function onSelectionChange(range, old, source) {
      if (accepting) return;
      if (!range) { close(); return; }         // blur
      refresh();
    }
    function onDropdownMousedown(e) {
      const opt = e.target.closest('.ac-option');
      if (!opt) return;
      e.preventDefault();                      // Editor-Blur verhindern
      accept(parseInt(opt.getAttribute('data-idx'), 10));
    }
    function onDropdownMousemove(e) {
      const opt = e.target.closest('.ac-option');
      if (opt) setActive(parseInt(opt.getAttribute('data-idx'), 10));
    }
    function onDocPointerDown(e) {
      if (!open) return;
      if (root.contains(e.target)) return;
      if (dropdown && dropdown.contains(e.target)) return;
      close();
    }
    function onReposition() {
      if (!open) return;
      const sel = quill.getSelection();
      if (sel) position(sel.index); else close();
    }

    // Capture-Phase auf container (Vorfahre von root) → vor Quills keydown.
    quill.container.addEventListener('keydown', onKeydown, true);
    quill.on('text-change', onTextChange);
    quill.on('selection-change', onSelectionChange);
    document.addEventListener('pointerdown', onDocPointerDown, true);
    window.addEventListener('scroll', onReposition, true);
    window.addEventListener('resize', onReposition);

    const controller = {
      close: close,
      refresh: refresh,
      destroy: function () {
        close();
        quill.container.removeEventListener('keydown', onKeydown, true);
        quill.off('text-change', onTextChange);
        quill.off('selection-change', onSelectionChange);
        document.removeEventListener('pointerdown', onDocPointerDown, true);
        window.removeEventListener('scroll', onReposition, true);
        window.removeEventListener('resize', onReposition);
        if (dropdown && dropdown.parentNode) dropdown.parentNode.removeChild(dropdown);
        dropdown = null;
        ['aria-autocomplete', 'aria-expanded', 'aria-controls', 'aria-activedescendant']
          .forEach(function (a) { root.removeAttribute(a); });
      },
    };

    return controller;
  }

  const api = { attach: attach };
  global.ActivityAutocomplete = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
