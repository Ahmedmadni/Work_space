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
