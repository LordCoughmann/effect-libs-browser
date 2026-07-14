function serializeClientSideCallMetadata(metadatas) {
  const fileNames = /* @__PURE__ */ new Map();
  const stacks = [];
  for (const m of metadatas) {
    if (!m.stack || !m.stack.length)
      continue;
    const stack = [];
    for (const frame of m.stack) {
      let ordinal = fileNames.get(frame.file);
      if (typeof ordinal !== "number") {
        ordinal = fileNames.size;
        fileNames.set(frame.file, ordinal);
      }
      const stackFrame = [ordinal, frame.line || 0, frame.column || 0, frame.function || ""];
      stack.push(stackFrame);
    }
    stacks.push([m.id, stack]);
  }
  return { files: [...fileNames.keys()], stacks };
}

export { serializeClientSideCallMetadata };
