export type ArtifactSpec = {
  id: string;
  title: string;
  language: string;
  code: string;
};

function titleFor(lang: string, code: string): string {
  const first = code.split("\n").find((l) => l.trim().length > 0) ?? lang;
  const cleaned = first.replace(/[/#*\-<>]+/g, "").trim();
  return cleaned.slice(0, 60) || lang.toUpperCase();
}

export function extractArtifacts(text: string, messageId: string): ArtifactSpec[] {
  const out: ArtifactSpec[] = [];
  const re = /```([a-zA-Z0-9_+\-.]*)\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    const lang = (m[1] || "text").toLowerCase();
    const code = m[2];
    const lines = code.split("\n").length;
    if (lines >= 15 || code.length >= 600) {
      out.push({ id: `${messageId}-${i}`, title: titleFor(lang, code), language: lang, code });
    }
    i++;
  }
  return out;
}
