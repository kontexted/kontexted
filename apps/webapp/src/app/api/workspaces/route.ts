import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";

import { auth } from "@/auth";
import { db } from "@/db";
import { workspaces } from "@kontexted/db";

export const runtime = "nodejs";

const toSlug = (name: string) =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

export async function GET() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await db
    .select({ id: workspaces.id, slug: workspaces.slug, name: workspaces.name })
    .from(workspaces)
    .orderBy(desc(workspaces.createdAt));

  return NextResponse.json(rows, { status: 200 });
}

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

  const name =
    typeof (body as { name?: unknown }).name === "string"
      ? (body as { name: string }).name.trim()
      : "";

  if (!name) {
    return NextResponse.json({ error: "Workspace name is required" }, { status: 400 });
  }

  const slugBase = toSlug(name) || "workspace";
  const slug = `${slugBase}-${crypto.randomUUID().split("-")[0]}`;

  const insertedRows = await db
    .insert(workspaces)
    .values({
      name,
      slug,
      createdByUserId: session.user.id,
    })
    .returning({ id: workspaces.id, name: workspaces.name, slug: workspaces.slug });

  return NextResponse.json(insertedRows[0], { status: 201 });
}
