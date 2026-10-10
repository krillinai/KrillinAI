import { createContext, type Context } from 'react';
import type { CreatorSessionContextValue } from './creator-session-store.js';

type SessionContext = Context<CreatorSessionContextValue | null>;
const hot = (import.meta as ImportMeta & { hot?: { data?: Record<string, unknown> } }).hot;
export const CreatorSessionContext: SessionContext = hot?.data?.creatorSessionContext as SessionContext | undefined
  ?? createContext<CreatorSessionContextValue | null>(null);
if (hot?.data !== undefined) hot.data.creatorSessionContext = CreatorSessionContext;
