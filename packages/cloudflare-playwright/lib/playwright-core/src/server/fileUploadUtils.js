import fs from 'node:fs';
import path__default from 'node:path';
import { assert } from '../utils/isomorphic/assert.js';
import { mime } from '../utilsBundle.js';

const fileUploadSizeLimit = 50 * 1024 * 1024;
async function filesExceedUploadLimit(files) {
  const sizes = await Promise.all(files.map(async (file) => (await fs.promises.stat(file)).size));
  return sizes.reduce((total, size) => total + size, 0) >= fileUploadSizeLimit;
}
async function prepareFilesForUpload(frame, params) {
  const { payloads, streams, directoryStream } = params;
  let { localPaths, localDirectory } = params;
  if ([payloads, localPaths, localDirectory, streams, directoryStream].filter(Boolean).length !== 1)
    throw new Error("Exactly one of payloads, localPaths and streams must be provided");
  if (streams)
    localPaths = streams.map((c) => c.path());
  if (directoryStream)
    localDirectory = directoryStream.path();
  if (localPaths) {
    for (const p of localPaths)
      assert(path__default.isAbsolute(p) && path__default.resolve(p) === p, "Paths provided to localPaths must be absolute and fully resolved.");
  }
  let fileBuffers = payloads;
  if (!frame._page.browserContext._browser._isCollocatedWithServer) {
    if (localPaths) {
      if (await filesExceedUploadLimit(localPaths))
        throw new Error("Cannot transfer files larger than 50Mb to a browser not co-located with the server");
      fileBuffers = await Promise.all(localPaths.map(async (item) => {
        return {
          name: path__default.basename(item),
          buffer: await fs.promises.readFile(item),
          lastModifiedMs: (await fs.promises.stat(item)).mtimeMs
        };
      }));
      localPaths = void 0;
    }
  }
  const filePayloads = fileBuffers?.map((payload) => ({
    name: payload.name,
    mimeType: payload.mimeType || mime.getType(payload.name) || "application/octet-stream",
    buffer: payload.buffer.toString("base64"),
    lastModifiedMs: payload.lastModifiedMs
  }));
  return { localPaths, localDirectory, filePayloads };
}

export { fileUploadSizeLimit, prepareFilesForUpload };
