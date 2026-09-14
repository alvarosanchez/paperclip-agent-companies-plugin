import { BOARD_ACCESS_TOKEN_CONFIG_PATH, PLUGIN_ID } from "../plugin-constants.js";

/** Host route that stores company-scoped plugin config for this plugin. */
export const BOARD_ACCESS_PLUGIN_CONFIG_PATH = `/api/plugins/${encodeURIComponent(PLUGIN_ID)}/config`;

export interface BoardAccessPluginConfigPayload {
  companyId: string;
  configJson: {
    [BOARD_ACCESS_TOKEN_CONFIG_PATH]: {
      type: "secret_ref";
      secretId: string;
      version: "latest";
    };
  };
}

export interface BoardAccessPluginConfigRequest {
  path: string;
  method: "POST";
  payload: BoardAccessPluginConfigPayload;
}

export type BoardAccessPluginConfigResult =
  | { saved: true }
  | { saved: false; hint: string };

/** Minimal JSON-posting contract satisfied by the UI's `fetchHostJson`. */
export type HostJsonPost = (
  path: string,
  init: { method: "POST"; body: string }
) => Promise<unknown>;

function getErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    return String(error.message);
  }

  return "Something went wrong.";
}

/**
 * Build the host request that binds the board access secret to this plugin's
 * company-scoped config. Pure so the route and payload shape can be asserted
 * without a browser.
 */
export function buildBoardAccessPluginConfigRequest(
  companyId: string,
  secretId: string
): BoardAccessPluginConfigRequest {
  return {
    path: BOARD_ACCESS_PLUGIN_CONFIG_PATH,
    method: "POST",
    payload: {
      companyId,
      configJson: {
        [BOARD_ACCESS_TOKEN_CONFIG_PATH]: { type: "secret_ref", secretId, version: "latest" }
      }
    }
  };
}

/**
 * Save the company-scoped plugin config that binds the board access secret to
 * this plugin. On Paperclip 2026.831+ the host only resolves plugin secret refs
 * that are bound through plugin config, and only admits proactive worker calls
 * (scheduled auto-sync) for companies that have saved plugin config.
 *
 * The write is best-effort: the config route is restricted to instance admins,
 * so a 403 (or any other host error) must not fail the connect flow. Callers
 * get a hint to surface instead.
 */
export async function registerBoardAccessPluginConfig(
  companyId: string,
  secretId: string,
  postJson: HostJsonPost
): Promise<BoardAccessPluginConfigResult> {
  const request = buildBoardAccessPluginConfigRequest(companyId, secretId);

  try {
    await postJson(request.path, {
      method: request.method,
      body: JSON.stringify(request.payload)
    });
    return { saved: true };
  } catch (configError) {
    return {
      saved: false,
      hint: `The company-scoped plugin config binding could not be saved (${getErrorMessage(configError)}); worker-side sync will rely on the cached worker credential until an instance admin reconnects board access.`
    };
  }
}
