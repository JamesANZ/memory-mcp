#!/usr/bin/env node

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';

const CONFIG_DIR = join(homedir(), '.config', 'claude');
const CONFIG_FILE = join(CONFIG_DIR, 'claude_desktop_config.json');

const MCP_CONFIG = {
  "mcpServers": {
    "memory-mcp": {
      "command": "npx",
      "args": ["memory-mcp"],
      "env": {
        "MONGODB_URI": "mongodb://localhost:27017",
        "SHARED_MONGODB_URI": "mongodb://localhost:27017"
      }
    }
  }
};

function setupClaudeConfig() {
  try {
    console.log('🔧 Setting up Claude Desktop configuration for memory-mcp...');
    
    // Create config directory if it doesn't exist
    if (!existsSync(CONFIG_DIR)) {
      mkdirSync(CONFIG_DIR, { recursive: true });
      console.log(`✅ Created Claude config directory: ${CONFIG_DIR}`);
    }
    
    // Check if config file already exists
    let existingConfig: any = {};
    if (existsSync(CONFIG_FILE)) {
      try {
        const existingContent = require(CONFIG_FILE);
        existingConfig = existingContent || {};
        console.log('📄 Found existing Claude configuration');
      } catch (error) {
        console.log('⚠️  Existing config file found but could not be parsed, will create new one');
        existingConfig = {};
      }
    }
    
    // Merge with existing configuration
    const mergedConfig = {
      ...existingConfig,
      mcpServers: {
        ...(existingConfig.mcpServers || {}),
        ...MCP_CONFIG.mcpServers
      }
    };
    
    // Write the configuration
    writeFileSync(CONFIG_FILE, JSON.stringify(mergedConfig, null, 2));
    
    console.log('✅ Claude Desktop configuration updated successfully!');
    console.log(`📁 Config file location: ${CONFIG_FILE}`);
    console.log('');
    console.log('🚀 Next steps:');
    console.log('1. Restart Claude Desktop to load the new MCP server');
    console.log('2. You should see "memory-mcp" available in Claude Desktop');
    console.log('3. Start using memory and context caching features!');
    console.log('');
    console.log('📚 Available tools:');
    console.log('• save-memories, get-memories, add-memories, clear-memories');
    console.log('• archive-context, retrieve-context, score-relevance');
    console.log('• share-memory, get-shared-memories, search-shared-memories-by-keywords');
    console.log('');
    console.log('💡 Tip: Set MONGODB_URI and SHARED_MONGODB_URI environment variables for custom database connections');
    
  } catch (error) {
    console.error('❌ Error setting up Claude configuration:', error);
    console.log('');
    console.log('🔧 Manual setup instructions:');
    console.log('1. Open Claude Desktop');
    console.log('2. Go to Settings > Developer');
    console.log('3. Add MCP server with:');
    console.log('   Command: npx');
    console.log('   Args: memory-mcp');
    console.log('4. Set environment variables:');
    console.log('   MONGODB_URI=mongodb://localhost:27017');
    console.log('   SHARED_MONGODB_URI=mongodb://localhost:27017');
  }
}

// Run the setup
setupClaudeConfig();
