#!/usr/bin/env node

import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { homedir, platform } from "os";

function getClaudeDesktopConfigPath(): string {
  const home = homedir();
  const os = platform();
  if (os === "darwin") {
    return join(
      home,
      "Library",
      "Application Support",
      "Claude",
      "claude_desktop_config.json",
    );
  }
  if (os === "win32") {
    const appData = process.env.APPDATA || join(home, "AppData", "Roaming");
    return join(appData, "Claude", "claude_desktop_config.json");
  }
  return join(home, ".config", "Claude", "claude_desktop_config.json");
}

const MCP_SERVER_ENTRY = {
  "memory-mcp": {
    command: "npx",
    args: ["-y", "@jamesanz/memory-mcp"],
  },
};

function updateConfigFile(configFile: string, label: string) {
  const dir = dirname(configFile);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  let existingConfig: any = {};
  if (existsSync(configFile)) {
    try {
      existingConfig = JSON.parse(readFileSync(configFile, "utf8")) || {};
    } catch {
      existingConfig = {};
    }
  }

  const mergedConfig = {
    ...existingConfig,
    mcpServers: {
      ...(existingConfig.mcpServers || {}),
      ...MCP_SERVER_ENTRY,
    },
  };

  writeFileSync(configFile, JSON.stringify(mergedConfig, null, 2));
  console.log(`Updated ${label}: ${configFile}`);
}

function setupClaudeConfig() {
  try {
    console.log("Setting up Claude configuration for memory-mcp...");

    // 1. Claude Desktop config
    const desktopConfig = getClaudeDesktopConfigPath();
    updateConfigFile(desktopConfig, "Claude Desktop config");

    // 2. Claude Code CLI config (~/.claude.json) if present
    const claudeCodeConfig = join(homedir(), ".claude.json");
    if (existsSync(claudeCodeConfig)) {
      updateConfigFile(claudeCodeConfig, "Claude Code config");
    }

    console.log("");
    console.log("Available tools:");
    console.log("- store-graph-memory, query-memory, remove-graph-entities");
    console.log("- save-memories, get-memories, add-memories, clear-memories");
    console.log("- archive-context, retrieve-context, score-relevance");
  } catch (error) {
    console.error("Error setting up Claude configuration:", error);
  }
}

setupClaudeConfig();
