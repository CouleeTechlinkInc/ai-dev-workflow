#!/usr/bin/env bun

/**
 * Integration tests for Claude Docker Action
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { parseEnvironmentConfig, validateConfig } from '../src/config/environment';
import { parseGitHubContext, checkTriggerConditions } from '../src/github/events';
import { validateGitHubEvent } from '../src/utils/validation';

describe('Environment Configuration', () => {
  beforeEach(() => {
    // Reset environment variables
    delete process.env.INPUT_ANTHROPIC_API_KEY;
    delete process.env.INPUT_TRIGGER_PHRASE;
    delete process.env.GITHUB_REPOSITORY;
    delete process.env.GITHUB_EVENT_NAME;
  });

  it('should parse basic configuration', () => {
    // Set required environment variables
    process.env.INPUT_ANTHROPIC_API_KEY = 'test-key';
    process.env.GITHUB_REPOSITORY = 'testowner/test-repo';
    process.env.GITHUB_EVENT_NAME = 'issue_comment';

    const config = parseEnvironmentConfig();

    expect(config.repository).toBe('testowner/test-repo');
    expect(config.eventName).toBe('issue_comment');
    expect(config.triggerPhrase).toBe('@claude');
    expect(config.anthropicApiKey).toBe('test-key');
    expect(config.timeoutMinutes).toBe(30);
  });

  it('should validate configuration successfully', () => {
    process.env.INPUT_ANTHROPIC_API_KEY = 'test-key';
    process.env.GITHUB_REPOSITORY = 'testowner/test-repo';
    process.env.GITHUB_EVENT_NAME = 'issue_comment';

    const config = parseEnvironmentConfig();

    expect(() => validateConfig(config)).not.toThrow();
  });

  it('should throw error for invalid repository format', () => {
    process.env.INPUT_ANTHROPIC_API_KEY = 'test-key';
    process.env.GITHUB_REPOSITORY = 'invalid-repo-format';
    process.env.GITHUB_EVENT_NAME = 'issue_comment';

    const config = parseEnvironmentConfig();

    expect(() => validateConfig(config)).toThrow('Invalid repository format');
  });
});

describe('GitHub Event Processing', () => {
  beforeEach(() => {
    // Set up required environment variables
    process.env.GITHUB_REPOSITORY = 'testowner/test-repo';
    process.env.GITHUB_EVENT_NAME = 'issue_comment';
    process.env.GITHUB_EVENT_PATH = '/test/fixtures/github-event.json';
  });

  it('should validate supported GitHub events', () => {
    process.env.GITHUB_EVENT_NAME = 'issue_comment';
    expect(() => validateGitHubEvent()).not.toThrow();

    process.env.GITHUB_EVENT_NAME = 'pull_request_review_comment';
    expect(() => validateGitHubEvent()).not.toThrow();

    process.env.GITHUB_EVENT_NAME = 'issues';
    expect(() => validateGitHubEvent()).not.toThrow();
  });

  it('should reject unsupported GitHub events', () => {
    process.env.GITHUB_EVENT_NAME = 'push';
    expect(() => validateGitHubEvent()).toThrow('Unsupported event type');
  });

  it('should detect trigger phrase in comments', () => {
    const config = parseEnvironmentConfig();
    config.triggerPhrase = '@claude';

    // Mock the GitHub event payload reading
    const originalReadFileSync = require('fs').readFileSync;
    require('fs').readFileSync = () => JSON.stringify({
      issue: {
        number: 123,
        pull_request: null,
        user: { login: 'testuser' }
      },
      comment: {
        id: 456,
        body: '@claude please help with this test issue',
        user: { login: 'testuser' }
      }
    });

    try {
      const githubContext = parseGitHubContext(config);
      const triggerContext = checkTriggerConditions(githubContext, config);

      expect(triggerContext.containsTrigger).toBe(true);
      expect(triggerContext.triggerComment).toContain('@claude');
      expect(triggerContext.triggerUsername).toBe('testuser');
    } finally {
      // Restore original function
      require('fs').readFileSync = originalReadFileSync;
    }
  });
});

describe('Docker Configuration Validation', () => {
  it('should handle --validate-config flag', () => {
    process.env.INPUT_ANTHROPIC_API_KEY = 'test-key';
    process.env.GITHUB_REPOSITORY = 'testowner/test-repo';
    process.env.GITHUB_EVENT_NAME = 'issue_comment';

    const config = parseEnvironmentConfig();
    validateConfig(config);

    // Should not throw
    expect(config.repository).toBe('testowner/test-repo');
  });

  it('should require authentication method', () => {
    // No authentication provided
    process.env.GITHUB_REPOSITORY = 'testowner/test-repo';
    process.env.GITHUB_EVENT_NAME = 'issue_comment';

    expect(() => parseEnvironmentConfig()).toThrow('No authentication method provided');
  });
});