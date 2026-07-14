import require$$0$2__default from 'node:util';

function stdioChunkToParams(chunk) {
  if (chunk instanceof Uint8Array)
    return { buffer: Buffer.from(chunk).toString("base64") };
  if (typeof chunk !== "string")
    return { text: require$$0$2__default.inspect(chunk) };
  return { text: chunk };
}

export { stdioChunkToParams };
