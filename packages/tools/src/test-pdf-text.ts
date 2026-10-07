// Test-only reader for PDFKit's compressed, embedded-font PDFs, not a general PDF parser.
// Decode actual text operators through each font's ToUnicode map (including ligatures).
import { inflateSync } from "node:zlib";

export function renderedPdfText(pdf: Buffer): string {
  const objects = new Map<number, string>();
  for (const match of pdf.toString("latin1").matchAll(/(\d+) 0 obj\s*([\s\S]*?)endobj/g)) objects.set(Number(match[1]), match[2]!);
  const stream = (object: string): string | undefined => {
    const match = /stream\r?\n/.exec(object);
    if (!match) return undefined;
    const length = /\/Length (\d+)( 0 R)?/.exec(object);
    if (!length) throw new Error("PDF stream length missing.");
    const size = length[2] ? Number(objects.get(Number(length[1]))?.trim()) : Number(length[1]);
    const start = match.index + match[0].length;
    const bytes = Buffer.from(object.slice(start, start + size), "latin1");
    return (/\/FlateDecode\b/.test(object) ? inflateSync(bytes) : bytes).toString("latin1");
  };
  const fonts = new Map<string, Map<number, string>>();
  for (const object of objects.values()) {
    for (const reference of object.matchAll(/\/(F\d+) (\d+) 0 R/g)) {
      const font = objects.get(Number(reference[2])) ?? "";
      const toUnicode = /\/ToUnicode (\d+) 0 R/.exec(font);
      if (!toUnicode) continue;
      const cmap = stream(objects.get(Number(toUnicode[1])) ?? "") ?? "";
      const glyphs = new Map<number, string>();
      for (const range of cmap.matchAll(/<([\da-f]+)>\s*<([\da-f]+)>\s*\[([\s\S]*?)\]/gi)) {
        let code = parseInt(range[1]!, 16);
        for (const entry of range[3]!.matchAll(/<([\da-f\s]+)>/gi)) {
          const hex = entry[1]!.replace(/\s/g, "");
          const units = hex.match(/.{4}/g) ?? [];
          glyphs.set(code++, units.map(unit => String.fromCharCode(parseInt(unit, 16))).join(""));
        }
      }
      fonts.set(reference[1]!, glyphs);
    }
  }
  let result = "";
  for (const object of objects.values()) {
    const content = stream(object);
    if (!content?.includes("BT")) continue;
    let font: Map<number, string> | undefined;
    for (const token of content.matchAll(/\/(F\d+)\s+[\d.]+\s+Tf|\[([^\]]*)\]\s*TJ|<([\da-f]+)>\s*Tj/gi)) {
      if (token[1]) { font = fonts.get(token[1]); continue; }
      if (!font) throw new Error("Missing embedded font ToUnicode map in PDF test.");
      const encoded = token[3] ? [token[3]] : [...token[2]!.matchAll(/<([\da-f]+)>/gi)].map(match => match[1]!);
      for (const hex of encoded) for (const glyph of hex.match(/.{4}/g) ?? []) {
        const text = font.get(parseInt(glyph, 16));
        if (text === undefined || text === "\0") throw new Error("Unmapped/replacement glyph in PDF text.");
        result += text;
      }
    }
  }
  return result;
}
