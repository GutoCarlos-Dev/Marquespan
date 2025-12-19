import { supabaseClient as supabase } from './supabase.js';

// Variáveis globais para controle
let pneusSelecionados = [];
let pneusEstoque = [];

document.addEventListener('DOMContentLoaded', async () => {
    initEventListeners();
    await carregarPneusEstoque();
    
    // Inicializa a data com o momento atual
    const dataInput = document.getElementById('data_operacao');
    if(dataInput) {
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        dataInput.value = now.toISOString().slice(0, 16);
    }
});

function initEventListeners() {
    const tipoSaidaSelect = document.getElementById('tipo_saida');
    const btnAddBorracharia = document.getElementById('btn-add-lista-borracharia');
    const btnFiltrar = document.getElementById('btn-filtrar-estoque');
    const formSaida = document.getElementById('formSaida');

    // Evento principal: Mudança no Tipo de Saída
    if (tipoSaidaSelect) {
        tipoSaidaSelect.addEventListener('change', handleTipoSaidaChange);
    }

    // Botão de adicionar pneu à lista de borracharia
    if (btnAddBorracharia) {
        btnAddBorracharia.addEventListener('click', adicionarPneuListaBorracharia);
    }
    
    // Filtro de estoque
    if (btnFiltrar) {
        btnFiltrar.addEventListener('click', filtrarEstoque);
    }

    // Envio do formulário
    if (formSaida) {
        formSaida.addEventListener('submit', handleFormSubmit);
    }
}

/**
 * Controla a visibilidade dos campos baseado na seleção do Tipo de Saída
 */
function handleTipoSaidaChange(e) {
    const tipo = e.target.value;
    const camposVeiculo = document.getElementById('campos-veiculo-especificos');
    const camposBorracharia = document.getElementById('campos-borracharia-especificos');
    const formCard = document.getElementById('form-card');
    const btnAddBorracharia = document.getElementById('btn-add-lista-borracharia');
    const listaPneusContainer = document.getElementById('lista-pneus-selecionados-container');
    const posicoesCard = document.getElementById('posicoes-card');

    // 1. Esconde tudo primeiro (Reset)
    if (camposVeiculo) camposVeiculo.style.display = 'none';
    if (camposBorracharia) camposBorracharia.style.display = 'none';
    if (posicoesCard) posicoesCard.style.display = 'none';
    if (listaPneusContainer) listaPneusContainer.style.display = 'none';
    if (btnAddBorracharia) btnAddBorracharia.style.display = 'none';

    // 2. Se não tiver seleção, esconde o card principal
    if (tipo === '') {
        formCard.style.display = 'none';
        return;
    }

    // 3. Mostra o card do formulário
    formCard.style.display = 'block';

    // 4. Lógica específica por tipo
    if (tipo === 'BORRACHARIA') {
        if (camposBorracharia) camposBorracharia.style.display = 'block';
        if (btnAddBorracharia) btnAddBorracharia.style.display = 'inline-block'; // Mostra botão de adicionar
        if (listaPneusContainer) listaPneusContainer.style.display = 'block'; // Mostra a tabela de itens
    } else if (tipo === 'VEICULO') {
        if (camposVeiculo) camposVeiculo.style.display = 'block';
        // Aqui poderia carregar posições do veículo se a placa fosse selecionada
    }
}

/**
 * Carrega os pneus do Supabase que estão com status 'ESTOQUE'
 */
async function carregarPneusEstoque() {
    const gridBody = document.getElementById('estoque-grid-body');
    if (!gridBody) return;

    gridBody.innerHTML = '<div style="padding:10px;">Carregando estoque...</div>';

    try {
        const { data, error } = await supabase
            .from('marcas_fogo_pneus')
            .select(`
                id, 
                codigo_marca_fogo, 
                status_pneu,
                pneus (
                    marca, modelo, tipo, vida
                )
            `)
            .eq('status_pneu', 'ESTOQUE')
            .order('codigo_marca_fogo', { ascending: true });

        if (error) throw error;

        pneusEstoque = data || [];
        renderizarEstoque(pneusEstoque);

    } catch (error) {
        console.error('Erro ao carregar estoque:', error);
        gridBody.innerHTML = '<div style="padding:10px; color:red;">Erro ao carregar estoque.</div>';
    }
}

function renderizarEstoque(lista) {
    const gridBody = document.getElementById('estoque-grid-body');
    gridBody.innerHTML = '';

    if (lista.length === 0) {
        gridBody.innerHTML = '<div style="padding:10px;">Nenhum pneu encontrado no estoque.</div>';
        return;
    }

    lista.forEach(item => {
        const row = document.createElement('div');
        row.className = 'grid-row';
        row.style.cssText = 'display: flex; border-bottom: 1px solid #eee; padding: 8px 0; cursor: pointer; transition: background 0.2s; align-items: center;';
        row.onmouseover = () => row.style.background = '#f1f1f1';
        row.onmouseout = () => row.style.background = 'transparent';
        row.onclick = () => selecionarPneu(item);

        row.innerHTML = `
            <div style="flex: 0.5; text-align: center;"><i class="fas fa-plus-circle" style="color: #28a745;"></i></div>
            <div style="flex: 1;">${item.pneus?.marca || '-'}</div>
            <div style="flex: 1.5;">${item.pneus?.modelo || '-'}</div>
            <div style="flex: 0.8;">${item.pneus?.tipo || '-'}</div>
            <div style="flex: 0.5; text-align: center;">${item.pneus?.vida || '-'}</div>
            <div style="flex: 0.8; text-align: center;">1</div>
            <div style="flex: 1; text-align: center; font-weight: bold;">${item.codigo_marca_fogo}</div>
        `;
        gridBody.appendChild(row);
    });
}

function selecionarPneu(item) {
    // Preenche a área de "Pneu Selecionado"
    const painelSelecionado = document.getElementById('pneu-selecionado');
    painelSelecionado.style.display = 'block';
    
    document.getElementById('selecionado-marca').textContent = item.pneus?.marca;
    document.getElementById('selecionado-modelo').textContent = item.pneus?.modelo;
    document.getElementById('selecionado-tipo').textContent = item.pneus?.tipo;
    document.getElementById('selecionado-vida').textContent = item.pneus?.vida;
    document.getElementById('selecionado-quantidade').textContent = '1';
    document.getElementById('selecionado-codigo').textContent = item.codigo_marca_fogo;

    // Armazena o objeto completo no botão para facilitar a adição
    document.getElementById('btn-add-lista-borracharia').dataset.pneuJson = JSON.stringify(item);
    
    // Scroll suave até a área de seleção
    painelSelecionado.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function adicionarPneuListaBorracharia() {
    const btn = document.getElementById('btn-add-lista-borracharia');
    const pneuJson = btn.dataset.pneuJson;
    
    if (!pneuJson) {
        alert('Selecione um pneu na lista de estoque acima primeiro.');
        return;
    }
    const pneu = JSON.parse(pneuJson);
    
    // Verifica se já está na lista
    if (pneusSelecionados.some(p => p.id === pneu.id)) {
        alert('Este pneu já foi adicionado à lista.');
        return;
    }

    // Verifica quantidade limite informada no input
    const qtdInput = document.getElementById('quantidade_borracharia');
    const qtdLimite = parseInt(qtdInput.value) || 0;
    
    if (qtdLimite > 0 && pneusSelecionados.length >= qtdLimite) {
        alert(`Você definiu a quantidade como ${qtdLimite}. Não é possível adicionar mais pneus.`);
        return;
    }

    pneusSelecionados.push(pneu);
    atualizarTabelaSelecionados();
    
    // Limpa seleção visual
    document.getElementById('pneu-selecionado').style.display = 'none';
    btn.dataset.pneuJson = ""; // Limpa dados do botão
}

function atualizarTabelaSelecionados() {
    const tbody = document.getElementById('tbody-pneus-selecionados');
    tbody.innerHTML = '';
    
    pneusSelecionados.forEach((pneu, index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-weight:bold;">${pneu.codigo_marca_fogo}</td>
            <td>${pneu.pneus?.marca} / ${pneu.pneus?.modelo}</td>
            <td>${pneu.pneus?.tipo}</td>
            <td>
                <button type="button" onclick="removerPneuLista(${index})" style="color: #dc3545; border: 1px solid #dc3545; background: white; border-radius: 4px; cursor: pointer; padding: 2px 8px;">
                    <i class="fas fa-trash"></i> Remover
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    // Atualiza input hidden para envio (se for usar form submit tradicional)
    document.getElementById('pneus_selecionados_json').value = JSON.stringify(pneusSelecionados);
}

// Torna a função global para ser acessada pelo onclick do HTML
window.removerPneuLista = function(index) {
    pneusSelecionados.splice(index, 1);
    atualizarTabelaSelecionados();
}

function filtrarEstoque() {
    const marca = document.getElementById('filtro_marca').value;
    const modelo = document.getElementById('filtro_modelo').value;
    const tipo = document.getElementById('filtro_tipo').value;

    const filtrados = pneusEstoque.filter(item => {
        const matchMarca = !marca || item.pneus?.marca === marca;
        const matchModelo = !modelo || item.pneus?.modelo === modelo;
        const matchTipo = !tipo || item.pneus?.tipo === tipo;
        return matchMarca && matchModelo && matchTipo;
    });

    renderizarEstoque(filtrados);
}

async function handleFormSubmit(e) {
    e.preventDefault();
    const tipoSaida = document.getElementById('tipo_saida').value;
    
    if (tipoSaida === 'BORRACHARIA') {
        if (pneusSelecionados.length === 0) {
            alert('Por favor, adicione pelo menos um pneu à lista antes de salvar.');
            return;
        }
        
        // TODO: Implementar a gravação no Supabase aqui
        // Exemplo: Atualizar status para 'EM_BORRACHARIA' e criar log em 'movimentacoes_pneus'
        
        console.log('Enviando para borracharia:', pneusSelecionados);
        alert('Envio para borracharia registrado com sucesso! (Simulação)');
        
        // Limpar formulário
        limparFormulario();
    } else {
        alert('Funcionalidade em desenvolvimento para este tipo de saída.');
    }
}

window.limparFormulario = function() {
    document.getElementById('formSaida').reset();
    pneusSelecionados = [];
    atualizarTabelaSelecionados();
    // Dispara evento para resetar visibilidade
    document.getElementById('tipo_saida').dispatchEvent(new Event('change'));
}