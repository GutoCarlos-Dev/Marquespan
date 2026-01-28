import { supabaseClient } from './supabase.js';

const STORAGE_KEY_RASCUNHO = 'marquespan_coleta_km_rascunho';

let itensColeta = [];
let veiculosCache = [];
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
    document.getElementById('coletaData').addEventListener('change', salvarRascunho); // Salvar ao mudar data
    document.getElementById('formItemColeta').addEventListener('submit', handleItemSubmit);
    document.getElementById('btnSalvarColeta').addEventListener('click', salvarColetaCompleta);
    document.getElementById('btnCancelarColeta').addEventListener('click', cancelarColeta);
    document.getElementById('tableBodyItens').addEventListener('click', handleTableActions);
    document.getElementById('tableBodyItens').addEventListener('dblclick', (e) => {
        const row = e.target.closest('tr');
        if (!row) return;
        const btnEdit = row.querySelector('.btn-edit-item');
        if (btnEdit) {
            prepararEdicaoItem(btnEdit.dataset.index);
        }
    });

    // Novos Listeners para Importar/Exportar
    document.getElementById('btnImportar').addEventListener('click', () => document.getElementById('importFile').click());
    document.getElementById('importFile').addEventListener('change', handleFileImport);
    document.getElementById('btnExportar').addEventListener('click', exportarExcel);
    document.getElementById('btnExportarPDF')?.addEventListener('click', exportarPDF);

    // 5. Carregar Histórico
    await carregarHistorico();
    
    // Listeners do Histórico
    const btnUpdateHist = document.getElementById('btnAtualizarHistorico');
    if(btnUpdateHist) btnUpdateHist.addEventListener('click', carregarHistorico);
    
    const btnUpdateHistDesk = document.getElementById('btnAtualizarHistoricoDesktop');
    if(btnUpdateHistDesk) btnUpdateHistDesk.addEventListener('click', carregarHistorico);

    // 6. Tenta recuperar rascunho salvo (caso tenha caído a internet ou fechado a aba)
    carregarRascunho();

    // 7. Listeners de Ordenação
    document.querySelectorAll('th.sortable').forEach(th => {
        th.addEventListener('click', () => ordenarItens(th.dataset.sort));
    });
});

async function carregarVeiculos() {
    try {
        const { data, error } = await supabaseClient
            .from('veiculos')
            .select('placa, modelo, id')
            .eq('situacao', 'ativo') // Apenas veículos ativos
            .order('placa');

        if (error) throw error;

        veiculosCache = data;
        const datalist = document.getElementById('listaVeiculos');
        datalist.innerHTML = '';
        
        data.forEach(v => {
            const option = document.createElement('option');
            option.value = v.placa;
            datalist.appendChild(option);
        });
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

function renderizarTabela() {
    const tbody = document.getElementById('tableBodyItens');
    tbody.innerHTML = '';
    document.getElementById('contadorItens').textContent = itensColeta.length;

    itensColeta.forEach((item, index) => {
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
                    <button type="button" class="btn-primary btn-edit-item" data-index="${index}" title="Editar Item" style="padding: 5px 10px; border: none; border-radius: 4px; cursor: pointer;"><i class="fas fa-edit"></i></button>
                    <button type="button" class="btn-danger btn-delete-item" data-index="${index}" title="Remover Item" style="padding: 5px 10px; border: none; border-radius: 4px; cursor: pointer;"><i class="fas fa-trash"></i></button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
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

async function salvarColetaCompleta() {
    if (itensColeta.length === 0) {
        alert('Adicione pelo menos um veículo à coleta.');
        return;
    }

    const dataColetaInput = document.getElementById('coletaData').value;
    if (!dataColetaInput) return alert('Data inválida');
    
    // Usa o valor do input diretamente (Hora Local) pois o banco é TIMESTAMP WITHOUT TIME ZONE
    // Isso evita a conversão automática para UTC que estava adicionando 3 horas
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
        if(!confirm('Houve um erro ao preparar a atualização. Deseja tentar salvar como novos registros?')) return;
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
        
        alert('Coleta de KM salva com sucesso!');
        itensColeta = []; // Limpa a lista de itens em memória
        originalDataColeta = null; // Reseta a referência de edição para um novo lote
        renderizarTabela(); // Limpa a tabela na tela
        carregarHistorico(); // Atualiza o histórico após salvar
        limparRascunho(); // Remove o rascunho do localStorage, já que a coleta foi salva

    } catch (error) {
        console.error('Erro ao salvar coleta:', error);
        alert('Erro ao salvar dados: ' + error.message);
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

async function carregarHistorico() {
    const tbody = document.getElementById('tableBodyHistorico');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 15px;">Carregando histórico...</td></tr>';

    try {
        // Busca um número maior de coletas recentes para garantir que lotes completos sejam processados
        const { data, error } = await supabaseClient
            .from('coleta_km')
            .select('*')
            // Ordena pela data da coleta para agrupar os lotes mais recentes primeiro
            .order('data_coleta', { ascending: false }) 
            .limit(500); // Aumenta o limite para capturar vários lotes completos

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
        const lotesParaExibir = Object.values(grupos).slice(0, 20);

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
                <td data-label="Ações" style="text-align: right;">
                    <button type="button" class="btn-primary" style="padding: 6px 10px; margin-right: 5px;" onclick="carregarBatchParaEdicao('${grupo.data_coleta}')" title="Editar Lote"><i class="fas fa-edit"></i></button>
                    ${btnDelete}
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
    submitBtn.classList.remove('btn-primary');
    submitBtn.classList.add('btn-update');

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

function salvarRascunho() {
    const data = {
        dataColeta: document.getElementById('coletaData').value,
        responsavel: document.getElementById('coletaResponsavel').value,
        itens: itensColeta,
        originalDataColeta: originalDataColeta
    };
    localStorage.setItem(STORAGE_KEY_RASCUNHO, JSON.stringify(data));
    // Opcional: Feedback visual discreto
    // console.log('Rascunho salvo automaticamente.');
}

function carregarRascunho() {
    const saved = localStorage.getItem(STORAGE_KEY_RASCUNHO);
    if (saved) {
        try {
            const data = JSON.parse(saved);
            
            // Restaura cabeçalho se existir
            if (data.dataColeta) document.getElementById('coletaData').value = data.dataColeta;
            
            // Restaura itens
            if (data.itens && Array.isArray(data.itens) && data.itens.length > 0) {
                itensColeta = data.itens;
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
    localStorage.removeItem(STORAGE_KEY_RASCUNHO);
}

// Expor funções para uso global se necessário
window.atualizarColeta = atualizarColeta;
window.excluirColeta = excluirColeta;