#!/usr/bin/env bun

/**
 * GitHub authentication module
 * Handles OIDC token exchange and GitHub token setup
 */

import * as core from "@actions/core";
import { logger } from '../utils/logger';
import type { DockerActionConfig } from '../config/environment';

async function getOidcToken(): Promise<string> {
  try {
    const oidcToken = await core.getIDToken("claude-code-github-action");
    return oidcToken;
  } catch (error) {
    logger.error("Failed to get OIDC token:", error);
    throw new Error(
      "Could not fetch an OIDC token. Did you remember to add `id-token: write` to your workflow permissions?"
    );
  }
}

async function exchangeForAppToken(oidcToken: string): Promise<string> {
  logger.info("Exchanging OIDC token for app token...");
  
  const response = await fetch(
    "https://api.anthropic.com/api/github/github-app-token-exchange",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${oidcToken}`,
      },
    }
  );

  if (!response.ok) {
    const responseJson = (await response.json()) as {
      error?: {
        message?: string;
      };
    };
    const errorMessage = responseJson?.error?.message ?? "Unknown error";
    logger.error(`App token exchange failed: ${response.status} ${response.statusText} - ${errorMessage}`);
    throw new Error(errorMessage);
  }

  const appTokenData = (await response.json()) as {
    token?: string;
    app_token?: string;
  };
  const appToken = appTokenData.token || appTokenData.app_token;

  if (!appToken) {
    throw new Error("App token not found in response");
  }

  return appToken;
}

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      logger.warn(`Attempt ${attempt}/${maxRetries} failed:`, error);

      if (attempt === maxRetries) {
        throw lastError;
      }

      const delay = baseDelay * Math.pow(2, attempt - 1);
      logger.info(`Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}

export async function setupGitHubToken(config: DockerActionConfig): Promise<string> {
  try {
    // Check if GitHub token was provided as input
    if (config.githubToken) {
      logger.info("Using provided GITHUB_TOKEN for authentication");
      return config.githubToken;
    }

    // Try OIDC authentication
    logger.info("Requesting OIDC token...");
    const oidcToken = await retryWithBackoff(() => getOidcToken());
    logger.info("OIDC token successfully obtained");

    logger.info("Exchanging OIDC token for app token...");
    const appToken = await retryWithBackoff(() => exchangeForAppToken(oidcToken));
    logger.info("App token successfully obtained");

    return appToken;
  } catch (error) {
    const errorMessage = `Failed to setup GitHub token: ${error}.\n\nIf you instead wish to use this action with a custom GitHub token or custom GitHub app, provide a \`github_token\` in the action inputs.`;
    logger.error(errorMessage);
    throw new Error(errorMessage);
  }
}