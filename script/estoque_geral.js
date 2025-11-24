import { supabase } from './supabase.js';

document.addEventListener('DOMContentLoaded', () => {
    carregarEstoqueGeral();

    document.getElementById('btn-buscar-estoque').addEventListener('click', carregarEstoqueGeral);
    document.getElementById('btn-limpar-filtros').addEventListener('click', limparFiltros);
});

async function carregarEstoqueGeral() {
    const gridBody = document.getElementById('grid-estoque-body');
    gridBody.innerHTML = '<div class="grid-row-loading">Carregando estoque...</div>';

    const filtroCodigo = document.getElementById('filtro-codigo').value.trim();
    const filtroNome = document.getElementById('filtro-nome').value.trim();

    try {
        let query = supabase
            .from('estoque_geral') // Usando a nova VIEW
            .select('*')
            .gt('quantidade_em_estoque', 0) // Apenas itens com estoque
            .order('nome', { ascending: true });

        if (filtroCodigo) {
            query = query.ilike('codigo_principal', `%${filtroCodigo}%`);
        }
        if (filtroNome) {
            query = query.ilike('nome', `%${filtroNome}%`);
        }

        const { data: estoque, error } = await query;

        if (error) {
            throw error;
        }

        renderizarEstoque(estoque || []);

    } catch (error) {
        console.error('Erro ao carregar estoque geral:', error);
        gridBody.innerHTML = '<div class="grid-row-error">Erro ao carregar dados.</div>';
    }
}

function renderizarEstoque(lista) {
    const gridBody = document.getElementById('grid-estoque-body');
    gridBody.innerHTML = '';

    if (lista.length === 0) {
        gridBody.innerHTML = '<div class="grid-row-empty">Nenhum item em estoque encontrado.</div>';
        document.getElementById('total-itens').textContent = '0';
        return;
    }

    lista.forEach(item => {
        const row = document.createElement('div');
        row.classList.add('grid-row');
        row.innerHTML = `
            <div>${item.codigo_principal}</div>
            <div>${item.nome}</div>
            <div>${item.unidade_medida || 'UN'}</div>
            <div class="quantidade">${item.quantidade_em_estoque}</div>
        `;
        gridBody.appendChild(row);
    });

    document.getElementById('total-itens').textContent = lista.length;
}

function limparFiltros() {
    document.getElementById('filtro-codigo').value = '';
    document.getElementById('filtro-nome').value = '';
    carregarEstoqueGeral();
}