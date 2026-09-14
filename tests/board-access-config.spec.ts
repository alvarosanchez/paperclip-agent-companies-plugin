import { describe, expect, it } from "vitest";
import { BOARD_ACCESS_TOKEN_CONFIG_PATH, PLUGIN_ID } from "../src/plugin-constants.js";
import {
  BOARD_ACCESS_PLUGIN_CONFIG_PATH,
  buildBoardAccessPluginConfigRequest,
  registerBoardAccessPluginConfig,
  type HostJsonPost
} from "../src/ui/board-access-config.js";

interface RecordedPost {
  path: string;
  init: { method: "POST"; body: string };
}

function createFakePost(
  respond: (call: RecordedPost) => unknown
): { calls: RecordedPost[]; postJson: HostJsonPost } {
  const calls: RecordedPost[] = [];
  return {
    calls,
    postJson: async (path, init) => {
      const call = { path, init };
      calls.push(call);
      return respond(call);
    }
  };
}

describe("board access plugin config write", () => {
  it("targets the company-scoped plugin config route for this plugin", () => {
    expect(BOARD_ACCESS_PLUGIN_CONFIG_PATH).toBe(`/api/plugins/${PLUGIN_ID}/config`);
    expect(BOARD_ACCESS_PLUGIN_CONFIG_PATH).toBe("/api/plugins/paperclip-agent-companies-plugin/config");
  });

  it("builds a POST carrying the company id and a latest secret_ref binding", () => {
    expect(buildBoardAccessPluginConfigRequest("company-123", "secret-abc")).toEqual({
      path: "/api/plugins/paperclip-agent-companies-plugin/config",
      method: "POST",
      payload: {
        companyId: "company-123",
        configJson: {
          [BOARD_ACCESS_TOKEN_CONFIG_PATH]: {
            type: "secret_ref",
            secretId: "secret-abc",
            version: "latest"
          }
        }
      }
    });
    expect(BOARD_ACCESS_TOKEN_CONFIG_PATH).toBe("boardAccessTokenRef");
  });

  it("posts the JSON payload to the host and reports success", async () => {
    const fake = createFakePost(() => ({ ok: true }));

    await expect(
      registerBoardAccessPluginConfig("company-123", "secret-abc", fake.postJson)
    ).resolves.toEqual({ saved: true });

    expect(fake.calls).toHaveLength(1);
    const [call] = fake.calls;
    expect(call.path).toBe("/api/plugins/paperclip-agent-companies-plugin/config");
    expect(call.init.method).toBe("POST");
    expect(JSON.parse(call.init.body)).toEqual({
      companyId: "company-123",
      configJson: {
        boardAccessTokenRef: { type: "secret_ref", secretId: "secret-abc", version: "latest" }
      }
    });
  });

  it("tolerates a 403 from the config route and returns an admin hint instead of throwing", async () => {
    const fake = createFakePost(() => {
      throw new Error("Request failed with status 403.");
    });

    const result = await registerBoardAccessPluginConfig("company-123", "secret-abc", fake.postJson);

    expect(fake.calls).toHaveLength(1);
    expect(result.saved).toBe(false);
    if (result.saved) {
      throw new Error("expected the config write to be reported as skipped");
    }
    expect(result.hint).toContain("Request failed with status 403.");
    expect(result.hint).toContain("instance admin reconnects board access");
  });
});
