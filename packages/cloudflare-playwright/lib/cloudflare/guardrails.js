const GUARDRAILS_HEADER = "cf-brapi-guardrails";
function encodeGuardrailsHeader(policy) {
  const bytes = new TextEncoder().encode(JSON.stringify(policy));
  let binary = "";
  for (const byte of bytes)
    binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export { GUARDRAILS_HEADER, encodeGuardrailsHeader };
