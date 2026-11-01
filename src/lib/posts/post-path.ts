// A post's own address, under its Page's (Don, 2026-10-31: "I can't share an anouncment?"): /g/<page id>/posts/<post id>.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export const isPostId = (s: string): boolean => UUID.test(s)

export const postPath = (pagePath: string, postId: string): string => `${pagePath.split('#')[0]}/posts/${postId}`
