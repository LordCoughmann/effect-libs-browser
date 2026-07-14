import fs from 'node:fs';
import { splitErrorMessage } from '../../utils/isomorphic/stackTrace.js';
import { mkdirIfNeeded } from '../utils/fileUtils.js';

function getExceptionMessage(exceptionDetails) {
  if (exceptionDetails.exception)
    return exceptionDetails.exception.description || String(exceptionDetails.exception.value);
  let message = exceptionDetails.text;
  if (exceptionDetails.stackTrace) {
    for (const callframe of exceptionDetails.stackTrace.callFrames) {
      const location = callframe.url + ":" + callframe.lineNumber + ":" + callframe.columnNumber;
      const functionName = callframe.functionName || "<anonymous>";
      message += `
    at ${functionName} (${location})`;
    }
  }
  return message;
}
async function releaseObject(client, objectId) {
  await client.send("Runtime.releaseObject", { objectId }).catch((error) => {
  });
}
async function saveProtocolStream(client, handle, path) {
  let eof = false;
  await mkdirIfNeeded(path);
  const fd = await fs.promises.open(path, "w");
  while (!eof) {
    const response = await client.send("IO.read", { handle });
    eof = response.eof;
    const buf = Buffer.from(response.data, response.base64Encoded ? "base64" : void 0);
    await fd.write(buf);
  }
  await fd.close();
  await client.send("IO.close", { handle });
}
async function readProtocolStream(client, handle) {
  let eof = false;
  const chunks = [];
  while (!eof) {
    const response = await client.send("IO.read", { handle });
    eof = response.eof;
    const buf = Buffer.from(response.data, response.base64Encoded ? "base64" : void 0);
    chunks.push(buf);
  }
  await client.send("IO.close", { handle });
  return Buffer.concat(chunks);
}
function toConsoleMessageLocation(stackTrace) {
  return stackTrace && stackTrace.callFrames.length ? {
    url: stackTrace.callFrames[0].url,
    lineNumber: stackTrace.callFrames[0].lineNumber,
    columnNumber: stackTrace.callFrames[0].columnNumber
  } : { url: "", lineNumber: 0, columnNumber: 0 };
}
function exceptionToError(exceptionDetails) {
  const messageWithStack = getExceptionMessage(exceptionDetails);
  const lines = messageWithStack.split("\n");
  const firstStackTraceLine = lines.findIndex((line) => line.startsWith("    at"));
  let messageWithName = "";
  let stack = "";
  if (firstStackTraceLine === -1) {
    messageWithName = messageWithStack;
  } else {
    messageWithName = lines.slice(0, firstStackTraceLine).join("\n");
    stack = messageWithStack;
  }
  const { name, message } = splitErrorMessage(messageWithName);
  const err = new Error(message);
  err.stack = stack;
  const nameOverride = exceptionDetails.exception?.preview?.properties.find((o) => o.name === "name");
  err.name = nameOverride ? nameOverride.value ?? "Error" : name;
  return err;
}
function toModifiersMask(modifiers) {
  let mask = 0;
  if (modifiers.has("Alt"))
    mask |= 1;
  if (modifiers.has("Control"))
    mask |= 2;
  if (modifiers.has("Meta"))
    mask |= 4;
  if (modifiers.has("Shift"))
    mask |= 8;
  return mask;
}
function toButtonsMask(buttons) {
  let mask = 0;
  if (buttons.has("left"))
    mask |= 1;
  if (buttons.has("right"))
    mask |= 2;
  if (buttons.has("middle"))
    mask |= 4;
  return mask;
}

export { exceptionToError, getExceptionMessage, readProtocolStream, releaseObject, saveProtocolStream, toButtonsMask, toConsoleMessageLocation, toModifiersMask };
