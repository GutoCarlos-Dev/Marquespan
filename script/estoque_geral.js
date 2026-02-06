import { supabaseClient } from './supabase.js';

let produtosCache = []; // Cache para datalists
let itensRetirada = []; // Carrinho de retirada
let dadosUltimaRetirada = null; // Para gerar PDF após salvar

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
            } else if (tabId === 'tab-retirada') {
                iniciarRelogioRetirada();
            }
        });
    });

    // Listeners - Estoque Atual
    document.getElementById('btn-buscar-estoque').addEventListener('click', carregarEstoqueGeral);
    document.getElementById('btn-limpar-filtros').addEventListener('click', limparFiltros);

    // Listeners - Retirada
    document.getElementById('retirada-produto').addEventListener('change', (e) => preencherDadosProduto(e.target.value, 'retirada'));
    document.getElementById('btn-adicionar-item-retirada').addEventListener('click', handleAddItemRetirada);
    document.getElementById('btn-registrar-saida').addEventListener('click', handleRegistrarSaida);
    document.getElementById('btn-gerar-pdf-saida').addEventListener('click', handleGerarPDFSaida);
    // Delegação de eventos para remover item do grid
    document.getElementById('grid-itens-retirada').addEventListener('click', handleRemoveItemRetirada);

    // Listeners - Batimento
    document.getElementById('batimento-produto').addEventListener('change', (e) => preencherDadosProduto(e.target.value, 'batimento'));
    document.getElementById('form-batimento').addEventListener('submit', handleBatimento);

    // Listeners - Relatórios
    document.getElementById('btn-buscar-relatorio').addEventListener('click', carregarRelatorioMovimentacoes);
    document.getElementById('grid-relatorio-body').addEventListener('click', handleRelatorioActions);
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

function iniciarRelogioRetirada() {
    const updateTime = () => {
        const now = new Date();
        document.getElementById('retirada-data').textContent = now.toLocaleDateString('pt-BR');
        document.getElementById('retirada-hora').textContent = now.toLocaleTimeString('pt-BR');
        document.getElementById('retirada-usuario-logado').textContent = getCurrentUser();
    };
    updateTime();
    setInterval(updateTime, 1000);
}

function handleAddItemRetirada() {
    const produtoId = document.getElementById('retirada-produto-id').value;
    const produtoInput = document.getElementById('retirada-produto');
    const qtdInput = document.getElementById('retirada-quantidade');
    const estoqueInput = document.getElementById('retirada-estoque-atual');
    
    const qtdRetirada = parseFloat(qtdInput.value);
    const produtoNome = produtoInput.value;

    if (!produtoId) return alert('Selecione um produto válido.');
    if (isNaN(qtdRetirada) || qtdRetirada <= 0) return alert('Informe uma quantidade válida.');

    const produto = produtosCache.find(p => p.id == produtoId);
    if (!produto) return alert('Produto não encontrado.');

    const estoqueAtual = parseFloat(produto.quantidade_em_estoque) || 0;

    // Verifica se já tem no carrinho para somar a validação
    const itemNoCarrinho = itensRetirada.find(i => i.id === produtoId);
    const qtdJaNoCarrinho = itemNoCarrinho ? itemNoCarrinho.qtd : 0;

    if ((qtdRetirada + qtdJaNoCarrinho) > estoqueAtual) {
        return alert(`Estoque insuficiente! Disponível: ${estoqueAtual}. Tentativa total: ${qtdRetirada + qtdJaNoCarrinho}.`);
    }

    if (itemNoCarrinho) {
        itemNoCarrinho.qtd += qtdRetirada;
    } else {
        itensRetirada.push({
            id: produtoId,
            codigo: produto.codigo_principal,
            nome: produto.nome,
            qtd: qtdRetirada,
            estoque_antes: estoqueAtual
        });
    }

    renderGridRetirada();
    
    // Limpa campos
    produtoInput.value = '';
    document.getElementById('retirada-produto-id').value = '';
    qtdInput.value = '';
    estoqueInput.value = '';
    produtoInput.focus();
}

function renderGridRetirada() {
    const tbody = document.getElementById('grid-itens-retirada');
    tbody.innerHTML = '';
    
    if (itensRetirada.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#666;">Nenhum item adicionado.</td></tr>';
        document.getElementById('total-itens-retirada').textContent = '0';
        return;
    }

    itensRetirada.forEach((item, index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${item.codigo || '-'}</td>
            <td>${item.nome}</td>
            <td style="text-align: center;">${item.qtd}</td>
            <td style="text-align: center;">
                <button class="btn-acao-remover" data-index="${index}" style="background:none; border:none; color:#dc3545; cursor:pointer;">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    document.getElementById('total-itens-retirada').textContent = itensRetirada.length;
}

function handleRemoveItemRetirada(e) {
    const btn = e.target.closest('.btn-acao-remover');
    if (btn) {
        const index = btn.dataset.index;
        itensRetirada.splice(index, 1);
        renderGridRetirada();
    }
}

async function handleRegistrarSaida() {
    if (itensRetirada.length === 0) return alert('Adicione itens antes de registrar a saída.');
    
    const responsavel = document.getElementById('retirada-responsavel').value.trim();
    const observacao = document.getElementById('retirada-observacao').value.trim();

    if (!responsavel) return alert('Informe quem está retirando o material.');

    if (!confirm(`Confirma a saída de ${itensRetirada.length} itens para ${responsavel}?`)) return;

    const withdrawalId = crypto.randomUUID(); // Gera um ID único para este lote de retirada

    try {
        for (const item of itensRetirada) {
            const novaQtd = item.estoque_antes - item.qtd;

            // 1. Atualizar Produto
            await supabaseClient
                .from('produtos')
                .update({ quantidade_em_estoque: novaQtd })
                .eq('id', item.id);

            // 2. Registrar Movimentação
            await supabaseClient.from('movimentacoes_estoque').insert({
                produto_id: item.id,
                tipo_movimentacao: 'SAIDA',
                quantidade: -item.qtd,
                quantidade_anterior: item.estoque_antes,
                quantidade_nova: novaQtd,
                usuario: getCurrentUser(),
                destinatario: responsavel,
                observacao: observacao,
                withdrawal_id: withdrawalId // Adiciona o ID do lote a cada item
            });
        }

        alert('Saída registrada com sucesso!');
        
        // Habilitar PDF e salvar dados temporários
        dadosUltimaRetirada = { itens: [...itensRetirada], responsavel, observacao, data: new Date() };
        document.getElementById('btn-gerar-pdf-saida').disabled = false;
        document.getElementById('btn-gerar-pdf-saida').style.cursor = 'pointer';
        document.getElementById('btn-gerar-pdf-saida').style.backgroundColor = '#006937';
        document.getElementById('btn-gerar-pdf-saida').style.borderColor = '#006937';
        document.getElementById('btn-registrar-saida').disabled = true;
        document.getElementById('btn-registrar-saida').style.backgroundColor = '#6c757d';

        // Limpar carrinho e atualizar dados
        itensRetirada = [];
        renderGridRetirada();
        await carregarProdutosParaDatalist();

    } catch (error) {
        console.error('Erro na retirada:', error);
        alert('Erro ao registrar retirada: ' + error.message);
    }
}

function handleGerarPDFSaida() {
    if (!dadosUltimaRetirada) return;
    gerarReciboPDF(dadosUltimaRetirada);
}

async function gerarReciboPDF(dados) {
    if (!window.jspdf) return alert('Biblioteca PDF não carregada.');
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    const { itens, responsavel, observacao, data } = dados;

    // --- Adicionar Logo ---
    try {
        const response = await fetch('logo.png');
        if (response.ok) {
            const blob = await response.blob();
            const reader = new FileReader();
            const base64data = await new Promise(r => { reader.onloadend = () => r(reader.result); reader.readAsDataURL(blob); });
            doc.addImage(base64data, 'PNG', 10, 10, 40, 15);
        }
    } catch (e) {
        console.warn('Logo não carregado', e);
    }

    // Cabeçalho
    doc.setFontSize(18);
    doc.text('RECIBO DE RETIRADA DE MATERIAL', 105, 35, { align: 'center' });
    
    doc.setFontSize(12);
    doc.text(`Data: ${new Date().toLocaleString('pt-BR')}`, 20, 50);
    doc.text(`Atendente: ${getCurrentUser()}`, 20, 60);
    
    // Detalhes
    doc.setLineWidth(0.5);
    doc.line(20, 65, 190, 65);
    
    doc.setFontSize(14);
    doc.text('Itens Retirados:', 20, 75);
    
    // Tabela de Itens
    const tableColumn = ["Código", "Produto", "Qtd"];
    const tableRows = itens.map(item => [item.codigo || '-', item.nome, item.qtd]);

    doc.autoTable({
        head: [tableColumn],
        body: tableRows,
        startY: 80,
        theme: 'grid',
        headStyles: { fillColor: [0, 105, 55] }
    });

    let finalY = doc.lastAutoTable.finalY + 10;

    if(observacao) {
        doc.setFontSize(12);
        doc.text(`Observação: ${observacao}`, 20, finalY);
        finalY += 10;
    }

    // Assinaturas
    doc.text('Declaro que recebi o material acima descrito em perfeitas condições.', 20, finalY + 10);

    doc.line(20, finalY + 40, 90, finalY + 40);
    doc.text('Atendente (Assinatura)', 20, finalY + 45);

    doc.line(110, finalY + 40, 180, finalY + 40);
    doc.text(responsavel, 110, finalY + 45);
    doc.text('(Retirado Por)', 110, finalY + 52);

    doc.save(`Recibo_Retirada_${new Date().getTime()}.pdf`);
}

async function gerarPdfHistorico(withdrawalId) {
    const { data: movimentos, error } = await supabaseClient
        .from('movimentacoes_estoque')
        .select('*, produtos(codigo_principal, nome)')
        .eq('withdrawal_id', withdrawalId);

    if (error) throw error;
    if (!movimentos || movimentos.length === 0) {
        throw new Error('Nenhum movimento encontrado para este recibo.');
    }

    const primeiroMovimento = movimentos[0];

    const dadosRecibo = {
        itens: movimentos.map(mov => ({
            codigo: mov.produtos?.codigo_principal || '-',
            nome: mov.produtos?.nome || 'Produto não encontrado',
            qtd: Math.abs(mov.quantidade)
        })),
        responsavel: primeiroMovimento.destinatario,
        observacao: primeiroMovimento.observacao,
        data: new Date(primeiroMovimento.data_movimentacao)
    };

    await gerarReciboPDF(dadosRecibo);
}

async function handleRelatorioActions(e) {
    const btn = e.target.closest('.btn-pdf-relatorio');
    if (btn) {
        const withdrawalId = btn.dataset.withdrawalId;
        if (withdrawalId) await gerarPdfHistorico(withdrawalId).catch(err => alert('Erro ao gerar PDF: ' + err.message));
    }
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
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;">Carregando...</td></tr>';

    const dataIni = document.getElementById('relatorio-data-ini').value;
    const dataFim = document.getElementById('relatorio-data-fim').value;
    const tipo = document.getElementById('relatorio-tipo').value;

    try {
        let query = supabaseClient
            .from('movimentacoes_estoque')
            .select('id, data_movimentacao, tipo_movimentacao, quantidade, quantidade_anterior, quantidade_nova, usuario, destinatario, observacao, withdrawal_id, produtos(nome, codigo_principal)')
            .order('data_movimentacao', { ascending: false })
            .limit(100);

        if (dataIni) query = query.gte('data_movimentacao', `${dataIni}T00:00:00`);
        if (dataFim) query = query.lte('data_movimentacao', `${dataFim}T23:59:59`);
        if (tipo) query = query.eq('tipo_movimentacao', tipo);

        const { data, error } = await query;

        if (error) throw error;

        tbody.innerHTML = '';
        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;">Nenhuma movimentação encontrada.</td></tr>';
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

            let acoesHtml = '';
            if (mov.tipo_movimentacao === 'SAIDA' && mov.withdrawal_id) {
                acoesHtml = `<button class="btn-pdf btn-pdf-relatorio" data-withdrawal-id="${mov.withdrawal_id}" title="Visualizar Recibo PDF" style="padding: 4px 8px; font-size: 0.8em;"><i class="fas fa-file-pdf"></i></button>`;
            }

            tr.innerHTML = `
                <td>${dataFormatada}</td>
                <td>${produtoNome}</td>
                <td style="color: ${corTipo}; font-weight: bold;">${mov.tipo_movimentacao}</td>
                <td>${mov.quantidade}</td>
                <td>${mov.quantidade_anterior || '-'}</td>
                <td>${mov.quantidade_nova || '-'}</td>
                <td>${mov.usuario || '-'}</td>
                <td>${mov.destinatario ? `Dest: ${mov.destinatario}` : ''} ${mov.observacao || ''}</td>
                <td>${acoesHtml}</td>
            `;
            tbody.appendChild(tr);
        });

    } catch (error) {
        console.error('Erro no relatório:', error);
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; color:red;">Erro ao carregar relatório.</td></tr>';
    }
}