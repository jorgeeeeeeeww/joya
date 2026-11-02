-- ════════════════════════════════════════════════════════════════════
-- Corrección de la combinación campo por campo (documents_lww)
--
-- Antes: si un dispositivo sin internet agregaba un campo nuevo (por ejemplo, una nota) y otro
-- dispositivo guardaba ese mismo registro después, el campo nuevo se descartaba, porque se comparaba
-- contra la hora del registro completo. Ahora un campo que el servidor no tenía siempre se acepta;
-- la regla "gana la edición más reciente" solo aplica cuando los dos tienen ese campo.
-- (Encontrado al simular dos dispositivos con scripts/nube-de-prueba.mjs.)
-- ════════════════════════════════════════════════════════════════════

create or replace function public.documents_lww()
returns trigger
language plpgsql
as $$
declare
  k text;
  merged jsonb;
  nft jsonb;
  oft jsonb;
  nts text;
  ots text;
begin
  if tg_op = 'UPDATE' then
    merged := old.data;
    nft := coalesce(new.data -> '_ft', '{}'::jsonb);
    oft := coalesce(old.data -> '_ft', '{}'::jsonb);
    for k in select jsonb_object_keys(new.data) loop
      continue when k in ('_ft', 'id', 'createdAt', 'updatedAt', 'updatedBy');
      nts := coalesce(nft ->> k, new.data ->> 'updatedAt', '');
      if old.data ? k then
        ots := coalesce(oft ->> k, old.data ->> 'updatedAt', '');
      else
        ots := ''; -- campo nuevo: el servidor no tenía versión que defender
      end if;
      if nts >= ots then
        merged := jsonb_set(merged, array[k], new.data -> k, true);
        oft := jsonb_set(oft, array[k], to_jsonb(nts), true);
      end if;
    end loop;
    merged := jsonb_set(merged, '{_ft}', oft, true);
    merged := jsonb_set(merged, '{updatedAt}', to_jsonb(greatest(coalesce(old.data ->> 'updatedAt', ''), coalesce(new.data ->> 'updatedAt', ''))), true);
    if (new.data ->> 'updatedAt') > coalesce(old.data ->> 'updatedAt', '') then
      merged := jsonb_set(merged, '{updatedBy}', coalesce(new.data -> 'updatedBy', 'null'::jsonb), true);
    end if;
    new.data := merged;
    new.deleted := coalesce((merged ->> 'deleted')::boolean, false);
  end if;
  new.updated_at := clock_timestamp();
  new.updated_by := auth.uid();
  return new;
end
$$;
