import { and, asc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import NoteEditor from "@/components/editor/note-editor";
import { db } from "@/db";
import { noteLineBlame, notes, users } from "@kontexted/db";
import { parseSlug, parsePublicId } from "@/lib/params";
import { resolveWorkspaceId, resolveNoteId } from "@/lib/resolvers";

export default async function NotePage({
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
      content: notes.content,
      updatedAt: notes.updatedAt,
    })
    .from(notes)
    .where(and(eq(notes.workspaceId, workspaceIdValue), eq(notes.id, noteIdValue)))
    .limit(1);

  if (note.length === 0) {
    notFound();
  }

  const blameRows = await db
    .select({
      lineNumber: noteLineBlame.lineNumber,
      authorUserId: noteLineBlame.authorUserId,
      authorName: users.name,
      authorEmail: users.email,
      revisionId: noteLineBlame.revisionId,
      touchedAt: noteLineBlame.touchedAt,
    })
    .from(noteLineBlame)
    .leftJoin(users, eq(noteLineBlame.authorUserId, users.id))
    .where(eq(noteLineBlame.noteId, noteIdValue))
    .orderBy(asc(noteLineBlame.lineNumber));

  const blame = blameRows.map((row) => ({
    ...row,
    touchedAt: row.touchedAt.toISOString(),
  }));

  return (
    <NoteEditor
      workspaceId={workspaceIdValue}
      workspaceSlug={workspaceSlugValue}
      noteId={noteIdValue}
      notePublicId={notePublicIdValue}
      title={note[0].title}
      name={note[0].name}
      initialContent={note[0].content}
      initialUpdatedAt={note[0].updatedAt.toISOString()}
      initialBlame={blame}
    />
  );
}
