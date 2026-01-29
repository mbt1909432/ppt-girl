# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is **Acontext PPT Girl Slide Generator** - an intelligent PPT slide generation system powered by Acontext. Users chat with "PPT Girl" to create professional cyberpunk-style slide images through natural conversation. Built with Next.js 15+ (App Router), TypeScript, Supabase for auth/persistence, and Acontext for AI/memory.

**Key workflow**: Input content → PPT Girl proposes outline → User confirms → Generate 16:9 cyberpunk slides → Store to Acontext Disk → Share via URLs.

## Development Commands

```bash
# Start development server
npm run dev

# Build for production (uses webpack)
npm run build

# Start production server
npm start

# Run linter
npm run lint

# Run a single file with tsx (useful for quick tests)
npx tsx path/to/file.ts
```

## High-Level Architecture

### Core Data Flow

1. **Session ID = Acontext Session ID**: The frontend's `sessionId` is directly the Acontext session ID. Supabase only stores a minimal mapping (`chat_sessions` table) for querying/sorting by user.

2. **Acontext as Primary Storage**: Messages are stored in Acontext sessions. Supabase `chat_messages` table is legacy - messages are loaded via `loadMessagesFromAcontext()`.

3. **Character Locking**: Each session locks to a specific character (PPT Girl variants). The `characterId` is stored in `chat_sessions.character_id` and affects tool behavior (e.g., image generation uses character reference images).

4. **Context Management**: Automatic token-based context editing kicks in at 80K tokens. Users can manually compress context at 70K via `compressSessionContext()`.

### Key Integration Points

**Acontext (`lib/acontext-integration.ts`)**
- `createAcontextSessionDirectly()` - Creates Acontext session + dedicated Disk + Supabase mapping
- `loadMessagesFromAcontext()` - Loads messages with optional edit strategies
- `storeMessageInAcontext()` - Stores messages with Vision API support + tool_calls persistence
- `getAcontextTokenCounts()` - Fetches current token usage for context window management
- `uploadFileToAcontext()` / `getAcontextArtifactContent()` - File/artifact management
- `determineEditStrategies()` - Automatic context editing (token_limit, remove_tool_result, remove_tool_call_params)

**Supabase (`lib/supabase/`)**
- Authentication only (no message storage)
- `chat_sessions` table maps user → Acontext session ID + disk ID + character lock
- RLS policies ensure users access only their own sessions

**Chat Route (`app/api/chatbot/route.ts`)**
- Orchestrates: OpenAI LLM + Acontext tools + optional Browser Use
- Tools exposed: `browser_use_task`, `write_file`, `read_file`, `list_artifacts`, `todo`, `image_gen`
- System prompt defines "Aria Context" persona (futuristic tech engineer)
- Character-specific context injection via `characterId`

**Tools (`lib/acontext-*-tool.ts`)**
- `acontext-image-generate-tool.ts` - Generates slide images with character style injection
- `acontext-disk-tools.ts` - File operations (write_file, read_file, list_artifacts, delete_file)
- `acontext-todo-tool.ts` - Todo management within sessions
- `browser-use.ts` - Web automation via Browser Use Cloud

## Environment Variables

Required for development:

```env
# Supabase (auth + session mapping)
NEXT_PUBLIC_SUPABASE_URL=your-supabase-project-url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-supabase-anon-key

# Acontext (primary storage + AI)
ACONTEXT_API_KEY=your-acontext-api-key
ACONTEXT_BASE_URL=https://api.acontext.com/api/v1

# OpenAI LLM (for chat completions)
OPENAI_LLM_ENDPOINT=https://api.openai.com/v1
OPENAI_LLM_API_KEY=your-openai-api-key
OPENAI_LLM_MODEL=gpt-4o-mini
OPENAI_LLM_TEMPERATURE=0.7
OPENAI_LLM_MAX_TOKENS=2000

# Image Generation (for slide generation)
IMAGE_GEN_API_KEY=your-image-gen-api-key
IMAGE_GEN_BASE_URL=https://api.openai-next.com
IMAGE_GEN_DEFAULT_MODEL=gemini-3-pro-image-preview

# Browser Use Cloud (optional, for web automation)
BROWSER_USE_API_KEY=your-browser-use-cloud-api-key
```

## Database Schema & Migrations

Run in Supabase SQL Editor in order:

1. `specs/001-chatbot-openai/schema.sql` - Base tables
2. `specs/001-chatbot-openai/migration-acontext.sql` - Add Acontext session ID
3. `specs/001-chatbot-openai/migration-acontext-disk.sql` - Add Disk ID
4. `specs/001-chatbot-openai/migration-acontext-session-id-as-primary-key.sql` - Use Acontext session ID as PK
5. `specs/001-chatbot-openai/migration-acontext-space-user.sql` - (Space features removed)
6. `specs/001-chatbot-openai/migration-session-character-id.sql` - Add character locking

**Important**: After changing schema, ensure `migration-*.sql` files are updated for future deployments.

## Code Conventions (from AGENTS.md)

### TypeScript
- Use explicit types, avoid `any`
- Add JSDoc for exported functions/interfaces
- Use `@/` alias for imports (configured in `tsconfig.json`)

### React Components
- Functional components + Hooks only
- Regular components: Named exports (`export function ComponentName`)
- Next.js pages: Default exports (`export default function PageName`)
- Client components: Add `"use client"` directive at top
- Use Tailwind CSS, avoid inline styles

### File Organization
- API routes: `app/api/*/route.ts` (named exports: GET, POST, etc.)
- Components: `components/` (business), `components/ui/` (shadcn/ui)
- Utilities: `lib/`
- Types: `types/`
- Kebab-case filenames (e.g., `chat-session.ts`)
- Spec docs: `docs/` (see Modification Workflow below)

### Modification Workflow
For **any** code change (UI, features, refactors):
1. Write spec to `docs/` describing scope, plan, alternatives
2. Wait for user approval
3. Implement after confirmation

**Exceptions**: Typos, linter fixes, trivial changes, or user says "直接改"/"implement directly".

### Language Rules
- Code comments/JSDoc: English
- Git commits: English
- UI text: English
- Code strings: English

## Important Implementation Details

### Token Management
- Sessions automatically compress at 80K tokens
- Edit strategies: `token_limit` (drop to 70K), `remove_tool_result` (keep 3 recent), `remove_tool_call_params` (keep 5 recent)
- Manual compression available via `compressSessionContext(sessionId)`

### Tool Calls Persistence
- Tool calls stored in Acontext using OpenAI-compatible schema
- `tool_calls` array includes `id`, `type: "function"`, `function.name`, `function.arguments` (JSON string)
- Tool results stored as separate `role: "tool"` messages with `tool_call_id`
- On reload, tool results are re-attached to parent tool calls

### Image Generation
- `image_gen` tool generates slides in 16:9 aspect ratio
- Character-specific prompts use reference images from `public/fonts/character{N}/`
- Generated images stored to Acontext Disk at `generated/{YYYY-MM-DD}/`
- Returns presigned URLs for frontend rendering

### Error Handling
- `formatErrorResponse()` + `maskSensitiveInfo()` for consistent API errors
- Rollback pattern: Clean up Acontext resources (sessions, disks) if Supabase mapping fails
- `logAcontextError()` provides deep error extraction (cause chain, network diagnosis)

### Context Editing (Plan A)
- Applied automatically in `loadMessages()` when threshold exceeded
- Edit strategies are **on-the-fly** - don't modify stored messages
- Strategies determined by `determineEditStrategies()` based on token counts + tool usage

### Character System
- Characters defined in `contexts/character-context.tsx`
- Each character has avatar paths, chatbot avatar, and system prompt overrides
- Sessions lock to `characterId` on creation (required field)
- Character affects: UI avatar, tool behavior (e.g., image_gen reference images)

## Testing & Debugging

- Token counts available via `getAcontextTokenCounts(sessionId)` - returned in `ChatResponse.tokenCounts`
- View artifacts: Use `listAcontextArtifacts(diskId)` to browse Disk contents
- Debug tool calls: Logs tagged `[ToolCallsDebug]` show tool_calls persistence flow
- Network errors: `logAcontextError()` includes connection test via `client.ping()`

## Common Tasks

**Add a new tool**:
1. Create tool schema function in `lib/your-tool.ts` (follow `lib/acontext-image-generate-tool.ts` pattern)
2. Import and add to tools array in `app/api/chatbot/route.ts`
3. Include in `enabledToolNames` check for user opt-in

**Add a new character**:
1. Add character assets to `public/fonts/characterN/`
2. Update `contexts/character-context.tsx` with character metadata
3. Update `components/character-switcher.tsx` if needed
4. Reference `public/fonts/skills/ADDING_NEW_CHARACTER.md`

**Run database migrations**:
1. Open Supabase SQL Editor
2. Execute SQL from `specs/001-chatbot-openai/migration-*.sql` files in order
3. Verify schema changes

**Debug Acontext connectivity**:
- Check `[Acontext]` log prefixes for errors
- Look for `connectionTest` field in error logs (uses `client.ping()`)
- Verify `ACONTEXT_API_KEY` and `ACONTEXT_BASE_URL` in `.env.local`
