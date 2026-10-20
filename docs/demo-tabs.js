const tabs = [...document.querySelectorAll('.demo-tabs [role="tab"]')];
function select(id, focus = false) {
  for (const tab of tabs) {
    const selected = tab.getAttribute('aria-controls') === id;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    document.getElementById(tab.getAttribute('aria-controls')).hidden = !selected;
    if (selected && focus) tab.focus();
  }
  document.dispatchEvent(new CustomEvent('demo-tab-change', { detail: id }));
}
for (const [index, tab] of tabs.entries()) {
  tab.addEventListener('click', () => select(tab.getAttribute('aria-controls')));
  tab.addEventListener('keydown', event => {
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = tabs.length - 1;
    if (next !== undefined) { event.preventDefault(); select(tabs[next].getAttribute('aria-controls'), true); }
  });
}
function fromHash() {
  if (['#simulation', '#monitoring'].includes(location.hash)) select(location.hash.slice(1));
}
window.addEventListener('hashchange', fromHash);
// Also handle links to the already-current hash after switching with the tabs.
for (const link of document.querySelectorAll('a[href="#simulation"],a[href="#monitoring"]')) {
  link.addEventListener('click', () => select(link.hash.slice(1)));
}
fromHash();
