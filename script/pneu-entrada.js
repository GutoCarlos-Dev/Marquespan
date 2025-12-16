import { supabaseClient } from './supabase.js';

let listaDeEntradas = []; // Cache local para evitar múltiplas buscas
let gridBody;
let editMode = false;
let editingId = null;

// 🚀 Inicialização
document.addEventListener('DOMContentLoaded', () => {
    gridBody = document.getElementById('grid-pneus-body');
    const form = document.getElementById('formPneu');
    const btnBuscar = document.getElementById('btn-buscar');
    const btnLimparBusca = document.getElementById('btn-limpar-busca');
    const btnCancelForm = document.getElementById('btnCancelForm');
    const selectTipo = document.getElementById('tipo');
    const inputVida = document.getElementById('vida');
    // Campos para cálculo de valor
    const inputQuantidade = document.getElementById('quantidade');
    const inputValorNota = document.getElementById('vlr_nota');
    const inputValorFrete = document.getElementById('valor_frete');

    // --- Event Listeners ---
    form.addEventListener('submit', handleSubmit);
    btnBuscar?.addEventListener('click', buscarEntradas);
    btnLimparBusca?.addEventListener('click', limparFiltrosBusca);
    btnCancelForm?.addEventListener('click', () => clearForm());
    gridBody?.addEventListener('click', handleGridActions);

    // Adiciona a lógica para o campo 'Vida' quando 'Tipo' for 'NOVO'
    selectTipo?.addEventListener('change', (event) => {
        if (event.target.value === 'NOVO') {
            inputVida.value = 0;
        }
    });
    // Listeners para recalcular o valor total
    inputQuantidade?.addEventListener('input', calcularValorTotal);
    inputValorNota?.addEventListener('input', calcularValorTotal);
    inputValorFrete?.addEventListener('input', calcularValorTotal);

    // --- Inicialização da Página ---
    initializeSelects();
    carregarEntradas();
    clearForm(); // Garante que o campo de data seja preenchido na carga inicial
});

// Preenche os selects com opções pré-definidas
function initializeSelects() {
    const selectMarca = document.getElementById('marca');
    const selectModelo = document.getElementById('modelo');
    const selectTipo = document.getElementById('tipo');

    const marcas = ['BRIDGESTONE', 'CONTINENTAL', 'GOODYEAR', 'MICHELIN', 'PIRELLI', 'OUTRA'];
    const modelos = ['225/75/16', '235/75/17.5', '275/80/22.5 - LISO', '275/80/22.5 - BORRACHUDO', '295/80/22.5 - LISO', '295/80/22.5 - BORRACHUDO', 'OUTRO'];
    const tipos = ['NOVO', 'RECAPADO', 'USADO'];

    selectMarca.innerHTML = '<option value="">Selecione</option>' + marcas.map(m => `<option value="${m}">${m}</option>`).join('');
    selectModelo.innerHTML = '<option value="">Selecione</option>' + modelos.map(m => `<option value="${m}">${m}</option>`).join('');
    selectTipo.innerHTML = '<option value="">Selecione</option>' + tipos.map(t => `<option value="${t}">${t}</option>`).join('');
}

// Obtém o nome do usuário logado do localStorage
function getCurrentUserName() {
    const usuario = JSON.parse(localStorage.getItem('usuarioLogado'));
    return usuario ? usuario.nome : 'Usuário Anônimo';
}

// Limpa o formulário e redefine a data
function clearForm() {
    const form = document.getElementById('formPneu');
    form.reset();
    
    // Ajuste para usar apenas a data local.
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    document.getElementById('data').value = now.toISOString().slice(0, 10);

    // Limpa o display de valor total
    document.getElementById('valor_total_display').textContent = 'R$ 0,00';

    editMode = false;
    editingId = null;
}

// 💰 Calcula e exibe o valor total
function calcularValorTotal() {
    const quantidade = parseFloat(document.getElementById('quantidade').value) || 1; // Evita divisão por zero
    const valorNota = parseFloat(document.getElementById('vlr_nota').value) || 0;
    const valorFrete = parseFloat(document.getElementById('valor_frete').value) || 0;
    // Lógica de cálculo atualizada: (Valor da Nota / Quantidade) + Valor do Frete
    const total = (valorNota / quantidade) + valorFrete;

    const displayTotal = document.getElementById('valor_total_display');
    if (displayTotal) {
        displayTotal.textContent = total.toLocaleString('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        });
    }
}

// 💾 Salva ou atualiza uma entrada de pneu
async function handleSubmit(e) {
    e.preventDefault();

    const formData = new FormData(e.target);
    const pneuData = {
        data: formData.get('data'),
        os: formData.get('os')?.trim().toUpperCase(),
        nota_fiscal: formData.get('nota_fiscal')?.trim().toUpperCase(),
        marca: formData.get('marca'),
        modelo: formData.get('modelo'),
        tipo: formData.get('tipo'),
        vida: parseInt(formData.get('vida') || 0),
        quantidade: parseInt(formData.get('quantidade') || 0),
        valor_nota: parseFloat(formData.get('vlr_nota') || 0), // Custo total da nota
        valor_frete: parseFloat(formData.get('valor_frete') || 0), // Custo total do frete
        // Lógica de cálculo do valor total atualizada
        valor_total: ((parseFloat(formData.get('vlr_nota') || 0) / (parseInt(formData.get('quantidade')) || 1)) + parseFloat(formData.get('valor_frete') || 0)),
        // A lógica do valor unitário real foi mantida, pois representa o custo total (nota+frete) dividido pela quantidade.
        valor_unitario_real: ((parseFloat(formData.get('vlr_nota') || 0) + parseFloat(formData.get('valor_frete') || 0)) / (parseInt(formData.get('quantidade')) || 1)),
        observacoes: formData.get('observacoes')?.trim(),
        usuario: getCurrentUserName(),
        // Campos fixos para esta tela
        status: 'ENTRADA',
        descricao: 'ENTRADA ESTOQUE NF',
    };
    if (!pneuData.nota_fiscal || !pneuData.marca || !pneuData.modelo || !pneuData.tipo || pneuData.quantidade <= 0 || !pneuData.valor_nota && pneuData.valor_nota !== 0) {
        alert('Por favor, preencha todos os campos obrigatórios (*).');
        return;
    }

    try {
        if (editMode && editingId) {
            // --- MODO DE EDIÇÃO ---
            const { error } = await supabaseClient
                .from('pneus')
                .update(pneuData)
                .eq('id', editingId);

            if (error) throw error;
            alert('Entrada de pneu atualizada com sucesso!');

        } else {
            // --- MODO DE INSERÇÃO ---
            const { data: insertedData, error } = await supabaseClient
                .from('pneus')
                .insert([pneuData])
                .select()
                .single();

            if (error) throw error;            
            alert('Entrada de pneu registrada com sucesso! Agora você pode gerar as marcas de fogo na tabela.');
        }

        clearForm();
        await carregarEntradas();

    } catch (error) {
        console.error('Erro ao salvar entrada de pneu:', error);
        alert(`Ocorreu um erro: ${error.message}`);
    }
}

// 🔥 Gera códigos de marca de fogo sequenciais
async function gerarCodigosMarcaFogo(lancamentoId, quantidade, usuario) {
    // A lógica foi movida para uma função (Stored Procedure) no Supabase
    // para garantir atomicidade e evitar race conditions.
    // Agora, apenas chamamos a função RPC.
    try {
        const { error } = await supabaseClient.rpc('gerar_codigos_marca_fogo', {
            p_lancamento_id: lancamentoId,
            p_quantidade: quantidade,
            p_usuario_criacao: usuario
        });

        if (error) {
            // Lança o erro para ser capturado pelo bloco catch no handleSubmit
            throw error;
        }

    } catch (error) {
        // Loga o erro e relança para que a função que chamou (handleSubmit) possa tratá-lo.
        console.error('Erro na geração de códigos de marca de fogo:', error);
        throw new Error('Houve um erro ao gerar os códigos de marca de fogo. Verifique o console para detalhes.');
    }
}

// 📦 Carrega as últimas entradas do banco de dados
async function carregarEntradas() {
    if (!gridBody) return;

    try {
        const { data, error } = await supabaseClient
            .from('pneus')
            .select('*, marcas_fogo_pneus(count)') // Conta os códigos de fogo associados
            .eq('status', 'ENTRADA') // Filtra apenas por entradas
            .order('data', { ascending: false })
            .limit(100); // Limita aos 100 registros mais recentes

        if (error) throw error;

        listaDeEntradas = data || [];
        renderizarGrid(data || []);
    } catch (error) {
        console.error('Erro ao carregar entradas:', error);
        gridBody.innerHTML = `<tr><td colspan="9" class="error-message">Erro ao carregar dados.</td></tr>`;
    }
}

// 🔍 Busca entradas com base nos filtros
async function buscarEntradas() {
    const nf = document.getElementById('campo-nf')?.value.trim().toUpperCase();
    const marca = document.getElementById('campo-marca')?.value.trim().toUpperCase();
    const modelo = document.getElementById('campo-modelo')?.value.trim().toUpperCase();

    try {
        let query = supabaseClient
            .from('pneus')
            .select('*, marcas_fogo_pneus(count)')
            .eq('status', 'ENTRADA')
            .order('data', { ascending: false });

        if (nf) query = query.ilike('nota_fiscal', `%${nf}%`);
        if (marca) query = query.ilike('marca', `%${marca}%`);
        if (modelo) query = query.ilike('modelo', `%${modelo}%`);

        const { data, error } = await query;

        if (error) throw error;

        listaDeEntradas = data || [];
        renderizarGrid(listaDeEntradas);
    } catch (error) {
        console.error('Erro ao buscar entradas:', error);
    }
}

// 🧹 Limpa os filtros de busca e recarrega a lista completa
function limparFiltrosBusca() {
    document.getElementById('campo-nf').value = '';
    document.getElementById('campo-marca').value = '';
    document.getElementById('campo-modelo').value = '';
    carregarEntradas();
}

// 🧱 Renderiza os dados na tabela
function renderizarGrid(lista) {
    gridBody.innerHTML = '';

    if (lista.length === 0) {
        gridBody.innerHTML = `<tr><td colspan="12" class="no-results-message">Nenhuma entrada encontrada.</td></tr>`;
        return;
    }

    lista.forEach(pneu => {
        const tr = document.createElement('tr');
        const temCodigos = pneu.marcas_fogo_pneus && pneu.marcas_fogo_pneus.length > 0 && pneu.marcas_fogo_pneus[0].count > 0;

        // Define o botão a ser exibido na coluna "Marca Fogo"
        const botaoMarcaFogo = temCodigos
            ? `<button class="btn-pneu-action view" data-action="view" data-id="${pneu.id}" title="Visualizar Marcas de Fogo">
                   <i class="fas fa-eye"></i> Ver Códigos
               </button>`
            : `<button class="btn-pneu-action generate" data-action="generate" data-id="${pneu.id}" title="Gerar Marcas de Fogo">
                   <i class="fas fa-fire"></i> Gerar
               </button>`;

        // A ordem das colunas foi ajustada para corresponder ao cabeçalho da tabela no HTML.
        tr.innerHTML = `
            <td>${pneu.data ? new Date(pneu.data + 'T00:00:00').toLocaleDateString('pt-BR') : ''}</td>
            <td class="uppercase">${pneu.nota_fiscal || ''}</td>
            <td>${pneu.marca}</td>
            <td>${pneu.modelo}</td>
            <td>${pneu.tipo}</td>
            <td style="text-align: center;">${pneu.vida || 0}</td>
            <td style="text-align: center;">${pneu.quantidade || 0}</td>
            <td style="text-align: center;">
                ${botaoMarcaFogo}
            </td>
            <td>${(pneu.valor_nota || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
            <td>${(pneu.valor_frete || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
            <td><strong>${(pneu.valor_total || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></td>
            <td class="actions-cell">
                <button class="btn-pneu-action edit" data-action="edit" data-id="${pneu.id}" title="Editar Lançamento">
                    <i class="fas fa-pen"></i>
                </button>
                <button class="btn-pneu-action delete" data-action="delete" data-id="${pneu.id}" title="Excluir Lançamento">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
        gridBody.appendChild(tr);
    });
}

// 🎬 Lida com cliques nos botões da tabela (editar, excluir, visualizar)
function handleGridActions(event) {
    const button = event.target.closest('button');
    if (!button) return;

    const action = button.dataset.action;
    const id = button.dataset.id;

    if (!action || !id) return;

    if (action === 'edit') {
        editarEntrada(id);
    } else if (action === 'delete') {
        excluirEntrada(id);
    } else if (action === 'view') {
        visualizarCodigosMarcaFogo(id);
    } else if (action === 'generate') {
        handleGerarCodigos(id);
    }
}

// ✏️ Preenche o formulário para edição
function editarEntrada(id) {
    const data = listaDeEntradas.find(p => p.id == id);
    if (!data) {
        alert('Erro: Entrada não encontrada para edição.');
        return;
    }
    try {
        document.getElementById('data').value = data.data ? new Date(data.data + 'T00:00:00').toISOString().slice(0, 10) : '';
        document.getElementById('nota_fiscal').value = data.nota_fiscal || '';
        document.getElementById('marca').value = data.marca;
        document.getElementById('modelo').value = data.modelo;
        document.getElementById('tipo').value = data.tipo;
        document.getElementById('vida').value = data.vida ?? 1; // Usa ?? para permitir 0
        document.getElementById('os').value = data.os || '';
        document.getElementById('quantidade').value = data.quantidade || 0;
        document.getElementById('vlr_nota').value = data.valor_nota || 0;
        document.getElementById('valor_frete').value = data.valor_frete || 0;
        // O valor_unitario_real não precisa ser preenchido no form, pois é apenas para salvar
        document.getElementById('observacoes').value = data.observacoes || '';

        editMode = true;
        editingId = id;
        
        calcularValorTotal(); // Recalcula o total ao carregar para edição

        document.getElementById('formPneu').scrollIntoView({ behavior: 'smooth' });
    } catch (error) {
        console.error('Erro ao carregar dados para edição:', error);
        alert('Erro ao carregar dados para edição.');
    }
};

// 🎬 Lida com o clique no botão "Gerar"
async function handleGerarCodigos(id) {
    const entrada = listaDeEntradas.find(p => p.id == id);
    if (!entrada) {
        alert('Erro: Lançamento não encontrado.');
        return;
    }

    if (!confirm(`Deseja gerar ${entrada.quantidade} código(s) de marca de fogo para a NF ${entrada.nota_fiscal}?`)) {
        return;
    }

    try {
        const usuario = getCurrentUserName();
        await gerarCodigosMarcaFogo(entrada.id, entrada.quantidade, usuario); // A lógica de geração foi movida para o Supabase
        alert('Códigos de marca de fogo gerados com sucesso!');
        await carregarEntradas(); // Recarrega a tabela para atualizar o botão para "Visualizar"
    } catch (error) {
        // O erro já é tratado dentro de gerarCodigosMarcaFogo, então não fazemos nada aqui para evitar alertas duplicados.
    }
}

// 🗑️ Exclui uma entrada e suas marcas de fogo associadas
async function excluirEntrada(id) {
    if (!confirm('Tem certeza que deseja excluir este lançamento? TODOS os códigos de marca de fogo associados a ele também serão excluídos. Esta ação não pode ser desfeita.')) {
        return;
    }

    try {
        // Primeiro, exclui os códigos de marca de fogo associados
        const { error: deleteCodigosError } = await supabaseClient
            .from('marcas_fogo_pneus')
            .delete()
            .eq('lancamento_id', id);

        if (deleteCodigosError) throw deleteCodigosError;

        // Depois, exclui o lançamento principal
        const { error: deletePneuError } = await supabaseClient
            .from('pneus')
            .delete()
            .eq('id', id);

        if (deletePneuError) throw deletePneuError;

        alert('Lançamento e códigos associados excluídos com sucesso!');
        await carregarEntradas();

    } catch (error) {
        console.error('Erro ao excluir lançamento:', error);
        alert(`Erro ao excluir: ${error.message}`);
    }
};

// 👀 Visualiza os códigos de marca de fogo em um modal
async function visualizarCodigosMarcaFogo(lancamentoId) {
    try {
        const { data: codigos, error } = await supabaseClient
            .from('marcas_fogo_pneus')
            .select('codigo_marca_fogo, status_pneu')
            .eq('lancamento_id', lancamentoId)
            .order('codigo_marca_fogo', { ascending: true });

        if (error) throw error;

        if (!codigos || codigos.length === 0) {
            alert('Nenhum código de marca de fogo encontrado para este lançamento.');
            return;
        }

        // Criar e exibir o modal
        const modal = createModal(codigos);
        document.body.appendChild(modal);

    } catch (error) {
        console.error('Erro ao visualizar códigos:', error);
        alert('Erro ao carregar os códigos de marca de fogo.');
    }
};

// 🎨 Cria o HTML do modal para exibir os códigos
function createModal(codigos) {
    const modal = document.createElement('div');
    modal.className = 'modal-pneu-viewer';
    modal.onclick = (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    };

    const modalContent = document.createElement('div');
    modalContent.className = 'modal-pneu-content';

    let contentHTML = `
        <div class="modal-pneu-header">
            <h3><i class="fas fa-fire"></i> Códigos de Marca de Fogo Gerados</h3>
            <span class="modal-pneu-close">&times;</span>
        </div>
        <div class="modal-pneu-body">
            <p>Total de códigos: <strong>${codigos.length}</strong></p>
            <div class="codigos-grid">
    `;

    codigos.forEach(item => {
        contentHTML += `<div class="codigo-item">${item.codigo_marca_fogo}</div>`;
    });

    contentHTML += `
            </div>
        </div>
        <div class="modal-pneu-footer">
            <button class="btn-pneu btn-pneu-cancel">Fechar</button>
        </div>
    `;

    modalContent.innerHTML = contentHTML;

    // Event listeners do modal
    modalContent.querySelector('.modal-pneu-close').onclick = () => document.body.removeChild(modal);
    modalContent.querySelector('.btn-pneu-cancel').onclick = () => document.body.removeChild(modal);

    modal.appendChild(modalContent);
    return modal;
}

// Adicionar estilos para o novo modal no CSS ou aqui diretamente
if (!document.getElementById('pneu-modal-styles')) {
    const style = document.createElement('style');
    style.id = 'pneu-modal-styles';
    style.innerHTML = `
        .modal-pneu-viewer { position: fixed; z-index: 1000; left: 0; top: 0; width: 100%; height: 100%; overflow: auto; background-color: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; }
        .modal-pneu-content { background-color: #fefefe; margin: auto; padding: 20px; border: 1px solid #888; width: 80%; max-width: 600px; border-radius: 12px; box-shadow: 0 5px 15px rgba(0,0,0,0.3); animation: fadeIn 0.3s; }
        .modal-pneu-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #eee; padding-bottom: 10px; margin-bottom: 15px; }
        .modal-pneu-header h3 { margin: 0; color: #28a745; }
        .modal-pneu-close { color: #aaa; float: right; font-size: 28px; font-weight: bold; cursor: pointer; }
        .modal-pneu-close:hover { color: black; }
        .codigos-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 10px; max-height: 40vh; overflow-y: auto; padding: 10px; background: #f8f9fa; border-radius: 8px; }
        .codigo-item { background: #28a745; color: white; padding: 8px; border-radius: 4px; text-align: center; font-weight: bold; }
        .modal-pneu-footer { text-align: right; margin-top: 20px; padding-top: 15px; border-top: 1px solid #eee; }
        .btn-pneu-action { background: none; border: none; cursor: pointer; font-size: 1rem; padding: 5px; }
        .btn-pneu-action.view { color: #17a2b8; }
        .btn-pneu-action.edit { color: #ffc107; }
        .btn-pneu-action.delete { color: #dc3545; }
        .btn-pneu-action.generate { color: #fd7e14; }
        .uppercase { text-transform: uppercase; }
    `;
    document.head.appendChild(style);
}
