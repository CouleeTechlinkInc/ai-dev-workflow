#!/usr/bin/env bun

/**
 * GitHub event processing module
 * Handles parsing GitHub webhook events and extracting context
 */

import { readFileSync } from 'fs';
import { logger } from '../utils/logger';
import type { DockerActionConfig } from '../config/environment';

export interface GitHubEventContext {
  repository: {
    owner: string;
    repo: string;
    full_name: string;
  };
  eventName: string;
  eventAction?: string;
  entityNumber: number;
  isPR: boolean;
  actor: string;
  payload: any;
}

export interface TriggerContext {
  containsTrigger: boolean;
  triggerComment?: string;
  triggerUsername?: string;
  commentId?: string;
}

function parseRepository(repoString: string) {
  const [owner, repo] = repoString.split('/');
  return {
    owner,
    repo,
    full_name: repoString,
  };
}

function getEventPayload(): any {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) {
    throw new Error('GITHUB_EVENT_PATH not found');
  }

  try {
    const eventData = readFileSync(eventPath, 'utf8');
    return JSON.parse(eventData);
  } catch (error) {
    logger.error('Failed to parse GitHub event payload:', error);
    throw new Error('Invalid GitHub event payload');
  }
}

export function parseGitHubContext(config: DockerActionConfig): GitHubEventContext {
  const payload = getEventPayload();
  const repository = parseRepository(config.repository);
  const eventName = config.eventName;
  const eventAction = process.env.GITHUB_EVENT_ACTION;

  let entityNumber: number;
  let isPR: boolean;
  let actor: string;

  switch (eventName) {
    case 'issue_comment':
      if (payload.issue.pull_request) {
        // Comment on PR
        entityNumber = payload.issue.number;
        isPR = true;
      } else {
        // Comment on issue
        entityNumber = payload.issue.number;
        isPR = false;
      }
      actor = payload.comment.user.login;
      break;

    case 'pull_request_review_comment':
      entityNumber = payload.pull_request.number;
      isPR = true;
      actor = payload.comment.user.login;
      break;

    case 'pull_request_review':
      entityNumber = payload.pull_request.number;
      isPR = true;
      actor = payload.review.user.login;
      break;

    case 'issues':
      entityNumber = payload.issue.number;
      isPR = false;
      actor = payload.issue.user.login;
      break;

    case 'pull_request':
      entityNumber = payload.pull_request.number;
      isPR = true;
      actor = payload.pull_request.user.login;
      break;

    default:
      throw new Error(`Unsupported event type: ${eventName}`);
  }

  logger.debug(`Parsed GitHub context: ${eventName} #${entityNumber} by ${actor}`);

  return {
    repository,
    eventName,
    eventAction,
    entityNumber,
    isPR,
    actor,
    payload,
  };
}

export function checkTriggerConditions(context: GitHubEventContext, config: DockerActionConfig): TriggerContext {
  const { eventName, payload } = context;
  const { triggerPhrase, assigneeTrigger, labelTrigger, directPrompt } = config;

  // If direct prompt is provided, always trigger
  if (directPrompt) {
    logger.info('Direct prompt provided, triggering action');
    return {
      containsTrigger: true,
      triggerComment: directPrompt,
    };
  }

  let containsTrigger = false;
  let triggerComment: string | undefined;
  let triggerUsername: string | undefined;
  let commentId: string | undefined;

  switch (eventName) {
    case 'issue_comment':
      const comment = payload.comment;
      if (comment.body.includes(triggerPhrase)) {
        containsTrigger = true;
        triggerComment = comment.body;
        triggerUsername = comment.user.login;
        commentId = comment.id.toString();
      }
      break;

    case 'pull_request_review_comment':
      const reviewComment = payload.comment;
      if (reviewComment.body.includes(triggerPhrase)) {
        containsTrigger = true;
        triggerComment = reviewComment.body;
        triggerUsername = reviewComment.user.login;
        commentId = reviewComment.id.toString();
      }
      break;

    case 'pull_request_review':
      const review = payload.review;
      if (review.body && review.body.includes(triggerPhrase)) {
        containsTrigger = true;
        triggerComment = review.body;
        triggerUsername = review.user.login;
      }
      break;

    case 'issues':
      const issue = payload.issue;
      
      // Check for assignee trigger
      if (assigneeTrigger && context.eventAction === 'assigned') {
        const assignee = payload.assignee;
        if (assignee && assignee.login === assigneeTrigger) {
          containsTrigger = true;
          triggerUsername = assignee.login;
        }
      }

      // Check for label trigger
      if (labelTrigger && context.eventAction === 'labeled') {
        const label = payload.label;
        if (label && label.name === labelTrigger) {
          containsTrigger = true;
        }
      }

      // Check for trigger phrase in issue body or title
      if (issue.body && issue.body.includes(triggerPhrase)) {
        containsTrigger = true;
        triggerComment = issue.body;
        triggerUsername = issue.user.login;
      } else if (issue.title && issue.title.includes(triggerPhrase)) {
        containsTrigger = true;
        triggerComment = issue.title;
        triggerUsername = issue.user.login;
      }
      break;

    case 'pull_request':
      const pr = payload.pull_request;
      if (pr.body && pr.body.includes(triggerPhrase)) {
        containsTrigger = true;
        triggerComment = pr.body;
        triggerUsername = pr.user.login;
      }
      break;
  }

  if (containsTrigger) {
    logger.info(`Trigger detected in ${eventName} event`);
  } else {
    logger.info(`No trigger found in ${eventName} event`);
  }

  return {
    containsTrigger,
    triggerComment,
    triggerUsername,
    commentId,
  };
}