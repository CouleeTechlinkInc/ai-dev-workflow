#!/usr/bin/env bun

/**
 * Claude authentication and configuration module
 * Handles setting up authentication for different providers
 */

import { $ } from 'bun';
import { homedir } from 'os';
import { logger } from '../utils/logger';
import type { DockerActionConfig } from '../config/environment';

export async function setupClaudeAuthentication(config: DockerActionConfig): Promise<void> {
  logger.info('Setting up Claude Code authentication...');

  // Set up authentication environment variables
  const env: Record<string, string> = {};

  // Anthropic API authentication
  if (config.anthropicApiKey) {
    env.ANTHROPIC_API_KEY = config.anthropicApiKey;
    logger.info('Using Anthropic API key for authentication');
  }

  // Claude Code OAuth authentication
  if (config.claudeCodeOauthToken) {
    env.CLAUDE_CODE_OAUTH_TOKEN = config.claudeCodeOauthToken;
    logger.info('Using Claude Code OAuth token for authentication');
  }

  // AWS Bedrock configuration
  if (config.useBedrock) {
    env.CLAUDE_CODE_USE_BEDROCK = '1';
    logger.info('Using AWS Bedrock for authentication');
    
    // Copy AWS environment variables if they exist
    const awsVars = [
      'AWS_REGION',
      'AWS_ACCESS_KEY_ID', 
      'AWS_SECRET_ACCESS_KEY',
      'AWS_SESSION_TOKEN',
      'ANTHROPIC_BEDROCK_BASE_URL'
    ];
    
    for (const awsVar of awsVars) {
      if (process.env[awsVar]) {
        env[awsVar] = process.env[awsVar]!;
      }
    }
  }

  // Google Vertex AI configuration
  if (config.useVertex) {
    env.CLAUDE_CODE_USE_VERTEX = '1';
    logger.info('Using Google Vertex AI for authentication');
    
    // Copy GCP environment variables if they exist
    const gcpVars = [
      'ANTHROPIC_VERTEX_PROJECT_ID',
      'CLOUD_ML_REGION',
      'GOOGLE_APPLICATION_CREDENTIALS',
      'ANTHROPIC_VERTEX_BASE_URL',
      'VERTEX_REGION_CLAUDE_3_5_HAIKU',
      'VERTEX_REGION_CLAUDE_3_5_SONNET',
      'VERTEX_REGION_CLAUDE_3_7_SONNET'
    ];
    
    for (const gcpVar of gcpVars) {
      if (process.env[gcpVar]) {
        env[gcpVar] = process.env[gcpVar]!;
      }
    }
  }

  // Apply environment variables to current process
  for (const [key, value] of Object.entries(env)) {
    process.env[key] = value;
  }

  // Set up Claude Code settings
  await setupClaudeCodeSettings();
}

async function setupClaudeCodeSettings(): Promise<void> {
  const home = homedir();
  const settingsPath = `${home}/.claude/settings.json`;
  logger.debug(`Setting up Claude settings at: ${settingsPath}`);

  try {
    // Ensure .claude directory exists
    await $`mkdir -p ${home}/.claude`.quiet();

    let settings: Record<string, unknown> = {};
    
    try {
      const existingSettings = await $`cat ${settingsPath}`.quiet().text();
      if (existingSettings.trim()) {
        settings = JSON.parse(existingSettings);
        logger.debug('Found existing settings:', JSON.stringify(settings, null, 2));
      } else {
        logger.debug('Settings file exists but is empty');
      }
    } catch (e) {
      logger.debug('No existing settings file found, creating new one');
    }

    // Enable project MCP servers
    settings.enableAllProjectMcpServers = true;
    logger.debug('Updated settings with enableAllProjectMcpServers: true');

    await $`echo ${JSON.stringify(settings, null, 2)} > ${settingsPath}`.quiet();
    logger.debug('Settings saved successfully');
  } catch (error) {
    logger.error('Failed to setup Claude Code settings:', error);
    throw new Error(`Failed to setup Claude Code settings: ${error}`);
  }
}

export function parseCustomEnvVars(claudeEnv?: string): Record<string, string> {
  if (!claudeEnv || claudeEnv.trim() === '') {
    return {};
  }

  const customEnv: Record<string, string> = {};

  // Split by lines and parse each line as KEY: VALUE
  const lines = claudeEnv.split('\n');

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (trimmedLine === '' || trimmedLine.startsWith('#')) {
      continue; // Skip empty lines and comments
    }

    const colonIndex = trimmedLine.indexOf(':');
    if (colonIndex === -1) {
      continue; // Skip lines without colons
    }

    const key = trimmedLine.substring(0, colonIndex).trim();
    const value = trimmedLine.substring(colonIndex + 1).trim();

    if (key) {
      customEnv[key] = value;
    }
  }

  return customEnv;
}