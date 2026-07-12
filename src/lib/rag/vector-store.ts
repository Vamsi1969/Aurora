/**
 * Vector store utility for semantic similarity search.
 *
 * Stores and searches embeddings in MongoDB, using
 * in-memory cosine similarity computation (portable across
 * all MongoDB configurations).
 */

import type { EmbeddingVector } from "./embedder.server";

/**
 * Compute cosine similarity between two vectors.
 * Returns a value between -1 and 1, where 1 = most similar.
 */
export function cosineSimilarity(a: EmbeddingVector, b: EmbeddingVector): number {
  let dotProduct = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dotProduct / denom;
}

/**
 * A document with an optional embedding field.
 */
export interface EmbeddingDocument {
  id: string;
  content: string;
  threadTitle?: string;
  embedding?: EmbeddingVector;
}

/**
 * A search result with its similarity score.
 */
export interface ScoredResult {
  document: EmbeddingDocument;
  score: number;
}

/**
 * Find the top-k most similar documents to a query vector.
 * Uses cosine similarity for scoring.
 */
export function findSimilarDocuments(
  queryVector: EmbeddingVector,
  documents: EmbeddingDocument[],
  topK: number = 5,
  minScore: number = 0.5,
): ScoredResult[] {
  const scored: ScoredResult[] = [];

  for (const doc of documents) {
    if (!doc.embedding || doc.embedding.length === 0) continue;
    const score = cosineSimilarity(queryVector, doc.embedding);
    if (score >= minScore) {
      scored.push({ document: doc, score });
    }
  }

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

/**
 * Merge vector search results with text search results,
 * deduplicating by document ID and prioritizing higher scores.
 */
export function mergeSearchResults(
  vectorResults: ScoredResult[],
  textResults: EmbeddingDocument[],
  maxResults: number = 10,
): EmbeddingDocument[] {
  const seen = new Set<string>();
  const merged: EmbeddingDocument[] = [];

  // Vector results first (higher relevance)
  for (const vr of vectorResults) {
    if (seen.has(vr.document.id)) continue;
    seen.add(vr.document.id);
    merged.push(vr.document);
  }

  // Text results as fallback
  for (const doc of textResults) {
    if (seen.has(doc.id)) continue;
    seen.add(doc.id);
    merged.push(doc);
  }

  return merged.slice(0, maxResults);
}
