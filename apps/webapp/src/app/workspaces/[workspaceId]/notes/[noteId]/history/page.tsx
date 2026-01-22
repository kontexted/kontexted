import { and, desc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import NoteHistory from "@/components/history/note-history";
import { db } from "@/db";
import { notes, revisions, users } from "@kontexted/db";
import { parseSlug, parsePublicId } from "@/lib/params";
import { resolveWorkspaceId, resolveNoteId } from "@/lib/resolvers";

export default async function NoteHistoryPage({
  params,
}: {
  params: Promise<{ workspaceId: string; noteId: string }>;
}) {
  const { workspaceId: workspaceSlug, noteId: notePublicId } = await params;
  const workspaceSlugValue = parseSlug(workspaceSlug);
  if (!workspaceSlugValue) {
    notFound();
  }

  const notePublicIdValue = parsePublicId(notePublicId);
  if (!notePublicIdValue) {
    notFound();
  }

  const workspaceIdValue = await resolveWorkspaceId(workspaceSlugValue);
  if (!workspaceIdValue) {
    notFound();
  }

  const noteIdValue = await resolveNoteId(notePublicIdValue);
  if (!noteIdValue) {
    notFound();
  }

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect("/");
  }

  const note = await db
    .select({
      id: notes.id,
      publicId: notes.publicId,
      name: notes.name,
      title: notes.title,
    })
    .from(notes)
    .where(and(eq(notes.workspaceId, workspaceIdValue), eq(notes.id, noteIdValue)))
    .limit(1);

  if (note.length === 0) {
    notFound();
  }

  const revisionRows = await db
    .select({
      id: revisions.id,
      authorUserId: revisions.authorUserId,
      authorName: users.name,
      authorEmail: users.email,
      createdAt: revisions.createdAt,
      content: revisions.content,
    })
    .from(revisions)
    .leftJoin(users, eq(revisions.authorUserId, users.id))
    .where(eq(revisions.noteId, noteIdValue))
    .orderBy(desc(revisions.createdAt))
    .limit(50);

  const revisionHistory = revisionRows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
  }));

  return (
    <NoteHistory
      workspaceId={workspaceIdValue}
      workspaceSlug={workspaceSlugValue}
      noteId={noteIdValue}
      notePublicId={notePublicIdValue}
      title={note[0].title}
      name={note[0].name}
      revisionHistory={revisionHistory}
    />
  );
}
