import { runSqlSuite } from './support/sql-suite'

// F129: what SocialUs can and can't do. The tests are SQL, in
// supabase/tests/knowledge_capabilities.sql; each criterion marker sits on
// its block there.
runSqlSuite({
  file: 'knowledge_capabilities.sql',
  title: "F129: what SocialUs can and can't do, in the store",
  claim: 'each line of what SocialUs can do is a capability for its kinds of person, linked to its feature, with why it cannot yet',
  atLeast: 4,
})
