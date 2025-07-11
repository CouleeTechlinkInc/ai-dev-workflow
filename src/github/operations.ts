#!/usr/bin/env bun

/**
 * GitHub operations module
 * Handles branch creation, commenting, and other GitHub API operations
 */

import { Octokit } from '@octokit/rest';
import { $ } from 'bun';
import { logger } from '../utils/logger';
import type { GitHubEventContext } from './events';
import type { DockerActionConfig } from '../config/environment';

export interface BranchInfo {
  baseBranch: string;
  claudeBranch?: string;
  currentBranch: string;
}

export interface CommentData {
  id: number;
  user: {
    login: string;
  };
}

export function createOctokit(token: string): Octokit {
  return new Octokit({
    auth: token,
    userAgent: 'claude-docker-action/1.0.0',
  });
}

export async function createInitialComment(
  octokit: Octokit,
  context: GitHubEventContext
): Promise<CommentData> {
  const { repository, entityNumber, isPR } = context;
  
  logger.info(`Creating initial tracking comment for ${isPR ? 'PR' : 'issue'} #${entityNumber}`);

  const body = `Claude is working on this... <img src="https://github.com/user-attachments/assets/5ac382c7-e004-429b-8e35-7feb3e8f9c6f" width="14px" height="14px" style="vertical-align: middle; margin-left: 4px;" />`;

  try {
    const response = await octokit.rest.issues.createComment({
      owner: repository.owner,
      repo: repository.repo,
      issue_number: entityNumber,
      body,
    });

    logger.info(`Created tracking comment with ID: ${response.data.id}`);
    return {
      id: response.data.id,
      user: response.data.user || { login: 'claude' },
    };
  } catch (error) {
    logger.error('Failed to create initial comment:', error);
    throw new Error(`Failed to create tracking comment: ${error}`);
  }
}

export async function updateComment(
  octokit: Octokit,
  context: GitHubEventContext,
  commentId: number,
  body: string
): Promise<void> {
  const { repository } = context;

  try {
    await octokit.rest.issues.updateComment({
      owner: repository.owner,
      repo: repository.repo,
      comment_id: commentId,
      body,
    });

    logger.debug(`Updated comment ${commentId}`);
  } catch (error) {
    logger.error('Failed to update comment:', error);
    throw new Error(`Failed to update comment: ${error}`);
  }
}

export async function setupBranch(
  octokit: Octokit,
  context: GitHubEventContext,
  config: DockerActionConfig
): Promise<BranchInfo> {
  const { repository, entityNumber, isPR, payload } = context;
  const { baseBranch, branchPrefix } = config;

  if (isPR) {
    const prData = payload.pull_request;
    const prState = prData.state;

    // Check if PR is closed or merged
    if (prState === 'closed' || prState === 'merged') {
      logger.info(`PR #${entityNumber} is ${prState}, creating new branch from source...`);
      // Fall through to create a new branch like we do for issues
    } else {
      // Handle open PR: Checkout the PR branch
      logger.info('This is an open PR, checking out PR branch...');

      const branchName = prData.head.ref;
      
      // Determine optimal fetch depth based on PR commit count
      const commitCount = prData.commits || 1;
      const fetchDepth = Math.max(commitCount, 20);

      logger.info(`PR #${entityNumber}: ${commitCount} commits, using fetch depth ${fetchDepth}`);

      try {
        // Execute git commands to checkout PR branch
        await $`git fetch origin --depth=${fetchDepth} ${branchName}`;
        await $`git checkout ${branchName}`;

        logger.info(`Successfully checked out PR branch for PR #${entityNumber}`);

        return {
          baseBranch: prData.base.ref,
          currentBranch: branchName,
        };
      } catch (error) {
        logger.error('Failed to checkout PR branch:', error);
        throw new Error(`Failed to checkout PR branch: ${error}`);
      }
    }
  }

  // Determine source branch - use baseBranch if provided, otherwise fetch default
  let sourceBranch: string;

  if (baseBranch) {
    sourceBranch = baseBranch;
  } else {
    try {
      const repoResponse = await octokit.rest.repos.get({
        owner: repository.owner,
        repo: repository.repo,
      });
      sourceBranch = repoResponse.data.default_branch;
    } catch (error) {
      logger.error('Failed to get default branch:', error);
      throw new Error(`Failed to get default branch: ${error}`);
    }
  }

  // Creating a new branch for either an issue or closed/merged PR
  const entityType = isPR ? 'pr' : 'issue';
  logger.info(`Creating new branch for ${entityType} #${entityNumber} from source branch: ${sourceBranch}...`);

  const timestamp = new Date()
    .toISOString()
    .replace(/[:-]/g, '')
    .replace(/\.\d{3}Z/, '')
    .split('T')
    .join('_');

  const newBranch = `${branchPrefix}${entityType}-${entityNumber}-${timestamp}`;

  try {
    // Get the SHA of the source branch
    const sourceBranchRef = await octokit.rest.git.getRef({
      owner: repository.owner,
      repo: repository.repo,
      ref: `heads/${sourceBranch}`,
    });

    const currentSHA = sourceBranchRef.data.object.sha;
    logger.debug(`Current SHA: ${currentSHA}`);

    // Create branch using GitHub API
    await octokit.rest.git.createRef({
      owner: repository.owner,
      repo: repository.repo,
      ref: `refs/heads/${newBranch}`,
      sha: currentSHA,
    });

    // Checkout the new branch (shallow fetch for performance)
    await $`git fetch origin --depth=1 ${newBranch}`;
    await $`git checkout ${newBranch}`;

    logger.info(`Successfully created and checked out new branch: ${newBranch}`);

    return {
      baseBranch: sourceBranch,
      claudeBranch: newBranch,
      currentBranch: newBranch,
    };
  } catch (error) {
    logger.error('Error creating branch:', error);
    throw new Error(`Failed to create branch: ${error}`);
  }
}

export async function configureGitAuth(
  githubToken: string,
  context: GitHubEventContext,
  commentUser: { login: string }
): Promise<void> {
  logger.info('Configuring git authentication...');

  try {
    // Configure git credentials for HTTPS
    await $`git config --global credential.helper store`;
    await $`echo "https://x-access-token:${githubToken}@github.com" > ~/.git-credentials`;

    // Configure git user (use comment user if available, otherwise a default)
    const username = commentUser.login || 'claude-action';
    const email = `${username}@users.noreply.github.com`;

    await $`git config user.name "${username}"`;
    await $`git config user.email "${email}"`;

    logger.info(`Git authentication configured for user: ${username}`);
  } catch (error) {
    logger.error('Failed to configure git authentication:', error);
    throw new Error(`Failed to configure git authentication: ${error}`);
  }
}