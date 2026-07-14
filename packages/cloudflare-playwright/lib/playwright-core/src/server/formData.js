import { mime } from '../utilsBundle.js';

class MultipartFormData {
  constructor() {
    this._chunks = [];
    this._boundary = generateUniqueBoundaryString();
  }
  contentTypeHeader() {
    return `multipart/form-data; boundary=${this._boundary}`;
  }
  addField(name, value) {
    this._beginMultiPartHeader(name);
    this._finishMultiPartHeader();
    this._chunks.push(Buffer.from(value));
    this._finishMultiPartField();
  }
  addFileField(name, value) {
    this._beginMultiPartHeader(name);
    this._chunks.push(Buffer.from(`; filename="${value.name}"`));
    this._chunks.push(Buffer.from(`\r
content-type: ${value.mimeType || mime.getType(value.name) || "application/octet-stream"}`));
    this._finishMultiPartHeader();
    this._chunks.push(value.buffer);
    this._finishMultiPartField();
  }
  finish() {
    this._addBoundary(true);
    return Buffer.concat(this._chunks);
  }
  _beginMultiPartHeader(name) {
    this._addBoundary();
    this._chunks.push(Buffer.from(`content-disposition: form-data; name="${name}"`));
  }
  _finishMultiPartHeader() {
    this._chunks.push(Buffer.from(`\r
\r
`));
  }
  _finishMultiPartField() {
    this._chunks.push(Buffer.from(`\r
`));
  }
  _addBoundary(isLastBoundary) {
    this._chunks.push(Buffer.from("--" + this._boundary));
    if (isLastBoundary)
      this._chunks.push(Buffer.from("--"));
    this._chunks.push(Buffer.from("\r\n"));
  }
}
const alphaNumericEncodingMap = [
  65,
  66,
  67,
  68,
  69,
  70,
  71,
  72,
  73,
  74,
  75,
  76,
  77,
  78,
  79,
  80,
  81,
  82,
  83,
  84,
  85,
  86,
  87,
  88,
  89,
  90,
  97,
  98,
  99,
  100,
  101,
  102,
  103,
  104,
  105,
  106,
  107,
  108,
  109,
  110,
  111,
  112,
  113,
  114,
  115,
  116,
  117,
  118,
  119,
  120,
  121,
  122,
  48,
  49,
  50,
  51,
  52,
  53,
  54,
  55,
  56,
  57,
  65,
  66
];
function generateUniqueBoundaryString() {
  const charCodes = [];
  for (let i = 0; i < 16; i++)
    charCodes.push(alphaNumericEncodingMap[Math.floor(Math.random() * alphaNumericEncodingMap.length)]);
  return "----WebKitFormBoundary" + String.fromCharCode(...charCodes);
}

export { MultipartFormData };
