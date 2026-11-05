/* Winzige Hilfe zum Bauen von Elementen.
 *
 * Statt innerHTML mit zusammengesetzten Zeichenketten: Namen, Adressen und
 * Notizen kommen von Menschen und landen so niemals als HTML im Dokument. Ein
 * Garten mit der Notiz "<b>wichtig</b>" soll genau das anzeigen und nicht fett
 * werden — und ein Eintrag mit einem script-Schnipsel soll gar nichts tun.
 */

export function h(tag, eigenschaften = {}, ...kinder) {
  const el = document.createElement(tag);

  for (const [name, wert] of Object.entries(eigenschaften)) {
    if (wert === null || wert === undefined || wert === false) continue;

    if (name === 'class') el.className = wert;
    else if (name === 'text') el.textContent = wert;
    else if (name === 'dataset') Object.assign(el.dataset, wert);
    else if (name.startsWith('on')) el.addEventListener(name.slice(2).toLowerCase(), wert);
    else if (name === 'value') el.value = wert;
    else if (name === 'checked' || name === 'disabled' || name === 'selected') el[name] = Boolean(wert);
    else el.setAttribute(name, wert);
  }

  for (const kind of kinder.flat(Infinity)) {
    if (kind === null || kind === undefined || kind === false) continue;
    el.append(typeof kind === 'object' ? kind : document.createTextNode(String(kind)));
  }

  return el;
}

/* Ein Feld mit Beschriftung, Eingabe und optionalem Hinweis darunter. */
export function feld(beschriftung, eingabe, hinweis) {
  const id = eingabe.id || `f-${Math.random().toString(36).slice(2, 9)}`;
  eingabe.id = id;
  return h(
    'div',
    { class: 'feld' },
    h('label', { for: id, text: beschriftung }),
    eingabe,
    hinweis ? h('p', { class: 'hinweis', text: hinweis }) : null
  );
}

export function leeren(el) {
  while (el.firstChild) el.firstChild.remove();
  return el;
}
