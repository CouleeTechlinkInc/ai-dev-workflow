import { $ } from "bun";
import { homedir } from "os";
import { logger } from "../utils/logger";

export async function setupClaudeCodeSettings() {
  const home = homedir();
  const settingsPath = `${home}/.claude/settings.json`;
  logger.info(`Setting up Claude settings at: ${settingsPath}`);

  // Ensure .claude directory exists
  logger.info(`Creating .claude directory...`);
  await $`mkdir -p ${home}/.claude`.quiet();

  let settings: Record<string, unknown> = {};
  try {
    const existingSettings = await $`cat ${settingsPath}`.quiet().text();
    if (existingSettings.trim()) {
      settings = JSON.parse(existingSettings);
      logger.info(
        `Found existing settings:`,
        JSON.stringify(settings, null, 2),
      );
    } else {
      logger.info(`Settings file exists but is empty`);
    }
  } catch (e) {
    logger.info(`No existing settings file found, creating new one`);
  }

  settings.enableAllProjectMcpServers = true;
  logger.info(`Updated settings with enableAllProjectMcpServers: true`);

  await $`echo ${JSON.stringify(settings, null, 2)} > ${settingsPath}`.quiet();
  logger.info(`Settings saved successfully`);
}