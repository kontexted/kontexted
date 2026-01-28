import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { db } from "@/db";
import { notes } from "@kontexted/db";
import { isValidFolderName } from "@/lib/folder-name";
import { parseSlug, parsePublicId } from "@/lib/params";
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

  const title = typeof (body as { title?: unknown }).title === "string"
    ? (body as { title: string }).title.trim()
    : "";
  const name = typeof (body as { name?: unknown }).name === "string"
    ? (body as { name: string }).name.trim()
    : "";
  const folderIdRaw = (body as { folderId?: unknown }).folderId;
  const folderIdValue = folderIdRaw == null ? null : parsePublicId(folderIdRaw);

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

  const insertedRows = await db
    .insert(notes)
    .values({
      workspaceId: workspaceIdValue,
      folderId: resolvedFolderId,
      name,
      title,
      content: "",
    })
    .returning({ id: notes.id, publicId: notes.publicId, name: notes.name, title: notes.title, folderId: notes.folderId });

  const note = insertedRows[0];

  workspaceEventHub.publish({
    workspaceId: workspaceIdValue,
    type: "note.created",
    data: note,
  });

  return NextResponse.json(note, { status: 201 });
}
