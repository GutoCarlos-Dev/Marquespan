import { supabaseClient } from './supabase.js';

// opcoes.tabela: nome da tabela de origem (necessário para poder restaurar depois).
// opcoes.snapshot: cópia completa da linha excluída (objeto ou array de objetos, para
// exclusões em lote) — sem isso o botão "Restaurar" não aparece na tela de auditoria.
export function registrarAuditoria(acao, modulo, descricao, opcoes = {}) {
    try {
        const usuario = JSON.parse(localStorage.getItem('usuarioLogado'));
        const { tabela = null, snapshot = null } = opcoes;
        return supabaseClient.from('auditoria_sistema').insert({
            usuario_nome: usuario?.nome         || 'Desconhecido',
            usuario_id:   usuario?.auth_user_id  || null,
            filial:       usuario?.filial        || null,
            acao,
            modulo,
            descricao,
            tabela_origem: tabela,
            snapshot
        }).then(({ error }) => {
            if (error) console.error('[Auditoria] Erro ao registrar:', error.message, '| acao:', acao, '| modulo:', modulo);
            return { error };
        });
    } catch (err) {
        console.error('[Auditoria] Exceção:', err);
        return Promise.resolve({ error: err });
    }
}
