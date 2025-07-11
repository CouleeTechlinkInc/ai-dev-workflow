#!/usr/bin/env bun

/**
 * Input validation utilities
 */

import { logger } from './logger';

export function validateRequiredEnv(vars: string[]): void {
  const missing = vars.filter(v => !process.env[v]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

export function validateGitHubEvent(): void {
  const eventName = process.env.GITHUB_EVENT_NAME;
  const supportedEvents = [
    'issue_comment',
    'pull_request_review_comment', 
    'issues',
    'pull_request_review',
    'pull_request'
  ];

  if (!eventName) {
    throw new Error('GITHUB_EVENT_NAME is required');
  }

  if (!supportedEvents.includes(eventName)) {
    throw new Error(`Unsupported event type: ${eventName}. Supported events: ${supportedEvents.join(', ')}`);
  }

  logger.debug(`Event validation passed for: ${eventName}`);
}

export function validateRepositoryFormat(repository: string): void {
  if (!repository || !repository.includes('/')) {
    throw new Error(`Invalid repository format: ${repository}. Expected format: owner/repo`);
  }

  const parts = repository.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`Invalid repository format: ${repository}. Expected format: owner/repo`);
  }

  logger.debug(`Repository format validation passed: ${repository}`);
}

export function validateTimeout(timeoutMinutes: number): void {
  if (timeoutMinutes <= 0 || timeoutMinutes > 360) {
    throw new Error(`Invalid timeout: ${timeoutMinutes}. Must be between 1 and 360 minutes`);
  }
}

export function validateMaxTurns(maxTurns?: number): void {
  if (maxTurns !== undefined && (maxTurns <= 0 || maxTurns > 100)) {
    throw new Error(`Invalid max turns: ${maxTurns}. Must be between 1 and 100`);
  }
}