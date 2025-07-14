# Use Node.js 18 Alpine for compatibility and smaller size
FROM node:18-alpine

# Install system dependencies
RUN apk add --no-cache \
    bash \
    git \
    curl \
    jq \
    ca-certificates

# Install Bun 1.2.11 for runtime compatibility
RUN curl -fsSL https://bun.sh/install | bash -s -- bun-v1.2.11 && \
    ln -s /root/.bun/bin/bun /usr/local/bin/bun

# Set working directory
WORKDIR /app

# Copy package files first for better Docker layer caching
COPY package.json tsconfig.json ./

# Install dependencies
RUN bun install

# Copy source code
COPY src/ ./src/
COPY entrypoint.sh ./

# Make entrypoint executable
RUN chmod +x entrypoint.sh

# Install Claude Code globally
RUN npm install -g @anthropic-ai/claude-code@1.0.48

# Set GITHUB_ACTION_PATH environment variable for MCP servers
ENV GITHUB_ACTION_PATH=/app

# Set the entrypoint
ENTRYPOINT ["/app/entrypoint.sh"]