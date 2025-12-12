import { supabaseClient } from './supabase.js';

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

    // --- Event Listeners ---
    form.addEventListener('submit', handleSubmit);
    btnBuscar?.addEventListener('click', buscarEntradas);
    btnLimparBusca?.addEventListener('click', limparFiltrosBusca);
    btnCancelForm?.addEventListener('click', () => clearForm());

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
    
    // Ajuste para usar a data e hora local, corrigindo o fuso horário.
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    document.getElementById('data').value = now.toISOString().slice(0, 16);

    editMode = false;
    editingId = null;
}

// 💾 Salva ou atualiza uma entrada de pneu
async function handleSubmit(e) {
    e.preventDefault();

    const formData = new FormData(e.target);
    const pneuData = {
        data: formData.get('data'),
        nota_fiscal: formData.get('nota_fiscal')?.trim().toUpperCase(),
        marca: formData.get('marca'),
        modelo: formData.get('modelo'),
        tipo: formData.get('tipo'),
        vida: parseInt(formData.get('vida') || 1),
        quantidade: parseInt(formData.get('quantidade') || 0),
        observacoes: formData.get('observacoes')?.trim(),
        usuario: getCurrentUserName(),
        // Campos fixos para esta tela
        status: 'ENTRADA',
        descricao: 'ENTRADA ESTOQUE NF',
    };

    if (!pneuData.nota_fiscal || !pneuData.marca || !pneuData.modelo || !pneuData.tipo || pneuData.quantidade <= 0) {
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

            // Gera códigos de marca de fogo se a quantidade for maior que 0
            if (insertedData && pneuData.quantidade > 0) {
                await gerarCodigosMarcaFogo(insertedData.id, pneuData.quantidade, pneuData.usuario);
            }

            alert('Entrada de pneu registrada com sucesso!');
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
    try {
        // 1. Buscar o último código gerado para saber onde continuar
        const { data: ultimoCodigo, error: buscaError } = await supabaseClient
            .from('marcas_fogo_pneus')
            .select('codigo_marca_fogo')
            .order('id', { ascending: false })
            .limit(1)
            .single();

        if (buscaError && buscaError.code !== 'PGRST116') { // Ignora erro se a tabela estiver vazia
            throw buscaError;
        }

        let proximoNumero = 1;
        if (ultimoCodigo) {
            const numero = parseInt(ultimoCodigo.codigo_marca_fogo.replace('MF', ''), 10);
            proximoNumero = numero + 1;
        }

        // 2. Preparar os novos códigos para inserção
        const codigosParaInserir = [];
        for (let i = 0; i < quantidade; i++) {
            const novoCodigo = `MF${(proximoNumero + i).toString().padStart(6, '0')}`;
            codigosParaInserir.push({
                lancamento_id: lancamentoId,
                codigo_marca_fogo: novoCodigo,
                status_pneu: 'ESTOQUE',
                usuario_criacao: usuario
            });
        }

        // 3. Inserir os novos códigos no banco de dados
        if (codigosParaInserir.length > 0) {
            const { error: insertError } = await supabaseClient
                .from('marcas_fogo_pneus')
                .insert(codigosParaInserir);

            if (insertError) throw insertError;
        }

    } catch (error) {
        console.error('Erro na geração de códigos de marca de fogo:', error);
        alert('Aviso: A entrada foi registrada, mas houve um erro ao gerar os códigos de marca de fogo.');
    }
}

// 📦 Carrega as últimas entradas do banco de dados
async function carregarEntradas() {
    if (!gridBody) return;

    try {
        const { data, error } = await supabaseClient
            .from('pneus')
            .select('*')
            .eq('status', 'ENTRADA') // Filtra apenas por entradas
            .order('data', { ascending: false })
            .limit(100); // Limita aos 100 registros mais recentes

        if (error) throw error;

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
            .select('*')
            .eq('status', 'ENTRADA')
            .order('data', { ascending: false });

        if (nf) query = query.ilike('nota_fiscal', `%${nf}%`);
        if (marca) query = query.ilike('marca', `%${marca}%`);
        if (modelo) query = query.ilike('modelo', `%${modelo}%`);

        const { data, error } = await query;

        if (error) throw error;

        renderizarGrid(data || []);
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
        gridBody.innerHTML = `<tr><td colspan="9" class="no-results-message">Nenhuma entrada encontrada.</td></tr>`;
        return;
    }

    lista.forEach(pneu => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${pneu.data ? new Date(pneu.data).toLocaleString('pt-BR') : ''}</td>
            <td>${pneu.nota_fiscal || ''}</td>
            <td>${pneu.marca}</td>
            <td>${pneu.modelo}</td>
            <td>${pneu.tipo}</td>
            <td>${pneu.vida || 0}</td>
            <td>${pneu.quantidade || 0}</td>
            <td>
                <button class="btn-pneu-action view" onclick="visualizarCodigosMarcaFogo('${pneu.id}')" title="Visualizar Marcas de Fogo">
                    <i class="fas fa-eye"></i> Ver Códigos
                </button>
            </td>
            <td class="actions-cell">
                <button class="btn-pneu-action edit" onclick="editarEntrada('${pneu.id}')" title="Editar Lançamento">
                    <i class="fas fa-pen"></i>
                </button>
                <button class="btn-pneu-action delete" onclick="excluirEntrada('${pneu.id}')" title="Excluir Lançamento">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
        gridBody.appendChild(tr);
    });
}

// ✏️ Preenche o formulário para edição
window.editarEntrada = async function(id) {
    try {
        const { data, error } = await supabaseClient
            .from('pneus')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;

        document.getElementById('data').value = data.data ? new Date(data.data).toISOString().slice(0, 16) : '';
        document.getElementById('nota_fiscal').value = data.nota_fiscal || '';
        document.getElementById('marca').value = data.marca;
        document.getElementById('modelo').value = data.modelo;
        document.getElementById('tipo').value = data.tipo;
        document.getElementById('vida').value = data.vida || 1;
        document.getElementById('quantidade').value = data.quantidade || 0;
        // document.getElementById('observacoes').value = data.observacoes || ''; // Removido pois a coluna não existe

        editMode = true;
        editingId = id;

        document.getElementById('formPneu').scrollIntoView({ behavior: 'smooth' });
    } catch (error) {
        console.error('Erro ao carregar dados para edição:', error);
        alert('Erro ao carregar dados para edição.');
    }
};

// 🗑️ Exclui uma entrada e suas marcas de fogo associadas
window.excluirEntrada = async function(id) {
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
window.visualizarCodigosMarcaFogo = async function(lancamentoId) {
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
    `;
    document.head.appendChild(style);
}