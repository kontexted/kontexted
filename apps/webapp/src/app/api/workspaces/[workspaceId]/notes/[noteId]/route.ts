import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { auth } from "@/auth";
import { db } from "@/db";
import { notes, noteLineBlame, revisions } from "@kontexted/db";
import { isValidFolderName } from "@/lib/folder-name";
import { parseSlug, parsePublicId } from "@/lib/params";
import { resolveWorkspaceId, resolveNoteId } from "@/lib/resolvers";
import { workspaceEventHub } from "@/lib/sse-hub";

export const runtime = "nodejs";

export async function DELETE(
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

  const noteRow = await db
    .select({ id: notes.id })
    .from(notes)
    .where(and(eq(notes.workspaceId, workspaceIdValue), eq(notes.id, noteIdValue)))
    .limit(1);

  if (noteRow.length === 0) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }

  await db.delete(noteLineBlame).where(eq(noteLineBlame.noteId, noteIdValue));
  await db.delete(revisions).where(eq(revisions.noteId, noteIdValue));
  await db
    .delete(notes)
    .where(and(eq(notes.id, noteIdValue), eq(notes.workspaceId, workspaceIdValue)));

  workspaceEventHub.publish({
    workspaceId: workspaceIdValue,
    type: "note.updated",
    data: { id: noteIdValue },
  });

  return NextResponse.json({ success: true });
}

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

  const title = typeof (body as { title?: unknown }).title === "string"
    ? (body as { title: string }).title.trim()
    : "";
  const name = typeof (body as { name?: unknown }).name === "string"
    ? (body as { name: string }).name.trim()
    : "";

  if (!title) {
    return NextResponse.json({ error: "Note title is required" }, { status: 400 });
  }

  if (!name) {
    return NextResponse.json({ error: "Note name is required" }, { status: 400 });
  }

  if (!isValidFolderName(name)) {
    return NextResponse.json(
      {
        error: "Note name must be kebab-case, camelCase, snake_case, or PascalCase",
      },
      { status: 400 }
    );
  }

  const noteRow = await db
    .select({ id: notes.id, folderId: notes.folderId })
    .from(notes)
    .where(and(eq(notes.workspaceId, workspaceIdValue), eq(notes.id, noteIdValue)))
    .limit(1);

  if (noteRow.length === 0) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }

  const updatedRows = await db
    .update(notes)
    .set({ name, title, updatedAt: new Date() })
    .where(and(eq(notes.id, noteIdValue), eq(notes.workspaceId, workspaceIdValue)))
    .returning({ id: notes.id, publicId: notes.publicId, name: notes.name, title: notes.title, folderId: notes.folderId });

  const updated = updatedRows[0];

  workspaceEventHub.publish({
    workspaceId: workspaceIdValue,
    type: "note.updated",
    data: updated,
  });

  return NextResponse.json(updated);
}
