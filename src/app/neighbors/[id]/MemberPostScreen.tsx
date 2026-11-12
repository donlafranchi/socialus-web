'use client'

import { MemberPostView } from '@/components/member-posts/MemberPostView'
import { answerMemberPostAction, withdrawMemberPostAction } from '@/app/_actions/member-post-actions'
import { sendReportAction } from '@/app/_actions/report-actions'
import type { MemberPost } from '@/lib/member-posts/read'

export function MemberPostScreen({ post, loggedIn }: { post: MemberPost; loggedIn: boolean }) {
  return (
    <MemberPostView
      post={post}
      loggedIn={loggedIn}
      onAnswer={(on) => answerMemberPostAction(post.id, on)}
      onWithdraw={() => withdrawMemberPostAction(post.id)}
      onReport={({ category, body }) => sendReportAction({ subjectKind: 'member_post', subjectId: post.id, category, body })}
    />
  )
}
