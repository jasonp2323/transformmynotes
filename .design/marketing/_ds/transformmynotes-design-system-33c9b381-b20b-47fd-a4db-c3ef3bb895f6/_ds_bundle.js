/* @ds-bundle: {"format":3,"namespace":"TransformMyNotesDesignSystem_33c9b3","components":[{"name":"HighlightText","sourcePath":"components/brand/HighlightText.jsx"},{"name":"NoteCard","sourcePath":"components/brand/NoteCard.jsx"},{"name":"Button","sourcePath":"components/buttons/Button.jsx"},{"name":"IconButton","sourcePath":"components/buttons/IconButton.jsx"},{"name":"Avatar","sourcePath":"components/data-display/Avatar.jsx"},{"name":"Badge","sourcePath":"components/data-display/Badge.jsx"},{"name":"Card","sourcePath":"components/data-display/Card.jsx"},{"name":"Tag","sourcePath":"components/data-display/Tag.jsx"},{"name":"Dialog","sourcePath":"components/feedback/Dialog.jsx"},{"name":"Toast","sourcePath":"components/feedback/Toast.jsx"},{"name":"Checkbox","sourcePath":"components/forms/Checkbox.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"Select","sourcePath":"components/forms/Select.jsx"},{"name":"Switch","sourcePath":"components/forms/Switch.jsx"},{"name":"Textarea","sourcePath":"components/forms/Textarea.jsx"},{"name":"SegmentedControl","sourcePath":"components/navigation/SegmentedControl.jsx"},{"name":"Tabs","sourcePath":"components/navigation/Tabs.jsx"}],"sourceHashes":{"components/brand/HighlightText.jsx":"20796a1d3ef8","components/brand/NoteCard.jsx":"17b61edc81eb","components/buttons/Button.jsx":"b406749601f2","components/buttons/IconButton.jsx":"3c3c418374d9","components/data-display/Avatar.jsx":"a426587e2964","components/data-display/Badge.jsx":"008027314d32","components/data-display/Card.jsx":"27654ce6a7aa","components/data-display/Tag.jsx":"460df5b11d64","components/feedback/Dialog.jsx":"c01cebafd7d0","components/feedback/Toast.jsx":"0a28bc1b6b30","components/forms/Checkbox.jsx":"baa3adbf5c7c","components/forms/Input.jsx":"00a3f392502b","components/forms/Select.jsx":"eeeb187c4aaa","components/forms/Switch.jsx":"c6c0c17c10c2","components/forms/Textarea.jsx":"33cb960f1f9e","components/navigation/SegmentedControl.jsx":"700cd38d7946","components/navigation/Tabs.jsx":"0800859b753e","ui_kits/mobile-app/app.jsx":"77a6f40d8669","ui_kits/mobile-app/ios-frame.jsx":"be3343be4b51"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.TransformMyNotesDesignSystem_33c9b3 = window.TransformMyNotesDesignSystem_33c9b3 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/brand/HighlightText.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const STYLE = `
.tmn-mark {
  background: var(--highlighter);
  color: inherit; padding: 0 3px; border-radius: 4px;
  box-decoration-break: clone; -webkit-box-decoration-break: clone;
}
.tmn-mark--strong { background: var(--highlighter-strong); }
.tmn-mark--teal { background: var(--highlighter-teal); }
.tmn-mark--underline { background: transparent; border-bottom: 2px solid var(--accent); border-radius: 0; padding: 0; }
.tmn-mark--swipe {
  background-image: linear-gradient(var(--highlighter), var(--highlighter));
  background-repeat: no-repeat; background-size: 0% 100%;
  animation: tmn-swipe var(--dur-slow) var(--ease-out) forwards;
}
@keyframes tmn-swipe { to { background-size: 100% 100%; } }
@media (prefers-reduced-motion: reduce) {
  .tmn-mark--swipe { animation: none; background-size: 100% 100%; }
}
`;
if (typeof document !== 'undefined' && !document.getElementById('tmn-mark-css')) {
  const el = document.createElement('style');
  el.id = 'tmn-mark-css';
  el.textContent = STYLE;
  document.head.appendChild(el);
}
function HighlightText({
  variant = 'gold',
  animate = false,
  className = '',
  children,
  ...rest
}) {
  const cls = ['tmn-mark', variant === 'strong' ? 'tmn-mark--strong' : '', variant === 'teal' ? 'tmn-mark--teal' : '', variant === 'underline' ? 'tmn-mark--underline' : '', animate ? 'tmn-mark--swipe' : '', className].filter(Boolean).join(' ');
  return /*#__PURE__*/React.createElement("mark", _extends({
    className: cls
  }, rest), children);
}
Object.assign(__ds_scope, { HighlightText });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/brand/HighlightText.jsx", error: String((e && e.message) || e) }); }

// components/buttons/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* Inject component CSS once when the module loads (works in the bundle + cards) */
const STYLE = `
.tmn-btn {
  --_bg: var(--brand);
  --_fg: var(--on-brand);
  --_bd: transparent;
  font-family: var(--font-sans);
  font-weight: 600;
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  border: 1.5px solid var(--_bd);
  background: var(--_bg); color: var(--_fg);
  border-radius: var(--radius-pill);
  cursor: pointer; white-space: nowrap;
  text-decoration: none; line-height: 1;
  transition: background var(--dur-fast) var(--ease-soft),
              border-color var(--dur-fast) var(--ease-soft),
              transform var(--dur-fast) var(--ease-soft),
              box-shadow var(--dur-fast) var(--ease-soft);
}
.tmn-btn:focus-visible { outline: none; box-shadow: var(--focus-ring); }
.tmn-btn:active { transform: translateY(1px) scale(0.99); }
.tmn-btn[disabled], .tmn-btn[aria-disabled="true"] { opacity: 0.45; cursor: not-allowed; pointer-events: none; }

/* sizes */
.tmn-btn--sm { font-size: 13px; padding: 8px 14px; min-height: 36px; }
.tmn-btn--md { font-size: 15px; padding: 11px 20px; min-height: 44px; }
.tmn-btn--lg { font-size: 17px; padding: 14px 26px; min-height: 52px; }
.tmn-btn--full { width: 100%; }

/* variants */
.tmn-btn--primary { --_bg: var(--brand); --_fg: var(--on-brand); box-shadow: var(--shadow-sm); }
.tmn-btn--primary:hover { --_bg: var(--brand-hover); box-shadow: var(--shadow-brand); }
.tmn-btn--primary:active { --_bg: var(--brand-press); }

.tmn-btn--accent { --_bg: var(--accent); --_fg: var(--on-accent); box-shadow: var(--shadow-sm); }
.tmn-btn--accent:hover { --_bg: var(--accent-hover); }
.tmn-btn--accent:active { --_bg: var(--accent-press); }

.tmn-btn--secondary { --_bg: var(--surface-card); --_fg: var(--text-strong); --_bd: var(--border-strong); }
.tmn-btn--secondary:hover { --_bg: var(--surface-sunken); --_bd: var(--brand); }

.tmn-btn--ghost { --_bg: transparent; --_fg: var(--brand-strong); --_bd: transparent; }
.tmn-btn--ghost:hover { --_bg: var(--surface-brand-soft); }

.tmn-btn--danger { --_bg: var(--danger-50); --_fg: var(--danger-500); --_bd: transparent; }
.tmn-btn--danger:hover { --_bg: #f3dccf; }

.tmn-btn .tmn-btn__icon { display: inline-flex; flex: none; }
`;
if (typeof document !== 'undefined' && !document.getElementById('tmn-button-css')) {
  const el = document.createElement('style');
  el.id = 'tmn-button-css';
  el.textContent = STYLE;
  document.head.appendChild(el);
}
function Button({
  variant = 'primary',
  size = 'md',
  leftIcon = null,
  rightIcon = null,
  fullWidth = false,
  as = 'button',
  className = '',
  children,
  ...rest
}) {
  const Tag = as;
  const cls = ['tmn-btn', `tmn-btn--${variant}`, `tmn-btn--${size}`, fullWidth ? 'tmn-btn--full' : '', className].filter(Boolean).join(' ');
  return /*#__PURE__*/React.createElement(Tag, _extends({
    className: cls
  }, rest), leftIcon ? /*#__PURE__*/React.createElement("span", {
    className: "tmn-btn__icon"
  }, leftIcon) : null, children ? /*#__PURE__*/React.createElement("span", null, children) : null, rightIcon ? /*#__PURE__*/React.createElement("span", {
    className: "tmn-btn__icon"
  }, rightIcon) : null);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/buttons/Button.jsx", error: String((e && e.message) || e) }); }

// components/buttons/IconButton.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const STYLE = `
.tmn-iconbtn {
  font-family: var(--font-sans);
  display: inline-flex; align-items: center; justify-content: center;
  border: 1.5px solid transparent;
  background: transparent; color: var(--text-muted);
  border-radius: var(--radius-pill);
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-soft),
              color var(--dur-fast) var(--ease-soft),
              border-color var(--dur-fast) var(--ease-soft),
              transform var(--dur-fast) var(--ease-soft);
}
.tmn-iconbtn:hover { background: var(--surface-sunken); color: var(--text-strong); }
.tmn-iconbtn:focus-visible { outline: none; box-shadow: var(--focus-ring); }
.tmn-iconbtn:active { transform: scale(0.92); }
.tmn-iconbtn[disabled] { opacity: 0.4; cursor: not-allowed; pointer-events: none; }

.tmn-iconbtn--sm { width: 36px; height: 36px; }
.tmn-iconbtn--md { width: 44px; height: 44px; }
.tmn-iconbtn--lg { width: 52px; height: 52px; }

.tmn-iconbtn--solid { background: var(--brand); color: var(--on-brand); box-shadow: var(--shadow-sm); }
.tmn-iconbtn--solid:hover { background: var(--brand-hover); color: var(--on-brand); box-shadow: var(--shadow-brand); }

.tmn-iconbtn--soft { background: var(--surface-brand-soft); color: var(--brand-strong); }
.tmn-iconbtn--soft:hover { background: var(--teal-100); }

.tmn-iconbtn--accent { background: var(--accent); color: var(--on-accent); box-shadow: var(--shadow-sm); }
.tmn-iconbtn--accent:hover { background: var(--accent-hover); color: var(--on-accent); }
`;
if (typeof document !== 'undefined' && !document.getElementById('tmn-iconbtn-css')) {
  const el = document.createElement('style');
  el.id = 'tmn-iconbtn-css';
  el.textContent = STYLE;
  document.head.appendChild(el);
}
function IconButton({
  variant = 'plain',
  size = 'md',
  label,
  className = '',
  children,
  ...rest
}) {
  const cls = ['tmn-iconbtn', `tmn-iconbtn--${variant}`, `tmn-iconbtn--${size}`, className].filter(Boolean).join(' ');
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    className: cls,
    "aria-label": label,
    title: label
  }, rest), children);
}
Object.assign(__ds_scope, { IconButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/buttons/IconButton.jsx", error: String((e && e.message) || e) }); }

// components/data-display/Avatar.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const STYLE = `
.tmn-avatar {
  font-family: var(--font-sans); font-weight: 600;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 50%; overflow: hidden; flex: none;
  background: var(--gradient-teal); color: #fff; position: relative;
  box-shadow: inset 0 0 0 1.5px rgba(255,255,255,0.18);
}
.tmn-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
.tmn-avatar--sm { width: 28px; height: 28px; font-size: 11px; }
.tmn-avatar--md { width: 40px; height: 40px; font-size: 15px; }
.tmn-avatar--lg { width: 56px; height: 56px; font-size: 20px; }
.tmn-avatar__ring { box-shadow: 0 0 0 2px var(--surface-card), 0 0 0 4px var(--brand); }
.tmn-avatar-group { display: inline-flex; }
.tmn-avatar-group .tmn-avatar { box-shadow: 0 0 0 2px var(--surface-card); margin-left: -10px; }
.tmn-avatar-group .tmn-avatar:first-child { margin-left: 0; }
`;
if (typeof document !== 'undefined' && !document.getElementById('tmn-avatar-css')) {
  const el = document.createElement('style');
  el.id = 'tmn-avatar-css';
  el.textContent = STYLE;
  document.head.appendChild(el);
}
function initials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map(p => p[0] || '').join('').toUpperCase();
}
const TINTS = ['linear-gradient(135deg,#16747e,#4a8a62)', 'linear-gradient(135deg,#4a8a62,#97ab38)', 'linear-gradient(135deg,#307f70,#7ea046)', 'linear-gradient(135deg,#97ab38,#cbc11c)'];
function Avatar({
  name = '',
  src,
  size = 'md',
  ring = false,
  className = '',
  style,
  ...rest
}) {
  const cls = ['tmn-avatar', `tmn-avatar--${size}`, ring ? 'tmn-avatar__ring' : '', className].filter(Boolean).join(' ');
  const tint = TINTS[(name.charCodeAt(0) || 0) % TINTS.length];
  return /*#__PURE__*/React.createElement("span", _extends({
    className: cls,
    style: {
      background: src ? undefined : tint,
      ...style
    }
  }, rest), src ? /*#__PURE__*/React.createElement("img", {
    src: src,
    alt: name
  }) : initials(name));
}
Object.assign(__ds_scope, { Avatar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data-display/Avatar.jsx", error: String((e && e.message) || e) }); }

// components/data-display/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const STYLE = `
.tmn-badge {
  font-family: var(--font-sans); font-weight: 600; font-size: 12px; line-height: 1;
  display: inline-flex; align-items: center; gap: 5px;
  padding: 5px 10px; border-radius: var(--radius-pill);
  white-space: nowrap;
}
.tmn-badge--dot::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.tmn-badge--neutral { background: var(--stone-100); color: var(--stone-700); }
.tmn-badge--brand   { background: var(--surface-brand-soft); color: var(--brand-strong); }
.tmn-badge--accent  { background: var(--gold-100); color: var(--gold-600); }
.tmn-badge--success { background: var(--success-50); color: var(--success-500); }
.tmn-badge--warning { background: var(--warning-50); color: var(--warning-500); }
.tmn-badge--danger  { background: var(--danger-50); color: var(--danger-500); }
.tmn-badge--solid   { background: var(--brand); color: var(--on-brand); }
`;
if (typeof document !== 'undefined' && !document.getElementById('tmn-badge-css')) {
  const el = document.createElement('style');
  el.id = 'tmn-badge-css';
  el.textContent = STYLE;
  document.head.appendChild(el);
}
function Badge({
  tone = 'neutral',
  dot = false,
  className = '',
  children,
  ...rest
}) {
  const cls = ['tmn-badge', `tmn-badge--${tone}`, dot ? 'tmn-badge--dot' : '', className].filter(Boolean).join(' ');
  return /*#__PURE__*/React.createElement("span", _extends({
    className: cls
  }, rest), children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data-display/Badge.jsx", error: String((e && e.message) || e) }); }

// components/data-display/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const STYLE = `
.tmn-card {
  font-family: var(--font-sans);
  background: var(--surface-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
  transition: box-shadow var(--dur-base) var(--ease-soft), transform var(--dur-base) var(--ease-soft), border-color var(--dur-base) var(--ease-soft);
}
.tmn-card--pad { padding: 20px; }
.tmn-card--interactive { cursor: pointer; }
.tmn-card--interactive:hover { box-shadow: var(--shadow-md); transform: translateY(-2px); border-color: var(--border-default); }
.tmn-card--interactive:active { transform: translateY(0); }
.tmn-card--flat { box-shadow: none; }
.tmn-card--ghost { background: transparent; border-style: dashed; border-color: var(--border-default); box-shadow: none; }
.tmn-card__accent { height: 4px; background: var(--gradient-transform); }
`;
if (typeof document !== 'undefined' && !document.getElementById('tmn-card-css')) {
  const el = document.createElement('style');
  el.id = 'tmn-card-css';
  el.textContent = STYLE;
  document.head.appendChild(el);
}
function Card({
  variant = 'default',
  padded = true,
  accentBar = false,
  as = 'div',
  className = '',
  children,
  ...rest
}) {
  const Tag = as;
  const cls = ['tmn-card', padded ? 'tmn-card--pad' : '', variant === 'interactive' ? 'tmn-card--interactive' : '', variant === 'flat' ? 'tmn-card--flat' : '', variant === 'ghost' ? 'tmn-card--ghost' : '', className].filter(Boolean).join(' ');
  return /*#__PURE__*/React.createElement(Tag, _extends({
    className: cls
  }, rest), accentBar ? /*#__PURE__*/React.createElement("div", {
    className: "tmn-card__accent",
    style: padded ? {
      margin: '-20px -20px 16px'
    } : null
  }) : null, children);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data-display/Card.jsx", error: String((e && e.message) || e) }); }

// components/data-display/Tag.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const STYLE = `
.tmn-tag {
  font-family: var(--font-sans); font-size: 13px; font-weight: 500;
  display: inline-flex; align-items: center; gap: 6px;
  padding: 5px 11px; border-radius: var(--radius-pill);
  background: var(--surface-sunken); color: var(--text-body);
  border: 1px solid var(--border-subtle);
  transition: background var(--dur-fast) var(--ease-soft), border-color var(--dur-fast) var(--ease-soft);
}
.tmn-tag--brand { background: var(--surface-brand-soft); color: var(--brand-strong); border-color: transparent; }
.tmn-tag--interactive { cursor: pointer; }
.tmn-tag--interactive:hover { border-color: var(--border-strong); background: var(--stone-100); }
.tmn-tag__hash { color: var(--text-subtle); }
.tmn-tag__x {
  display: inline-flex; align-items: center; justify-content: center;
  width: 16px; height: 16px; border-radius: 50%; border: none; cursor: pointer;
  background: transparent; color: var(--text-subtle); padding: 0; margin-right: -3px;
  transition: background var(--dur-fast) var(--ease-soft), color var(--dur-fast) var(--ease-soft);
}
.tmn-tag__x:hover { background: var(--stone-300); color: var(--text-strong); }
`;
if (typeof document !== 'undefined' && !document.getElementById('tmn-tag-css')) {
  const el = document.createElement('style');
  el.id = 'tmn-tag-css';
  el.textContent = STYLE;
  document.head.appendChild(el);
}
function Tag({
  tone = 'default',
  hash = false,
  onRemove,
  className = '',
  children,
  ...rest
}) {
  const interactive = Boolean(rest.onClick);
  const cls = ['tmn-tag', tone === 'brand' ? 'tmn-tag--brand' : '', interactive ? 'tmn-tag--interactive' : '', className].filter(Boolean).join(' ');
  return /*#__PURE__*/React.createElement("span", _extends({
    className: cls
  }, rest), hash ? /*#__PURE__*/React.createElement("span", {
    className: "tmn-tag__hash"
  }, "#") : null, children, onRemove ? /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "tmn-tag__x",
    "aria-label": "Remove",
    onClick: e => {
      e.stopPropagation();
      onRemove(e);
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "10",
    height: "10",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "3",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("line", {
    x1: "5",
    y1: "5",
    x2: "19",
    y2: "19"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "19",
    y1: "5",
    x2: "5",
    y2: "19"
  }))) : null);
}
Object.assign(__ds_scope, { Tag });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data-display/Tag.jsx", error: String((e && e.message) || e) }); }

// components/brand/NoteCard.jsx
try { (() => {
const STYLE = `
.tmn-note { display: flex; flex-direction: column; gap: 10px; }
.tmn-note__top { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.tmn-note__course { font-size: 12px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: var(--brand); white-space: nowrap; }
.tmn-note__title { font-family: var(--font-serif); font-size: 19px; font-weight: 600; color: var(--text-strong); margin: 0; line-height: 1.25; letter-spacing: -0.01em; }
.tmn-note__snippet { font-family: var(--font-serif); font-size: 14.5px; line-height: 1.55; color: var(--text-muted); margin: 0;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.tmn-note__snippet mark { background: var(--highlighter); padding: 0 2px; border-radius: 3px; color: inherit; }
.tmn-note__tags { display: flex; gap: 6px; flex-wrap: wrap; }
.tmn-note__meta { display: flex; align-items: center; gap: 12px; margin-top: 2px; font-family: var(--font-mono); font-size: 11px; color: var(--text-subtle); }
.tmn-note__meta-item { display: inline-flex; align-items: center; gap: 4px; }
`;
if (typeof document !== 'undefined' && !document.getElementById('tmn-note-css')) {
  const el = document.createElement('style');
  el.id = 'tmn-note-css';
  el.textContent = STYLE;
  document.head.appendChild(el);
}
function NoteCard({
  course,
  title,
  snippet,
  tags = [],
  highlights,
  words,
  synced = true,
  status = 'clean',
  onClick,
  className = ''
}) {
  return /*#__PURE__*/React.createElement(__ds_scope.Card, {
    variant: onClick ? 'interactive' : 'default',
    onClick: onClick,
    className: className
  }, /*#__PURE__*/React.createElement("div", {
    className: "tmn-note"
  }, /*#__PURE__*/React.createElement("div", {
    className: "tmn-note__top"
  }, course ? /*#__PURE__*/React.createElement("span", {
    className: "tmn-note__course"
  }, course) : /*#__PURE__*/React.createElement("span", null), status === 'original' ? /*#__PURE__*/React.createElement(__ds_scope.Badge, {
    tone: "warning",
    dot: true
  }, "Original") : /*#__PURE__*/React.createElement(__ds_scope.Badge, {
    tone: "success",
    dot: true
  }, synced ? 'Synced' : 'Clean')), title ? /*#__PURE__*/React.createElement("h3", {
    className: "tmn-note__title"
  }, title) : null, snippet ? /*#__PURE__*/React.createElement("p", {
    className: "tmn-note__snippet",
    dangerouslySetInnerHTML: {
      __html: snippet
    }
  }) : null, tags.length ? /*#__PURE__*/React.createElement("div", {
    className: "tmn-note__tags"
  }, tags.map(t => /*#__PURE__*/React.createElement(__ds_scope.Tag, {
    key: t,
    hash: true,
    tone: "brand"
  }, t))) : null, /*#__PURE__*/React.createElement("div", {
    className: "tmn-note__meta"
  }, highlights != null ? /*#__PURE__*/React.createElement("span", {
    className: "tmn-note__meta-item"
  }, "\u2605 ", highlights, " highlights") : null, words != null ? /*#__PURE__*/React.createElement("span", {
    className: "tmn-note__meta-item"
  }, words, " words") : null)));
}
Object.assign(__ds_scope, { NoteCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/brand/NoteCard.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Dialog.jsx
try { (() => {
const STYLE = `
.tmn-dialog-overlay {
  position: fixed; inset: 0; z-index: 1000;
  background: rgba(33, 30, 23, 0.42);
  backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px);
  display: flex; align-items: center; justify-content: center; padding: 20px;
  animation: tmn-fade var(--dur-base) var(--ease-out);
}
@keyframes tmn-fade { from { opacity: 0; } to { opacity: 1; } }
.tmn-dialog {
  font-family: var(--font-sans);
  background: var(--surface-card);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-xl);
  width: 100%; max-width: 440px; overflow: hidden;
  animation: tmn-dialog-in var(--dur-base) var(--ease-out);
}
@keyframes tmn-dialog-in { from { opacity: 0; transform: translateY(12px) scale(0.98); } to { opacity: 1; transform: none; } }
.tmn-dialog__body { padding: 26px 26px 0; }
.tmn-dialog__title { font-family: var(--font-serif); font-size: 22px; font-weight: 600; color: var(--text-strong); margin: 0 0 8px; letter-spacing: -0.01em; }
.tmn-dialog__desc { font-size: 15px; line-height: 1.55; color: var(--text-muted); margin: 0; }
.tmn-dialog__content { padding: 18px 26px 0; }
.tmn-dialog__footer { display: flex; justify-content: flex-end; gap: 10px; padding: 24px 26px; }
`;
if (typeof document !== 'undefined' && !document.getElementById('tmn-dialog-css')) {
  const el = document.createElement('style');
  el.id = 'tmn-dialog-css';
  el.textContent = STYLE;
  document.head.appendChild(el);
}
function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className = ''
}) {
  React.useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === 'Escape' && onClose) onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return /*#__PURE__*/React.createElement("div", {
    className: "tmn-dialog-overlay",
    onClick: e => {
      if (e.target === e.currentTarget && onClose) onClose();
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: `tmn-dialog ${className}`,
    role: "dialog",
    "aria-modal": "true",
    "aria-label": title
  }, title || description ? /*#__PURE__*/React.createElement("div", {
    className: "tmn-dialog__body"
  }, title ? /*#__PURE__*/React.createElement("h2", {
    className: "tmn-dialog__title"
  }, title) : null, description ? /*#__PURE__*/React.createElement("p", {
    className: "tmn-dialog__desc"
  }, description) : null) : null, children ? /*#__PURE__*/React.createElement("div", {
    className: "tmn-dialog__content"
  }, children) : null, footer ? /*#__PURE__*/React.createElement("div", {
    className: "tmn-dialog__footer"
  }, footer) : null));
}
Object.assign(__ds_scope, { Dialog });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Dialog.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Toast.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const STYLE = `
.tmn-toast {
  font-family: var(--font-sans);
  display: flex; align-items: flex-start; gap: 12px;
  background: var(--surface-raised);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  padding: 14px 16px; min-width: 280px; max-width: 420px;
  border-left: 4px solid var(--brand);
  animation: tmn-toast-in var(--dur-base) var(--ease-out);
}
@keyframes tmn-toast-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
.tmn-toast--success { border-left-color: var(--success-500); }
.tmn-toast--warning { border-left-color: var(--warning-500); }
.tmn-toast--danger  { border-left-color: var(--danger-500); }
.tmn-toast__icon { flex: none; width: 22px; height: 22px; display: inline-flex; color: var(--brand); margin-top: 1px; }
.tmn-toast--success .tmn-toast__icon { color: var(--success-500); }
.tmn-toast--warning .tmn-toast__icon { color: var(--warning-500); }
.tmn-toast--danger .tmn-toast__icon { color: var(--danger-500); }
.tmn-toast__body { flex: 1; }
.tmn-toast__title { font-size: 14px; font-weight: 700; color: var(--text-strong); }
.tmn-toast__desc { font-size: 13px; color: var(--text-muted); margin-top: 2px; line-height: 1.45; }
.tmn-toast__close {
  flex: none; border: none; background: transparent; cursor: pointer; color: var(--text-subtle);
  width: 24px; height: 24px; border-radius: var(--radius-sm); display: inline-flex; align-items: center; justify-content: center;
  transition: background var(--dur-fast) var(--ease-soft), color var(--dur-fast) var(--ease-soft);
}
.tmn-toast__close:hover { background: var(--surface-sunken); color: var(--text-strong); }
`;
if (typeof document !== 'undefined' && !document.getElementById('tmn-toast-css')) {
  const el = document.createElement('style');
  el.id = 'tmn-toast-css';
  el.textContent = STYLE;
  document.head.appendChild(el);
}
function Toast({
  tone = 'brand',
  icon = null,
  title,
  children,
  onClose,
  className = '',
  ...rest
}) {
  const cls = ['tmn-toast', `tmn-toast--${tone}`, className].filter(Boolean).join(' ');
  return /*#__PURE__*/React.createElement("div", _extends({
    className: cls,
    role: "status"
  }, rest), icon ? /*#__PURE__*/React.createElement("span", {
    className: "tmn-toast__icon"
  }, icon) : null, /*#__PURE__*/React.createElement("div", {
    className: "tmn-toast__body"
  }, title ? /*#__PURE__*/React.createElement("div", {
    className: "tmn-toast__title"
  }, title) : null, children ? /*#__PURE__*/React.createElement("div", {
    className: "tmn-toast__desc"
  }, children) : null), onClose ? /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "tmn-toast__close",
    "aria-label": "Dismiss",
    onClick: onClose
  }, /*#__PURE__*/React.createElement("svg", {
    width: "14",
    height: "14",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2.5",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("line", {
    x1: "5",
    y1: "5",
    x2: "19",
    y2: "19"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "19",
    y1: "5",
    x2: "5",
    y2: "19"
  }))) : null);
}
Object.assign(__ds_scope, { Toast });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Toast.jsx", error: String((e && e.message) || e) }); }

// components/forms/Checkbox.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const STYLE = `
.tmn-check { display: inline-flex; align-items: flex-start; gap: 10px; font-family: var(--font-sans); cursor: pointer; user-select: none; }
.tmn-check__box {
  flex: none; width: 22px; height: 22px; margin-top: 1px;
  border: 1.5px solid var(--border-strong); border-radius: var(--radius-xs);
  background: var(--surface-card);
  display: inline-flex; align-items: center; justify-content: center;
  transition: background var(--dur-fast) var(--ease-soft), border-color var(--dur-fast) var(--ease-soft), transform var(--dur-fast) var(--ease-soft);
}
.tmn-check__box svg { width: 14px; height: 14px; opacity: 0; transform: scale(0.6); transition: opacity var(--dur-fast) var(--ease-soft), transform var(--dur-fast) var(--ease-soft); }
.tmn-check input { position: absolute; opacity: 0; width: 0; height: 0; }
.tmn-check input:checked + .tmn-check__box { background: var(--brand); border-color: var(--brand); }
.tmn-check input:checked + .tmn-check__box svg { opacity: 1; transform: scale(1); color: #fff; }
.tmn-check input:focus-visible + .tmn-check__box { box-shadow: var(--focus-ring); }
.tmn-check:active .tmn-check__box { transform: scale(0.92); }
.tmn-check input:disabled + .tmn-check__box { opacity: 0.45; }
.tmn-check__label { font-size: 15px; color: var(--text-body); line-height: 1.45; }
`;
if (typeof document !== 'undefined' && !document.getElementById('tmn-check-css')) {
  const el = document.createElement('style');
  el.id = 'tmn-check-css';
  el.textContent = STYLE;
  document.head.appendChild(el);
}
function Checkbox({
  label,
  id,
  className = '',
  children,
  ...rest
}) {
  const autoId = React.useId();
  const fieldId = id || autoId;
  return /*#__PURE__*/React.createElement("label", {
    className: `tmn-check ${className}`,
    htmlFor: fieldId
  }, /*#__PURE__*/React.createElement("input", _extends({
    type: "checkbox",
    id: fieldId
  }, rest)), /*#__PURE__*/React.createElement("span", {
    className: "tmn-check__box",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "3.5",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("polyline", {
    points: "20 6 9 17 4 12"
  }))), label || children ? /*#__PURE__*/React.createElement("span", {
    className: "tmn-check__label"
  }, label || children) : null);
}
Object.assign(__ds_scope, { Checkbox });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Checkbox.jsx", error: String((e && e.message) || e) }); }

// components/forms/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const STYLE = `
.tmn-field { display: flex; flex-direction: column; gap: 6px; font-family: var(--font-sans); }
.tmn-field__label { font-size: 13px; font-weight: 600; color: var(--text-body); }
.tmn-field__req { color: var(--danger-500); margin-left: 2px; }
.tmn-field__hint { font-size: 12px; color: var(--text-muted); }
.tmn-field__hint--error { color: var(--danger-500); }

.tmn-input {
  font-family: var(--font-sans); font-size: 15px; color: var(--text-strong);
  background: var(--surface-sunken);
  border: 1.5px solid var(--border-default);
  border-radius: var(--radius-md);
  padding: 11px 14px; min-height: 44px; width: 100%;
  box-shadow: var(--shadow-inset);
  transition: border-color var(--dur-fast) var(--ease-soft), box-shadow var(--dur-fast) var(--ease-soft), background var(--dur-fast) var(--ease-soft);
}
.tmn-input::placeholder { color: var(--text-subtle); }
.tmn-input:hover { border-color: var(--border-strong); }
.tmn-input:focus { outline: none; background: var(--surface-card); border-color: var(--brand); box-shadow: var(--focus-ring); }
.tmn-input[aria-invalid="true"] { border-color: var(--danger-500); }
.tmn-input[aria-invalid="true"]:focus { box-shadow: 0 0 0 3px rgba(194,84,47,0.28); }
.tmn-input[disabled] { opacity: 0.55; cursor: not-allowed; }

.tmn-input-wrap { position: relative; display: flex; align-items: center; }
.tmn-input-wrap .tmn-input--with-lead { padding-left: 42px; }
.tmn-input-wrap .tmn-input--with-trail { padding-right: 42px; }
.tmn-input-wrap__lead, .tmn-input-wrap__trail { position: absolute; display: inline-flex; color: var(--text-subtle); pointer-events: none; }
.tmn-input-wrap__lead { left: 14px; }
.tmn-input-wrap__trail { right: 14px; }
`;
if (typeof document !== 'undefined' && !document.getElementById('tmn-input-css')) {
  const el = document.createElement('style');
  el.id = 'tmn-input-css';
  el.textContent = STYLE;
  document.head.appendChild(el);
}
function Input({
  label,
  hint,
  error,
  required = false,
  leadingIcon = null,
  trailingIcon = null,
  id,
  className = '',
  ...rest
}) {
  const autoId = React.useId();
  const fieldId = id || autoId;
  const invalid = Boolean(error);
  const inputCls = ['tmn-input', leadingIcon ? 'tmn-input--with-lead' : '', trailingIcon ? 'tmn-input--with-trail' : '', className].filter(Boolean).join(' ');
  return /*#__PURE__*/React.createElement("div", {
    className: "tmn-field"
  }, label ? /*#__PURE__*/React.createElement("label", {
    className: "tmn-field__label",
    htmlFor: fieldId
  }, label, required ? /*#__PURE__*/React.createElement("span", {
    className: "tmn-field__req"
  }, "*") : null) : null, /*#__PURE__*/React.createElement("div", {
    className: "tmn-input-wrap"
  }, leadingIcon ? /*#__PURE__*/React.createElement("span", {
    className: "tmn-input-wrap__lead"
  }, leadingIcon) : null, /*#__PURE__*/React.createElement("input", _extends({
    id: fieldId,
    className: inputCls,
    "aria-invalid": invalid || undefined,
    "aria-describedby": hint || error ? `${fieldId}-hint` : undefined
  }, rest)), trailingIcon ? /*#__PURE__*/React.createElement("span", {
    className: "tmn-input-wrap__trail"
  }, trailingIcon) : null), error || hint ? /*#__PURE__*/React.createElement("span", {
    id: `${fieldId}-hint`,
    className: `tmn-field__hint${error ? ' tmn-field__hint--error' : ''}`
  }, error || hint) : null);
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Input.jsx", error: String((e && e.message) || e) }); }

// components/forms/Select.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const STYLE = `
.tmn-select-wrap { display: flex; flex-direction: column; gap: 6px; font-family: var(--font-sans); }
.tmn-select-inner { position: relative; display: flex; align-items: center; }
.tmn-select {
  appearance: none; -webkit-appearance: none;
  font-family: var(--font-sans); font-size: 15px; color: var(--text-strong);
  background: var(--surface-sunken);
  border: 1.5px solid var(--border-default);
  border-radius: var(--radius-md);
  padding: 11px 40px 11px 14px; min-height: 44px; width: 100%;
  box-shadow: var(--shadow-inset); cursor: pointer;
  transition: border-color var(--dur-fast) var(--ease-soft), box-shadow var(--dur-fast) var(--ease-soft);
}
.tmn-select:hover { border-color: var(--border-strong); }
.tmn-select:focus { outline: none; background: var(--surface-card); border-color: var(--brand); box-shadow: var(--focus-ring); }
.tmn-select[disabled] { opacity: 0.55; cursor: not-allowed; }
.tmn-select-chevron {
  position: absolute; right: 14px; pointer-events: none; color: var(--text-muted);
  width: 0; height: 0; border-left: 5px solid transparent; border-right: 5px solid transparent;
  border-top: 6px solid currentColor;
}
`;
if (typeof document !== 'undefined' && !document.getElementById('tmn-select-css')) {
  const el = document.createElement('style');
  el.id = 'tmn-select-css';
  el.textContent = STYLE;
  document.head.appendChild(el);
}
function Select({
  label,
  hint,
  options = [],
  placeholder,
  id,
  className = '',
  children,
  ...rest
}) {
  const autoId = React.useId();
  const fieldId = id || autoId;
  return /*#__PURE__*/React.createElement("div", {
    className: "tmn-select-wrap"
  }, label ? /*#__PURE__*/React.createElement("label", {
    className: "tmn-field__label",
    htmlFor: fieldId
  }, label) : null, /*#__PURE__*/React.createElement("div", {
    className: "tmn-select-inner"
  }, /*#__PURE__*/React.createElement("select", _extends({
    id: fieldId,
    className: `tmn-select ${className}`
  }, rest), placeholder ? /*#__PURE__*/React.createElement("option", {
    value: "",
    disabled: true
  }, placeholder) : null, children ? children : options.map(o => {
    const value = typeof o === 'string' ? o : o.value;
    const label = typeof o === 'string' ? o : o.label;
    return /*#__PURE__*/React.createElement("option", {
      key: value,
      value: value
    }, label);
  })), /*#__PURE__*/React.createElement("span", {
    className: "tmn-select-chevron",
    "aria-hidden": "true"
  })), hint ? /*#__PURE__*/React.createElement("span", {
    className: "tmn-field__hint"
  }, hint) : null);
}
Object.assign(__ds_scope, { Select });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Select.jsx", error: String((e && e.message) || e) }); }

// components/forms/Switch.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const STYLE = `
.tmn-switch { display: inline-flex; align-items: center; gap: 12px; font-family: var(--font-sans); cursor: pointer; user-select: none; }
.tmn-switch input { position: absolute; opacity: 0; width: 0; height: 0; }
.tmn-switch__track {
  flex: none; width: 46px; height: 28px; border-radius: var(--radius-pill);
  background: var(--stone-300); position: relative;
  transition: background var(--dur-base) var(--ease-soft);
}
.tmn-switch__thumb {
  position: absolute; top: 3px; left: 3px; width: 22px; height: 22px; border-radius: 50%;
  background: var(--surface-card); box-shadow: var(--shadow-sm);
  transition: transform var(--dur-base) var(--ease-soft);
}
.tmn-switch input:checked + .tmn-switch__track { background: var(--brand); }
.tmn-switch input:checked + .tmn-switch__track .tmn-switch__thumb { transform: translateX(18px); }
.tmn-switch input:focus-visible + .tmn-switch__track { box-shadow: var(--focus-ring); }
.tmn-switch input:disabled + .tmn-switch__track { opacity: 0.5; }
.tmn-switch__label { font-size: 15px; color: var(--text-body); }
`;
if (typeof document !== 'undefined' && !document.getElementById('tmn-switch-css')) {
  const el = document.createElement('style');
  el.id = 'tmn-switch-css';
  el.textContent = STYLE;
  document.head.appendChild(el);
}
function Switch({
  label,
  id,
  className = '',
  ...rest
}) {
  const autoId = React.useId();
  const fieldId = id || autoId;
  return /*#__PURE__*/React.createElement("label", {
    className: `tmn-switch ${className}`,
    htmlFor: fieldId
  }, /*#__PURE__*/React.createElement("input", _extends({
    type: "checkbox",
    role: "switch",
    id: fieldId
  }, rest)), /*#__PURE__*/React.createElement("span", {
    className: "tmn-switch__track",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("span", {
    className: "tmn-switch__thumb"
  })), label ? /*#__PURE__*/React.createElement("span", {
    className: "tmn-switch__label"
  }, label) : null);
}
Object.assign(__ds_scope, { Switch });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Switch.jsx", error: String((e && e.message) || e) }); }

// components/forms/Textarea.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const STYLE = `
.tmn-textarea {
  font-family: var(--font-serif); font-size: 16px; line-height: 1.6; color: var(--text-strong);
  background: var(--surface-card);
  border: 1.5px solid var(--border-default);
  border-radius: var(--radius-md);
  padding: 14px 16px; width: 100%; min-height: 120px; resize: vertical;
  transition: border-color var(--dur-fast) var(--ease-soft), box-shadow var(--dur-fast) var(--ease-soft);
}
.tmn-textarea::placeholder { color: var(--text-subtle); }
.tmn-textarea:hover { border-color: var(--border-strong); }
.tmn-textarea:focus { outline: none; border-color: var(--brand); box-shadow: var(--focus-ring); }
.tmn-textarea[disabled] { opacity: 0.55; cursor: not-allowed; }
.tmn-textarea--paper {
  background-image: repeating-linear-gradient(transparent, transparent 31px, var(--border-subtle) 31px, var(--border-subtle) 32px);
  line-height: 32px; padding-top: 9px;
}
`;
if (typeof document !== 'undefined' && !document.getElementById('tmn-textarea-css')) {
  const el = document.createElement('style');
  el.id = 'tmn-textarea-css';
  el.textContent = STYLE;
  document.head.appendChild(el);
}
function Textarea({
  label,
  hint,
  error,
  ruled = false,
  id,
  className = '',
  ...rest
}) {
  const autoId = React.useId();
  const fieldId = id || autoId;
  const cls = ['tmn-textarea', ruled ? 'tmn-textarea--paper' : '', className].filter(Boolean).join(' ');
  return /*#__PURE__*/React.createElement("div", {
    className: "tmn-field"
  }, label ? /*#__PURE__*/React.createElement("label", {
    className: "tmn-field__label",
    htmlFor: fieldId
  }, label) : null, /*#__PURE__*/React.createElement("textarea", _extends({
    id: fieldId,
    className: cls,
    "aria-invalid": error ? true : undefined
  }, rest)), error || hint ? /*#__PURE__*/React.createElement("span", {
    className: `tmn-field__hint${error ? ' tmn-field__hint--error' : ''}`
  }, error || hint) : null);
}
Object.assign(__ds_scope, { Textarea });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Textarea.jsx", error: String((e && e.message) || e) }); }

// components/navigation/SegmentedControl.jsx
try { (() => {
const STYLE = `
.tmn-seg {
  font-family: var(--font-sans); display: inline-flex; padding: 4px; gap: 2px;
  background: var(--surface-sunken); border-radius: var(--radius-pill);
  box-shadow: var(--shadow-inset);
}
.tmn-seg__btn {
  appearance: none; border: none; background: transparent; cursor: pointer;
  font-family: var(--font-sans); font-size: 14px; font-weight: 600; color: var(--text-muted);
  padding: 8px 16px; border-radius: var(--radius-pill); white-space: nowrap;
  display: inline-flex; align-items: center; gap: 6px;
  transition: color var(--dur-fast) var(--ease-soft), background var(--dur-base) var(--ease-soft), box-shadow var(--dur-base) var(--ease-soft);
}
.tmn-seg__btn:hover { color: var(--text-strong); }
.tmn-seg__btn:focus-visible { outline: none; box-shadow: var(--focus-ring); }
.tmn-seg__btn--active { color: var(--brand-strong); background: var(--surface-card); box-shadow: var(--shadow-sm); }
`;
if (typeof document !== 'undefined' && !document.getElementById('tmn-seg-css')) {
  const el = document.createElement('style');
  el.id = 'tmn-seg-css';
  el.textContent = STYLE;
  document.head.appendChild(el);
}
function SegmentedControl({
  options = [],
  value,
  defaultValue,
  onChange,
  className = ''
}) {
  const norm = options.map(o => typeof o === 'string' ? {
    value: o,
    label: o
  } : o);
  const isControlled = value !== undefined;
  const [internal, setInternal] = React.useState(defaultValue ?? (norm[0] && norm[0].value));
  const active = isControlled ? value : internal;
  function select(v) {
    if (!isControlled) setInternal(v);
    onChange && onChange(v);
  }
  return /*#__PURE__*/React.createElement("div", {
    className: `tmn-seg ${className}`,
    role: "group"
  }, norm.map(o => /*#__PURE__*/React.createElement("button", {
    key: o.value,
    type: "button",
    "aria-pressed": o.value === active,
    className: `tmn-seg__btn${o.value === active ? ' tmn-seg__btn--active' : ''}`,
    onClick: () => select(o.value)
  }, o.icon ? /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex'
    }
  }, o.icon) : null, o.label)));
}
Object.assign(__ds_scope, { SegmentedControl });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/SegmentedControl.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Tabs.jsx
try { (() => {
const STYLE = `
.tmn-tabs { font-family: var(--font-sans); display: flex; gap: 4px; border-bottom: 1.5px solid var(--border-subtle); }
.tmn-tab {
  appearance: none; border: none; background: transparent; cursor: pointer;
  font-family: var(--font-sans); font-size: 15px; font-weight: 600; color: var(--text-muted);
  padding: 10px 14px 12px; position: relative; border-radius: var(--radius-sm) var(--radius-sm) 0 0;
  display: inline-flex; align-items: center; gap: 7px;
  transition: color var(--dur-fast) var(--ease-soft), background var(--dur-fast) var(--ease-soft);
}
.tmn-tab:hover { color: var(--text-strong); background: var(--surface-brand-soft); }
.tmn-tab:focus-visible { outline: none; box-shadow: var(--focus-ring); }
.tmn-tab--active { color: var(--brand-strong); }
.tmn-tab__underline {
  position: absolute; left: 10px; right: 10px; bottom: -1.5px; height: 3px;
  background: var(--brand); border-radius: var(--radius-pill);
}
.tmn-tab__count { font-family: var(--font-mono); font-size: 11px; color: var(--text-subtle); }
`;
if (typeof document !== 'undefined' && !document.getElementById('tmn-tabs-css')) {
  const el = document.createElement('style');
  el.id = 'tmn-tabs-css';
  el.textContent = STYLE;
  document.head.appendChild(el);
}
function Tabs({
  items = [],
  value,
  defaultValue,
  onChange,
  className = ''
}) {
  const isControlled = value !== undefined;
  const [internal, setInternal] = React.useState(defaultValue ?? (items[0] && items[0].id));
  const active = isControlled ? value : internal;
  function select(id) {
    if (!isControlled) setInternal(id);
    onChange && onChange(id);
  }
  return /*#__PURE__*/React.createElement("div", {
    className: `tmn-tabs ${className}`,
    role: "tablist"
  }, items.map(it => {
    const on = it.id === active;
    return /*#__PURE__*/React.createElement("button", {
      key: it.id,
      role: "tab",
      "aria-selected": on,
      className: `tmn-tab${on ? ' tmn-tab--active' : ''}`,
      onClick: () => select(it.id)
    }, it.label, it.count != null ? /*#__PURE__*/React.createElement("span", {
      className: "tmn-tab__count"
    }, it.count) : null, on ? /*#__PURE__*/React.createElement("span", {
      className: "tmn-tab__underline"
    }) : null);
  }));
}
Object.assign(__ds_scope, { Tabs });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Tabs.jsx", error: String((e && e.message) || e) }); }

// ui_kits/mobile-app/app.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* TransformMyNotes — Mobile app UI kit
   Interactive click-through: Library → Capture → Transform → Clean note.
   Composes the design-system components from window.NS. Mounted by index.html. */

const NS = window.TransformMyNotesDesignSystem_33c9b3;
const {
  Button,
  IconButton,
  Input,
  Badge,
  Tag,
  Avatar,
  SegmentedControl,
  NoteCard,
  HighlightText,
  Toast
} = NS;
const Ico = ({
  n,
  size = 22,
  stroke = 2,
  style,
  ...p
}) => {
  const lib = window.lucide && window.lucide.icons;
  const key = String(n).replace(/(^|-)([a-z0-9])/g, (_, __, c) => c.toUpperCase());
  const node = lib && lib[key];
  if (!node) return null;
  const attrs = node[1],
    children = node[2] || [];
  return React.createElement('svg', {
    ...attrs,
    width: size,
    height: size,
    'stroke-width': stroke,
    style: {
      display: 'inline-flex',
      flex: 'none',
      ...(style || {})
    },
    ...p
  }, children.map((c, i) => React.createElement(c[0], {
    key: i,
    ...c[1]
  })));
};
function drawIcons() {}

/* ----------------------------------------------------------------- data */
const NOTES = [{
  id: 'n1',
  course: 'Spanish 201',
  title: 'The subjunctive mood',
  snippet: 'El <mark>subjuntivo</mark> expresses doubt, desire and possibility across three verb patterns.',
  tags: ['subjunctive', 'verbs'],
  highlights: 12,
  words: 1204,
  status: 'clean'
}, {
  id: 'n2',
  course: 'Spanish 201',
  title: 'Ser vs. estar',
  snippet: 'Use <mark>ser</mark> for identity and essence; <mark>estar</mark> for state and location.',
  tags: ['grammar', 'B1'],
  highlights: 8,
  words: 642,
  status: 'clean'
}, {
  id: 'n3',
  course: 'Vocab journal',
  title: 'Market day words',
  snippet: 'la sandía, el aguacate, la calabaza — produce gathered from Saturday\u2019s notes.',
  tags: ['vocab', 'food'],
  highlights: 5,
  words: 318,
  status: 'original'
}];
const HAND_LINES = ['El subjuntivo — duda, deseo,', 'posibilidad. 3 patrones :', '-ar  -er  -ir', 'que yo hable / coma / viva', 'ojalá que llueva ☂', '* repasar para el examen *'];

/* --------------------------------------------------------- faux handwriting */
function HandNote({
  tilt = 0
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#fffdf6',
      borderRadius: 14,
      padding: '26px 22px',
      boxShadow: '0 18px 40px rgba(0,0,0,0.28)',
      transform: `rotate(${tilt}deg)`,
      backgroundImage: 'repeating-linear-gradient(transparent, transparent 33px, rgba(48,127,112,0.16) 33px, rgba(48,127,112,0.16) 34px)',
      lineHeight: '34px',
      width: '100%',
      boxSizing: 'border-box',
      borderLeft: '2px solid rgba(194,84,47,0.35)'
    }
  }, HAND_LINES.map((l, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      fontFamily: 'var(--font-hand)',
      fontSize: 25,
      color: '#1f3a3a',
      transform: `rotate(${i % 2 ? -0.5 : 0.6}deg)`,
      whiteSpace: 'nowrap'
    }
  }, l)));
}

/* --------------------------------------------------------------- bottom nav */
function BottomNav({
  active,
  onNav
}) {
  const items = [{
    id: 'library',
    icon: 'book-open',
    label: 'Library'
  }, {
    id: 'search',
    icon: 'search',
    label: 'Search'
  }, {
    id: 'review',
    icon: 'layers',
    label: 'Review'
  }, {
    id: 'profile',
    icon: 'user',
    label: 'You'
  }];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-around',
      alignItems: 'center',
      padding: '8px 8px 26px',
      background: 'rgba(255,253,248,0.92)',
      backdropFilter: 'blur(14px)',
      WebkitBackdropFilter: 'blur(14px)',
      borderTop: '1px solid var(--border-subtle)',
      flex: 'none'
    }
  }, items.map(it => {
    const on = it.id === active;
    return /*#__PURE__*/React.createElement("button", {
      key: it.id,
      onClick: () => onNav(it.id),
      style: {
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        color: on ? 'var(--brand-strong)' : 'var(--text-subtle)',
        padding: '6px 14px'
      }
    }, /*#__PURE__*/React.createElement(Ico, {
      n: it.icon,
      size: 24
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'var(--font-sans)',
        fontSize: 11,
        fontWeight: on ? 700 : 600
      }
    }, it.label));
  }));
}

/* ------------------------------------------------------------- Library */
function LibraryScreen({
  onOpenNote,
  onCapture,
  onNav,
  active
}) {
  const [tab, setTab] = React.useState('all');
  React.useEffect(drawIcons);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: 'var(--surface-app)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflow: 'auto',
      padding: '8px 20px 96px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/logo-mark.svg",
    width: "34",
    height: "34",
    alt: ""
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-serif)',
      fontSize: 22,
      fontWeight: 600,
      color: 'var(--text-strong)'
    }
  }, "Library")), /*#__PURE__*/React.createElement(Avatar, {
    name: "Ana Ruiz"
  })), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: 'var(--font-serif)',
      fontSize: 16,
      color: 'var(--text-muted)',
      margin: '0 0 16px'
    }
  }, "Buenas tardes, Ana \u2014 ", /*#__PURE__*/React.createElement(HighlightText, {
    variant: "teal"
  }, "9 cards"), " ready to review."), /*#__PURE__*/React.createElement(Input, {
    leadingIcon: /*#__PURE__*/React.createElement(Ico, {
      n: "search",
      size: 18
    }),
    placeholder: "Search your notes"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      margin: '16px 0 18px'
    }
  }, /*#__PURE__*/React.createElement(SegmentedControl, {
    value: tab,
    onChange: setTab,
    options: [{
      value: 'all',
      label: 'All'
    }, {
      value: 'review',
      label: 'Review'
    }, {
      value: 'shared',
      label: 'Shared'
    }]
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 14
    }
  }, NOTES.map(nt => /*#__PURE__*/React.createElement(NoteCard, _extends({
    key: nt.id
  }, nt, {
    onClick: () => onOpenNote(nt)
  }))))), /*#__PURE__*/React.createElement("button", {
    onClick: onCapture,
    "aria-label": "Capture note",
    style: {
      position: 'absolute',
      right: 20,
      bottom: 92,
      width: 60,
      height: 60,
      borderRadius: '50%',
      border: 'none',
      cursor: 'pointer',
      background: 'var(--gradient-transform)',
      boxShadow: '0 10px 26px rgba(48,127,112,0.4)',
      color: '#fff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 5
    }
  }, /*#__PURE__*/React.createElement(Ico, {
    n: "scan-line",
    size: 26
  })), /*#__PURE__*/React.createElement(BottomNav, {
    active: active,
    onNav: onNav
  }));
}

/* ------------------------------------------------------------- Capture */
function CaptureScreen({
  onClose,
  onTransform
}) {
  const [shot, setShot] = React.useState(false);
  React.useEffect(drawIcons);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: 'radial-gradient(120% 90% at 50% 0%, #16414a 0%, #0e2b2f 60%, #0a2023 100%)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '52px 20px 10px',
      color: '#fff',
      flex: 'none'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    "aria-label": "Close",
    style: {
      border: 'none',
      background: 'rgba(255,255,255,0.14)',
      width: 38,
      height: 38,
      borderRadius: '50%',
      color: '#fff',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement(Ico, {
    n: "x",
    size: 20
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontWeight: 600,
      fontSize: 15
    }
  }, shot ? 'Review scan' : 'Capture note'), /*#__PURE__*/React.createElement("button", {
    "aria-label": "Flash",
    style: {
      border: 'none',
      background: 'rgba(255,255,255,0.14)',
      width: 38,
      height: 38,
      borderRadius: '50%',
      color: '#fff',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement(Ico, {
    n: "zap",
    size: 18
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '12px 34px',
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      width: '100%'
    }
  }, /*#__PURE__*/React.createElement(HandNote, {
    tilt: shot ? 0 : -1.5
  }), !shot && [0, 1, 2, 3].map(c => /*#__PURE__*/React.createElement("span", {
    key: c,
    style: {
      position: 'absolute',
      width: 26,
      height: 26,
      borderColor: 'var(--gold-400)',
      borderStyle: 'solid',
      borderWidth: c < 2 ? '3px 0 0 0' : '0 0 3px 0',
      borderLeftWidth: c % 2 === 0 ? 3 : 0,
      borderRightWidth: c % 2 === 1 ? 3 : 0,
      top: c < 2 ? -10 : 'auto',
      bottom: c >= 2 ? -10 : 'auto',
      left: c % 2 === 0 ? -10 : 'auto',
      right: c % 2 === 1 ? -10 : 'auto',
      borderRadius: c === 0 ? '6px 0 0 0' : c === 1 ? '0 6px 0 0' : c === 2 ? '0 0 0 6px' : '0 0 6px 0'
    }
  })), shot && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 12,
      right: 12
    }
  }, /*#__PURE__*/React.createElement(Badge, {
    tone: "success",
    dot: true
  }, "Edges detected")))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 'none',
      padding: '14px 24px 38px',
      color: '#fff'
    }
  }, !shot ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between'
    }
  }, /*#__PURE__*/React.createElement(Ico, {
    n: "images",
    size: 26
  }), /*#__PURE__*/React.createElement("button", {
    onClick: () => setShot(true),
    "aria-label": "Shutter",
    style: {
      width: 72,
      height: 72,
      borderRadius: '50%',
      border: '4px solid rgba(255,255,255,0.85)',
      background: '#fff',
      cursor: 'pointer',
      boxShadow: '0 0 0 3px rgba(255,255,255,0.25)'
    }
  }), /*#__PURE__*/React.createElement(Ico, {
    n: "rotate-ccw",
    size: 26
  })) : /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "accent",
    size: "lg",
    fullWidth: true,
    leftIcon: /*#__PURE__*/React.createElement(Ico, {
      n: "sparkles",
      size: 20
    }),
    onClick: onTransform
  }, "Transform to clean note"), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "md",
    fullWidth: true,
    onClick: () => setShot(false),
    style: {
      color: 'rgba(255,255,255,0.85)'
    }
  }, "Retake"))));
}

/* ------------------------------------------------------------- Processing */
function Processing() {
  React.useEffect(drawIcons);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      zIndex: 30,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 22,
      background: 'rgba(245,241,232,0.96)',
      backdropFilter: 'blur(6px)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 88,
      height: 88,
      borderRadius: 24,
      background: 'var(--gradient-transform)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: '0 14px 40px rgba(48,127,112,0.35)'
    }
  }, /*#__PURE__*/React.createElement(Ico, {
    n: "sparkles",
    size: 40,
    style: {
      color: '#fff'
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-serif)',
      fontSize: 22,
      fontWeight: 600,
      color: 'var(--text-strong)'
    }
  }, "Transforming\u2026"), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 200,
      height: 6,
      borderRadius: 99,
      background: 'var(--surface-sunken)',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: '100%',
      width: '46%',
      borderRadius: 99,
      background: 'var(--gradient-transform)',
      animation: 'tmn-load 1.4s var(--ease-soft) infinite'
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 12,
      color: 'var(--text-muted)'
    }
  }, "reading handwriting \xB7 OCR 98%"), /*#__PURE__*/React.createElement("style", null, `@keyframes tmn-load{0%{transform:translateX(-120%)}100%{transform:translateX(360%)}}`));
}

/* ------------------------------------------------------------- Note (clean) */
function NoteScreen({
  note,
  onBack
}) {
  const [view, setView] = React.useState('clean');
  const [reviewed, setReviewed] = React.useState(false);
  React.useEffect(drawIcons);
  const nt = note || NOTES[0];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: 'var(--surface-card)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 'none',
      padding: '50px 18px 10px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      background: 'var(--surface-card)',
      borderBottom: '1px solid var(--border-subtle)'
    }
  }, /*#__PURE__*/React.createElement(IconButton, {
    label: "Back",
    variant: "plain",
    onClick: onBack
  }, /*#__PURE__*/React.createElement(Ico, {
    n: "chevron-left",
    size: 24
  })), /*#__PURE__*/React.createElement(Badge, {
    tone: "brand"
  }, nt.course), /*#__PURE__*/React.createElement(IconButton, {
    label: "More",
    variant: "plain"
  }, /*#__PURE__*/React.createElement(Ico, {
    n: "more-horizontal",
    size: 22
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflow: 'auto',
      padding: '18px 22px 110px'
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      fontFamily: 'var(--font-serif)',
      fontSize: 28,
      fontWeight: 600,
      letterSpacing: '-0.01em',
      lineHeight: 1.2,
      color: 'var(--text-strong)',
      margin: '0 0 10px'
    }
  }, nt.title), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 14,
      fontFamily: 'var(--font-mono)',
      fontSize: 11.5,
      color: 'var(--text-subtle)',
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("span", null, "es \u2192 en"), /*#__PURE__*/React.createElement("span", null, nt.words, " words"), /*#__PURE__*/React.createElement("span", null, "OCR 98%")), /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement(SegmentedControl, {
    value: view,
    onChange: setView,
    options: [{
      value: 'original',
      label: 'Original'
    }, {
      value: 'clean',
      label: 'Clean'
    }]
  })), view === 'clean' ? /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-serif)',
      fontSize: 18,
      lineHeight: 1.72,
      color: 'var(--text-body)'
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '0 0 16px'
    }
  }, "El ", /*#__PURE__*/React.createElement(HighlightText, null, "subjuntivo"), " is a mood that expresses doubt, desire, emotion and possibility \u2014 not plain fact. It appears in subordinate clauses introduced by ", /*#__PURE__*/React.createElement("em", null, "que"), "."), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '0 0 16px'
    }
  }, "Regular verbs follow ", /*#__PURE__*/React.createElement(HighlightText, {
    variant: "teal"
  }, "three patterns"), " by ending:", /*#__PURE__*/React.createElement("strong", null, " -ar \u2192 -e"), ", ", /*#__PURE__*/React.createElement("strong", null, "-er / -ir \u2192 -a"), ". So ", /*#__PURE__*/React.createElement("em", null, "hablar"), " becomes", /*#__PURE__*/React.createElement("em", null, " que yo hable"), ", and ", /*#__PURE__*/React.createElement("em", null, "comer"), " becomes ", /*#__PURE__*/React.createElement("em", null, "que yo coma"), "."), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0
    }
  }, "Triggers worth memorising: ", /*#__PURE__*/React.createElement(HighlightText, null, "ojal\xE1 que"), ", ", /*#__PURE__*/React.createElement("em", null, "es posible que"), ", and verbs of wishing such as ", /*#__PURE__*/React.createElement("em", null, "querer que"), ".")) : /*#__PURE__*/React.createElement(HandNote, {
    tilt: 0
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      flexWrap: 'wrap',
      marginTop: 22
    }
  }, nt.tags.map(t => /*#__PURE__*/React.createElement(Tag, {
    key: t,
    hash: true,
    tone: "brand"
  }, t)))), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      padding: '12px 18px 30px',
      background: 'rgba(255,253,248,0.92)',
      backdropFilter: 'blur(14px)',
      WebkitBackdropFilter: 'blur(14px)',
      borderTop: '1px solid var(--border-subtle)',
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement(IconButton, {
    label: "Highlight",
    variant: "soft"
  }, /*#__PURE__*/React.createElement(Ico, {
    n: "highlighter",
    size: 20
  })), /*#__PURE__*/React.createElement(IconButton, {
    label: "Translate",
    variant: "soft"
  }, /*#__PURE__*/React.createElement(Ico, {
    n: "languages",
    size: 20
  })), /*#__PURE__*/React.createElement(Button, {
    variant: reviewed ? 'secondary' : 'primary',
    fullWidth: true,
    leftIcon: /*#__PURE__*/React.createElement(Ico, {
      n: reviewed ? 'check' : 'layers',
      size: 18
    }),
    onClick: () => setReviewed(true)
  }, reviewed ? 'Added to review' : 'Add to review deck')));
}

/* ------------------------------------------------------------- App shell */
function App() {
  const [screen, setScreen] = React.useState('library');
  const [note, setNote] = React.useState(null);
  const [processing, setProcessing] = React.useState(false);
  const [toast, setToast] = React.useState(false);
  React.useEffect(drawIcons);
  function transform() {
    setProcessing(true);
    setTimeout(() => {
      setProcessing(false);
      setNote(NOTES[0]);
      setScreen('note');
      setToast(true);
      setTimeout(() => setToast(false), 3200);
    }, 1900);
  }
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      height: '100%',
      overflow: 'hidden'
    }
  }, screen === 'library' && /*#__PURE__*/React.createElement(LibraryScreen, {
    active: "library",
    onNav: () => {},
    onOpenNote: nt => {
      setNote(nt);
      setScreen('note');
    },
    onCapture: () => setScreen('capture')
  }), screen === 'capture' && /*#__PURE__*/React.createElement(CaptureScreen, {
    onClose: () => setScreen('library'),
    onTransform: transform
  }), screen === 'note' && /*#__PURE__*/React.createElement(NoteScreen, {
    note: note,
    onBack: () => setScreen('library')
  }), processing && /*#__PURE__*/React.createElement(Processing, null), toast && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      left: 16,
      right: 16,
      bottom: 96,
      zIndex: 40
    }
  }, /*#__PURE__*/React.createElement(Toast, {
    tone: "success",
    icon: /*#__PURE__*/React.createElement(Ico, {
      n: "check-circle-2",
      size: 20
    }),
    title: "Note transformed",
    onClose: () => setToast(false)
  }, "12 highlights saved to your review deck.")));
}
window.TMNApp = App;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/mobile-app/app.jsx", error: String((e && e.message) || e) }); }

// ui_kits/mobile-app/ios-frame.jsx
try { (() => {
// @ds-adherence-ignore -- omelette starter scaffold (raw elements/hex/px by design)

/* BEGIN USAGE */
// iOS.jsx — Simplified iOS 26 (Liquid Glass) device frame
// Based on the iOS 26 UI Kit + Figma status bar spec. No assets, no deps.
// Exports (to window): IOSDevice, IOSStatusBar, IOSNavBar, IOSGlassPill, IOSList, IOSListRow, IOSKeyboard
//
// Usage — wrap your screen content in <IOSDevice> to get the bezel, status bar
// and home indicator (props: title, dark, keyboard):
//
//   <IOSDevice title="Settings">
//     ...your screen content...
//   </IOSDevice>
//   <IOSDevice dark title="Search" keyboard>…</IOSDevice>
/* END USAGE */

// ─────────────────────────────────────────────────────────────
// Status bar
// ─────────────────────────────────────────────────────────────
function IOSStatusBar({
  dark = false,
  time = '9:41'
}) {
  const c = dark ? '#fff' : '#000';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 154,
      alignItems: 'center',
      justifyContent: 'center',
      padding: '21px 24px 19px',
      boxSizing: 'border-box',
      position: 'relative',
      zIndex: 20,
      width: '100%'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      height: 22,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: 1.5
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: '-apple-system, "SF Pro", system-ui',
      fontWeight: 590,
      fontSize: 17,
      lineHeight: '22px',
      color: c
    }
  }, time)), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      height: 22,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      paddingTop: 1,
      paddingRight: 1
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "19",
    height: "12",
    viewBox: "0 0 19 12"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "0",
    y: "7.5",
    width: "3.2",
    height: "4.5",
    rx: "0.7",
    fill: c
  }), /*#__PURE__*/React.createElement("rect", {
    x: "4.8",
    y: "5",
    width: "3.2",
    height: "7",
    rx: "0.7",
    fill: c
  }), /*#__PURE__*/React.createElement("rect", {
    x: "9.6",
    y: "2.5",
    width: "3.2",
    height: "9.5",
    rx: "0.7",
    fill: c
  }), /*#__PURE__*/React.createElement("rect", {
    x: "14.4",
    y: "0",
    width: "3.2",
    height: "12",
    rx: "0.7",
    fill: c
  })), /*#__PURE__*/React.createElement("svg", {
    width: "17",
    height: "12",
    viewBox: "0 0 17 12"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M8.5 3.2C10.8 3.2 12.9 4.1 14.4 5.6L15.5 4.5C13.7 2.7 11.2 1.5 8.5 1.5C5.8 1.5 3.3 2.7 1.5 4.5L2.6 5.6C4.1 4.1 6.2 3.2 8.5 3.2Z",
    fill: c
  }), /*#__PURE__*/React.createElement("path", {
    d: "M8.5 6.8C9.9 6.8 11.1 7.3 12 8.2L13.1 7.1C11.8 5.9 10.2 5.1 8.5 5.1C6.8 5.1 5.2 5.9 3.9 7.1L5 8.2C5.9 7.3 7.1 6.8 8.5 6.8Z",
    fill: c
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "8.5",
    cy: "10.5",
    r: "1.5",
    fill: c
  })), /*#__PURE__*/React.createElement("svg", {
    width: "27",
    height: "13",
    viewBox: "0 0 27 13"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "0.5",
    y: "0.5",
    width: "23",
    height: "12",
    rx: "3.5",
    stroke: c,
    strokeOpacity: "0.35",
    fill: "none"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "2",
    y: "2",
    width: "20",
    height: "9",
    rx: "2",
    fill: c
  }), /*#__PURE__*/React.createElement("path", {
    d: "M25 4.5V8.5C25.8 8.2 26.5 7.2 26.5 6.5C26.5 5.8 25.8 4.8 25 4.5Z",
    fill: c,
    fillOpacity: "0.4"
  }))));
}

// ─────────────────────────────────────────────────────────────
// Liquid glass pill — blur + tint + shine
// ─────────────────────────────────────────────────────────────
function IOSGlassPill({
  children,
  dark = false,
  style = {}
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      height: 44,
      minWidth: 44,
      borderRadius: 9999,
      position: 'relative',
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: dark ? '0 2px 6px rgba(0,0,0,0.35), 0 6px 16px rgba(0,0,0,0.2)' : '0 1px 3px rgba(0,0,0,0.07), 0 3px 10px rgba(0,0,0,0.06)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      borderRadius: 9999,
      backdropFilter: 'blur(12px) saturate(180%)',
      WebkitBackdropFilter: 'blur(12px) saturate(180%)',
      background: dark ? 'rgba(120,120,128,0.28)' : 'rgba(255,255,255,0.5)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      borderRadius: 9999,
      boxShadow: dark ? 'inset 1.5px 1.5px 1px rgba(255,255,255,0.15), inset -1px -1px 1px rgba(255,255,255,0.08)' : 'inset 1.5px 1.5px 1px rgba(255,255,255,0.7), inset -1px -1px 1px rgba(255,255,255,0.4)',
      border: dark ? '0.5px solid rgba(255,255,255,0.15)' : '0.5px solid rgba(0,0,0,0.06)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      zIndex: 1,
      display: 'flex',
      alignItems: 'center',
      padding: '0 4px'
    }
  }, children));
}

// ─────────────────────────────────────────────────────────────
// Navigation bar — glass pills + large title
// ─────────────────────────────────────────────────────────────
function IOSNavBar({
  title = 'Title',
  dark = false,
  trailingIcon = true
}) {
  const muted = dark ? 'rgba(255,255,255,0.6)' : '#404040';
  const text = dark ? '#fff' : '#000';
  const pillIcon = content => /*#__PURE__*/React.createElement(IOSGlassPill, {
    dark: dark
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 36,
      height: 36,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, content));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      paddingTop: 62,
      paddingBottom: 10,
      position: 'relative',
      zIndex: 5
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 16px'
    }
  }, pillIcon(/*#__PURE__*/React.createElement("svg", {
    width: "12",
    height: "20",
    viewBox: "0 0 12 20",
    fill: "none",
    style: {
      marginLeft: -1
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M10 2L2 10l8 8",
    stroke: muted,
    strokeWidth: "2.5",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }))), trailingIcon && pillIcon(/*#__PURE__*/React.createElement("svg", {
    width: "22",
    height: "6",
    viewBox: "0 0 22 6"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "3",
    cy: "3",
    r: "2.5",
    fill: muted
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "11",
    cy: "3",
    r: "2.5",
    fill: muted
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "19",
    cy: "3",
    r: "2.5",
    fill: muted
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0 16px',
      fontFamily: '-apple-system, system-ui',
      fontSize: 34,
      fontWeight: 700,
      lineHeight: '41px',
      color: text,
      letterSpacing: 0.4
    }
  }, title));
}

// ─────────────────────────────────────────────────────────────
// Grouped list (inset card, r:26) + row (52px)
// ─────────────────────────────────────────────────────────────
function IOSListRow({
  title,
  detail,
  icon,
  chevron = true,
  isLast = false,
  dark = false
}) {
  const text = dark ? '#fff' : '#000';
  const sec = dark ? 'rgba(235,235,245,0.6)' : 'rgba(60,60,67,0.6)';
  const ter = dark ? 'rgba(235,235,245,0.3)' : 'rgba(60,60,67,0.3)';
  const sep = dark ? 'rgba(84,84,88,0.65)' : 'rgba(60,60,67,0.12)';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      minHeight: 52,
      padding: '0 16px',
      position: 'relative',
      fontFamily: '-apple-system, system-ui',
      fontSize: 17,
      letterSpacing: -0.43
    }
  }, icon && /*#__PURE__*/React.createElement("div", {
    style: {
      width: 30,
      height: 30,
      borderRadius: 7,
      background: icon,
      marginRight: 12,
      flexShrink: 0
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      color: text
    }
  }, title), detail && /*#__PURE__*/React.createElement("span", {
    style: {
      color: sec,
      marginRight: 6
    }
  }, detail), chevron && /*#__PURE__*/React.createElement("svg", {
    width: "8",
    height: "14",
    viewBox: "0 0 8 14",
    style: {
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M1 1l6 6-6 6",
    stroke: ter,
    strokeWidth: "2",
    fill: "none",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  })), !isLast && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      bottom: 0,
      right: 0,
      left: icon ? 58 : 16,
      height: 0.5,
      background: sep
    }
  }));
}
function IOSList({
  header,
  children,
  dark = false
}) {
  const hc = dark ? 'rgba(235,235,245,0.6)' : 'rgba(60,60,67,0.6)';
  const bg = dark ? '#1C1C1E' : '#fff';
  return /*#__PURE__*/React.createElement("div", null, header && /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: '-apple-system, system-ui',
      fontSize: 13,
      color: hc,
      textTransform: 'uppercase',
      padding: '8px 36px 6px',
      letterSpacing: -0.08
    }
  }, header), /*#__PURE__*/React.createElement("div", {
    style: {
      background: bg,
      borderRadius: 26,
      margin: '0 16px',
      overflow: 'hidden'
    }
  }, children));
}

// ─────────────────────────────────────────────────────────────
// Device frame
// ─────────────────────────────────────────────────────────────
function IOSDevice({
  children,
  width = 402,
  height = 874,
  dark = false,
  title,
  keyboard = false
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width,
      height,
      borderRadius: 48,
      overflow: 'hidden',
      position: 'relative',
      background: dark ? '#000' : '#F2F2F7',
      boxShadow: '0 40px 80px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.12)',
      fontFamily: '-apple-system, system-ui, sans-serif',
      WebkitFontSmoothing: 'antialiased'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 11,
      left: '50%',
      transform: 'translateX(-50%)',
      width: 126,
      height: 37,
      borderRadius: 24,
      background: '#000',
      zIndex: 50
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 10
    }
  }, /*#__PURE__*/React.createElement(IOSStatusBar, {
    dark: dark
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      height: '100%',
      display: 'flex',
      flexDirection: 'column'
    }
  }, title !== undefined && /*#__PURE__*/React.createElement(IOSNavBar, {
    title: title,
    dark: dark
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflow: 'auto'
    }
  }, children), keyboard && /*#__PURE__*/React.createElement(IOSKeyboard, {
    dark: dark
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 60,
      height: 34,
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'flex-end',
      paddingBottom: 8,
      pointerEvents: 'none'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 139,
      height: 5,
      borderRadius: 100,
      background: dark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.25)'
    }
  })));
}

// ─────────────────────────────────────────────────────────────
// Keyboard — iOS 26 liquid glass
// ─────────────────────────────────────────────────────────────
function IOSKeyboard({
  dark = false
}) {
  const glyph = dark ? 'rgba(255,255,255,0.7)' : '#595959';
  const sugg = dark ? 'rgba(255,255,255,0.6)' : '#333';
  const keyBg = dark ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.85)';

  // special-key icons
  const icons = {
    shift: /*#__PURE__*/React.createElement("svg", {
      width: "19",
      height: "17",
      viewBox: "0 0 19 17"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M9.5 1L1 9.5h4.5V16h8V9.5H18L9.5 1z",
      fill: glyph
    })),
    del: /*#__PURE__*/React.createElement("svg", {
      width: "23",
      height: "17",
      viewBox: "0 0 23 17"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M7 1h13a2 2 0 012 2v11a2 2 0 01-2 2H7l-6-7.5L7 1z",
      fill: "none",
      stroke: glyph,
      strokeWidth: "1.6",
      strokeLinejoin: "round"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M10 5l7 7M17 5l-7 7",
      stroke: glyph,
      strokeWidth: "1.6",
      strokeLinecap: "round"
    })),
    ret: /*#__PURE__*/React.createElement("svg", {
      width: "20",
      height: "14",
      viewBox: "0 0 20 14"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M18 1v6H4m0 0l4-4M4 7l4 4",
      fill: "none",
      stroke: "#fff",
      strokeWidth: "1.8",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    }))
  };
  const key = (content, {
    w,
    flex,
    ret,
    fs = 25,
    k
  } = {}) => /*#__PURE__*/React.createElement("div", {
    key: k,
    style: {
      height: 42,
      borderRadius: 8.5,
      flex: flex ? 1 : undefined,
      width: w,
      minWidth: 0,
      background: ret ? '#08f' : keyBg,
      boxShadow: '0 1px 0 rgba(0,0,0,0.075)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: '-apple-system, "SF Compact", system-ui',
      fontSize: fs,
      fontWeight: 458,
      color: ret ? '#fff' : glyph
    }
  }, content);
  const row = (keys, pad = 0) => /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6.5,
      justifyContent: 'center',
      padding: `0 ${pad}px`
    }
  }, keys.map(l => key(l, {
    flex: true,
    k: l
  })));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      zIndex: 15,
      borderRadius: 27,
      overflow: 'hidden',
      padding: '11px 0 2px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      boxShadow: dark ? '0 -2px 20px rgba(0,0,0,0.09)' : '0 -1px 6px rgba(0,0,0,0.018), 0 -3px 20px rgba(0,0,0,0.012)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      borderRadius: 27,
      backdropFilter: 'blur(12px) saturate(180%)',
      WebkitBackdropFilter: 'blur(12px) saturate(180%)',
      background: dark ? 'rgba(120,120,128,0.14)' : 'rgba(255,255,255,0.25)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      borderRadius: 27,
      boxShadow: dark ? 'inset 1.5px 1.5px 1px rgba(255,255,255,0.15)' : 'inset 1.5px 1.5px 1px rgba(255,255,255,0.7), inset -1px -1px 1px rgba(255,255,255,0.4)',
      border: dark ? '0.5px solid rgba(255,255,255,0.15)' : '0.5px solid rgba(0,0,0,0.06)',
      pointerEvents: 'none'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 20,
      alignItems: 'center',
      padding: '8px 22px 13px',
      width: '100%',
      boxSizing: 'border-box',
      position: 'relative'
    }
  }, ['"The"', 'the', 'to'].map((w, i) => /*#__PURE__*/React.createElement(React.Fragment, {
    key: i
  }, i > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      width: 1,
      height: 25,
      background: '#ccc',
      opacity: 0.3
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      textAlign: 'center',
      fontFamily: '-apple-system, system-ui',
      fontSize: 17,
      color: sugg,
      letterSpacing: -0.43,
      lineHeight: '22px'
    }
  }, w)))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 13,
      padding: '0 6.5px',
      width: '100%',
      boxSizing: 'border-box',
      position: 'relative'
    }
  }, row(['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p']), row(['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'], 20), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 14.25,
      alignItems: 'center'
    }
  }, key(icons.shift, {
    w: 45,
    k: 'shift'
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6.5,
      flex: 1
    }
  }, ['z', 'x', 'c', 'v', 'b', 'n', 'm'].map(l => key(l, {
    flex: true,
    k: l
  }))), key(icons.del, {
    w: 45,
    k: 'del'
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6,
      alignItems: 'center'
    }
  }, key('ABC', {
    w: 92.25,
    fs: 18,
    k: 'abc'
  }), key('', {
    flex: true,
    k: 'space'
  }), key(icons.ret, {
    w: 92.25,
    ret: true,
    k: 'ret'
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 56,
      width: '100%',
      position: 'relative'
    }
  }));
}
Object.assign(window, {
  IOSDevice,
  IOSStatusBar,
  IOSNavBar,
  IOSGlassPill,
  IOSList,
  IOSListRow,
  IOSKeyboard
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/mobile-app/ios-frame.jsx", error: String((e && e.message) || e) }); }

__ds_ns.HighlightText = __ds_scope.HighlightText;

__ds_ns.NoteCard = __ds_scope.NoteCard;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.IconButton = __ds_scope.IconButton;

__ds_ns.Avatar = __ds_scope.Avatar;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.Tag = __ds_scope.Tag;

__ds_ns.Dialog = __ds_scope.Dialog;

__ds_ns.Toast = __ds_scope.Toast;

__ds_ns.Checkbox = __ds_scope.Checkbox;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.Select = __ds_scope.Select;

__ds_ns.Switch = __ds_scope.Switch;

__ds_ns.Textarea = __ds_scope.Textarea;

__ds_ns.SegmentedControl = __ds_scope.SegmentedControl;

__ds_ns.Tabs = __ds_scope.Tabs;

})();
