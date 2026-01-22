"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export default function CreateWorkspaceCard() {
  const router = useRouter();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const closeCreateModal = () => {
    setIsCreateOpen(false);
    setNewWorkspaceName("");
    setCreateError(null);
  };

  const handleCreateWorkspace = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedName = newWorkspaceName.trim();
    if (!trimmedName) {
      setCreateError("Workspace name is required.");
      return;
    }

    setIsCreating(true);
    setCreateError(null);

    try {
      const response = await fetch("/api/workspaces", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: trimmedName }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.error ?? "Unable to create workspace");
      }

      const created = (await response.json()) as { id: number };
      closeCreateModal();
      router.push(`/workspaces/${created.id}`);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Unable to create workspace");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-8">
      <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-2xl border border-border bg-card p-6 text-center">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">Create a workspace</h2>
          <p className="text-sm text-muted-foreground">
            No workspace selected. Create one to start organizing your context.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsCreateOpen(true)}
          className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground transition hover:bg-primary/90"
        >
          New workspace
        </button>
      </div>

      {isCreateOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            className="w-full max-w-md rounded-2xl bg-card p-6 shadow-lg"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-workspace-title"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 id="create-workspace-title" className="text-lg font-semibold text-foreground">
                  Create a workspace
                </h3>
                <p className="text-sm text-muted-foreground">
                  Give your new workspace a memorable name.
                </p>
              </div>
              <button
                type="button"
                onClick={closeCreateModal}
                className="text-sm text-muted-foreground transition hover:text-foreground"
              >
                Close
              </button>
            </div>
            <form className="mt-6 flex flex-col gap-4" onSubmit={handleCreateWorkspace}>
              <label className="flex flex-col gap-2 text-sm font-medium text-foreground">
                Workspace name
                <input
                  value={newWorkspaceName}
                  onChange={(event) => setNewWorkspaceName(event.target.value)}
                  className="h-11 rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none transition focus:border-border"
                  placeholder="Product planning"
                  autoFocus
                />
              </label>
              {createError && (
                <p className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {createError}
                </p>
              )}
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeCreateModal}
                  className="inline-flex h-10 items-center justify-center rounded-full border border-border px-5 text-sm font-medium text-foreground transition hover:border-border/80"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="inline-flex h-10 items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isCreating ? "Creating..." : "Create workspace"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
