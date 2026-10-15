# Git Hooks

Project git hooks live in this directory.

To enable them for this repository (run locally — do not commit machine-specific config expectations into shared automation without team agreement):

```bash
git config core.hooksPath .githooks
```

After enabling, place executable hook scripts here (e.g. `pre-commit`, `pre-push`) matching the names git expects.
