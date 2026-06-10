import { supabaseClient } from './supabase.js';

let carregamentos = [];

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btnBuscar')?.addEventListener('click', carregarCarregamentos);
    document.getElementById('btnLimpar')?.addEventListener('click', limparFiltros);
    document.getElementById('termoBusca')?.addEventListener('keydown', event => {
        if (event.key === 'Enter') carregarCarregamentos();
    });
    document.getElementById('fecharModalDetalhes')?.addEventListener('click', fecharDetalhes);
    document.getElementById('modalDetalhesCarregamento')?.addEventListener('click', event => {
        if (event.target.id === 'modalDetalhesCarregamento') fecharDetalhes();
    });

    carregarCarregamentos();
});

async function carregarCarregamentos() {
    const tbody = document.getElementById('corpoTabelaCarregamentos');
    tbody.innerHTML = '<tr><td colspan="8" class="empty-cell">Carregando...</td></tr>';

    const dataInicial = document.getElementById('dataInicial')?.value;
    const dataFinal = document.getElementById('dataFinal')?.value;
    let query = supabaseClient
        .from('carregamentos')
        .select(`
            id, semana, data_hora, placa, motorista_nome, conferente_nome, supervisor_nome,
            requisicoes (
                id, motivo,
                clientes (id, codigo, nome, cidade, estado),
                requisicao_itens (
                    id, quantidade,
                    itens (id, codigo, nome, tipo)
                )
            )
        `)
        .order('data_hora', { ascending: false })
        .limit(500);

    if (dataInicial) query = query.gte('data_hora', `${dataInicial}T00:00:00-03:00`);
    if (dataFinal) query = query.lte('data_hora', `${dataFinal}T23:59:59-03:00`);

    const { data, error } = await query;
    if (error) {
        console.error('Erro ao buscar carregamentos:', error);
        tbody.innerHTML = '<tr><td colspan="8" class="empty-cell">Erro ao carregar os carregamentos.</td></tr>';
        return;
    }

    const termo = normalizarTexto(document.getElementById('termoBusca')?.value);
    carregamentos = (data || []).filter(item => !termo || montarTextoBusca(item).includes(termo));
    renderizarCarregamentos();
}

function renderizarCarregamentos() {
    const tbody = document.getElementById('corpoTabelaCarregamentos');
    const total = document.getElementById('totalResultados');
    total.textContent = `${carregamentos.length} ${carregamentos.length === 1 ? 'registro' : 'registros'}`;

    if (!carregamentos.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty-cell">Nenhum carregamento encontrado.</td></tr>';
        return;
    }

    tbody.innerHTML = carregamentos.map(item => {
        const requisicoes = item.requisicoes || [];
        const clientes = [...new Set(requisicoes.map(req => obterRelacionado(req.clientes)?.nome).filter(Boolean))];
        return `
            <tr>
                <td>${escapeHtml(formatarDataHora(item.data_hora))}</td>
                <td>${escapeHtml(item.semana || '-')}</td>
                <td><strong>${escapeHtml(item.placa || '-')}</strong></td>
                <td>${escapeHtml(item.motorista_nome || '-')}</td>
                <td>${escapeHtml(clientes.join(', ') || '-')}</td>
                <td>${requisicoes.length}</td>
                <td>${escapeHtml(item.conferente_nome || '-')}</td>
                <td>
                    <button type="button" class="btn-icon edit" data-carregamento-id="${escapeHtml(item.id)}" title="Ver detalhes">
                        <i class="fas fa-eye"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    tbody.querySelectorAll('[data-carregamento-id]').forEach(button => {
        button.addEventListener('click', () => abrirDetalhes(button.dataset.carregamentoId));
    });
}

function abrirDetalhes(id) {
    const carregamento = carregamentos.find(item => String(item.id) === String(id));
    if (!carregamento) return;

    const requisicoes = carregamento.requisicoes || [];
    document.getElementById('conteudoDetalhesCarregamento').innerHTML = `
        <div class="details-summary">
            ${campoDetalhe('Data/Hora', formatarDataHora(carregamento.data_hora))}
            ${campoDetalhe('Semana', carregamento.semana)}
            ${campoDetalhe('Placa', carregamento.placa)}
            ${campoDetalhe('Motorista', carregamento.motorista_nome)}
            ${campoDetalhe('Conferente', carregamento.conferente_nome)}
            ${campoDetalhe('Supervisor', carregamento.supervisor_nome)}
        </div>
        ${requisicoes.length ? requisicoes.map(renderizarRequisicao).join('') : '<p>Nenhuma requisição vinculada.</p>'}
    `;

    document.getElementById('modalDetalhesCarregamento').style.display = 'flex';
}

function renderizarRequisicao(requisicao, index) {
    const cliente = obterRelacionado(requisicao.clientes);
    const itens = requisicao.requisicao_itens || [];
    return `
        <section class="request-card">
            <h4>Requisição ${index + 1}: ${escapeHtml(requisicao.motivo || '-')}</h4>
            <p><strong>Cliente:</strong> ${escapeHtml(cliente ? `${cliente.codigo || ''} - ${cliente.nome || ''}` : '-')}</p>
            <div class="table-responsive">
                <table class="glass-table">
                    <thead><tr><th>Código</th><th>Item</th><th>Tipo</th><th>Quantidade</th></tr></thead>
                    <tbody>
                        ${itens.length ? itens.map(item => `
                            <tr>
                                <td>${escapeHtml(obterRelacionado(item.itens)?.codigo || '-')}</td>
                                <td>${escapeHtml(obterRelacionado(item.itens)?.nome || '-')}</td>
                                <td>${escapeHtml(obterRelacionado(item.itens)?.tipo || '-')}</td>
                                <td>${escapeHtml(item.quantidade ?? '-')}</td>
                            </tr>
                        `).join('') : '<tr><td colspan="4" class="empty-cell">Nenhum item vinculado.</td></tr>'}
                    </tbody>
                </table>
            </div>
        </section>
    `;
}

function campoDetalhe(label, value) {
    return `<div><strong>${escapeHtml(label)}</strong>${escapeHtml(value || '-')}</div>`;
}

function montarTextoBusca(item) {
    return normalizarTexto([
        item.semana,
        item.data_hora,
        item.placa,
        item.motorista_nome,
        item.conferente_nome,
        item.supervisor_nome,
        ...(item.requisicoes || []).flatMap(req => [
            req.motivo,
            obterRelacionado(req.clientes)?.codigo,
            obterRelacionado(req.clientes)?.nome,
            obterRelacionado(req.clientes)?.cidade,
            obterRelacionado(req.clientes)?.estado,
            ...(req.requisicao_itens || []).flatMap(ri => [
                obterRelacionado(ri.itens)?.codigo,
                obterRelacionado(ri.itens)?.nome,
                obterRelacionado(ri.itens)?.tipo
            ])
        ])
    ].join(' '));
}

function obterRelacionado(value) {
    return Array.isArray(value) ? value[0] : value;
}

function limparFiltros() {
    document.getElementById('termoBusca').value = '';
    document.getElementById('dataInicial').value = '';
    document.getElementById('dataFinal').value = '';
    carregarCarregamentos();
}

function fecharDetalhes() {
    document.getElementById('modalDetalhesCarregamento').style.display = 'none';
}

function formatarDataHora(value) {
    if (!value) return '-';
    const data = new Date(value);
    if (Number.isNaN(data.getTime())) return '-';
    return data.toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function normalizarTexto(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .trim();
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    }[char]));
}
