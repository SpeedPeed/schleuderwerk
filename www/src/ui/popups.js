import { el } from './dom.js';

// Kurze Einblendungen wie „SALTO!“ oder „+120 gesichert“.
export class Popups {
  constructor(root) {
    this.box = el('<div id="popups"></div>');
    root.appendChild(this.box);
  }

  show(text, kind = 'good') {
    const p = el(`<div class="popup popup-${kind}"></div>`);
    p.textContent = text;
    this.box.appendChild(p);
    while (this.box.children.length > 4) this.box.firstChild.remove();
    setTimeout(() => p.remove(), kind === 'big' ? 1500 : 1200);
  }

  clear() { this.box.innerHTML = ''; }
}
