import { runSqlSuite } from './support/sql-suite'

// F131: the live-state snapshot the three answers read. The tests are SQL, in
// supabase/tests/knowledge_live_state.sql; each criterion marker sits on its
// block there.
runSqlSuite({
  file: 'knowledge_live_state.sql',
  title: 'F131: the live state in the store',
  claim: "the job's snapshot of GitHub is replaced whole, written by an operator only, and read by building keys",
  atLeast: 5,
})
