import { colorDeltaE94, rgb2gray, blendWithWhite } from './colorUtils.js';
import { ImageChannel } from './imageChannel.js';
import { FastStats, ssim } from './stats.js';

const SSIM_WINDOW_RADIUS = 15;
const VARIANCE_WINDOW_RADIUS = 1;
function drawPixel(width, data, x, y, r, g, b) {
  const idx = (y * width + x) * 4;
  data[idx + 0] = r;
  data[idx + 1] = g;
  data[idx + 2] = b;
  data[idx + 3] = 255;
}
function compare(actual, expected, diff, width, height, options = {}) {
  const {
    maxColorDeltaE94 = 1
  } = options;
  const paddingSize = Math.max(VARIANCE_WINDOW_RADIUS, SSIM_WINDOW_RADIUS);
  const paddingColorEven = [255, 0, 255];
  const paddingColorOdd = [0, 255, 0];
  const [r1, g1, b1] = ImageChannel.intoRGB(width, height, expected, {
    paddingSize,
    paddingColorEven,
    paddingColorOdd
  });
  const [r2, g2, b2] = ImageChannel.intoRGB(width, height, actual, {
    paddingSize,
    paddingColorEven,
    paddingColorOdd
  });
  const noop = (x, y) => {
  };
  const drawRedPixel = diff ? (x, y) => drawPixel(width, diff, x - paddingSize, y - paddingSize, 255, 0, 0) : noop;
  const drawYellowPixel = diff ? (x, y) => drawPixel(width, diff, x - paddingSize, y - paddingSize, 255, 255, 0) : noop;
  const drawGrayPixel = diff ? (x, y) => {
    const gray = rgb2gray(r1.get(x, y), g1.get(x, y), b1.get(x, y));
    const value = blendWithWhite(gray, 0.1);
    drawPixel(width, diff, x - paddingSize, y - paddingSize, value, value, value);
  } : noop;
  let fastR, fastG, fastB;
  let diffCount = 0;
  for (let y = paddingSize; y < r1.height - paddingSize; ++y) {
    for (let x = paddingSize; x < r1.width - paddingSize; ++x) {
      if (r1.get(x, y) === r2.get(x, y) && g1.get(x, y) === g2.get(x, y) && b1.get(x, y) === b2.get(x, y)) {
        drawGrayPixel(x, y);
        continue;
      }
      const delta = colorDeltaE94(
        [r1.get(x, y), g1.get(x, y), b1.get(x, y)],
        [r2.get(x, y), g2.get(x, y), b2.get(x, y)]
      );
      if (delta <= maxColorDeltaE94) {
        drawGrayPixel(x, y);
        continue;
      }
      if (!fastR || !fastG || !fastB) {
        fastR = new FastStats(r1, r2);
        fastG = new FastStats(g1, g2);
        fastB = new FastStats(b1, b2);
      }
      const [varX1, varY1] = r1.boundXY(x - VARIANCE_WINDOW_RADIUS, y - VARIANCE_WINDOW_RADIUS);
      const [varX2, varY2] = r1.boundXY(x + VARIANCE_WINDOW_RADIUS, y + VARIANCE_WINDOW_RADIUS);
      const var1 = fastR.varianceC1(varX1, varY1, varX2, varY2) + fastG.varianceC1(varX1, varY1, varX2, varY2) + fastB.varianceC1(varX1, varY1, varX2, varY2);
      const var2 = fastR.varianceC2(varX1, varY1, varX2, varY2) + fastG.varianceC2(varX1, varY1, varX2, varY2) + fastB.varianceC2(varX1, varY1, varX2, varY2);
      if (var1 === 0 || var2 === 0) {
        drawRedPixel(x, y);
        ++diffCount;
        continue;
      }
      const [ssimX1, ssimY1] = r1.boundXY(x - SSIM_WINDOW_RADIUS, y - SSIM_WINDOW_RADIUS);
      const [ssimX2, ssimY2] = r1.boundXY(x + SSIM_WINDOW_RADIUS, y + SSIM_WINDOW_RADIUS);
      const ssimRGB = (ssim(fastR, ssimX1, ssimY1, ssimX2, ssimY2) + ssim(fastG, ssimX1, ssimY1, ssimX2, ssimY2) + ssim(fastB, ssimX1, ssimY1, ssimX2, ssimY2)) / 3;
      const isAntialiased = ssimRGB >= 0.99;
      if (isAntialiased) {
        drawYellowPixel(x, y);
      } else {
        drawRedPixel(x, y);
        ++diffCount;
      }
    }
  }
  return diffCount;
}

export { compare };
