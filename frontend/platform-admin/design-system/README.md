# Design System — Platform Admin

Source of truth for this app's visual design. Owned by this app — see
`docs/mvp/folder_structure_and_decision.md` §12.

## Workflow

```bash
# 1. Edit design_system.json (or re-export from Figma / Tokens Studio)
# 2. Regenerate the typed tokens file
pnpm build:tokens
# 3. Commit both files
git add design-system/design_system.json src/config/design-tokens.ts
```

**Never edit `src/config/design-tokens.ts` by hand.** It is auto-generated.
