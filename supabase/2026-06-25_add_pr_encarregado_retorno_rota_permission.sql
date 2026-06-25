insert into public.nivel_permissoes (nivel, paginas_permitidas)
values ('pr_encarregado', array['retorno-rota.html', 'retorno-rota-mobile.html']::text[])
on conflict (nivel) do update
set paginas_permitidas = (
    select array(
        select distinct pagina
        from unnest(
            coalesce(public.nivel_permissoes.paginas_permitidas, array[]::text[])
            || array['retorno-rota.html', 'retorno-rota-mobile.html']::text[]
        ) as pagina
    )
);
