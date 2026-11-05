/* Schlaegt Zugangscodes vor, die man am Telefon durchgeben kann.
 *
 * Warum nicht einfach ein Passwort ausdenken: ausgedachte Codes kreisen um den
 * Verein — Gartenname, Strasse, Jahreszahl. Genau das probiert jemand zuerst.
 * Drei zufaellig gezogene Woerter sind stark und trotzdem diktierbar.
 *
 * Der Code entsteht hier auf deinem Rechner und wird nirgends gespeichert oder
 * verschickt. Einen auswaehlen, in Supabase als Wert des Secrets ZUGANGSCODE
 * eintragen, in den Passwortspeicher legen, Ausgabe schliessen.
 *
 * Aufruf:  node scripts/code-vorschlag.mjs
 */

import { randomInt } from 'node:crypto';

/* Umlautfreie, eindeutig diktierbare Woerter: nichts, was man nachfragen muss.
   Keine Woerter, die mit dem Verein zu tun haben. */
const WOERTER = [
  'Anker', 'Ampel', 'Backofen', 'Ballon', 'Bernstein', 'Birke', 'Blitz', 'Bogen',
  'Brille', 'Bronze', 'Delfin', 'Diamant', 'Distel', 'Donner', 'Dose', 'Eiche',
  'Eimer', 'Elefant', 'Fackel', 'Fagott', 'Falke', 'Feder', 'Felsen', 'Ferkel',
  'Fiedel', 'Flasche', 'Flosse', 'Forelle', 'Gabel', 'Galopp', 'Gerste', 'Gipfel',
  'Gitarre', 'Granit', 'Hafen', 'Hammer', 'Haspel', 'Hirsch', 'Hobel', 'Holunder',
  'Hummel', 'Igel', 'Kamel', 'Kanone', 'Kaktus', 'Kerze', 'Kessel', 'Kiesel',
  'Kompass', 'Korallen', 'Kran', 'Krokus', 'Kuchen', 'Lampe', 'Lawine', 'Leiter',
  'Lupine', 'Magnet', 'Mandel', 'Marmor', 'Mohn', 'Monsun', 'Muschel', 'Nebel',
  'Nelke', 'Obelisk', 'Ofen', 'Orkan', 'Paddel', 'Panther', 'Pfeffer', 'Pilz',
  'Pinsel', 'Planke', 'Quelle', 'Rabe', 'Radar', 'Rakete', 'Regen', 'Riegel',
  'Robbe', 'Rose', 'Sandel', 'Schiefer', 'Schlitten', 'Schnecke', 'Segel', 'Sense',
  'Silber', 'Spaten', 'Specht', 'Spindel', 'Stiefel', 'Storch', 'Tanne', 'Tiger',
  'Trommel', 'Tulpe', 'Turmalin', 'Vulkan', 'Waffel', 'Walnuss', 'Wimpel', 'Zeder',
  'Zikade', 'Zimt', 'Zinne', 'Zypresse'
];

const zahl = () => randomInt(10, 100);
const wort = () => WOERTER[randomInt(WOERTER.length)];

function vorschlag() {
  /* Drei Woerter und eine Zahl: rund 2 * 10^7 Wortkombinationen mal 90 Zahlen.
     Bei der Sperre von zehn Versuchen je Viertelstunde ist das unerratbar. */
  return `${wort()}-${wort()}-${wort()}-${zahl()}`;
}

console.log('\nVorschlaege fuer den Zugangscode:\n');
for (let i = 0; i < 6; i++) console.log(`   ${vorschlag()}`);
console.log(
  [
    '',
    'Einen auswaehlen und in Supabase eintragen:',
    '   Edge Functions -> Secrets -> Add new secret',
    '   Key:   ZUGANGSCODE',
    '   Value: der gewaehlte Code',
    '',
    'Danach in den Passwortspeicher legen und dieses Fenster schliessen.',
    'Der Code gehoert nicht in den Chat, nicht ins Repo und nicht in dieselbe',
    'Nachricht wie der Link zur Seite.',
    ''
  ].join('\n')
);
