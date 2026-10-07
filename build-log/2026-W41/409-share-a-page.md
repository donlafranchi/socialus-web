# change #409 — Share on every published Page

- A Share icon beside the Page name, for every visitor signed in or out, on published Pages only: the share sheet on phones (Web Share API), otherwise copy the link with a "Link copied" toast.
- A shared Page link previews with Open Graph and Twitter title, description, canonical URL and image: the Page's visible picture, else `/og-default` (the site name on the navy frame). Drafts get no preview and are not indexed.
- Tests: `SharePageButton.test.tsx`, `share-metadata.test.ts`, `ShopPublicPage.test.tsx` § #409.
