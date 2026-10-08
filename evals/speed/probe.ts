// #527 — injected into every document. Times one tap from inside the page, so the
// numbers are the phone's, not the test runner's round trips. Survives a full
// page load through sessionStorage. Epoch milliseconds throughout.
export const PROBE = `(() => {
  const K = '__tapSpeed';
  const now = () => performance.timeOrigin + performance.now();
  let st = null;
  try { st = JSON.parse(sessionStorage.getItem(K) || 'null'); } catch (e) {}
  const save = () => { try { sessionStorage.setItem(K, JSON.stringify(st)); } catch (e) {} };
  const paint = (fn) => requestAnimationFrame(() => requestAnimationFrame(fn));
  const mark = (f) => {
    if (!st || st.t0 === null || st[f] !== null) return;
    paint(() => { if (st[f] === null) { st[f] = now(); save(); } });
  };
  const visible = (el) => {
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05;
  };
  const filled = (el) => /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(el.tagName) || el.textContent.trim().length > 0 || !!el.querySelector('img,svg,canvas');
  const check = () => {
    if (!st || st.t0 === null) return;
    if (st.url === null && location.href !== st.from) mark('url');
    if (st.ready !== null) return;
    if (st.spec.expectsUrl && st.url === null) return;
    const el = document.querySelector(st.spec.ready);
    if (!el || !visible(el) || !filled(el)) return;
    if ((st.spec.notReady || []).some((s) => document.querySelector(s))) return;
    mark('ready');
  };
  let installed = false;
  const install = () => {
    if (installed) return; installed = true;
    window.addEventListener('pointerdown', (e) => {
      if (!st || st.t0 !== null) return;
      st.t0 = performance.timeOrigin + e.timeStamp; st.from = location.href; save();
    }, true);
    new MutationObserver(() => mark('fb')).observe(document, { attributes: true, childList: true, subtree: true, characterData: true });
    for (const ev of ['transitionstart', 'animationstart', 'focusin']) window.addEventListener(ev, () => mark('fb'), true);
    window.addEventListener('pagehide', () => { if (st && st.t0 !== null && st.fb === null) { st.fb = now(); } save(); });
    for (const m of ['pushState', 'replaceState']) { const o = history[m]; history[m] = function () { const r = o.apply(this, arguments); mark('url'); return r; }; }
    window.addEventListener('popstate', () => mark('url'));
    try { new PerformanceObserver((l) => { if (st && st.t0 !== null) st.long += l.getEntries().reduce((a, x) => a + x.duration, 0); }).observe({ type: 'longtask', buffered: false }); } catch (e) {}
    setInterval(check, 16);
  };
  window.__tapArm = (spec) => { st = { spec, t0: null, from: null, fb: null, url: null, ready: null, long: 0 }; save(); install(); };
  window.__tapStart = () => { if (st && st.t0 === null) { st.t0 = now(); st.from = location.href; save(); } };
  window.__tapState = () => st;
  if (st) {
    install();
    if (st.t0 !== null && st.url === null && location.href !== st.from) {
      const n = performance.getEntriesByType('navigation')[0];
      st.url = performance.timeOrigin + (n ? n.responseStart : 0); if (st.fb === null) st.fb = st.url; save();
    }
  }
})();`
