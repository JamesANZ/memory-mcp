# 🧠 Memory MCP Server

> **Persistent memory and context window caching for LLM conversations.** Save, retrieve, and manage memories with intelligent context archiving. MongoDB-backed storage.

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server that provides memory management and context window caching for AI coding environments like Cursor and Claude Desktop.

[![Trust Score](https://archestra.ai/mcp-catalog/api/badge/quality/JamesANZ/memory-mcp)](https://archestra.ai/mcp-catalog/jamesanz__memory-mcp)

## Why Use Memory MCP?

- 💾 **Persistent Storage** – MongoDB-backed memory that survives sessions
- 🧠 **Context Caching** – Intelligent archiving and retrieval of conversation context
- 🏷️ **Tag-based Search** – Organize and find memories by tags
- 📊 **Relevance Scoring** – Automatically score archived content relevance
- ⚡ **Easy Setup** – One-click install in Cursor or simple manual setup

## Quick Start

Ready to add memory to your AI workflow? Install in seconds:

**Install in Cursor (Recommended):**

[🔗 Install in Cursor](cursor://anysphere.cursor-deeplink/mcp/install?name=memory-mcp&config=eyJtZW1vcnktbWNwIjp7ImNvbW1hbmQiOiJucHgiLCJhcmdzIjpbIi15IiwiQGphbWVzYW56L21lbW9yeS1tY3AiXX19)

**Or install manually:**

```bash
npm install -g @jamesanz/memory-mcp
# Or from source:
git clone https://github.com/JamesANZ/memory-mcp.git
cd memory-mcp && npm install && npm run build
```

## Features

### Basic Memory Tools
- **`save-memories`** – Save memories to database (overwrites existing)
- **`get-memories`** – Retrieve all stored memories
- **`add-memories`** – Append new memories without overwriting
- **`clear-memories`** – Remove all stored memories

### Context Window Caching
- **`archive-context`** – Archive conversation context with tags
- **`retrieve-context`** – Retrieve relevant archived context
- **`score-relevance`** – Score archived content relevance
- **`create-summary`** – Create summaries of archived content
- **`get-conversation-summaries`** – Get all summaries for a conversation
- **`search-context-by-tags`** – Search archived content by tags

## Installation

### Cursor (One-Click)

Click the install link above or use:

```
cursor://anysphere.cursor-deeplink/mcp/install?name=memory-mcp&config=eyJtZW1vcnktbWNwIjp7ImNvbW1hbmQiOiJucHgiLCJhcmdzIjpbIi15IiwiQGphbWVzYW56L21lbW9yeS1tY3AiXX19
```

### Manual Installation

**Requirements:** Node.js 18+, npm, MongoDB

```bash
# Clone and build
git clone https://github.com/JamesANZ/memory-mcp.git
cd memory-mcp
npm install
npm run build

# Set MongoDB connection string
export MONGODB_URI="mongodb://localhost:27017"

# Run server
npm start
```

### Claude Desktop

Add to `claude_desktop_config.json`:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`  
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "memory-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/memory-mcp/build/index.js"],
      "env": {
        "MONGODB_URI": "mongodb://localhost:27017"
      }
    }
  }
}
```

Restart Claude Desktop after configuration.

## Configuration

Set the MongoDB connection string:

```bash
export MONGODB_URI="mongodb://localhost:27017"
```

Default: `mongodb://localhost:27017`

## Usage Examples

### Save Memories
Store memories from a conversation:

```json
{
  "tool": "save-memories",
  "arguments": {
    "memories": ["User prefers TypeScript", "User works on blockchain projects"],
    "llm": "claude",
    "userId": "user123"
  }
}
```

### Retrieve Memories
Get all stored memories:

```json
{
  "tool": "get-memories",
  "arguments": {}
}
```

### Archive Context
Archive conversation context when it gets too long:

```json
{
  "tool": "archive-context",
  "arguments": {
    "conversationId": "conv-123",
    "contextMessages": ["Message 1", "Message 2"],
    "tags": ["coding", "typescript"],
    "llm": "claude"
  }
}
```

### Retrieve Relevant Context
Get archived content relevant to current conversation:

```json
{
  "tool": "retrieve-context",
  "arguments": {
    "conversationId": "conv-123",
    "tags": ["coding"],
    "minRelevanceScore": 0.5,
    "limit": 10
  }
}
```

## Context Window Caching

The system automatically:
- **Archives content** when context usage reaches 80%
- **Retrieves relevant content** when usage drops below 30%
- **Scores relevance** using keyword overlap
- **Creates summaries** to condense long conversations

## Use Cases

- **Long Conversations** – Manage context windows for extended sessions
- **Memory Persistence** – Save important information across sessions
- **Context Retrieval** – Bring back relevant past conversations
- **Research Projects** – Organize and tag research conversations

## Technical Details

**Built with:** Node.js, TypeScript, MCP SDK, MongoDB  
**Dependencies:** `@modelcontextprotocol/sdk`, `mongodb`, `zod`  
**Platforms:** macOS, Windows, Linux

**Storage:** MongoDB (default: `mongodb://localhost:27017`)

## Contributing

⭐ **If this project helps you, please star it on GitHub!** ⭐

Contributions welcome! Please open an issue or submit a pull request.

## License

ISC

## Support

If you find this project useful, consider supporting it:

**⚡ Lightning Network**
```
lnbc1pjhhsqepp5mjgwnvg0z53shm22hfe9us289lnaqkwv8rn2s0rtekg5vvj56xnqdqqcqzzsxqyz5vqsp5gu6vh9hyp94c7t3tkpqrp2r059t4vrw7ps78a4n0a2u52678c7yq9qyyssq7zcferywka50wcy75skjfrdrk930cuyx24rg55cwfuzxs49rc9c53mpz6zug5y2544pt8y9jflnq0ltlha26ed846jh0y7n4gm8jd3qqaautqa
```

**₿ Bitcoin**: [bc1ptzvr93pn959xq4et6sqzpfnkk2args22ewv5u2th4ps7hshfaqrshe0xtp](https://mempool.space/address/bc1ptzvr93pn959xq4et6sqzpfnkk2args22ewv5u2th4ps7hshfaqrshe0xtp)

**Ξ Ethereum/EVM**: [0x42ea529282DDE0AA87B42d9E83316eb23FE62c3f](https://etherscan.io/address/0x42ea529282DDE0AA87B42d9E83316eb23FE62c3f)
