// Node-only, fixed application assets. Neither callers nor browsers choose font paths.
import { readFileSync } from "node:fs";
import { OperationalConflictError } from "./operational-policies.js";

export const PDF_FONT_REGULAR = "FirstAI-NotoSans";
export const PDF_FONT_BOLD = "FirstAI-NotoSans-Bold";
// Next's server bundle inlines these two fixed assets as data URLs; native Node
// reads the package-local files. No font is published as a browser/CDN resource.
const loadFont = (asset: URL): Buffer => asset.href.startsWith("data:")
  ? Buffer.from(asset.href.slice(asset.href.indexOf(",") + 1), "base64")
  : readFileSync(asset);
const regular = loadFont(new URL("../assets/fonts/NotoSans-Regular.ttf", import.meta.url));
const bold = loadFont(new URL("../assets/fonts/NotoSans-Bold.ttf", import.meta.url));

export function registerPdfFonts(doc: PDFKit.PDFDocument): void {
  doc.registerFont(PDF_FONT_REGULAR, regular);
  doc.registerFont(PDF_FONT_BOLD, bold);
}

// PDFKit 0.20.2 exposes its selected embedded Fontkit font on _font.font.
// Isolate this private adapter here; tests exercise both faces and missing glyphs.
type EmbeddedDocument = PDFKit.PDFDocument & { _font: { font: { hasGlyphForCodePoint(code: number): boolean } } };
export function safePdfText(doc: PDFKit.PDFDocument, value: string, strong = false): string {
  doc.font(strong ? PDF_FONT_BOLD : PDF_FONT_REGULAR);
  const font = (doc as EmbeddedDocument)._font.font;
  const text = value.replace(/\r\n?/g, "\n").replace(/\t/g, "    ");
  for (const character of text) {
    if (character === "\n") continue;
    const code = character.codePointAt(0)!;
    if (code < 32 || (code >= 127 && code < 160) || !font.hasGlyphForCodePoint(code)) {
      // Report only a code point, never a full identity or arbitrary source text.
      throw new OperationalConflictError(`Caractère PDF non pris en charge : U+${code.toString(16).toUpperCase().padStart(4, "0")}. Aucun document altéré ne sera généré.`);
    }
  }
  return text;
}
