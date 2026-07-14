import { compare } from './image_tools/compare.js';
import pixelmatch from '../../../../_virtual/pixelmatch.js';
import { PNG, jpegjs, diff, colors } from '../../utilsBundle.js';
import { padImageToSize } from './imageUtils.js';

function getComparator(mimeType) {
  if (mimeType === "image/png")
    return compareImages.bind(null, "image/png");
  if (mimeType === "image/jpeg")
    return compareImages.bind(null, "image/jpeg");
  if (mimeType === "text/plain")
    return compareText;
  return compareBuffersOrStrings;
}
const JPEG_JS_MAX_BUFFER_SIZE_IN_MB = 5 * 1024;
function compareBuffersOrStrings(actualBuffer, expectedBuffer) {
  if (typeof actualBuffer === "string")
    return compareText(actualBuffer, expectedBuffer);
  if (!actualBuffer || !(actualBuffer instanceof Buffer))
    return { errorMessage: "Actual result should be a Buffer or a string." };
  if (Buffer.compare(actualBuffer, expectedBuffer))
    return { errorMessage: "Buffers differ" };
  return null;
}
function compareImages(mimeType, actualBuffer, expectedBuffer, options = {}) {
  if (!actualBuffer || !(actualBuffer instanceof Buffer))
    return { errorMessage: "Actual result should be a Buffer." };
  validateBuffer(expectedBuffer, mimeType);
  let actual = mimeType === "image/png" ? PNG.sync.read(actualBuffer) : jpegjs.decode(actualBuffer, { maxMemoryUsageInMB: JPEG_JS_MAX_BUFFER_SIZE_IN_MB });
  let expected = mimeType === "image/png" ? PNG.sync.read(expectedBuffer) : jpegjs.decode(expectedBuffer, { maxMemoryUsageInMB: JPEG_JS_MAX_BUFFER_SIZE_IN_MB });
  const size = { width: Math.max(expected.width, actual.width), height: Math.max(expected.height, actual.height) };
  let sizesMismatchError = "";
  if (expected.width !== actual.width || expected.height !== actual.height) {
    sizesMismatchError = `Expected an image ${expected.width}px by ${expected.height}px, received ${actual.width}px by ${actual.height}px. `;
    actual = padImageToSize(actual, size);
    expected = padImageToSize(expected, size);
  }
  const diff2 = new PNG({ width: size.width, height: size.height });
  let count;
  if (options.comparator === "ssim-cie94") {
    count = compare(expected.data, actual.data, diff2.data, size.width, size.height, {
      // All ΔE* formulae are originally designed to have the difference of 1.0 stand for a "just noticeable difference" (JND).
      // See https://en.wikipedia.org/wiki/Color_difference#CIELAB_%CE%94E*
      maxColorDeltaE94: 1
    });
  } else if ((options.comparator ?? "pixelmatch") === "pixelmatch") {
    count = pixelmatch(expected.data, actual.data, diff2.data, size.width, size.height, {
      threshold: options.threshold ?? 0.2
    });
  } else {
    throw new Error(`Configuration specifies unknown comparator "${options.comparator}"`);
  }
  const maxDiffPixels1 = options.maxDiffPixels;
  const maxDiffPixels2 = options.maxDiffPixelRatio !== void 0 ? expected.width * expected.height * options.maxDiffPixelRatio : void 0;
  let maxDiffPixels;
  if (maxDiffPixels1 !== void 0 && maxDiffPixels2 !== void 0)
    maxDiffPixels = Math.min(maxDiffPixels1, maxDiffPixels2);
  else
    maxDiffPixels = maxDiffPixels1 ?? maxDiffPixels2 ?? 0;
  const ratio = Math.ceil(count / (expected.width * expected.height) * 100) / 100;
  const pixelsMismatchError = count > maxDiffPixels ? `${count} pixels (ratio ${ratio.toFixed(2)} of all image pixels) are different.` : "";
  if (pixelsMismatchError || sizesMismatchError)
    return { errorMessage: sizesMismatchError + pixelsMismatchError, diff: PNG.sync.write(diff2) };
  return null;
}
function validateBuffer(buffer, mimeType) {
  if (mimeType === "image/png") {
    const pngMagicNumber = [137, 80, 78, 71, 13, 10, 26, 10];
    if (buffer.length < pngMagicNumber.length || !pngMagicNumber.every((byte, index) => buffer[index] === byte))
      throw new Error("Could not decode expected image as PNG.");
  } else if (mimeType === "image/jpeg") {
    const jpegMagicNumber = [255, 216];
    if (buffer.length < jpegMagicNumber.length || !jpegMagicNumber.every((byte, index) => buffer[index] === byte))
      throw new Error("Could not decode expected image as JPEG.");
  }
}
function compareText(actual, expectedBuffer) {
  if (typeof actual !== "string")
    return { errorMessage: "Actual result should be a string" };
  let expected = expectedBuffer.toString("utf-8");
  if (expected === actual)
    return null;
  if (!actual.endsWith("\n"))
    actual += "\n";
  if (!expected.endsWith("\n"))
    expected += "\n";
  const lines = diff.createPatch("file", expected, actual, void 0, void 0, { context: 5 }).split("\n");
  const coloredLines = lines.slice(4).map((line) => {
    if (line.startsWith("-"))
      return colors.green(line);
    if (line.startsWith("+"))
      return colors.red(line);
    if (line.startsWith("@@"))
      return colors.dim(line);
    return line;
  });
  const errorMessage = coloredLines.join("\n");
  return { errorMessage };
}

export { compareBuffersOrStrings, getComparator };
