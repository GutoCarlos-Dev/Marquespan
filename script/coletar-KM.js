import { supabaseClient } from './supabase.js';
import { registrarAuditoria } from './auditoria-utils.js';

const STORAGE_KEY_RASCUNHO = 'marquespan_coleta_km_rascunho';
const IS_MOBILE_COLETA_KM = Boolean(document.getElementById('listaVisualColetaKm'));

let itensColeta = [];
let veiculosCache = [];
let filtroMobileColetaKm = 'TODOS';
let salvandoColeta = false;
let originalDataColeta = null; // Armazena a data original do lote em edição
let currentSort = { key: null, asc: true }; // Estado da ordenação

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Verificar Login
    const usuario = JSON.parse(localStorage.getItem('usuarioLogado'));
    if (!usuario) {
        alert('Você precisa estar logado.');
        window.location.href = 'index.html';
        return;
    }
    document.getElementById('coletaResponsavel').value = usuario.nome || usuario.email;

    // 2. Definir Data Atual
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    document.getElementById('coletaData').value = now.toISOString().slice(0, 16);

    // 3. Carregar Veículos para o Datalist
    await carregarVeiculos();

    // 4. Event Listeners
    document.getElementById('itemPlaca').addEventListener('change', aoSelecionarPlaca);
    document.getElementById('coletaData').addEventListener('change', () => {
        salvarRascunho();
        carregarHistorico();
    }); // Salvar e atualizar histórico ao mudar data
    document.getElementById('formItemColeta').addEventListener('submit', handleItemSubmit);
    document.getElementById('btnSalvarColeta').addEventListener('click', salvarColetaCompleta);
    document.getElementById('btnSalvarColetaFlutuante')?.addEventListener('click', salvarColetaCompleta);
    document.getElementById('btnCancelarColeta')?.addEventListener('click', cancelarColeta);
    document.getElementById('tableBodyItens').addEventListener('click', handleTableActions);
    document.getElementById('tableBodyItens').addEventListener('dblclick', (e) => {
        const row = e.target.closest('tr');
        if (!row) return;
        const btnEdit = row.querySelector('.btn-edit-item');
        if (btnEdit) {
            prepararEdicaoItem(btnEdit.dataset.index);
        }
    });
    
    // Listener para busca na lista de itens coletados
    document.getElementById('searchItemColetado')?.addEventListener('input', renderizarTabela);
    configurarListaVisualMobile();

    // Novos Listeners para Importar/Exportar
    document.getElementById('btnImportar')?.addEventListener('click', () => document.getElementById('importFile').click());
    document.getElementById('importFile')?.addEventListener('change', handleFileImport);
    document.getElementById('btnExportar')?.addEventListener('click', exportarExcel);
    document.getElementById('btnExportarPDF')?.addEventListener('click', exportarPDF);

    // 5. Carregar Histórico
    carregarHistorico();
    
    // Listeners do Histórico
    document.getElementById('btnFiltrarHistorico')?.addEventListener('click', () => {
        const dataIni = document.getElementById('filtroHistoricoDataIni').value;
        const dataFim = document.getElementById('filtroHistoricoDataFim').value;
        carregarHistorico(dataIni, dataFim);
    });
    
    // Botões de Atualizar (limpam filtros e recarregam)
    const btnUpdateHist = document.getElementById('btnAtualizarHistorico');
    if(btnUpdateHist) btnUpdateHist.addEventListener('click', atualizarColeta);
    
    const btnUpdateHistDesk = document.getElementById('btnAtualizarHistoricoDesktop');
    if(btnUpdateHistDesk) btnUpdateHistDesk.addEventListener('click', atualizarColeta);

    // 6. Tenta recuperar rascunho salvo (caso tenha caído a internet ou fechado a aba)
    carregarRascunho();

    // 7. Listeners de Ordenação
    document.querySelectorAll('th.sortable').forEach(th => {
        th.addEventListener('click', () => ordenarItens(th.dataset.sort));
    });
});

async function carregarVeiculos() {
    try {
        const usuario = JSON.parse(localStorage.getItem('usuarioLogado') || 'null');
        let query = supabaseClient
            .from('veiculos')
            .select('placa, modelo, id, filial, tipo')
            .eq('situacao', 'ativo') // Apenas veículos ativos
            .order('placa');

        if (IS_MOBILE_COLETA_KM) {
            query = query.not('tipo', 'in', '("EMPILHADEIRA","GERADOR","SEMI-REBOQUE","HR/VAN")');
            if (usuario?.filial) query = query.eq('filial', usuario.filial);
        }

        const { data, error } = await query;
        if (error) throw error;

        veiculosCache = data || [];
        const datalist = document.getElementById('listaVeiculos');
        datalist.innerHTML = '';
        
        veiculosCache.forEach(v => {
            const option = document.createElement('option');
            option.value = v.placa;
            datalist.appendChild(option);
        });

        const filialLabel = document.getElementById('coletaKmFilial');
        if (filialLabel) filialLabel.textContent = usuario?.filial || 'Todas';
        renderizarListaVisualMobile();
    } catch (error) {
        console.error('Erro ao carregar veículos:', error);
        alert('Erro ao carregar lista de veículos.');
    }
}

async function aoSelecionarPlaca(e) {
    const inputPlaca = e.target;
    const placa = inputPlaca.value.trim().toUpperCase();

    inputPlaca.style.color = '';
    inputPlaca.style.fontWeight = '';

    if (!placa) return;

    if (itensColeta.some(item => item.placa === placa)) {
        inputPlaca.style.color = 'red';
        inputPlaca.style.fontWeight = 'bold';
    }

    // Buscar modelo no cache
    const veiculo = veiculosCache.find(v => v.placa === placa);
    if (veiculo) {
        document.getElementById('itemModelo').value = veiculo.modelo || '';
        
        // Buscar último KM registrado (opcional, requer tabela de histórico)
        await buscarUltimoKm(placa);
    } else {
        document.getElementById('itemModelo').value = '';
        document.getElementById('itemKmAnterior').value = '';
    }
}

async function buscarUltimoKm(placa) {
    // Tenta buscar o último KM registrado na tabela de coletas (se existir)
    // Caso não exista tabela, deixa em branco ou 0
    try {
        const { data, error } = await supabaseClient
            .from('coleta_km')
            .select('km_atual, data_coleta')
            .eq('placa', placa)
            .order('data_coleta', { ascending: false })
            .limit(1)
            .single();

        if (data) {
            document.getElementById('itemKmAnterior').value = data.km_atual;

            // Validação: Verifica se já existe coleta para esta placa na data selecionada
            const dataSelecionada = document.getElementById('coletaData').value;
            if (data.data_coleta === dataSelecionada) {
                alert(`O veículo ${placa} já possui uma coleta registrada nesta data (${dataSelecionada}).`);
                document.getElementById('itemPlaca').value = '';
                document.getElementById('itemModelo').value = '';
                document.getElementById('itemKmAnterior').value = '';
                setTimeout(() => document.getElementById('itemPlaca').focus(), 100);
            }
        } else {
            document.getElementById('itemKmAnterior').value = '';
        }
    } catch (err) {
        // Silencioso se não encontrar ou erro de tabela
        console.log('Nenhum histórico de KM encontrado ou erro na busca.', err);
        document.getElementById('itemKmAnterior').value = '';
    }
}

function handleItemSubmit(e) {
    e.preventDefault();

    const form = document.getElementById('formItemColeta');
    const editingIndex = form.dataset.editingIndex;

    const placa = document.getElementById('itemPlaca').value.trim().toUpperCase();
    const modelo = document.getElementById('itemModelo').value;
    const kmAnterior = document.getElementById('itemKmAnterior').value;
    const kmAtual = document.getElementById('itemKmAtual').value;
    const kmProxima = document.getElementById('itemKmProxima').value;
    const observacao = document.getElementById('itemObservacao').value;

    if (!placa || !kmAtual) {
        alert('Placa e KM Atual são obrigatórios.');
        return;
    }

    // Se não estiver editando, verifica se a placa já existe na lista
    if (editingIndex === undefined && itensColeta.some(item => item.placa === placa)) {
        alert('Este veículo já foi adicionado à lista.');
        return;
    }

    if (kmAnterior && parseInt(kmAtual) < parseInt(kmAnterior)) {
        if (!confirm(`O KM Atual (${kmAtual}) é menor que o KM Anterior (${kmAnterior}). Deseja continuar mesmo assim?`)) {
            return;
        }
    }

    const itemData = {
        placa,
        modelo,
        km_anterior: kmAnterior ? parseInt(kmAnterior) : null,
        km_atual: parseInt(kmAtual),
        km_proxima_troca: kmProxima ? parseInt(kmProxima) : null,
        observacao
    };

    if (editingIndex !== undefined) {
        // --- MODO DE ATUALIZAÇÃO ---
        const index = parseInt(editingIndex);
        itemData.id = itensColeta[index].id; // Mantém o ID temporário original
        itensColeta[index] = itemData;

        // Reseta o estado do formulário
        delete form.dataset.editingIndex;
        const submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn.dataset.originalHtml) {
            submitBtn.innerHTML = submitBtn.dataset.originalHtml;
            delete submitBtn.dataset.originalHtml;
        }
        submitBtn.classList.remove('btn-update');
        submitBtn.classList.add('btn-primary');

    } else {
        // --- MODO DE ADIÇÃO ---
        itemData.id = Date.now() + Math.random(); // ID temporário mais seguro
        itensColeta.push(itemData);
    }

    renderizarTabela();
    clearItemForm();
    salvarRascunho(); // Salva automaticamente

    // Fecha o modal no modo mobile, se estiver aberto
    const modal = document.getElementById('modalLancamento');
    if (modal && !modal.classList.contains('hidden')) {
        modal.classList.add('hidden');
    }
}

function clearItemForm() {
    const inputPlaca = document.getElementById('itemPlaca');
    inputPlaca.value = '';
    inputPlaca.style.color = '';
    inputPlaca.style.fontWeight = '';
    document.getElementById('itemModelo').value = '';
    document.getElementById('itemKmAnterior').value = '';
    document.getElementById('itemKmAtual').value = '';
    document.getElementById('itemKmProxima').value = '';
    document.getElementById('itemObservacao').value = '';
    document.getElementById('itemPlaca').focus();
}

function escapeHtmlColetaKm(valor) {
    return String(valor ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function configurarListaVisualMobile() {
    if (!IS_MOBILE_COLETA_KM) return;

    document.getElementById('searchPlacaColetaKm')?.addEventListener('input', renderizarListaVisualMobile);

    document.querySelectorAll('[data-km-filter]').forEach(botao => {
        botao.addEventListener('click', () => {
            document.querySelectorAll('[data-km-filter]').forEach(item => item.classList.remove('active'));
            botao.classList.add('active');
            filtroMobileColetaKm = botao.dataset.kmFilter || 'TODOS';
            renderizarListaVisualMobile();
        });
    });

    document.getElementById('listaVisualColetaKm')?.addEventListener('click', event => {
        const card = event.target.closest('[data-veiculo-placa]');
        if (card) abrirVeiculoColetaKm(card.dataset.veiculoPlaca);
    });
}

async function abrirVeiculoColetaKm(placa) {
    const index = itensColeta.findIndex(item => item.placa === placa);
    if (index >= 0) {
        prepararEdicaoItem(index);
        setTimeout(() => document.getElementById('itemKmAtual')?.focus(), 100);
        return;
    }

    const veiculo = veiculosCache.find(item => item.placa === placa);
    if (!veiculo) return;

    clearItemForm();
    const form = document.getElementById('formItemColeta');
    delete form.dataset.editingIndex;

    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.innerHTML = '<i class="fas fa-check"></i> CONFIRMAR KM';
    submitBtn.classList.remove('btn-update', 'btn-blue');
    submitBtn.classList.add('btn-primary');

    document.getElementById('itemPlaca').value = veiculo.placa;
    document.getElementById('itemModelo').value = veiculo.modelo || '';
    await buscarUltimoKm(veiculo.placa);

    document.getElementById('modalLancamento')?.classList.remove('hidden');
    setTimeout(() => document.getElementById('itemKmAtual')?.focus(), 100);
}

function renderizarListaVisualMobile() {
    if (!IS_MOBILE_COLETA_KM) return;

    const container = document.getElementById('listaVisualColetaKm');
    if (!container) return;

    const termo = document.getElementById('searchPlacaColetaKm')?.value.trim().toUpperCase() || '';
    const itensPorPlaca = new Map(itensColeta.map(item => [item.placa, item]));
    const total = veiculosCache.length;
    const feitos = veiculosCache.filter(veiculo => itensPorPlaca.has(veiculo.placa)).length;
    const pendentes = total - feitos;

    document.getElementById('countKmTodos').textContent = `(${total})`;
    document.getElementById('countKmPendentes').textContent = `(${pendentes})`;
    document.getElementById('countKmFeitos').textContent = `(${feitos})`;
    const contadorFlutuante = document.getElementById('fabSalvarContador');
    if (contadorFlutuante) contadorFlutuante.textContent = String(feitos);

    const veiculos = veiculosCache.filter(veiculo => {
        const feito = itensPorPlaca.has(veiculo.placa);
        const atendeStatus = filtroMobileColetaKm === 'TODOS'
            || (filtroMobileColetaKm === 'FEITO' && feito)
            || (filtroMobileColetaKm === 'PENDENTE' && !feito);
        const atendeBusca = !termo
            || String(veiculo.placa).toUpperCase().includes(termo)
            || String(veiculo.modelo || '').toUpperCase().includes(termo);
        return atendeStatus && atendeBusca;
    });

    if (!veiculos.length) {
        container.innerHTML = '<div class="coleta-km-vazio">Nenhum veiculo encontrado.</div>';
        return;
    }

    container.innerHTML = veiculos.map(veiculo => {
        const item = itensPorPlaca.get(veiculo.placa);
        const feito = Boolean(item);
        return `
            <button type="button"
                class="coleta-km-card ${feito ? 'feito' : 'pendente'}"
                data-veiculo-placa="${escapeHtmlColetaKm(veiculo.placa)}">
                <div class="coleta-km-card-topo">
                    <strong>${escapeHtmlColetaKm(veiculo.placa)}</strong>
                    <span class="coleta-km-status">
                        <i class="fas ${feito ? 'fa-check-circle' : 'fa-clock'}"></i>
                        ${feito ? 'FEITO' : 'PENDENTE'}
                    </span>
                </div>
                <div class="coleta-km-modelo">${escapeHtmlColetaKm(veiculo.modelo || 'Modelo nao informado')}</div>
                <div class="coleta-km-card-rodape">
                    ${feito
                        ? `<span>KM anterior: <b>${item.km_anterior ?? '-'}</b></span>
                           <span>KM atual: <b>${item.km_atual}</b></span>`
                        : '<span>Toque para coletar</span>'}
                    <i class="fas fa-chevron-right"></i>
                </div>
            </button>
        `;
    }).join('');
}

function renderizarTabela() {
    const tbody = document.getElementById('tableBodyItens');
    tbody.innerHTML = '';
    document.getElementById('contadorItens').textContent = itensColeta.length;
    
    const termoBusca = document.getElementById('searchItemColetado')?.value.trim().toUpperCase() || '';

    itensColeta.forEach((item, index) => {
        // Filtro de busca visual
        if (termoBusca && !item.placa.includes(termoBusca)) {
            return;
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td data-label="Placa">${item.placa}</td>
            <td data-label="Modelo">${item.modelo}</td>
            <td data-label="KM Anterior">${item.km_anterior || '-'}</td>
            <td data-label="KM Atual">${item.km_atual}</td>
            <td data-label="KM Próx. Troca">${item.km_proxima_troca || '-'}</td>
            <td data-label="Observação">${item.observacao || ''}</td>
            <td class="actions-cell">
                <div style="display: flex; gap: 5px; justify-content: center;">
                    <button type="button" class="btn-glass btn-blue btn-edit-item" data-index="${index}" title="Editar Item" style="padding: 8px 12px; min-width: 40px;"><i class="fas fa-edit"></i></button>
                    <button type="button" class="btn-glass btn-red btn-delete-item" data-index="${index}" title="Remover Item" style="padding: 8px 12px; min-width: 40px;"><i class="fas fa-trash"></i></button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    renderizarListaVisualMobile();
}

function handleTableActions(e) {
    const button = e.target.closest('button');
    if (!button) return;

    const index = button.dataset.index;

    if (button.classList.contains('btn-delete-item')) {
        itensColeta.splice(index, 1);
        renderizarTabela();
        salvarRascunho(); // Atualiza o rascunho ao deletar
    } else if (button.classList.contains('btn-edit-item')) {
        prepararEdicaoItem(index);
    }
}

async function salvarColetaCompleta(event) {
    if (salvandoColeta) return;
    const salvarParcial = event?.currentTarget?.id === 'btnSalvarColetaFlutuante';

    if (itensColeta.length === 0) {
        alert('Adicione pelo menos um veículo à coleta.');
        return;
    }

    const dataColetaInput = document.getElementById('coletaData').value;
    if (!dataColetaInput) return alert('Data inválida');
    
    // Usa o valor do input diretamente (Hora Local) pois o banco é TIMESTAMP WITHOUT TIME ZONE
    // Isso evita a conversão automática para UTC que estava adicionando 3 horas
    salvandoColeta = true;
    const botoesSalvar = [
        document.getElementById('btnSalvarColeta'),
        document.getElementById('btnSalvarColetaFlutuante')
    ].filter(Boolean);
    botoesSalvar.forEach(botao => {
        botao.disabled = true;
        botao.classList.add('salvando');
    });
    const liberarBotoesSalvar = () => {
        salvandoColeta = false;
        botoesSalvar.forEach(botao => {
            botao.disabled = false;
            botao.classList.remove('salvando');
        });
    };

    let dataColetaISO = dataColetaInput;
    if (dataColetaISO.length === 16) dataColetaISO += ':00';

    // Garante que o usuário salvo seja o atual logado, atualizando a autoria da edição
    const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado'));
    const responsavel = usuarioLogado ? (usuarioLogado.nome || usuarioLogado.email) : document.getElementById('coletaResponsavel').value;

    // Define qual data usar para exclusão (a original se for edição, ou a atual se for novo/sobrescrever)
    const dataParaExcluir = originalDataColeta || dataColetaISO;

    // Verifica se estamos editando um lote existente (mesma data)
    // Se sim, removemos os registros antigos dessa data para substituir pelos novos
    // Isso evita duplicação ao editar um lote.
    const { error: deleteError } = await supabaseClient
        .from('coleta_km')
        .delete()
        .eq('data_coleta', dataParaExcluir);

    if (deleteError) {
        console.error('Erro ao limpar registros antigos para atualização:', deleteError);
        // Continua mesmo com erro? Depende da regra de negócio. Por segurança, alertamos.
        if(!confirm('Houve um erro ao preparar a atualização. Deseja tentar salvar como novos registros?')) {
            liberarBotoesSalvar();
            return;
        }
    }

    // Prepara os dados para inserção (remove ID temporário)
    const dadosParaInserir = itensColeta.map(({ id, ...resto }) => ({
        ...resto,
        data_coleta: dataColetaISO,
        usuario: responsavel
    }));

    try {
        const { error } = await supabaseClient
            .from('coleta_km')
            .insert(dadosParaInserir);

        if (error) throw error;
        
        registrarAuditoria('INCLUIR', 'Coleta KM', `Inclusão de coleta de KM com ${dadosParaInserir.length} registros`);
        if (salvarParcial) {
            originalDataColeta = dataColetaISO;
            salvarRascunho();
            renderizarTabela();
            carregarHistorico();
            alert(`${dadosParaInserir.length} veiculos salvos. Continue a coleta.`);
        } else {
        alert('Coleta de KM salva com sucesso!');
        itensColeta = []; // Limpa a lista de itens em memória
        originalDataColeta = null; // Reseta a referência de edição para um novo lote
        renderizarTabela(); // Limpa a tabela na tela
        carregarHistorico(); // Atualiza o histórico após salvar
        limparRascunho(); // Remove o rascunho do localStorage, já que a coleta foi salva
        }

    } catch (error) {
        console.error('Erro ao salvar coleta:', error);
        alert('Erro ao salvar dados: ' + error.message);
    } finally {
        liberarBotoesSalvar();
    }
}

function cancelarColeta() {
    if (itensColeta.length > 0 || originalDataColeta) {
        if (confirm('Tem certeza que deseja cancelar a operação atual? Todas as alterações não salvas serão perdidas.')) {
            itensColeta = [];
            originalDataColeta = null;
            
            // Resetar data para o momento atual
            const now = new Date();
            now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
            document.getElementById('coletaData').value = now.toISOString().slice(0, 16);
            
            renderizarTabela();
            limparRascunho();
            clearItemForm();
        }
    }
}

// --- Funções para Gerenciamento no Banco de Dados (Editar/Excluir) ---
// Estas funções estão prontas para serem usadas caso adicione uma listagem de histórico

async function carregarHistorico(dataIni = null, dataFim = null) {
    const tbody = document.getElementById('tableBodyHistorico');
    if (!tbody) return;

    // Ajuste visual: Adiciona barra de rolagem ao container da tabela de histórico
    const tableContainer = tbody.closest('table')?.parentElement;
    if (tableContainer) {
        tableContainer.style.maxHeight = '400px';
        tableContainer.style.overflowY = 'auto';
    }

    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 15px;">Carregando histórico...</td></tr>';

    try {
        let query = supabaseClient
            .from('coleta_km')
            .select('*')
            .order('data_coleta', { ascending: false });

        // Aplica filtros de data se fornecidos
        if (dataIni) {
            query = query.gte('data_coleta', `${dataIni}T00:00:00`);
        }
        if (dataFim) {
            // Garante que inclua o dia inteiro até o último segundo
            query = query.lte('data_coleta', `${dataFim}T23:59:59`);
        }

        // Verifica se é a versão Mobile pela existência da classe específica no HTML
        const isMobile = document.querySelector('.mobile-container');
        const dataSelecionada = document.getElementById('coletaData').value;

        if (IS_MOBILE_COLETA_KM) {
            const placasFilial = veiculosCache.map(veiculo => veiculo.placa);
            query = query.in('placa', placasFilial.length ? placasFilial : ['__SEM_PLACAS__']);
        }
        
        // Aplica filtro de data APENAS se for Mobile (App)
        if (isMobile && dataSelecionada && !dataIni && !dataFim) {
            const dataIso = dataSelecionada.split('T')[0];
            query = query.gte('data_coleta', `${dataIso}T00:00:00`)
                         .lte('data_coleta', `${dataIso}T23:59:59`);
        }

        const { data, error } = await query;

        if (error) throw error;

        tbody.innerHTML = '';

        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 15px;">Nenhum registro encontrado.</td></tr>';
            return;
        }

        // Agrupar por Data e Usuário
        const grupos = {};
        data.forEach(item => {
            // Chave de agrupamento: A data da coleta, que é única para cada lote salvo.
            const key = item.data_coleta;
            if (!grupos[key]) {
                grupos[key] = {
                    data_coleta: item.data_coleta,
                    usuario: item.usuario,
                    qtd: 0,
                    ids: []
                };
            }
            grupos[key].qtd++;
            grupos[key].ids.push(item.id);
        });

        // Verifica nível do usuário para permissão de exclusão
        const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado'));
        const isAdmin = usuarioLogado && usuarioLogado.nivel && usuarioLogado.nivel.toLowerCase() === 'administrador';

        // Pega os 20 lotes mais recentes para exibir na tela
        const lotesParaExibir = Object.values(grupos); // Removido slice para mostrar todos

        // Renderizar os lotes agrupados
        lotesParaExibir.forEach(grupo => {
            const tr = document.createElement('tr');
            
            // Formatar Data
            let dataDisplay = '-';
            if (grupo.data_coleta) {
                const dateObj = new Date(grupo.data_coleta);
                dataDisplay = dateObj.toLocaleDateString('pt-BR') + ' ' + dateObj.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});
            }

            const btnDelete = isAdmin ? `<button type="button" class="btn-danger" style="padding: 6px 10px;" onclick="excluirBatchColeta('${grupo.data_coleta}')" title="Excluir Lote"><i class="fas fa-trash"></i></button>` : '';

            tr.innerHTML = `
                <td data-label="Data">${dataDisplay}</td>
                <td data-label="Responsável">${grupo.usuario || '-'}</td>
                <td data-label="Qtd. Veículos" style="text-align: center;">${grupo.qtd}</td>
                    <td data-label="Ações" class="actions-cell">
                        <div class="coleta-km-historico-acoes">
                            <button type="button" class="btn-glass btn-blue" onclick="carregarBatchParaEdicao('${grupo.data_coleta}')" title="Editar Lote" aria-label="Editar lote"><i class="fas fa-edit"></i></button>
                            ${btnDelete ? btnDelete.replace('btn-danger', 'btn-glass btn-red') : ''}
                        </div>
                    </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        console.error('Erro ao carregar histórico:', error);
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color: red;">Erro ao carregar dados.</td></tr>';
    }
}

function prepararEdicaoItem(index) {
    const item = itensColeta[index];
    if (!item) return;

    // Popula o formulário com os dados do item
    document.getElementById('itemPlaca').value = item.placa;
    document.getElementById('itemModelo').value = item.modelo;
    document.getElementById('itemKmAnterior').value = item.km_anterior || '';
    document.getElementById('itemKmAtual').value = item.km_atual || '';
    document.getElementById('itemKmProxima').value = item.km_proxima_troca || '';
    document.getElementById('itemObservacao').value = item.observacao || '';

    // Define o estado de edição no formulário
    const form = document.getElementById('formItemColeta');
    form.dataset.editingIndex = index;

    // Altera o botão para "Atualizar"
    const submitBtn = form.querySelector('button[type="submit"]');
    if (!submitBtn.dataset.originalHtml) {
        submitBtn.dataset.originalHtml = submitBtn.innerHTML; // Salva o conteúdo original do botão
    }
    submitBtn.innerHTML = '<i class="fas fa-sync-alt"></i> ATUALIZAR VEÍCULO';
    submitBtn.classList.remove('btn-green'); // Remove apenas a cor verde
    submitBtn.classList.add('btn-blue'); // Adiciona a cor azul, mantendo btn-glass

    // No modo mobile, abre o modal de lançamento
    const modal = document.getElementById('modalLancamento');
    if (modal) {
        modal.classList.remove('hidden');
        document.getElementById('itemPlaca').focus();
    } else {
        // No desktop, rola a tela até o formulário
        form.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

// Função para carregar um lote inteiro para edição na tabela principal
window.carregarBatchParaEdicao = async function(dataColeta) {
    try {
        // Busca todos os itens daquela data
        const { data, error } = await supabaseClient
            .from('coleta_km')
            .select('*')
            .eq('data_coleta', dataColeta);
            
        if (error) throw error;
        
        if (!data || data.length === 0) {
            alert('Nenhum item encontrado para esta data.');
            return;
        }

        // Armazena a data original para garantir que o lote correto seja atualizado/substituído
        originalDataColeta = dataColeta;

        // Preenche o cabeçalho com a DATA ATUAL para garantir que a edição salve com o horário do momento
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        const currentDataISO = now.toISOString().slice(0, 16);
        
        document.getElementById('coletaData').value = currentDataISO;
        // Não sobrescreve o responsável com o do lote antigo, mantém o usuário logado atual para indicar quem está editando
        // document.getElementById('coletaResponsavel').value = data[0].usuario;

        // Preenche a lista de itens
        itensColeta = data.map(item => ({
            id: item.id, // Mantém o ID original (embora ao salvar, deletaremos e criaremos novos para simplificar a lógica de lote)
            placa: item.placa,
            modelo: item.modelo,
            km_anterior: item.km_anterior,
            km_atual: item.km_atual,
            km_proxima_troca: item.km_proxima_troca,
            observacao: item.observacao
        }));

        renderizarTabela();
        salvarRascunho(); // Salva o lote carregado como rascunho atual
        
        // Scroll para o topo para ver os itens carregados
        window.scrollTo({ top: 0, behavior: 'smooth' });
        
        alert(`Lote carregado com ${itensColeta.length} itens. Faça as alterações e clique em "Salvar Coleta Completa" para atualizar.`);

    } catch (error) {
        console.error('Erro ao carregar lote:', error);
        alert('Erro ao carregar dados: ' + error.message);
    }
}

// Função para excluir um lote inteiro
window.excluirBatchColeta = async function(dataColeta) {
    if (!confirm('Tem certeza que deseja excluir TODO este lote de coletas? Esta ação não pode ser desfeita.')) return;

    try {
        const { error } = await supabaseClient
            .from('coleta_km')
            .delete()
            .eq('data_coleta', dataColeta);

        if (error) throw error;
        
        registrarAuditoria('EXCLUIR', 'Coleta KM', `Exclusão do lote de coleta de KM da data ${dataColeta}`);
        alert('Lote excluído com sucesso!');
        carregarHistorico();
    } catch (error) {
        console.error('Erro ao excluir lote:', error);
        alert('Erro ao excluir lote: ' + error.message);
    }
}

// --- Funções de Importação e Exportação ---

function handleFileImport(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const data = new Uint8Array(event.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const json = XLSX.utils.sheet_to_json(worksheet);

            if (json.length === 0) {
                alert('O arquivo está vazio.');
                return;
            }

            let importadosCount = 0;
            
            // Mapeamento e processamento
            json.forEach(row => {
                // Normaliza chaves para maiúsculo para evitar problemas de case
                const rowUpper = {};
                Object.keys(row).forEach(key => {
                    rowUpper[key.toUpperCase().trim()] = row[key];
                });

                const placa = (rowUpper['PLACA'] || '').trim().toUpperCase();
                
                // Validações básicas
                if (!placa) return;
                if (itensColeta.some(item => item.placa === placa)) return; // Evita duplicados na lista atual

                const item = {
                    id: Date.now() + Math.random(), // ID único temporário
                    placa: placa,
                    modelo: rowUpper['MODELO'] || '',
                    km_anterior: parseInt(rowUpper['KM_ANTERIOR']) || null,
                    km_atual: parseInt(rowUpper['KM_ATUAL']) || 0,
                    km_proxima_troca: parseInt(rowUpper['KM_PROXIMA_TROCA']) || null,
                    observacao: rowUpper['OBSERVAÇÃO'] || rowUpper['OBSERVACAO'] || ''
                };

                itensColeta.push(item);
                importadosCount++;
            });

            renderizarTabela();
            salvarRascunho(); // Salva importação no rascunho
            alert(`${importadosCount} registros importados com sucesso!`);
            
        } catch (error) {
            console.error('Erro na importação:', error);
            alert('Erro ao processar o arquivo. Verifique o formato.');
        } finally {
            e.target.value = ''; // Limpa o input para permitir importar o mesmo arquivo novamente
        }
    };
    reader.readAsArrayBuffer(file);
}

function exportarExcel() {
    if (itensColeta.length === 0) {
        alert('Não há dados para exportar.');
        return;
    }

    const dataColeta = document.getElementById('coletaData').value;
    let dataFormatada = dataColeta;
    if (dataColeta) {
        const dateObj = new Date(dataColeta);
        const dia = String(dateObj.getDate()).padStart(2, '0');
        const mes = String(dateObj.getMonth() + 1).padStart(2, '0');
        const ano = dateObj.getFullYear();
        const horas = String(dateObj.getHours()).padStart(2, '0');
        const minutos = String(dateObj.getMinutes()).padStart(2, '0');
        dataFormatada = `${dia}/${mes}/${ano} ${horas}:${minutos}`;
    }
    
    // Mapeia os dados para o formato solicitado
    const dadosExportacao = itensColeta.map(item => ({
        'DATA': dataFormatada, // Usa a data global selecionada
        'PLACA': item.placa,
        'MODELO': item.modelo,
        'KM_ANTERIOR': item.km_anterior || '',
        'KM_PROXIMA_TROCA': item.km_proxima_troca || '',
        'KM_ATUAL': item.km_atual,
        'OBSERVAÇÃO': item.observacao || ''
    }));

    const ws = XLSX.utils.json_to_sheet(dadosExportacao);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Lançamento KM");

    // Ajusta largura das colunas (opcional, mas bom para visualização)
    const wscols = [{wch:15}, {wch:10}, {wch:20}, {wch:15}, {wch:20}, {wch:15}, {wch:30}];
    ws['!cols'] = wscols;

    XLSX.writeFile(wb, `Lancamento_KM_${dataColeta}.xlsx`);
}

async function exportarPDF() {
    if (itensColeta.length === 0) {
        alert('Não há dados para exportar.');
        return;
    }

    if (!window.jspdf) {
        alert('Biblioteca PDF não carregada.');
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // Tenta carregar o logo
    try {
        const response = await fetch('logo.png');
        const blob = await response.blob();
        const reader = new FileReader();
        const base64data = await new Promise((resolve) => {
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
        });
        doc.addImage(base64data, 'PNG', 150, 10, 40, 15);
        const getLogoBase64 = async () => {
            return new Promise((resolve) => {
                const img = new Image();
                img.src = 'logo.png';
                img.crossOrigin = 'Anonymous';
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.width;
                    canvas.height = img.height;
                    const ctx = canvas.getContext('2d');
                    ctx.fillStyle = '#FFFFFF'; // Fundo branco
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(img, 0, 0);
                    resolve(canvas.toDataURL('image/jpeg'));
                };
                img.onerror = () => {
                    console.warn('Logo não encontrado');
                    resolve(null);
                };
            });
        };

        const logoBase64 = await getLogoBase64();
        if (logoBase64) {
            doc.addImage(logoBase64, 'JPEG', 150, 10, 40, 15);
        }
    } catch (e) {
        console.warn('Logo não carregado', e);
    }

    const dataColeta = document.getElementById('coletaData').value;
    const responsavel = document.getElementById('coletaResponsavel').value;
    
    let dataFormatada = dataColeta;
    if (dataColeta) {
        const d = new Date(dataColeta);
        dataFormatada = d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});
    }

    doc.setFontSize(18);
    doc.text('Relatório de Coleta de KM', 14, 22);
    
    doc.setFontSize(12);
    doc.text(`Data: ${dataFormatada}`, 14, 32);
    doc.text(`Responsável: ${responsavel}`, 14, 38);
    doc.text(`Total de Veículos: ${itensColeta.length}`, 14, 44);

    const tableColumn = ["Placa", "Modelo", "KM Ant.", "KM Atual", "Próx. Troca", "Observação"];
    const tableRows = itensColeta.map(item => [
        item.placa,
        item.modelo,
        item.km_anterior || '-',
        item.km_atual,
        item.km_proxima_troca || '-',
        item.observacao || ''
    ]);

    doc.autoTable({
        head: [tableColumn],
        body: tableRows,
        startY: 50,
        theme: 'grid',
        styles: { fontSize: 10, cellPadding: 2 },
        headStyles: { fillColor: [0, 105, 55] } // Marquespan Green
    });

    const fileName = `Coleta_KM_${dataColeta.replace(/[:]/g, '-')}.pdf`;
    doc.save(fileName);
}

// --- Funções de Ordenação ---

function ordenarItens(key) {
    if (currentSort.key === key) {
        currentSort.asc = !currentSort.asc;
    } else {
        currentSort.key = key;
        currentSort.asc = true;
    }

    itensColeta.sort((a, b) => {
        let valA = a[key];
        let valB = b[key];

        // Tratamento para números e strings
        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();
        if (valA == null) valA = '';
        if (valB == null) valB = '';

        if (valA < valB) return currentSort.asc ? -1 : 1;
        if (valA > valB) return currentSort.asc ? 1 : -1;
        return 0;
    });

    // Atualiza ícones
    document.querySelectorAll('th.sortable i').forEach(i => i.className = 'fas fa-sort');
    const activeTh = document.querySelector(`th[data-sort="${key}"] i`);
    if (activeTh) activeTh.className = currentSort.asc ? 'fas fa-sort-up' : 'fas fa-sort-down';

    renderizarTabela();
}

// --- Funções de Persistência Local (Rascunho Automático) ---

function getStorageKeyRascunho() {
    if (!IS_MOBILE_COLETA_KM) return STORAGE_KEY_RASCUNHO;

    const usuario = JSON.parse(localStorage.getItem('usuarioLogado') || 'null');
    const identificador = usuario?.id || usuario?.auth_user_id || usuario?.nome || 'usuario';
    const filial = usuario?.filial || 'todas';
    return `${STORAGE_KEY_RASCUNHO}_${identificador}_${filial}`;
}

function salvarRascunho() {
    const data = {
        dataColeta: document.getElementById('coletaData').value,
        responsavel: document.getElementById('coletaResponsavel').value,
        itens: itensColeta,
        originalDataColeta: originalDataColeta
    };
    localStorage.setItem(getStorageKeyRascunho(), JSON.stringify(data));
    // Opcional: Feedback visual discreto
    // console.log('Rascunho salvo automaticamente.');
}

function carregarRascunho() {
    const saved = localStorage.getItem(getStorageKeyRascunho());
    if (saved) {
        try {
            const data = JSON.parse(saved);
            
            // Restaura cabeçalho se existir
            if (data.dataColeta) document.getElementById('coletaData').value = data.dataColeta;
            
            // Restaura itens
            if (data.itens && Array.isArray(data.itens) && data.itens.length > 0) {
                itensColeta = IS_MOBILE_COLETA_KM
                    ? data.itens.filter(item => veiculosCache.some(veiculo => veiculo.placa === item.placa))
                    : data.itens;
                if (data.originalDataColeta) originalDataColeta = data.originalDataColeta;
                renderizarTabela();
                console.log('Rascunho restaurado com sucesso.');
            }
        } catch (e) {
            console.error('Erro ao restaurar rascunho:', e);
        }
    }
}

function limparRascunho() {
    localStorage.removeItem(getStorageKeyRascunho());
}

/**
 * Limpa os campos de filtro e recarrega o histórico inicial
 * Resolve o erro: atualizarColeta is not defined
 */
function atualizarColeta() {
    const inputIni = document.getElementById('filtroHistoricoDataIni');
    const inputFim = document.getElementById('filtroHistoricoDataFim');
    if (inputIni) inputIni.value = '';
    if (inputFim) inputFim.value = '';
    carregarHistorico();
}

/**
 * Atalho para exclusão de lote
 * Resolve o erro: excluirColeta is not defined
 */
function excluirColeta(dataColeta) {
    return excluirBatchColeta(dataColeta);
}

// Expor funções para uso global se necessário
window.atualizarColeta = atualizarColeta;
window.excluirColeta = excluirColeta;
