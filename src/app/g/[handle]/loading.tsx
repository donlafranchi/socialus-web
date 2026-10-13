// #555 — answers a card's tap at once: this renders before the server has resolved the Page, and with the router's
// prefetch it is already on the phone when the tap lands. See PageLoading for what it shows.
import { PageLoading } from '@/components/group/PageLoading'

export default function Loading() {
  return <PageLoading />
}
