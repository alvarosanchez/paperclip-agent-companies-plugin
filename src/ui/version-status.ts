import { isCatalogCompanySyncAvailable } from "../catalog.js";

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
  const newerVersionAvailable = isCatalogCompanySyncAvailable(importedVersion, latestVersion);

  return {
    importedBadgeText: importedVersion ? `Imported v${importedVersion}` : null,
    latestBadgeText:
      latestVersion && (!importedVersion || newerVersionAvailable)
        ? `${importedVersion ? "Latest" : "Source"} v${latestVersion}`
        : null,
    summaryText:
      importedVersion && latestVersion && newerVersionAvailable
        ? `Imported from v${importedVersion}; source now at v${latestVersion}`
        : importedVersion
          ? `Imported from v${importedVersion}`
          : latestVersion
            ? `Source at v${latestVersion}`
            : null
  };
}
