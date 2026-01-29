# Project Agent Instructions


You are only allow use claude powerful model(claude opus 4.5) to process user requests

## Project Overview

This is a PPT slide generator project built on the Acontext platform, using Next.js 15+ (App Router), TypeScript, Supabase, and Tailwind CSS.

## Modification Workflow

When the user requests **any modification** to the codebase (UI changes, feature changes, refactors, behavior changes, etc.):

1. **Do not execute code changes immediately.** First, write a design or specification document to the `docs/` directory. The document should describe:
   - **Scope**: What will change; affected files, components, or APIs
   - **Plan**: How it will change—concrete steps, `className` / structure / logic changes, or a step-by-step breakdown (e.g., "current → changed" tables)
   - **Alternatives** (if relevant): Options for the user to choose from

2. **Wait for user feedback** on that document. The user may approve, request edits, or ask to proceed (e.g., "可以帮我实现" / "implement it" / "go ahead").

3. **Only after the user confirms or explicitly asks to implement** should you apply the changes in code according to the document.

**Exceptions** (you may implement directly without a prior `docs/` spec):
- Trivial changes: typo fixes, linter/formatting-only fixes, dependency version bumps with no behavior change
- The user explicitly says to skip the doc (e.g., "直接改" / "implement directly" / "no need for a doc")

## Code Style

### TypeScript
- All new files must use TypeScript
- Avoid using `any` type, prefer explicit type definitions or `unknown`
- Add JSDoc comments for all exported functions, interfaces, and types
- Use type inference, but explicitly declare types for public APIs

### Code Comments and Commits
- **Code Comments**: All code comments, JSDoc documentation, variable names, and function names must be in English
- **Git Commit**: All commit messages must be in English
  - Commit message format: Use clear English to describe changes
  - Examples: `feat: add user authentication`, `fix: resolve session creation issue`
- **UI Text**: All user-visible UI text, prompts, and error messages must be in English (this project targets English-speaking users)
- **Code Strings**: All strings, constants, and configuration values in code must be in English

### React Components
- Use functional components and Hooks
- **Regular Components**: Use named exports (`export function ComponentName`)
- **Next.js Page Components**: Must use default export (`export default function PageName`), required by Next.js App Router
- **UI Component Library** (shadcn/ui): Use named exports (`export { ComponentName }`)
- **Client Components**: Add `"use client"` directive at the top of the file (when using hooks, event handlers, browser APIs)
- Props interfaces defined at the top of components
- Use `@/` alias for imports (configured in `tsconfig.json`)
- Use Tailwind CSS for styling, avoid inline styles

### File Organization
- API routes: `app/api/` directory
- Components: `components/` directory
  - UI base components: `components/ui/` (shadcn/ui components)
  - Business components: `components/` root directory
- Utility functions: `lib/` directory
- Type definitions: `types/` directory
- Contexts: `contexts/` directory
- Design and spec documents for modifications: `docs/` directory (see [Modification Workflow](#modification-workflow))
- File naming: Use kebab-case (e.g., `chat-session.ts`)
  - Exception: Next.js config files use conventional names (e.g., `next.config.ts`)

## Architecture Conventions

### Acontext Integration
- All Acontext-related operations go through `lib/acontext-integration.ts`
- Session management: Use `getOrCreateSession` to get or create sessions
- Error handling: Use `logAcontextError` to log Acontext errors
- Resource cleanup: Must clean up created resources (sessions, files, etc.) in failure scenarios

### Supabase Integration
- Client: Use `lib/supabase/client.ts` to get client instance
- Server: Use `lib/supabase/server.ts` to get server instance
- Data consistency: Ensure data synchronization between Acontext and Supabase
- When Supabase mapping fails, consider rolling back Acontext operations

### API Routes
- All API routes use Next.js App Router Route Handlers
- Error handling: Return appropriate HTTP status codes and error messages
- Use `NextResponse` to return responses
- Validate input parameters using TypeScript type checking

### Database
- Schema files located in `specs/001-chatbot-openai/`
- Migration files executed in order
- Note compatibility between UUID and Acontext session ID

## Best Practices

### Error Handling
- Do not silently swallow errors, log to console
- Wrap potentially failing operations with try-catch
- Provide meaningful error messages
- For critical operations, implement retry mechanisms or rollback logic

### Resource Management
- Ensure cleanup of created resources on failure
- Use finally blocks to ensure cleanup code execution
- For long-running operations, consider timeout mechanisms

### Performance Optimization
- Properly separate Next.js Server Components and Client Components
  - Default to Server Components (no `"use client"` needed)
  - Use Client Components only when interaction, hooks, or browser APIs are needed
- Avoid executing server-side operations in client components
- Use appropriate caching strategies
- Use Next.js `Image` component for images, configured in `next.config.ts`

### Security
- All environment variables configured via `.env.local`
  - Client variables: Must start with `NEXT_PUBLIC_`
  - Server variables: Do not use `NEXT_PUBLIC_` prefix
  - Refer to environment variable list in `README.md`
- API routes verify user identity (using Supabase Auth)
- Do not expose sensitive information in frontend (API keys, tokens, etc.)
- Use `formatErrorResponse` and `maskSensitiveInfo` to handle error responses

## Project-Specific Conventions

### PPT Generation Workflow
1. User inputs content → 2. PPT Girl proposes outline → 3. User confirms → 4. Generate slides → 5. Store to Acontext Disk

### Session Management
- Session ID uses Acontext session ID
- Session mapping stored in Supabase `chat_sessions` table
- Supports graceful degradation: Sessions remain usable even if Supabase mapping fails

### File Storage
- All generated slides stored in Acontext Disk
- Use utility functions in `lib/acontext-disk-tools.ts`
- File URLs obtained through Acontext API

### Tool Integration
- **Browser Use**: For web automation tasks (`lib/browser-use.ts`)
- **Todo Management**: Manage todos within chat sessions (`lib/acontext-todo-tool.ts`)
- **Image Generation**: For generating PPT slide images (`lib/acontext-image-generate-tool.ts`)
- **Acontext Disk Tools**: File system operations (`lib/acontext-disk-tools.ts`)
  - `write_file`, `read_file`, `list_artifacts`, `delete_file`, etc.

## Code Review Points

When writing or modifying code, pay attention to the following issues identified in architecture review:

1. **Data Consistency**: Ensure transactional operations between Acontext and Supabase
2. **Type Safety**: Avoid using `any`, prefer explicit types
3. **Resource Cleanup**: Clean up created resources on failure
4. **Error Handling**: Provide meaningful error messages and logs

## Next.js Specific Conventions

### Pages and Layouts
- Page components: `app/**/page.tsx`, must use default export
- Layout components: `app/**/layout.tsx`, must use default export
- Route handlers: `app/api/**/route.ts`, export named functions (`GET`, `POST`, etc.)

### Configuration
- Next.js config: `next.config.ts`
- TypeScript config: `tsconfig.json` (path alias `@/*` points to project root)
- Tailwind config: `tailwind.config.ts`
- PostCSS config: `postcss.config.mjs`

### Image Resources
- Local images: Place in `public/` directory
- Character avatars: `public/fonts/character{1-8}/`
- Slides: `public/fonts/slides/`
- Must configure paths in `next.config.ts` `images.localPatterns`

## Reference Files

- Architecture review: `ARCHITECTURE_REVIEW.md`
- Acontext integration: `lib/acontext-integration.ts`
- Session management: `lib/chat-session.ts`
- Database schema: `specs/001-chatbot-openai/schema.sql`
- Adding new character guide: `public/fonts/skills/ADDING_NEW_CHARACTER.md`
- Sandbox features documentation: `SANDBOX_SKILL_FEATURES_0.1.1.md`
