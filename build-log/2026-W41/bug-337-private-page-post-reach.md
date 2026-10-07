### bug #337 — a private Page's composer no longer offers "Anyone"

The save never read an audience: `group.post_create` wrote every post `listed`, and only the Page's own privacy kept a private Page's post from a stranger. It now writes the Page's own discoverability, so a private or unlisted Page's post is never listed. The composer hides "Who sees this" on a private Page (option A of the issue's open question; replaces the 2026-09-30 line). Unlisted Pages keep the switch: their posts are written unlisted too, but #337 names private only.
