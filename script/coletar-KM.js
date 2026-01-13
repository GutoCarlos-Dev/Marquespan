import { supabaseClient } from './supabase.js';

let itensColeta = [];
let veiculosCache = [];

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
    document.getElementById('formItemColeta').addEventListener('submit', adicionarItem);
    document.getElementById('btnSalvarColeta').addEventListener('click', salvarColetaCompleta);
    document.getElementById('tableBodyItens').addEventListener('click', removerItem);

    // Novos Listeners para Importar/Exportar
    document.getElementById('btnImportar').addEventListener('click', () => document.getElementById('importFile').click());
    document.getElementById('importFile').addEventListener('change', handleFileImport);
    document.getElementById('btnExportar').addEventListener('click', exportarExcel);

    // 5. Carregar Histórico
    await carregarHistorico();
    
    // Listeners do Histórico
    const btnUpdateHist = document.getElementById('btnAtualizarHistorico');
    if(btnUpdateHist) btnUpdateHist.addEventListener('click', carregarHistorico);
    
    const btnUpdateHistDesk = document.getElementById('btnAtualizarHistoricoDesktop');
    if(btnUpdateHistDesk) btnUpdateHistDesk.addEventListener('click', carregarHistorico);
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

function adicionarItem(e) {
    e.preventDefault();

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

    // Validação: Verifica se a placa já está na lista de itens desta sessão
    if (itensColeta.some(item => item.placa === placa)) {
        alert('Este veículo já foi adicionado à lista.');
        return;
    }

    // Validação simples
    if (kmAnterior && parseInt(kmAtual) < parseInt(kmAnterior)) {
        if (!confirm(`O KM Atual (${kmAtual}) é menor que o KM Anterior (${kmAnterior}). Deseja continuar mesmo assim?`)) {
            return;
        }
    }

    const item = {
        id: Date.now(), // ID temporário para UI
        placa,
        modelo,
        km_anterior: kmAnterior ? parseInt(kmAnterior) : null,
        km_atual: parseInt(kmAtual),
        km_proxima_troca: kmProxima ? parseInt(kmProxima) : null,
        observacao
    };

    itensColeta.push(item);
    renderizarTabela();
    
    // Limpar campos do item (mantendo foco na placa para inserção rápida)
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

    // Se estiver no modo mobile (modal existe e não está oculto), fecha o modal
    const modal = document.getElementById('modalLancamento');
    if (modal && !modal.classList.contains('hidden')) {
        modal.classList.add('hidden');
    }
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
            <td>
                <button class="btn-danger" data-index="${index}" style="padding: 5px 10px; border: none; border-radius: 4px; cursor: pointer;"><i class="fas fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function removerItem(e) {
    if (e.target.closest('button')) {
        const index = e.target.closest('button').dataset.index;
        itensColeta.splice(index, 1);
        renderizarTabela();
    }
}

async function salvarColetaCompleta() {
    if (itensColeta.length === 0) {
        alert('Adicione pelo menos um veículo à coleta.');
        return;
    }

    const dataColeta = document.getElementById('coletaData').value;
    const responsavel = document.getElementById('coletaResponsavel').value;

    // Verifica se estamos editando um lote existente (mesma data)
    // Se sim, removemos os registros antigos dessa data para substituir pelos novos
    // Isso evita duplicação ao editar um lote.
    const { error: deleteError } = await supabaseClient
        .from('coleta_km')
        .delete()
        .eq('data_coleta', dataColeta);

    if (deleteError) {
        console.error('Erro ao limpar registros antigos para atualização:', deleteError);
        // Continua mesmo com erro? Depende da regra de negócio. Por segurança, alertamos.
        if(!confirm('Houve um erro ao preparar a atualização. Deseja tentar salvar como novos registros?')) return;
    }

    // Prepara os dados para inserção (remove ID temporário)
    const dadosParaInserir = itensColeta.map(({ id, ...resto }) => ({
        ...resto,
        data_coleta: dataColeta,
        usuario: responsavel
    }));

    try {
        const { error } = await supabaseClient
            .from('coleta_km')
            .insert(dadosParaInserir);

        if (error) throw error;

        alert('Coleta de KM salva com sucesso!');
        itensColeta = [];
        renderizarTabela();
        carregarHistorico(); // Atualiza o histórico após salvar
        // Opcional: Limpar data ou manter
    } catch (error) {
        console.error('Erro ao salvar coleta:', error);
        alert('Erro ao salvar dados: ' + error.message);
    }
}

// --- Funções para Gerenciamento no Banco de Dados (Editar/Excluir) ---
// Estas funções estão prontas para serem usadas caso adicione uma listagem de histórico

async function carregarHistorico() {
    const tbody = document.getElementById('tableBodyHistorico');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 15px;">Carregando histórico...</td></tr>';

    try {
        // Busca as coletas ordenadas por data
        const { data, error } = await supabaseClient
            .from('coleta_km')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(20);

        if (error) throw error;

        tbody.innerHTML = '';

        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 15px;">Nenhum registro encontrado.</td></tr>';
            return;
        }

        // Agrupar por Data e Usuário
        const grupos = {};
        data.forEach(item => {
            // Chave de agrupamento: Data + Usuario
            const key = `${item.data_coleta}_${item.usuario}`;
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

        // Renderizar os grupos
        Object.values(grupos).forEach(grupo => {
            const tr = document.createElement('tr');
            
            // Formatar Data
            let dataDisplay = '-';
            if (grupo.data_coleta) {
                const dateObj = new Date(grupo.data_coleta);
                dataDisplay = dateObj.toLocaleDateString('pt-BR') + ' ' + dateObj.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});
            }

            tr.innerHTML = `
                <td data-label="Data">${dataDisplay}</td>
                <td data-label="Responsável">${grupo.usuario || '-'}</td>
                <td data-label="Qtd. Veículos" style="text-align: center;">${grupo.qtd}</td>
                <td data-label="Ações" style="text-align: right;">
                    <button type="button" class="btn-primary" style="padding: 6px 10px; margin-right: 5px;" onclick="carregarBatchParaEdicao('${grupo.data_coleta}')" title="Editar Lote"><i class="fas fa-edit"></i></button>
                    <button type="button" class="btn-danger" style="padding: 6px 10px;" onclick="excluirBatchColeta('${grupo.data_coleta}')" title="Excluir Lote"><i class="fas fa-trash"></i></button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        console.error('Erro ao carregar histórico:', error);
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color: red;">Erro ao carregar dados.</td></tr>';
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

        // Preenche o cabeçalho
        // Ajusta o formato da data para o input datetime-local (YYYY-MM-DDTHH:mm)
        const dataISO = new Date(data[0].data_coleta).toISOString().slice(0, 16);
        document.getElementById('coletaData').value = dataISO;
        document.getElementById('coletaResponsavel').value = data[0].usuario;

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

// Expor funções para uso global se necessário
window.atualizarColeta = atualizarColeta;
window.excluirColeta = excluirColeta;