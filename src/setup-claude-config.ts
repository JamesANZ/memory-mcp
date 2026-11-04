#!/usr/bin/env node

import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const CONFIG_DIR = join(homedir(), ".config", "claude");
const CONFIG_FILE = join(CONFIG_DIR, "claude_desktop_config.json");

const MCP_CONFIG = {
  mcpServers: {
    "memory-mcp": {
      command: "npx",
      args: ["-y", "@jamesanz/memory-mcp"],
    },
  },
};

function setupClaudeConfig() {
  try {
    console.log("Setting up Claude Desktop configuration for memory-mcp...");

    if (!existsSync(CONFIG_DIR)) {
      mkdirSync(CONFIG_DIR, { recursive: true });
      console.log(`Created Claude config directory: ${CONFIG_DIR}`);
    }

    let existingConfig: any = {};
    if (existsSync(CONFIG_FILE)) {
      try {
        existingConfig = JSON.parse(readFileSync(CONFIG_FILE, "utf8")) || {};
        console.log("Found existing Claude configuration");
      } catch {
        console.log(
          "Existing config file found but could not be parsed, will create new one",
        );
        existingConfig = {};
      }
    }

    const mergedConfig = {
      ...existingConfig,
      mcpServers: {
        ...(existingConfig.mcpServers || {}),
        ...MCP_CONFIG.mcpServers,
      },
    };

    writeFileSync(CONFIG_FILE, JSON.stringify(mergedConfig, null, 2));

    console.log("Claude Desktop configuration updated successfully!");
    console.log(`Config file location: ${CONFIG_FILE}`);
    console.log("");
    console.log("Next steps:");
    console.log("1. Restart Claude Desktop to load the new MCP server");
    console.log('2. You should see "memory-mcp" available in Claude Desktop');
    console.log("3. Start using knowledge graph memory and context caching!");
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
