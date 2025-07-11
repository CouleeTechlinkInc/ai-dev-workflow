# Claude Docker Action - Container-Based Workflow

## Purpose
Create a single Docker image that replicates the functionality of `anthropics/claude-code-action@beta` but with all configuration passed via environment variables, allowing for greater customization and control over the workflow execution.

## Core Principles
1. **Environment-First Configuration**: All settings passed via environment variables
2. **Drop-in Replacement**: Exact functional parity with existing workflow
3. **Containerized Execution**: Self-contained Docker image with all dependencies
4. **Customizable Branch Management**: Flexible branch naming and management

---

## Goal
Create a Docker container action that can be used as a direct replacement for `anthropics/claude-code-action@beta` with environment-based configuration instead of hardcoded inputs.

## Why
- **Flexibility**: Environment variables allow dynamic configuration without action updates
- **Customization**: Enable custom branch naming patterns and workflow behaviors
- **Maintainability**: Single Docker image easier to version and deploy
- **Portability**: Works in any environment that supports Docker containers

## What
A Docker container action that:
- Processes GitHub events (comments, issues, PRs) to trigger Claude responses
- Handles authentication with Anthropic API, AWS Bedrock, or Google Vertex AI
- Manages GitHub operations (branching, commenting, PR management)
- Supports all current claude-code-action features via environment variables

### Success Criteria
- [ ] Docker image builds successfully with all dependencies
- [ ] Environment variables control all configuration (no hardcoded values)
- [ ] Functional parity with anthropics/claude-code-action@beta
- [ ] Branch naming is customizable via environment variables
- [ ] All authentication methods work (API key, Bedrock, Vertex AI)
- [ ] GitHub operations work correctly (comments, branches, PRs)
- [ ] Action passes all existing test scenarios

## All Needed Context

### Documentation & References
```yaml
# MUST READ - Include these in your context window
- url: https://docs.github.com/en/actions/creating-actions/creating-a-docker-container-action
  why: Docker container action structure and best practices
  
- url: https://docs.github.com/en/actions/creating-actions/metadata-syntax-for-github-actions
  why: Action metadata syntax, inputs/outputs configuration
  
- file: examples/claude-code-action/action.yml
  why: Current action structure, inputs, and composite step pattern
  
- file: examples/claude-code-base-action/action.yml
  why: Base action that actually runs Claude Code
  
- file: examples/claude-code-action/src/entrypoints/prepare.ts
  why: Preparation logic for environment setup
  
- file: examples/claude-code-base-action/src/index.ts
  why: Main execution logic for running Claude Code
  
- file: examples/build-docker-image.yaml
  why: Docker build patterns and GitHub container registry usage
  
- file: examples/claude.yaml
  why: Current workflow usage pattern to replicate
```

### Current Codebase Tree
```bash
claude-workflow-docker/
├── examples/
│   ├── build-docker-image.yaml           # Docker build workflow
│   ├── claude.yaml                       # Current usage example
│   ├── claude-code-action/               # Main action (composite)
│   │   ├── action.yml                   # Action metadata
│   │   ├── src/entrypoints/
│   │   │   ├── prepare.ts               # Environment preparation
│   │   │   ├── update-comment-link.ts   # Comment management
│   │   │   └── format-turns.ts          # Output formatting
│   │   └── src/github/                  # GitHub operations
│   └── claude-code-base-action/          # Base action
│       ├── action.yml                   # Base action metadata
│       ├── src/index.ts                 # Main execution
│       ├── src/run-claude.ts            # Claude Code runner
│       └── src/setup-claude-code-settings.ts
```

### Desired Codebase Tree
```bash
claude-workflow-docker/
├── Dockerfile                           # Container definition
├── action.yml                          # Docker action metadata
├── entrypoint.sh                       # Container entrypoint script
├── src/
│   ├── main.ts                         # Main application logic
│   ├── config/
│   │   └── environment.ts              # Environment variable parsing
│   ├── github/
│   │   ├── auth.ts                     # GitHub authentication
│   │   ├── operations.ts               # GitHub API operations
│   │   └── events.ts                   # Event processing
│   ├── claude/
│   │   ├── runner.ts                   # Claude Code execution
│   │   ├── auth.ts                     # Anthropic/Bedrock/Vertex auth
│   │   └── prompt.ts                   # Prompt generation
│   └── utils/
│       ├── logger.ts                   # Logging utilities
│       └── validation.ts               # Input validation
├── package.json                        # Dependencies
├── tsconfig.json                       # TypeScript configuration
└── test/                               # Test files
```

### Known Gotchas & Library Quirks
```typescript
// CRITICAL: Bun runtime required for compatibility with existing code
// Example: Both actions use Bun 1.2.11 specifically

// CRITICAL: Environment variables in Docker actions are prefixed with INPUT_
// Example: INPUT_ANTHROPIC_API_KEY maps to anthropic_api_key input

// CRITICAL: GitHub token handling requires special preparation
// Example: OIDC token exchange for app authentication

// CRITICAL: Named pipes used for IPC in base action
// Example: mkfifo for prompt input communication

// CRITICAL: MCP server configuration is JSON-based
// Example: GitHub MCP servers need specific configuration format

// CRITICAL: Branch naming pattern handling
// Example: Strip timestamp from claude/ branches: claude/issue-1-20250708_210355 -> claude/issue-1
```

## Implementation Blueprint

### Data Models and Structure
```typescript
// Environment configuration schema
interface DockerActionConfig {
  // GitHub configuration
  githubToken: string;
  repository: string;
  
  // Trigger configuration
  triggerPhrase: string;
  assigneeTrigger?: string;
  labelTrigger?: string;
  
  // Branch configuration
  baseBranch?: string;
  branchPrefix: string;
  
  // Claude configuration
  anthropicApiKey?: string;
  model?: string;
  fallbackModel?: string;
  customInstructions?: string;
  allowedTools?: string;
  disallowedTools?: string;
  
  // Provider configuration
  useBedrock: boolean;
  useVertex: boolean;
  
  // Execution configuration
  maxTurns?: number;
  timeoutMinutes: number;
  useStickyComment: boolean;
  useCommitSigning: boolean;
}
```

### List of Tasks (Implementation Order)

```yaml
Task 1: Create Docker Container Structure
CREATE Dockerfile:
  - BASE image: node:18-alpine for compatibility
  - INSTALL Bun 1.2.11 for runtime compatibility
  - COPY source files and install dependencies
  - SET entrypoint to /entrypoint.sh

CREATE action.yml:
  - DEFINE all inputs matching claude-code-action inputs
  - SET runs.using: "docker"
  - SET runs.image: "Dockerfile"
  - CONFIGURE environment variable mapping

CREATE entrypoint.sh:
  - PARSE environment variables
  - VALIDATE required configuration
  - EXEC main TypeScript application

Task 2: Environment Configuration System
CREATE src/config/environment.ts:
  - PARSE all INPUT_* environment variables
  - VALIDATE required vs optional settings
  - PROVIDE defaults matching current action behavior
  - HANDLE boolean conversion for Docker env vars

Task 3: GitHub Integration Layer
CREATE src/github/auth.ts:
  - MIRROR pattern from: examples/claude-code-action/src/github/token.ts
  - HANDLE OIDC token exchange
  - SUPPORT both GitHub app and personal token auth

CREATE src/github/operations.ts:
  - MIRROR pattern from: examples/claude-code-action/src/github/operations/
  - IMPLEMENT branch creation and cleanup
  - HANDLE PR and issue commenting
  - SUPPORT commit signing when enabled

CREATE src/github/events.ts:
  - MIRROR pattern from: examples/claude-code-action/src/entrypoints/prepare.ts
  - PARSE GitHub webhook events
  - DETECT trigger phrases and conditions
  - EXTRACT context for Claude prompts

Task 4: Claude Code Integration
CREATE src/claude/runner.ts:
  - MIRROR pattern from: examples/claude-code-base-action/src/run-claude.ts
  - EXECUTE Claude Code CLI with proper arguments
  - HANDLE multiple provider authentication
  - MANAGE execution timeouts and output capture

CREATE src/claude/auth.ts:
  - SUPPORT Anthropic API key authentication
  - HANDLE AWS Bedrock OIDC authentication
  - SUPPORT Google Vertex AI authentication
  - PROVIDE fallback model configuration

CREATE src/claude/prompt.ts:
  - MIRROR pattern from: examples/claude-code-action/src/create-prompt/
  - GENERATE context-rich prompts from GitHub events
  - HANDLE custom instructions and tool configuration
  - FORMAT output for Claude Code consumption

Task 5: Main Application Logic
CREATE src/main.ts:
  - INTEGRATE all components into main execution flow
  - HANDLE error conditions and graceful failures
  - PROVIDE logging and debugging output
  - ENSURE proper cleanup and resource management

Task 6: Testing and Validation
CREATE test/integration.test.ts:
  - TEST Docker container builds correctly
  - VALIDATE environment variable parsing
  - VERIFY GitHub operations work
  - CONFIRM Claude Code execution succeeds

UPDATE build-docker-image.yaml:
  - ADD build job for new Docker action
  - CONFIGURE GitHub container registry publishing
  - ENABLE automated testing on PR/push
```

### Integration Points
```yaml
CONTAINER_REGISTRY:
  - registry: "ghcr.io"
  - pattern: "ghcr.io/ORG/claude-workflow-docker:latest"
  - auth: "GitHub token with packages:write"

GITHUB_EVENTS:
  - triggers: "issue_comment, pull_request_review_comment, issues, pull_request_review"
  - filtering: "Check for trigger phrase or assignee"
  - context: "Extract PR/issue data for Claude prompts"

CLAUDE_CODE_CLI:
  - installation: "npm install -g @anthropic-ai/claude-code@1.0.48"
  - execution: "claude-code with prompt file and configuration"
  - output: "JSON execution log for processing"
```

## Validation Loop

### Level 1: Build & Syntax
```bash
# Build Docker image
docker build -t claude-docker-action:test .

# Expected: Successful build with all dependencies
# If failing: Check Dockerfile syntax and dependency resolution
```

### Level 2: Configuration Validation
```bash
# Test environment variable parsing
docker run --rm \
  -e INPUT_ANTHROPIC_API_KEY="test-key" \
  -e INPUT_TRIGGER_PHRASE="@claude" \
  -e INPUT_BRANCH_PREFIX="claude/" \
  claude-docker-action:test --validate-config

# Expected: Configuration validation passes
# If failing: Check environment.ts parsing logic
```

### Level 3: GitHub Integration Test
```bash
# Test with sample GitHub event
docker run --rm \
  -e INPUT_ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
  -e INPUT_GITHUB_TOKEN="$GITHUB_TOKEN" \
  -e GITHUB_EVENT_NAME="issue_comment" \
  -v ./test/fixtures/github-event.json:/github/event.json \
  claude-docker-action:test

# Expected: Processes event and triggers Claude appropriately
# If failing: Check event processing and GitHub API calls
```

### Level 4: End-to-End Workflow Test
```bash
# Test complete workflow in GitHub Actions
# Use test repository with sample issue/PR
# Trigger with @claude comment
# Verify: Comment response, branch creation, Claude execution

# Expected: Full workflow completion with Claude response
# If failing: Check logs in GitHub Actions for specific failures
```

## Final Validation Checklist
- [ ] Docker image builds successfully: `docker build -t claude-docker-action .`
- [ ] All environment variables parsed correctly
- [ ] GitHub authentication works with both app and token auth
- [ ] Claude Code execution succeeds with all provider types
- [ ] Branch operations work (create, cleanup, naming patterns)
- [ ] Comment operations work (create, update, formatting)
- [ ] Error handling provides useful feedback
- [ ] Logging is comprehensive but not verbose
- [ ] Documentation updated with usage examples

---

## Anti-Patterns to Avoid
- ❌ Don't hardcode any configuration - use environment variables
- ❌ Don't ignore the existing composite action patterns - mirror them
- ❌ Don't skip authentication validation - test all provider types
- ❌ Don't assume GitHub operations will succeed - handle failures gracefully
- ❌ Don't create new branch naming patterns - use existing logic
- ❌ Don't skip Docker best practices - use multi-stage builds and proper caching

## Confidence Score: 8/10

This PRP provides comprehensive context for implementing a Docker-based Claude workflow action. The implementation mirrors existing patterns while containerizing them for better portability and configuration flexibility. The validation gates ensure functional parity with the existing solution.

**Rationale for 8/10:**
- ✅ All necessary context from existing codebase included
- ✅ External Docker Action patterns researched and incorporated
- ✅ Clear implementation tasks with proper sequencing
- ✅ Validation loops provide executable tests
- ✅ Environment-first configuration approach well-defined
- ⚠️ Some complexity in merging two composite actions into one container
- ⚠️ Docker-specific considerations may require iteration during implementation