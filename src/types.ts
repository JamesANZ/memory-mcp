// Basic memory types
export type ContextType = "active" | "archived" | "summary";

export interface Memory {
  _id?: string;
  memories: string[];
  timestamp: Date;
  llm: string;
  userId?: string;
  // Context window caching fields
  conversationId?: string;
  contextType?: ContextType;
  relevanceScore?: number; // 0-1
  tags?: string[];
  parentContextId?: string; // Reference to original content for summaries
  messageIndex?: number; // Order within conversation
  wordCount?: number;
  summaryText?: string;
}

// Knowledge Graph types
export interface GraphEntityInput {
  name: string;
  entityType: string;
  observations: string[];
}

export interface GraphRelationInput {
  from: string;
  to: string;
  relationType: string;
  weight?: number;
}

export interface ScoredEntity {
  name: string;
  entityType: string;
  observations: string[];
  score: number;
  hopDistance: number;
}

export interface GraphTriple {
  from: string;
  fromType: string;
  relationType: string;
  to: string;
  toType: string;
  weight: number;
}

export interface SubgraphResult {
  query: string;
  entities: ScoredEntity[];
  relations: GraphTriple[];
  relevantChunks: Memory[];
}

// Orchestration types
export interface ConversationState {
  conversationId: string;
  currentContext: string[];
  /** Word count of `currentContext`. Recomputed from those messages, never incremented on its own. */
  totalWordCount: number;
  maxWordCount: number;
  llm: string;
  userId?: string;
}

export interface ArchiveDecision {
  shouldArchive: boolean;
  messagesToArchive: string[];
  tags: string[];
  reason: string;
}

export interface RetrievalDecision {
  shouldRetrieve: boolean;
  contextToRetrieve: Memory[];
  reason: string;
}

// Helper types for MCP tool parameters
export interface ContextItem {
  _id?: string;
  memories: string[];
  timestamp: string;
  llm: string;
  userId?: string;
  conversationId?: string;
  contextType?: string;
  relevanceScore?: number;
  tags?: string[];
  parentContextId?: string;
  messageIndex?: number;
  wordCount?: number;
  summaryText?: string;
}
