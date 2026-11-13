import { type PDFFont, PDFDocument, type PDFPage, StandardFonts, rgb } from "pdf-lib";

/** A tiny layer over pdf-lib so the sample layouts read top to bottom. */
export class Sheet {
  private constructor(
    readonly doc: PDFDocument,
    readonly page: PDFPage,
    private regular: PDFFont,
    private bold: PDFFont,
    private mono: PDFFont,
  ) {}

  static async create(): Promise<Sheet> {
    const doc = await PDFDocument.create();
    doc.setProducer("financial-document-parser sample generator");
    doc.setCreationDate(new Date("2026-01-01T00:00:00Z"));
    doc.setModificationDate(new Date("2026-01-01T00:00:00Z"));
    const page = doc.addPage([612, 792]); // US Letter
    return new Sheet(
      doc,
      page,
      await doc.embedFont(StandardFonts.Helvetica),
      await doc.embedFont(StandardFonts.HelveticaBold),
      await doc.embedFont(StandardFonts.Courier),
    );
  }

  /** y counts down from the top of the page, which is easier to lay out by eye. */
  text(value: string, x: number, y: number, opts: { size?: number; bold?: boolean; mono?: boolean; right?: boolean; gray?: boolean } = {}) {
    const size = opts.size ?? 9;
    const font = opts.mono ? this.mono : opts.bold ? this.bold : this.regular;
    const width = font.widthOfTextAtSize(value, size);
    this.page.drawText(value, {
      x: opts.right ? x - width : x,
      y: 792 - y,
      size,
      font,
      color: opts.gray ? rgb(0.4, 0.4, 0.4) : rgb(0.1, 0.1, 0.1),
    });
  }

  line(x1: number, y: number, x2: number, opts: { thick?: boolean } = {}) {
    this.page.drawLine({
      start: { x: x1, y: 792 - y },
      end: { x: x2, y: 792 - y },
      thickness: opts.thick ? 1.2 : 0.5,
      color: rgb(0.55, 0.55, 0.55),
    });
  }

  box(x: number, y: number, width: number, height: number, opts: { fill?: boolean } = {}) {
    this.page.drawRectangle({
      x,
      y: 792 - y - height,
      width,
      height,
      borderColor: rgb(0.6, 0.6, 0.6),
      borderWidth: 0.6,
      color: opts.fill ? rgb(0.94, 0.94, 0.94) : undefined,
    });
  }

  async save(): Promise<Uint8Array> {
    return this.doc.save({ useObjectStreams: false });
  }
}

export function fmt(amount: number, opts: { negative?: boolean; dollar?: boolean } = {}): string {
  const text = Math.abs(amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const withDollar = opts.dollar ? `$${text}` : text;
  return opts.negative && amount !== 0 ? `-${withDollar}` : withDollar;
}

export function usDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
}

export function longDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}
