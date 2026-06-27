import { useEffect, useState } from "react";
import { type UIMessage } from "ai";
import { useServerFn } from "@tanstack/react-start";
import { Download, FileText, Loader2 } from "lucide-react";
import jsPDF from "jspdf";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getThreadMeta } from "@/lib/chat.functions";
import { toast } from "sonner";

const EXPORT_FORMATS = [
  {
    id: "markdown",
    label: "Markdown (.md)",
    ext: "md",
    mime: "text/markdown",
    desc: "Formatted with headings, code blocks, and bold text",
  },
  {
    id: "text",
    label: "Plain Text (.txt)",
    ext: "txt",
    mime: "text/plain",
    desc: "Simple readable text format",
  },
  {
    id: "pdf",
    label: "PDF (.pdf)",
    ext: "pdf",
    mime: "application/pdf",
    desc: "Professional PDF document with formatting",
  },
] as const;

type FormatId = (typeof EXPORT_FORMATS)[number]["id"];

function textOf(m: UIMessage): string {
  return m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
}

function generatePdf(msgs: UIMessage[], title: string): jsPDF {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  const maxWidth = pageWidth - margin * 2;
  let y = margin;

  // Title
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(title || "Conversation", margin, y);
  y += 10;

  // Subtitle
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(120, 120, 120);
  doc.text(`Exported from Aurora — ${new Date().toLocaleString()}`, margin, y);
  y += 4;
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, y, pageWidth - margin, y);
  y += 10;

  // Messages
  doc.setTextColor(0, 0, 0);
  for (const msg of msgs) {
    const text = textOf(msg);
    if (!text.trim()) continue;

    // Check if we need a new page
    if (y > 270) {
      doc.addPage();
      y = margin;
    }

    // Role label
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    if (msg.role === "user") {
      doc.setTextColor(37, 99, 235);
      doc.text("You", margin, y);
    } else {
      doc.setTextColor(16, 163, 127);
      doc.text("Aurora", margin, y);
    }
    y += 5;

    // Message content
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(40, 40, 40);
    const lines = doc.splitTextToSize(text, maxWidth);
    for (const line of lines) {
      if (y > 275) {
        doc.addPage();
        y = margin;
      }
      doc.text(line, margin, y);
      y += 5;
    }
    y += 5;
  }

  return doc;
}

export function ExportDialog({
  threadId,
  threadTitle,
  messages,
  open,
  onOpenChange,
}: {
  threadId: string;
  threadTitle?: string;
  messages: UIMessage[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [format, setFormat] = useState<FormatId>("markdown");
  const [exporting, setExporting] = useState(false);
  const [title, setTitle] = useState(threadTitle ?? "");
  const fetchMeta = useServerFn(getThreadMeta);

  useEffect(() => {
    if (open && !title) {
      fetchMeta({ data: { id: threadId } })
        .then((meta) => {
          if (meta?.title) setTitle(meta.title);
        })
        .catch(() => {});
    }
  }, [open, threadId, title, fetchMeta]);

  function formatMessages(msgs: UIMessage[], fmt: FormatId): string {
    const safeTitle = title || "Conversation";

    if (fmt === "markdown") {
      const lines: string[] = [];
      lines.push(`# ${safeTitle}`);
      lines.push("");
      lines.push(`> Exported from Aurora — ${new Date().toLocaleString()}`);
      lines.push("");
      lines.push("---");
      lines.push("");

      for (const msg of msgs) {
        const role = msg.role === "user" ? "**You**" : "**Aurora**";
        lines.push(`${role}:`);
        lines.push("");
        lines.push(textOf(msg));
        lines.push("");
        lines.push("---");
        lines.push("");
      }

      return lines.join("\n");
    }

    // Plain text
    const lines: string[] = [];
    lines.push(safeTitle);
    lines.push("=".repeat(safeTitle.length));
    lines.push("");
    lines.push(`Exported from Aurora — ${new Date().toLocaleString()}`);
    lines.push("");

    for (const msg of msgs) {
      const role = msg.role === "user" ? "You" : "Aurora";
      lines.push(`[${role}]`);
      lines.push("-".repeat(role.length + 2));
      lines.push(textOf(msg));
      lines.push("");
    }

    return lines.join("\n");
  }

  async function handleExport() {
    if (messages.length === 0) {
      toast.error("No messages to export");
      return;
    }

    setExporting(true);
    try {
      const safeName = (title || "conversation")
        .replace(/[^a-zA-Z0-9\s-]/g, "")
        .slice(0, 40);

      if (format === "pdf") {
        const doc = generatePdf(messages, title || "Conversation");
        doc.save(`${safeName}.pdf`);
        toast.success("Exported as PDF");
        onOpenChange(false);
      } else {
        const fmt = EXPORT_FORMATS.find((f) => f.id === format)!;
        const content = formatMessages(messages, format);
        const blob = new Blob([content], { type: fmt.mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${safeName}.${fmt.ext}`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success(`Exported as ${fmt.label}`);
        onOpenChange(false);
      }
    } catch (err) {
      toast.error("Failed to export conversation");
    } finally {
      setExporting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export conversation</DialogTitle>
          <DialogDescription>Choose a format and download this conversation.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-4">
          {EXPORT_FORMATS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFormat(f.id)}
              className={`flex items-start gap-3 rounded-lg border p-3 text-left text-sm transition-colors ${
                format === f.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted"
              }`}
            >
              <div
                className={`mt-0.5 size-4 shrink-0 rounded-full border-2 ${
                  format === f.id ? "border-primary bg-primary" : "border-muted-foreground"
                }`}
              >
                {format === f.id && (
                  <div className="flex size-full items-center justify-center">
                    <div className="size-1.5 rounded-full bg-white" />
                  </div>
                )}
              </div>
              <div className="flex-1">
                <div className="font-medium">{f.label}</div>
                <div className="text-muted-foreground">{f.desc}</div>
              </div>
            </button>
          ))}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={exporting}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={exporting || messages.length === 0}>
            {exporting ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Exporting…
              </>
            ) : (
              <>
                <FileText className="mr-2 size-4" />
                Download
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
