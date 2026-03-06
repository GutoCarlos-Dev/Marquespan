import { supabaseClient } from './supabase.js';

let veiculosAptosCache = [];
let currentListId = null;
let currentListStatus = 'ABERTA';
let currentListItems = []; // Itens da lista de detalhes
let sortStateNovaLista = { key: 'placa', asc: true }; // Estado de ordenação para o modal de nova lista
let sortStateAdicionar = { key: 'placa', asc: true }; // Estado de ordenação para o modal de adicionar veículo
let veiculosDisponiveisParaAdicao = []; // Cache filtrado para o modal de adicionar
let currentSort = { key: null, asc: true };
let precosCache = [];
let editingPriceId = null;
let sortStatePrecos = { key: 'tipoVeiculo', asc: true };

document.addEventListener('DOMContentLoaded', async () => {
    const usuario = JSON.parse(localStorage.getItem('usuarioLogado'));
    if (!usuario) { window.location.href = 'index.html'; return; }

    // Controle de Permissões: Ocultar abas para coleta_km
    if (usuario.nivel && usuario.nivel.toLowerCase() === 'coleta_km') {
        const tabsToHide = ['tab-precificacao', 'tab-relatorios'];
        tabsToHide.forEach(tabId => {
            const btn = document.querySelector(`.painel-btn[data-tab="${tabId}"]`);
            if (btn) btn.style.display = 'none';
        });
    }

    // Inject CSS for Pular Lavagem badge
    const style = document.createElement('style');
    style.innerHTML = `
        .badge-pular-lavagem {
            background-color: #6c757d !important; /* Cinza */
            color: white !important;
        }
    `;
    document.head.appendChild(style);

    // Init dates
    const hoje = new Date();
    const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    document.getElementById('filtroDataIni').value = inicioMes.toISOString().split('T')[0];
    document.getElementById('filtroDataFim').value = hoje.toISOString().split('T')[0];
    
    // Init dates for report
    document.getElementById('relDataIni').value = inicioMes.toISOString().split('T')[0];
    document.getElementById('relDataFim').value = hoje.toISOString().split('T')[0];

    // Tabs Logic
    document.querySelectorAll('.painel-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.painel-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
            btn.classList.add('active');
            document.getElementById(btn.dataset.tab).classList.remove('hidden');
        });
    });

    // Listeners
    const btnBuscar = document.getElementById('btnBuscar');
    if (btnBuscar) btnBuscar.addEventListener('click', carregarListas);

    const btnNovaLista = document.getElementById('btnNovaLista');
    if (btnNovaLista) {
        btnNovaLista.addEventListener('click', (e) => {
            e.preventDefault();
            abrirModalNovaLista();
        });
    }

    document.getElementById('btnCloseModalNovaLista')?.addEventListener('click', () => document.getElementById('modalNovaLista').classList.add('hidden'));
    document.getElementById('btnCancelarNovaLista')?.addEventListener('click', () => document.getElementById('modalNovaLista').classList.add('hidden'));
    document.getElementById('btnConfirmarCriacao')?.addEventListener('click', criarNovaLista);
    
    document.getElementById('filtroPlacaNovaLista').addEventListener('input', filtrarVeiculosModal);
    document.getElementById('filtroFilialNovaLista').addEventListener('change', filtrarVeiculosModal);
    document.getElementById('chkAllNovaLista').addEventListener('change', toggleAllVeiculos);
    const filtroSituacao = document.getElementById('filtroSituacaoNovaLista');
    if (filtroSituacao) filtroSituacao.addEventListener('change', filtrarVeiculosModal);

    // Setup Multiselect Tipo
    const displayTipo = document.getElementById('filtroTipoNovaListaDisplay');
    const optionsTipo = document.getElementById('filtroTipoNovaListaOptions');
    if (displayTipo && optionsTipo) {
        displayTipo.addEventListener('click', (e) => {
            e.stopPropagation();
            optionsTipo.style.display = optionsTipo.style.display === 'block' ? 'none' : 'block';
        });
        document.addEventListener('click', (e) => {
            if (!displayTipo.contains(e.target) && !optionsTipo.contains(e.target)) {
                optionsTipo.style.display = 'none';
            }
        });
        optionsTipo.addEventListener('change', () => {
            filtrarVeiculosModal();
            updateMultiselectText();
        });
    }

    document.getElementById('btnCloseModalDetalhes').addEventListener('click', () => document.getElementById('modalDetalhesLista').classList.add('hidden'));
    document.getElementById('btnFecharDetalhes')?.addEventListener('click', () => document.getElementById('modalDetalhesLista').classList.add('hidden'));
    document.getElementById('filtroDetalhesInput').addEventListener('input', filtrarItensDetalhes);
    document.getElementById('btnFinalizarLista').addEventListener('click', finalizarListaAtual);
    document.getElementById('btnExportarPDF').addEventListener('click', gerarPDFLista);

    // --- NOVOS LISTENERS PARA SELEÇÃO EM MASSA ---
    document.getElementById('chkAllDetalhes')?.addEventListener('change', toggleAllDetalhes);
    document.getElementById('tbodyDetalhesItens')?.addEventListener('change', (e) => {
        if (e.target.classList.contains('chk-item-detalhe')) {
            atualizarContadorSelecaoDetalhes();
        }
    });
    document.getElementById('btn-bulk-realizado')?.addEventListener('click', () => bulkSetStatus('REALIZADO'));
    document.getElementById('btn-bulk-pendente')?.addEventListener('click', () => bulkSetStatus('PENDENTE'));
    document.getElementById('btn-bulk-remover')?.addEventListener('click', bulkRemover);
    document.getElementById('btn-bulk-pular-lavagem')?.addEventListener('click', () => bulkSetStatus('PULAR_LAVAGEM'));
    document.getElementById('btn-bulk-aplicar-tipo')?.addEventListener('click', bulkAplicarTipo);
    document.getElementById('btn-bulk-agendar')?.addEventListener('click', bulkAgendar);

    // --- NOVOS LISTENERS PARA ADICIONAR VEÍCULO MANUALMENTE ---
    document.getElementById('btnAdicionarVeiculoDetalhes')?.addEventListener('click', abrirModalAdicionarVeiculo);
    document.getElementById('btnCloseModalAdicionarVeiculo')?.addEventListener('click', () => document.getElementById('modalAdicionarVeiculo').classList.add('hidden'));
    document.getElementById('btnConfirmarAdicao')?.addEventListener('click', adicionarVeiculosNaLista);
    document.getElementById('chkAllAdicionarVeiculo')?.addEventListener('change', (e) => {
        document.querySelectorAll('#tbodyAdicionarVeiculo .chk-veiculo-adicionar').forEach(chk => chk.checked = e.target.checked);
    });
    // Listeners para Busca e Ordenação no Modal Adicionar Veículo
    document.getElementById('searchAdicionarVeiculo')?.addEventListener('input', filtrarVeiculosAdicionar);
    document.querySelectorAll('.sortable-add').forEach(th => {
        th.addEventListener('click', () => ordenarVeiculosAdicionar(th.dataset.sort));
    });
    // Listeners para Ordenação na Tabela de Preços
    document.querySelectorAll('.sortable-preco').forEach(th => {
        th.addEventListener('click', () => ordenarPrecos(th.dataset.sort));
    });

    // Listeners de Ordenação
    document.querySelectorAll('#modalDetalhesLista th.sortable').forEach(th => {
        th.addEventListener('click', () => ordenarItensDetalhes(th.dataset.sort));
    });

    // Pricing Listeners
    document.getElementById('btnSalvarPreco')?.addEventListener('click', salvarPreco);
    document.getElementById('btnGerarRelatorio')?.addEventListener('click', gerarRelatorio);

    await carregarListas();
    await carregarPrecos();
    carregarTiposVeiculoParaPreco();
    // Injeta os campos de fornecedor na interface se não existirem
    injectFornecedorFields();
});

function updateMultiselectText() {
    const all = document.querySelectorAll('.tipo-checkbox');
    const checked = document.querySelectorAll('.tipo-checkbox:checked');
    const textSpan = document.getElementById('filtroTipoNovaListaText');
    if (checked.length === 0 || (all.length > 0 && checked.length === all.length)) {
        textSpan.textContent = 'Todos os Tipos';
    } else if (checked.length === 1) {
        textSpan.textContent = checked[0].value;
    } else {
        textSpan.textContent = `${checked.length} selecionados`;
    }
}

// Função auxiliar para injetar campos de Fornecedor na interface
function injectFornecedorFields() {
    // 1. Campo na Precificação
    const divPreco = document.getElementById('precoTipoVeiculo')?.parentNode;
    if (divPreco && !document.getElementById('precoFornecedor')) {
        const div = document.createElement('div');
        div.className = 'form-group';
        div.innerHTML = `<label>Fornecedor</label><input type="text" id="precoFornecedor" class="glass-input" placeholder="Ex: Lava Jato X" style="text-transform: uppercase;">`;
        divPreco.parentNode.insertBefore(div, divPreco);
    }

    // 2. Campo na Nova Lista
    const divNovaLista = document.getElementById('nomeNovaLista')?.parentNode;
    if (divNovaLista && !document.getElementById('novaListaFornecedor')) {
        const div = document.createElement('div');
        div.className = 'form-group';
        div.innerHTML = `<label>Fornecedor Padrão da Lista</label><select id="novaListaFornecedor" class="glass-input"><option value="">Selecione...</option></select>`;
        divNovaLista.parentNode.insertBefore(div, divNovaLista.nextSibling);
        atualizarDropdownFornecedores();
    }

    // 3. Campo ao Adicionar Veículo Manualmente
    const divAddVeiculo = document.getElementById('searchAdicionarVeiculo')?.parentNode;
    if (divAddVeiculo && !document.getElementById('adicionarVeiculoFornecedor')) {
        const div = document.createElement('div');
        div.className = 'form-group';
        div.style.marginBottom = '10px';
        div.innerHTML = `<label>Fornecedor para estes veículos</label><select id="adicionarVeiculoFornecedor" class="glass-input"><option value="">Selecione...</option></select>`;
        divAddVeiculo.parentNode.insertBefore(div, divAddVeiculo);
        atualizarDropdownFornecedores();
    }

    // 4. Adicionar coluna Fornecedor na tabela de Preços
    const tblPrecosHead = document.querySelector('#tbodyPrecos')?.previousElementSibling?.querySelector('tr');
    if (tblPrecosHead && !tblPrecosHead.innerHTML.includes('Fornecedor')) {
        const th = document.createElement('th');
        th.textContent = 'Fornecedor';
        th.className = 'sortable-preco';
        th.dataset.sort = 'fornecedor';
        tblPrecosHead.insertBefore(th, tblPrecosHead.children[0]); // Insere no início
    }

    // 5. Adicionar coluna Fornecedor na tabela de Detalhes da Lista
    const tblDetalhesHead = document.querySelector('#tbodyDetalhesItens')?.previousElementSibling?.querySelector('tr');
    if (tblDetalhesHead && !tblDetalhesHead.innerHTML.includes('Fornecedor')) {
        const th = document.createElement('th');
        th.textContent = 'Fornecedor';
        // Insere antes da coluna de Ações (última)
        tblDetalhesHead.insertBefore(th, tblDetalhesHead.lastElementChild);
    }
}

function atualizarDropdownFornecedores() {
    const selects = [
        document.getElementById('novaListaFornecedor'),
        document.getElementById('adicionarVeiculoFornecedor')
    ];

    const fornecedores = [...new Set(precosCache.map(p => p.fornecedor).filter(f => f))].sort();
    
    selects.forEach(select => {
        if (!select) return;
        
        const currentVal = select.value;
        select.innerHTML = '<option value="">Selecione...</option>';
        fornecedores.forEach(f => {
            const option = document.createElement('option');
            option.value = f;
            option.textContent = f;
            select.appendChild(option);
        });
        
        if (fornecedores.includes(currentVal)) {
            select.value = currentVal;
        }
    });
}

async function carregarListas() {
    const tbody = document.getElementById('tbodyListas');
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Carregando...</td></tr>';

    const dataIni = document.getElementById('filtroDataIni').value;
    const dataFim = document.getElementById('filtroDataFim').value;
    const status = document.getElementById('filtroStatus').value;

    try {
        let query = supabaseClient
            .from('lavagem_listas')
            .select('*, lavagem_itens(count)')
            .order('created_at', { ascending: false });

        if (dataIni) query = query.gte('data_lista', dataIni);
        if (dataFim) query = query.lte('data_lista', dataFim);
        if (status) query = query.eq('status', status);

        const { data, error } = await query;
        if (error) throw error;

        tbody.innerHTML = '';
        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Nenhuma lista encontrada.</td></tr>';
            return;
        }

        // Fetch items status for progress
        const listaIds = data.map(l => l.id);
        const { data: itensStatus } = await supabaseClient
            .from('lavagem_itens')
            .select('lista_id, status')
            .in('lista_id', listaIds);

        data.forEach(lista => {
            const itensDestaLista = itensStatus.filter(i => i.lista_id === lista.id);
            const total = itensDestaLista.filter(i => i.status !== 'PULAR_LAVAGEM').length;
            const realizados = itensDestaLista.filter(i => i.status === 'REALIZADO').length;
            const percent = total > 0 ? Math.round((realizados / total) * 100) : 0;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${new Date(lista.created_at).toLocaleDateString('pt-BR')}</td>
                <td>${lista.nome}</td>
                <td>${new Date(lista.data_lista + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
                <td><span class="badge badge-${lista.status.toLowerCase()}">${lista.status}</span></td>
                <td>
                    <div class="progress-bar-container" title="${realizados}/${total}">
                        <div class="progress-bar" style="width: ${percent}%"></div>
                    </div>
                    <small>${percent}%</small>
                </td>
                <td>
                    <button class="btn-icon edit" onclick="abrirDetalhesLista('${lista.id}', '${lista.nome}')"><i class="fas fa-folder-open"></i></button>
                    <button class="btn-icon pdf" onclick="gerarPDFListaPorId('${lista.id}', '${lista.nome}')" title="Gerar PDF" style="color: #dc3545;"><i class="fas fa-file-pdf"></i></button>
                    <button class="btn-icon delete" onclick="excluirLista('${lista.id}')"><i class="fas fa-trash"></i></button>
                </td>
            `;
            tbody.appendChild(tr);
        });

    } catch (error) {
        console.error(error);
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:red;">Erro ao carregar listas.</td></tr>';
    }
}

async function abrirModalNovaLista() {
    const modal = document.getElementById('modalNovaLista');
    const tbody = document.getElementById('tbodyVeiculosAptos');
    const dataInput = document.getElementById('dataDaLista');
    const nomeInput = document.getElementById('nomeNovaLista');
    
    if (!modal) return console.error('Modal não encontrado!');

    if (dataInput) {
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        dataInput.value = now.toISOString().slice(0, 10);
    }
    if (nomeInput) {
        const now = new Date();
        const currentYear = now.getFullYear();
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        const oneJan = new Date(currentYear, 0, 1);
        const days = Math.floor((now - oneJan) / (24 * 60 * 60 * 1000));
        const weekNum = Math.ceil((days + oneJan.getDay() + 1) / 7);
        nomeInput.value = `Lavagem Semana ${String(weekNum).padStart(2, '0')} - ${currentYear} de ${startOfWeek.toLocaleDateString('pt-BR')} á ${endOfWeek.toLocaleDateString('pt-BR')}`;
    }
    
    modal.classList.remove('hidden');
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Carregando veículos aptos...</td></tr>';

    const headers = modal.querySelectorAll('.glass-table th');
    const sortableColumns = {
        'PLACA': 'placa',
        'MODELO': 'modelo',
        'TIPO': 'tipo',
        'TIPO VEICULO': 'tipo',
        'MARCA': 'marca',
        'FILIAL': 'filial',
        'SITUAÇÃO': 'situacao'
    };

    headers.forEach(th => {
        const key = sortableColumns[th.textContent.trim().toUpperCase()];
        if (key) {
            th.dataset.sort = key;
            th.style.cursor = 'pointer';
            if (!th.querySelector('i')) {
                th.innerHTML += ' <i class="fas fa-sort" style="color: #aaa; float: right;"></i>';
            }
            th.onclick = () => ordenarVeiculosModal(key);
        }
    });
    updateSortIconsModal();

    try {
        const { data, error } = await supabaseClient
            .from('veiculos')
            .select('*')
            .in('situacao', ['ativo', 'INTERNADO'])
            .order('placa');

        if (error) throw error;

        veiculosAptosCache = data;
        
        const filiais = [...new Set(data.map(v => v.filial).filter(Boolean))].sort();
        const selectFilial = document.getElementById('filtroFilialNovaLista');
        selectFilial.innerHTML = '<option value="">Todas Filiais</option>';
        filiais.forEach(f => selectFilial.add(new Option(f, f)));

        // Popula filtro de situação
        let selectSituacao = document.getElementById('filtroSituacaoNovaLista');
        if (!selectSituacao && selectFilial && selectFilial.parentNode) {
            selectSituacao = document.createElement('select');
            selectSituacao.id = 'filtroSituacaoNovaLista';
            selectSituacao.className = selectFilial.className;
            selectSituacao.style.cssText = selectFilial.style.cssText;
            selectSituacao.style.marginLeft = '5px';
            selectFilial.insertAdjacentElement('afterend', selectSituacao);
            selectSituacao.addEventListener('change', filtrarVeiculosModal);
        }
        const situacoes = [...new Set(data.map(v => v.situacao).filter(Boolean))].sort();
        selectSituacao.innerHTML = '<option value="">Todas Situações</option>';
        situacoes.forEach(s => selectSituacao.add(new Option(s.toUpperCase(), s)));

        // Popula filtro de tipo
        const optionsContainer = document.getElementById('filtroTipoNovaListaOptions');
        if (optionsContainer) {
            const tipos = [...new Set(veiculosAptosCache.map(v => v.tipo).filter(Boolean))].sort();
            optionsContainer.innerHTML = '';
            
            const btnLimpar = document.createElement('div');
            btnLimpar.style.cssText = 'padding: 8px; cursor: pointer; color: #dc3545; font-weight: bold; border-bottom: 1px solid #eee; text-align: center; font-size: 0.9em;';
            btnLimpar.textContent = 'Limpar Seleção';
            btnLimpar.onclick = () => { 
                document.querySelectorAll('.tipo-checkbox').forEach(cb => cb.checked = false); 
                updateMultiselectText(); 
                filtrarVeiculosModal(); 
            };
            optionsContainer.appendChild(btnLimpar);

            tipos.forEach(t => {
                const label = document.createElement('label'); 
                label.style.cssText = 'display: block; padding: 5px 10px; cursor: pointer; font-size: 0.9em;';
                label.innerHTML = `<input type="checkbox" class="tipo-checkbox" value="${t}" style="margin-right: 8px;" checked> ${t}`;
                optionsContainer.appendChild(label);
            });
            updateMultiselectText();
        }

        renderizarVeiculosModal(veiculosAptosCache);

    } catch (error) {
        console.error(error);
        if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:red;">Erro ao carregar veículos.</td></tr>';
    }
}

function renderizarVeiculosModal(veiculos) {
    const tbody = document.getElementById('tbodyVeiculosAptos');
    tbody.innerHTML = '';
    
    if (veiculos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Nenhum veículo apto encontrado.</td></tr>';
        return;
    }

    veiculos.forEach(v => {
        const tr = document.createElement('tr');
        
        let statusBadge = '<span class="badge badge-realizado">APTO</span>';
        if (v.situacao === 'INTERNADO') {
            statusBadge = '<span class="badge" style="background-color: #007bff; color: white;">INTERNADO</span>';
        }

        tr.innerHTML = `
            <td style="text-align:center;"><input type="checkbox" class="chk-veiculo" value="${v.placa}" data-modelo="${v.modelo}" data-marca="${v.marca}" data-situacao="${v.situacao}"></td>
            <td><strong>${v.placa}</strong></td>
            <td>${v.tipo || '-'}</td>
            <td>${v.marca || '-'}</td>
            <td>${v.filial || '-'}</td>
            <td>${statusBadge}</td>
        `;
        tbody.appendChild(tr);
    });
    atualizarContadorSelecao();
}

function filtrarVeiculosModal() {
    const placaInput = document.getElementById('filtroPlacaNovaLista');
    const filialInput = document.getElementById('filtroFilialNovaLista');
    const situacaoInput = document.getElementById('filtroSituacaoNovaLista');
    
    const placa = placaInput ? placaInput.value.toUpperCase() : '';
    const filial = filialInput ? filialInput.value : '';
    const situacao = situacaoInput ? situacaoInput.value : '';
    const checkedTypes = Array.from(document.querySelectorAll('.tipo-checkbox:checked')).map(cb => cb.value);

    const filtrados = veiculosAptosCache.filter(v => {
        const matchPlaca = !placa || v.placa.includes(placa);
        const matchFilial = !filial || v.filial === filial;
        const matchSituacao = !situacao || v.situacao === situacao;
        const matchTipo = checkedTypes.length === 0 || checkedTypes.includes(v.tipo);
        return matchPlaca && matchFilial && matchTipo && matchSituacao;
    });

    renderizarVeiculosModal(filtrados);
}

function toggleAllVeiculos(e) {
    const checked = e.target.checked;
    document.querySelectorAll('.chk-veiculo').forEach(chk => chk.checked = checked);
    atualizarContadorSelecao();
}

function atualizarContadorSelecao() {
    const count = document.querySelectorAll('.chk-veiculo:checked').length;
    document.getElementById('contadorNovaLista').textContent = `${count} selecionado(s)`;
}

document.getElementById('tbodyVeiculosAptos').addEventListener('change', (e) => {
    if (e.target.classList.contains('chk-veiculo')) atualizarContadorSelecao();
});

function ordenarVeiculosModal(key) {
    if (sortStateNovaLista.key === key) {
        sortStateNovaLista.asc = !sortStateNovaLista.asc;
    } else {
        sortStateNovaLista.key = key;
        sortStateNovaLista.asc = true;
    }

    veiculosAptosCache.sort((a, b) => {
        let valA = a[key] || '';
        let valB = b[key] || '';
        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();
        if (valA < valB) return sortStateNovaLista.asc ? -1 : 1;
        if (valA > valB) return sortStateNovaLista.asc ? 1 : -1;
        return 0;
    });
    updateSortIconsModal();
    filtrarVeiculosModal();
}

function updateSortIconsModal() {
    document.querySelectorAll('#modalNovaLista th[data-sort] i').forEach(icon => {
        icon.className = 'fas fa-sort';
        icon.style.color = '#aaa';
    });
    const activeTh = document.querySelector(`#modalNovaLista th[data-sort="${sortStateNovaLista.key}"]`);
    if (activeTh) {
        const icon = activeTh.querySelector('i');
        if (icon) {
            icon.className = sortStateNovaLista.asc ? 'fas fa-sort-up' : 'fas fa-sort-down';
            icon.style.color = '#333';
        }
    }
}


async function criarNovaLista() {
    const nome = document.getElementById('nomeNovaLista').value;
    const dataLista = document.getElementById('dataDaLista').value;
    const fornecedor = document.getElementById('novaListaFornecedor')?.value?.toUpperCase() || null;
    const selecionados = Array.from(document.querySelectorAll('.chk-veiculo:checked')).map(chk => ({
        placa: chk.value,
        modelo: chk.dataset.modelo,
        marca: chk.dataset.marca,
        situacao: chk.dataset.situacao
    }));

    if (selecionados.length === 0) return alert('Selecione pelo menos um veículo.');
    if (!nome || !dataLista) return alert('Preencha nome e data.');

    const usuario = JSON.parse(localStorage.getItem('usuarioLogado')).nome;

    try {
        const { data: lista, error: errLista } = await supabaseClient
            .from('lavagem_listas')
            .insert([{
                nome,
                data_lista: dataLista,
                status: 'ABERTA',
                usuario_criacao: usuario,
                fornecedor: fornecedor
            }])
            .select()
            .single();

        if (errLista) throw errLista;

        const itens = selecionados.map(v => ({
            lista_id: lista.id,
            placa: v.placa,
            modelo: v.modelo,
            marca: v.marca,
            status: v.situacao === 'INTERNADO' ? 'INTERNADO' : 'PENDENTE',
            tipo_lavagem: null,
            fornecedor: fornecedor // Herda o fornecedor da lista
        }));

        const { error: errItens } = await supabaseClient
            .from('lavagem_itens')
            .insert(itens);

        if (errItens) throw errItens;

        alert('Lista criada com sucesso!');
        document.getElementById('modalNovaLista').classList.add('hidden');
        carregarListas();

    } catch (error) {
        console.error(error);
        alert('Erro ao criar lista: ' + error.message);
    }
}

window.abrirDetalhesLista = async function(id, nome) {
    currentListId = id;
    document.getElementById('tituloDetalhesLista').textContent = nome;
    document.getElementById('modalDetalhesLista').classList.remove('hidden');

    const selectBulkTipo = document.getElementById('select-bulk-tipo');
    if (selectBulkTipo) {
        const tiposLavagem = ['PADRÃO MARQUESPAN', 'HIGIENIZAÇÃO CABINE', 'CONDENSADORA-TK', 'LAVAGEM MOTOR', 'LAVAGEM CHASSI MANUT.'];
        selectBulkTipo.innerHTML = '<option value="">Aplicar tipo...</option>';
        tiposLavagem.forEach(t => {
            selectBulkTipo.add(new Option(t, t));
        });
    }

    const contadorSpan = document.getElementById('contador-selecionados-detalhes');
    if (contadorSpan) contadorSpan.textContent = '0 selecionados';
    const chkAll = document.getElementById('chkAllDetalhes');
    if (chkAll) chkAll.checked = false;

    const tbody = document.getElementById('tbodyDetalhesItens');
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Carregando itens...</td></tr>';

    try {
        const { data, error } = await supabaseClient
            .from('lavagem_itens')
            .select('*')
            .eq('lista_id', id)
            .order('placa');

        if (error) throw error;

        // Buscar status da lista para controle de UI
        const { data: listaInfo } = await supabaseClient.from('lavagem_listas').select('status').eq('id', id).single();
        currentListStatus = listaInfo ? listaInfo.status : 'ABERTA';
        updateModalState();

        // Buscar tipos de veículos para exibir na lista
        const placas = [...new Set(data.map(i => i.placa))];
        const veiculoMap = new Map();
        
        if (placas.length > 0) {
            const { data: veiculos, error: errVeiculos } = await supabaseClient
                .from('veiculos')
                .select('placa, tipo')
                .in('placa', placas);
            
            if (!errVeiculos && veiculos) {
                veiculos.forEach(v => veiculoMap.set(v.placa, v.tipo));
            }
        }

        currentListItems = data.map(item => ({
            ...item,
            tipo_veiculo: veiculoMap.get(item.placa) || '-'
        }));

        renderizarItensDetalhes(currentListItems);

    } catch (error) {
        console.error(error);
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:red;">Erro ao carregar itens.</td></tr>';
    }
}

function updateModalState() {
    const btnFinalizar = document.getElementById('btnFinalizarLista');
    const btnAdicionar = document.getElementById('btnAdicionarVeiculoDetalhes');
    const bulkActions = document.querySelector('.bulk-actions');
    
    if (currentListStatus === 'FINALIZADA') {
        if (btnFinalizar) {
            btnFinalizar.innerHTML = '<i class="fas fa-undo"></i> Reabrir Lista';
            btnFinalizar.className = 'btn-glass btn-red';
        }
        if (btnAdicionar) btnAdicionar.style.display = 'none';
        if (bulkActions) bulkActions.style.display = 'none';
    } else {
        if (btnFinalizar) {
            btnFinalizar.innerHTML = '<i class="fas fa-check-double"></i> Finalizar Lista';
            btnFinalizar.className = 'btn-glass btn-green';
        }
        if (btnAdicionar) btnAdicionar.style.display = 'inline-block';
        if (bulkActions) bulkActions.style.display = 'flex';
    }
}

function renderizarItensDetalhes(itens) {
    const tbody = document.getElementById('tbodyDetalhesItens');
    tbody.innerHTML = '';
    
    let realizados = 0;
    let pendentes = 0;
    let pulados = 0;
    let agendados = 0;
    let internados = 0;

    if (itens.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Nenhum item para exibir.</td></tr>';
        if(document.getElementById('countRealizados')) document.getElementById('countRealizados').textContent = 0;
        if(document.getElementById('countPendentes')) document.getElementById('countPendentes').textContent = 0;
        if(document.getElementById('countPulados')) document.getElementById('countPulados').textContent = 0;
        if(document.getElementById('countAgendados')) document.getElementById('countAgendados').textContent = 0;
        if(document.getElementById('countInternados')) document.getElementById('countInternados').textContent = 0;
        return;
    }

    const isFinalizada = currentListStatus === 'FINALIZADA';

    itens.forEach(item => {
        if (item.status === 'REALIZADO') realizados++;
        else if (item.status === 'AGENDADO') agendados++;
        else if (item.status === 'PULAR_LAVAGEM') pulados++;
        else if (item.status === 'INTERNADO') internados++;
        else pendentes++;

        const tr = document.createElement('tr');
        const tiposLavagem = ['PADRÃO MARQUESPAN', 'HIGIENIZAÇÃO CABINE', 'CONDENSADORA-TK', 'LAVAGEM MOTOR', 'LAVAGEM CHASSI MANUT.'];
        
        // Desabilita campos se o status for PULAR_LAVAGEM
        const isDisabled = item.status === 'PULAR_LAVAGEM' || item.status === 'INTERNADO' || isFinalizada;

        let options = '<option value="">Selecione...</option>';
        let found = false;
        tiposLavagem.forEach(t => {
            const isSelected = item.tipo_lavagem === t;
            if (isSelected) found = true;
            options += `<option value="${t}" ${isSelected ? 'selected' : ''}>${t}</option>`;
        });
        
        if (item.tipo_lavagem && !found) {
            options += `<option value="${item.tipo_lavagem}" selected>${item.tipo_lavagem}</option>`;
        }

        const dataRealizado = item.data_realizado ? new Date(item.data_realizado + (item.data_realizado.includes('T') ? '' : 'T00:00:00')).toLocaleDateString('pt-BR') : '-';
        
        let badgeClass = 'badge-pendente';
        if (item.status === 'REALIZADO') {
            badgeClass = 'badge-realizado';
        } else if (item.status === 'AGENDADO') {
            badgeClass = 'badge-agendado';
        } else if (item.status === 'PULAR_LAVAGEM') {
            badgeClass = 'badge-pular-lavagem';
        } else if (item.status === 'INTERNADO') {
            badgeClass = 'badge-internado';
        }

        tr.innerHTML = `
            <td style="text-align:center;"><input type="checkbox" class="chk-item-detalhe" value="${item.id}" ${isFinalizada ? 'disabled' : ''}></td>
            <td><strong>${item.placa}</strong></td>
            <td>${item.tipo_veiculo || '-'}</td>
            <td>${item.marca || '-'}</td>
            <td>
                <select class="select-tipo-lavagem" onchange="atualizarItem('${item.id}', 'tipo', this.value)" ${isDisabled ? 'disabled' : ''}>
                    ${options}
                </select>
            </td>
            <td>
                <span class="badge ${badgeClass}" 
                      style="${isDisabled ? 'cursor: default;' : 'cursor:pointer;'}" 
                      onclick="${isDisabled ? '' : `toggleStatusItem('${item.id}', '${item.status}')`}">
                    ${item.status}
                </span>
            </td>
            <td>${dataRealizado}</td>
            <td>${item.fornecedor || '-'}</td>
            <td>
                <button class="btn-icon delete" onclick="removerItemLista('${item.id}')" ${isFinalizada ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''}><i class="fas fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    if(document.getElementById('countRealizados')) document.getElementById('countRealizados').textContent = realizados;
    if(document.getElementById('countPendentes')) document.getElementById('countPendentes').textContent = pendentes;
    if(document.getElementById('countAgendados')) document.getElementById('countAgendados').textContent = agendados;
    if(document.getElementById('countPulados')) document.getElementById('countPulados').textContent = pulados;
    if(document.getElementById('countInternados')) document.getElementById('countInternados').textContent = internados;
    atualizarContadorSelecaoDetalhes();
}

async function gerarPDFLista() {
    if (!currentListId) return alert('Nenhuma lista selecionada.');
    const nomeElement = document.getElementById('tituloDetalhesLista');
    const nome = nomeElement ? nomeElement.textContent : 'Lista';
    // Passa a lista de itens atualmente exibida (e ordenada) para o gerador de PDF
    await gerarPDFListaPorId(currentListId, nome, currentListItems);
}

window.atualizarItem = async function(id, campo, valor) {
    try {
        const updateData = {};
        if (campo === 'tipo') updateData.tipo_lavagem = valor;

        const item = currentListItems.find(i => i.id === id);
        if (item && (item.status === 'PULAR_LAVAGEM' || item.status === 'INTERNADO')) {
            return alert(`Não é possível editar o tipo de lavagem de um item com status "${item.status}".`);
        }

        const { error } = await supabaseClient
            .from('lavagem_itens')
            .update(updateData)
            .eq('id', id);

        if (error) throw error;
        
        if (item && campo === 'tipo') item.tipo_lavagem = valor;

    } catch (error) {
        console.error(error);
        alert('Erro ao atualizar item.');
    }
}

window.toggleStatusItem = async function(id, statusAtual) {
    if (statusAtual === 'PULAR_LAVAGEM' || statusAtual === 'INTERNADO') {
        return alert(`Não é possível alterar o status de um item com "${statusAtual}". Remova-o e adicione novamente se necessário.`);
    }

    let novoStatus = 'PENDENTE';
    
    if (statusAtual === 'PENDENTE' || statusAtual === 'AGENDADO') {
        novoStatus = 'REALIZADO';
    } else if (statusAtual === 'REALIZADO') {
        novoStatus = 'PENDENTE';
    }

    const usuario = JSON.parse(localStorage.getItem('usuarioLogado')).nome;
    const dataRealizado = novoStatus === 'REALIZADO' ? new Date().toISOString() : null;

    if (novoStatus === 'REALIZADO') {
        const item = currentListItems.find(i => i.id === id);
        const select = document.querySelector(`select[onchange*="${id}"]`);
        const tipoSelecionado = select ? select.value : item.tipo_lavagem;
        
        if (!tipoSelecionado) {
            alert('Selecione o Tipo de Lavagem antes de marcar como Realizado.');
            return;
        }
    }

    try {
        const { error } = await supabaseClient
            .from('lavagem_itens')
            .update({
                status: novoStatus,
                data_realizado: dataRealizado,
                usuario_realizou: novoStatus === 'REALIZADO' ? usuario : null
            })
            .eq('id', id);

        if (error) throw error;

        const itemIndex = currentListItems.findIndex(i => i.id === id);
        if (itemIndex > -1) {
            currentListItems[itemIndex].status = novoStatus;
            currentListItems[itemIndex].data_realizado = dataRealizado;
        }
        renderizarItensDetalhes(currentListItems);

    } catch (error) {
        console.error(error);
        alert('Erro ao alterar status.');
    }
}

window.removerItemLista = async function(id) {
    if (!confirm('Remover este veículo da lista?')) return;
    try {
        await supabaseClient.from('lavagem_itens').delete().eq('id', id);
        currentListItems = currentListItems.filter(i => i.id !== id);
        renderizarItensDetalhes(currentListItems);
    } catch (error) {
        alert('Erro ao remover item.');
    }
}

function filtrarItensDetalhes() {
    const termo = document.getElementById('filtroDetalhesInput').value.toUpperCase();
    const filtrados = currentListItems.filter(i => i.placa.includes(termo));
    renderizarItensDetalhes(filtrados);
}

async function finalizarListaAtual() {
    if (currentListStatus === 'FINALIZADA') {
        if (!confirm('Deseja reabrir esta lista? Ela voltará a ser editável.')) return;
        try {
            const { error } = await supabaseClient.from('lavagem_listas').update({ status: 'ABERTA' }).eq('id', currentListId);
            if (error) throw error;
            alert('Lista reaberta!');
            currentListStatus = 'ABERTA';
            updateModalState();
            renderizarItensDetalhes(currentListItems);
            carregarListas();
        } catch (error) {
            alert('Erro ao reabrir lista: ' + error.message);
        }
        return;
    }

    if (!confirm('Deseja finalizar esta lista? Ao finalizar, os valores serão consolidados e não sofrerão alterações futuras.')) return;
    
    const btn = document.getElementById('btnFinalizarLista');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Finalizando...';

    try {
        // 1. Carregar itens e veículos para cálculo do snapshot
        const { data: itens, error: errItens } = await supabaseClient.from('lavagem_itens').select('*').eq('lista_id', currentListId);
        if (errItens) throw errItens;

        const placas = [...new Set(itens.map(i => i.placa))];
        const veiculoMap = new Map();
        if (placas.length > 0) {
            const { data: veiculos } = await supabaseClient.from('veiculos').select('placa, tipo').in('placa', placas);
            if (veiculos) veiculos.forEach(v => veiculoMap.set(v.placa, v.tipo));
        }

        if (precosCache.length === 0) await carregarPrecos();

        // 2. Calcular e salvar valor fixo para itens realizados
        const updates = itens.map(item => {
            if (item.status !== 'REALIZADO') return null;
            const tipoVeiculo = veiculoMap.get(item.placa) || 'DESCONHECIDO';
            let valorItem = 0;
            if (item.tipo_lavagem) {
                item.tipo_lavagem.split(',').map(t => t.trim()).forEach(tipo => {
                    // Busca preço considerando o fornecedor do item
                    const p = precosCache.find(x => 
                        x.tipoVeiculo === tipoVeiculo.toUpperCase() && 
                        x.tipoLavagem === tipo &&
                        (x.fornecedor === item.fornecedor || (!x.fornecedor && !item.fornecedor))
                    );
                    if (p) valorItem += p.valor;
                });
            }
            return supabaseClient.from('lavagem_itens').update({ valor: valorItem }).eq('id', item.id);
        }).filter(p => p !== null);

        if (updates.length > 0) await Promise.all(updates);

        await supabaseClient.from('lavagem_listas').update({ status: 'FINALIZADA' }).eq('id', currentListId);
        alert('Lista finalizada!');
        document.getElementById('modalDetalhesLista').classList.add('hidden');
        carregarListas();
    } catch (error) {
        console.error(error);
        alert('Erro ao finalizar lista: ' + error.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

window.excluirLista = async function(id) {
    if (!confirm('Excluir lista e todos os itens?')) return;
    try {
        await supabaseClient.from('lavagem_listas').delete().eq('id', id);
        carregarListas();
    } catch (error) {
        alert('Erro ao excluir lista.');
    }
}

window.gerarPDFListaPorId = async function(id, nomeLista, itensFromModal = null) {
    if (!window.jspdf) return alert('Biblioteca PDF não carregada.');
    
    try {
        let itens;
        // Se os itens foram passados pelo modal (já ordenados), usa-os.
        // Senão, busca no banco (chamada da lista principal).
        if (itensFromModal) {
            itens = itensFromModal;
        } else {
            const { data: fetchedItens, error } = await supabaseClient
                .from('lavagem_itens')
                .select('*')
                .eq('lista_id', id)
                .order('placa'); // Ordem padrão para PDF da lista principal

            if (error) throw error;
            itens = fetchedItens;
        }

        // O `tipo_veiculo` já vem nos `itensFromModal`. Se não vier, busca no banco.
        const placas = [...new Set(itens.map(i => i.placa))];
        let veiculoMap = new Map();
        
        if (placas.length > 0 && (!itens[0] || !itens[0].hasOwnProperty('tipo_veiculo'))) {
            const { data: veiculos, error: errVeiculos } = await supabaseClient.from('veiculos').select('placa, tipo').in('placa', placas);
            if (errVeiculos) throw errVeiculos;
            veiculos.forEach(v => veiculoMap.set(v.placa, v.tipo));
        }

        if (precosCache.length === 0) await carregarPrecos();

        let totalGeral = 0;
        const summary = {}; 
        const statusSummary = {};
        const fornecedorSummary = {}; // Resumo por Fornecedor
        const tipoVeiculoSummary = {}; // NEW: Resumo por Tipo de Veículo

        const rows = itens.map(item => {
            // Se `item.tipo_veiculo` existe, usa ele. Senão, busca no mapa.
            const tipoVeiculo = item.tipo_veiculo || veiculoMap.get(item.placa) || 'DESCONHECIDO';
            const tiposLavagemStr = item.tipo_lavagem;
            const fornecedor = item.fornecedor || 'NÃO INFORMADO';
            let valorItem = 0;

            // Contabiliza Status
            const statusKey = item.status || 'INDEFINIDO';
            if (!statusSummary[statusKey]) statusSummary[statusKey] = 0;
            statusSummary[statusKey]++;

            if (item.status === 'REALIZADO' && tiposLavagemStr) {
                const tipos = tiposLavagemStr.split(',').map(t => t.trim()).filter(t => t);
                let valorCalculado = 0;
                
                tipos.forEach(tipo => {
                    const precoObj = precosCache.find(p => 
                        p.tipoVeiculo === tipoVeiculo.toUpperCase() && 
                        p.tipoLavagem === tipo &&
                        (p.fornecedor === item.fornecedor || (!p.fornecedor && !item.fornecedor))
                    );
                    const valorTipo = precoObj ? precoObj.valor : 0;
                    valorCalculado += valorTipo;

                    if (!summary[tipo]) summary[tipo] = { qtd: 0, valor: 0 };
                    summary[tipo].qtd++;
                    summary[tipo].valor += valorTipo;
                });
                
                // Se existe valor salvo (snapshot), usa ele. Senão usa o calculado.
                if (item.valor !== undefined && item.valor !== null) {
                    valorItem = item.valor;
                } else {
                    valorItem = valorCalculado;
                }

                totalGeral += valorItem;

                // Contabiliza Fornecedor (apenas REALIZADO)
                if (!fornecedorSummary[fornecedor]) fornecedorSummary[fornecedor] = { qtd: 0, valor: 0 };
                fornecedorSummary[fornecedor].qtd++;
                fornecedorSummary[fornecedor].valor += valorItem;

                // NEW: Contabiliza Tipo de Veículo (apenas REALIZADO)
                if (!tipoVeiculoSummary[tipoVeiculo]) tipoVeiculoSummary[tipoVeiculo] = { qtd: 0, valor: 0 };
                tipoVeiculoSummary[tipoVeiculo].qtd++;
                tipoVeiculoSummary[tipoVeiculo].valor += valorItem;
            }

            return [
                item.placa,
                tipoVeiculo,
                item.marca || '',
                item.tipo_lavagem || '-',
                item.status,
                item.data_realizado ? new Date(item.data_realizado + (item.data_realizado.includes('T') ? '' : 'T00:00:00')).toLocaleDateString('pt-BR') : '-',
                valorItem > 0 ? `R$ ${valorItem.toLocaleString('pt-BR', {minimumFractionDigits: 2})}` : '-'
            ];
        });

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        // Logo com fundo branco
        try {
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
                        resolve(canvas.toDataURL('image/jpeg')); // Exporta como JPEG
                    };
                    img.onerror = () => resolve(null);
                });
            };
            const logoBase64 = await getLogoBase64();
            if (logoBase64) doc.addImage(logoBase64, 'JPEG', 14, 10, 40, 15);
        } catch (e) { console.warn('Logo não carregado', e); }

        doc.setFontSize(16);
        doc.setTextColor(0, 105, 55);
        doc.text('Relatório de Lavagem', 14, 35);
        
        doc.setFontSize(10);
        doc.setTextColor(0);
        doc.text(`Lista: ${nomeLista}`, 14, 42);
        doc.text(`Data de Emissão: ${new Date().toLocaleDateString('pt-BR')}`, 14, 48);

        const columns = ['Placa', 'Tipo', 'Marca', 'Tipo Lavagem', 'Status', 'Data', 'Valor'];

        doc.autoTable({
            head: [columns],
            body: rows,
            startY: 52,
            theme: 'grid',
            headStyles: { fillColor: [0, 105, 55], fontSize: 8 },
            styles: { fontSize: 7, cellPadding: 1.5 },
            columnStyles: {
                6: { halign: 'right' }
            },
            alternateRowStyles: { fillColor: [240, 240, 240] },
            margin: { left: 10, right: 10 },
            didParseCell: function(data) {
                if (data.section === 'body' && data.column.index === 4) { // Coluna 'Status'
                    const status = data.cell.raw;
                    let textColor;

                    switch (status) {
                        case 'REALIZADO':
                            textColor = [40, 167, 69]; // #28a745
                            break;
                        case 'PENDENTE':
                            textColor = [220, 53, 69]; // #dc3545
                            break;
                        case 'AGENDADO':
                            textColor = [255, 193, 7]; // #ffc107
                            break;
                        case 'INTERNADO':
                            textColor = [0, 123, 255]; // #007bff
                            break;
                        case 'PULAR_LAVAGEM':
                            textColor = [108, 117, 125]; // #6c757d
                            break;
                        default:
                            break;
                    }

                    if (textColor) {
                        data.cell.styles.textColor = textColor;
                        data.cell.styles.fontStyle = 'bold';
                        data.cell.styles.halign = 'center';
                    }
                }
            }
        });

        let finalY = doc.lastAutoTable.finalY + 10;

        const summaryRows = Object.keys(summary).map(tipo => [
            tipo,
            summary[tipo].qtd,
            `R$ ${summary[tipo].valor.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`
        ]);

        const statusRows = Object.keys(statusSummary).map(status => [
            status,
            statusSummary[status]
        ]);

        const fornecedorRows = Object.keys(fornecedorSummary).map(f => [
            f,
            fornecedorSummary[f].qtd,
            `R$ ${fornecedorSummary[f].valor.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`
        ]);

        const tipoVeiculoRows = Object.keys(tipoVeiculoSummary).map(tv => [
            tv,
            tipoVeiculoSummary[tv].qtd,
            `R$ ${tipoVeiculoSummary[tv].valor.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`
        ]);

        if (finalY + 40 > 280) {
            doc.addPage();
            finalY = 20;
        }

        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        
        // --- LINHA 1 ---
        doc.text('Resumo Financeiro:', 14, finalY);
        doc.text('Resumo Status:', 120, finalY);
        
        const startYRow1 = finalY + 2;

        // Tabela 1: Resumo Financeiro (Esquerda)
        doc.autoTable({
            head: [['Tipo Lavagem', 'QTD', 'Valor']],
            body: summaryRows,
            startY: startYRow1,
            theme: 'grid',
            headStyles: { fillColor: [100, 100, 100], fontSize: 8 },
            styles: { fontSize: 8 },
            columnStyles: {
                1: { halign: 'center' },
                2: { halign: 'right' }
            },
            margin: { left: 14 },
            tableWidth: 100
        });
        const finalYFinanceiro = doc.lastAutoTable.finalY;

        // Tabela 2: Resumo Status (Direita)
        doc.autoTable({
            head: [['Status', 'QTD']],
            body: statusRows,
            startY: startYRow1,
            theme: 'grid',
            headStyles: { fillColor: [100, 100, 100], fontSize: 8 },
            styles: { fontSize: 8 },
            columnStyles: {
                1: { halign: 'center' }
            },
            margin: { left: 120 },
            tableWidth: 80
        });
        const finalYStatus = doc.lastAutoTable.finalY;
        
        // Calcula Y para a próxima linha
        finalY = Math.max(finalYFinanceiro, finalYStatus) + 10;

        if (finalY + 40 > 280) {
            doc.addPage();
            finalY = 20;
        }

        // --- LINHA 2 ---
        doc.text('Resumo por Tipo de Veículo (Realizados):', 14, finalY);
        doc.text('Resumo por Fornecedor:', 120, finalY);

        const startYRow2 = finalY + 2;

        // Tabela 3: Resumo por Tipo de Veículo (Esquerda)
        doc.autoTable({
            head: [['Tipo Veículo', 'QTD', 'Valor']],
            body: tipoVeiculoRows,
            startY: startYRow2,
            theme: 'grid',
            headStyles: { fillColor: [100, 100, 100], fontSize: 8 },
            styles: { fontSize: 8 },
            columnStyles: {
                1: { halign: 'center' },
                2: { halign: 'right' }
            },
            margin: { left: 14 },
            tableWidth: 100
        });
        const finalYTipoVeiculo = doc.lastAutoTable.finalY;

        // Tabela 4: Resumo por Fornecedor (Direita)
        doc.autoTable({
            head: [['Fornecedor', 'QTD', 'Valor']],
            body: fornecedorRows,
            startY: startYRow2,
            theme: 'grid',
            headStyles: { fillColor: [100, 100, 100], fontSize: 8 },
            styles: { fontSize: 8 },
            columnStyles: {
                1: { halign: 'center' },
                2: { halign: 'right' }
            },
            margin: { left: 120 },
            tableWidth: 80
        });
        const finalYFornecedor = doc.lastAutoTable.finalY;

        finalY = Math.max(finalYTipoVeiculo, finalYFornecedor) + 10;

        doc.setFontSize(12);
        doc.setTextColor(0, 105, 55);
        doc.text(`Valor Total Geral: R$ ${totalGeral.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`, 14, finalY);

        finalY += 30;
        if (finalY > 270) {
            doc.addPage();
            finalY = 40;
        }

        doc.setDrawColor(0);
        doc.line(110, finalY, 196, finalY);
        doc.setFontSize(9);
        doc.setTextColor(0);
        doc.setFont(undefined, 'normal');
        doc.text('DATA: _____/_____/________', 14, finalY);
        doc.text('Assinatura do Responsável', 110, finalY + 5);

        doc.save(`Lavagem_${nomeLista.replace(/[^a-z0-9]/gi, '_')}.pdf`);

    } catch (error) {
        console.error('Erro ao gerar PDF:', error);
        alert('Erro ao gerar PDF: ' + error.message);
    }
}

function getSelectedIds() {
    return Array.from(document.querySelectorAll('.chk-item-detalhe:checked')).map(chk => chk.value);
}

function atualizarContadorSelecaoDetalhes() {
    const count = getSelectedIds().length;
    const contadorSpan = document.getElementById('contador-selecionados-detalhes');
    if (contadorSpan) {
        contadorSpan.textContent = `${count} selecionado(s)`;
    }
}

function toggleAllDetalhes(e) {
    const checked = e.target.checked;
    document.querySelectorAll('#tbodyDetalhesItens tr').forEach(tr => {
        const chk = tr.querySelector('.chk-item-detalhe');
        if (chk) {
            chk.checked = checked;
        }
    });
    atualizarContadorSelecaoDetalhes();
}

async function bulkSetStatus(novoStatus) {
    const ids = getSelectedIds();
    if (ids.length === 0) {
        return alert('Nenhum item selecionado.');
    }

    if (novoStatus === 'PULAR_LAVAGEM') {
        if (!confirm(`Deseja marcar ${ids.length} item(ns) como "PULAR LAVAGEM"? Itens com este status não poderão ser editados.`)) return;
    }

    if (novoStatus === 'REALIZADO') {
        for (const id of ids) {
            const item = currentListItems.find(i => i.id == id);
            if (!item.tipo_lavagem) {
                alert(`O veículo ${item.placa} não possui um tipo de lavagem definido. Não é possível marcá-lo como "Realizado".`);
                return;
            }
        }
    }

    if (!confirm(`Deseja alterar o status de ${ids.length} item(ns) para "${novoStatus}"?`)) {
        return;
    }

    const usuario = JSON.parse(localStorage.getItem('usuarioLogado')).nome;
    const dataRealizado = novoStatus === 'REALIZADO' ? new Date().toISOString() : null;

    try {
        const { error } = await supabaseClient
            .from('lavagem_itens')
            .update({
                status: novoStatus,
                data_realizado: dataRealizado,
                usuario_realizou: novoStatus === 'REALIZADO' ? usuario : null,
                tipo_lavagem: novoStatus === 'PULAR_LAVAGEM' ? null : undefined
            })
            .in('id', ids);

        if (error) throw error;

        ids.forEach(id => {
            const itemIndex = currentListItems.findIndex(i => i.id == id);
            if (itemIndex > -1) {
                currentListItems[itemIndex].status = novoStatus;
                currentListItems[itemIndex].data_realizado = dataRealizado;
                if (novoStatus === 'PULAR_LAVAGEM') {
                    currentListItems[itemIndex].tipo_lavagem = null;
                }
            }
        });
        renderizarItensDetalhes(currentListItems);
        alert('Status atualizado com sucesso!');

    } catch (error) {
        console.error('Erro ao atualizar status em massa:', error);
        alert('Erro ao atualizar status: ' + error.message);
    }
}

async function bulkRemover() {
    const ids = getSelectedIds();
    if (ids.length === 0) {
        return alert('Nenhum item selecionado.');
    }

    if (!confirm(`Deseja remover ${ids.length} item(ns) da lista?`)) {
        return;
    }

    try {
        const { error } = await supabaseClient
            .from('lavagem_itens')
            .delete()
            .in('id', ids);

        if (error) throw error;

        currentListItems = currentListItems.filter(i => !ids.includes(String(i.id)));
        renderizarItensDetalhes(currentListItems);
        alert('Itens removidos com sucesso!');

    } catch (error) {
        console.error('Erro ao remover em massa:', error);
        alert('Erro ao remover itens: ' + error.message);
    }
}

async function bulkAplicarTipo() {
    const ids = getSelectedIds();
    const tipo = document.getElementById('select-bulk-tipo').value;

    if (ids.length === 0) return alert('Nenhum item selecionado.');
    if (!tipo) return alert('Selecione um tipo de lavagem para aplicar.');
    if (!confirm(`Deseja aplicar o tipo "${tipo}" para ${ids.length} item(ns)?`)) return;

    try {
        const { error } = await supabaseClient.from('lavagem_itens').update({ tipo_lavagem: tipo }).in('id', ids);
        if (error) throw error;

        ids.forEach(id => {
            const itemIndex = currentListItems.findIndex(i => i.id == id);
            if (itemIndex > -1) currentListItems[itemIndex].tipo_lavagem = tipo;
        });
        renderizarItensDetalhes(currentListItems);
        alert('Tipo de lavagem aplicado com sucesso!');

    } catch (error) {
        console.error('Erro ao aplicar tipo em massa:', error);
        alert('Erro ao aplicar tipo: ' + error.message);
    }
}

async function bulkAgendar() {
    const ids = getSelectedIds();
    const dataAgendamento = document.getElementById('dataAgendamentoBulk').value;

    if (ids.length === 0) return alert('Nenhum item selecionado.');
    if (!dataAgendamento) return alert('Selecione uma data para o agendamento.');

    const [ano, mes, dia] = dataAgendamento.split('-');
    if (!confirm(`Deseja agendar ${ids.length} item(ns) para ${dia}/${mes}/${ano}?`)) return;

    try {
        const { error } = await supabaseClient
            .from('lavagem_itens')
            .update({ 
                status: 'AGENDADO',
                data_realizado: dataAgendamento
            })
            .in('id', ids);

        if (error) throw error;

        ids.forEach(id => {
            const itemIndex = currentListItems.findIndex(i => i.id == id);
            if (itemIndex > -1) {
                currentListItems[itemIndex].status = 'AGENDADO';
                currentListItems[itemIndex].data_realizado = dataAgendamento;
            }
        });
        renderizarItensDetalhes(currentListItems);
        alert('Agendamento realizado com sucesso!');

    } catch (error) {
        console.error('Erro ao agendar em massa:', error);
        alert('Erro ao agendar: ' + error.message);
    }
}

function ordenarItensDetalhes(key) {
    if (currentSort.key === key) {
        currentSort.asc = !currentSort.asc;
    } else {
        currentSort.key = key;
        currentSort.asc = true;
    }

    currentListItems.sort((a, b) => {
        const sortKey = key === 'modelo' ? 'tipo_veiculo' : key;
        let valA = a[sortKey] || '';
        let valB = b[sortKey] || '';

        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();

        if (valA < valB) return currentSort.asc ? -1 : 1;
        if (valA > valB) return currentSort.asc ? 1 : -1;
        return 0;
    });

    document.querySelectorAll('#modalDetalhesLista th.sortable i').forEach(i => i.className = 'fas fa-sort');
    const activeTh = document.querySelector(`#modalDetalhesLista th[data-sort="${key}"] i`);
    if (activeTh) activeTh.className = currentSort.asc ? 'fas fa-sort-up' : 'fas fa-sort-down';

    renderizarItensDetalhes(currentListItems);
}

// --- LÓGICA DE PRECIFICAÇÃO ---

async function carregarPrecos() {
    try {
        const { data, error } = await supabaseClient.from('lavagem_precos').select('*');
        if (error) throw error;
        
        precosCache = data.map(p => ({
            id: p.id,
            tipoVeiculo: p.tipo_veiculo,
            tipoLavagem: p.tipo_lavagem,
            fornecedor: p.fornecedor,
            valor: p.valor
        }));
        renderizarTabelaPrecos();
        atualizarDropdownFornecedores();
    } catch (error) {
        console.error('Erro ao carregar preços:', error);
    }
}

async function salvarPreco() {
    const tipoVeiculo = document.getElementById('precoTipoVeiculo').value.trim().toUpperCase();
    const tipoLavagem = document.getElementById('precoTipoLavagem').value;
    const fornecedor = document.getElementById('precoFornecedor')?.value?.trim().toUpperCase() || null;
    const valor = parseFloat(document.getElementById('precoValor').value);

    if (!tipoVeiculo || !tipoLavagem || isNaN(valor)) {
        return alert('Preencha todos os campos corretamente.');
    }

    try {
        if (editingPriceId) {
            // Update existing
            const exists = precosCache.find(p => p.tipoVeiculo === tipoVeiculo && p.tipoLavagem === tipoLavagem && p.fornecedor === fornecedor && p.id !== editingPriceId);
            if (exists) {
                return alert('Já existe um preço cadastrado para este Tipo de Veículo, Lavagem e Fornecedor.');
            }

            const { error } = await supabaseClient.from('lavagem_precos').update({ 
                tipo_veiculo: tipoVeiculo, 
                tipo_lavagem: tipoLavagem, 
                fornecedor: fornecedor,
                valor: valor 
            }).eq('id', editingPriceId);
            
            if (error) throw error;
            alert('Preço atualizado com sucesso!');
        } else {
            // Insert new
            const exists = precosCache.find(p => p.tipoVeiculo === tipoVeiculo && p.tipoLavagem === tipoLavagem && p.fornecedor === fornecedor);
            
            if (exists) {
                if(!confirm('Já existe um preço para este tipo de veículo, lavagem e fornecedor. Deseja atualizar o valor?')) return;
                const { error } = await supabaseClient.from('lavagem_precos').update({ valor }).eq('id', exists.id);
                if (error) throw error;
                alert('Preço atualizado com sucesso!');
            } else {
                const { error } = await supabaseClient.from('lavagem_precos').insert({ tipo_veiculo: tipoVeiculo, tipo_lavagem: tipoLavagem, fornecedor: fornecedor, valor });
                if (error) throw error;
                alert('Preço adicionado com sucesso!');
            }
        }
        
        await carregarPrecos();
        limparFormularioPreco();
    } catch (error) {
        console.error('Erro ao salvar preço:', error);
        alert('Erro ao salvar preço: ' + error.message);
    }
}

function limparFormularioPreco() {
    document.getElementById('precoValor').value = '';
    document.getElementById('precoTipoVeiculo').value = '';
    if(document.getElementById('precoFornecedor')) document.getElementById('precoFornecedor').value = '';
    editingPriceId = null;
    const btn = document.getElementById('btnSalvarPreco');
    btn.innerHTML = '<i class="fas fa-save"></i> Adicionar';
    btn.classList.remove('btn-blue');
    btn.classList.add('btn-green');
}

function renderizarTabelaPrecos() {
    const tbody = document.getElementById('tbodyPrecos');
    if (!tbody) return;
    tbody.innerHTML = '';

    precosCache.forEach((p, index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${p.fornecedor || '-'}</td>
            <td>${p.tipoVeiculo}</td>
            <td>${p.tipoLavagem}</td>
            <td>R$ ${p.valor.toFixed(2)}</td>
            <td>
                <button class="btn-icon edit" onclick="editarPreco(${p.id})"><i class="fas fa-edit"></i></button>
                <button class="btn-icon delete" onclick="removerPreco(${p.id})"><i class="fas fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

window.editarPreco = function(id) {
    const p = precosCache.find(x => x.id === id);
    if (!p) return;
    
    document.getElementById('precoTipoVeiculo').value = p.tipoVeiculo;
    document.getElementById('precoTipoLavagem').value = p.tipoLavagem;
    document.getElementById('precoValor').value = p.valor;
    if(document.getElementById('precoFornecedor')) document.getElementById('precoFornecedor').value = p.fornecedor || '';
    
    editingPriceId = id;
    const btn = document.getElementById('btnSalvarPreco');
    btn.innerHTML = '<i class="fas fa-sync-alt"></i> Atualizar';
    btn.classList.remove('btn-green');
    btn.classList.add('btn-blue');
}

function ordenarPrecos(key) {
    if (sortStatePrecos.key === key) {
        sortStatePrecos.asc = !sortStatePrecos.asc;
    } else {
        sortStatePrecos.key = key;
        sortStatePrecos.asc = true;
    }

    document.querySelectorAll('.sortable-preco i').forEach(i => i.className = 'fas fa-sort');
    const activeTh = document.querySelector(`.sortable-preco[data-sort="${key}"] i`);
    if (activeTh) activeTh.className = sortStatePrecos.asc ? 'fas fa-sort-up' : 'fas fa-sort-down';

    precosCache.sort((a, b) => {
        let valA = a[key];
        let valB = b[key];
        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();
        if (valA < valB) return sortStatePrecos.asc ? -1 : 1;
        if (valA > valB) return sortStatePrecos.asc ? 1 : -1;
        return 0;
    });
    renderizarTabelaPrecos();
}

window.removerPreco = async function(id) {
    if(confirm('Remover este preço?')) {
        try {
            const { error } = await supabaseClient.from('lavagem_precos').delete().eq('id', id);
            if (error) throw error;
            await carregarPrecos();
        } catch (error) {
            console.error('Erro ao remover preço:', error);
            alert('Erro ao remover preço: ' + error.message);
        }
    }
}

// --- LÓGICA DE RELATÓRIOS ---

async function gerarRelatorio() {
    const dataIni = document.getElementById('relDataIni').value;
    const dataFim = document.getElementById('relDataFim').value;
    const tbody = document.getElementById('tbodyRelatorio');
    
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Gerando relatório...</td></tr>';

    try {
        const { data: listas, error: errListas } = await supabaseClient
            .from('lavagem_listas')
            .select('*')
            .gte('data_lista', dataIni)
            .lte('data_lista', dataFim)
            .order('data_lista', { ascending: false });

        if (errListas) throw errListas;

        if (!listas || listas.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Nenhuma lista encontrada no período.</td></tr>';
            document.getElementById('relTotalGastoGeral').textContent = 'R$ 0,00';
            return;
        }

        const listaIds = listas.map(l => l.id);

        const { data: itens, error: errItens } = await supabaseClient
            .from('lavagem_itens')
            .select('*')
            .in('lista_id', listaIds);

        if (errItens) throw errItens;

        const placas = [...new Set(itens.map(i => i.placa))];
        const { data: veiculos, error: errVeiculos } = await supabaseClient
            .from('veiculos')
            .select('placa, tipo')
            .in('placa', placas);
        
        if (errVeiculos) throw errVeiculos;

        const veiculoMap = new Map();
        veiculos.forEach(v => veiculoMap.set(v.placa, v.tipo));

        let totalGeral = 0;
        tbody.innerHTML = '';

        if (precosCache.length === 0) await carregarPrecos();

        listas.forEach(lista => {
            const itensLista = itens.filter(i => i.lista_id === lista.id);
            
            let qtdRealizada = 0;
            let qtdPendente = 0;
            let valorLista = 0;

            itensLista.forEach(item => {
                if (item.status === 'REALIZADO') {
                    qtdRealizada++;
                    
                    // Se tem valor salvo (snapshot), usa ele
                    if (item.valor !== undefined && item.valor !== null) {
                        valorLista += item.valor;
                    } else {
                        // Fallback: calcula com preços atuais
                        const tipoVeiculo = veiculoMap.get(item.placa) || 'DESCONHECIDO';
                        const tiposLavagemStr = item.tipo_lavagem;
                        
                        if (tiposLavagemStr) {
                            const tipos = tiposLavagemStr.split(',').map(t => t.trim()).filter(t => t);
                            tipos.forEach(tipo => {
                                const precoObj = precosCache.find(p => 
                                    p.tipoVeiculo === tipoVeiculo.toUpperCase() && 
                                    p.tipoLavagem === tipo &&
                                    (p.fornecedor === item.fornecedor || (!p.fornecedor && !item.fornecedor))
                                );
                                if (precoObj) valorLista += precoObj.valor;
                            });
                        }
                    }

                } else {
                    qtdPendente++;
                }
            });

            totalGeral += valorLista;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${new Date(lista.created_at).toLocaleDateString('pt-BR')}</td>
                <td>${new Date(lista.data_lista).toLocaleDateString('pt-BR')}</td>
                <td>${lista.nome}</td>
                <td><span class="badge badge-${lista.status.toLowerCase()}">${lista.status}</span></td>
                <td>${qtdRealizada}</td>
                <td>${qtdPendente}</td>
                <td>R$ ${valorLista.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
                <td>
                    <button class="btn-icon edit" onclick="abrirDetalhesLista('${lista.id}', '${lista.nome}')" title="Abrir Lista"><i class="fas fa-folder-open"></i></button>
                    <button class="btn-icon pdf" onclick="gerarPDFListaPorId('${lista.id}', '${lista.nome}')" title="Gerar PDF" style="color: #dc3545;"><i class="fas fa-file-pdf"></i></button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        document.getElementById('relTotalGastoGeral').textContent = `R$ ${totalGeral.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;

    } catch (err) {
        console.error(err);
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:red;">Erro ao gerar relatório.</td></tr>';
    }
}

async function carregarTiposVeiculoParaPreco() {
    const select = document.getElementById('precoTipoVeiculo');
    if (!select) return;

    try {
        const { data, error } = await supabaseClient
            .from('veiculos')
            .select('tipo');

        if (error) throw error;

        const tipos = [...new Set(data.map(v => v.tipo).filter(t => t))].sort();

        select.innerHTML = '<option value="">Selecione o Tipo</option>';
        tipos.forEach(t => {
            select.add(new Option(t, t));
        });
    } catch (error) {
        console.error('Erro ao carregar tipos de veículo:', error);
        select.innerHTML = '<option value="">Erro ao carregar</option>';
    }
}

// --- NOVAS FUNÇÕES PARA ADICIONAR VEÍCULO MANUALMENTE ---

/**
 * Abre o modal para adicionar um novo veículo a uma lista existente.
 * Filtra os veículos para não mostrar os que já estão na lista.
 */
async function abrirModalAdicionarVeiculo() {
    const modal = document.getElementById('modalAdicionarVeiculo');
    if (!modal) {
        return alert('Erro: O modal para adicionar veículos não foi encontrado no HTML.');
    }

    const tbody = document.getElementById('tbodyAdicionarVeiculo');
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Carregando...</td></tr>';
    modal.classList.remove('hidden');

    try {
        // Reutiliza o cache de veículos se já foi carregado, senão busca
        if (veiculosAptosCache.length === 0) {
            const { data, error } = await supabaseClient
                .from('veiculos')
                .select('*')
                .in('situacao', ['ativo', 'INTERNADO']);
            if (error) throw error;
            veiculosAptosCache = data;
        }

        // Pega as placas que já estão na lista atual
        const placasNaLista = new Set(currentListItems.map(item => item.placa));

        // Filtra os veículos que não estão na lista
        veiculosDisponiveisParaAdicao = veiculosAptosCache.filter(v => !placasNaLista.has(v.placa));

        // Limpa busca
        const searchInput = document.getElementById('searchAdicionarVeiculo');
        if(searchInput) searchInput.value = '';

        // Renderiza com ordenação padrão
        ordenarVeiculosAdicionar('placa');
    } catch (error) {
        console.error('Erro ao preparar modal para adicionar veículo:', error);
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:red;">Erro ao carregar veículos.</td></tr>';
    }
}

/**
 * Filtra os veículos no modal de adicionar com base no input de busca.
 */
function filtrarVeiculosAdicionar() {
    const term = document.getElementById('searchAdicionarVeiculo').value.toUpperCase();
    const filtered = veiculosDisponiveisParaAdicao.filter(v => v.placa.includes(term));
    renderTabelaAdicionarVeiculo(filtered);
}

/**
 * Ordena os veículos no modal de adicionar.
 */
function ordenarVeiculosAdicionar(key) {
    if (sortStateAdicionar.key === key) {
        sortStateAdicionar.asc = !sortStateAdicionar.asc;
    } else {
        sortStateAdicionar.key = key;
        sortStateAdicionar.asc = true;
    }
    
    // Atualiza ícones
    document.querySelectorAll('.sortable-add i').forEach(i => i.className = 'fas fa-sort');
    const activeTh = document.querySelector(`.sortable-add[data-sort="${key}"] i`);
    if(activeTh) activeTh.className = sortStateAdicionar.asc ? 'fas fa-sort-up' : 'fas fa-sort-down';

    veiculosDisponiveisParaAdicao.sort((a, b) => {
        let valA = a[key] || '';
        let valB = b[key] || '';
        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();
        if (valA < valB) return sortStateAdicionar.asc ? -1 : 1;
        if (valA > valB) return sortStateAdicionar.asc ? 1 : -1;
        return 0;
    });

    filtrarVeiculosAdicionar();
}

/**
 * Renderiza a tabela de veículos disponíveis para serem adicionados.
 * @param {Array} veiculos - A lista de veículos a ser renderizada.
 */
function renderTabelaAdicionarVeiculo(veiculos) {
    const tbody = document.getElementById('tbodyAdicionarVeiculo');
    tbody.innerHTML = '';

    if (veiculos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Nenhum veículo encontrado.</td></tr>';
        return;
    }

    veiculos.forEach(v => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="text-align:center;"><input type="checkbox" class="chk-veiculo-adicionar" value="${v.placa}" data-modelo="${v.modelo || ''}" data-marca="${v.marca || ''}"></td>
            <td><strong>${v.placa}</strong></td>
            <td>${v.tipo || '-'}</td>
            <td>${v.modelo || '-'}</td>
            <td>${v.marca || '-'}</td>
        `;
        tbody.appendChild(tr);
    });
}

/**
 * Adiciona os veículos selecionados no modal à lista de lavagem atual.
 */
async function adicionarVeiculosNaLista() {
    const selecionados = Array.from(document.querySelectorAll('.chk-veiculo-adicionar:checked'));
    const fornecedor = document.getElementById('adicionarVeiculoFornecedor')?.value?.toUpperCase() || null;

    if (selecionados.length === 0) return alert('Selecione pelo menos um veículo para adicionar.');
    if (!currentListId) return alert('Erro: ID da lista atual não encontrado.');

    const btn = document.getElementById('btnConfirmarAdicao');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Adicionando...';

    const novosItens = selecionados.map(chk => ({
        lista_id: currentListId, 
        placa: chk.value, 
        modelo: chk.dataset.modelo, 
        marca: chk.dataset.marca, 
        status: 'PENDENTE', 
        tipo_lavagem: null,
        fornecedor: fornecedor
    }));

    try {
        const { error } = await supabaseClient.from('lavagem_itens').insert(novosItens);
        if (error) throw error;

        alert(`${novosItens.length} veículo(s) adicionado(s) com sucesso!`);
        document.getElementById('modalAdicionarVeiculo').classList.add('hidden');

        const nomeLista = document.getElementById('tituloDetalhesLista').textContent.replace('Lista: ', '');
        await abrirDetalhesLista(currentListId, nomeLista);
    } catch (error) {
        console.error('Erro ao adicionar veículos:', error);
        alert('Erro ao adicionar veículos: ' + error.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-check"></i> Adicionar Selecionados';
    }
}
