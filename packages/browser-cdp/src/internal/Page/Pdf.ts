/**
 * PDF generation via CDP Page.printToPDF.
 *
 * Ported from Playwright's CRPDF implementation — same unit conversion,
 * paper format table, and streaming read pattern.
 *
 */

import type { CdpConnection } from "../CdpConnection.js";

import { Effect } from "effect";

import { getErrorMessage } from "@effect-libs/browser";

import { CdpError, PdfError } from "../../CdpError.js";
import { ensureSession } from "./EnsureSession.js";
import { type PageState } from "./PageState.js";

// ── Paper Formats (1:1 with Playwright) ──────────────────────────────────────

const PagePaperFormats: Readonly<Record<string, { width: number; height: number }>> = {
  letter: { width: 8.5, height: 11 },
  legal: { width: 8.5, height: 14 },
  tabloid: { width: 11, height: 17 },
  ledger: { width: 17, height: 11 },
  a0: { width: 33.1, height: 46.8 },
  a1: { width: 23.4, height: 33.1 },
  a2: { width: 16.54, height: 23.4 },
  a3: { width: 11.7, height: 16.54 },
  a4: { width: 8.27, height: 11.7 },
  a5: { width: 5.83, height: 8.27 },
  a6: { width: 4.13, height: 5.83 },
};

// ── Unit Conversion (1:1 with Playwright) ────────────────────────────────────

const unitToPixels: Readonly<Record<string, number>> = {
  px: 1,
  in: 96,
  cm: 37.8,
  mm: 3.78,
};

/**
 * Convert a CSS length value to inches.
 *
 * Matches Playwright's `convertPrintParameterToInches` exactly:
 * - Recognised suffixes: `px`, `in`, `cm`, `mm`
 * - Bare numbers treated as pixels
 * - `undefined` returns `undefined`
 */
const convertToInches = (text: string | number | undefined): number | undefined => {
  if (text === undefined) return undefined;

  const str = String(text);
  let unit = str.substring(str.length - 2).toLowerCase();
  let valueText: string;

  if (unit in unitToPixels) {
    valueText = str.substring(0, str.length - 2);
  } else {
    // Unknown unit — treat the whole string as a pixel count (matches Playwright/PhantomJS).
    unit = "px";
    valueText = str;
  }

  const value = Number(valueText);
  if (Number.isNaN(value)) return undefined;

  return (value * unitToPixels[unit]) / 96;
};

// ── Options ──────────────────────────────────────────────────────────────────

/** Margin dimensions — accepts values labeled with units (`"1in"`, `"2.5cm"`, `"50px"`) or bare numbers (pixels). */
export interface PdfMargin {
  /** Top margin. Defaults to `0`. */
  readonly top?: string | number;
  /** Right margin. Defaults to `0`. */
  readonly right?: string | number;
  /** Bottom margin. Defaults to `0`. */
  readonly bottom?: string | number;
  /** Left margin. Defaults to `0`. */
  readonly left?: string | number;
}

/** Options for PDF generation — 1:1 with Playwright's `page.pdf()` options. */
export interface PdfOptions {
  /** Display header and footer. Defaults to `false`. */
  readonly displayHeaderFooter?: boolean;
  /** HTML template for the print footer. */
  readonly footerTemplate?: string;
  /**
   * Paper format. If set, takes priority over `width` / `height`.
   *
   * Values: `Letter` | `Legal` | `Tabloid` | `Ledger` | `A0`–`A6`
   */
  readonly format?: string;
  /** HTML template for the print header. */
  readonly headerTemplate?: string;
  /** Paper height, accepts values labeled with units. */
  readonly height?: string | number;
  /** Paper orientation. Defaults to `false`. */
  readonly landscape?: boolean;
  /** Paper margins, defaults to none. */
  readonly margin?: PdfMargin;
  /** Whether to embed the document outline into the PDF. Defaults to `false`. */
  readonly outline?: boolean;
  /** Paper ranges to print, e.g. `'1-5, 8, 11-13'`. Defaults to all pages. */
  readonly pageRanges?: string;
  /** Give CSS `@page` size priority over `width`/`height`/`format`. Defaults to `false`. */
  readonly preferCSSPageSize?: boolean;
  /** Print background graphics. Defaults to `false`. */
  readonly printBackground?: boolean;
  /** Scale of the webpage rendering. Defaults to `1`. Must be between 0.1 and 2. */
  readonly scale?: number;
  /** Whether to generate tagged (accessible) PDF. Defaults to `false`. */
  readonly tagged?: boolean;
  /** Paper width, accepts values labeled with units. */
  readonly width?: string | number;
}

// ── Error helper ─────────────────────────────────────────────────────────────

const failPdf = (description: string) =>
  Effect.fail(
    new CdpError({
      module: "CdpPage",
      method: "pdf",
      reason: new PdfError({ description }),
    }),
  );

// ── Stream reader ────────────────────────────────────────────────────────────

/**
 * Read a CDP IO stream into a single Uint8Array.
 *
 * Playwright's implementation uses `ReturnAsStream` transfer mode and reads
 * chunks via `IO.read` until `eof === true`. We mirror that exactly.
 */
const readProtocolStream = (
  conn: CdpConnection["Service"],
  streamHandle: string,
  sessionId: string,
): Effect.Effect<Uint8Array, CdpError> =>
  Effect.gen(function* () {
    const chunks: Uint8Array[] = [];

    let eof = false;
    while (!eof) {
      const chunk = yield* conn.cdp.IO.read({ handle: streamHandle }, sessionId).pipe(
        Effect.catch((cause) =>
          failPdf(`IO.read failed while reading PDF stream: ${getErrorMessage(cause)}`),
        ),
      );

      if (chunk.data) {
        // CDP returns base64-encoded chunks
        const binary = atob(chunk.data);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        chunks.push(bytes);
      }

      eof = chunk.eof;
    }

    // Concatenate all chunks
    const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  });

// ── Main Implementation ──────────────────────────────────────────────────────

/**
 * Generates a PDF of the page.
 *
 * Uses CDP `Page.printToPDF` with `transferMode: "ReturnAsStream"` for
 * efficient streaming — mirrors Playwright's CRPDF implementation exactly.
 *
 * @param conn - CDP connection service
 * @param state - Mutable page state
 * @param options - PDF options (format, margins, scale, etc.)
 * @returns PDF data as Uint8Array
 */
export const generatePdf = Effect.fn("CdpPage.pdf")(
  (conn: CdpConnection["Service"], state: PageState, options?: PdfOptions) =>
    Effect.gen(function* () {
      const sessionId = yield* ensureSession(state);

      const {
        scale = 1,
        displayHeaderFooter = false,
        headerTemplate = "",
        footerTemplate = "",
        printBackground = false,
        landscape = false,
        pageRanges = "",
        preferCSSPageSize = false,
        margin = {},
        tagged = false,
        outline = false,
      } = options ?? {};

      // Resolve paper dimensions — format takes priority over width/height
      let paperWidth = 8.5;
      let paperHeight = 11;

      if (options?.format) {
        const format = PagePaperFormats[options.format.toLowerCase()];
        if (!format) {
          return yield* failPdf(
            `Unknown paper format: ${options.format}. Supported: ${Object.keys(PagePaperFormats).join(", ")}`,
          );
        }
        paperWidth = format.width;
        paperHeight = format.height;
      } else {
        paperWidth = convertToInches(options?.width) ?? paperWidth;
        paperHeight = convertToInches(options?.height) ?? paperHeight;
      }

      const marginTop = convertToInches(margin.top) ?? 0;
      const marginBottom = convertToInches(margin.bottom) ?? 0;
      const marginLeft = convertToInches(margin.left) ?? 0;
      const marginRight = convertToInches(margin.right) ?? 0;

      // Use streaming transfer mode (matches Playwright's CRPDF)
      const result = yield* conn.cdp.Page.printToPDF(
        {
          transferMode: "ReturnAsStream",
          landscape,
          displayHeaderFooter,
          headerTemplate,
          footerTemplate,
          printBackground,
          scale,
          paperWidth,
          paperHeight,
          marginTop,
          marginBottom,
          marginLeft,
          marginRight,
          pageRanges,
          preferCSSPageSize,
          generateTaggedPDF: tagged,
          generateDocumentOutline: outline,
        },
        sessionId,
      ).pipe(Effect.catch((cause) => failPdf(`Page.printToPDF failed: ${getErrorMessage(cause)}`)));

      const streamHandle = result.stream;
      if (!streamHandle) {
        return yield* failPdf("Page.printToPDF returned no stream handle");
      }

      return yield* readProtocolStream(conn, streamHandle, sessionId);
    }),
);
