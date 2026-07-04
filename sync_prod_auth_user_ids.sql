do $$
declare
  r record;
  m record;
begin
  for m in
    select * from (values
      ('3a7e972d-f9d5-417a-984c-3652d6c2f28f'::uuid, '75357903-feb7-4784-8951-8338de517390'::uuid),
      ('19a640de-eea1-4c89-8167-54c2ca1ccee4'::uuid, 'f6c1ae40-324a-46b8-8dbe-73548c4ce236'::uuid),
      ('129a8a20-1e51-4025-9d05-1516e48b188a'::uuid, '0f44d51a-52ba-4511-a0e2-0efbd0be939b'::uuid)
    ) as x(old_id, new_id)
  loop
    for r in
      select table_schema, table_name, column_name
      from information_schema.columns
      where table_schema = 'public'
        and udt_name = 'uuid'
    loop
      execute format(
        'update %I.%I set %I = $1 where %I = $2',
        r.table_schema,
        r.table_name,
        r.column_name,
        r.column_name
      )
      using m.new_id, m.old_id;
    end loop;
  end loop;
end $$;
