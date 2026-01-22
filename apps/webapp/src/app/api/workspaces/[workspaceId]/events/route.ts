import { headers } from "next/headers";

import { auth } from "@/auth";
import { parseSlug } from "@/lib/params";
import { resolveWorkspaceId } from "@/lib/resolvers";
import { workspaceEventHub } from "@/lib/sse-hub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { workspaceId: workspaceSlug } = await params;
  const workspaceSlugValue = parseSlug(workspaceSlug);

  if (!workspaceSlugValue) {
    return new Response("Invalid workspace slug", { status: 400 });
  }

  const workspaceIdValue = await resolveWorkspaceId(workspaceSlugValue);
  if (!workspaceIdValue) {
    return new Response("Workspace not found", { status: 404 });
  }

  const encoder = new TextEncoder();
  let cleanup: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const sendEvent = (payload: { type: string; data: unknown }) => {
        controller.enqueue(
          encoder.encode(`event: ${payload.type}\ndata: ${JSON.stringify(payload.data)}\n\n`)
        );
      };

      const unsubscribe = workspaceEventHub.subscribe(workspaceIdValue, (event) => {
        sendEvent({ type: event.type, data: event.data });
      });

      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(": ping\n\n"));
      }, 15000);

      sendEvent({ type: "ready", data: { ok: true } });

      const close = () => {
        if (closed) {
          return;
        }
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        controller.close();
      };

      cleanup = close;
      request.signal.addEventListener("abort", close, { once: true });
    },
    cancel() {
      cleanup?.();
      cleanup = null;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
