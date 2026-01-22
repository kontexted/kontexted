"use client";

import createDOMPurify, { type WindowLike } from "dompurify";
import { marked } from "marked";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

type RevisionEntry = {
  id: number;
  authorUserId: string;
  authorName: string | null;
  authorEmail: string | null;
  createdAt: string | Date;
  content: string;
};

interface NoteHistoryProps {
  workspaceId: number;
  workspaceSlug: string;
  noteId: number;
  notePublicId: string;
  title: string;
  name: string;
  revisionHistory: RevisionEntry[];
}

export default function NoteHistory({
  workspaceId,
  noteId,
  title,
  name,
  revisionHistory,
}: NoteHistoryProps) {
  const router = useRouter();
  const [selectedRevisionId, setSelectedRevisionId] = useState<number | null>(
    revisionHistory[0]?.id ?? null
  );

  const dompurify = typeof window !== "undefined" ? createDOMPurify(window as WindowLike) : null;

  const renderMarkdown = (value: string) => {
    return marked.parse(value, { breaks: true }) as string;
  };

  const formatRevisionAuthor = (revision: RevisionEntry) => {
    return revision.authorName ?? revision.authorEmail ?? revision.authorUserId;
  };

  const formatTimestamp = (value: string | Date) => {
    const date = typeof value === "string" ? new Date(value) : value;
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    return date.toLocaleString();
  };

  const selectedRevision = revisionHistory.find(
    (revision) => revision.id === selectedRevisionId
  ) ?? null;

  const revisionPreviewHtml = selectedRevision
    ? dompurify
      ? dompurify.sanitize(renderMarkdown(selectedRevision.content))
      : renderMarkdown(selectedRevision.content)
    : "";

  return (
    <div className="note-history flex h-full min-h-0 flex-col bg-background">
      <div className="flex items-center gap-3 border-b border-border bg-muted/40 px-4 py-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.back()}
          className="h-8 px-2"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{title}</div>
          <div className="truncate text-xs text-muted-foreground">{name}.md</div>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="border-b border-border bg-muted/20 px-4 py-2">
          <div className="text-xs font-medium text-muted-foreground">
            Version history
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <div className="w-full shrink-0 border-b border-border md:w-80 md:border-b-0 md:border-r">
            <div className="h-full max-h-[50vh] overflow-y-auto px-4 py-3 md:max-h-none">
              {revisionHistory.length > 0 ? (
                <ul className="space-y-1">
                  {revisionHistory.map((revision) => (
                    <li key={revision.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedRevisionId(revision.id)}
                        className={`flex w-full flex-col gap-1 border px-3 py-2 text-left transition ${
                          selectedRevisionId === revision.id
                            ? "border-primary/60 bg-primary/10 text-foreground"
                            : "border-border text-muted-foreground hover:bg-accent"
                        }`}
                      >
                        <span className="truncate text-xs font-medium">
                          {formatRevisionAuthor(revision)}
                        </span>
                        <span className="text-[10px]">
                          {formatTimestamp(revision.createdAt)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">No revisions yet.</p>
              )}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto bg-background p-4">
            {selectedRevision ? (
              <div
                className="preview-content max-w-4xl text-sm"
                dangerouslySetInnerHTML={{ __html: revisionPreviewHtml }}
              />
            ) : (
              <p className="text-muted-foreground">Select a revision to preview.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
