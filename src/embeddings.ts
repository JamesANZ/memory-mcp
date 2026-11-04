import { pipeline, env } from "@huggingface/transformers";
import { join } from "path";
import { homedir } from "os";

// Cache models in user's home directory so it persists across runs
env.cacheDir =
  process.env.MEMORY_MODEL_CACHE_DIR ||
  join(homedir(), ".memory-mcp", "models");

const MODEL_NAME = "Xenova/all-MiniLM-L6-v2";
export const EMBEDDING_DIM = 384;

let extractorPromise: Promise<any> | null = null;

async function getExtractor() {
  if (!extractorPromise) {
    extractorPromise = pipeline("feature-extraction", MODEL_NAME, {
      dtype: "q8",
    }).catch((err) => {
      extractorPromise = null;
      throw err;
    });
  }
  return extractorPromise;
}

/**
 * Generate a normalized 384-dimensional vector embedding for text.
 * Falls back to a deterministic hash-based trigram embedding if offline/model fails.
 */
export async function embedText(text: string): Promise<number[]> {
  const cleaned = text.trim();
  if (!cleaned) {
    return new Array(EMBEDDING_DIM).fill(0);
  }

  try {
    const extractor = await getExtractor();
    const output = await extractor(cleaned, {
      pooling: "mean",
      normalize: true,
    });
    return Array.from(output.data as Float32Array);
  } catch {
    return fallbackHashEmbedding(cleaned);
  }
}

/**
 * Deterministic character/word n-gram hash projection into 384 dimensions
 * used as an instant fallback if the environment has no internet on first run.
 */
export function fallbackHashEmbedding(text: string): number[] {
  const vec = new Float64Array(EMBEDDING_DIM);
  const normalized = text.toLowerCase().replace(/[^a-z0-9\s]/g, " ");
  const tokens = normalized.split(/\s+/).filter(Boolean);

  for (const token of tokens) {
    // Word hash + character trigram hashes
    const parts = [token];
    for (let i = 0; i <= token.length - 3; i++) {
      parts.push(token.slice(i, i + 3));
    }
    for (const part of parts) {
      let h1 = 2166136261;
      let h2 = 16777619;
      for (let i = 0; i < part.length; i++) {
        h1 ^= part.charCodeAt(i);
        h1 = Math.imul(h1, 16777619);
        h2 ^= part.charCodeAt(i);
        h2 = Math.imul(h2, 1099511628211 & 0xffffffff);
      }
      const idx = Math.abs(h1) % EMBEDDING_DIM;
      const sign = h2 & 1 ? 1 : -1;
      vec[idx] += sign;
    }
  }

  // L2 normalize
  let norm = 0;
  for (let i = 0; i < EMBEDDING_DIM; i++) {
    norm += vec[i] * vec[i];
  }
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < EMBEDDING_DIM; i++) {
      vec[i] /= norm;
    }
  }
  return Array.from(vec);
}

/**
 * Compute cosine similarity between two equal-length vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
