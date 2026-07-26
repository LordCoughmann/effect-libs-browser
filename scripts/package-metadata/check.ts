import * as Arr from "effect/Array";
import * as Predicate from "effect/Predicate";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

type DependencyField =
  | "dependencies"
  | "devDependencies"
  | "optionalDependencies"
  | "peerDependencies";

type PackageManifest = {
  readonly name: string;
  readonly version: string;
  readonly [field: string]: unknown;
};

const SOURCE_FIELDS: readonly DependencyField[] = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
];

const PUBLISHED_FIELDS: readonly DependencyField[] = [
  "dependencies",
  "optionalDependencies",
  "peerDependencies",
];

const repoRoot = process.cwd();
const packagesRoot = join(repoRoot, "packages");

const readManifest = (path: string): PackageManifest =>
  JSON.parse(readFileSync(path, "utf8")) as PackageManifest;

const readWorkspaceManifests = (): readonly PackageManifest[] =>
  readdirSync(packagesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(packagesRoot, entry.name, "package.json"))
    .filter(existsSync)
    .map(readManifest);

const dependenciesFor = (
  manifest: PackageManifest,
  field: DependencyField,
): Readonly<Record<string, string>> => {
  const dependencies = manifest[field];
  if (dependencies === undefined) return {};
  if (!Predicate.isObject(dependencies) || Array.isArray(dependencies)) {
    throw new Error(`${manifest.name}: ${field} must be an object`);
  }
  return dependencies as Record<string, string>;
};

const validateSourceManifests = (
  manifests: readonly PackageManifest[],
  packagesByName: ReadonlyMap<string, PackageManifest>,
): readonly string[] => {
  const errors: string[] = [];
  const versions = new Set(manifests.map((manifest) => manifest.version));

  if (versions.size !== 1) {
    errors.push(`Package versions are not synchronized: ${[...versions].join(", ")}`);
  }

  for (const manifest of manifests) {
    for (const field of SOURCE_FIELDS) {
      for (const [name, range] of Object.entries(dependenciesFor(manifest, field))) {
        if (!name.startsWith("@effect-libs/")) continue;

        const target = packagesByName.get(name);
        if (target === undefined) {
          errors.push(`${manifest.name}: ${field}.${name} does not name a workspace package`);
        } else if (range !== "workspace:*") {
          errors.push(
            `${manifest.name}: ${field}.${name} must use workspace:*, received ${JSON.stringify(range)}`,
          );
        }
      }
    }
  }

  return errors;
};

const packPackage = (packageDirectory: string): PackageManifest => {
  const temporaryDirectory = mkdtempSync(
    join(process.env.TMPDIR ?? process.env.TEMP ?? "/tmp", "effect-libs-pack-"),
  );

  try {
    execFileSync("pnpm", ["pack", "--pack-destination", temporaryDirectory], {
      cwd: packageDirectory,
      stdio: "inherit",
    });

    const tarballs = readdirSync(temporaryDirectory).filter((file) => file.endsWith(".tgz"));
    if (tarballs.length !== 1) {
      throw new Error(`Expected one package tarball, found ${tarballs.length}`);
    }

    return JSON.parse(
      execFileSync("tar", ["-xOf", join(temporaryDirectory, tarballs[0]), "package/package.json"], {
        encoding: "utf8",
      }),
    ) as PackageManifest;
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
};

const validatePackedManifest = (
  manifest: PackageManifest,
  packagesByName: ReadonlyMap<string, PackageManifest>,
): readonly string[] => {
  const errors: string[] = [];

  for (const field of PUBLISHED_FIELDS) {
    for (const [name, range] of Object.entries(dependenciesFor(manifest, field))) {
      if (!name.startsWith("@effect-libs/")) continue;

      const target = packagesByName.get(name);
      if (target === undefined) {
        errors.push(`${manifest.name}: packed ${field}.${name} does not name a workspace package`);
      } else if (range !== target.version) {
        errors.push(
          `${manifest.name}: packed ${field}.${name} must resolve to ${target.version}, received ${JSON.stringify(range)}`,
        );
      }
    }
  }

  return errors;
};

const parsePackedPackageDirectory = (): string | undefined => {
  const [flag, packageDirectory] = process.argv.slice(2);
  if (flag === undefined && packageDirectory === undefined) return undefined;
  if (flag !== "--packed" || packageDirectory === undefined) {
    throw new Error(
      "Usage: pnpm tsx scripts/package-metadata/check.ts [--packed <package-directory>]",
    );
  }
  return resolve(repoRoot, packageDirectory);
};

const main = (): void => {
  const manifests = readWorkspaceManifests();
  const packagesByName = new Map(manifests.map((manifest) => [manifest.name, manifest]));
  const errors = [...validateSourceManifests(manifests, packagesByName)];

  const packedPackageDirectory = parsePackedPackageDirectory();
  if (packedPackageDirectory !== undefined) {
    const packedManifest = packPackage(packedPackageDirectory);
    errors.push(...validatePackedManifest(packedManifest, packagesByName));
  }

  if (Arr.isReadonlyArrayNonEmpty(errors)) {
    for (const error of errors) console.error(`ERROR: ${error}`);
    process.exitCode = 1;
    return;
  }

  const version = manifests[0]?.version ?? "unknown";
  console.log(
    packedPackageDirectory === undefined
      ? `Package metadata valid: synchronized version ${version}`
      : `Package metadata valid: synchronized version ${version}; packed artifact verified`,
  );
};

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
