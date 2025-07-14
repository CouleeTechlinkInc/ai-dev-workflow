#!/usr/bin/env node
// GitHub Comment MCP Server - Minimal server that only provides comment update functionality

// Add debugging to see if the server starts
console.error("[GitHub Comment Server] Starting server...");

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { GITHUB_API_URL } from "../github/api/config";
import { Octokit } from "@octokit/rest";
import { updateComment } from "../github/operations";

console.error("[GitHub Comment Server] Imports successful");

// Get repository information from environment variables
const REPO_OWNER = process.env.REPO_OWNER;
const REPO_NAME = process.env.REPO_NAME;

if (!REPO_OWNER || !REPO_NAME) {
  console.error(
    "Error: REPO_OWNER and REPO_NAME environment variables are required",
  );
  process.exit(1);
}

const server = new McpServer({
  name: "GitHub Comment Server",
  version: "0.0.1",
});

server.tool(
  "update_claude_comment",
  "Update the Claude comment with progress and results (automatically handles both issue and PR comments)",
  {
    body: z.string().describe("The updated comment content"),
  },
  async ({ body }) => {
    try {
      const githubToken = process.env.GITHUB_TOKEN;
      const claudeCommentId = process.env.CLAUDE_COMMENT_ID;
      const eventName = process.env.GITHUB_EVENT_NAME;

      if (!githubToken) {
        throw new Error("GITHUB_TOKEN environment variable is required");
      }
      if (!claudeCommentId) {
        throw new Error("CLAUDE_COMMENT_ID environment variable is required");
      }

      const owner = REPO_OWNER;
      const repo = REPO_NAME;
      const commentId = parseInt(claudeCommentId, 10);

      const octokit = new Octokit({
        auth: githubToken,
        baseUrl: GITHUB_API_URL,
      });

      // Create context object for the updateComment function
      const context = {
        repository: {
          owner,
          repo,
          full_name: `${owner}/${repo}`,
        },
        eventName: eventName || "",
        entityNumber: 0, // Not needed for comment update
        isPR: eventName === "pull_request_review_comment",
        actor: "",
        payload: {},
      };

      await updateComment(octokit, context, commentId, body);

      return {
        content: [
          {
            type: "text",
            text: `Successfully updated comment ${commentId}`,
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: `Error: ${errorMessage}`,
          },
        ],
        error: errorMessage,
        isError: true,
      };
    }
  },
);

async function runServer() {
  console.error("[GitHub Comment Server] Creating transport...");
  const transport = new StdioServerTransport();
  
  console.error("[GitHub Comment Server] Connecting to transport...");
  await server.connect(transport);
  
  console.error("[GitHub Comment Server] Server connected successfully");
  process.on("exit", () => {
    console.error("[GitHub Comment Server] Server shutting down...");
    server.close();
  });
}

console.error("[GitHub Comment Server] Starting runServer...");
runServer().catch((error) => {
  console.error("[GitHub Comment Server] Error starting server:", error);
});
