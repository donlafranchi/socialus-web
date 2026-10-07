### bug #340 — Add to calendar no longer differs between server and browser

`buildIcs` stamped `DTSTAMP` with `new Date()`, and the link is built on the server and again in the browser, so the two strings differed and Next's dev overlay reported a hydration mismatch on any Page with announcements. The stamp now comes from the event's start when no time is passed (RFC 5545 only asks for a UTC creation time; the link is made at the moment of download anyway).
