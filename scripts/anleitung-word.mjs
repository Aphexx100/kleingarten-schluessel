/* Baut die Anleitung als Word-Datei.
 *
 * Inhalt und Bilder kommen von aussen — dieselben, aus denen auch das PDF
 * entsteht (siehe scripts/anleitung-inhalt.mjs). So koennen die beiden
 * Fassungen nicht auseinanderlaufen.
 *
 * Aufbau: je Schritt eine Zeile einer rahmenlosen Tabelle, links das Bild,
 * rechts Ueberschrift und Text. Das sieht aus wie das PDF und laesst sich in
 * Word bearbeiten — Zeile anklicken, Text aendern, fertig.
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ImageRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  ShadingType,
  AlignmentType,
  HeadingLevel,
  VerticalAlign
} from 'docx';
import fs from 'node:fs/promises';

import {
  TITEL,
  UNTERTITEL,
  SCHRITTE,
  STOERUNGEN,
  STOERUNGEN_TITEL,
  SCHLUSSHINWEIS,
  inlineTeile,
  stand
} from './anleitung-inhalt.mjs';

/* A4 abzueglich 2 cm Rand links und rechts, in DXA (1440 = 1 Zoll). */
const SATZSPIEGEL = 9638;
const SPALTE_BILD = 3600;
const SPALTE_TEXT = SATZSPIEGEL - SPALTE_BILD;

/* Word rechnet Bilder in Bildpunkten zu 96 dpi. 3600 DXA = 2,5 Zoll = 240 px. */
const BILD_BREITE_PX = 232;

const GRUEN = '1F6B3A';
const GRAU = '6A675E';
const DUNKEL = '1C1B18';
const SAND = 'FDF4DD';

const OHNE_RAHMEN = {
  top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
};

/* Fettdruck aus **…** in Word-Textteile uebersetzen. */
function laeufe(text, { groesse = 21, farbe = DUNKEL } = {}) {
  return inlineTeile(text).map(
    (t) => new TextRun({ text: t.text, bold: t.fett, size: groesse, color: farbe })
  );
}

function absatz(text, opt = {}) {
  return new Paragraph({
    children: laeufe(text, opt),
    spacing: { after: opt.after ?? 90 }
  });
}

/* Hinweiskasten: sandfarben hinterlegt, damit er sich abhebt. Word kennt keine
   farbige Seitenleiste wie CSS — eine einzelne Tabellenzelle tut es auch. */
function merkkasten(text) {
  return new Table({
    width: { size: SPALTE_TEXT, type: WidthType.DXA },
    columnWidths: [SPALTE_TEXT],
    borders: {
      ...OHNE_RAHMEN,
      left: { style: BorderStyle.SINGLE, size: 18, color: '8A6A16' }
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: SPALTE_TEXT, type: WidthType.DXA },
            shading: { type: ShadingType.CLEAR, fill: SAND },
            margins: { top: 110, bottom: 110, left: 160, right: 160 },
            children: [
              new Paragraph({ children: laeufe(text, { groesse: 19 }), spacing: { after: 0 } })
            ]
          })
        ]
      })
    ]
  });
}

function schrittZeile(s, bilder) {
  const bild = bilder[s.bild];

  const linkeZelle = bild
    ? [
        new Paragraph({
          children: [
            new ImageRun({
              type: 'png',
              data: bild.daten,
              transformation: {
                width: BILD_BREITE_PX,
                height: Math.round(BILD_BREITE_PX * (bild.hoehe / bild.breite))
              }
            })
          ],
          spacing: { after: 0 }
        })
      ]
    : [new Paragraph({ text: '', spacing: { after: 0 } })];

  const rechteZelle = [
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun({ text: `${s.nr}. ${s.titel}` })],
      spacing: { before: 0, after: 100 }
    }),
    ...s.absaetze.map((a) => absatz(a)),
    ...(s.merke ? [merkkasten(s.merke)] : [])
  ];

  return new TableRow({
    children: [
      new TableCell({
        width: { size: SPALTE_BILD, type: WidthType.DXA },
        margins: { top: 140, bottom: 140, left: 0, right: 220 },
        verticalAlign: VerticalAlign.TOP,
        children: linkeZelle
      }),
      new TableCell({
        width: { size: SPALTE_TEXT, type: WidthType.DXA },
        margins: { top: 140, bottom: 140, left: 0, right: 0 },
        verticalAlign: VerticalAlign.TOP,
        children: rechteZelle
      })
    ]
  });
}

function stoerungsTabelle() {
  const links = 3400;
  const rechts = SATZSPIEGEL - links;

  return new Table({
    width: { size: SATZSPIEGEL, type: WidthType.DXA },
    columnWidths: [links, rechts],
    borders: {
      ...OHNE_RAHMEN,
      insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: 'E2E0D8' }
    },
    rows: STOERUNGEN.map(
      ([was, warum]) =>
        new TableRow({
          children: [
            new TableCell({
              width: { size: links, type: WidthType.DXA },
              margins: { top: 90, bottom: 90, left: 0, right: 160 },
              children: [
                new Paragraph({
                  children: [new TextRun({ text: was, bold: true, size: 19, color: DUNKEL })],
                  spacing: { after: 0 }
                })
              ]
            }),
            new TableCell({
              width: { size: rechts, type: WidthType.DXA },
              margins: { top: 90, bottom: 90, left: 0, right: 0 },
              children: [
                new Paragraph({
                  children: [new TextRun({ text: warum, size: 19, color: DUNKEL })],
                  spacing: { after: 0 }
                })
              ]
            })
          ]
        })
    )
  });
}

/* bilder: { name: { daten: Buffer, breite, hoehe } } */
export async function wordSchreiben(bilder, ziel) {
  const dokument = new Document({
    styles: {
      default: {
        document: { run: { font: 'Calibri', size: 21, color: DUNKEL } },
        heading1: {
          run: { font: 'Calibri', size: 40, bold: true, color: DUNKEL },
          paragraph: { spacing: { before: 0, after: 40 }, keepNext: true }
        },
        heading2: {
          run: { font: 'Calibri', size: 25, bold: true, color: GRUEN },
          paragraph: { spacing: { before: 0, after: 100 }, keepNext: true }
        }
      }
    },
    sections: [
      {
        properties: {
          page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } }
        },
        children: [
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun({ text: TITEL })]
          }),
          new Paragraph({
            children: [
              new TextRun({ text: `${UNTERTITEL} · Stand ${stand()}`, size: 19, color: GRAU })
            ],
            spacing: { after: 240 },
            border: {
              bottom: { style: BorderStyle.SINGLE, size: 8, color: '2B8B4B', space: 8 }
            }
          }),

          new Table({
            width: { size: SATZSPIEGEL, type: WidthType.DXA },
            columnWidths: [SPALTE_BILD, SPALTE_TEXT],
            borders: {
              ...OHNE_RAHMEN,
              insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: 'E2E0D8' }
            },
            rows: SCHRITTE.map((s) => schrittZeile(s, bilder))
          }),

          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun({ text: STOERUNGEN_TITEL })],
            spacing: { before: 320, after: 120 },
            border: {
              top: { style: BorderStyle.SINGLE, size: 12, color: '2B8B4B', space: 8 }
            }
          }),
          stoerungsTabelle(),

          new Paragraph({ text: '', spacing: { after: 160 } }),
          merkkasten(SCHLUSSHINWEIS)
        ]
      }
    ]
  });

  await fs.writeFile(ziel, await Packer.toBuffer(dokument));
  return (await fs.stat(ziel)).size;
}
