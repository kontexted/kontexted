import { oAuthProtectedResourceMetadata } from "better-auth/plugins";

import { auth } from "@/auth";

export const runtime = "nodejs";

export const GET = oAuthProtectedResourceMetadata(auth);
