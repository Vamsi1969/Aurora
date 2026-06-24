import { useCallback, useEffect, useRef, useState } from "react";

export function useSpeech() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    const a = audioRef.current;
    if (a) {
      a.pause();
      if (a.src) URL.revokeObjectURL(a.src);
      audioRef.current = null;
    }
    setSpeakingId(null);
    setLoadingId(null);
  }, []);

  const speak = useCallback(
    async (id: string, text: string, voice = "alloy") => {
      stop();
      const trimmed = text.trim();
      if (!trimmed) return;
      const chunk = trimmed.slice(0, 3800);
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setLoadingId(id);
      try {
        const res = await fetch("/api/speech", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: chunk, voice }),
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error(await res.text());
        const blob = await res.blob();
        if (ctrl.signal.aborted) return;
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => {
          URL.revokeObjectURL(url);
          audioRef.current = null;
          setSpeakingId(null);
        };
        audio.onerror = () => {
          URL.revokeObjectURL(url);
          audioRef.current = null;
          setSpeakingId(null);
        };
        setLoadingId(null);
        setSpeakingId(id);
        await audio.play();
      } catch (e) {
        if (!ctrl.signal.aborted) {
          console.error(e);
        }
        setSpeakingId(null);
        setLoadingId(null);
      }
    },
    [stop],
  );

  useEffect(() => () => stop(), [stop]);

  return { speak, stop, speakingId, loadingId };
}