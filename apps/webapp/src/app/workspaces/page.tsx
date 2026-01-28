import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { desc } from "drizzle-orm";

import { auth } from "@/auth";
import { db } from "@/db";
import { workspaces } from "@kontexted/db";
import CreateWorkspaceCard from "@/components/folders/create-workspace-card";

export default async function WorkspacesIndexPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect("/");
  }

  const workspaceRows = await db
    .select({ id: workspaces.id, slug: workspaces.slug, name: workspaces.name })
    .from(workspaces)
    .orderBy(desc(workspaces.createdAt))
    .limit(1);

  if (workspaceRows.length > 0) {
    redirect(`/workspaces/${workspaceRows[0].slug}`);
  }

  return <CreateWorkspaceCard />;
}
