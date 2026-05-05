import { supabaseClient as supabase } from './supabase.js';

document.addEventListener('DOMContentLoaded', () => {
    // Event Listeners para os filtros
    document.getElementById('btnBuscarManutencao')?.addEventListener('click', buscarManutencoes);
    document.getElementById('searchResultadosLocal')?.addEventListener('input', filtrarResultadosLocal);

    // Carregar dados iniciais
    carregarFiltrosDropdowns();
    buscarManutencoes(); // Carrega a primeira vez sem filtros
});

let allManutencoes = []; // Armazena todos os resultados para filtro local

async function carregarFiltrosDropdowns() {
    // Carregar Filiais
    const { data: filiais, error: filialError } = await supabase.from('filiais').select('nome').order('nome');
    if (!filialError) {
        const selectFilial = document.getElementById('filial');
        selectFilial.innerHTML = '<option value="">Todas</option>';
        filiais.forEach(f => {
            const option = document.createElement('option');
            option.value = f.nome;
            option.textContent = f.nome;
            selectFilial.appendChild(option);
        });
    } else {
        console.error('Erro ao carregar filiais:', filialError);
    }

    // Carregar Veículos (Placas)
    const { data: veiculos, error: veiculoError } = await supabase.from('veiculos').select('placa').order('placa');
    if (!veiculoError) {
        const datalistPlacas = document.getElementById('listaPlacas');
        datalistPlacas.innerHTML = '';
        veiculos.forEach(v => {
            const option = document.createElement('option');
            option.value = v.placa;
            datalistPlacas.appendChild(option);
        });
    } else {
        console.error('Erro ao carregar veículos:', veiculoError);
    }

    // Carregar Títulos (Itens de Manutenção)
    const { data: itens, error: itemError } = await supabase.from('itens_manutencao').select('nome').order('nome');
    if (!itemError) {
        const datalistTitulos = document.getElementById('listaTitulos');
        datalistTitulos.innerHTML = '';
        itens.forEach(i => {
            const option = document.createElement('option');
            option.value = i.nome;
            datalistTitulos.appendChild(option);
        });
    } else {
        console.error('Erro ao carregar itens de manutenção:', itemError);
    }

    // Carregar Fornecedores
    const { data: fornecedores, error: fornecedorError } = await supabase.from('fornecedores').select('nome').order('nome');
    if (!fornecedorError) {
        const datalistFornecedores = document.getElementById('listaFornecedores');
        datalistFornecedores.innerHTML = '';
        fornecedores.forEach(f => {
            const option = document.createElement('option');
            option.value = f.nome;
            datalistFornecedores.appendChild(option);
        });
    } else {
        console.error('Erro ao carregar fornecedores:', fornecedorError);
    }
}


async function buscarManutencoes() {
    const dataInicial = document.getElementById('dataInicial').value;
    const dataFinal = document.getElementById('dataFinal').value;
    const filial = document.getElementById('filial').value;
    const tipoManutencao = document.getElementById('tipoManutencao').value;
    const veiculo = document.getElementById('veiculo').value.trim();
    const titulo = document.getElementById('titulo').value.trim();
    const fornecedor = document.getElementById('fornecedor').value.trim();
    const nfse = document.getElementById('nfse').value.trim();
    const nfe = document.getElementById('nfe').value.trim();
    const os = document.getElementById('os').value.trim();
    const status = document.getElementById('status').value;

    let query = supabase.from('manutencoes').select('*'); // Ajuste o select conforme suas colunas

    if (dataInicial) query = query.gte('data', dataInicial);
    if (dataFinal) query = query.lte('data', dataFinal);
    if (filial) query = query.eq('filial', filial);
    if (tipoManutencao) query = query.eq('tipo_manutencao', tipoManutencao);
    if (veiculo) query = query.ilike('veiculo', `%${veiculo}%`);
    if (titulo) query = query.ilike('titulo', `%${titulo}%`);
    if (fornecedor) query = query.ilike('fornecedor', `%${fornecedor}%`);
    if (nfse) query = query.ilike('nfse', `%${nfse}%`);
    if (nfe) query = query.ilike('nfe', `%${nfe}%`);
    if (os) query = query.ilike('os', `%${os}%`);
    if (status) query = query.eq('status', status);

    query = query.order('data', { ascending: false });

    try {
        const { data, error } = await query;
        if (error) throw error;

        allManutencoes = data || []; // Armazena para filtro local
        renderizarResultados(allManutencoes);
    } catch (error) {
        console.error('Erro ao buscar manutenções:', error);
        alert('Erro ao buscar manutenções. Verifique o console para mais detalhes.');
    }
}

function filtrarResultadosLocal() {
    const termo = document.getElementById('searchResultadosLocal').value.toLowerCase();
    const resultadosFiltrados = allManutencoes.filter(item =>
        item.placa?.toLowerCase().includes(termo) ||
        item.descricao?.toLowerCase().includes(termo) ||
        item.titulo?.toLowerCase().includes(termo) ||
        item.fornecedor?.toLowerCase().includes(termo) ||
        item.usuario?.toLowerCase().includes(termo)
    );
    renderizarResultados(resultadosFiltrados);
}


function renderizarResultados(data) {
    const tbody = document.getElementById('tabelaResultados');
    const totalRegistrosSpan = document.getElementById('totalRegistros');
    const valorTotalSpan = document.getElementById('valorTotal');
    tbody.innerHTML = ''; // Limpa resultados anteriores

    let totalValor = 0;

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-center">Nenhum resultado encontrado.</td></tr>';
        totalRegistrosSpan.textContent = '0';
        valorTotalSpan.textContent = '0.00';
        return;
    }

    data.forEach(item => {
        const tr = document.createElement('tr');

        // Formatação da data para o fuso horário de São Paulo (Brasil)
        const dataManutencao = item.data ? new Date(item.data) : null;
        const formattedDate = dataManutencao
            ? dataManutencao.toLocaleString('pt-BR', {
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                  timeZone: 'America/Sao_Paulo' // Define explicitamente o fuso horário
              })
            : '';

        // Formatação do valor para moeda brasileira
        const formattedValue = item.valor
            ? parseFloat(item.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
            : 'R$ 0,00';
        
        totalValor += parseFloat(item.valor || 0);

        tr.innerHTML = `
            <td>
                <button class="btn-action view" onclick="visualizarManutencao(${item.id})" title="Visualizar Detalhes"><i class="fas fa-eye"></i></button>
                <button class="btn-action edit" onclick="editarManutencao(${item.id})" title="Editar Manutenção"><i class="fas fa-edit"></i></button>
            </td>
            <td>${item.usuario || ''}</td>
            <td>${item.titulo || ''}</td>
            <td>${item.veiculo || ''}</td>
            <td>${item.fornecedor || ''}</td>
            <td>${item.descricao || ''}</td>
            <td>${item.os || ''}</td>
            <td>${formattedDate}</td>
            <td>${formattedValue}</td>
        `;
        tbody.appendChild(tr);
    });

    totalRegistrosSpan.textContent = data.length;
    valorTotalSpan.textContent = totalValor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Funções placeholder para ações
window.visualizarManutencao = function(id) {
    alert(`Visualizar manutenção com ID: ${id}`);
    // Implementar lógica para abrir modal de visualização
}

window.editarManutencao = function(id) {
    alert(`Editar manutenção com ID: ${id}`);
    // Implementar lógica para abrir modal de edição ou redirecionar
}

// Implementação de ordenação de colunas (opcional, mas bom para UX)
document.querySelectorAll('.sortable').forEach(header => {
    header.addEventListener('click', () => {
        const key = header.dataset.sort;
        const currentOrder = header.dataset.order || 'asc';
        const newOrder = currentOrder === 'asc' ? 'desc' : 'asc';

        // Remove ícones de ordenação de outros cabeçalhos
        document.querySelectorAll('.sortable i').forEach(icon => icon.remove());

        // Adiciona novo ícone
        const icon = document.createElement('i');
        icon.classList.add('fas', newOrder === 'asc' ? 'fa-sort-up' : 'fa-sort-down');
        header.appendChild(icon);

        // Atualiza a ordem no dataset
        header.dataset.order = newOrder;

        // Ordena os dados
        allManutencoes.sort((a, b) => {
            let valA = a[key];
            let valB = b[key];

            // Trata valores nulos e strings/números
            if (typeof valA === 'string') valA = valA.toLowerCase();
            if (typeof valB === 'string') valB = valB.toLowerCase();

            if (valA === null || valA === undefined) return newOrder === 'asc' ? 1 : -1;
            if (valB === null || valB === undefined) return newOrder === 'asc' ? -1 : 1;

            if (valA < valB) return newOrder === 'asc' ? -1 : 1;
            if (valA > valB) return newOrder === 'asc' ? 1 : -1;
            return 0;
        });
        renderizarResultados(allManutencoes);
    });
});