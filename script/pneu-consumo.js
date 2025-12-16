import { supabaseClient } from './supabase.js';

let gridBody;

// 🚀 Inicialização
document.addEventListener('DOMContentLoaded', () => {
    gridBody = document.getElementById('grid-consumo-pneus-body');
    const form = document.getElementById('formConsumoPneu');
    const btnBuscar = document.getElementById('btn-buscar');
    const btnLimparBusca = document.getElementById('btn-limpar-busca');
    const btnCancelForm = document.getElementById('btnCancelForm');
    const tipoOperacaoSelect = document.getElementById('tipo_operacao');

    // --- Event Listeners ---
    form.addEventListener('submit', handleSubmit);
    btnBuscar?.addEventListener('click', buscarMovimentacoes);
    btnLimparBusca?.addEventListener('click', limparFiltrosBusca);
    btnCancelForm?.addEventListener('click', () => clearForm());

    // Lógica para mostrar/ocultar campos de troca/rodízio
    tipoOperacaoSelect?.addEventListener('change', (event) => {
        const camposTrocaRodizio = document.getElementById('campos-troca-rodizio');
        if (!camposTrocaRodizio) return;

        const operacao = event.target.value;
        if (operacao === 'RODIZIO' || operacao === 'TROCA') {
            camposTrocaRodizio.classList.remove('hidden');
        } else {
            camposTrocaRodizio.classList.add('hidden');
        }
    });

    // --- Inicialização da Página ---
    carregarPlacas();
    carregarMovimentacoes();
    carregarMarcasDeFogo();
    clearForm();
});

// 📦 Carrega as placas dos veículos no select
async function carregarPlacas() {
    const selectPlaca = document.getElementById('placa');
    if (!selectPlaca) return;

    try {
        const { data, error } = await supabaseClient
            .from('veiculos')
            .select('placa')
            .order('placa', { ascending: true });

        if (error) throw error;

        selectPlaca.innerHTML = '<option value="">Selecione</option>';
        data.forEach(veiculo => {
            const option = document.createElement('option');
            option.value = veiculo.placa;
            option.textContent = veiculo.placa;
            selectPlaca.appendChild(option);
        });
    } catch (error) {
        console.error('Erro ao carregar placas:', error);
    }
}

// ⚙️ Carrega as marcas de fogo no campo de busca
async function carregarMarcasDeFogo() {
    const campoMarcaFogo = document.getElementById('codigo_marca_fogo');
    if (!campoMarcaFogo) return;

    try {
        const { data, error } = await supabaseClient
            .from('marcas_fogo_pneus')
            .select('codigo_marca_fogo')
            .order('codigo_marca_fogo', { ascending: true });

        if (error) throw error;

        campoMarcaFogo.innerHTML = '<option value="">Selecione</option>';
        data.forEach(item => {
            campoMarcaFogo.innerHTML += `<option value="${item.codigo_marca_fogo}">${item.codigo_marca_fogo}</option>`;
        });
    } catch (error) {
        console.error('Erro ao carregar marcas de fogo:', error);
    }
}

// Obtém o nome do usuário logado do localStorage
function getCurrentUserName() {
    const usuario = JSON.parse(localStorage.getItem('usuarioLogado'));
    return usuario ? usuario.nome : 'Usuário Anônimo';
}

// Limpa o formulário e redefine a data
function clearForm() {
    const form = document.getElementById('formConsumoPneu');
    form.reset();
    
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    document.getElementById('data').value = now.toISOString().slice(0, 16);
}

// 💾 Salva uma movimentação de pneu
async function handleSubmit(e) {
    e.preventDefault();

    const formData = new FormData(e.target);
    const marcaFogo = formData.get('codigo_marca_fogo')?.trim().toUpperCase();

    // 1. Verificar se o pneu existe e está em estoque
    try {
        const { data: pneu, error: pneuError } = await supabaseClient
            .from('marcas_fogo_pneus')
            .select('id, status_pneu')
            .eq('codigo_marca_fogo', marcaFogo)
            .single();

        if (pneuError || !pneu) {
            alert(`Erro: Pneu com a marca de fogo "${marcaFogo}" não encontrado.`);
            return;
        }

        if (pneu.status_pneu !== 'ESTOQUE') {
            alert(`Atenção: O pneu "${marcaFogo}" não está no estoque. Status atual: ${pneu.status_pneu}.`);
            return;
        }

        // 2. Preparar dados para a tabela de histórico de movimentações
        const movimentacaoData = {
            data: formData.get('data'),
            codigo_marca_fogo: marcaFogo,
            placa: formData.get('placa'),
            quilometragem: parseInt(formData.get('quilometragem')),
            tipo_operacao: formData.get('tipo_operacao'),
            posicao_aplicacao: formData.get('aplicacao'),
            observacoes: formData.get('observacoes')?.trim(),
            usuario: getCurrentUserName(),
        };

        // 3. Inserir na tabela de histórico
        const { error: insertError } = await supabaseClient
            .from('movimentacoes_pneus') // Você precisará criar esta tabela
            .insert([movimentacaoData]);

        if (insertError) throw insertError;

        // 4. Atualizar o status do pneu na tabela 'marcas_fogo_pneus'
        let novoStatus = 'EM USO';
        if (movimentacaoData.tipo_operacao === 'REFORMA') novoStatus = 'EM REFORMA';
        if (movimentacaoData.tipo_operacao === 'DESCARTE') novoStatus = 'DESCARTADO';

        const { error: updateError } = await supabaseClient
            .from('marcas_fogo_pneus')
            .update({ status_pneu: novoStatus })
            .eq('id', pneu.id);

        if (updateError) throw updateError;

        alert('Movimentação de pneu registrada com sucesso!');
        clearForm();
        await carregarMovimentacoes();

    } catch (error) {
        console.error('Erro ao salvar movimentação:', error);
        alert(`Ocorreu um erro: ${error.message}`);
    }
}

// 📦 Carrega as últimas movimentações
async function carregarMovimentacoes() {
    if (!gridBody) return;

    try {
        const { data, error } = await supabaseClient
            .from('movimentacoes_pneus')
            .select('*')
            .order('data', { ascending: false })
            .limit(100);

        if (error) throw error;

        renderizarGrid(data || []);
    } catch (error) {
        console.error('Erro ao carregar movimentações:', error);
        gridBody.innerHTML = `<tr><td colspan="8" class="error-message">Erro ao carregar dados.</td></tr>`;
    }
}

// 🔍 Busca movimentações com base nos filtros
async function buscarMovimentacoes() {
    const marcaFogo = document.getElementById('campo-marca-fogo-busca')?.value.trim().toUpperCase();
    const placa = document.getElementById('campo-placa-busca')?.value.trim().toUpperCase();
    const operacao = document.getElementById('campo-operacao')?.value;

    try {
        let query = supabaseClient
            .from('movimentacoes_pneus')
            .select('*')
            .order('data', { ascending: false });

        if (marcaFogo) query = query.ilike('codigo_marca_fogo', `%${marcaFogo}%`);
        if (placa) query = query.ilike('placa', `%${placa}%`);
        if (operacao) query = query.eq('tipo_operacao', operacao);

        const { data, error } = await query;

        if (error) throw error;

        renderizarGrid(data || []);
    } catch (error) {
        console.error('Erro ao buscar movimentações:', error);
    }
}

// 🧹 Limpa os filtros de busca e recarrega a lista completa
function limparFiltrosBusca() {
    document.getElementById('campo-marca-fogo-busca').value = '';
    document.getElementById('campo-placa-busca').value = '';
    document.getElementById('campo-operacao').value = '';
    carregarMovimentacoes();
}

// 🧱 Renderiza os dados na tabela
function renderizarGrid(lista) {
    gridBody.innerHTML = '';

    if (lista.length === 0) {
        gridBody.innerHTML = `<tr><td colspan="8" class="no-results-message">Nenhuma movimentação encontrada.</td></tr>`;
        return;
    }

    lista.forEach(mov => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${mov.data ? new Date(mov.data).toLocaleString('pt-BR') : ''}</td>
            <td class="uppercase">${mov.codigo_marca_fogo}</td>
            <td>${mov.tipo_operacao || ''}</td>
            <td class="uppercase">${mov.placa || ''}</td>
            <td>${mov.quilometragem || ''}</td>
            <td>${mov.posicao_aplicacao || ''}</td>
            <td>${mov.usuario || ''}</td>
            <td class="actions-cell">
                <button class="btn-pneu-action delete" onclick="excluirMovimentacao(${mov.id}, '${mov.codigo_marca_fogo}')" title="Cancelar Movimentação">
                    <i class="fas fa-undo"></i>
                </button>
            </td>
        `;
        gridBody.appendChild(tr);
    });
}

// 🗑️ Exclui uma movimentação (cancela a operação)
window.excluirMovimentacao = async function(id, marcaFogo) {
    if (!confirm(`Tem certeza que deseja cancelar esta movimentação? O pneu "${marcaFogo}" retornará ao status "ESTOQUE".`)) {
        return;
    }

    try {
        // 1. Excluir o registro da movimentação
        const { error: deleteError } = await supabaseClient
            .from('movimentacoes_pneus')
            .delete()
            .eq('id', id);

        if (deleteError) throw deleteError;

        // 2. Atualizar o status do pneu de volta para 'ESTOQUE'
        const { error: updateError } = await supabaseClient
            .from('marcas_fogo_pneus')
            .update({ status_pneu: 'ESTOQUE' })
            .eq('codigo_marca_fogo', marcaFogo);

        if (updateError) throw updateError;

        alert('Movimentação cancelada com sucesso!');
        await carregarMovimentacoes();

    } catch (error) {
        console.error('Erro ao excluir movimentação:', error);
        alert(`Erro ao cancelar: ${error.message}`);
    }
};