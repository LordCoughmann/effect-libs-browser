function compressCallLog(log) {
  const lines = [];
  for (const block of findRepeatedSubsequences(log)) {
    for (let i = 0; i < block.sequence.length; i++) {
      const line = block.sequence[i];
      const leadingWhitespace = line.match(/^\s*/);
      const whitespacePrefix = "  " + leadingWhitespace?.[0] || "";
      const countPrefix = `${block.count} × `;
      if (block.count > 1 && i === 0)
        lines.push(whitespacePrefix + countPrefix + line.trim());
      else if (block.count > 1)
        lines.push(whitespacePrefix + " ".repeat(countPrefix.length - 2) + "- " + line.trim());
      else
        lines.push(whitespacePrefix + "- " + line.trim());
    }
  }
  return lines;
}
function findRepeatedSubsequences(s) {
  const n = s.length;
  const result = [];
  let i = 0;
  const arraysEqual = (a1, a2) => {
    if (a1.length !== a2.length)
      return false;
    for (let j = 0; j < a1.length; j++) {
      if (a1[j] !== a2[j])
        return false;
    }
    return true;
  };
  while (i < n) {
    let maxRepeatCount = 1;
    let maxRepeatSubstr = [s[i]];
    let maxRepeatLength = 1;
    for (let p = 1; p <= n - i; p++) {
      const substr = s.slice(i, i + p);
      let k = 1;
      while (i + p * k <= n && arraysEqual(s.slice(i + p * (k - 1), i + p * k), substr))
        k += 1;
      k -= 1;
      if (k > 1 && k * p > maxRepeatCount * maxRepeatLength) {
        maxRepeatCount = k;
        maxRepeatSubstr = substr;
        maxRepeatLength = p;
      }
    }
    result.push({ sequence: maxRepeatSubstr, count: maxRepeatCount });
    i += maxRepeatLength * maxRepeatCount;
  }
  return result;
}

export { compressCallLog };
