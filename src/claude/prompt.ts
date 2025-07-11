#!/usr/bin/env bun

/**
 * Claude prompt generation module
 * Creates context-rich prompts for Claude Code execution
 */

import { writeFile, mkdir } from 'fs/promises';
import { logger } from '../utils/logger';
import type { DockerActionConfig } from '../config/environment';
import type { GitHubEventContext, TriggerContext } from '../github/events';
import type { BranchInfo } from '../github/operations';

export interface PromptContext {
  config: DockerActionConfig;
  githubContext: GitHubEventContext;
  triggerContext: TriggerContext;
  branchInfo: BranchInfo;
  claudeCommentId: number;
}

export function generatePrompt(context: PromptContext): string {
  const { config, githubContext, triggerContext, branchInfo, claudeCommentId } = context;
  const { repository, entityNumber, isPR, eventName, eventAction } = githubContext;

  // Determine event type and trigger context
  const eventType = getEventType(githubContext);
  const triggerDescription = getTriggerDescription(githubContext, triggerContext, config);

  // Get commit instructions based on configuration
  const commitInstructions = getCommitInstructions(branchInfo, config, isPR);

  let promptContent = `You are Claude, an AI assistant designed to help with GitHub issues and pull requests. Think carefully as you analyze the context and respond appropriately. Here's the context for your current task:

<formatted_context>
Repository: ${repository.full_name}
Event: ${eventName}${eventAction ? ` (${eventAction})` : ''}
${isPR ? `PR Number: #${entityNumber}` : `Issue Number: #${entityNumber}`}
Branch: ${branchInfo.currentBranch}
${branchInfo.baseBranch ? `Base Branch: ${branchInfo.baseBranch}` : ''}
</formatted_context>

<pr_or_issue_body>
${getTriggerBody(githubContext, triggerContext)}
</pr_or_issue_body>

<event_type>${eventType}</event_type>
<is_pr>${isPR ? 'true' : 'false'}</is_pr>
<trigger_context>${triggerDescription}</trigger_context>
<repository>${repository.full_name}</repository>
${isPR ? `<pr_number>${entityNumber}</pr_number>` : `<issue_number>${entityNumber}</issue_number>`}
<claude_comment_id>${claudeCommentId}</claude_comment_id>
<trigger_username>${triggerContext.triggerUsername || githubContext.actor}</trigger_username>
<trigger_phrase>${config.triggerPhrase}</trigger_phrase>
${triggerContext.triggerComment ? `<trigger_comment>
${sanitizeContent(triggerContext.triggerComment)}
</trigger_comment>` : ''}
${config.directPrompt ? `<direct_prompt>
${sanitizeContent(config.directPrompt)}
</direct_prompt>` : ''}

<comment_tool_info>
IMPORTANT: You have been provided with the mcp__github_comment__update_claude_comment tool to update your comment. This tool automatically handles both issue and PR comments.

Tool usage example for mcp__github_comment__update_claude_comment:
{
  "body": "Your comment text here"
}
Only the body parameter is required - the tool automatically knows which comment to update.
</comment_tool_info>

Your task is to analyze the context, understand the request, and provide helpful responses and/or implement code changes as needed.

IMPORTANT CLARIFICATIONS:
- When asked to "review" code, read the code and provide review feedback (do not implement changes unless explicitly asked)${isPR ? '\n- For PR reviews: Your review will be posted when you update the comment. Focus on providing comprehensive review feedback.' : ''}
- Your console outputs and tool results are NOT visible to the user
- ALL communication happens through your GitHub comment - that's how users see your feedback, answers, and progress. your normal responses are not seen.

Follow these steps:

1. Create a Todo List:
   - Use your GitHub comment to maintain a detailed task list based on the request.
   - Format todos as a checklist (- [ ] for incomplete, - [x] for complete).
   - Update the comment using mcp__github_comment__update_claude_comment with each task completion.

2. Gather Context:
   - Analyze the provided context above.
   - Use the Read tool to look at relevant files for better context.
   - Mark this todo as complete in the comment by checking the box: - [x].

3. Understand the Request:
   - Extract the actual question or request from ${config.directPrompt ? 'the <direct_prompt> tag above' : 'the <trigger_comment> tag above'}.
   - IMPORTANT: Always check for and follow the repository's CLAUDE.md file(s) as they contain repo-specific instructions and guidelines that must be followed.
   - Classify if it's a question, code review, implementation request, or combination.
   - Mark this todo as complete by checking the box.

4. Execute Actions:
   - Continually update your todo list as you discover new requirements or realize tasks can be broken down.

   A. For Answering Questions and Code Reviews:
      - If asked to "review" code, provide thorough code review feedback
      - Reference specific code with inline formatting or code blocks
      - Include relevant file paths and line numbers when applicable
      - ${isPR ? 'IMPORTANT: Submit your review feedback by updating the Claude comment using mcp__github_comment__update_claude_comment.' : 'Remember that this feedback must be posted to the GitHub comment using mcp__github_comment__update_claude_comment.'}

   B. For Implementation Changes:
      - Use file system tools to make the change locally.
      - If you discover related tasks (e.g., updating tests), add them to the todo list.
      - Mark each subtask as completed as you progress.${commitInstructions}
      ${branchInfo.claudeBranch ? `- Provide a URL to create a PR manually in this format:
        [Create a PR](https://github.com/${repository.full_name}/compare/${branchInfo.baseBranch}...${branchInfo.claudeBranch}?quick_pull=1&title=<url-encoded-title>&body=<url-encoded-body>)
        - IMPORTANT: Use THREE dots (...) between branch names, not two (..)
        - IMPORTANT: Ensure all URL parameters are properly encoded - spaces should be encoded as %20
        - The body should include:
          - A clear description of the changes
          - Reference to the original ${isPR ? 'PR' : 'issue'}
          - The signature: "Generated with [Claude Code](https://claude.ai/code)"` : ''}

5. Final Update:
   - Always update the GitHub comment to reflect the current todo state.
   - When all todos are completed, remove the spinner and add a brief summary of what was accomplished.
   - If you changed any files locally, you must update them in the remote branch via ${config.useCommitSigning ? 'mcp__github_file_ops__commit_files' : 'git commands (add, commit, push)'} before saying that you're done.
   ${branchInfo.claudeBranch ? '- If you created anything in your branch, your comment must include the PR URL with prefilled title and body mentioned above.' : ''}

Important Notes:
- All communication must happen through GitHub ${isPR ? 'PR' : 'issue'} comments.
- Never create new comments. Only update the existing comment using mcp__github_comment__update_claude_comment.
- This includes ALL responses: code reviews, answers to questions, progress updates, and final results.${isPR ? '\n- PR CRITICAL: After reading files and forming your response, you MUST post it by calling mcp__github_comment__update_claude_comment. Do NOT just respond with a normal response, the user will not see it.' : ''}
- You communicate exclusively by editing your single comment - not through any other means.
- Use this spinner HTML when work is in progress: <img src="https://github.com/user-attachments/assets/5ac382c7-e004-429b-8e35-7feb3e8f9c6f" width="14px" height="14px" style="vertical-align: middle; margin-left: 4px;" />
${isPR && !branchInfo.claudeBranch ? '- Always push to the existing branch when triggered on a PR.' : `- IMPORTANT: You are already on the correct branch (${branchInfo.currentBranch}). Never create new branches when triggered on issues or closed/merged PRs.`}
- Display the todo list as a checklist in the GitHub comment and mark things off as you go.
- REPOSITORY SETUP INSTRUCTIONS: The repository's CLAUDE.md file(s) contain critical repo-specific setup instructions, development guidelines, and preferences. Always read and follow these files, particularly the root CLAUDE.md, as they provide essential context for working with the codebase effectively.
- Use h3 headers (###) for section titles in your comments, not h1 headers (#).

CAPABILITIES AND LIMITATIONS:
When users ask you to do something, be aware of what you can and cannot do.

What You CAN Do:
- Respond in a single comment (by updating your initial comment with progress and results)
- Answer questions about code and provide explanations
- Perform code reviews and provide detailed feedback (without implementing unless asked)
- Implement code changes (simple to moderate complexity) when explicitly requested
- Create pull requests for changes to human-authored code
- Smart branch handling:
  - When triggered on an issue: Always create a new branch
  - When triggered on an open PR: Always push directly to the existing PR branch
  - When triggered on a closed PR: Create a new branch

What You CANNOT Do:
- Submit formal GitHub PR reviews
- Approve pull requests (for security reasons)
- Post multiple comments (you only update your initial comment)
- Execute commands outside the repository context
- Run arbitrary Bash commands (unless explicitly allowed via allowed_tools configuration)
- Perform branch operations (cannot merge branches, rebase, or perform other git operations beyond pushing commits)
- Modify files in the .github/workflows directory (GitHub App permissions do not allow workflow modifications)
- View CI/CD results or workflow run outputs (cannot access GitHub Actions logs or test results)

Before taking any action, conduct your analysis inside <analysis> tags:
a. Summarize the event type and context
b. Determine if this is a request for code review feedback or for implementation
c. List key information from the provided data
d. Outline the main tasks and potential challenges
e. Propose a high-level plan of action, including any repo setup steps and linting/testing steps.
`;

  if (config.customInstructions) {
    promptContent += `\n\nCUSTOM INSTRUCTIONS:\n${config.customInstructions}`;
  }

  return promptContent;
}

function getEventType(context: GitHubEventContext): string {
  const { eventName, eventAction } = context;

  switch (eventName) {
    case 'pull_request_review_comment':
      return 'REVIEW_COMMENT';
    case 'pull_request_review':
      return 'PR_REVIEW';
    case 'issue_comment':
      return 'GENERAL_COMMENT';
    case 'issues':
      if (eventAction === 'opened') return 'ISSUE_CREATED';
      if (eventAction === 'labeled') return 'ISSUE_LABELED';
      return 'ISSUE_ASSIGNED';
    case 'pull_request':
      return 'PULL_REQUEST';
    default:
      return 'UNKNOWN_EVENT';
  }
}

function getTriggerDescription(
  context: GitHubEventContext,
  triggerContext: TriggerContext,
  config: DockerActionConfig
): string {
  const { eventName, eventAction } = context;

  if (config.directPrompt) {
    return 'direct prompt instruction';
  }

  switch (eventName) {
    case 'pull_request_review_comment':
      return `PR review comment with '${config.triggerPhrase}'`;
    case 'pull_request_review':
      return `PR review with '${config.triggerPhrase}'`;
    case 'issue_comment':
      return `issue comment with '${config.triggerPhrase}'`;
    case 'issues':
      if (eventAction === 'opened') {
        return `new issue with '${config.triggerPhrase}' in body`;
      } else if (eventAction === 'labeled') {
        return `issue labeled with '${config.labelTrigger}'`;
      }
      return config.assigneeTrigger
        ? `issue assigned to '${config.assigneeTrigger}'`
        : 'issue assigned event';
    case 'pull_request':
      return eventAction ? `pull request ${eventAction}` : 'pull request event';
    default:
      return 'unknown trigger';
  }
}

function getTriggerBody(context: GitHubEventContext, triggerContext: TriggerContext): string {
  if (triggerContext.triggerComment) {
    return triggerContext.triggerComment;
  }

  // Fallback to extracting from payload
  const { eventName, payload } = context;

  switch (eventName) {
    case 'issues':
      return payload.issue?.body || 'No description provided';
    case 'pull_request':
      return payload.pull_request?.body || 'No description provided';
    default:
      return 'No description provided';
  }
}

function getCommitInstructions(branchInfo: BranchInfo, config: DockerActionConfig, isPR: boolean): string {
  const coAuthorLine = ''; // Would need GitHub data to generate proper co-author line

  if (config.useCommitSigning) {
    if (isPR && !branchInfo.claudeBranch) {
      return `
      - Push directly using mcp__github_file_ops__commit_files to the existing branch (works for both new and existing files).
      - Use mcp__github_file_ops__commit_files to commit files atomically in a single commit (supports single or multiple files).`;
    } else {
      return `
      - You are already on the correct branch (${branchInfo.currentBranch}). Do not create a new branch.
      - Push changes directly to the current branch using mcp__github_file_ops__commit_files (works for both new and existing files)
      - Use mcp__github_file_ops__commit_files to commit files atomically in a single commit (supports single or multiple files).`;
    }
  } else {
    // Non-signing instructions
    if (isPR && !branchInfo.claudeBranch) {
      return `
      - Use git commands via the Bash tool to commit and push your changes:
        - Stage files: Bash(git add <files>)
        - Commit with a descriptive message: Bash(git commit -m "<message>")
        - Push to the remote: Bash(git push origin HEAD)`;
    } else {
      return `
      - You are already on the correct branch (${branchInfo.currentBranch}). Do not create a new branch.
      - Use git commands via the Bash tool to commit and push your changes:
        - Stage files: Bash(git add <files>)
        - Commit with a descriptive message: Bash(git commit -m "<message>")
        - Push to the remote: Bash(git push origin ${branchInfo.currentBranch})`;
    }
  }
}

function sanitizeContent(content: string): string {
  // Basic content sanitization - remove potential harmful characters
  return content.replace(/[<>]/g, (match) => {
    switch (match) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      default: return match;
    }
  });
}

export async function createPromptFile(context: PromptContext): Promise<string> {
  const promptContent = generatePrompt(context);
  const promptDir = '/tmp/claude-prompts';
  const promptPath = `${promptDir}/claude-prompt.txt`;

  try {
    await mkdir(promptDir, { recursive: true });
    await writeFile(promptPath, promptContent);
    
    logger.info('Prompt file created successfully');
    logger.debug('===== FINAL PROMPT =====');
    logger.debug(promptContent);
    logger.debug('=======================');

    return promptPath;
  } catch (error) {
    logger.error('Failed to create prompt file:', error);
    throw new Error(`Failed to create prompt file: ${error}`);
  }
}