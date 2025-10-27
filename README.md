# Memory MCP
[![Trust Score](https://archestra.ai/mcp-catalog/api/badge/quality/JamesANZ/memory-mcp)](https://archestra.ai/mcp-catalog/jamesanz__memory-mcp)

A Model Context Protocol (MCP) server for logging and retrieving memories from LLM conversations with intelligent context window caching capabilities.

## Features

- **Save Memories**: Store memories from LLM conversations with timestamps and LLM identification
- **Retrieve Memories**: Get all stored memories with detailed metadata
- **Add Memories**: Append new memories without overwriting existing ones
- **Clear Memories**: Remove all stored memories
- **Context Window Caching**: Archive, retrieve, and summarize conversation context
- **Relevance Scoring**: Automatically score archived content relevance to current context
- **Tag-based Search**: Categorize and search context by tags
- **Conversation Orchestration**: External system to manage context window caching
- **MongoDB Storage**: Persistent storage using MongoDB database

## Installation

1. Install dependencies:

```bash
npm install
```

2. Build the project:

```bash
npm run build
```

## Configuration

Set the MongoDB connection string via environment variable:

```bash
export MONGODB_URI="mongodb://localhost:27017"
```

Default: `mongodb://localhost:27017`

## Usage

### Running the MCP Server

Start the MCP server:

```bash
npm start
```

### Running the Conversation Orchestrator Demo

Try the interactive CLI demo:

```bash
npm run cli
```

The CLI demo allows you to:

- Add messages to simulate conversation
- See automatic archiving when context gets full
- Trigger manual archiving and retrieval
- Create summaries of archived content
- Monitor conversation status and get recommendations

### Basic Memory Tools

1. **save-memories**: Save all memories to the database, overwriting existing ones
   - `memories`: Array of memory strings to save
   - `llm`: Name of the LLM (e.g., 'chatgpt', 'claude')
   - `userId`: Optional user identifier

2. **get-memories**: Retrieve all memories from the database
   - No parameters required

3. **add-memories**: Add new memories to the database without overwriting existing ones
   - `memories`: Array of memory strings to add
   - `llm`: Name of the LLM (e.g., 'chatgpt', 'claude')
   - `userId`: Optional user identifier

4. **clear-memories**: Clear all memories from the database
   - No parameters required

### Context Window Caching Tools

5. **archive-context**: Archive context messages for a conversation with tags and metadata
   - `conversationId`: Unique identifier for the conversation
   - `contextMessages`: Array of context messages to archive
   - `tags`: Tags for categorizing the archived content
   - `llm`: Name of the LLM (e.g., 'chatgpt', 'claude')
   - `userId`: Optional user identifier

6. **retrieve-context**: Retrieve relevant archived context for a conversation
   - `conversationId`: Unique identifier for the conversation
   - `tags`: Optional tags to filter by
   - `minRelevanceScore`: Minimum relevance score (0-1, default: 0.1)
   - `limit`: Maximum number of items to return (default: 10)

7. **score-relevance**: Score the relevance of archived context against current conversation context
   - `conversationId`: Unique identifier for the conversation
   - `currentContext`: Current conversation context to compare against
   - `llm`: Name of the LLM (e.g., 'chatgpt', 'claude')

8. **create-summary**: Create a summary of context items and link them to the summary
   - `conversationId`: Unique identifier for the conversation
   - `contextItems`: Context items to summarize
   - `summaryText`: Human-provided summary text
   - `llm`: Name of the LLM (e.g., 'chatgpt', 'claude')
   - `userId`: Optional user identifier

9. **get-conversation-summaries**: Get all summaries for a specific conversation
   - `conversationId`: Unique identifier for the conversation

10. **search-context-by-tags**: Search archived context and summaries by tags
    - `tags`: Tags to search for

### Example Usage in LLM

#### Basic Memory Operations

1. **Save all memories** (overwrites existing):

   ```
   User: "Save all my memories from this conversation to the MCP server"
   LLM: [Uses save-memories tool with current conversation memories]
   ```

2. **Retrieve all memories**:
   ```
   User: "Get all my memories from the MCP server"
   LLM: [Uses get-memories tool to retrieve stored memories]
   ```

#### Context Window Caching Workflow

1. **Archive context when window gets full**:

   ```
   User: "The conversation is getting long, archive the early parts"
   LLM: [Uses archive-context tool to store old messages with tags]
   ```

2. **Score relevance of archived content**:

   ```
   User: "How relevant is the archived content to our current discussion?"
   LLM: [Uses score-relevance tool to evaluate archived content]
   ```

3. **Retrieve relevant archived context**:

   ```
   User: "Bring back the relevant archived information"
   LLM: [Uses retrieve-context tool to get relevant archived content]
   ```

4. **Create summaries for long conversations**:
   ```
   User: "Summarize the early parts of our conversation"
   LLM: [Uses create-summary tool to condense archived content]
   ```

## Conversation Orchestration System

The `ConversationOrchestrator` class provides automatic context window management:

### Key Features

- **Automatic Archiving**: Archives content when context usage reaches 80%
- **Intelligent Retrieval**: Retrieves relevant content when usage drops below 30%
- **Relevance Scoring**: Uses keyword overlap to score archived content relevance
- **Smart Tagging**: Automatically generates tags based on content keywords
- **Conversation State Management**: Tracks active conversations and their context
- **Recommendations**: Provides suggestions for optimal context management

### Usage Example

```typescript
import { ConversationOrchestrator } from "./orchestrator.js";

const orchestrator = new ConversationOrchestrator(8000); // 8k word limit

// Add a message (triggers automatic archiving/retrieval)
const result = await orchestrator.addMessage(
  "conversation-123",
  "This is a new message in the conversation",
  "claude",
);

// Check if archiving is needed
if (result.archiveDecision?.shouldArchive) {
  await orchestrator.executeArchive(result.archiveDecision, result.state);
}

// Check if retrieval is needed
if (result.retrievalDecision?.shouldRetrieve) {
  await orchestrator.executeRetrieval(result.retrievalDecision, result.state);
}
```

## Database Schema

### Basic Memory Structure

```typescript
type BasicMemory = {
  _id: ObjectId;
  memories: string[]; // Array of memory strings
  timestamp: Date; // When memories were saved
  llm: string; // LLM identifier (e.g., 'chatgpt', 'claude')
  userId?: string; // Optional user identifier
};
```

### Extended Memory Structure (Context Caching)

```typescript
type ExtendedMemory = {
  _id: ObjectId;
  memories: string[]; // Array of memory strings
  timestamp: Date; // When memories were saved
  llm: string; // LLM identifier
  userId?: string; // Optional user identifier
  conversationId?: string; // Unique conversation identifier
  contextType?: "active" | "archived" | "summary";
  relevanceScore?: number; // 0-1 relevance score
  tags?: string[]; // Categorization tags
  parentContextId?: ObjectId; // Reference to original content for summaries
  messageIndex?: number; // Order within conversation
  wordCount?: number; // Size tracking
  summaryText?: string; // Condensed version
};
```

## Context Window Caching Workflow

The orchestration system automatically:

1. **Monitors conversation length** and context usage
2. **Archives content** when context usage reaches 80%
3. **Scores relevance** of archived content against current context
4. **Retrieves relevant content** when usage drops below 30%
5. **Creates summaries** to condense very long conversations

### Key Features

- **Conversation Grouping**: All archived content is linked to specific conversation IDs
- **Relevance Scoring**: Simple keyword overlap scoring (can be enhanced with semantic similarity)
- **Tag-based Organization**: Categorize content for easy retrieval
- **Summary Linking**: Preserve links between summaries and original content
- **Backward Compatibility**: All existing memory functions work unchanged
- **Automatic Management**: No manual intervention required for basic operations

## Development

To run in development mode:

```bash
npm run build
node build/index.js
```

To run the CLI demo:

```bash
npm run cli
```

## License

ISC
