"use client";

import type { ReactNode } from "react";

import FolderTree from "@/components/folders/folder-tree";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import type { WorkspaceTree } from "@/lib/workspace-tree";

type WorkspaceSummary = {
  id: number;
  slug: string;
  name: string;
};

type WorkspaceShellProps = {
  children: ReactNode;
  workspaceSlug: string | null;
  workspaceName: string;
  workspaces: WorkspaceSummary[];
  initialTree: WorkspaceTree | null;
  initialLabelMode: "display" | "name";
};

export default function WorkspaceShell({
  children,
  workspaceSlug,
  workspaceName,
  workspaces,
  initialTree,
  initialLabelMode,
}: WorkspaceShellProps) {
  return (
    <SidebarProvider>
      <FolderTree
        workspaceSlug={workspaceSlug}
        workspaceName={workspaceName}
        workspaces={workspaces}
        initialTree={initialTree}
        initialLabelMode={initialLabelMode}
      />
      <SidebarInset className="h-svh min-h-0 overflow-hidden">
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
