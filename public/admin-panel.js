// Navegación del panel único de administración.
(() => {
  const tabs = [...document.querySelectorAll('[data-tab]')];
  const panels = [...document.querySelectorAll('[data-panel]')];
  function activate(name, updateHash = true) {
    if (!panels.some(p => p.dataset.panel === name)) name = 'suscripciones';
    tabs.forEach(t => {
      const active = t.dataset.tab === name;
      t.classList.toggle('active', active);
      t.setAttribute('aria-selected', String(active));
      t.tabIndex = active ? 0 : -1;
    });
    panels.forEach(p => {
      const active = p.dataset.panel === name;
      p.hidden = !active;
      p.classList.toggle('active', active);
      if (active) {
        const frame = p.querySelector('iframe[data-src]');
        if (frame && !frame.src) frame.src = frame.dataset.src;
      }
    });
    if (updateHash) history.replaceState(null, '', '#' + name);
  }
  tabs.forEach(t => t.addEventListener('click', () => activate(t.dataset.tab)));
  window.addEventListener('hashchange', () => activate(location.hash.slice(1), false));
  activate(location.hash.slice(1) || 'suscripciones', false);
})();
