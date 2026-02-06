import { supabaseClient } from './supabase.js';

let produtosCache = []; // Cache para datalists

document.addEventListener('DOMContentLoaded', () => {
    // Inicialização
    document.getElementById('grid-estoque-body').innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 20px; color: #666;">Utilize os filtros e clique em "Buscar" para visualizar o estoque.</td></tr>';
    carregarProdutosParaDatalist();

    // Navegação por Abas
    const tabButtons = document.querySelectorAll('.painel-btn');
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove active de todos
            tabButtons.forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
            
            // Ativa o clicado
            btn.classList.add('active');
            const tabId = btn.dataset.tab;
            document.getElementById(tabId).classList.remove('hidden');

            // Ações específicas ao abrir abas
            if (tabId === 'tab-relatorios') {
                carregarRelatorioMovimentacoes();
            }
        });
    });

    // Listeners - Estoque Atual
    document.getElementById('btn-buscar-estoque').addEventListener('click', carregarEstoqueGeral);
    document.getElementById('btn-limpar-filtros').addEventListener('click', limparFiltros);

    // Listeners - Retirada
    document.getElementById('retirada-produto').addEventListener('change', (e) => preencherDadosProduto(e.target.value, 'retirada'));
    document.getElementById('form-retirada').addEventListener('submit', handleRetirada);

    // Listeners - Batimento
    document.getElementById('batimento-produto').addEventListener('change', (e) => preencherDadosProduto(e.target.value, 'batimento'));
    document.getElementById('form-batimento').addEventListener('submit', handleBatimento);

    // Listeners - Relatórios
    document.getElementById('btn-buscar-relatorio').addEventListener('click', carregarRelatorioMovimentacoes);
});

// --- FUNÇÕES AUXILIARES ---

function getCurrentUser() {
    const usuario = JSON.parse(localStorage.getItem('usuarioLogado'));
    return usuario ? usuario.nome : 'Sistema';
}

async function carregarProdutosParaDatalist() {
    try {
        const { data, error } = await supabaseClient
            .from('produtos')
            .select('id, codigo_principal, nome, quantidade_em_estoque, unidade_medida')
            .order('nome');

        if (error) throw error;

        produtosCache = data || [];
        
        const options = produtosCache.map(p => `<option value="${p.codigo_principal} - ${p.nome}">`).join('');
        document.getElementById('lista-produtos-retirada').innerHTML = options;
        document.getElementById('lista-produtos-batimento').innerHTML = options;

    } catch (error) {
        console.error('Erro ao carregar produtos:', error);
    }
}

function preencherDadosProduto(valorInput, prefixo) {
    // Formato esperado: "CODIGO - NOME"
    const codigo = valorInput.split(' - ')[0];
    const produto = produtosCache.find(p => p.codigo_principal === codigo || `${p.codigo_principal} - ${p.nome}` === valorInput);

    if (produto) {
        document.getElementById(`${prefixo}-produto-id`).value = produto.id;
        const qtd = parseFloat(produto.quantidade_em_estoque) || 0;
        document.getElementById(`${prefixo}-estoque-atual`).value = `${qtd} ${produto.unidade_medida || 'UN'}`;
    } else {
        document.getElementById(`${prefixo}-produto-id`).value = '';
        document.getElementById(`${prefixo}-estoque-atual`).value = '';
    }
}

// --- ABA 1: ESTOQUE ATUAL ---

async function carregarEstoqueGeral() {
    const gridBody = document.getElementById('grid-estoque-body');
    gridBody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Carregando estoque...</td></tr>';

    const filtroCodigo = document.getElementById('filtro-codigo').value.trim();
    const filtroNome = document.getElementById('filtro-nome').value.trim();

    try {
        let query = supabaseClient
            .from('produtos') // Usando a tabela produtos diretamente
            .select('*')
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
        gridBody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:red;">Erro ao carregar dados.</td></tr>';
    }
}

function renderizarEstoque(lista) {
    const gridBody = document.getElementById('grid-estoque-body');
    gridBody.innerHTML = '';

    if (lista.length === 0) {
        gridBody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Nenhum item encontrado.</td></tr>';
        document.getElementById('total-itens').textContent = '0';
        return;
    }

    lista.forEach(item => {
        const row = document.createElement('tr');
        const qtd = parseFloat(item.quantidade_em_estoque) || 0;
        const qtdClass = qtd <= 0 ? 'estoque-baixo' : 'quantidade-destaque';
        
        row.innerHTML = `
            <td>${item.codigo_principal || '-'}</td>
            <td>${item.nome}</td>
            <td>${item.unidade_medida || 'UN'}</td>
            <td style="text-align: center;" class="${qtdClass}">${qtd}</td>
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

// --- ABA 2: RETIRADA DO ESTOQUE ---

async function handleRetirada(e) {
    e.preventDefault();
    
    const produtoId = document.getElementById('retirada-produto-id').value;
    const qtdRetirada = parseFloat(document.getElementById('retirada-quantidade').value);
    const responsavel = document.getElementById('retirada-responsavel').value.trim();
    const observacao = document.getElementById('retirada-observacao').value.trim();
    const produtoNome = document.getElementById('retirada-produto').value;

    if (!produtoId) return alert('Selecione um produto válido da lista.');
    if (qtdRetirada <= 0) return alert('A quantidade deve ser maior que zero.');

    // 1. Verificar estoque atual
    const produto = produtosCache.find(p => p.id == produtoId);
    if (!produto) return alert('Produto não encontrado no cache.');
    
    if (produto.quantidade_em_estoque < qtdRetirada) {
        return alert(`Estoque insuficiente! Disponível: ${produto.quantidade_em_estoque}. Tentativa: ${qtdRetirada}.`);
    }

    const novaQtd = parseFloat(produto.quantidade_em_estoque) - qtdRetirada;

    try {
        // 2. Atualizar Produto
        const { error: updateError } = await supabaseClient
            .from('produtos')
            .update({ quantidade_em_estoque: novaQtd })
            .eq('id', produtoId);

        if (updateError) throw updateError;

        // 3. Registrar Movimentação
        const { error: movError } = await supabaseClient
            .from('movimentacoes_estoque')
            .insert([{
                produto_id: produtoId,
                tipo_movimentacao: 'SAIDA',
                quantidade: -qtdRetirada, // Negativo para saída
                quantidade_anterior: produto.quantidade_em_estoque,
                quantidade_nova: novaQtd,
                usuario: getCurrentUser(),
                destinatario: responsavel,
                observacao: observacao
            }]);

        if (movError) throw movError;

        // 4. Gerar PDF
        gerarReciboPDF(produtoNome, qtdRetirada, responsavel, observacao);

        alert('Retirada registrada com sucesso!');
        e.target.reset();
        document.getElementById('retirada-estoque-atual').value = '';
        
        // Atualizar dados
        await carregarProdutosParaDatalist();
        carregarEstoqueGeral();

    } catch (error) {
        console.error('Erro na retirada:', error);
        alert('Erro ao registrar retirada: ' + error.message);
    }
}

function gerarReciboPDF(produto, qtd, responsavel, obs) {
    if (!window.jspdf) return alert('Biblioteca PDF não carregada.');
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // Cabeçalho
    doc.setFontSize(18);
    doc.text('RECIBO DE RETIRADA DE MATERIAL', 105, 20, { align: 'center' });
    
    doc.setFontSize(12);
    doc.text(`Data: ${new Date().toLocaleString('pt-BR')}`, 20, 40);
    doc.text(`Atendente: ${getCurrentUser()}`, 20, 50);
    
    // Detalhes
    doc.setLineWidth(0.5);
    doc.line(20, 60, 190, 60);
    
    doc.setFontSize(14);
    doc.text('Detalhes do Material:', 20, 70);
    doc.setFontSize(12);
    doc.text(`Produto: ${produto}`, 20, 85);
    doc.text(`Quantidade Retirada: ${qtd}`, 20, 95);
    if(obs) doc.text(`Observação: ${obs}`, 20, 105);

    doc.line(20, 115, 190, 115);

    // Assinaturas
    doc.text('Declaro que recebi o material acima descrito em perfeitas condições.', 20, 130);

    doc.line(20, 170, 90, 170);
    doc.text('Atendente (Assinatura)', 20, 175);

    doc.line(110, 170, 180, 170);
    doc.text(responsavel, 110, 175);
    doc.text('(Retirado Por)', 110, 182);

    doc.save(`Recibo_Retirada_${new Date().getTime()}.pdf`);
}

// --- ABA 3: BATIMENTO (CONTAGEM) ---

async function handleBatimento(e) {
    e.preventDefault();

    const produtoId = document.getElementById('batimento-produto-id').value;
    const novaQtd = parseFloat(document.getElementById('batimento-nova-quantidade').value);
    
    if (!produtoId) return alert('Selecione um produto válido.');
    if (isNaN(novaQtd) || novaQtd < 0) return alert('Informe uma quantidade válida.');

    const produto = produtosCache.find(p => p.id == produtoId);
    if (!produto) return alert('Produto não encontrado.');

    const qtdAnterior = parseFloat(produto.quantidade_em_estoque);
    const diferenca = novaQtd - qtdAnterior;

    if (diferenca === 0) return alert('A quantidade informada é igual à atual. Nenhuma alteração necessária.');

    if (!confirm(`Confirmar ajuste de estoque?\n\nAnterior: ${qtdAnterior}\nNova: ${novaQtd}\nDiferença: ${diferenca > 0 ? '+' : ''}${diferenca}`)) {
        return;
    }

    try {
        // 1. Atualizar Produto
        const { error: updateError } = await supabaseClient
            .from('produtos')
            .update({ quantidade_em_estoque: novaQtd })
            .eq('id', produtoId);

        if (updateError) throw updateError;

        // 2. Registrar Movimentação (Batimento)
        const { error: movError } = await supabaseClient
            .from('movimentacoes_estoque')
            .insert([{
                produto_id: produtoId,
                tipo_movimentacao: 'BATIMENTO',
                quantidade: diferenca, // Registra a diferença para manter histórico lógico
                quantidade_anterior: qtdAnterior,
                quantidade_nova: novaQtd,
                usuario: getCurrentUser(),
                observacao: 'Ajuste manual de estoque (Contagem)'
            }]);

        if (movError) throw movError;

        alert('Estoque atualizado com sucesso!');
        e.target.reset();
        document.getElementById('batimento-estoque-atual').value = '';
        
        await carregarProdutosParaDatalist();
        carregarEstoqueGeral();

    } catch (error) {
        console.error('Erro no batimento:', error);
        alert('Erro ao atualizar estoque: ' + error.message);
    }
}

// --- ABA 4: RELATÓRIOS ---

async function carregarRelatorioMovimentacoes() {
    const tbody = document.getElementById('grid-relatorio-body');
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Carregando...</td></tr>';

    const dataIni = document.getElementById('relatorio-data-ini').value;
    const dataFim = document.getElementById('relatorio-data-fim').value;
    const tipo = document.getElementById('relatorio-tipo').value;

    try {
        let query = supabaseClient
            .from('movimentacoes_estoque')
            .select('*, produtos(nome, codigo_principal)')
            .order('data_movimentacao', { ascending: false })
            .limit(100);

        if (dataIni) query = query.gte('data_movimentacao', `${dataIni}T00:00:00`);
        if (dataFim) query = query.lte('data_movimentacao', `${dataFim}T23:59:59`);
        if (tipo) query = query.eq('tipo_movimentacao', tipo);

        const { data, error } = await query;

        if (error) throw error;

        tbody.innerHTML = '';
        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Nenhuma movimentação encontrada.</td></tr>';
            return;
        }

        data.forEach(mov => {
            const tr = document.createElement('tr');
            const dataFormatada = new Date(mov.data_movimentacao).toLocaleString('pt-BR');
            const produtoNome = mov.produtos ? `${mov.produtos.codigo_principal} - ${mov.produtos.nome}` : 'Produto Excluído';
            
            let corTipo = 'black';
            if (mov.tipo_movimentacao === 'ENTRADA') corTipo = 'green';
            if (mov.tipo_movimentacao === 'SAIDA') corTipo = 'red';
            if (mov.tipo_movimentacao === 'BATIMENTO') corTipo = 'orange';

            tr.innerHTML = `
                <td>${dataFormatada}</td>
                <td>${produtoNome}</td>
                <td style="color: ${corTipo}; font-weight: bold;">${mov.tipo_movimentacao}</td>
                <td>${mov.quantidade}</td>
                <td>${mov.quantidade_anterior || '-'}</td>
                <td>${mov.quantidade_nova || '-'}</td>
                <td>${mov.usuario || '-'}</td>
                <td>${mov.destinatario ? `Dest: ${mov.destinatario}` : ''} ${mov.observacao || ''}</td>
            `;
            tbody.appendChild(tr);
        });

    } catch (error) {
        console.error('Erro no relatório:', error);
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:red;">Erro ao carregar relatório.</td></tr>';
    }
}