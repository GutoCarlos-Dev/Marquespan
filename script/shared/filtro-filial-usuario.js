import { supabaseClient } from '../supabase.js';

export function normalizarFilial(value) {
    return String(value || '').trim().toUpperCase();
}

export async function configurarFiltroFilialUsuario(select) {
    if (!select) return null;

    select.disabled = true;
    select.innerHTML = '<option value="">Carregando...</option>';

    try {
        const {
            data: { user },
            error: authError
        } = await supabaseClient.auth.getUser();

        if (authError || !user?.id) {
            throw authError || new Error('Usuario autenticado nao encontrado.');
        }

        const { data: perfil, error: perfilError } = await supabaseClient
            .from('usuarios')
            .select('filial')
            .eq('auth_user_id', user.id)
            .single();

        if (perfilError) throw perfilError;

        const filialUsuario = normalizarFilial(perfil?.filial);
        const { data: filiais, error: filiaisError } = await supabaseClient
            .from('filiais')
            .select('nome, sigla')
            .order('nome');

        if (filiaisError) throw filiaisError;

        select.innerHTML = filialUsuario ? '' : '<option value="">Todas</option>';
        (filiais || [])
            .filter(f => !filialUsuario || normalizarFilial(f.sigla || f.nome) === filialUsuario)
            .forEach(f => {
                const value = normalizarFilial(f.sigla || f.nome);
                if (value) select.add(new Option(f.sigla ? `${f.nome} (${f.sigla})` : f.nome, value));
            });

        if (filialUsuario) {
            if (!select.options.length) select.add(new Option(filialUsuario, filialUsuario));
            select.value = filialUsuario;
            select.disabled = true;
        } else {
            select.disabled = false;
        }

        return { filialUsuario };
    } catch (error) {
        console.error('Erro ao configurar filtro de filial:', error);
        select.innerHTML = '<option value="">Acesso indisponivel</option>';
        select.disabled = true;
        return null;
    }
}
