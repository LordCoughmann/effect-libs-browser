function wrapInASCIIBox(text, padding = 0) {
  const lines = text.split("\n");
  const maxLength = Math.max(...lines.map((line) => line.length));
  return [
    "╔" + "═".repeat(maxLength + padding * 2) + "╗",
    ...lines.map((line) => "║" + " ".repeat(padding) + line + " ".repeat(maxLength - line.length + padding) + "║"),
    "╚" + "═".repeat(maxLength + padding * 2) + "╝"
  ].join("\n");
}

export { wrapInASCIIBox };
