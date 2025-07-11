#!/usr/bin/env bun

/**
 * Claude Code runner module
 * Handles execution of Claude Code CLI with proper configuration
 */

import { spawn } from 'child_process';
import { unlink, writeFile, stat } from 'fs/promises';
import { createWriteStream } from 'fs';
import { $ } from 'bun';
import { logger } from '../utils/logger';
import type { DockerActionConfig } from '../config/environment';
import { parseCustomEnvVars } from './auth';

const PIPE_PATH = '/tmp/claude_prompt_pipe';
const EXECUTION_FILE = '/tmp/claude-execution-output.json';
const BASE_ARGS = ['-p', '--verbose', '--output-format', 'stream-json'];

export interface ClaudeRunOptions {
  promptPath: string;
  config: DockerActionConfig;
  mcpConfig?: string;
}

export interface ClaudeResult {
  success: boolean;
  executionFile?: string;
  exitCode: number;
}

function prepareClaudeArgs(config: DockerActionConfig, mcpConfig?: string): string[] {
  const claudeArgs = [...BASE_ARGS];

  if (config.allowedTools) {
    claudeArgs.push('--allowedTools', config.allowedTools);
  }
  if (config.disallowedTools) {
    claudeArgs.push('--disallowedTools', config.disallowedTools);
  }
  if (config.maxTurns) {
    claudeArgs.push('--max-turns', config.maxTurns.toString());
  }
  if (mcpConfig) {
    claudeArgs.push('--mcp-config', mcpConfig);
  }
  if (config.customInstructions) {
    claudeArgs.push('--append-system-prompt', config.customInstructions);
  }
  if (config.fallbackModel) {
    claudeArgs.push('--fallback-model', config.fallbackModel);
  }

  return claudeArgs;
}

function prepareEnvironment(config: DockerActionConfig): Record<string, string> {
  const env = { ...process.env };

  // Add model configuration
  if (config.model) {
    env.ANTHROPIC_MODEL = config.model;
  }

  // Add custom environment variables
  if (config.claudeEnv) {
    const customEnv = parseCustomEnvVars(config.claudeEnv);
    Object.assign(env, customEnv);
    
    if (Object.keys(customEnv).length > 0) {
      const envKeys = Object.keys(customEnv).join(', ');
      logger.info(`Custom environment variables: ${envKeys}`);
    }
  }

  return env;
}

export async function runClaude(options: ClaudeRunOptions): Promise<ClaudeResult> {
  const { promptPath, config, mcpConfig } = options;
  const claudeArgs = prepareClaudeArgs(config, mcpConfig);
  const env = prepareEnvironment(config);

  // Create a named pipe
  try {
    await unlink(PIPE_PATH);
  } catch (e) {
    // Ignore if file doesn't exist
  }

  try {
    // Create the named pipe
    await $`mkfifo "${PIPE_PATH}"`;

    // Log prompt file size
    let promptSize = 'unknown';
    try {
      const stats = await stat(promptPath);
      promptSize = stats.size.toString();
    } catch (e) {
      logger.warn('Could not stat prompt file');
    }

    logger.info(`Running Claude with prompt from file: ${promptPath} (${promptSize} bytes)`);
    logger.debug(`Claude arguments: ${claudeArgs.join(' ')}`);

    // Start sending prompt to pipe in background
    const catProcess = spawn('cat', [promptPath], {
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    const pipeStream = createWriteStream(PIPE_PATH);
    catProcess.stdout.pipe(pipeStream);

    catProcess.on('error', (error: Error) => {
      logger.error('Error reading prompt file:', error);
      pipeStream.destroy();
    });

    const claudeProcess = spawn('claude', claudeArgs, {
      stdio: ['pipe', 'pipe', 'inherit'],
      env,
    });

    // Handle Claude process errors
    claudeProcess.on('error', (error: Error) => {
      logger.error('Error spawning Claude process:', error);
      pipeStream.destroy();
    });

    // Capture output for parsing execution metrics
    let output = '';
    claudeProcess.stdout.on('data', (data: Buffer) => {
      const text = data.toString();

      // Try to parse as JSON and pretty print if it's on a single line
      const lines = text.split('\n');
      lines.forEach((line: string, index: number) => {
        if (line.trim() === '') return;

        try {
          // Check if this line is a JSON object
          const parsed = JSON.parse(line);
          const prettyJson = JSON.stringify(parsed, null, 2);
          process.stdout.write(prettyJson);
          if (index < lines.length - 1 || text.endsWith('\n')) {
            process.stdout.write('\n');
          }
        } catch (e) {
          // Not a JSON object, print as is
          process.stdout.write(line);
          if (index < lines.length - 1 || text.endsWith('\n')) {
            process.stdout.write('\n');
          }
        }
      });

      output += text;
    });

    // Handle stdout errors
    claudeProcess.stdout.on('error', (error: Error) => {
      logger.error('Error reading Claude stdout:', error);
    });

    // Pipe from named pipe to Claude
    const pipeProcess = spawn('cat', [PIPE_PATH]);
    pipeProcess.stdout.pipe(claudeProcess.stdin);

    // Handle pipe process errors
    pipeProcess.on('error', (error: Error) => {
      logger.error('Error reading from named pipe:', error);
      claudeProcess.kill('SIGTERM');
    });

    // Wait for Claude to finish with timeout
    const timeoutMs = config.timeoutMinutes * 60 * 1000;
    const exitCode = await new Promise<number>((resolve) => {
      let resolved = false;

      // Set a timeout for the process
      const timeoutId = setTimeout(() => {
        if (!resolved) {
          logger.error(`Claude process timed out after ${timeoutMs / 1000} seconds`);
          claudeProcess.kill('SIGTERM');
          
          // Give it 5 seconds to terminate gracefully, then force kill
          setTimeout(() => {
            try {
              claudeProcess.kill('SIGKILL');
            } catch (e) {
              // Process may already be dead
            }
          }, 5000);
          
          resolved = true;
          resolve(124); // Standard timeout exit code
        }
      }, timeoutMs);

      claudeProcess.on('close', (code: number | null) => {
        if (!resolved) {
          clearTimeout(timeoutId);
          resolved = true;
          resolve(code || 0);
        }
      });

      claudeProcess.on('error', (error: Error) => {
        if (!resolved) {
          logger.error('Claude process error:', error);
          clearTimeout(timeoutId);
          resolved = true;
          resolve(1);
        }
      });
    });

    // Clean up processes
    try {
      catProcess.kill('SIGTERM');
    } catch (e) {
      // Process may already be dead
    }
    try {
      pipeProcess.kill('SIGTERM');
    } catch (e) {
      // Process may already be dead
    }

    // Clean up pipe file
    try {
      await unlink(PIPE_PATH);
    } catch (e) {
      // Ignore errors during cleanup
    }

    // Process output and create execution file
    let executionFile: string | undefined;

    if (exitCode === 0) {
      try {
        await writeFile('/tmp/output.txt', output);

        // Process output.txt into JSON and save to execution file
        const { stdout: jsonOutput } = await $`jq -s '.' /tmp/output.txt`;
        await writeFile(EXECUTION_FILE, jsonOutput);

        executionFile = EXECUTION_FILE;
        logger.info(`Execution log saved to ${EXECUTION_FILE}`);
      } catch (e) {
        logger.warn(`Failed to process output for execution metrics: ${e}`);
      }
    } else {
      // Still try to save execution file if we have output
      if (output) {
        try {
          await writeFile('/tmp/output.txt', output);
          const { stdout: jsonOutput } = await $`jq -s '.' /tmp/output.txt`;
          await writeFile(EXECUTION_FILE, jsonOutput);
          executionFile = EXECUTION_FILE;
        } catch (e) {
          // Ignore errors when processing output during failure
        }
      }
    }

    const success = exitCode === 0;
    logger.info(`Claude execution ${success ? 'completed successfully' : 'failed'} with exit code: ${exitCode}`);

    return {
      success,
      executionFile,
      exitCode,
    };
  } catch (error) {
    logger.error('Failed to run Claude:', error);
    throw new Error(`Failed to run Claude: ${error}`);
  }
}