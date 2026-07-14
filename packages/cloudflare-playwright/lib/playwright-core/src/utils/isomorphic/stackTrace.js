function captureRawStack() {
  const stackTraceLimit = Error.stackTraceLimit;
  Error.stackTraceLimit = 50;
  const error = new Error();
  const stack = error.stack || "";
  Error.stackTraceLimit = stackTraceLimit;
  return stack.split("\n");
}
function parseStackFrame(text, pathSeparator, showInternalStackFrames) {
  const match = text && text.match(re);
  if (!match)
    return null;
  let fname = match[2];
  let file = match[7];
  if (!file)
    return null;
  if (!showInternalStackFrames && (file.startsWith("internal") || file.startsWith("node:")))
    return null;
  const line = match[8];
  const column = match[9];
  const closeParen = match[11] === ")";
  const frame = {
    file: "",
    line: 0,
    column: 0
  };
  if (line)
    frame.line = Number(line);
  if (column)
    frame.column = Number(column);
  if (closeParen && file) {
    let closes = 0;
    for (let i = file.length - 1; i > 0; i--) {
      if (file.charAt(i) === ")") {
        closes++;
      } else if (file.charAt(i) === "(" && file.charAt(i - 1) === " ") {
        closes--;
        if (closes === -1 && file.charAt(i - 1) === " ") {
          const before = file.slice(0, i - 1);
          const after = file.slice(i + 1);
          file = after;
          fname += ` (${before}`;
          break;
        }
      }
    }
  }
  if (fname) {
    const methodMatch = fname.match(methodRe);
    if (methodMatch)
      fname = methodMatch[1];
  }
  if (file) {
    if (file.startsWith("file://"))
      file = fileURLToPath(file, pathSeparator);
    frame.file = file;
  }
  if (fname)
    frame.function = fname;
  return frame;
}
function rewriteErrorMessage(e, newMessage) {
  const lines = (e.stack?.split("\n") || []).filter((l) => l.startsWith("    at "));
  e.message = newMessage;
  const errorTitle = `${e.name}: ${e.message}`;
  if (lines.length)
    e.stack = `${errorTitle}
${lines.join("\n")}`;
  return e;
}
function stringifyStackFrames(frames) {
  const stackLines = [];
  for (const frame of frames) {
    if (frame.function)
      stackLines.push(`    at ${frame.function} (${frame.file}:${frame.line}:${frame.column})`);
    else
      stackLines.push(`    at ${frame.file}:${frame.line}:${frame.column}`);
  }
  return stackLines;
}
function splitErrorMessage(message) {
  const separationIdx = message.indexOf(":");
  return {
    name: separationIdx !== -1 ? message.slice(0, separationIdx) : "",
    message: separationIdx !== -1 && separationIdx + 2 <= message.length ? message.substring(separationIdx + 2) : message
  };
}
const re = new RegExp(
  "^(?:\\s*at )?(?:(new) )?(?:(.*?) \\()?(?:eval at ([^ ]+) \\((.+?):(\\d+):(\\d+)\\), )?(?:(.+?):(\\d+):(\\d+)|(native))(\\)?)$"
);
const methodRe = /^(.*?) \[as (.*?)\]$/;
function fileURLToPath(fileUrl, pathSeparator) {
  if (!fileUrl.startsWith("file://"))
    return fileUrl;
  let path = decodeURIComponent(fileUrl.slice(7));
  if (path.startsWith("/") && /^[a-zA-Z]:/.test(path.slice(1)))
    path = path.slice(1);
  return path.replace(/\//g, pathSeparator);
}

export { captureRawStack, parseStackFrame, rewriteErrorMessage, splitErrorMessage, stringifyStackFrames };
