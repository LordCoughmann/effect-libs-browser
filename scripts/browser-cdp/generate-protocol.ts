/**
 * Codegen: generates a type-only Effect-ified CDP protocol interface.
 *
 * Reads `devtools-protocol/json/*.json` and emits
 * `packages/browser-cdp/src/internal/CdpProtocol.ts` — a single flat file with:
 *   - `CdpDomainApi<Domain>` interfaces (params as plain TS, returns as
 *     `Effect.Effect<Protocol.XxxResponse, CdpProtocolError>`)
 *   - `CdpProtocol` combining all domains
 *
 * Usage: pnpm tsx scripts/browser-cdp/generate-protocol.ts
 *
 */

import { NodeServices } from "@effect/platform-node";
import { Effect, Console, Schema, FileSystem, Path } from "effect";
import * as Arr from "effect/Array";

// =============================================================================
// Errors
// =============================================================================

class ProtocolReadError extends Schema.TaggedErrorClass<ProtocolReadError>()(
  "scripts/ProtocolReadError",
  Schema.Struct({
    file: Schema.String,
    cause: Schema.Defect(),
  }),
) {
  override get message(): string {
    return `Failed to read protocol file ${this.file}`;
  }
}

class ProtocolParseError extends Schema.TaggedErrorClass<ProtocolParseError>()(
  "scripts/ProtocolParseError",
  Schema.Struct({ file: Schema.String, cause: Schema.Defect() }),
) {
  override get message(): string {
    return `Failed to parse protocol JSON from ${this.file}`;
  }
}

class ProtocolWriteError extends Schema.TaggedErrorClass<ProtocolWriteError>()(
  "scripts/ProtocolWriteError",
  Schema.Struct({ path: Schema.String, cause: Schema.Defect() }),
) {
  override get message(): string {
    return `Failed to write generated protocol to ${this.path}`;
  }
}

// =============================================================================
// Protocol Types (Schema-validated)
// =============================================================================

class ItemsSchema extends Schema.Class<ItemsSchema>("ItemsSchema")({
  $ref: Schema.optional(Schema.String),
  type: Schema.optional(Schema.String),
  items: Schema.optional(Schema.Unknown),
}) {}

class Property extends Schema.Class<Property>("Property")({
  name: Schema.String,
  type: Schema.optional(Schema.String),
  $ref: Schema.optional(Schema.String),
  optional: Schema.optional(Schema.Boolean),
  description: Schema.optional(Schema.String),
  experimental: Schema.optional(Schema.Boolean),
  deprecated: Schema.optional(Schema.Boolean),
  items: Schema.optional(ItemsSchema),
  enum: Schema.optional(Schema.Array(Schema.String)),
}) {}

class CommandDef extends Schema.Class<CommandDef>("CommandDef")({
  name: Schema.String,
  description: Schema.optional(Schema.String),
  experimental: Schema.optional(Schema.Boolean),
  deprecated: Schema.optional(Schema.Boolean),
  parameters: Schema.optional(Schema.Array(Property)),
  returns: Schema.optional(Schema.Array(Property)),
}) {}

class EventDef extends Schema.Class<EventDef>("EventDef")({
  name: Schema.String,
  parameters: Schema.optional(Schema.Array(Property)),
  description: Schema.optional(Schema.String),
}) {}

class TypeDef extends Schema.Class<TypeDef>("TypeDef")({
  id: Schema.String,
  type: Schema.String,
  enum: Schema.optional(Schema.Array(Schema.String)),
  properties: Schema.optional(Schema.Array(Property)),
  items: Schema.optional(Schema.Unknown),
}) {}

class DomainDef extends Schema.Class<DomainDef>("DomainDef")({
  domain: Schema.String,
  description: Schema.optional(Schema.String),
  experimental: Schema.optional(Schema.Boolean),
  types: Schema.optional(Schema.Array(TypeDef)),
  commands: Schema.optional(Schema.Array(CommandDef)),
  events: Schema.optional(Schema.Array(EventDef)),
}) {}

class ProtocolJson extends Schema.Class<ProtocolJson>("ProtocolJson")({
  domains: Schema.optional(Schema.Array(DomainDef)),
}) {}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Sort domains alphabetically for deterministic output.
 */
export const sortDomains = <T extends { domain: string }>(domains: T[]): T[] =>
  [...domains].sort((a, b) => a.domain.localeCompare(b.domain));

// =============================================================================
// Protocol Loading
// =============================================================================

/**
 * Read the devtools-protocol types file once to discover which
 * `Protocol.Domain.Type` names are actually exported. Returns a `Set<string>`
 * of dot-qualified names (e.g. `"Page.GetAdScriptAncestryRequest"`).
 *
 * Used by `emitDomain` to gracefully degrade to `unknown` params/return types
 * when the upstream protocol removed or renamed a Request/Response interface
 * between protocol version bumps. Without this, codegen would emit references
 * to non-existent types and break `tsgo --noEmit` on every upgrade.
 *
 * Implementation note: the protocol.d.ts file uses inconsistent indentation
 * (some namespaces at 4 spaces, some at 5) so we can't rely on indent for
 * nesting. Instead we track `{`/`}` depth with string/comment awareness to
 * correctly enter and exit each `export namespace X { ... }`.
 */
const loadExportedTypes = (): Effect.Effect<
  Set<string>,
  never,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const typesPath = path.join(
      process.cwd(),
      "node_modules",
      "devtools-protocol",
      "types",
      "protocol.d.ts",
    );
    // Read + parse defensively: if anything goes wrong (file missing,
    // permission denied, malformed content) we return an empty Set so
    // the codegen degrades gracefully to `unknown` for every command.
    // Better to lose typing on some commands than to fail codegen entirely.
    const parseResult = yield* Effect.gen(function* () {
      const exists = yield* fs.exists(typesPath);
      if (!exists) return new Set<string>();
      const raw = yield* fs.readFileString(typesPath);

      const names = new Set<string>();
      const nsStack: string[] = [];
      let depth = 0;
      let i = 0;

      while (i < raw.length) {
        const c = raw[i];
        if (c === undefined) break;

        // Skip string literals (single, double, backtick).
        if (c === '"' || c === "'" || c === "`") {
          const quote = c;
          i++;
          while (i < raw.length) {
            const ch = raw[i];
            if (ch === undefined || ch === quote) break;
            if (ch === "\\") i++;
            i++;
          }
          i++;
          continue;
        }

        // Skip line comments.
        if (c === "/" && raw[i + 1] === "/") {
          while (i < raw.length && raw[i] !== "\n") i++;
          continue;
        }
        // Skip block comments.
        if (c === "/" && raw[i + 1] === "*") {
          i += 2;
          while (i < raw.length && !(raw[i] === "*" && raw[i + 1] === "/")) i++;
          i += 2;
          continue;
        }

        if (c === "{") {
          // Look backwards for the keyword preceding this brace. The file
          // has irregular whitespace, so scan a generous window.
          const before = raw.slice(Math.max(0, i - 200), i);
          const nsMatch = before.match(/export\s+namespace\s+(\w+)\s*$/);
          const ifcMatch = before.match(/export\s+interface\s+(\w+)\s*$/);
          if (nsMatch) {
            const nsName = nsMatch[1];
            if (nsName !== undefined) nsStack.push(nsName);
          } else if (ifcMatch) {
            // nsStack[0] is the outer "Protocol" namespace; we want the
            // inner domain name (e.g. "Page") to match the
            // `Protocol.Domain.Type` shape our generator emits. Skip index 0.
            const ifcName = ifcMatch[1];
            const domainPath = nsStack.slice(1).join(".");
            if (ifcName !== undefined && domainPath !== "") {
              names.add(`${domainPath}.${ifcName}`);
            }
          }
          depth++;
        } else if (c === "}") {
          depth--;
          // Each open namespace contributes 1 to depth. When depth drops
          // back to the pre-namespace level, we've exited that namespace.
          if (depth === nsStack.length - 1) {
            nsStack.pop();
          }
        }

        i++;
      }

      return names;
    }).pipe(Effect.orElseSucceed(() => new Set<string>()));

    return parseResult;
  });

const loadDomains = (file: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const protocolDir = path.join(process.cwd(), "node_modules", "devtools-protocol", "json");
    const filePath = path.join(protocolDir, file);

    const raw = yield* fs
      .readFileString(filePath)
      .pipe(Effect.mapError((cause) => new ProtocolReadError({ file: filePath, cause })));

    const parsed = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(ProtocolJson))(raw).pipe(
      Effect.mapError((cause) => new ProtocolParseError({ file: filePath, cause })),
    );

    return parsed.domains ?? [];
  });

const mergeDomains = (a: readonly DomainDef[], b: readonly DomainDef[]): DomainDef[] => {
  const map = new Map<string, DomainDef>();
  for (const d of b) map.set(d.domain, d);
  for (const d of a) map.set(d.domain, d);
  return [...map.values()];
};

// =============================================================================
// Code Generation Helpers
// =============================================================================

const HEADER = `// AUTO-GENERATED by scripts/browser-cdp/generate-protocol.ts — DO NOT EDIT
//
// Type-only Effect-ified CDP protocol interface.
// References Protocol.* from devtools-protocol — no runtime code emitted.

import type { CdpCommandError, CdpConnectionError, CdpTimeoutError } from "./CdpProtocolError.js";
import type { Protocol } from "devtools-protocol";
import type { Effect } from "effect";

type CdpProtocolError = CdpTimeoutError | CdpCommandError | CdpConnectionError;
`;

const tsDoc = (text: string | undefined, indent: string): string => {
  if (!text) return "";
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (Arr.isReadonlyArrayEmpty(lines)) return "";
  if (lines.length === 1) return `${indent}/** ${lines[0]} */\n`;
  return `${indent}/**\n${lines.map((l) => `${indent} * ${l}`).join("\n")}\n${indent} */\n`;
};

const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

// =============================================================================
// Domain Interface Emitter
// =============================================================================

const emitDomain = (
  domain: DomainDef,
  exportedTypes: ReadonlySet<string>,
): { text: string; skipped: readonly { command: string; reason: string }[] } => {
  const name = domain.domain;
  const commands = domain.commands ?? [];
  const lines: string[] = [];
  const skipped: { command: string; reason: string }[] = [];

  lines.push(`export interface Cdp${name}Api {`);

  for (const cmd of commands) {
    const hasParams = cmd.parameters && Arr.isReadonlyArrayNonEmpty(cmd.parameters);
    const hasReturns = cmd.returns && Arr.isReadonlyArrayNonEmpty(cmd.returns);

    const requestTypeName = capitalize(cmd.name) + "Request";
    const responseTypeName = capitalize(cmd.name) + "Response";

    const hasRequestType = !hasParams || exportedTypes.has(`${name}.${requestTypeName}`);
    const hasResponseType = !hasReturns || exportedTypes.has(`${name}.${responseTypeName}`);

    // When upstream renames or removes a Request/Response interface, drop
    // the command entirely rather than emitting `unknown`. Skipping makes
    // the call site a compile error, forcing an explicit migration at
    // the use site instead of silently losing typing. Deprecated and
    // experimental commands are kept (they still work in current Chrome
    // and removing them would force a sweep across the codebase).
    if (hasParams && !hasRequestType) {
      skipped.push({ command: cmd.name, reason: "request-type-missing" });
      continue;
    }
    if (hasReturns && !hasResponseType) {
      skipped.push({ command: cmd.name, reason: "response-type-missing" });
      continue;
    }

    const doc = tsDoc(cmd.description, "  ");

    const paramsType = hasParams ? `Protocol.${name}.${requestTypeName}` : `Record<string, never>`;

    const returnType = hasReturns ? `Protocol.${name}.${responseTypeName}` : "void";

    lines.push(
      `${doc}  readonly ${cmd.name}: (${hasParams ? `params: ${paramsType}` : "params?: Record<string, never>"}, sessionId?: string) => Effect.Effect<${returnType}, CdpProtocolError>;`,
    );
  }

  lines.push("}");
  return { text: lines.join("\n"), skipped };
};

// =============================================================================
// Combined Protocol Emitter
// =============================================================================

const emitProtocol = (domains: readonly DomainDef[]): string => {
  const lines: string[] = [];
  lines.push("export interface CdpProtocol {");
  for (const d of domains) {
    lines.push(`  readonly ${d.domain}: Cdp${d.domain}Api;`);
  }
  lines.push("}");
  return lines.join("\n");
};

// =============================================================================
// Main Program
// =============================================================================

const program = Effect.gen(function* () {
  const path = yield* Path.Path;

  // Load and merge protocol definitions
  const browserDomains = yield* loadDomains("browser_protocol.json");
  const jsDomains = yield* loadDomains("js_protocol.json");
  const domains = sortDomains(mergeDomains(browserDomains, jsDomains));

  // Discover which Protocol.Domain.Type names are actually exported by
  // devtools-protocol/types/protocol.d.ts. When a command's Request or
  // Response interface is missing upstream (renamed or removed between
  // protocol versions), emitDomain skips the command entirely. The new
  // call site then fails to compile, forcing an explicit migration
  // decision instead of silently emitting `unknown`.
  const exportedTypes = yield* loadExportedTypes();

  // Build output content
  const parts: string[] = [HEADER, ""];
  const allSkipped: { domain: string; command: string; reason: string }[] = [];

  for (const domain of domains) {
    const { text, skipped } = emitDomain(domain, exportedTypes);
    parts.push(text);
    parts.push("");
    for (const s of skipped) allSkipped.push({ domain: domain.domain, ...s });
  }

  parts.push(emitProtocol(domains));

  // Ensure single trailing newline
  const content = parts.join("\n").replace(/\n+$/, "\n");

  // Write output
  const outPath = path.join(
    process.cwd(),
    "packages",
    "browser-cdp",
    "src",
    "internal",
    "CdpProtocol.ts",
  );
  const fs = yield* FileSystem.FileSystem;

  yield* fs
    .writeFileString(outPath, content)
    .pipe(Effect.mapError((cause) => new ProtocolWriteError({ path: outPath, cause })));

  // Report results
  const commandCount = domains.reduce((a, d) => a + (d.commands?.length ?? 0), 0);
  yield* Console.log(`Generated: packages/browser-cdp/src/internal/CdpProtocol.ts`);
  yield* Console.log(
    `  ${domains.length} domains, ${commandCount} source commands, ${commandCount - allSkipped.length} emitted`,
  );
  if (Arr.isReadonlyArrayNonEmpty(allSkipped)) {
    yield* Console.log(`  ${allSkipped.length} command(s) skipped (upstream type drift):`);
    for (const s of allSkipped) {
      yield* Console.log(`    - ${s.domain}.${s.command} (${s.reason})`);
    }
  }
});

// =============================================================================
// CLI Entry Point
// =============================================================================

// Only run when executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  program.pipe(Effect.provide(NodeServices.layer), Effect.runPromise).catch(() => process.exit(1));
}
