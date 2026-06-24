import { createParser } from "eventsource-parser";
import { flushSync } from "react-dom";
import { supabase } from "@/integrations/supabase/client";

type ImageEventPayload = {
  type: "image_generation.partial_image" | "image_generation.completed";
  b64_json: string;
  partial_image_index?: number;
};

export type StreamImageOptions = {
  /** Per-attempt timeout in ms. Default 60_000. */
  timeoutMs?: number;
  /** Number of automatic retries after the first attempt. Default 2. */
  retries?: number;
  /** Called before each attempt (1-based). */
  onAttempt?: (attempt: number, totalAttempts: number) => void;
};

class ImageGenError extends Error {
  retryable: boolean;
  status?: number;
  constructor(message: string, opts: { retryable: boolean; status?: number }) {
    super(message);
    this.retryable = opts.retryable;
    this.status = opts.status;
  }
}

async function streamImageOnce(
  prompt: string,
  token: string,
  onFrame: (dataUrl: string, isFinal: boolean) => void,
  timeoutMs: number,
): Promise<void> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  let receivedFrame = false;

  try {
    const res = await fetch("/api/generate-image", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ prompt }),
      signal: controller.signal,
    });
    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => "");
      // 4xx (except 408/429) are not retryable; 5xx, 408, 429 are.
      const retryable = res.status >= 500 || res.status === 408 || res.status === 429;
      throw new ImageGenError(`Image generation failed (${res.status})${text ? `: ${text}` : ""}`, {
        retryable,
        status: res.status,
      });
    }

    let sawCompleted = false;
    const parser = createParser({
      onEvent(event) {
        if (
          event.event !== "image_generation.partial_image" &&
          event.event !== "image_generation.completed"
        )
          return;
        let payload: ImageEventPayload;
        try {
          payload = JSON.parse(event.data) as ImageEventPayload;
        } catch {
          return;
        }
        const isFinal = event.event === "image_generation.completed";
        receivedFrame = true;
        flushSync(() => {
          onFrame(`data:image/png;base64,${payload.b64_json}`, isFinal);
        });
        if (isFinal) sawCompleted = true;
      },
    });

    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        parser.feed(value);
      }
    } finally {
      reader.cancel().catch(() => {});
    }
    if (!sawCompleted) {
      // Mid-stream failure: retry only if no frame ever arrived.
      throw new ImageGenError("Image stream ended unexpectedly. Please try again.", {
        retryable: !receivedFrame,
      });
    }
  } catch (err) {
    if (err instanceof ImageGenError) throw err;
    const e = err as Error & { name?: string };
    if (e.name === "AbortError") {
      throw new ImageGenError(
        "Image generation timed out. The model is taking longer than expected.",
        { retryable: !receivedFrame },
      );
    }
    // Network / fetch failure — retryable unless we already streamed frames.
    throw new ImageGenError(e.message || "Network error while generating image.", {
      retryable: !receivedFrame,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function streamImage(
  prompt: string,
  onFrame: (dataUrl: string, isFinal: boolean) => void,
  options: StreamImageOptions = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 60_000;
  const retries = Math.max(0, options.retries ?? 2);
  const totalAttempts = retries + 1;

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) {
    throw new Error("Please sign in again to generate images.");
  }

  let lastErr: unknown;
  for (let attempt = 1; attempt <= totalAttempts; attempt++) {
    try {
      options.onAttempt?.(attempt, totalAttempts);
      await streamImageOnce(prompt, token, onFrame, timeoutMs);
      return;
    } catch (err) {
      lastErr = err;
      const retryable = err instanceof ImageGenError ? err.retryable : true;
      if (!retryable || attempt === totalAttempts) break;
      // Exponential backoff: 600ms, 1500ms…
      const delay = 600 * Math.pow(2.5, attempt - 1);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Image generation failed.");
}
