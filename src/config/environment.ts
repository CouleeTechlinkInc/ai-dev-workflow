#!/usr/bin/env bun

/**
 * Environment configuration parser for Docker action
 * Handles all INPUT_* environment variables and provides typed configuration
 */

export interface DockerActionConfig {
  // GitHub configuration
  githubToken: string;
  repository: string;
  eventName: string;
  
  // Trigger configuration
  triggerPhrase: string;
  assigneeTrigger?: string;
  labelTrigger?: string;
  
  // Branch configuration
  baseBranch?: string;
  branchPrefix: string;
  
  // Claude configuration
  anthropicApiKey?: string;
  claudeCodeOauthToken?: string;
  model?: string;
  fallbackModel?: string;
  customInstructions?: string;
  allowedTools?: string;
  disallowedTools?: string;
  directPrompt?: string;
  mcpConfig?: string;
  additionalPermissions?: string;
  claudeEnv?: string;
  
  // Provider configuration
  useBedrock: boolean;
  useVertex: boolean;
  
  // Execution configuration
  maxTurns?: number;
  timeoutMinutes: number;
  useStickyComment: boolean;
  useCommitSigning: boolean;
}

function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Required environment variable ${key} is not set`);
  }
  return value;
}

function getOptionalEnv(key: string, defaultValue?: string): string | undefined {
  return process.env[key] || defaultValue;
}

function getBooleanEnv(key: string, defaultValue: boolean = false): boolean {
  const value = process.env[key];
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

function getNumberEnv(key: string, defaultValue?: number): number | undefined {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be a valid number, got: ${value}`);
  }
  return parsed;
}

export function parseEnvironmentConfig(): DockerActionConfig {
  // Determine GitHub token source
  let githubToken: string;
  if (process.env.INPUT_GITHUB_TOKEN) {
    githubToken = process.env.INPUT_GITHUB_TOKEN;
  } else if (process.env.GITHUB_TOKEN) {
    githubToken = process.env.GITHUB_TOKEN;
  } else {
    // Will be handled by GitHub token setup if using OIDC
    githubToken = '';
  }

  // Validate authentication method
  const hasAnthropicAuth = !!(process.env.INPUT_ANTHROPIC_API_KEY || process.env.INPUT_CLAUDE_CODE_OAUTH_TOKEN);
  const hasGitHubAuth = !!githubToken;
  const useCloudProvider = getBooleanEnv('INPUT_USE_BEDROCK') || getBooleanEnv('INPUT_USE_VERTEX');
  
  if (!hasAnthropicAuth && !hasGitHubAuth && !useCloudProvider) {
    throw new Error(
      'No authentication method provided. Please set one of: INPUT_ANTHROPIC_API_KEY, INPUT_CLAUDE_CODE_OAUTH_TOKEN, GITHUB_TOKEN, or enable cloud provider authentication'
    );
  }

  const config: DockerActionConfig = {
    // GitHub configuration
    githubToken,
    repository: getRequiredEnv('GITHUB_REPOSITORY'),
    eventName: getRequiredEnv('GITHUB_EVENT_NAME'),
    
    // Trigger configuration
    triggerPhrase: getOptionalEnv('INPUT_TRIGGER_PHRASE', '@claude')!,
    assigneeTrigger: getOptionalEnv('INPUT_ASSIGNEE_TRIGGER'),
    labelTrigger: getOptionalEnv('INPUT_LABEL_TRIGGER', 'claude'),
    
    // Branch configuration
    baseBranch: getOptionalEnv('INPUT_BASE_BRANCH'),
    branchPrefix: getOptionalEnv('INPUT_BRANCH_PREFIX', 'claude/')!,
    
    // Claude configuration
    anthropicApiKey: getOptionalEnv('INPUT_ANTHROPIC_API_KEY'),
    claudeCodeOauthToken: getOptionalEnv('INPUT_CLAUDE_CODE_OAUTH_TOKEN'),
    model: getOptionalEnv('INPUT_MODEL') || getOptionalEnv('INPUT_ANTHROPIC_MODEL'),
    fallbackModel: getOptionalEnv('INPUT_FALLBACK_MODEL'),
    customInstructions: getOptionalEnv('INPUT_CUSTOM_INSTRUCTIONS'),
    allowedTools: getOptionalEnv('INPUT_ALLOWED_TOOLS'),
    disallowedTools: getOptionalEnv('INPUT_DISALLOWED_TOOLS'),
    directPrompt: getOptionalEnv('INPUT_DIRECT_PROMPT'),
    mcpConfig: getOptionalEnv('INPUT_MCP_CONFIG'),
    additionalPermissions: getOptionalEnv('INPUT_ADDITIONAL_PERMISSIONS'),
    claudeEnv: getOptionalEnv('INPUT_CLAUDE_ENV'),
    
    // Provider configuration
    useBedrock: getBooleanEnv('INPUT_USE_BEDROCK'),
    useVertex: getBooleanEnv('INPUT_USE_VERTEX'),
    
    // Execution configuration
    maxTurns: getNumberEnv('INPUT_MAX_TURNS'),
    timeoutMinutes: getNumberEnv('INPUT_TIMEOUT_MINUTES', 30)!,
    useStickyComment: getBooleanEnv('INPUT_USE_STICKY_COMMENT'),
    useCommitSigning: getBooleanEnv('INPUT_USE_COMMIT_SIGNING'),
  };

  return config;
}

export function validateConfig(config: DockerActionConfig): void {
  // Validate timeout
  if (config.timeoutMinutes <= 0) {
    throw new Error(`Timeout minutes must be positive, got: ${config.timeoutMinutes}`);
  }

  // Validate max turns if provided
  if (config.maxTurns !== undefined && config.maxTurns <= 0) {
    throw new Error(`Max turns must be positive, got: ${config.maxTurns}`);
  }

  // Validate mutually exclusive cloud providers
  if (config.useBedrock && config.useVertex) {
    throw new Error('Cannot use both Bedrock and Vertex AI simultaneously');
  }

  // Validate repository format
  if (!config.repository.includes('/')) {
    throw new Error(`Invalid repository format: ${config.repository}. Expected format: owner/repo`);
  }

  console.log('Configuration validation passed');
}

export function logConfigSummary(config: DockerActionConfig): void {
  const authMethods = [];
  if (config.anthropicApiKey) authMethods.push('Anthropic API Key');
  if (config.claudeCodeOauthToken) authMethods.push('Claude Code OAuth');
  if (config.useBedrock) authMethods.push('AWS Bedrock');
  if (config.useVertex) authMethods.push('Google Vertex AI');
  if (config.githubToken) authMethods.push('GitHub Token');

  console.log('=== Configuration Summary ===');
  console.log(`Repository: ${config.repository}`);
  console.log(`Event: ${config.eventName}`);
  console.log(`Trigger Phrase: ${config.triggerPhrase}`);
  console.log(`Branch Prefix: ${config.branchPrefix}`);
  console.log(`Authentication: ${authMethods.join(', ')}`);
  console.log(`Model: ${config.model || 'default'}`);
  console.log(`Timeout: ${config.timeoutMinutes} minutes`);
  console.log(`Commit Signing: ${config.useCommitSigning ? 'enabled' : 'disabled'}`);
  console.log('============================');
}