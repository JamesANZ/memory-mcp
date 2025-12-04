#!/usr/bin/env node

/**
 * Generate a Cursor MCP install deeplink for memory-mcp
 * 
 * Usage: node scripts/generate-cursor-install-link.js
 */

const config = {
  "memory-mcp": {
    "command": "npx",
    "args": ["-y", "@jamesanz/memory-mcp"]
  }
};

// Convert to JSON string and Base64 encode
const configString = JSON.stringify(config);
const base64Config = Buffer.from(configString).toString('base64');

// Create the deeplink
const deeplink = `cursor://anysphere.cursor-deeplink/mcp/install?name=memory-mcp&config=${base64Config}`;

console.log('\n🔗 Cursor MCP Install Link:\n');
console.log(deeplink);
console.log('\n📋 Configuration:\n');
console.log(JSON.stringify(config, null, 2));
console.log('\n💡 Note: You will need to configure your MongoDB connection string in Cursor settings after installation.\n');
console.log('   Required environment variable: MONGODB_URI\n');

