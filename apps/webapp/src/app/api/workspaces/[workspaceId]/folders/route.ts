import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { db } from "@/db";
import { folders } from "@kontexted/db";
import { parseSlug, parsePublicId } from "@/lib/params";
import { isValidFolderName } from "@/lib/folder-name";
import { resolveWorkspaceId, resolveFolderId } from "@/lib/resolvers";
import { workspaceEventHub } from "@/lib/sse-hub";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspaceId: workspaceSlug } = await params;
  const workspaceSlugValue = parseSlug(workspaceSlug);

  if (!workspaceSlugValue) {
    return NextResponse.json({ error: "Invalid workspace slug" }, { status: 400 });
  }

  const workspaceIdValue = await resolveWorkspaceId(workspaceSlugValue);
  if (!workspaceIdValue) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
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
  const parentIdRaw = (body as { parentId?: unknown }).parentId;
  const parentIdValue = parentIdRaw == null ? null : parsePublicId(parentIdRaw);

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

  const insertedRows = await db
    .insert(folders)
    .values({
      workspaceId: workspaceIdValue,
      parentId: resolvedParentId,
      name,
      displayName,
    })
    .returning({
      id: folders.id,
      publicId: folders.publicId,
      name: folders.name,
      displayName: folders.displayName,
      parentId: folders.parentId,
    });

  const folder = insertedRows[0];

  workspaceEventHub.publish({
    workspaceId: workspaceIdValue,
    type: "folder.created",
    data: folder,
  });

  return NextResponse.json(folder, { status: 201 });
}
