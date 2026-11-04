# Memory MCP Server (Embedded GraphRAG + Vector Memory)

> **Persistent knowledge graph memory and context window caching for LLM conversations.** Built on an embedded **KuzuDB** Cypher graph database with local **HuggingFace** vector embeddings (`Xenova/all-MiniLM-L6-v2`) — zero external database setup required.

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server that provides hybrid semantic vector + multi-hop Cypher graph memory retrieval and context window caching for AI coding environments like Cursor and Claude Desktop.

[![Trust Score](https://archestra.ai/mcp-catalog/api/badge/quality/JamesANZ/memory-mcp)](https://archestra.ai/mcp-catalog/jamesanz__memory-mcp)

## Why Use Memory MCP?

- **Embedded Knowledge Graph (KuzuDB)** – Stores entities, observations, and typed relationships in a local, in-process Cypher graph database (`~/.memory-mcp/graph_db`) with zero external setup.
- **Hybrid Vector + Graph Retrieval** – Uses local 384-d embeddings (`Xenova/all-MiniLM-L6-v2`) and Kuzu `array_cosine_similarity` to find entry nodes, then traverses 1–3 relationship hops via Cypher so the LLM only receives compact, high-signal facts.
- **Context Window Caching** – Intelligent archiving, semantic relevance scoring, and graph-linked summaries (`Summarizes` / `Mentions` edges).
- **Zero-Config Install** – No MongoDB or Neo4j server required.

## Quick Start

**Install in Cursor (Recommended):**

[Install in Cursor](cursor://anysphere.cursor-deeplink/mcp/install?name=memory-mcp&config=eyJtZW1vcnktbWNwIjp7ImNvbW1hbmQiOiJucHgiLCJhcmdzIjpbIi15IiwiQGphbWVzYW56L21lbW9yeS1tY3AiXX19)

**Or install manually:**

```bash
npm install -g @jamesanz/memory-mcp
# Or from source:
git clone https://github.com/JamesANZ/memory-mcp.git
cd memory-mcp && npm install && npm run build
```

## Features

### Knowledge Graph & Hybrid Retrieval Tools
- **`store-graph-memory`** – Upsert structured entities (`name`, `entityType`, `observations[]`) and directed `relations` (`from`, `to`, `relationType`) with automatic 384-d embeddings.
- **`query-memory`** – Hybrid semantic vector + multi-hop Cypher traversal query that returns only the relevant connected subgraph and memory chunks.
- **`remove-graph-entities`** – Remove outdated entities or specific relationships so contradictory facts do not linger.

### Basic Memory Tools
- **`save-memories`** – Save memories to the graph database (overwrites existing)
- **`get-memories`** – Retrieve all stored memory logs
- **`add-memories`** – Append new memories and auto-extract entity mentions
- **`clear-memories`** – Remove all stored memories and graph entities

### Context Window Caching
- **`archive-context`** – Archive conversation context with tags and vector embeddings
- **`retrieve-context`** – Retrieve relevant archived context
- **`score-relevance`** – Score archived content relevance using vector cosine similarity
- **`create-summary`** – Create summaries of archived content linked via `Summarizes` edges
- **`get-conversation-summaries`** – Get all summaries for a conversation
- **`search-context-by-tags`** – Search archived content by tags

## Configuration

By default, the graph database and local embedding model cache are stored in `~/.memory-mcp/`. You can customize these paths via environment variables:

```bash
export MEMORY_DB_PATH="/custom/path/to/graph_db"
export MEMORY_MODEL_CACHE_DIR="/custom/path/to/models"
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
      "args": ["/absolute/path/to/memory-mcp/build/index.js"]
    }
  }
}
```

## Usage Examples

### Store Structured Graph Memory
```json
{
  "tool": "store-graph-memory",
  "arguments": {
    "entities": [
      {
        "name": "memory-mcp",
        "entityType": "Project",
        "observations": ["Uses embedded KuzuDB graph database", "Written in TypeScript with ESM"]
      },
      {
        "name": "KuzuDB",
        "entityType": "Tech",
        "observations": ["In-process property graph database supporting Cypher and vector similarity"]
      }
    ],
    "relations": [
      {
        "from": "memory-mcp",
        "to": "KuzuDB",
        "relationType": "USES_DATABASE"
      }
    ],
    "llm": "claude"
  }
}
```

### Query Subgraph Memory
```json
{
  "tool": "query-memory",
  "arguments": {
    "query": "What database architecture does memory-mcp use?",
    "maxHops": 2,
    "limit": 5
  }
}
```

## Technical Details

**Built with:** Node.js, TypeScript, MCP SDK, KuzuDB (`kuzu`), HuggingFace Transformers (`@huggingface/transformers`), `zod`  
**Storage:** Embedded KuzuDB (`~/.memory-mcp/graph_db`)

## License

MIT
