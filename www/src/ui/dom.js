// Kleine Helfer für die HTML-Oberfläche.

export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export const fmt = (n) => Math.round(n).toLocaleString('de-DE');

// Große Zahlen kompakt: 12.300 -> 12,3 Tsd.
export function short(n) {
  n = Math.round(n);
  if (n < 100000) return fmt(n);
  const units = [[1e12, 'Bio.'], [1e9, 'Mrd.'], [1e6, 'Mio.'], [1e3, 'Tsd.']];
  for (const [v, u] of units) if (n >= v) return `${(n / v).toLocaleString('de-DE', { maximumFractionDigits: 1 })} ${u}`;
  return fmt(n);
}

export const show = (e, on = true) => e.classList.toggle('hidden', !on);

// Einfacher Bestätigungsdialog
export function confirmDialog(root, text, yes = 'Ja', no = 'Abbrechen') {
  return new Promise((resolve) => {
    const d = el(`<div class="overlay modal"><div class="card"><p>${text}</p>
      <div class="btn-row"><button class="btn btn-secondary">${no}</button><button class="btn btn-danger">${yes}</button></div></div></div>`);
    const [bNo, bYes] = d.querySelectorAll('button');
    bNo.onclick = () => { d.remove(); resolve(false); };
    bYes.onclick = () => { d.remove(); resolve(true); };
    root.appendChild(d);
  });
}
