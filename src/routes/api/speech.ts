import { createFileRoute } from "@tanstack/react-router";

const VOICES = new Set([
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "sage",
  "shimmer",
  "verse",
  "marin",
  "cedar",
]);

export const Route = createFileRoute("/api/speech")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) return new Response("Missing LOVABLE_API_KEY", { status: 500 });
        const body = (await request.json().catch(() => null)) as {
          text?: string;
          voice?: string;
          instructions?: string;
        } | null;
        const text = body?.text?.trim();
        if (!text) return new Response("Missing text", { status: 400 });
        if (text.length > 4000) {
          return new Response("Text too long (max 4000 chars per request)", { status: 400 });
        }
        const voice = body?.voice && VOICES.has(body.voice) ? body.voice : "alloy";

        try {
          const upstream = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "openai/gpt-4o-mini-tts",
              input: text,
              voice,
              instructions: body?.instructions,
              stream_format: "audio",
              response_format: "mp3",
            }),
            signal: request.signal,
          });
          if (!upstream.ok) {
            const errBody = await upstream.text().catch(() => "");
            return new Response(errBody || "TTS failed", { status: upstream.status });
          }
          return new Response(upstream.body, {
            headers: {
              "Content-Type": "audio/mpeg",
              "Cache-Control": "no-store",
            },
          });
        } catch (err) {
          if (request.signal.aborted) return new Response(null, { status: 499 });
          throw err;
        }
      },
    },
  },
});