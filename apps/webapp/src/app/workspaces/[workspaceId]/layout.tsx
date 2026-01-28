import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { desc } from "drizzle-orm";

import { auth } from "@/auth";
import { db } from "@/db";
import { workspaces } from "@kontexted/db";
import WorkspaceShell from "@/components/folders/workspace-shell";
import { parseSlug } from "@/lib/params";
import { resolveWorkspaceId } from "@/lib/resolvers";
import { getWorkspaceTree } from "@/lib/workspace-tree";

const resolveLabelMode = (value: string | null) => (value === "name" ? "name" : "display");

export default async function WorkspaceLayout({
  children,
  params,
  searchParams,
}: {
  children: ReactNode;
  params: Promise<{ workspaceId: string }>;
  searchParams?: Promise<{ labels?: string }>;
}) {
  const { workspaceId: workspaceSlug } = await params;
  const workspaceSlugValue = parseSlug(workspaceSlug);

  if (!workspaceSlugValue) {
    redirect("/workspaces");
  }

  const workspaceIdValue = await resolveWorkspaceId(workspaceSlugValue);

  if (!workspaceIdValue) {
    redirect("/workspaces");
  }

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect("/");
  }

  const tree = await getWorkspaceTree(workspaceIdValue);

  if (!tree) {
    redirect("/workspaces");
  }

  const workspaceRows = await db
    .select({ id: workspaces.id, slug: workspaces.slug, name: workspaces.name })
    .from(workspaces)
    .orderBy(desc(workspaces.createdAt));

  const resolvedSearchParams = await searchParams;
  const initialLabelMode = resolveLabelMode(resolvedSearchParams?.labels ?? null);

  return (
    <WorkspaceShell
      workspaceSlug={workspaceSlugValue}
      workspaceName={tree.workspaceName}
      workspaces={workspaceRows}
      initialTree={tree}
      initialLabelMode={initialLabelMode}
    >
      {children}
    </WorkspaceShell>
  );
}
