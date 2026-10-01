-- F078 criterion 9 / F080 (2026-10-01): every report carries the reason the
-- reporter chose. "children" widened to sensitive content. Reports filed
-- before this have none, so the column allows null; the handler requires one.

alter table public.reports
  add column category text
    check (category in ('harassment', 'nudity', 'spam', 'violence', 'sensitive_content', 'threat_of_harm', 'other'));
