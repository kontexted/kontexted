import { asc, and, eq, ilike, or } from "drizzle-orm";
import { z } from "zod";

import { auth } from "@/auth";
import { db } from "@/db";
import { getWorkspaceTree, type FolderNode, type WorkspaceTree } from "@/lib/workspace-tree";
import { folders, notes } from "@kontexted/db";
import { withMcpAuth } from "better-auth/plugins";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { parseSlug, parsePublicId } from "@/lib/params";
import { resolveWorkspaceId, resolveNoteId, resolveFolderId } from "@/lib/resolvers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noteSummarySchema = z.object({
  publicId: z.string(),
  name: z.string(),
  title: z.string(),
  folderPublicId: z.string().nullable(),
});

const folderSchemaBase = z.object({
  publicId: z.string(),
  name: z.string(),
  displayName: z.string(),
  parentPublicId: z.string().nullable(),
  notes: z.array(noteSummarySchema),
});

type FolderSchemaOutput = z.infer<typeof folderSchemaBase> & {
  children: FolderSchemaOutput[];
};

const folderSchema: z.ZodType<FolderSchemaOutput> = z.lazy(() =>
  folderSchemaBase.extend({
    children: z.array(folderSchema),
  })
);

const workspaceTreeSchema = z.object({
  workspaceSlug: z.string(),
  workspaceName: z.string(),
  rootNotes: z.array(noteSummarySchema),
  folders: z.array(folderSchema),
});

const noteSchema = z.object({
  publicId: z.string(),
  name: z.string(),
  title: z.string(),
  content: z.string(),
  folderPublicId: z.string().nullable(),
  updatedAt: z.string(),
});

const searchNotesSchema = z.object({
  matches: z.array(noteSummarySchema),
});

type FolderNodeWithPublicId = {
  publicId: string;
  name: string;
  displayName: string;
  parentPublicId: string | null;
  notes: z.infer<typeof noteSummarySchema>[];
  children: FolderNodeWithPublicId[];
};

type WorkspaceTreeWithPublicId = {
  workspaceSlug: string;
  workspaceName: string;
  rootNotes: z.infer<typeof noteSummarySchema>[];
  folders: FolderNodeWithPublicId[];
};

const transformFolderTree = (
  folders: FolderNode[],
  folderPublicIdMap: Map<number, string>
): FolderNodeWithPublicId[] => {
  return folders.map((folder) => ({
    publicId: folder.publicId,
    name: folder.name,
    displayName: folder.displayName,
    parentPublicId: folder.parentId ? folderPublicIdMap.get(folder.parentId) ?? null : null,
    notes: folder.notes.map((note) => ({
      publicId: note.publicId,
      name: note.name,
      title: note.title,
      folderPublicId: note.folderId ? folderPublicIdMap.get(note.folderId) ?? null : null,
    })),
    children: transformFolderTree(folder.children, folderPublicIdMap),
  }));
};

const transformWorkspaceTree = (
  tree: WorkspaceTree,
  workspaceSlug: string
): WorkspaceTreeWithPublicId => {
  const folderPublicIdMap = new Map<number, string>();
  tree.folders.forEach((folder) => {
    folderPublicIdMap.set(folder.id, folder.publicId);
  });

  return {
    workspaceSlug,
    workspaceName: tree.workspaceName,
    rootNotes: tree.rootNotes.map((note) => ({
      publicId: note.publicId,
      name: note.name,
      title: note.title,
      folderPublicId: note.folderId ? folderPublicIdMap.get(note.folderId) ?? null : null,
    })),
    folders: transformFolderTree(tree.folders, folderPublicIdMap),
  };
};

const buildMcpServer = () => {
  const server = new McpServer({
    name: "kontexted",
    version: "0.1.0",
  });

  server.registerTool(
    "getWorkspaceTree",
    {
      title: "Get workspace tree",
      description: "Fetch the folder tree of folders and notes for the configured workspace",
      inputSchema: z.object({
        workspaceSlug: z.string(),
      }),
      outputSchema: z.object({
        tree: workspaceTreeSchema,
      }),
    },
    async ({ workspaceSlug }) => {
      const workspaceSlugValue = parseSlug(workspaceSlug);
      if (!workspaceSlugValue) {
        return {
          content: [{ type: "text", text: "Invalid workspace slug." }],
          isError: true,
        };
      }

      const workspaceIdValue = await resolveWorkspaceId(workspaceSlugValue);
      if (!workspaceIdValue) {
        return {
          content: [{ type: "text", text: "Workspace not found." }],
          isError: true,
        };
      }

      const tree = await getWorkspaceTree(workspaceIdValue);

      if (!tree) {
        return {
          content: [{ type: "text", text: "Workspace not found." }],
          isError: true,
        };
      }

      const transformedTree = transformWorkspaceTree(tree, workspaceSlugValue);

      return {
        content: [
          { type: "text", text: `Loaded tree for workspace ${workspaceSlug}.` },
          { type: "text", text: JSON.stringify({ tree: transformedTree }, null, 2) },
        ],
        structuredContent: {
          tree: transformedTree,
        },
      };
    }
  );

  server.registerTool(
    "searchNotesByQuery",
    {
      title: "Search notes by query",
      description: "Find notes by name or title in the configured workspace",
      inputSchema: z.object({
        workspaceSlug: z.string(),
        query: z.string().min(1),
        limit: z.number().int().positive().max(50).optional(),
      }),
      outputSchema: searchNotesSchema,
    },
    async ({ workspaceSlug, query, limit }) => {
      const workspaceSlugValue = parseSlug(workspaceSlug);
      if (!workspaceSlugValue) {
        return {
          content: [{ type: "text", text: "Invalid workspace slug." }],
          isError: true,
        };
      }

      const workspaceIdValue = await resolveWorkspaceId(workspaceSlugValue);
      if (!workspaceIdValue) {
        return {
          content: [{ type: "text", text: "Workspace not found." }],
          isError: true,
        };
      }

      const pattern = `%${query.trim()}%`;
      const rows = await db
        .select({
          id: notes.id,
          publicId: notes.publicId,
          name: notes.name,
          title: notes.title,
          folderId: notes.folderId,
          folderPublicId: folders.publicId,
        })
        .from(notes)
        .leftJoin(folders, eq(notes.folderId, folders.id))
        .where(
          and(
            eq(notes.workspaceId, workspaceIdValue),
            or(ilike(notes.title, pattern), ilike(notes.name, pattern))
          )
        )
        .orderBy(asc(notes.title))
        .limit(limit ?? 20);

      const matches = rows.map((row) => ({
        publicId: row.publicId,
        name: row.name,
        title: row.title,
        folderPublicId: row.folderPublicId ?? null,
      }));

      return {
        content: [
          { type: "text", text: `Found ${matches.length} matching notes.` },
          { type: "text", text: JSON.stringify({ matches }, null, 2) },
        ],
        structuredContent: {
          matches,
        },
      };
    }
  );

  server.registerTool(
    "getNoteById",
    {
      title: "Get note by id",
      description: "Fetch a note by public ID from the configured workspace",
      inputSchema: z.object({
        workspaceSlug: z.string(),
        notePublicId: z.string(),
      }),
      outputSchema: z.object({
        note: noteSchema,
      }),
    },
    async ({ workspaceSlug, notePublicId }) => {
      const workspaceSlugValue = parseSlug(workspaceSlug);
      if (!workspaceSlugValue) {
        return {
          content: [{ type: "text", text: "Invalid workspace slug." }],
          isError: true,
        };
      }

      const notePublicIdValue = parsePublicId(notePublicId);
      if (!notePublicIdValue) {
        return {
          content: [{ type: "text", text: "Invalid note public ID." }],
          isError: true,
        };
      }

      const workspaceIdValue = await resolveWorkspaceId(workspaceSlugValue);
      if (!workspaceIdValue) {
        return {
          content: [{ type: "text", text: "Workspace not found." }],
          isError: true,
        };
      }

      const noteIdValue = await resolveNoteId(notePublicIdValue);
      if (!noteIdValue) {
        return {
          content: [{ type: "text", text: "Note not found." }],
          isError: true,
        };
      }

      const rows = await db
        .select({
          id: notes.id,
          publicId: notes.publicId,
          name: notes.name,
          title: notes.title,
          content: notes.content,
          folderId: notes.folderId,
          folderPublicId: folders.publicId,
          updatedAt: notes.updatedAt,
        })
        .from(notes)
        .leftJoin(folders, eq(notes.folderId, folders.id))
        .where(and(eq(notes.workspaceId, workspaceIdValue), eq(notes.id, noteIdValue)))
        .limit(1);

      const row = rows[0];

      if (!row) {
        return {
          content: [{ type: "text", text: "Note not found." }],
          isError: true,
        };
      }

      const result = {
        publicId: row.publicId,
        name: row.name,
        title: row.title,
        content: row.content,
        folderPublicId: row.folderPublicId ?? null,
        updatedAt: row.updatedAt.toISOString(),
      };

      return {
        content: [
          { type: "text", text: `Loaded note ${notePublicId}.` },
          { type: "text", text: result.content },
        ],
        structuredContent: {
          note: result,
        },
      };
    }
  );

  server.registerTool(
    "createFolder",
    {
      title: "Create folder",
      description: "Create a new folder in the configured workspace",
      inputSchema: z.object({
        workspaceSlug: z.string(),
        name: z.string().min(1),
        parentFolderPublicId: z.string().optional(),
      }),
      outputSchema: z.object({
        folder: folderSchemaBase,
      }),
    },
    async ({ workspaceSlug, name, parentFolderPublicId }) => {
      const workspaceSlugValue = parseSlug(workspaceSlug);
      if (!workspaceSlugValue) {
        return {
          content: [{ type: "text", text: "Invalid workspace slug." }],
          isError: true,
        };
      }

      const workspaceIdValue = await resolveWorkspaceId(workspaceSlugValue);
      if (!workspaceIdValue) {
        return {
          content: [{ type: "text", text: "Workspace not found." }],
          isError: true,
        };
      }

      let parentFolderId = null;
      if (parentFolderPublicId) {
        const parentFolderPublicIdValue = parsePublicId(parentFolderPublicId);
        if (!parentFolderPublicIdValue) {
          return {
            content: [{ type: "text", text: "Invalid folder public ID." }],
            isError: true,
          };
        }

        parentFolderId = await resolveFolderId(parentFolderPublicIdValue);
        if (!parentFolderId) {
          return {
            content: [{ type: "text", text: "Parent folder not found." }],
            isError: true,
          };
        }

        const parentFolder = await db
          .select({ workspaceId: folders.workspaceId })
          .from(folders)
          .where(eq(folders.id, parentFolderId))
          .limit(1);

        if (!parentFolder[0] || parentFolder[0].workspaceId !== workspaceIdValue) {
          return {
            content: [{ type: "text", text: "Parent folder not in this workspace." }],
            isError: true,
          };
        }
      }

      const [newFolder] = await db
        .insert(folders)
        .values({
          workspaceId: workspaceIdValue,
          parentId: parentFolderId,
          name: name.toLowerCase().replace(/\s+/g, "-"),
          displayName: name,
        })
        .returning();

      const result = {
        publicId: newFolder.publicId,
        name: newFolder.name,
        displayName: newFolder.displayName,
        parentPublicId: parentFolderPublicId ?? null,
        notes: [],
      };

      return {
        content: [
          { type: "text", text: `Created folder "${name}".` },
          { type: "text", text: JSON.stringify({ folder: result }, null, 2) },
        ],
        structuredContent: {
          folder: result,
        },
      };
    }
  );

  server.registerTool(
    "createNote",
    {
      title: "Create note",
      description: "Create a new note in the configured workspace",
      inputSchema: z.object({
        workspaceSlug: z.string(),
        title: z.string().min(1),
        content: z.string().optional(),
        folderPublicId: z.string().optional(),
      }),
      outputSchema: z.object({
        note: noteSchema,
      }),
    },
    async ({ workspaceSlug, title, content = "", folderPublicId }) => {
      const workspaceSlugValue = parseSlug(workspaceSlug);
      if (!workspaceSlugValue) {
        return {
          content: [{ type: "text", text: "Invalid workspace slug." }],
          isError: true,
        };
      }

      const workspaceIdValue = await resolveWorkspaceId(workspaceSlugValue);
      if (!workspaceIdValue) {
        return {
          content: [{ type: "text", text: "Workspace not found." }],
          isError: true,
        };
      }

      let folderId = null;
      let folderPublicIdValue = null;
      if (folderPublicId) {
        const parsedFolderPublicId = parsePublicId(folderPublicId);
        if (!parsedFolderPublicId) {
          return {
            content: [{ type: "text", text: "Invalid folder public ID." }],
            isError: true,
          };
        }
        folderPublicIdValue = parsedFolderPublicId;
        folderId = await resolveFolderId(folderPublicIdValue);
        if (!folderId) {
          return {
            content: [{ type: "text", text: "Folder not found." }],
            isError: true,
          };
        }

        const folder = await db
          .select({ workspaceId: folders.workspaceId })
          .from(folders)
          .where(eq(folders.id, folderId))
          .limit(1);

        if (!folder[0] || folder[0].workspaceId !== workspaceIdValue) {
          return {
            content: [{ type: "text", text: "Folder not in this workspace." }],
            isError: true,
          };
        }
      }

      const name = title.toLowerCase().replace(/\s+/g, "-");

      const [newNote] = await db
        .insert(notes)
        .values({
          workspaceId: workspaceIdValue,
          folderId,
          name,
          title,
          content,
        })
        .returning();

      const result = {
        publicId: newNote.publicId,
        name: newNote.name,
        title: newNote.title,
        content: newNote.content,
        folderPublicId: folderPublicIdValue ?? null,
        updatedAt: newNote.updatedAt.toISOString(),
      };

      return {
        content: [
          { type: "text", text: `Created note "${title}".` },
          { type: "text", text: JSON.stringify({ note: result }, null, 2) },
        ],
        structuredContent: {
          note: result,
        },
      };
    }
  );

  return server;
};

const handler = withMcpAuth(auth, async (request, session) => {
  const server = buildMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  await server.connect(transport);

  return transport.handleRequest(request, {
    authInfo: {
      token: session.accessToken,
      clientId: session.clientId,
      scopes: session.scopes ? session.scopes.split(' ') : [],
      expiresAt: session.accessTokenExpiresAt ? Math.floor(session.accessTokenExpiresAt.getTime() / 1000) : undefined,
      extra: {
        userId: session.userId,
      },
    },
  });
});

export { handler as DELETE, handler as GET, handler as POST };
