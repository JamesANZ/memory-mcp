import kuzu, { Database, Connection, QueryResult } from "kuzu";
import { mkdirSync } from "fs";
import { dirname, join } from "path";
import { homedir } from "os";
import { randomUUID } from "crypto";
import {
  Memory,
  ContextType,
  GraphEntityInput,
  GraphRelationInput,
  ScoredEntity,
  GraphTriple,
  SubgraphResult,
} from "./types.js";
import { embedText, cosineSimilarity, EMBEDDING_DIM } from "./embeddings.js";

const DEFAULT_DB_PATH = join(homedir(), ".memory-mcp", "graph_db");
const DB_PATH = process.env.MEMORY_DB_PATH || DEFAULT_DB_PATH;

let db: Database | null = null;
let conn: Connection | null = null;
let schemaInitialized = false;

async function runQuery(statement: string): Promise<Record<string, any>[]> {
  if (!conn) throw new Error("Database connection not initialized");
  const res = await conn.query(statement);
  const single = Array.isArray(res) ? res[0] : res;
  const rows = await single.getAll();
  single.close();
  return rows;
}

async function runPrepared(
  statement: string,
  params: Record<string, any>,
): Promise<Record<string, any>[]> {
  if (!conn) throw new Error("Database connection not initialized");
  const prepared = await conn.prepare(statement);
  if (!prepared.isSuccess()) {
    throw new Error(`Cypher prepare error: ${prepared.getErrorMessage()}`);
  }
  const res = await conn.execute(prepared, params);
  const single: QueryResult = Array.isArray(res) ? res[0] : res;
  const rows = await single.getAll();
  single.close();
  return rows;
}

export async function connect(): Promise<Connection> {
  if (db && conn && schemaInitialized) return conn;

  if (DB_PATH !== ":memory:") {
    mkdirSync(dirname(DB_PATH), { recursive: true });
  }

  db = new kuzu.Database(DB_PATH);
  conn = new kuzu.Connection(db);

  // Initialize Graph Schema
  await runQuery(`
    CREATE NODE TABLE IF NOT EXISTS Entity (
      name STRING,
      entityType STRING,
      observations STRING[],
      embedding FLOAT[${EMBEDDING_DIM}],
      llm STRING,
      userId STRING,
      updatedAt INT64,
      PRIMARY KEY (name)
    )
  `);

  await runQuery(`
    CREATE NODE TABLE IF NOT EXISTS MemoryChunk (
      id STRING,
      memories STRING[],
      timestamp INT64,
      llm STRING,
      userId STRING,
      conversationId STRING,
      contextType STRING,
      relevanceScore DOUBLE,
      tags STRING[],
      parentContextId STRING,
      messageIndex INT64,
      wordCount INT64,
      summaryText STRING,
      embedding FLOAT[${EMBEDDING_DIM}],
      PRIMARY KEY (id)
    )
  `);

  await runQuery(`
    CREATE REL TABLE IF NOT EXISTS RelatesTo (
      FROM Entity TO Entity,
      relationType STRING,
      weight DOUBLE,
      updatedAt INT64
    )
  `);

  await runQuery(`
    CREATE REL TABLE IF NOT EXISTS Mentions (
      FROM MemoryChunk TO Entity
    )
  `);

  await runQuery(`
    CREATE REL TABLE IF NOT EXISTS Summarizes (
      FROM MemoryChunk TO MemoryChunk
    )
  `);

  schemaInitialized = true;
  return conn;
}

export async function closeDatabase(): Promise<void> {
  if (conn) {
    await conn.close();
    conn = null;
  }
  if (db) {
    await db.close();
    db = null;
  }
  schemaInitialized = false;
}

/**
 * Upsert structured entities and relationships into the Kuzu knowledge graph
 * with local vector embeddings for hybrid retrieval.
 */
export async function upsertGraphMemory(
  entities: GraphEntityInput[],
  relations: GraphRelationInput[],
  llm: string,
  userId: string = "",
): Promise<{ entitiesUpserted: number; relationsUpserted: number }> {
  await connect();
  const now = Date.now();
  let entitiesUpserted = 0;
  let relationsUpserted = 0;

  for (const entity of entities) {
    const existingRows = await runPrepared(
      `MATCH (e:Entity {name: $name}) RETURN e.observations AS observations, e.entityType AS entityType`,
      { name: entity.name },
    );

    const existingObs: string[] =
      existingRows.length > 0 && Array.isArray(existingRows[0].observations)
        ? existingRows[0].observations
        : [];
    const mergedObs = Array.from(new Set([...existingObs, ...entity.observations]));
    const resolvedType =
      entity.entityType ||
      (existingRows.length > 0 ? existingRows[0].entityType : "Concept");

    const textForEmbedding = `${entity.name} (${resolvedType}): ${mergedObs.join(". ")}`;
    const embedding = await embedText(textForEmbedding);

    await runPrepared(
      `MERGE (e:Entity {name: $name})
       SET e.entityType = $entityType,
           e.observations = $observations,
           e.embedding = $embedding,
           e.llm = $llm,
           e.userId = $userId,
           e.updatedAt = $updatedAt`,
      {
        name: entity.name,
        entityType: resolvedType,
        observations: mergedObs,
        embedding,
        llm,
        userId,
        updatedAt: now,
      },
    );
    entitiesUpserted++;
  }

  for (const rel of relations) {
    // Ensure both endpoints exist as Entity nodes
    for (const endpointName of [rel.from, rel.to]) {
      const exists = await runPrepared(
        `MATCH (e:Entity {name: $name}) RETURN e.name AS name`,
        { name: endpointName },
      );
      if (exists.length === 0) {
        const emb = await embedText(endpointName);
        await runPrepared(
          `CREATE (e:Entity {
            name: $name,
            entityType: 'Entity',
            observations: [],
            embedding: $embedding,
            llm: $llm,
            userId: $userId,
            updatedAt: $updatedAt
          })`,
          {
            name: endpointName,
            embedding: emb,
            llm,
            userId,
            updatedAt: now,
          },
        );
      }
    }

    // Remove duplicate relation of same type between same pair before inserting updated edge
    await runPrepared(
      `MATCH (a:Entity {name: $from})-[r:RelatesTo]->(b:Entity {name: $to})
       WHERE r.relationType = $relationType
       DELETE r`,
      {
        from: rel.from,
        to: rel.to,
        relationType: rel.relationType,
      },
    );

    await runPrepared(
      `MATCH (a:Entity {name: $from}), (b:Entity {name: $to})
       CREATE (a)-[:RelatesTo {
         relationType: $relationType,
         weight: $weight,
         updatedAt: $updatedAt
       }]->(b)`,
      {
        from: rel.from,
        to: rel.to,
        relationType: rel.relationType,
        weight: rel.weight ?? 1.0,
        updatedAt: now,
      },
    );
    relationsUpserted++;
  }

  return { entitiesUpserted, relationsUpserted };
}

/**
 * Remove specific entities (and their incident edges) or specific relations from the graph.
 */
export async function removeGraphEntities(
  entityNames: string[] = [],
  relations: { from: string; to: string; relationType: string }[] = [],
): Promise<{ deletedEntities: number; deletedRelations: number }> {
  await connect();
  let deletedEntities = 0;
  let deletedRelations = 0;

  for (const rel of relations) {
    await runPrepared(
      `MATCH (a:Entity {name: $from})-[r:RelatesTo]->(b:Entity {name: $to})
       WHERE r.relationType = $relationType
       DELETE r`,
      { from: rel.from, to: rel.to, relationType: rel.relationType },
    );
    deletedRelations++;
  }

  for (const name of entityNames) {
    await runPrepared(
      `MATCH (e:Entity {name: $name}) DETACH DELETE e`,
      { name },
    );
    deletedEntities++;
  }

  return { deletedEntities, deletedRelations };
}

/**
 * Hybrid Vector + Cypher Graph Traversal Query:
 * 1. Embeds the natural language query into 384-d vector.
 * 2. Finds top-K seed Entity nodes via Kuzu array_cosine_similarity + substring matching boost.
 * 3. Expands 1..maxHops via Cypher over RelatesTo edges to gather the connected subgraph.
 * 4. Finds top relevant MemoryChunks (either linked via Mentions or vector similarity).
 */
export async function queryKnowledgeGraph(
  query: string,
  maxHops: number = 2,
  limit: number = 10,
  minScore: number = 0.15,
): Promise<SubgraphResult> {
  await connect();
  const queryEmbedding = await embedText(query);
  const queryLower = query.toLowerCase();

  // 1. Score all Entity nodes using Kuzu native array_cosine_similarity
  const entityRows = await runPrepared(
    `MATCH (e:Entity)
     RETURN e.name AS name,
            e.entityType AS entityType,
            e.observations AS observations,
            array_cosine_similarity(e.embedding, $queryEmb) AS vecScore`,
    { queryEmb: queryEmbedding },
  );

  const scoredSeeds: ScoredEntity[] = [];
  for (const row of entityRows) {
    const nameStr = String(row.name || "");
    const obsArr: string[] = Array.isArray(row.observations) ? row.observations : [];
    const vecScore = Number(row.vecScore || 0);
    // Boost if entity name appears directly in query or query appears in entity name/observations
    const lexicalBoost =
      queryLower.includes(nameStr.toLowerCase()) ||
      nameStr.toLowerCase().includes(queryLower)
        ? 0.35
        : obsArr.some((o) => o.toLowerCase().includes(queryLower))
          ? 0.2
          : 0;

    const finalScore = Math.min(1, Math.max(0, vecScore) + lexicalBoost);
    if (finalScore >= minScore) {
      scoredSeeds.push({
        name: nameStr,
        entityType: String(row.entityType || "Entity"),
        observations: obsArr,
        score: finalScore,
        hopDistance: 0,
      });
    }
  }

  scoredSeeds.sort((a, b) => b.score - a.score);
  const topSeeds = scoredSeeds.slice(0, limit);

  const entityMap = new Map<string, ScoredEntity>();
  for (const seed of topSeeds) {
    entityMap.set(seed.name, seed);
  }

  const relationsMap = new Map<string, GraphTriple>();

  // 2. Multi-hop Cypher graph traversal from top seed entities
  const effectiveHops = Math.max(1, Math.min(3, maxHops));
  const frontierNames = new Set<string>(topSeeds.map((s) => s.name));

  for (let hop = 1; hop <= effectiveHops; hop++) {
    if (frontierNames.size === 0) break;
    const currentFrontier = Array.from(frontierNames);
    frontierNames.clear();

    for (const seedName of currentFrontier) {
      const parentEntity = entityMap.get(seedName);
      const parentScore = parentEntity ? parentEntity.score : 0.5;

      // Outgoing and incoming edges in 1 hop
      const outgoingRows = await runPrepared(
        `MATCH (a:Entity {name: $seedName})-[r:RelatesTo]->(b:Entity)
         RETURN a.name AS fromName,
                a.entityType AS fromType,
                r.relationType AS relationType,
                r.weight AS weight,
                b.name AS toName,
                b.entityType AS toType,
                b.name AS neighborName,
                b.entityType AS neighborType,
                b.observations AS neighborObs,
                array_cosine_similarity(b.embedding, $queryEmb) AS neighborVecScore`,
        { seedName, queryEmb: queryEmbedding },
      );

      const incomingRows = await runPrepared(
        `MATCH (a:Entity)-[r:RelatesTo]->(b:Entity {name: $seedName})
         RETURN a.name AS fromName,
                a.entityType AS fromType,
                r.relationType AS relationType,
                r.weight AS weight,
                b.name AS toName,
                b.entityType AS toType,
                a.name AS neighborName,
                a.entityType AS neighborType,
                a.observations AS neighborObs,
                array_cosine_similarity(a.embedding, $queryEmb) AS neighborVecScore`,
        { seedName, queryEmb: queryEmbedding },
      );

      const neighborRows = [...outgoingRows, ...incomingRows];

      for (const row of neighborRows) {
        const tripleKey = `${row.fromName}--[${row.relationType}]-->${row.toName}`;
        if (!relationsMap.has(tripleKey)) {
          relationsMap.set(tripleKey, {
            from: String(row.fromName),
            fromType: String(row.fromType || "Entity"),
            relationType: String(row.relationType || "RELATES_TO"),
            to: String(row.toName),
            toType: String(row.toType || "Entity"),
            weight: Number(row.weight ?? 1.0),
          });
        }

        const neighborName = String(row.neighborName);
        if (!entityMap.has(neighborName) && entityMap.size < limit * 2) {
          const decayedScore = Number(
            Math.max(
              Number(row.neighborVecScore || 0),
              parentScore * Math.pow(0.7, hop),
            ).toFixed(4),
          );
          entityMap.set(neighborName, {
            name: neighborName,
            entityType: String(row.neighborType || "Entity"),
            observations: Array.isArray(row.neighborObs) ? row.neighborObs : [],
            score: decayedScore,
            hopDistance: hop,
          });
          frontierNames.add(neighborName);
        }
      }
    }
  }

  // 3. Retrieve relevant MemoryChunks (via Mentions edges to matched entities + vector similarity)
  const chunkRows = await runPrepared(
    `MATCH (c:MemoryChunk)
     RETURN c.id AS id,
            c.memories AS memories,
            c.timestamp AS timestamp,
            c.llm AS llm,
            c.userId AS userId,
            c.conversationId AS conversationId,
            c.contextType AS contextType,
            c.tags AS tags,
            c.parentContextId AS parentContextId,
            c.messageIndex AS messageIndex,
            c.wordCount AS wordCount,
            c.summaryText AS summaryText,
            array_cosine_similarity(c.embedding, $queryEmb) AS vecScore`,
    { queryEmb: queryEmbedding },
  );

  // Also check Mentions edges connecting MemoryChunks to our discovered subgraph entities
  const mentionedChunkIds = new Set<string>();
  for (const entityName of entityMap.keys()) {
    const mentionRows = await runPrepared(
      `MATCH (c:MemoryChunk)-[:Mentions]->(e:Entity {name: $name})
       RETURN c.id AS id`,
      { name: entityName },
    );
    for (const m of mentionRows) {
      if (m.id) mentionedChunkIds.add(String(m.id));
    }
  }

  const relevantChunks: Memory[] = [];
  for (const row of chunkRows) {
    const id = String(row.id);
    const vecScore = Number(row.vecScore || 0);
    const graphBoost = mentionedChunkIds.has(id) ? 0.25 : 0;
    const memoriesArr: string[] = Array.isArray(row.memories) ? row.memories : [];
    const textMatchBoost = memoriesArr.some((m) =>
      m.toLowerCase().includes(queryLower),
    )
      ? 0.2
      : 0;
    const score = Math.min(1, Math.max(0, vecScore) + graphBoost + textMatchBoost);

    if (score >= minScore) {
      relevantChunks.push(rowToMemory({ ...row, relevanceScore: score }));
    }
  }

  relevantChunks.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));

  return {
    query,
    entities: Array.from(entityMap.values()).sort((a, b) => b.score - a.score),
    relations: Array.from(relationsMap.values()),
    relevantChunks: relevantChunks.slice(0, limit),
  };
}

/**
 * Extract lightweight entity mentions from plain memory strings so legacy tools
 * (`save-memories`, `add-memories`, `archive-context`) automatically populate the graph.
 */
async function linkMemoryChunkToEntities(
  chunkId: string,
  texts: string[],
  tags: string[],
  llm: string,
  userId: string = "",
): Promise<void> {
  const combined = texts.join(" ");
  // Extract capitalized multi-word or camelCase/hyphenated identifiers + explicit tags
  const extractedNames = new Set<string>(tags.map((t) => t.trim()).filter(Boolean));
  const matches = combined.match(/\b([A-Z][a-zA-Z0-9_-]{2,}|[a-z]+-[a-z0-9-]+)\b/g) || [];
  const stopWords = new Set([
    "The",
    "This",
    "That",
    "These",
    "Those",
    "User",
    "When",
    "Where",
    "What",
    "Which",
    "While",
    "With",
    "From",
    "Into",
    "Message",
    "Summary",
  ]);

  for (const m of matches) {
    if (!stopWords.has(m) && m.length <= 40) {
      extractedNames.add(m);
    }
  }

  const entitiesToUpsert: GraphEntityInput[] = Array.from(extractedNames)
    .slice(0, 8)
    .map((name) => ({
      name,
      entityType: tags.includes(name) ? "Tag" : "Concept",
      observations: texts.slice(0, 3),
    }));

  if (entitiesToUpsert.length > 0) {
    await upsertGraphMemory(entitiesToUpsert, [], llm, userId);
    for (const ent of entitiesToUpsert) {
      await runPrepared(
        `MATCH (c:MemoryChunk {id: $chunkId}), (e:Entity {name: $name})
         CREATE (c)-[:Mentions]->(e)`,
        { chunkId, name: ent.name },
      );
    }
  }
}

function rowToMemory(row: Record<string, any>): Memory {
  return {
    _id: String(row.id || ""),
    memories: Array.isArray(row.memories) ? row.memories : [],
    timestamp: new Date(Number(row.timestamp || Date.now())),
    llm: String(row.llm || "unknown"),
    userId: row.userId ? String(row.userId) : undefined,
    conversationId: row.conversationId ? String(row.conversationId) : undefined,
    contextType: (row.contextType as ContextType) || "active",
    relevanceScore:
      row.relevanceScore !== undefined && row.relevanceScore !== null
        ? Number(row.relevanceScore)
        : undefined,
    tags: Array.isArray(row.tags) ? row.tags : [],
    parentContextId: row.parentContextId ? String(row.parentContextId) : undefined,
    messageIndex:
      row.messageIndex !== undefined && row.messageIndex !== null
        ? Number(row.messageIndex)
        : undefined,
    wordCount:
      row.wordCount !== undefined && row.wordCount !== null
        ? Number(row.wordCount)
        : undefined,
    summaryText: row.summaryText ? String(row.summaryText) : undefined,
  };
}

export async function saveMemories(
  memories: string[],
  llm: string,
  userId?: string,
): Promise<void> {
  await connect();
  const id = randomUUID();
  const now = Date.now();
  const combinedText = memories.join("\n");
  const embedding = await embedText(combinedText);
  const wordCount = combinedText.split(/\s+/).filter(Boolean).length;

  await runPrepared(
    `CREATE (c:MemoryChunk {
      id: $id,
      memories: $memories,
      timestamp: $timestamp,
      llm: $llm,
      userId: $userId,
      conversationId: '',
      contextType: 'active',
      relevanceScore: 1.0,
      tags: [],
      parentContextId: '',
      messageIndex: 0,
      wordCount: $wordCount,
      summaryText: '',
      embedding: $embedding
    })`,
    {
      id,
      memories,
      timestamp: now,
      llm,
      userId: userId || "",
      wordCount,
      embedding,
    },
  );

  await linkMemoryChunkToEntities(id, memories, [], llm, userId);
}

export async function getAllMemories(): Promise<Memory[]> {
  await connect();
  const rows = await runQuery(
    `MATCH (c:MemoryChunk)
     RETURN c.id AS id,
            c.memories AS memories,
            c.timestamp AS timestamp,
            c.llm AS llm,
            c.userId AS userId,
            c.conversationId AS conversationId,
            c.contextType AS contextType,
            c.relevanceScore AS relevanceScore,
            c.tags AS tags,
            c.parentContextId AS parentContextId,
            c.messageIndex AS messageIndex,
            c.wordCount AS wordCount,
            c.summaryText AS summaryText
     ORDER BY c.timestamp DESC`,
  );
  return rows.map(rowToMemory);
}

export async function clearAllMemories(): Promise<number> {
  await connect();
  const chunkCountRows = await runQuery(
    `MATCH (c:MemoryChunk) RETURN count(c) AS cnt`,
  );
  const entityCountRows = await runQuery(
    `MATCH (e:Entity) RETURN count(e) AS cnt`,
  );
  const totalCount =
    Number(chunkCountRows[0]?.cnt || 0) + Number(entityCountRows[0]?.cnt || 0);

  await runQuery(`MATCH (c:MemoryChunk) DETACH DELETE c`);
  await runQuery(`MATCH (e:Entity) DETACH DELETE e`);
  return totalCount;
}

export async function archiveContext(
  conversationId: string,
  contextMessages: string[],
  tags: string[],
  llm: string,
  userId?: string,
): Promise<number> {
  await connect();
  const now = Date.now();
  let inserted = 0;

  for (let index = 0; index < contextMessages.length; index++) {
    const message = contextMessages[index];
    const id = randomUUID();
    const embedding = await embedText(`${tags.join(" ")}: ${message}`);
    const wordCount = message.split(/\s+/).filter(Boolean).length;

    await runPrepared(
      `CREATE (c:MemoryChunk {
        id: $id,
        memories: $memories,
        timestamp: $timestamp,
        llm: $llm,
        userId: $userId,
        conversationId: $conversationId,
        contextType: 'archived',
        relevanceScore: 0.5,
        tags: $tags,
        parentContextId: '',
        messageIndex: $messageIndex,
        wordCount: $wordCount,
        summaryText: '',
        embedding: $embedding
      })`,
      {
        id,
        memories: [message],
        timestamp: now + index,
        llm,
        userId: userId || "",
        conversationId,
        tags,
        messageIndex: index,
        wordCount,
        embedding,
      },
    );

    await linkMemoryChunkToEntities(id, [message], tags, llm, userId);
    inserted++;
  }

  return inserted;
}

export async function retrieveContext(
  conversationId: string,
  tags?: string[],
  minRelevanceScore: number = 0.1,
  limit: number = 10,
): Promise<Memory[]> {
  await connect();
  const rows = await runPrepared(
    `MATCH (c:MemoryChunk)
     WHERE c.conversationId = $conversationId
       AND c.contextType = 'archived'
       AND c.relevanceScore >= $minRelevanceScore
     RETURN c.id AS id,
            c.memories AS memories,
            c.timestamp AS timestamp,
            c.llm AS llm,
            c.userId AS userId,
            c.conversationId AS conversationId,
            c.contextType AS contextType,
            c.relevanceScore AS relevanceScore,
            c.tags AS tags,
            c.parentContextId AS parentContextId,
            c.messageIndex AS messageIndex,
            c.wordCount AS wordCount,
            c.summaryText AS summaryText
     ORDER BY c.relevanceScore DESC, c.timestamp DESC`,
    { conversationId, minRelevanceScore },
  );

  let memories = rows.map(rowToMemory);
  if (tags && tags.length > 0) {
    const tagSet = new Set(tags.map((t) => t.toLowerCase()));
    memories = memories.filter((m) =>
      (m.tags || []).some((t) => tagSet.has(t.toLowerCase())),
    );
  }

  return memories.slice(0, limit);
}

/**
 * Score relevance of archived context against currentContext using semantic vector cosine similarity
 * and shared graph entity mentions.
 */
export async function scoreRelevance(
  conversationId: string,
  currentContext: string,
  _llm: string,
): Promise<number> {
  await connect();
  const contextEmbedding = await embedText(currentContext);

  const archivedRows = await runPrepared(
    `MATCH (c:MemoryChunk)
     WHERE c.conversationId = $conversationId AND c.contextType = 'archived'
     RETURN c.id AS id,
            array_cosine_similarity(c.embedding, $contextEmb) AS vecScore`,
    { conversationId, contextEmb: contextEmbedding },
  );

  let scoredCount = 0;
  for (const row of archivedRows) {
    const id = String(row.id);
    const relevanceScore = Math.max(0, Math.min(1, Number(row.vecScore || 0)));
    await runPrepared(
      `MATCH (c:MemoryChunk {id: $id})
       SET c.relevanceScore = $relevanceScore`,
      { id, relevanceScore },
    );
    scoredCount++;
  }

  return scoredCount;
}

export async function createSummary(
  conversationId: string,
  contextItems: Memory[],
  summaryText: string,
  llm: string,
  userId?: string,
): Promise<string> {
  await connect();
  const summaryId = randomUUID();
  const now = Date.now();
  const embedding = await embedText(summaryText);
  const wordCount = summaryText.split(/\s+/).filter(Boolean).length;

  await runPrepared(
    `CREATE (s:MemoryChunk {
      id: $id,
      memories: $memories,
      timestamp: $timestamp,
      llm: $llm,
      userId: $userId,
      conversationId: $conversationId,
      contextType: 'summary',
      relevanceScore: 1.0,
      tags: ['summary'],
      parentContextId: '',
      messageIndex: 0,
      wordCount: $wordCount,
      summaryText: $summaryText,
      embedding: $embedding
    })`,
    {
      id: summaryId,
      memories: [summaryText],
      timestamp: now,
      llm,
      userId: userId || "",
      conversationId,
      wordCount,
      summaryText,
      embedding,
    },
  );

  for (const item of contextItems) {
    if (!item._id) continue;
    await runPrepared(
      `MATCH (s:MemoryChunk {id: $summaryId}), (c:MemoryChunk {id: $itemId})
       SET c.contextType = 'archived', c.parentContextId = $summaryId
       CREATE (s)-[:Summarizes]->(c)`,
      { summaryId, itemId: String(item._id) },
    );
  }

  return summaryId;
}

export async function getConversationSummaries(
  conversationId: string,
): Promise<Memory[]> {
  await connect();
  const rows = await runPrepared(
    `MATCH (c:MemoryChunk)
     WHERE c.conversationId = $conversationId AND c.contextType = 'summary'
     RETURN c.id AS id,
            c.memories AS memories,
            c.timestamp AS timestamp,
            c.llm AS llm,
            c.userId AS userId,
            c.conversationId AS conversationId,
            c.contextType AS contextType,
            c.relevanceScore AS relevanceScore,
            c.tags AS tags,
            c.parentContextId AS parentContextId,
            c.messageIndex AS messageIndex,
            c.wordCount AS wordCount,
            c.summaryText AS summaryText
     ORDER BY c.timestamp DESC`,
    { conversationId },
  );
  return rows.map(rowToMemory);
}

export async function searchContextByTags(tags: string[]): Promise<Memory[]> {
  await connect();
  const rows = await runQuery(
    `MATCH (c:MemoryChunk)
     WHERE c.contextType IN ['archived', 'summary']
     RETURN c.id AS id,
            c.memories AS memories,
            c.timestamp AS timestamp,
            c.llm AS llm,
            c.userId AS userId,
            c.conversationId AS conversationId,
            c.contextType AS contextType,
            c.relevanceScore AS relevanceScore,
            c.tags AS tags,
            c.parentContextId AS parentContextId,
            c.messageIndex AS messageIndex,
            c.wordCount AS wordCount,
            c.summaryText AS summaryText
     ORDER BY c.relevanceScore DESC, c.timestamp DESC`,
  );

  const tagSet = new Set(tags.map((t) => t.toLowerCase()));
  return rows
    .map(rowToMemory)
    .filter((m) => (m.tags || []).some((t) => tagSet.has(t.toLowerCase())));
}

export {
  Memory,
  ContextType,
  GraphEntityInput,
  GraphRelationInput,
  SubgraphResult,
} from "./types.js";
