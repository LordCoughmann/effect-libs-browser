function headersObjectToArray(headers, separator, setCookieSeparator) {
  if (!setCookieSeparator)
    setCookieSeparator = separator;
  const result = [];
  for (const name in headers) {
    const values = headers[name];
    if (values === void 0)
      continue;
    if (separator) {
      const sep = name.toLowerCase() === "set-cookie" ? setCookieSeparator : separator;
      for (const value of values.split(sep))
        result.push({ name, value: value.trim() });
    } else {
      result.push({ name, value: values });
    }
  }
  return result;
}
function headersArrayToObject(headers, lowerCase) {
  const result = {};
  for (const { name, value } of headers)
    result[lowerCase ? name.toLowerCase() : name] = value;
  return result;
}

export { headersArrayToObject, headersObjectToArray };
