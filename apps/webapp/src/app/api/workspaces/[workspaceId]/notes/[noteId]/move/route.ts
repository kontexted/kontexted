import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { auth } from "@/auth";
import { db } from "@/db";
import { notes } from "@kontexted/db";
import { parseSlug, parsePublicId } from "@/lib/params";
import { resolveWorkspaceId, resolveNoteId, resolveFolderId } from "@/lib/resolvers";
import { workspaceEventHub } from "@/lib/sse-hub";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string; noteId: string }> }
) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspaceId: workspaceSlug, noteId: notePublicId } = await params;
  const workspaceSlugValue = parseSlug(workspaceSlug);
  if (!workspaceSlugValue) {
    return NextResponse.json({ error: "Invalid workspace slug" }, { status: 400 });
  }

  const notePublicIdValue = parsePublicId(notePublicId);
  if (!notePublicIdValue) {
    return NextResponse.json({ error: "Invalid note public ID" }, { status: 400 });
  }

  const workspaceIdValue = await resolveWorkspaceId(workspaceSlugValue);
  if (!workspaceIdValue) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  const noteIdValue = await resolveNoteId(notePublicIdValue);
  if (!noteIdValue) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const folderIdRaw = (body as { folderId?: unknown }).folderId;
  const folderIdValue = folderIdRaw == null ? null : parsePublicId(folderIdRaw);

  if (folderIdRaw != null && !folderIdValue) {
    return NextResponse.json({ error: "Invalid folder id" }, { status: 400 });
  }

  let resolvedFolderId: number | null = null;
  if (folderIdValue) {
    resolvedFolderId = await resolveFolderId(folderIdValue);
    if (!resolvedFolderId) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }
  }

  const note = await db
    .select({ id: notes.id, folderId: notes.folderId })
    .from(notes)
    .where(and(eq(notes.workspaceId, workspaceIdValue), eq(notes.id, noteIdValue)))
    .limit(1);

  if (note.length === 0) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }

  const updatedRows = await db
    .update(notes)
    .set({ folderId: resolvedFolderId, updatedAt: new Date() })
    .where(eq(notes.id, noteIdValue))
    .returning({ id: notes.id, publicId: notes.publicId, name: notes.name, title: notes.title, folderId: notes.folderId });

  const updated = updatedRows[0];

  workspaceEventHub.publish({
    workspaceId: workspaceIdValue,
    type: "note.updated",
    data: updated,
  });

  return NextResponse.json(updated);
}
