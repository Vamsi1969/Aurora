/**
 * Embedding generation utility for semantic search.
 *
 * Uses the Lovable AI Gateway's OpenAI-compatible embeddings endpoint
 * to convert text into vector embeddings for similarity search.
 */

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 512;

export type EmbeddingVector = number[];

/**
 * Generate an embedding vector for the given text using the Lovable gateway.
 * Returns null if the API key is missing or the request fails.
 */
export async function generateEmbedding(text: string): Promise<EmbeddingVector | null> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return null;

  // Clean and truncate text
  const cleaned = text.replace(/\s+/g, " ").trim().slice(0, 8000);

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: cleaned,
        dimensions: EMBEDDING_DIMENSIONS,
      }),
    });

    if (!res.ok) {
      console.warn(`Embedding API returned ${res.status}`);
      return null;
    }

    const data = (await res.json()) as {
      data: { embedding: number[] }[];
    };

    if (!data.data?.[0]?.embedding) {
      console.warn("Embedding API returned unexpected response shape");
      return null;
    }

    return data.data[0].embedding;
  } catch (err) {
    console.warn("Embedding generation failed:", err instanceof Error ? err.message : err);
    return null;
  }
}
