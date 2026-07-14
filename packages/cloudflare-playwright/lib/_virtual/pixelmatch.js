import { getDefaultExportFromCjs } from './_commonjsHelpers.js';
import { __require as requirePixelmatch } from '../playwright-core/src/third_party/pixelmatch.js';

var pixelmatchExports = requirePixelmatch();
const pixelmatch = /*@__PURE__*/getDefaultExportFromCjs(pixelmatchExports);

export { pixelmatch as default };
