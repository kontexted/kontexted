import { SignJWT } from "jose";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { auth } from "@/auth";
import { db } from "@/db";
import { notes } from "@kontexted/db";
import { parseSlug, parsePublicId } from "@/lib/params";
import { resolveWorkspaceId, resolveNoteId } from "@/lib/resolvers";
import { getPublicEnv } from "@/public-env";

export const runtime = "nodejs";

const TOKEN_TTL_SECONDS = 2 * 60;

const env = getPublicEnv()

const getTokenSecret = () => {
  const secret =
    process.env.COLLAB_TOKEN_SECRET ??
    (process.env.NODE_ENV === "production" ? null : "dev-secret");

  if (!secret) {
    throw new Error("COLLAB_TOKEN_SECRET is required in production");
  }

  if (!process.env.COLLAB_TOKEN_SECRET && process.env.NODE_ENV !== "production") {
    console.warn("COLLAB_TOKEN_SECRET not set; using dev-secret");
  }

  return new TextEncoder().encode(secret);
};

const resolveCollabUrl = () => {
  return (
    process.env.COLLAB_URL ??
    env.PUBLIC_COLLAB_URL
  );
};

export async function POST(request: Request) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const workspaceSlug = (body as { workspaceId?: unknown }).workspaceId;
  const notePublicId = (body as { noteId?: unknown }).noteId;

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

  const note = await db
    .select({ id: notes.id })
    .from(notes)
    .where(and(eq(notes.id, noteIdValue), eq(notes.workspaceId, workspaceIdValue)))
    .limit(1);

  if (note.length === 0) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + TOKEN_TTL_SECONDS;
  const token = await new SignJWT({
    workspaceId: workspaceIdValue,
    notePublicId: notePublicIdValue,
    noteId: noteIdValue,
    userId: session.user.id,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(expiresAt)
    .sign(getTokenSecret());

  const collabResponse = await fetch(`${resolveCollabUrl()}/api/status`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });

  const payload = await collabResponse.json().catch(() => ({}));

  if (!collabResponse.ok) {
    const message =
      typeof payload?.error === "string" ? payload.error : "Collab status failed";
    return NextResponse.json({ error: message }, { status: collabResponse.status });
  }

  return NextResponse.json(payload);
}
