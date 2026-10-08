### chore — a node_modules symlink had been committed

#502 (F099 part 2) carried a `node_modules` symlink to a lane's local worktree path (a stacked-worktree convenience swept in by `git add -A`). On main it is a dangling symlink in every checkout. Removed it, and `.gitignore` now says `node_modules` rather than `node_modules/`, because the trailing slash matches only a directory and so never covered a symlink.
