#!/usr/bin/env bun

/**
 * Main application logic for Claude Docker Action
 * Integrates all components to provide Docker-based Claude workflow functionality
 */

import * as core from '@actions/core';
import { logger } from './utils/logger';
import { validateGitHubEvent } from './utils/validation';
import { parseEnvironmentConfig, validateConfig, logConfigSummary } from './config/environment';
import { setupGitHubToken } from './github/auth';
import { parseGitHubContext, checkTriggerConditions } from './github/events';
import { createOctokit, createInitialComment, setupBranch, configureGitAuth } from './github/operations';
import { setupClaudeAuthentication } from './claude/auth';
import { createPromptFile } from './claude/prompt';
import { runClaude } from './claude/runner';
import { prepareMcpConfig } from './mcp/install-mcp-server';
import { setupClaudeCodeSettings } from './claude/settings';

async function main() {
  try {
    logger.info('Starting Claude Docker Action...');

    // Handle configuration validation mode
    if (process.argv.includes('--validate-config')) {
      logger.info('Running configuration validation mode...');
      const config = parseEnvironmentConfig();
      validateConfig(config);
      logConfigSummary(config);
      logger.info('Configuration validation completed successfully');
      return;
    }

    // Step 1: Parse and validate environment configuration
    logger.info('Step 1: Parsing environment configuration...');
    const config = parseEnvironmentConfig();
    validateConfig(config);
    logConfigSummary(config);

    // Step 2: Validate GitHub event
    logger.info('Step 2: Validating GitHub event...');
    validateGitHubEvent();

    // Step 3: Setup GitHub authentication
    logger.info('Step 3: Setting up GitHub authentication...');
    const githubToken = await setupGitHubToken(config);
    const octokit = createOctokit(githubToken);

    // Step 4: Parse GitHub context
    logger.info('Step 4: Parsing GitHub context...');
    const githubContext = parseGitHubContext(config);

    // Step 5: Check trigger conditions
    logger.info('Step 5: Checking trigger conditions...');
    const triggerContext = checkTriggerConditions(githubContext, config);

    if (!triggerContext.containsTrigger) {
      logger.info('No trigger found, skipping remaining steps');
      core.setOutput('conclusion', 'skipped');
      return;
    }

    // Step 6: Create initial tracking comment
    logger.info('Step 6: Creating initial tracking comment...');
    const commentData = await createInitialComment(octokit, githubContext);
    const claudeCommentId = commentData.id;

    // Step 7: Setup branch
    logger.info('Step 7: Setting up branch...');
    const branchInfo = await setupBranch(octokit, githubContext, config);

    // Step 8: Configure git authentication if not using commit signing
    if (!config.useCommitSigning) {
      logger.info('Step 8: Configuring git authentication...');
      try {
        await configureGitAuth(githubToken, githubContext, commentData.user);
      } catch (error) {
        logger.error('Failed to configure git authentication:', error);
        throw error;
      }
    } else {
      logger.info('Step 8: Skipping git configuration (using commit signing)');
    }

    // Step 9: Setup Claude authentication
    logger.info('Step 9: Setting up Claude authentication...');
    await setupClaudeAuthentication(config);

    // Step 10: Create prompt file
    logger.info('Step 10: Creating prompt file...');
    const promptPath = await createPromptFile({
      config,
      githubContext,
      triggerContext,
      branchInfo,
      claudeCommentId,
    });

    // Step 11: Prepare MCP configuration
    logger.info('Step 11: Preparing MCP configuration...');
    const mcpConfig = await prepareMcpConfig({
      githubToken,
      owner: githubContext.repository.owner,
      repo: githubContext.repository.repo,
      branch: branchInfo.currentBranch,
      additionalMcpConfig: config.mcpConfig || '',
      claudeCommentId: claudeCommentId.toString(),
      allowedTools: config.allowedTools ? config.allowedTools.split(',').map(t => t.trim()) : [],
      context: githubContext,
    });

    // Step 12: Set up Claude Code settings
    logger.info('Step 12: Setting up Claude Code settings...');
    await setupClaudeCodeSettings();

    // Step 13: Run Claude Code
    logger.info('Step 13: Running Claude Code...');
    const claudeResult = await runClaude({
      promptPath,
      config,
      mcpConfig,
    });

    // Step 14: Set outputs
    logger.info('Step 14: Setting action outputs...');
    if (claudeResult.success) {
      core.setOutput('conclusion', 'success');
      if (claudeResult.executionFile) {
        core.setOutput('execution_file', claudeResult.executionFile);
      }
      logger.info('Claude Docker Action completed successfully');
    } else {
      core.setOutput('conclusion', 'failure');
      if (claudeResult.executionFile) {
        core.setOutput('execution_file', claudeResult.executionFile);
      }
      process.exit(claudeResult.exitCode);
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Claude Docker Action failed: ${errorMessage}`);
    core.setFailed(`Action failed with error: ${errorMessage}`);
    core.setOutput('conclusion', 'failure');
    process.exit(1);
  }
}


// Execute main function if this file is run directly
if (require.main === module) {
  main();
}