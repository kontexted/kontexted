import { db } from "@/db";
import { notes, folders, workspaces } from "@kontexted/db";
import { eq } from "drizzle-orm";

export const resolveNoteId = async (publicId: string) => {
  const note = await db
    .select({ id: notes.id })
    .from(notes)
    .where(eq(notes.publicId, publicId))
    .limit(1);

  return note[0]?.id ?? null;
};

export const resolveFolderId = async (publicId: string) => {
  const folder = await db
    .select({ id: folders.id })
    .from(folders)
    .where(eq(folders.publicId, publicId))
    .limit(1);

  return folder[0]?.id ?? null;
};

export const resolveWorkspaceId = async (slug: string) => {
  const workspace = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.slug, slug))
    .limit(1);

  return workspace[0]?.id ?? null;
};
