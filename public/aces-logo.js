/*!
 * <aces-logo> — interactive Aces Intelligence logo
 * Zero dependencies. One file. Works in plain HTML, WordPress, Next.js, Vue, etc.
 *
 *   <script src="/aces-logo.js" defer></script>
 *   <aces-logo size="160" href="/"></aces-logo>
 *
 * Attributes
 *   size        Width in px (or any CSS length). Default 160.
 *   href        Makes the logo a link (also supports target / rel).
 *   theme       "light" (default) | "dark" | "mono" | "auto" (follows OS dark mode)
 *   wordmark    "auto" (default: hides lettering when small) | "show" | "hide"
 *   animate     "intro" (default: plays once when scrolled into view) | "none"
 *   track       "on" (default: the "i" dot follows the cursor) | "off"
 *   loading     Boolean. Loops the lettering wave + dot pulse (use as a spinner).
 *   label       Accessible name. Default "Aces Intelligence".
 *
 * CSS custom properties
 *   --aces-color   main color   (default #0A3594)
 *   --aces-accent  glow/wave    (default #2F7BFF)
 *   --aces-size    width        (same as the size attribute)
 *
 * Events / methods
 *   "aces-logo-activate"  fired on click / Enter (detail: {x, y})
 *   el.replay()           replay the intro animation
 *   el.pulse()            one-off dot pulse
 */
(function () {
  'use strict';
  if (typeof window === 'undefined' || !window.customElements || customElements.get('aces-logo')) return;

  var BODY = 'M342 783L797 327V706H863V452H940V783H720V517L528 706H672V783Z';
  var DOT = { x: 863, y: 327, w: 77, h: 78 };
  var DOT_C = { x: 901.5, y: 366 };
  var TEXT = 'ACES INTELLIGENCE';

  // Monoline wide-techno letterforms (box: 26 x 28), so no web font is needed.
  var GLYPHS = {
    A: { w: 26, d: 'M0 28V7L7 0H19L26 7V28M0 15H26' },
    C: { w: 26, d: 'M26 0H7L0 7V21L7 28H26' },
    E: { w: 26, d: 'M26 0H0V28H26M0 14H22' },
    S: { w: 26, d: 'M26 0H6L0 6V9L6 14H20L26 19V22L20 28H0' },
    I: { w: 0, d: 'M0 0V28' },
    N: { w: 26, d: 'M0 28V0L26 28V0' },
    T: { w: 26, d: 'M0 0H26M13 0V28' },
    L: { w: 26, d: 'M0 0V28H26' },
    G: { w: 26, d: 'M26 0H7L0 7V21L7 28H26V14H14' }
  };
  var GH = 28, GAP = 8, SPACE = 16;
  var ORIGIN = { x: 372.9, y: 726.7 }, SPAN = 513, YSCALE = 1.1;

  function lettersMarkup() {
    var x = 0, items = [], i, ch, g;
    for (i = 0; i < TEXT.length; i++) {
      ch = TEXT.charAt(i);
      if (ch === ' ') { x += SPACE; continue; }
      g = GLYPHS[ch];
      items.push({ x: x, d: g.d });
      x += g.w + GAP;
    }
    var s = SPAN / (x - GAP);
    var html = '<g transform="translate(' + ORIGIN.x + ' ' + ORIGIN.y + ') rotate(-45) scale(' + s.toFixed(4) + ' ' + (s * YSCALE).toFixed(4) + ')">';
    for (i = 0; i < items.length; i++) {
      html += '<g transform="translate(' + items[i].x + ' ' + (-GH) + ')"><g class="l" style="--i:' + i + '"><path d="' + items[i].d + '"/></g></g>';
    }
    return html + '</g>';
  }

  var CSS = '' +
    ':host{--c:var(--aces-color,#0A3594);--a:var(--aces-accent,#2F7BFF);--sh:#000;--sho:.34;--sheen:#fff;' +
    'display:inline-block;width:var(--aces-size,160px);aspect-ratio:640/500;line-height:0;vertical-align:middle;' +
    'perspective:700px;-webkit-tap-highlight-color:transparent}' +
    ':host([hidden]){display:none}' +
    ':host([theme=dark]){--c:var(--aces-color,#fff);--a:var(--aces-accent,#6FA8FF);--sh:#4C8DFF;--sho:.35;--sheen:var(--a)}' +
    ':host([theme=mono]){--c:var(--aces-color,currentColor);--a:var(--aces-accent,currentColor);--sho:0}' +
    '@media (prefers-color-scheme:dark){:host([theme=auto]){--c:var(--aces-color,#fff);--a:var(--aces-accent,#6FA8FF);--sh:#4C8DFF;--sho:.35;--sheen:var(--a)}}' +
    '.wrap{display:block;width:100%;height:100%;color:inherit;text-decoration:none;outline:none;border-radius:8px}' +
    'a[href].wrap{cursor:pointer}' +
    '.wrap:focus-visible{outline:2px solid var(--a);outline-offset:6px}' +
    'svg{display:block;width:100%;height:100%;overflow:visible;transform-style:preserve-3d;transition:transform .6s cubic-bezier(.2,.8,.2,1)}' +
    '.hot svg{transition:transform .12s ease-out}' +
    '.body{fill:var(--c);stroke:var(--c);stroke-width:2;stroke-linejoin:miter}' +
    '.dot{fill:var(--c)}' +
    '.dotg{transition:transform .25s ease-out}' +
    '.dotin,.glow,.sheen{transform-box:fill-box;transform-origin:center}' +
    '.glow{fill:var(--a);opacity:0}' +
    '.sheen{fill:url(#sg);opacity:0}' +
    '.l{color:var(--c)}' +
    '.l path{fill:none;stroke:currentColor;stroke-width:2.9;stroke-linejoin:miter;stroke-linecap:butt}' +
    '.fx circle{fill:none;stroke:var(--a);stroke-width:3;vector-effect:non-scaling-stroke;opacity:0;pointer-events:none}' +
    ':host([wordmark=hide]) .word,.small .word{display:none}' +
    /* intro */
    '.pre .body{fill-opacity:0;stroke-dasharray:1;stroke-dashoffset:1}' +
    '.pre .dotin,.pre .l{opacity:0}' +
    '.intro .body{animation:draw .9s cubic-bezier(.65,0,.35,1) both,fillin .5s .75s ease-out both}' +
    '.intro .dotin{animation:drop .85s .8s ease-in-out both}' +
    '.intro .l{animation:lin .45s calc(1.15s + var(--i)*45ms) ease-out both}' +
    '@keyframes draw{from{stroke-dasharray:1;stroke-dashoffset:1}to{stroke-dasharray:1;stroke-dashoffset:0}}' +
    '@keyframes fillin{from{fill-opacity:0}to{fill-opacity:1}}' +
    '@keyframes drop{0%{transform:translateY(-240px);opacity:0}55%{transform:translateY(0);opacity:1}72%{transform:translateY(-14px)}86%{transform:translateY(0)}93%{transform:translateY(-4px)}100%{transform:translateY(0);opacity:1}}' +
    '@keyframes lin{from{opacity:0;transform:translateX(-14px)}to{opacity:1;transform:none}}' +
    /* hover / focus */
    '.ready.hot .l{animation:wave .7s calc(var(--i)*35ms) ease-in-out}' +
    '.ready.hot .glow{animation:pulse 1.2s ease-in-out infinite}' +
    '.ready.hot .sheen{animation:sweep .9s ease-in-out}' +
    '@keyframes wave{0%,100%{color:var(--c);transform:none}40%{color:var(--a);transform:translateY(-3px)}}' +
    '@keyframes pulse{0%,100%{opacity:0;transform:scale(1)}50%{opacity:.85;transform:scale(1.35)}}' +
    '@keyframes sweep{0%{opacity:1;transform:translateX(-220px) skewX(-20deg)}100%{opacity:1;transform:translateX(760px) skewX(-20deg)}}' +
    /* loading */
    ':host([loading]) .l{animation:wave 1.4s calc(var(--i)*70ms) ease-in-out infinite}' +
    ':host([loading]) .glow{animation:pulse 1s ease-in-out infinite}' +
    '@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}';

  var TEMPLATE = '' +
    '<style>' + CSS + '</style>' +
    '<a class="wrap" part="link">' +
    '<svg viewBox="320 305 640 500" role="img" aria-label="Aces Intelligence" focusable="false">' +
    '<defs>' +
    '<filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="0" stdDeviation="6" style="flood-color:var(--sh);flood-opacity:var(--sho)"/></filter>' +
    '<filter id="bl" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="14"/></filter>' +
    '<clipPath id="cp"><path d="' + BODY + '"/></clipPath>' +
    '<linearGradient id="sg" x1="0" y1="0" x2="1" y2="0">' +
    '<stop offset="0" style="stop-color:var(--sheen);stop-opacity:0"/>' +
    '<stop offset=".5" style="stop-color:var(--sheen);stop-opacity:.55"/>' +
    '<stop offset="1" style="stop-color:var(--sheen);stop-opacity:0"/>' +
    '</linearGradient></defs>' +
    '<g filter="url(#sh)"><path class="body" pathLength="1" d="' + BODY + '"/></g>' +
    '<g clip-path="url(#cp)"><rect class="sheen" x="300" y="300" width="120" height="520"/></g>' +
    '<g class="dotg">' +
    '<rect class="glow" filter="url(#bl)" x="' + (DOT.x - 6) + '" y="' + (DOT.y - 6) + '" width="' + (DOT.w + 12) + '" height="' + (DOT.h + 12) + '"/>' +
    '<g class="dotin"><g filter="url(#sh)"><rect class="dot" x="' + DOT.x + '" y="' + DOT.y + '" width="' + DOT.w + '" height="' + DOT.h + '"/></g></g>' +
    '</g>' +
    '<g class="word">' + lettersMarkup() + '</g>' +
    '<g class="fx"><circle class="r1" r="30"/><circle class="r2" r="30"/></g>' +
    '</svg></a>';

  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  class AcesLogo extends HTMLElement {
    static get observedAttributes() { return ['size', 'href', 'target', 'rel', 'label', 'wordmark']; }

    constructor() {
      super();
      var r = this.attachShadow({ mode: 'open' });
      r.innerHTML = TEMPLATE;
      this._wrap = r.querySelector('.wrap');
      this._svg = r.querySelector('svg');
      this._dotg = r.querySelector('.dotg');
      this._dotin = r.querySelector('.dotin');
      this._r1 = r.querySelector('.r1');
      this._r2 = r.querySelector('.r2');
      this._px = null; this._py = null; this._raf = 0; this._hot = false; this._t = 0;

      this._onMove = (e) => {
        if (reduce || this.getAttribute('track') === 'off') return;
        this._px = e.clientX; this._py = e.clientY;
        if (!this._raf) this._raf = requestAnimationFrame(() => { this._raf = 0; this._update(); });
      };
      this._onEnter = () => { this._hot = true; this._wrap.classList.add('hot'); };
      this._onLeave = () => {
        this._hot = false; this._wrap.classList.remove('hot');
        this._svg.style.transform = '';
      };
      this._onClick = (e) => {
        var kb = e.detail === 0 || (!e.clientX && !e.clientY);
        var p = kb ? DOT_C : this._toUnits(e.clientX, e.clientY);
        this._burst(p.x, p.y);
        this.dispatchEvent(new CustomEvent('aces-logo-activate', { bubbles: true, composed: true, detail: { x: p.x, y: p.y } }));
      };
    }

    connectedCallback() {
      this._applyAttrs();
      var w = this._wrap;
      this.addEventListener('pointerenter', this._onEnter);
      this.addEventListener('pointerleave', this._onLeave);
      this.addEventListener('focusin', this._onEnter);
      this.addEventListener('focusout', this._onLeave);
      w.addEventListener('click', this._onClick);
      window.addEventListener('pointermove', this._onMove, { passive: true });
      if (window.ResizeObserver) {
        this._ro = new ResizeObserver(() => this._applyWordmark());
        this._ro.observe(this);
      }
      this._applyWordmark();
      this._start();
    }

    disconnectedCallback() {
      this.removeEventListener('pointerenter', this._onEnter);
      this.removeEventListener('pointerleave', this._onLeave);
      this.removeEventListener('focusin', this._onEnter);
      this.removeEventListener('focusout', this._onLeave);
      this._wrap.removeEventListener('click', this._onClick);
      window.removeEventListener('pointermove', this._onMove);
      if (this._ro) this._ro.disconnect();
      if (this._io) this._io.disconnect();
      clearTimeout(this._t);
      cancelAnimationFrame(this._raf); this._raf = 0;
    }

    attributeChangedCallback() { if (this.isConnected) { this._applyAttrs(); this._applyWordmark(); } }

    /* ---------- public API ---------- */
    replay() {
      clearTimeout(this._t);
      var w = this._wrap;
      w.classList.remove('ready', 'intro', 'pre');
      void w.getBoundingClientRect();
      this._play();
    }
    pulse() { this._burst(DOT_C.x, DOT_C.y); }

    /* ---------- internals ---------- */
    _applyAttrs() {
      var s = this.getAttribute('size');
      if (s) this.style.setProperty('--aces-size', /^\d+(\.\d+)?$/.test(s) ? s + 'px' : s);
      var a = this._wrap, h = this.getAttribute('href');
      if (h !== null) {
        a.setAttribute('href', h);
        ['target', 'rel'].forEach((k) => { var v = this.getAttribute(k); v === null ? a.removeAttribute(k) : a.setAttribute(k, v); });
      } else { a.removeAttribute('href'); a.removeAttribute('target'); a.removeAttribute('rel'); }
      this._svg.setAttribute('aria-label', this.getAttribute('label') || 'Aces Intelligence');
    }

    _applyWordmark() {
      var mode = this.getAttribute('wordmark') || 'auto';
      var small = mode === 'auto' && this.getBoundingClientRect().width < 110;
      this._wrap.classList.toggle('small', small);
    }

    _start() {
      if (this._started) return;
      this._started = true;
      if (reduce || this.getAttribute('animate') === 'none') { this._wrap.classList.add('ready'); return; }
      this._wrap.classList.add('pre');
      if (!('IntersectionObserver' in window)) { this._play(); return; }
      this._io = new IntersectionObserver((es) => {
        if (es.some((e) => e.isIntersecting)) { this._io.disconnect(); this._play(); }
      }, { threshold: 0.25 });
      this._io.observe(this);
    }

    _play() {
      var w = this._wrap;
      w.classList.remove('pre'); w.classList.add('intro');
      this._t = setTimeout(() => { w.classList.remove('intro'); w.classList.add('ready'); }, 2500);
    }

    _toUnits(cx, cy) {
      var r = this.getBoundingClientRect();
      return { x: 320 + ((cx - r.left) / r.width) * 640, y: 305 + ((cy - r.top) / r.height) * 500 };
    }

    _update() {
      if (this._px === null) return;
      var r = this.getBoundingClientRect();
      var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      var dx = this._px - cx, dy = this._py - cy, dist = Math.hypot(dx, dy) || 1;
      var k = Math.min(1, dist / 320), amp = this._hot ? 9 : 6;
      this._dotg.style.transform = 'translate(' + (dx / dist * amp * k).toFixed(2) + 'px,' + (dy / dist * amp * k).toFixed(2) + 'px)';
      if (this._hot) {
        var nx = clamp(dx / (r.width / 2), -1, 1), ny = clamp(dy / (r.height / 2), -1, 1);
        this._svg.style.transform = 'rotateX(' + (-ny * 10).toFixed(2) + 'deg) rotateY(' + (nx * 14).toFixed(2) + 'deg)';
      }
    }

    _burst(x, y) {
      if (reduce || !this._dotin.animate) return;
      this._dotin.animate(
        [{ transform: 'scale(1)' }, { transform: 'scale(1.55)', offset: 0.35 }, { transform: 'scale(1)' }],
        { duration: 450, easing: 'cubic-bezier(.3,1.4,.5,1)' }
      );
      [this._r1, this._r2].forEach((c, i) => {
        c.setAttribute('cx', x); c.setAttribute('cy', y);
        c.style.transformBox = 'fill-box'; c.style.transformOrigin = 'center';
        c.animate(
          [{ transform: 'scale(.2)', opacity: 0.9 }, { transform: 'scale(7)', opacity: 0 }],
          { duration: 800, delay: i * 130, easing: 'cubic-bezier(.2,.7,.3,1)' }
        );
      });
    }
  }

  customElements.define('aces-logo', AcesLogo);
})();
