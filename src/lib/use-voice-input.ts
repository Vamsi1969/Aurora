import { useCallback, useEffect, useRef, useState } from "react";

export function useVoiceInput(onTranscript: (text: string) => void) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setSupported(
      typeof navigator !== "undefined" &&
        !!navigator.mediaDevices?.getUserMedia &&
        typeof window.MediaRecorder !== "undefined",
    );
  }, []);

  const stopTracks = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = ["audio/webm", "audio/mp4"].find((t) =>
        window.MediaRecorder.isTypeSupported(t),
      );
      if (!mimeType) {
        stopTracks();
        throw new Error("Browser can't record a supported audio format");
      }
      const rec = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        stopTracks();
        const blob = new Blob(chunksRef.current, { type: rec.mimeType });
        chunksRef.current = [];
        if (blob.size < 1024) {
          setListening(false);
          return;
        }
        setTranscribing(true);
        try {
          const form = new FormData();
          const ext = rec.mimeType.includes("mp4") ? "mp4" : "webm";
          form.append("file", blob, `recording.${ext}`);
          const res = await fetch("/api/transcribe", { method: "POST", body: form });
          if (!res.ok) throw new Error(await res.text());
          const data = (await res.json()) as { text?: string };
          if (data.text) onTranscript(data.text);
        } finally {
          setTranscribing(false);
          setListening(false);
        }
      };
      rec.start();
      recorderRef.current = rec;
      setListening(true);
    } catch (e) {
      stopTracks();
      setListening(false);
      throw e;
    }
  }, [onTranscript]);

  const stop = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
    recorderRef.current = null;
  }, []);

  const toggle = useCallback(async () => {
    if (listening) {
      stop();
    } else {
      await start();
    }
  }, [listening, start, stop]);

  useEffect(() => {
    return () => {
      try {
        recorderRef.current?.state !== "inactive" && recorderRef.current?.stop();
      } catch {
        // ignore
      }
      stopTracks();
    };
  }, []);

  return { supported, listening, transcribing, toggle };
}