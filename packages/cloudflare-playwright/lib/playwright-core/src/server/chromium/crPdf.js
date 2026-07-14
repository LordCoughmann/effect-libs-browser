import { readProtocolStream } from './crProtocolHelper.js';
import { assert } from '../../utils/isomorphic/assert.js';
import '../../../../_virtual/pixelmatch.js';
import '../../utilsBundle.js';
import 'node:crypto';
import '../utils/debug.js';
import '../utils/debugLogger.js';
import '../utils/expectUtils.js';
import 'node:fs';
import 'node:path';
import '../../zipBundle.js';
import '../utils/hostPlatform.js';
import 'node:http';
import 'node:http2';
import 'node:https';
import '../utils/happyEyeballs.js';
import '../utils/nodePlatform.js';
import '../utils/profiler.js';
import '../utils/socksProxy.js';
import 'node:os';
import '../utils/zones.js';

const PagePaperFormats = {
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
  a6: { width: 4.13, height: 5.83 }
};
const unitToPixels = {
  "px": 1,
  "in": 96,
  "cm": 37.8,
  "mm": 3.78
};
function convertPrintParameterToInches(text) {
  if (text === void 0)
    return void 0;
  let unit = text.substring(text.length - 2).toLowerCase();
  let valueText = "";
  if (unitToPixels.hasOwnProperty(unit)) {
    valueText = text.substring(0, text.length - 2);
  } else {
    unit = "px";
    valueText = text;
  }
  const value = Number(valueText);
  assert(!isNaN(value), "Failed to parse parameter value: " + text);
  const pixels = value * unitToPixels[unit];
  return pixels / 96;
}
class CRPDF {
  constructor(client) {
    this._client = client;
  }
  async generate(options) {
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
      outline = false
    } = options;
    let paperWidth = 8.5;
    let paperHeight = 11;
    if (options.format) {
      const format = PagePaperFormats[options.format.toLowerCase()];
      assert(format, "Unknown paper format: " + options.format);
      paperWidth = format.width;
      paperHeight = format.height;
    } else {
      paperWidth = convertPrintParameterToInches(options.width) || paperWidth;
      paperHeight = convertPrintParameterToInches(options.height) || paperHeight;
    }
    const marginTop = convertPrintParameterToInches(margin.top) || 0;
    const marginLeft = convertPrintParameterToInches(margin.left) || 0;
    const marginBottom = convertPrintParameterToInches(margin.bottom) || 0;
    const marginRight = convertPrintParameterToInches(margin.right) || 0;
    const generateDocumentOutline = outline;
    const generateTaggedPDF = tagged;
    const result = await this._client.send("Page.printToPDF", {
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
      generateTaggedPDF,
      generateDocumentOutline
    });
    return await readProtocolStream(this._client, result.stream);
  }
}

export { CRPDF };
