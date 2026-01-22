import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { parseSlug } from "@/lib/params";
import { resolveWorkspaceId } from "@/lib/resolvers";
import { getWorkspaceTree } from "@/lib/workspace-tree";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
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

  const tree = await getWorkspaceTree(workspaceIdValue);

  if (!tree) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  return NextResponse.json(tree);
}
