import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  connect,
  saveMemories,
  getAllMemories,
  clearAllMemories,
  closeDatabase,
  archiveContext,
  retrieveContext,
  scoreRelevance,
  createSummary,
  getConversationSummaries,
  searchContextByTags,
  upsertGraphMemory,
  queryKnowledgeGraph,
  removeGraphEntities,
} from "./db.js";
import { Memory } from "./types.js";

const server = new McpServer({
  name: "memory-mcp",
  version: "2.0.0",
  capabilities: {
    resources: {},
    tools: {},
  },
});

// ============================================================================
// Knowledge Graph & Hybrid Semantic Retrieval Tools (Primary)
// ============================================================================

server.tool(
  "store-graph-memory",
  "Store structured entities, observations, and relationships into the embedded KuzuDB knowledge graph with local vector embeddings",
  {
    entities: z
      .array(
        z.object({
          name: z
            .string()
            .describe("Unique entity name (e.g., 'memory-mcp', 'TypeScript', 'User')"),
          entityType: z
            .string()
            .describe("Category of entity (e.g., 'Project', 'Person', 'Tech', 'Preference')"),
          observations: z
            .array(z.string())
            .describe("Atomic facts or observations about this entity"),
        }),
      )
      .default([])
      .describe("Entities and their observations to upsert into the graph"),
    relations: z
      .array(
        z.object({
          from: z.string().describe("Source entity name"),
          to: z.string().describe("Target entity name"),
          relationType: z
            .string()
            .describe("Relationship type in UPPER_SNAKE_CASE (e.g., 'USES', 'PREFERS', 'DEPENDS_ON')"),
          weight: z
            .number()
            .min(0)
            .max(1)
            .optional()
            .describe("Optional relationship weight (0-1, default 1.0)"),
        }),
      )
      .default([])
      .describe("Directed relationships between entities"),
    llm: z
      .string()
      .default("cursor")
      .describe("Name of the LLM storing the memory"),
    userId: z.string().optional().describe("Optional user identifier"),
  },
  async ({ entities, relations, llm, userId }) => {
    try {
      await connect();
      const { entitiesUpserted, relationsUpserted } = await upsertGraphMemory(
        entities,
        relations,
        llm,
        userId,
      );
      return {
        content: [
          {
            type: "text",
            text: `Successfully stored knowledge graph memory.\nEntities upserted: ${entitiesUpserted}\nRelations upserted: ${relationsUpserted}\nLLM: ${llm}`,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error storing graph memory: ${error.message || "Unknown error"}`,
          },
        ],
      };
    }
  },
);

server.tool(
  "query-memory",
  "Query the knowledge graph using hybrid semantic vector similarity and multi-hop Cypher traversal to retrieve only relevant connected facts",
  {
    query: z
      .string()
      .describe("Natural language query or topic to retrieve relevant memories for"),
    maxHops: z
      .number()
      .int()
      .min(1)
      .max(3)
      .optional()
      .default(2)
      .describe("Number of relationship hops to traverse from matched seed entities (1-3)"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .default(10)
      .describe("Maximum number of seed entities and memory chunks to return"),
    minScore: z
      .number()
      .min(0)
      .max(1)
      .optional()
      .default(0.15)
      .describe("Minimum relevance score threshold (0-1)"),
  },
  async ({ query, maxHops, limit, minScore }) => {
    try {
      await connect();
      const subgraph = await queryKnowledgeGraph(
        query,
        maxHops,
        limit,
        minScore,
      );

      if (
        subgraph.entities.length === 0 &&
        subgraph.relations.length === 0 &&
        subgraph.relevantChunks.length === 0
      ) {
        return {
          content: [
            {
              type: "text",
              text: `No relevant graph memories found for query: "${query}".`,
            },
          ],
        };
      }

      let result = `**Subgraph Memory Retrieval for "${query}"**\n\n`;

      if (subgraph.entities.length > 0) {
        result += `### Entities (${subgraph.entities.length})\n`;
        for (const ent of subgraph.entities) {
          const hopLabel =
            ent.hopDistance === 0 ? "direct match" : `${ent.hopDistance}-hop`;
          result += `- **${ent.name}** \`[${ent.entityType}]\` (score: ${ent.score.toFixed(3)}, ${hopLabel})\n`;
          for (const obs of ent.observations) {
            result += `  - ${obs}\n`;
          }
        }
        result += `\n`;
      }

      if (subgraph.relations.length > 0) {
        result += `### Relationships (${subgraph.relations.length})\n`;
        for (const rel of subgraph.relations) {
          result += `- (${rel.from} [${rel.fromType}]) —[\`${rel.relationType}\`]→ (${rel.to} [${rel.toType}])\n`;
        }
        result += `\n`;
      }

      if (subgraph.relevantChunks.length > 0) {
        result += `### Relevant Memory Chunks (${subgraph.relevantChunks.length})\n`;
        subgraph.relevantChunks.forEach((chunk, i) => {
          const score = (chunk.relevanceScore || 0).toFixed(3);
          const tags =
            chunk.tags && chunk.tags.length > 0
              ? ` | tags: ${chunk.tags.join(", ")}`
              : "";
          result += `${i + 1}. \`[score: ${score}${tags}]\` ${chunk.memories.join(" ")}\n`;
        });
      }

      return {
        content: [
          {
            type: "text",
            text: result.trim(),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error querying memory graph: ${error.message || "Unknown error"}`,
          },
        ],
      };
    }
  },
);

server.tool(
  "remove-graph-entities",
  "Remove outdated entities or specific relationships from the knowledge graph",
  {
    entityNames: z
      .array(z.string())
      .optional()
      .default([])
      .describe("Names of entities to detach and delete"),
    relations: z
      .array(
        z.object({
          from: z.string(),
          to: z.string(),
          relationType: z.string(),
        }),
      )
      .optional()
      .default([])
      .describe("Specific directed relationships to delete"),
  },
  async ({ entityNames, relations }) => {
    try {
      await connect();
      const { deletedEntities, deletedRelations } = await removeGraphEntities(
        entityNames,
        relations,
      );
      return {
        content: [
          {
            type: "text",
            text: `Removed ${deletedEntities} entities and ${deletedRelations} relationships from graph.`,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error removing graph entities: ${error.message || "Unknown error"}`,
          },
        ],
      };
    }
  },
);

// ============================================================================
// Backwards-Compatible Memory & Context Window Caching Tools
// ============================================================================

// Tool to save memories (overwrites existing ones)
server.tool(
  "save-memories",
  "Save all memories to the database, overwriting existing ones",
  {
    memories: z.array(z.string()).describe("Array of memory strings to save"),
    llm: z.string().describe("Name of the LLM (e.g., 'chatgpt', 'claude')"),
    userId: z.string().optional().describe("Optional user identifier"),
  },
  async ({ memories, llm, userId }) => {
    try {
      await connect();
      await clearAllMemories();
      await saveMemories(memories, llm, userId);
      return {
        content: [
          {
            type: "text",
            text: `Successfully saved ${memories.length} memories to graph database.\nLLM: ${llm}\nTimestamp: ${new Date().toISOString()}`,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error saving memories: ${error.message || "Unknown error"}`,
          },
        ],
      };
    }
  },
);

// Tool to retrieve all memories
server.tool(
  "get-memories",
  "Retrieve stored memories from the database (use query-memory for targeted graph retrieval)",
  {},
  async () => {
    try {
      await connect();
      const memories = await getAllMemories();
      if (memories.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "No memories found in database.",
            },
          ],
        };
      }
      let result = `**Memory Log (${memories.length} entries)**\n\n`;
      memories.forEach((memory, index) => {
        result += `**Entry ${index + 1}**\n`;
        result += `LLM: ${memory.llm}\n`;
        result += `Timestamp: ${memory.timestamp.toISOString()}\n`;
        if (memory.userId) {
          result += `User ID: ${memory.userId}\n`;
        }
        result += `Memories (${memory.memories.length}):\n`;
        memory.memories.forEach((mem, memIndex) => {
          result += `${memIndex + 1}. ${mem}\n`;
        });
        result += `\n---\n\n`;
      });
      return {
        content: [
          {
            type: "text",
            text: result,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error retrieving memories: ${error.message || "Unknown error"}`,
          },
        ],
      };
    }
  },
);

// Tool to add memories without overwriting
server.tool(
  "add-memories",
  "Add new memories to the database without overwriting existing ones",
  {
    memories: z.array(z.string()).describe("Array of memory strings to add"),
    llm: z.string().describe("Name of the LLM (e.g., 'chatgpt', 'claude')"),
    userId: z.string().optional().describe("Optional user identifier"),
  },
  async ({ memories, llm, userId }) => {
    try {
      await connect();
      await saveMemories(memories, llm, userId);
      return {
        content: [
          {
            type: "text",
            text: `Successfully added ${memories.length} new memories to graph database.\nLLM: ${llm}\nTimestamp: ${new Date().toISOString()}`,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error adding memories: ${error.message || "Unknown error"}`,
          },
        ],
      };
    }
  },
);

// Tool to clear all memories
server.tool(
  "clear-memories",
  "Clear all memories and entities from the database",
  {},
  async () => {
    try {
      await connect();
      const deletedCount = await clearAllMemories();
      return {
        content: [
          {
            type: "text",
            text: `Successfully cleared ${deletedCount} memory/entity entries from database.`,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error clearing memories: ${error.message || "Unknown error"}`,
          },
        ],
      };
    }
  },
);

// Tool to archive context
server.tool(
  "archive-context",
  "Archive context messages for a conversation with tags and semantic embeddings",
  {
    conversationId: z
      .string()
      .describe("Unique identifier for the conversation"),
    contextMessages: z
      .array(z.string())
      .describe("Array of context messages to archive"),
    tags: z
      .array(z.string())
      .describe("Tags for categorizing the archived content"),
    llm: z.string().describe("Name of the LLM (e.g., 'chatgpt', 'claude')"),
    userId: z.string().optional().describe("Optional user identifier"),
  },
  async ({ conversationId, contextMessages, tags, llm, userId }) => {
    try {
      await connect();
      const archivedCount = await archiveContext(
        conversationId,
        contextMessages,
        tags,
        llm,
        userId,
      );
      return {
        content: [
          {
            type: "text",
            text: `Successfully archived ${archivedCount} context items for conversation ${conversationId}.\nTags: ${tags.join(", ")}\nLLM: ${llm}`,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error archiving context: ${error.message || "Unknown error"}`,
          },
        ],
      };
    }
  },
);

// Tool to retrieve context
server.tool(
  "retrieve-context",
  "Retrieve relevant archived context for a conversation",
  {
    conversationId: z
      .string()
      .describe("Unique identifier for the conversation"),
    tags: z.array(z.string()).optional().describe("Optional tags to filter by"),
    minRelevanceScore: z
      .number()
      .min(0)
      .max(1)
      .optional()
      .default(0.1)
      .describe("Minimum relevance score (0-1)"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .default(10)
      .describe("Maximum number of items to return"),
  },
  async ({ conversationId, tags, minRelevanceScore, limit }) => {
    try {
      await connect();
      const contextItems = await retrieveContext(
        conversationId,
        tags,
        minRelevanceScore,
        limit,
      );

      if (contextItems.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No relevant archived context found for conversation ${conversationId}.`,
            },
          ],
        };
      }

      let result = `**Retrieved Context for ${conversationId} (${contextItems.length} items)**\n\n`;

      contextItems.forEach((item, index) => {
        result += `**Item ${index + 1}**\n`;
        result += `Relevance Score: ${(item.relevanceScore || 0).toFixed(3)}\n`;
        result += `Tags: ${(item.tags || []).join(", ")}\n`;
        result += `Word Count: ${item.wordCount || 0}\n`;
        result += `Timestamp: ${item.timestamp.toISOString()}\n`;
        result += `Content:\n${item.memories.join("\n")}\n\n---\n\n`;
      });

      return {
        content: [
          {
            type: "text",
            text: result,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error retrieving context: ${error.message || "Unknown error"}`,
          },
        ],
      };
    }
  },
);

// Tool to score relevance
server.tool(
  "score-relevance",
  "Score the semantic relevance of archived context against current conversation context using vector embeddings",
  {
    conversationId: z
      .string()
      .describe("Unique identifier for the conversation"),
    currentContext: z
      .string()
      .describe("Current conversation context to compare against"),
    llm: z.string().describe("Name of the LLM (e.g., 'chatgpt', 'claude')"),
  },
  async ({ conversationId, currentContext, llm }) => {
    try {
      await connect();
      const scoredCount = await scoreRelevance(
        conversationId,
        currentContext,
        llm,
      );
      return {
        content: [
          {
            type: "text",
            text: `Successfully scored semantic relevance for ${scoredCount} archived items in conversation ${conversationId}.\nCurrent context length: ${currentContext.split(/\s+/).length} words`,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error scoring relevance: ${error.message || "Unknown error"}`,
          },
        ],
      };
    }
  },
);

// Tool to create summary
server.tool(
  "create-summary",
  "Create a summary of context items and link them via Summarizes graph edges",
  {
    conversationId: z
      .string()
      .describe("Unique identifier for the conversation"),
    contextItems: z
      .array(
        z.object({
          _id: z.string().optional(),
          memories: z.array(z.string()),
          timestamp: z.string(),
          llm: z.string(),
          userId: z.string().optional(),
          conversationId: z.string().optional(),
          contextType: z.string().optional(),
          relevanceScore: z.number().optional(),
          tags: z.array(z.string()).optional(),
          parentContextId: z.string().optional(),
          messageIndex: z.number().optional(),
          wordCount: z.number().optional(),
          summaryText: z.string().optional(),
        }),
      )
      .describe("Context items to summarize"),
    summaryText: z.string().describe("Summary text"),
    llm: z.string().describe("Name of the LLM (e.g., 'chatgpt', 'claude')"),
    userId: z.string().optional().describe("Optional user identifier"),
  },
  async ({ conversationId, contextItems, summaryText, llm, userId }) => {
    try {
      await connect();

      const convertedItems: Memory[] = contextItems.map((item) => ({
        ...item,
        timestamp: new Date(item.timestamp),
        contextType: item.contextType as
          | "active"
          | "archived"
          | "summary"
          | undefined,
      }));

      const summaryId = await createSummary(
        conversationId,
        convertedItems,
        summaryText,
        llm,
        userId,
      );
      return {
        content: [
          {
            type: "text",
            text: `Successfully created summary for conversation ${conversationId}.\nSummary ID: ${summaryId}\nItems summarized: ${contextItems.length}\nSummary length: ${summaryText.split(/\s+/).length} words`,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error creating summary: ${error.message || "Unknown error"}`,
          },
        ],
      };
    }
  },
);

// Tool to get conversation summaries
server.tool(
  "get-conversation-summaries",
  "Get all summaries for a specific conversation",
  {
    conversationId: z
      .string()
      .describe("Unique identifier for the conversation"),
  },
  async ({ conversationId }) => {
    try {
      await connect();
      const summaries = await getConversationSummaries(conversationId);

      if (summaries.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No summaries found for conversation ${conversationId}.`,
            },
          ],
        };
      }

      let result = `**Conversation Summaries for ${conversationId} (${summaries.length} summaries)**\n\n`;

      summaries.forEach((summary, index) => {
        result += `**Summary ${index + 1}**\n`;
        result += `Timestamp: ${summary.timestamp.toISOString()}\n`;
        result += `Word Count: ${summary.wordCount || 0}\n`;
        result += `Summary Text:\n${summary.summaryText || summary.memories.join("\n")}\n\n---\n\n`;
      });

      return {
        content: [
          {
            type: "text",
            text: result,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error retrieving summaries: ${error.message || "Unknown error"}`,
          },
        ],
      };
    }
  },
);

// Tool to search context by tags
server.tool(
  "search-context-by-tags",
  "Search archived context and summaries by tags",
  {
    tags: z.array(z.string()).describe("Tags to search for"),
  },
  async ({ tags }) => {
    try {
      await connect();
      const results = await searchContextByTags(tags);

      if (results.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No context found with tags: ${tags.join(", ")}`,
            },
          ],
        };
      }

      let result = `**Search Results for tags: ${tags.join(", ")} (${results.length} items)**\n\n`;

      results.forEach((item, index) => {
        result += `**Item ${index + 1}**\n`;
        result += `Type: ${item.contextType}\n`;
        result += `Conversation ID: ${item.conversationId}\n`;
        result += `Relevance Score: ${(item.relevanceScore || 0).toFixed(3)}\n`;
        result += `Tags: ${(item.tags || []).join(", ")}\n`;
        result += `Word Count: ${item.wordCount || 0}\n`;
        result += `Timestamp: ${item.timestamp.toISOString()}\n`;
        result += `Content:\n${item.memories.join("\n")}\n\n---\n\n`;
      });

      return {
        content: [
          {
            type: "text",
            text: result,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error searching context: ${error.message || "Unknown error"}`,
          },
        ],
      };
    }
  },
);

async function main() {
  try {
    await connect();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Memory MCP server (Embedded KuzuDB Graph + Vector) started successfully");
  } catch (error) {
    console.error("Failed to start Memory MCP server:", error);
    process.exit(1);
  }
}

process.on("SIGINT", async () => {
  console.error("Shutting down Memory MCP server...");
  await closeDatabase();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.error("Shutting down Memory MCP server...");
  await closeDatabase();
  process.exit(0);
});

main().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
