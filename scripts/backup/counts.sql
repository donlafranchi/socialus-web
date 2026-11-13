-- Exact row count of every table the backup is promised to bring back:
-- public (the app), auth (members' accounts), storage (which photo is whose).
-- One "schema.table<TAB>count" line each, sorted, so two runs diff cleanly.
-- Used at dump time (inside the dump's own snapshot) and after a restore.
select format('%I.%I', table_schema, table_name) || chr(9) ||
       (xpath('/row/c/text()',
              query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name),
                           false, true, '')))[1]::text
from information_schema.tables
where table_schema in ('public', 'auth', 'storage')
  and table_type = 'BASE TABLE'
order by 1;
