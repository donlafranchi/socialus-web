import { runSqlSuite } from './support/sql-suite'

// F135: each run of a repeated routine keeps a dated record in the store. The
// tests are SQL, in supabase/tests/knowledge_runs.sql; each criterion marker
// sits on its block there.
runSqlSuite({
  file: 'knowledge_runs.sql',
  title: 'F135: run history in the store',
  claim: 'a run is a record of its practice, written once by an operator, with PRs and ideas linked and one call to read it all',
  atLeast: 6,
})
