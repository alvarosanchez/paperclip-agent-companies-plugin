#!/usr/bin/env node

import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import net from 'node:net';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(__dirname, '..', '..');
const persistentStateRootInput = process.env.PAPERCLIP_E2E_STATE_DIR?.trim();
const persistentStateRoot = persistentStateRootInput ? resolve(pluginRoot, persistentStateRootInput) : null;
const stateRoot = persistentStateRoot ?? await mkdtemp(join(tmpdir(), 'paperclip-agent-companies-plugin-manual-'));
const paperclipHome = join(stateRoot, 'paperclip-home');
const dataDir = join(stateRoot, 'paperclip-data');
const instanceId = 'paperclip-agent-companies-plugin-manual';
const pluginId = 'paperclip-agent-companies-plugin';
const pluginDisplayName = 'Agent Companies Plugin';
const settingsIndexPath = '/instance/settings/plugins';
const settingsPageHeading = 'Repository Sources';
const defaultRepositoryUrl = 'https://github.com/paperclipai/companies';
const manualVerificationRepositoryUrl = 'https://github.com/alvarosanchez/micronaut-agent-company';
const requestedPort = process.env.PAPERCLIP_E2E_PORT ? Number(process.env.PAPERCLIP_E2E_PORT) : 3100;
const requestedDbPort = process.env.PAPERCLIP_E2E_DB_PORT ? Number(process.env.PAPERCLIP_E2E_DB_PORT) : 54329;
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
let shutdownRequested = false;
let shutdownResolver;
const shutdownPromise = new Promise((resolvePromise) => {
  shutdownResolver = resolvePromise;
});
let baseUrl;
let serverPort;
let embeddedDbPort;

function log(message) {
  console.log(`[paperclip-agent-companies-plugin:manual] ${message}`);
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

function normalizeRepositoryReference(input) {
  const parsedUrl = new URL(input.trim());
  parsedUrl.username = '';
  parsedUrl.password = '';
  parsedUrl.search = '';
  parsedUrl.hash = '';
  parsedUrl.pathname = parsedUrl.pathname.replace(/\/+$/u, '').replace(/\.git$/iu, '');
  return parsedUrl.toString();
}

function createRepositoryId(normalizedUrl) {
  let hash = 2166136261;

  for (let index = 0; index < normalizedUrl.length; index += 1) {
    hash ^= normalizedUrl.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return `repo-${Math.abs(hash >>> 0).toString(16).padStart(8, '0')}`;
}

async function waitForPluginReady(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  const pluginUrl = new URL(`/api/plugins/${encodeURIComponent(pluginId)}`, baseUrl).toString();
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      const plugin = await fetchJson(pluginUrl);
      if (plugin?.status === 'ready') {
        return plugin;
      }

      if (plugin?.status === 'error') {
        throw new Error(`Plugin entered error status: ${plugin.error ?? 'unknown error'}`);
      }
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1000));
  }

  const suffix = lastError instanceof Error ? ` ${lastError.message}` : '';
  throw new Error(`Timed out waiting for plugin ${pluginId} to become ready.${suffix}`);
}

async function invokePluginBridge(kind, key, params = {}) {
  const bridgeUrl = new URL(`/api/plugins/${encodeURIComponent(pluginId)}/bridge/${kind}`, baseUrl).toString();
  const body = await fetchJson(bridgeUrl, {
    method: 'POST',
    body: JSON.stringify({
      key,
      params
    })
  });

  return body?.data ?? null;
}

async function ensureManualVerificationRepositoryConfigured() {
  await waitForPluginReady(120000);

  try {
    await invokePluginBridge('action', 'catalog.add-repository', {
      url: manualVerificationRepositoryUrl
    });
    log(`Added ${manualVerificationRepositoryUrl} to the manual verification catalog.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('That repository has already been added.')) {
      log(`Manual verification catalog already includes ${manualVerificationRepositoryUrl}.`);
    } else {
      throw error;
    }
  }

  try {
    await invokePluginBridge('action', 'catalog.remove-repository', {
      repositoryId: createRepositoryId(normalizeRepositoryReference(defaultRepositoryUrl))
    });
    log(`Removed the default ${defaultRepositoryUrl} source from the manual verification catalog.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('Repository not found.')) {
      log(`Default ${defaultRepositoryUrl} source was already absent from the manual verification catalog.`);
    } else {
      throw error;
    }
  }

  const catalog = await invokePluginBridge('data', 'catalog.read');
  const repositories = Array.isArray(catalog?.repositories) ? catalog.repositories : [];
  const preferredRepositoryPresent = repositories.some(
    (repository) => repository?.normalizedUrl === normalizeRepositoryReference(manualVerificationRepositoryUrl)
  );
  const defaultRepositoryPresent = repositories.some(
    (repository) => repository?.normalizedUrl === normalizeRepositoryReference(defaultRepositoryUrl)
  );

  if (!preferredRepositoryPresent) {
    throw new Error(`Manual verification repository ${manualVerificationRepositoryUrl} was not present after configuration.`);
  }

  if (defaultRepositoryPresent) {
    throw new Error(`Default repository ${defaultRepositoryUrl} is still present after manual verification configuration.`);
  }

  log(`Manual verification catalog is ready with ${manualVerificationRepositoryUrl}.`);
}

async function ensureStateRoot() {
  if (!persistentStateRoot) {
    return;
  }

  await mkdir(stateRoot, { recursive: true, mode: 0o700 });
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
        description: `Seed company ${ordinal} for manual paperclip-agent-companies-plugin verification.`
      })
    });
    companies.push(createdCompany);
  }

  log(`Seeded companies through ${companies[companies.length - 1]?.name ?? 'unknown'}.`);
  return companies;
}

async function ensurePluginInstalled(configPath) {
  try {
    await runCommand(
      'npx',
      getPaperclipCommandArgs(['plugin', 'install', '--local', pluginRoot, '--data-dir', dataDir, '--config', configPath])
    );
    log('Installed local paperclip-agent-companies-plugin plugin.');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('Plugin already installed: paperclip-agent-companies-plugin')) {
      log('Plugin already installed in the manual instance; continuing.');
      return;
    }

    throw error;
  }
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

  if (!persistentStateRoot) {
    await rm(stateRoot, { recursive: true, force: true });
  }
}

async function main() {
  process.on('SIGINT', () => {
    if (shutdownRequested) {
      return;
    }

    shutdownRequested = true;
    void cleanup().finally(() => shutdownResolver());
  });
  process.on('SIGTERM', () => {
    if (shutdownRequested) {
      return;
    }

    shutdownRequested = true;
    void cleanup().finally(() => shutdownResolver());
  });

  await ensureStateRoot();
  log(`${persistentStateRoot ? 'Persistent' : 'Disposable'} working directory ${stateRoot}`);

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

  const companies = await ensureCompaniesSeeded(2);
  await ensurePluginInstalled(configPath);
  await ensureManualVerificationRepositoryConfigured();
  const manualUrl = new URL(settingsIndexPath, baseUrl).toString();
  await runCommand('open', [manualUrl], { stdio: 'ignore' });

  console.log('');
  console.log('Manual verification instance is ready.');
  console.log(`Open: ${manualUrl}`);
  console.log(`Seeded companies: ${companies.map((company) => company?.name ?? 'Unknown company').join(', ')}`);
  console.log(`Plugin: ${pluginDisplayName}`);
  console.log(`State dir: ${stateRoot}`);
  console.log(`Logs dir: ${join(dataDir, 'logs')}`);
  if (persistentStateRoot) {
    console.log('State preservation: enabled via PAPERCLIP_E2E_STATE_DIR.');
  } else {
    console.log('State preservation: disabled; this disposable instance will be deleted on exit.');
  }
  console.log('The URL has been opened in your default browser.');
  console.log(`Open ${pluginDisplayName} from the installed plugins list.`);
  console.log(`Confirm that the ${settingsPageHeading} settings page shows the preloaded ${manualVerificationRepositoryUrl} source.`);
  console.log('Confirm that discovered companies are listed and each card shows both Import as new company and Import into... actions.');
  console.log('Open Import into... on one source package and verify the dropdown lists the other non-synced seeded companies, such as Dummy Company 2.');
  console.log('Import one company into Dummy Company 2 with a partial selection, verify the success message summarizes the selected contents, offers an Open dashboard link, and mentions daily auto-sync plus overwrite mode.');
  console.log('Confirm that Dummy Company 2 disappears from later Import into... dropdowns after it becomes a tracked synced import.');
  console.log('Confirm that the imported company appears in the separate Imported Companies section with an Imported version badge, a disabled Up to date action, a checked Daily auto-sync toggle, a visible Sync contract summary, and a Re-import / Edit selection action.');
  console.log('When the imported selection includes an assigned task, confirm the imported assignee still shows timer heartbeats disabled and that the agent nevertheless received a recent non-timer heartbeat run for the imported issue after import.');
  console.log('Use Re-import / Edit selection to change the saved selection and verify the Sync contract summary updates on the tracked company card.');
  console.log('Optional: open the plugin from another existing non-synced company and verify that Import into... can adopt that company too when it is not already tracked.');
  console.log('Change the source company version, click Rescan, and confirm the tracked company card shows the newer Latest version badge and the action switches to Sync now.');
  console.log('Click Sync now from the Imported Companies section and verify the success message summarizes the sync result for the existing Paperclip company, including the saved selection contract, without showing overwrite warnings for replaced records.');
  console.log('If the imported selection includes recurring tasks, open Routines and confirm overwrite-mode re-imports leave only one active routine per recurring task name instead of duplicating the routine list.');
  console.log('Toggle Daily auto-sync off and back on again to confirm the setting updates immediately.');
  console.log('Confirm that the imported company appears in Paperclip with the expected agents, skills, projects, and issues.');
  console.log('Open View contents on a company, click an item in the left column, and confirm the rendered markdown updates on the right.');
  console.log('Press Ctrl+C when you are done inspecting the instance.');
  console.log('');

  await shutdownPromise;
}

try {
  await main();
} catch (error) {
  await cleanup();
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
}
