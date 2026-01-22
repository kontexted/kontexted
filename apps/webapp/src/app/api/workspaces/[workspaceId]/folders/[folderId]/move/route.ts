import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { auth } from "@/auth";
import { db } from "@/db";
import { folders } from "@kontexted/db";
import { parseSlug, parsePublicId } from "@/lib/params";
import { resolveWorkspaceId, resolveFolderId } from "@/lib/resolvers";
import { workspaceEventHub } from "@/lib/sse-hub";

export const runtime = "nodejs";

const isDescendant = (
  targetId: number,
  candidateParentId: number | null,
  parentMap: Map<number, number | null>
) => {
  let current = candidateParentId;
  while (current != null) {
    if (current === targetId) {
      return true;
    }
    current = parentMap.get(current) ?? null;
  }
  return false;
};

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

  const parentIdRaw = (body as { parentId?: unknown }).parentId;
  const parentIdValue = parentIdRaw == null ? null : parsePublicId(parentIdRaw);

  if (parentIdRaw != null && !parentIdValue) {
    return NextResponse.json({ error: "Invalid parent id" }, { status: 400 });
  }

  let resolvedParentId: number | null = null;
  if (parentIdValue) {
    resolvedParentId = await resolveFolderId(parentIdValue);
    if (!resolvedParentId) {
      return NextResponse.json({ error: "Parent folder not found" }, { status: 404 });
    }
  }

  if (resolvedParentId === folderIdValue) {
    return NextResponse.json({ error: "Folder cannot be its own parent" }, { status: 400 });
  }

  const currentFolder = await db
    .select({ id: folders.id, parentId: folders.parentId })
    .from(folders)
    .where(and(eq(folders.workspaceId, workspaceIdValue), eq(folders.id, folderIdValue)))
    .limit(1);

  if (currentFolder.length === 0) {
    return NextResponse.json({ error: "Folder not found" }, { status: 404 });
  }

  if (resolvedParentId) {
    const parentFolder = await db
      .select({ id: folders.id })
      .from(folders)
      .where(and(eq(folders.workspaceId, workspaceIdValue), eq(folders.id, resolvedParentId)))
      .limit(1);

    if (parentFolder.length === 0) {
      return NextResponse.json({ error: "Parent folder not found" }, { status: 404 });
    }
  }

  const folderRows = await db
    .select({ id: folders.id, parentId: folders.parentId })
    .from(folders)
    .where(eq(folders.workspaceId, workspaceIdValue));

  const parentMap = new Map<number, number | null>();
  folderRows.forEach((row) => {
    parentMap.set(row.id, row.parentId);
  });

  if (isDescendant(folderIdValue, resolvedParentId, parentMap)) {
    return NextResponse.json({ error: "Folder cannot be moved into its descendant" }, { status: 400 });
  }

  const updatedRows = await db
    .update(folders)
    .set({ parentId: resolvedParentId, updatedAt: new Date() })
    .where(eq(folders.id, folderIdValue))
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
