import * as core from "@actions/core";
import { GITHUB_API_URL } from "../github/api/config";
import type { GitHubContext } from "../github/events";
import { Octokit } from "@octokit/rest";

type PrepareConfigParams = {
  githubToken: string;
  owner: string;
  repo: string;
  branch: string;
  additionalMcpConfig?: string;
  claudeCommentId?: string;
  allowedTools: string[];
  context: GitHubContext;
};

async function checkActionsReadPermission(
  token: string,
  owner: string,
  repo: string,
): Promise<boolean> {
  try {
    const client = new Octokit({ auth: token });

    // Try to list workflow runs - this requires actions:read
    // We use per_page=1 to minimize the response size
    await client.actions.listWorkflowRunsForRepo({
      owner,
      repo,
      per_page: 1,
    });

    return true;
  } catch (error: any) {
    // Check if it's a permission error
    if (
      error.status === 403 &&
      error.message?.includes("Resource not accessible")
    ) {
      return false;
    }

    // For other errors (network issues, etc), log but don't fail
    core.debug(`Failed to check actions permission: ${error.message}`);
    return false;
  }
}

export async function prepareMcpConfig(
  params: PrepareConfigParams,
): Promise<string> {
  const {
    githubToken,
    owner,
    repo,
    branch,
    additionalMcpConfig,
    claudeCommentId,
    allowedTools,
    context,
  } = params;
  try {
    const baseMcpConfig: { mcpServers: Record<string, unknown> } = {
      mcpServers: {},
    };

    // Always include comment server for updating Claude comments
    baseMcpConfig.mcpServers.github_comment = {
      command: "bun",
      args: [
        "run",
        `${process.env.GITHUB_ACTION_PATH}/src/mcp/github-comment-server.ts`,
      ],
      env: {
        GITHUB_TOKEN: githubToken,
        REPO_OWNER: owner,
        REPO_NAME: repo,
        ...(claudeCommentId && { CLAUDE_COMMENT_ID: claudeCommentId }),
        GITHUB_EVENT_NAME: process.env.GITHUB_EVENT_NAME || "",
        GITHUB_API_URL: GITHUB_API_URL,
      },
    };

    // Merge with additional MCP config if provided
    if (additionalMcpConfig && additionalMcpConfig.trim()) {
      try {
        const additionalConfig = JSON.parse(additionalMcpConfig);

        // Validate that parsed JSON is an object
        if (typeof additionalConfig !== "object" || additionalConfig === null) {
          throw new Error("MCP config must be a valid JSON object");
        }

        core.info(
          "Merging additional MCP server configuration with built-in servers",
        );

        // Merge configurations with user config overriding built-in servers
        const mergedConfig = {
          ...baseMcpConfig,
          ...additionalConfig,
          mcpServers: {
            ...baseMcpConfig.mcpServers,
            ...additionalConfig.mcpServers,
          },
        };

        return JSON.stringify(mergedConfig, null, 2);
      } catch (parseError) {
        core.warning(
          `Failed to parse additional MCP config: ${parseError}. Using base config only.`,
        );
      }
    }

    return JSON.stringify(baseMcpConfig, null, 2);
  } catch (error) {
    core.setFailed(`Install MCP server failed with error: ${error}`);
    process.exit(1);
  }
}
