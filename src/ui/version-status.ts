import { compareCatalogSourceVersions } from "../catalog.js";

export interface ImportedCompanyVersionInfo {
  importedBadgeText: string | null;
  latestBadgeText: string | null;
  summaryText: string | null;
}

function asNonEmptyString(value: string | null | undefined): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function getImportedCompanyVersionInfo(
  importedSourceVersion: string | null,
  latestSourceVersion: string | null
): ImportedCompanyVersionInfo {
  const importedVersion = asNonEmptyString(importedSourceVersion);
  const latestVersion = asNonEmptyString(latestSourceVersion);
  const comparison = compareCatalogSourceVersions(importedVersion, latestVersion);

  return {
    importedBadgeText: importedVersion ? `Imported v${importedVersion}` : null,
    latestBadgeText:
      latestVersion
        && (
          comparison === "missing_imported"
          || comparison === "latest_newer"
          || comparison === "latest_older"
          || comparison === "different_unknown"
        )
        ? `${comparison === "latest_newer" ? "Latest" : "Source"} v${latestVersion}`
        : null,
    summaryText:
      importedVersion && latestVersion && comparison === "latest_newer"
        ? `Imported from v${importedVersion}; source now at v${latestVersion}`
        : importedVersion
          && latestVersion
          && (comparison === "latest_older" || comparison === "different_unknown")
          ? `Imported from v${importedVersion}; source currently reports v${latestVersion}`
        : importedVersion
          ? `Imported from v${importedVersion}`
          : latestVersion
            ? `Source at v${latestVersion}`
            : null
  };
}
