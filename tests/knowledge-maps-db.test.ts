import { runSqlSuite } from './support/sql-suite'

// F132: story maps in the store. The tests are SQL, in
// supabase/tests/knowledge_maps.sql; each criterion marker sits on its block
// there.
runSqlSuite({
  file: 'knowledge_maps.sql',
  title: 'F132: story maps in the store',
  claim: 'a journey, its activities, tasks and details are records that know their place, slices cross them and new ideas find where they fit',
  atLeast: 8,
  // The preamble's role grant waits while the import test holds its transaction.
  timeout: 30_000,
})
