#!/usr/bin/env node

import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import net from 'node:net';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(__dirname, '..', '..');
const stateRoot = await mkdtemp(join(tmpdir(), 'paperclip-agent-companies-plugin-e2e-'));
const paperclipHome = join(stateRoot, 'paperclip-home');
const dataDir = join(stateRoot, 'paperclip-data');
const instanceId = 'paperclip-agent-companies-plugin-e2e';
const pluginDisplayName = 'Agent Companies Plugin';
const settingsIndexPath = '/instance/settings/plugins';
const settingsPageHeading = 'Repository Sources';
const requestedPort = process.env.PAPERCLIP_E2E_PORT ? Number(process.env.PAPERCLIP_E2E_PORT) : 3100;
const requestedDbPort = process.env.PAPERCLIP_E2E_DB_PORT ? Number(process.env.PAPERCLIP_E2E_DB_PORT) : 54329;
const defaultTimeoutMs = 30000;
const env = {
  ...process.env,
  CI: 'true',
  BROWSER: 'none',
  DO_NOT_TRACK: '1',
  PAPERCLIP_OPEN_ON_LISTEN: 'false',
  PAPERCLIP_TELEMETRY_DISABLED: '1',
  PAPERCLIP_HOME: paperclipHome,
  PAPERCLIP_INSTANCE_ID: instanceId,
  FORCE_COLOR: '0'
};

let serverProcess;
let cleanedUp = false;
let baseUrl;
let serverPort;
let embeddedDbPort;

function log(message) {
  console.log(`[paperclip-agent-companies-plugin:e2e] ${message}`);
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function oklabToSrgb(lightness, a, b) {
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;

  return [
    clamp01(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    clamp01(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    clamp01(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)
  ];
}

function parseCssColor(input) {
  const value = input.trim().toLowerCase();
  const rgbMatch = value.match(/^rgba?\(([^)]+)\)$/);
  if (rgbMatch) {
    const channels = rgbMatch[1]
      .split(/[,\s/]+/)
      .filter(Boolean)
      .slice(0, 3)
      .map((channel) => Number(channel.replace('%', '')));

    if (channels.length < 3 || channels.some((channel) => Number.isNaN(channel))) {
      throw new Error(`Could not parse RGB color from "${input}".`);
    }

    return channels.map((channel) => channel / 255);
  }

  const oklabMatch = value.match(/^oklab\(([^)]+)\)$/);
  if (oklabMatch) {
    const channels = oklabMatch[1]
      .split(/[,\s/]+/)
      .filter(Boolean)
      .slice(0, 3)
      .map((channel) => Number(channel));

    if (channels.length < 3 || channels.some((channel) => Number.isNaN(channel))) {
      throw new Error(`Could not parse OKLab color from "${input}".`);
    }

    return oklabToSrgb(channels[0], channels[1], channels[2]);
  }

  const oklchMatch = value.match(/^oklch\(([^)]+)\)$/);
  if (oklchMatch) {
    const channels = oklchMatch[1]
      .split(/[,\s/]+/)
      .filter(Boolean)
      .slice(0, 3);

    if (channels.length < 3) {
      throw new Error(`Could not parse OKLCH color from "${input}".`);
    }

    const lightness = Number(channels[0]);
    const chroma = Number(channels[1]);
    const hue = Number(channels[2].replace('deg', ''));
    if ([lightness, chroma, hue].some((channel) => Number.isNaN(channel))) {
      throw new Error(`Could not parse OKLCH color from "${input}".`);
    }

    const hueInRadians = (hue * Math.PI) / 180;
    return oklabToSrgb(lightness, chroma * Math.cos(hueInRadians), chroma * Math.sin(hueInRadians));
  }

  throw new Error(`Unsupported CSS color format "${input}".`);
}

function linearizeChannel(value) {
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance([red, green, blue]) {
  return (
    0.2126 * linearizeChannel(red) +
    0.7152 * linearizeChannel(green) +
    0.0722 * linearizeChannel(blue)
  );
}

function contrastRatio(foreground, background) {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);

  return (lighter + 0.05) / (darker + 0.05);
}

function getPaperclipCommandArgs(args) {
  return ['-p', 'node@20', '-p', 'paperclipai', 'paperclipai', ...args];
}

function runCommand(command, args, options = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: pluginRoot,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });

    child.stderr?.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });

    child.on('error', rejectPromise);
    child.on('close', (code) => {
      if (code === 0) {
        resolvePromise({ stdout, stderr });
        return;
      }

      rejectPromise(new Error(`${command} ${args.join(' ')} exited with code ${code}\n${stdout}\n${stderr}`));
    });
  });
}

function tryListen(port) {
  return new Promise((resolvePromise, rejectPromise) => {
    const server = net.createServer();
    server.unref();
    server.on('error', rejectPromise);
    server.listen(port, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => rejectPromise(new Error('Could not resolve a free TCP port.')));
        return;
      }

      const selectedPort = address.port;
      server.close((error) => {
        if (error) {
          rejectPromise(error);
          return;
        }
        resolvePromise(selectedPort);
      });
    });
  });
}

async function findAvailablePort(startPort) {
  try {
    return await tryListen(startPort);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('EADDRINUSE')) {
      throw error;
    }

    return tryListen(0);
  }
}

async function readConfiguredBaseUrl(configPath) {
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  const port = Number(config?.server?.port ?? serverPort);
  return `http://127.0.0.1:${port}`;
}

async function fetchJson(url, init = {}) {
  const response = await fetch(url, {
    headers: {
      'content-type': 'application/json',
      ...(init.headers ?? {})
    },
    ...init
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText} ${text}`);
  }

  return body;
}

async function ensureConfigFile(configPath) {
  await mkdir(dirname(configPath), { recursive: true });
  await mkdir(join(dataDir, 'logs'), { recursive: true });
  await mkdir(join(dataDir, 'storage'), { recursive: true });
  await mkdir(join(dataDir, 'backups'), { recursive: true });

  const config = {
    $meta: {
      version: 1,
      updatedAt: new Date().toISOString(),
      source: 'doctor'
    },
    database: {
      mode: 'embedded-postgres',
      embeddedPostgresDataDir: join(dataDir, 'db'),
      embeddedPostgresPort: embeddedDbPort,
      backup: {
        enabled: true,
        intervalMinutes: 60,
        retentionDays: 30,
        dir: join(dataDir, 'backups')
      }
    },
    logging: {
      mode: 'file',
      logDir: join(dataDir, 'logs')
    },
    server: {
      deploymentMode: 'local_trusted',
      exposure: 'private',
      host: '127.0.0.1',
      port: serverPort,
      serveUi: true,
      allowedHostnames: []
    },
    telemetry: {
      enabled: false
    },
    auth: {
      baseUrlMode: 'auto',
      disableSignUp: false
    },
    storage: {
      provider: 'local_disk',
      localDisk: {
        baseDir: join(dataDir, 'storage')
      },
      s3: {
        bucket: 'paperclip-e2e-placeholder',
        region: 'us-east-1',
        prefix: 'paperclip-e2e',
        forcePathStyle: false
      }
    },
    secrets: {
      provider: 'local_encrypted',
      strictMode: false,
      localEncrypted: {
        keyFilePath: join(dataDir, 'secrets', 'master.key')
      }
    }
  };

  await writeFile(configPath, JSON.stringify(config, null, 2));
}

async function waitForReady(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  const healthUrl = new URL('/api/health', url).toString();

  while (Date.now() < deadline) {
    if (serverProcess?.exitCode !== null && serverProcess?.exitCode !== undefined) {
      throw new Error(`Paperclip exited early with code ${serverProcess.exitCode}.`);
    }

    try {
      const response = await fetch(healthUrl);
      if (response.ok) {
        return;
      }
    } catch {
      // keep polling until timeout
    }

    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1000));
  }

  throw new Error(`Timed out waiting for Paperclip at ${healthUrl}`);
}

async function createFixtureRepository() {
  const repositoryRoot = await mkdtemp(join(stateRoot, 'company-details-fixture-'));
  const longMarkdownBody = Array.from({ length: 48 }, (_, index) => `### Review checkpoint ${index + 1}

- Confirm the repository layout
- Verify the import manifests
- Keep the preview pane scrollable without moving the whole dialog
`).join('\n');

  await mkdir(join(repositoryRoot, 'agents', 'ceo'), { recursive: true });
  await mkdir(join(repositoryRoot, 'skills', 'repo-audit'), { recursive: true });
  await mkdir(join(repositoryRoot, 'projects', 'first-import', 'tasks', 'scope-catalog'), {
    recursive: true
  });
  await mkdir(join(repositoryRoot, 'issues', 'follow-up-review'), { recursive: true });

  await writeFile(
    join(repositoryRoot, 'COMPANY.md'),
    `---
name: Modal Demo Company
description: Disposable fixture used to verify the company contents modal.
slug: modal-demo-company
schema: agentcompanies/v1
version: 1.0.0
---

Fixture company for Paperclip smoke verification.
`
  );
  await writeFile(
    join(repositoryRoot, 'agents', 'ceo', 'AGENTS.md'),
    `---
name: CEO
title: Chief Executive Officer
metadata:
  paperclip:
    agentIcon: crown
---

Lead the import effort and coordinate the team.
`
  );
  await writeFile(
    join(repositoryRoot, 'skills', 'repo-audit', 'SKILL.md'),
    `---
name: Repo Audit
description: Validate the repository before import.
---

## Review goals

- Confirm the repository layout
- Verify the import manifests

${longMarkdownBody}
`
  );
  await writeFile(
    join(repositoryRoot, 'projects', 'first-import', 'PROJECT.md'),
    `---
name: First Import
description: Prepare the first import project.
---

Set up the first end-to-end import project.
`
  );
  await writeFile(
    join(repositoryRoot, 'projects', 'first-import', 'tasks', 'scope-catalog', 'TASK.md'),
    `---
name: Scope Catalog
---

Define the first catalog scope and its acceptance criteria.
`
  );
  await writeFile(
    join(repositoryRoot, 'issues', 'follow-up-review', 'ISSUE.md'),
    `---
name: Follow-up Review
---

Review the import results after the initial run.
`
  );

  await runCommand('git', ['init'], { cwd: repositoryRoot });
  await runCommand('git', ['config', 'user.name', 'Codex E2E'], { cwd: repositoryRoot });
  await runCommand('git', ['config', 'user.email', 'codex@example.com'], { cwd: repositoryRoot });
  await runCommand('git', ['add', '.'], { cwd: repositoryRoot });
  await runCommand('git', ['commit', '-m', 'Initial fixture'], { cwd: repositoryRoot });

  return repositoryRoot;
}

async function setFixtureRepositoryVersion(repositoryRoot, version) {
  await writeFile(
    join(repositoryRoot, 'COMPANY.md'),
    `---
name: Modal Demo Company
description: Disposable fixture used to verify the company contents modal.
slug: modal-demo-company
schema: agentcompanies/v1
version: ${version}
---

Fixture company for Paperclip smoke verification.
`
  );
}

async function ensureCompaniesSeeded(minimumCount = 2) {
  const companiesUrl = new URL('/api/companies', baseUrl).toString();
  const existingCompanies = await fetchJson(companiesUrl);
  const companies = Array.isArray(existingCompanies) ? [...existingCompanies] : [];
  if (companies.length >= minimumCount) {
    log(`Found ${companies.length} existing companies; onboarding should be skipped.`);
    return companies;
  }

  const missingCount = minimumCount - companies.length;
  for (let index = 0; index < missingCount; index += 1) {
    const ordinal = companies.length + 1;
    const createdCompany = await fetchJson(companiesUrl, {
      method: 'POST',
      body: JSON.stringify({
        name: `Dummy Company ${ordinal}`,
        description: `Seed company ${ordinal} for paperclip-agent-companies-plugin e2e verification.`
      })
    });
    companies.push(createdCompany);
  }

  const postCreateCompanies = await fetchJson(companiesUrl);
  if (!Array.isArray(postCreateCompanies) || postCreateCompanies.length < minimumCount) {
    throw new Error(`Expected at least ${minimumCount} companies after seeding, but Paperclip still reports ${Array.isArray(postCreateCompanies) ? postCreateCompanies.length : 0}.`);
  }

  log(`Seeded companies through ${postCreateCompanies[minimumCount - 1]?.name ?? 'unknown'}.`);
  return postCreateCompanies;
}

async function waitForServerExit(timeoutMs) {
  if (!serverProcess) {
    return;
  }

  if (serverProcess.exitCode !== null) {
    return;
  }

  await new Promise((resolvePromise) => {
    let settled = false;
    const finish = () => {
      if (!settled) {
        settled = true;
        resolvePromise(undefined);
      }
    };

    serverProcess.once('close', finish);
    setTimeout(finish, timeoutMs);
  });
}

async function cleanup() {
  if (cleanedUp) {
    return;
  }

  cleanedUp = true;

  if (serverProcess) {
    if (serverProcess.exitCode === null && !serverProcess.killed) {
      serverProcess.kill('SIGINT');
      await waitForServerExit(5000);
    }

    if (serverProcess.exitCode === null && !serverProcess.killed) {
      serverProcess.kill('SIGKILL');
      await waitForServerExit(5000);
    }
  }

  await rm(stateRoot, { recursive: true, force: true });
}

async function gotoWithTimeout(page, url) {
  return page.goto(url, {
    waitUntil: 'domcontentloaded',
    timeout: defaultTimeoutMs
  });
}

async function main() {
  process.on('SIGINT', () => {
    void cleanup().finally(() => process.exit(130));
  });
  process.on('SIGTERM', () => {
    void cleanup().finally(() => process.exit(143));
  });

  log(`Working directory ${stateRoot}`);

  serverPort = await findAvailablePort(requestedPort);
  embeddedDbPort = await findAvailablePort(requestedDbPort);
  const configPath = join(paperclipHome, 'instances', instanceId, 'config.json');
  env.PAPERCLIP_CONFIG_PATH = configPath;
  await ensureConfigFile(configPath);
  baseUrl = await readConfiguredBaseUrl(configPath);

  serverProcess = spawn('npx', getPaperclipCommandArgs(['run', '--config', configPath, '--data-dir', dataDir]), {
    cwd: pluginRoot,
    env,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  serverProcess.unref();

  serverProcess.stdout?.on('data', (chunk) => {
    process.stdout.write(chunk.toString());
  });
  serverProcess.stderr?.on('data', (chunk) => {
    process.stderr.write(chunk.toString());
  });
  serverProcess.on('error', (error) => {
    console.error(error);
  });

  await waitForReady(baseUrl, 180000);
  log(`Paperclip server is ready at ${baseUrl}.`);

  const seededCompanies = await ensureCompaniesSeeded(2);
  const fixtureRepository = await createFixtureRepository();
  log(`Created local fixture repository at ${fixtureRepository}.`);

  await runCommand(
    'npx',
    getPaperclipCommandArgs(['plugin', 'install', '--local', pluginRoot, '--data-dir', dataDir, '--config', configPath])
  );
  log('Installed local paperclip-agent-companies-plugin plugin.');

  const settingsIndexUrl = new URL(settingsIndexPath, baseUrl).toString();

  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(defaultTimeoutMs);
  const consoleMessages = [];
  const pageErrors = [];

  page.on('console', (message) => {
    consoleMessages.push({
      type: message.type(),
      text: message.text()
    });
  });
  page.on('pageerror', (error) => {
    pageErrors.push(error instanceof Error ? error.stack ?? error.message : String(error));
  });

  try {
    await gotoWithTimeout(page, settingsIndexUrl);
    log(`Opened installed plugins page: ${settingsIndexUrl}`);

    const pluginEntry = page.getByText(pluginDisplayName, { exact: true }).first();
    await pluginEntry.waitFor({ timeout: 120000 });
    await pluginEntry.click();

    await page.getByText(settingsPageHeading, { exact: true }).first().waitFor({ timeout: 120000 });
    await page.locator('[data-testid="catalog-page"]').waitFor({ timeout: 120000 });

    const repositoryInput = page.locator('#agent-companies-repository-input');
    const addRepositoryButton = page.getByRole('button', { name: 'Add repository' });
    await repositoryInput.waitFor({ timeout: 120000 });
    await addRepositoryButton.waitFor({ timeout: 120000 });
    const addRepositoryButtonStyle = await addRepositoryButton.evaluate((node) => {
      const style = getComputedStyle(node);
      const probe = document.createElement('div');
      probe.style.display = 'none';
      document.body.appendChild(probe);
      probe.style.color = style.color;
      const normalizedColor = getComputedStyle(probe).color;
      probe.style.color = style.backgroundColor;
      const normalizedBackgroundColor = getComputedStyle(probe).color;
      probe.remove();

      return {
        backgroundColor: normalizedBackgroundColor,
        color: normalizedColor,
        rawBackgroundColor: style.backgroundColor,
        rawColor: style.color
      };
    });
    const addRepositoryContrast = contrastRatio(
      parseCssColor(addRepositoryButtonStyle.color),
      parseCssColor(addRepositoryButtonStyle.backgroundColor)
    );
    if (addRepositoryContrast < 4.5) {
      throw new Error(
        `Expected Add repository button contrast >= 4.5, received ${addRepositoryContrast.toFixed(2)} (raw text ${addRepositoryButtonStyle.rawColor}, raw background ${addRepositoryButtonStyle.rawBackgroundColor}).`
      );
    }

    await repositoryInput.fill(fixtureRepository);
    await addRepositoryButton.click();

    const fixtureCompanyCard = page.locator('[data-testid="company-card"]').filter({
      hasText: 'Modal Demo Company'
    });
    await fixtureCompanyCard.first().waitFor({ timeout: 120000 });
    const importTargetCompany = seededCompanies.find((company) => company?.name === 'Dummy Company 2') ?? seededCompanies[1];
    if (!importTargetCompany?.id || !importTargetCompany?.name) {
      throw new Error('Expected a second seeded company to exist for the Import into... smoke flow.');
    }
    const selectedContentsSummary =
      'Selected contents: Agents: all 1 selected • Projects: all 1 selected • Tasks: all 1 selected • Issues: excluded • Skills: all 1 selected';
    const syncContractSummary =
      'Sync contract: Agents: all 1 selected • Projects: all 1 selected • Tasks: all 1 selected • Issues: excluded • Skills: all 1 selected';

    const importAsNewButton = fixtureCompanyCard.locator('[data-testid="company-import-new-trigger"]');
    await importAsNewButton.waitFor({ timeout: 120000 });
    const importAsNewLabel = (await importAsNewButton.textContent())?.trim() ?? '';
    if (importAsNewLabel !== 'Import as new company') {
      throw new Error(
        `Expected discovered company to show "Import as new company", received "${importAsNewLabel}".`
      );
    }

    const importIntoTrigger = fixtureCompanyCard.locator('[data-testid="company-import-existing-trigger"]');
    await importIntoTrigger.waitFor({ timeout: 120000 });
    const importIntoLabel = (await importIntoTrigger.textContent())?.trim() ?? '';
    if (importIntoLabel !== 'Import into...') {
      throw new Error(
        `Expected discovered company to show "Import into...", received "${importIntoLabel}".`
      );
    }

    await importIntoTrigger.click();
    await page
      .locator('[data-testid="company-import-target-option"]')
      .filter({ hasText: importTargetCompany.name })
      .click();

    const importModal = page.locator('[data-testid="company-import-modal"]');
    await importModal.waitFor({ timeout: 120000 });
    await importModal.getByText(`Target: ${importTargetCompany.name}`, { exact: false }).waitFor({ timeout: 120000 });
    await importModal.getByLabel(/^Issues/u).uncheck();
    await importModal.getByText(selectedContentsSummary, { exact: false }).waitFor({ timeout: 120000 });
    await importModal.locator('[data-testid="company-import-submit"]').click();

    await page.getByText('Company imported', { exact: true }).waitFor({ timeout: 120000 });
    await page
      .getByText(`Imported "Modal Demo Company" into "${importTargetCompany.name}"`, { exact: false })
      .waitFor({ timeout: 120000 });
    await page.getByText(selectedContentsSummary, { exact: false }).waitFor({ timeout: 120000 });

    const companiesAfterImport = await fetchJson(new URL('/api/companies', baseUrl).toString());
    const importedCompany = Array.isArray(companiesAfterImport)
      ? companiesAfterImport.find((company) => company?.id === importTargetCompany.id) ?? null
      : null;
    if (!importedCompany) {
      throw new Error(`Expected imported company "${importTargetCompany.name}" to still exist after import.`);
    }

    const openDashboardLink = page.locator('[data-testid="import-success-dashboard-link"]');
    await openDashboardLink.waitFor({ timeout: 120000 });
    const openDashboardHref = await openDashboardLink.getAttribute('href');
    if (openDashboardHref !== `/${importedCompany.issuePrefix}/dashboard`) {
      throw new Error(
        `Expected imported dashboard link to target /${importedCompany.issuePrefix}/dashboard, received ${openDashboardHref ?? 'null'}.`
      );
    }

    const importedCompanyCard = page.locator('[data-testid="imported-company-card"]').filter({
      hasText: importTargetCompany.name
    });
    await importedCompanyCard.first().waitFor({ timeout: 120000 });
    await importedCompanyCard.getByText(syncContractSummary, { exact: false }).waitFor({ timeout: 120000 });

    await importIntoTrigger.click();
    const remainingImportTargets = page.locator('[data-testid="company-import-target-option"]');
    await remainingImportTargets.first().waitFor({ timeout: 120000 });
    const remainingImportTargetTexts = await remainingImportTargets.allTextContents();
    if (remainingImportTargetTexts.some((text) => text.includes(importTargetCompany.name))) {
      throw new Error(`Expected synced company "${importTargetCompany.name}" to be removed from Import into... options.`);
    }

    const syncTrigger = importedCompanyCard.locator('[data-testid="company-sync-trigger"]');
    await syncTrigger.waitFor({ timeout: 120000 });
    const syncLabel = (await syncTrigger.textContent())?.trim() ?? '';
    const syncDisabled = await syncTrigger.isDisabled();
    if (syncLabel !== 'Up to date' || !syncDisabled) {
      throw new Error(
        `Expected imported company action to become a disabled "Up to date" button, received "${syncLabel}" (disabled=${syncDisabled}).`
      );
    }

    const autoSyncToggle = importedCompanyCard.locator('[data-testid="company-auto-sync-toggle"]');
    await autoSyncToggle.waitFor({ timeout: 120000 });
    const autoSyncEnabled = await autoSyncToggle.isChecked();
    if (!autoSyncEnabled) {
      throw new Error('Expected imported company auto-sync to be enabled by default.');
    }

    await setFixtureRepositoryVersion(fixtureRepository, '1.1.0');
    await page.locator('[data-testid="repo-card"]').filter({ hasText: fixtureRepository }).getByRole('button', {
      name: 'Rescan'
    }).click();

    await page.waitForFunction(
      (button) =>
        button instanceof HTMLButtonElement &&
        button.textContent?.trim() === 'Sync now' &&
        button.disabled === false,
      await syncTrigger.elementHandle(),
      { timeout: 120000 }
    );

    await syncTrigger.click();
    await page.getByText('Company synced', { exact: true }).waitFor({ timeout: 120000 });
    await page
      .getByText(`Synced "Modal Demo Company" into "${importTargetCompany.name}"`, { exact: false })
      .waitFor({ timeout: 120000 });
    await page.getByText(selectedContentsSummary, { exact: false }).waitFor({ timeout: 120000 });

    await importedCompanyCard.getByRole('button', { name: 'View source contents' }).click();

    const detailsModal = page.locator('[data-testid="company-details-modal"]');
    await detailsModal.waitFor({ timeout: 120000 });
    const detailsDialog = detailsModal.locator('[data-testid="company-details-dialog"]');
    const detailsPreview = detailsModal.locator('[data-testid="company-details-preview"]');
    const detailsPreviewBody = detailsModal.locator('[data-testid="company-details-preview-body"]');
    const detailsNav = detailsModal.locator('[data-testid="company-details-nav"]');

    await detailsModal.getByText('Modal Demo Company', { exact: true }).waitFor({ timeout: 120000 });
    await detailsNav
      .locator('[data-testid="company-details-item-icon"][data-icon-name="crown"]')
      .first()
      .waitFor({ timeout: 120000 });
    await detailsPreview.getByRole('heading', { name: 'CEO', exact: true }).waitFor({ timeout: 120000 });
    await detailsPreview.getByText('Lead the import effort and coordinate the team.', { exact: true }).waitFor({ timeout: 120000 });

    await detailsNav.getByRole('button', { name: /Repo Audit/i }).click();
    await detailsPreview.getByRole('heading', { name: 'Repo Audit', exact: true }).waitFor({ timeout: 120000 });
    await detailsPreview.getByText('Review goals', { exact: true }).waitFor({ timeout: 120000 });
    await detailsPreview.getByRole('heading', { name: 'Review checkpoint 48', exact: true }).waitFor({
      timeout: 120000
    });

    await page.waitForFunction(
      (previewBody) => previewBody instanceof HTMLElement && previewBody.scrollHeight > previewBody.clientHeight,
      await detailsPreviewBody.elementHandle(),
      { timeout: 120000 }
    );
    await detailsPreviewBody.evaluate((node) => {
      node.scrollTop = 220;
    });

    const scrollState = await Promise.all([
      detailsDialog.evaluate((node) => ({
        overflowY: getComputedStyle(node).overflowY,
        scrollTop: node.scrollTop
      })),
      detailsPreviewBody.evaluate((node) => ({
        overflowY: getComputedStyle(node).overflowY,
        scrollTop: node.scrollTop
      }))
    ]);
    const [dialogScrollState, previewScrollState] = scrollState;

    if (dialogScrollState.overflowY !== 'hidden') {
      throw new Error(`Expected fixed dialog shell overflow, received ${dialogScrollState.overflowY}.`);
    }

    if (previewScrollState.overflowY !== 'auto') {
      throw new Error(`Expected preview body overflow:auto, received ${previewScrollState.overflowY}.`);
    }

    if (dialogScrollState.scrollTop !== 0) {
      throw new Error(`Expected dialog shell to stay fixed, received scrollTop=${dialogScrollState.scrollTop}.`);
    }

    if (previewScrollState.scrollTop < 180) {
      throw new Error(`Expected preview body to scroll independently, received scrollTop=${previewScrollState.scrollTop}.`);
    }
  } finally {
    await mkdir(join(pluginRoot, 'tests/e2e/results'), { recursive: true });
    await page.screenshot({ path: join(pluginRoot, 'tests/e2e/results/last-run.png'), fullPage: true });
    const bodyText = await page.locator('body').textContent();
    await writeFile(
      join(pluginRoot, 'tests/e2e/results/last-run.json'),
      JSON.stringify(
        {
          baseUrl,
          settingsIndexUrl,
          finalUrl: page.url(),
          bodyText,
          consoleMessages,
          pageErrors
        },
        null,
        2
      )
    );
    await browser.close();
  }

  await cleanup();
}

try {
  await main();
} catch (error) {
  await cleanup();
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
}
