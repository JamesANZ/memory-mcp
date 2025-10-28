import { ObjectId } from "mongodb";

// Basic memory types
export type ContextType = "active" | "archived" | "summary";

export interface Memory {
  _id?: ObjectId;
  memories: string[];
  timestamp: Date;
  llm: string;
  userId?: string;
  // Context window caching fields
  conversationId?: string;
  contextType?: ContextType;
  relevanceScore?: number; // 0-1
  tags?: string[];
  parentContextId?: ObjectId; // Reference to original content for summaries
  messageIndex?: number; // Order within conversation
  wordCount?: number;
  summaryText?: string;
}

// Orchestration types
export interface ConversationState {
  conversationId: string;
  currentContext: string[];
  archivedContext: Memory[];
  summaries: Memory[];
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
