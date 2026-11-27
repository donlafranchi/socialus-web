import { runSqlSuite } from './support/sql-suite'

// The department-limits switch: off, every registered key counts as the PM's
// own; on, the old refusals return. SQL in
// supabase/tests/knowledge_department_limits.sql.
runSqlSuite({
  file: 'knowledge_department_limits.sql',
  title: 'knowledge store — department limits switch',
  claim: 'with the department limits off every key sees and does ordinary work, overrule powers stay with the PM key, checks read only the store; switched on, the old refusals return',
  atLeast: 8,
})
