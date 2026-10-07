# bug #439, the rest — four more read paths

The first pass's reviewer found four reads that answered someone belonging to an archived or deleted Page without managing it: its address (`group_url_prefixes`), its founder's name (`page_founder_public`), its name in a member's own list (`member_public_pages`), and its posts to a founder who stepped down (`page_posts`). Each now asks `page_hidden_from_caller()`. Matrix rows cover each, seen red on CI first. This PR also carries #341's regression test, since a test-only PR gets no required checks (CI ignores test-only diffs).
