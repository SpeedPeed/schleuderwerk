import { el, iconize } from './dom.js';

// Kurze Einblendungen wie „SALTO!“ oder „+120 gesichert“. Paket B: Schablonen-Schrift; Währungs-Emoji in den Texten
// (aus main.js/Spiellogik) werden zu Sprite-Icons (ui/dom.js → iconize).
export class Popups {
  constructor(root) {
    this.box = el('<div id="popups"></div>');
    root.appendChild(this.box);
  }

  show(text, kind = 'good') {
    const p = el(`<div class="popup popup-${kind}"></div>`);
    p.innerHTML = iconize(text);
    this.box.appendChild(p);
    while (this.box.children.length > 4) this.box.firstChild.remove();
    setTimeout(() => p.remove(), kind === 'big' ? 1500 : 1200);
  }

  clear() { this.box.innerHTML = ''; }
}
