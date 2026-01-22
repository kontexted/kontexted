import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";

import { auth } from "@/auth";
import { db } from "@/db";
import { folders, notes, noteLineBlame, revisions } from "@kontexted/db";
import { parseSlug, parsePublicId } from "@/lib/params";
import { isValidFolderName } from "@/lib/folder-name";
import { resolveWorkspaceId, resolveFolderId } from "@/lib/resolvers";
import { workspaceEventHub } from "@/lib/sse-hub";

async function collectFolderIds(folderId: number, workspaceId: number): Promise<number[]> {
  const childFolders = await db
    .select({ id: folders.id })
    .from(folders)
    .where(and(eq(folders.parentId, folderId), eq(folders.workspaceId, workspaceId)));

  let allIds = [folderId];
  for (const child of childFolders) {
    allIds = allIds.concat(await collectFolderIds(child.id, workspaceId));
  }
  return allIds;
}

async function collectNoteIds(folderIds: number[], workspaceId: number): Promise<number[]> {
  const noteRows = await db
    .select({ id: notes.id })
    .from(notes)
    .where(and(eq(notes.workspaceId, workspaceId), inArray(notes.folderId, folderIds)));

  return noteRows.map((row) => row.id);
}

export const runtime = "nodejs";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string; folderId: string }> }
) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspaceId: workspaceSlug, folderId: folderPublicId } = await params;
  const workspaceSlugValue = parseSlug(workspaceSlug);
  if (!workspaceSlugValue) {
    return NextResponse.json({ error: "Invalid workspace slug" }, { status: 400 });
  }

  const folderPublicIdValue = parsePublicId(folderPublicId);
  if (!folderPublicIdValue) {
    return NextResponse.json({ error: "Invalid folder public ID" }, { status: 400 });
  }

  const workspaceIdValue = await resolveWorkspaceId(workspaceSlugValue);
  if (!workspaceIdValue) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  const folderIdValue = await resolveFolderId(folderPublicIdValue);
  if (!folderIdValue) {
    return NextResponse.json({ error: "Folder not found" }, { status: 404 });
  }

  const folderRow = await db
    .select({ id: folders.id })
    .from(folders)
    .where(and(eq(folders.workspaceId, workspaceIdValue), eq(folders.id, folderIdValue)))
    .limit(1);

  if (folderRow.length === 0) {
    return NextResponse.json({ error: "Folder not found" }, { status: 404 });
  }

  const allFolderIds = await collectFolderIds(folderIdValue, workspaceIdValue);
  const allNoteIds = await collectNoteIds(allFolderIds, workspaceIdValue);

  if (allNoteIds.length > 0) {
    await db.delete(noteLineBlame).where(inArray(noteLineBlame.noteId, allNoteIds));
    await db.delete(revisions).where(inArray(revisions.noteId, allNoteIds));
    await db.delete(notes).where(inArray(notes.id, allNoteIds));
  }

  await db.delete(folders).where(inArray(folders.id, allFolderIds));

  workspaceEventHub.publish({
    workspaceId: workspaceIdValue,
    type: "folder.updated",
    data: { id: folderIdValue },
  });

  return NextResponse.json({ success: true });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string; folderId: string }> }
) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspaceId: workspaceSlug, folderId: folderPublicId } = await params;
  const workspaceSlugValue = parseSlug(workspaceSlug);
  if (!workspaceSlugValue) {
    return NextResponse.json({ error: "Invalid workspace slug" }, { status: 400 });
  }

  const folderPublicIdValue = parsePublicId(folderPublicId);
  if (!folderPublicIdValue) {
    return NextResponse.json({ error: "Invalid folder public ID" }, { status: 400 });
  }

  const workspaceIdValue = await resolveWorkspaceId(workspaceSlugValue);
  if (!workspaceIdValue) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  const folderIdValue = await resolveFolderId(folderPublicIdValue);
  if (!folderIdValue) {
    return NextResponse.json({ error: "Folder not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const name = typeof (body as { name?: unknown }).name === "string"
    ? (body as { name: string }).name.trim()
    : "";
  const displayName = typeof (body as { displayName?: unknown }).displayName === "string"
    ? (body as { displayName: string }).displayName.trim()
    : "";

  if (!displayName) {
    return NextResponse.json({ error: "Folder display name is required" }, { status: 400 });
  }

  if (!name) {
    return NextResponse.json({ error: "Folder name is required" }, { status: 400 });
  }

  if (!isValidFolderName(name)) {
    return NextResponse.json(
      {
        error: "Folder name must be kebab-case, camelCase, snake_case, or PascalCase",
      },
      { status: 400 }
    );
  }

  const folderRow = await db
    .select({ id: folders.id, parentId: folders.parentId })
    .from(folders)
    .where(and(eq(folders.workspaceId, workspaceIdValue), eq(folders.id, folderIdValue)))
    .limit(1);

  if (folderRow.length === 0) {
    return NextResponse.json({ error: "Folder not found" }, { status: 404 });
  }

  const updatedRows = await db
    .update(folders)
    .set({ name, displayName, updatedAt: new Date() })
    .where(and(eq(folders.id, folderIdValue), eq(folders.workspaceId, workspaceIdValue)))
    .returning({
      id: folders.id,
      publicId: folders.publicId,
      name: folders.name,
      displayName: folders.displayName,
      parentId: folders.parentId,
    });

  const updated = updatedRows[0];

  workspaceEventHub.publish({
    workspaceId: workspaceIdValue,
    type: "folder.updated",
    data: updated,
  });

  return NextResponse.json(updated);
}
