import { captureRawStack, parseStackFrame } from '../utils/isomorphic/stackTrace.js';

function captureLibraryStackTrace(platform) {
  const stack = captureRawStack();
  let parsedFrames = stack.map((line) => {
    const frame = parseStackFrame(line, platform.pathSeparator, platform.showInternalStackFrames());
    if (!frame || !frame.file)
      return null;
    const isPlaywrightLibrary = !!platform.coreDir && frame.file.startsWith(platform.coreDir);
    const parsed = {
      frame,
      frameText: line,
      isPlaywrightLibrary
    };
    return parsed;
  }).filter(Boolean);
  let apiName = "";
  for (let i = 0; i < parsedFrames.length - 1; i++) {
    const parsedFrame = parsedFrames[i];
    if (parsedFrame.isPlaywrightLibrary && !parsedFrames[i + 1].isPlaywrightLibrary) {
      apiName = apiName || normalizeAPIName(parsedFrame.frame.function);
      break;
    }
  }
  function normalizeAPIName(name) {
    if (!name)
      return "";
    const match = name.match(/(API|JS|CDP|[A-Z])(.*)/);
    if (!match)
      return name;
    return match[1].toLowerCase() + match[2];
  }
  const filterPrefixes = platform.boxedStackPrefixes();
  parsedFrames = parsedFrames.filter((f) => {
    if (filterPrefixes.some((prefix) => f.frame.file.startsWith(prefix)))
      return false;
    return true;
  });
  return {
    frames: parsedFrames.map((p) => p.frame),
    apiName
  };
}

export { captureLibraryStackTrace };
