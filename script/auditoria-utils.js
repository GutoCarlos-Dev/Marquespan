import { supabaseClient } from './supabase.js';

export function registrarAuditoria(acao, modulo, descricao) {
    try {
        const usuario = JSON.parse(localStorage.getItem('usuarioLogado'));
        supabaseClient.from('auditoria_sistema').insert({
            usuario_nome: usuario?.nome || 'Desconhecido',
            usuario_id:   usuario?.id   || null,
            filial:       usuario?.filial || null,
            acao,
            modulo,
            descricao
        }).then(({ error }) => {
            if (error) console.error('[Auditoria] Erro ao registrar:', error.message);
        });
    } catch (err) {
        console.error('[Auditoria] Exceção:', err);
    }
}
