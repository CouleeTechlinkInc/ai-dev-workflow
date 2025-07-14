# Claude Docker Action

A Docker-based Claude Code action for GitHub workflows that provides environment variable configuration instead of hardcoded inputs.

## Features

- **Environment-First Configuration**: All settings passed via environment variables
- **Drop-in Replacement**: Functional parity with `anthropics/claude-code-action@beta`
- **Containerized Execution**: Self-contained Docker image with all dependencies
- **Multiple Authentication Methods**: Supports Anthropic API, AWS Bedrock, Google Vertex AI
- **Customizable Branch Management**: Flexible branch naming and management
- **GitHub Operations**: Full support for branching, commenting, and PR management

## Usage

### Basic Usage

```yaml
name: Claude Code
on:
  issue_comment:
    types: [created]
  pull_request_review_comment:
    types: [created]
  issues:
    types: [opened, assigned]

jobs:
  claude:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
      issues: write
      id-token: write
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Run Claude Docker Action
        uses: ./
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
```

### Advanced Configuration

```yaml
      - name: Run Claude Docker Action
        uses: ./
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          trigger_phrase: "/claude"
          branch_prefix: "ai/"
          model: "claude-sonnet-4-20250514"
          custom_instructions: |
            Follow our coding standards
            Ensure all new code has tests
            Use TypeScript for new files
          allowed_tools: "Bash(npm install),Bash(npm run build),Bash(npm run test)"
          timeout_minutes: "45"
          use_commit_signing: "true"
```

## Configuration Options

### Authentication
- `anthropic_api_key`: Anthropic API key
- `claude_code_oauth_token`: Claude Code OAuth token (alternative to API key)
- `github_token`: GitHub token (optional if using GitHub App)
- `use_bedrock`: Use AWS Bedrock with OIDC authentication
- `use_vertex`: Use Google Vertex AI with OIDC authentication

### Trigger Configuration
- `trigger_phrase`: Phrase to trigger Claude (default: "@claude")
- `assignee_trigger`: Username that triggers on assignment
- `label_trigger`: Label that triggers the action

### Branch Configuration
- `base_branch`: Base branch for new branches (defaults to repository default)
- `branch_prefix`: Prefix for Claude branches (default: "claude/")

### Claude Configuration
- `model`: Model to use (supports provider-specific formats)
- `fallback_model`: Fallback model when primary is unavailable
- `custom_instructions`: Additional instructions for Claude
- `allowed_tools`: Additional tools Claude can use
- `disallowed_tools`: Tools Claude cannot use
- `claude_env`: Custom environment variables (YAML format)

### Execution Configuration
- `max_turns`: Maximum conversation turns
- `timeout_minutes`: Execution timeout (default: 30)
- `use_sticky_comment`: Use single comment for all responses
- `use_commit_signing`: Enable GitHub commit signing

## Implementation Details

### Architecture

The action is structured with clear separation of concerns:

- **Configuration Layer** (`src/config/`): Environment variable parsing and validation
- **GitHub Integration** (`src/github/`): Authentication, operations, and event processing
- **Claude Integration** (`src/claude/`): Authentication, prompt generation, and execution
- **Utilities** (`src/utils/`): Logging and validation helpers

### Key Components

1. **Docker Container**: Based on Node.js 18 Alpine with Bun 1.2.11 runtime
2. **Environment Parser**: Handles all INPUT_* environment variables
3. **GitHub Operations**: Branch creation, commenting, and repository management
4. **Claude Runner**: Executes Claude Code CLI with proper configuration
5. **Prompt Generator**: Creates context-rich prompts from GitHub events

### Validation Levels

The implementation includes multiple validation levels:

1. **Build & Syntax**: Docker image builds successfully
2. **Configuration Validation**: Environment variables parse correctly
3. **GitHub Integration**: Event processing and API operations work
4. **End-to-End**: Full workflow completion with Claude response

## Development

### Building the Docker Image

```bash
docker build -t claude-docker-action .
```

### Running Configuration Validation

```bash
docker run --rm \
  -e INPUT_ANTHROPIC_API_KEY="test-key" \
  -e INPUT_TRIGGER_PHRASE="@claude" \
  -e GITHUB_REPOSITORY="owner/repo" \
  -e GITHUB_EVENT_NAME="issue_comment" \
  claude-docker-action --validate-config
```

### Testing

```bash
# Run integration tests
bun test

# Type checking (requires TypeScript setup)
bun run typecheck
```

## Differences from Original Action

1. **Environment Configuration**: All inputs via environment variables instead of action inputs
2. **Containerized**: Self-contained Docker image vs composite action
3. **Simplified Deployment**: Single image instead of multiple dependencies
4. **Enhanced Flexibility**: Dynamic configuration without action updates

## Security Considerations

- Follows GitHub Actions security best practices
- Supports secure authentication methods (OIDC, GitHub App)
- Environment variable isolation in Docker container
- No hardcoded secrets or tokens

## License

This project follows the same licensing as the original Claude Code Action.# Test BuildKit dispatch
