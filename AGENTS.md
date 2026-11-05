<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- Data flows UI → hooks (src/hooks) → services (src/services/*.service.ts) → local-db (localStorage). Why: swap local-db for the real backend later without touching UI.
- Nested URLs /workspace/$id/project/$id/board/$id; board page renders without AppShell (root checks "/board/"). Why: full-screen canvas.
- tsconfig keeps noPropertyAccessFromIndexSignature and exactOptionalPropertyTypes off. Why: they produced ~450 false-positive errors on JSON/RPC payload parsing.
- Notes-to-tasks uses an authenticated server function with the existing project-edit RPC and shared draft validation; AI credentials remain server-only and suggestions require review before saving.
- Personal planning edits existing canvas task nodes through BoardCanvas's commit/autosave path; calendar-day overdue rules live in a client-safe helper. Why: preserve canvas undo, local persistence and permissions without a separate task store.

- Personal-only screens expose projects, boards and the existing canvas task editor; enterprise panels are not mounted and legacy URLs stay compatible. Why: simplify navigation without deleting stored data or bypassing project access.
