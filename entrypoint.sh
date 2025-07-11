#!/bin/bash
set -e

# Function to log with timestamp
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

log "Starting Claude Docker Action..."

# Validate required environment variables
if [[ -z "${GITHUB_TOKEN:-}" && -z "${INPUT_GITHUB_TOKEN:-}" && -z "${INPUT_ANTHROPIC_API_KEY:-}" && -z "${INPUT_CLAUDE_CODE_OAUTH_TOKEN:-}" ]]; then
    log "ERROR: No authentication method provided. Please set one of:"
    log "  - GITHUB_TOKEN (for GitHub App authentication)"
    log "  - INPUT_GITHUB_TOKEN (for personal token authentication)"
    log "  - INPUT_ANTHROPIC_API_KEY (for Anthropic API authentication)"
    log "  - INPUT_CLAUDE_CODE_OAUTH_TOKEN (for Claude Code OAuth authentication)"
    exit 1
fi

# Validate required GitHub environment variables
if [[ -z "${GITHUB_REPOSITORY:-}" ]]; then
    log "ERROR: GITHUB_REPOSITORY environment variable is required"
    exit 1
fi

if [[ -z "${GITHUB_EVENT_NAME:-}" ]]; then
    log "ERROR: GITHUB_EVENT_NAME environment variable is required"
    exit 1
fi

# Check for configuration validation flag
if [[ "$1" == "--validate-config" ]]; then
    log "Running configuration validation..."
    exec bun run /app/src/main.ts --validate-config
fi

log "Environment validation passed"
log "Repository: ${GITHUB_REPOSITORY}"
log "Event: ${GITHUB_EVENT_NAME}"

# Change to workspace directory if it exists
if [[ -n "${GITHUB_WORKSPACE:-}" && -d "${GITHUB_WORKSPACE}" ]]; then
    log "Changing to workspace directory: ${GITHUB_WORKSPACE}"
    cd "${GITHUB_WORKSPACE}"
else
    log "Using current directory as workspace"
fi

# Execute the main application
log "Executing main application..."
exec bun run /app/src/main.ts