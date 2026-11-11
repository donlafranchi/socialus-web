import { runSqlSuite } from './support/sql-suite'

// F127: versions are plans of feature slices. The tests are SQL, in
// supabase/tests/knowledge_plans.sql; each criterion marker sits on its
// block there.
runSqlSuite({
  file: 'knowledge_plans.sql',
  title: 'F127: versions are plans of feature slices',
  claim: 'a version is a plan of slices that changes as a new version with its why, and left-out slices come back',
  atLeast: 7,
})
