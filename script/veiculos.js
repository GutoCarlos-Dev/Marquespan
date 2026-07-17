import { supabaseClient } from './supabase.js';
import { registrarAuditoria } from './auditoria-utils.js';

const VEICULOS_PAGE_ID = 'veiculos.html';
const VEICULOS_STORAGE_BUCKET = 'veiculos_fotos';
const VEICULOS_FOTOS_CAMPOS = [
    { coluna: 'foto_dianteira_url', label: 'Foto Dianteira', nome: 'dianteira' },
    { coluna: 'foto_traseira_url', label: 'Foto Traseira', nome: 'traseira' },
    { coluna: 'foto_lateral_1_url', label: 'Foto Lateral 1', nome: 'lateral_1' },
    { coluna: 'foto_lateral_2_url', label: 'Foto Lateral 2', nome: 'lateral_2' }
];

let veiculosData = [];
let currentSort = { column: null, direction: 'asc' };

document.addEventListener('DOMContentLoaded', async () => {
    const acessoPermitido = await verificarPermissaoPagina();
    if (!acessoPermitido) return;

    aplicarModoAcessoVeiculos();
    await carregarFiliais();
    carregarTipos();
    carregarFabricantes();
    carregarVeiculos();
    setupEventListeners();
    setupMultiselect();
    setupSorting();
});

function getCurrentUser() {
    try {
        return JSON.parse(localStorage.getItem('usuarioLogado') || 'null');
    } catch {
        return null;
    }
}

function normalizarNivelVeiculos(nivel) {
    return String(nivel || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

function getFilialUsuarioVeiculos() {
    return String(getCurrentUser()?.filial || '').trim().toUpperCase();
}

function usuarioTemAcessoTotalVeiculos() {
    const nivel = normalizarNivelVeiculos(getCurrentUser()?.nivel);
    return nivel === 'administrador' || nivel === 'gerencia';
}

function usuarioSomenteVisualizaVeiculos() {
    return !usuarioTemAcessoTotalVeiculos();
}

function aplicarModoAcessoVeiculos() {
    if (!usuarioSomenteVisualizaVeiculos()) return;

    ['btn-novo-veiculo', 'btn-importar-massa', 'btn-exportar-xls', 'btn-gerar-qrcode'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.classList.add('hidden');
            btn.disabled = true;
            btn.style.display = 'none';
        }
    });

    const painelAcoes = document.querySelector('.acoes-panel');
    if (painelAcoes) painelAcoes.style.display = 'none';
}

async function verificarPermissaoPagina() {
    const usuario = getCurrentUser();
    const nivel = normalizarNivelVeiculos(usuario?.nivel);

    if (!nivel) {
        window.location.href = 'index.html';
        return false;
    }

    if (nivel === 'administrador' || nivel === 'gerencia') {
        return true;
    }

    try {
        const { data, error } = await supabaseClient
            .from('nivel_permissoes')
            .select('paginas_permitidas')
            .eq('nivel', nivel)
            .single();

        if (error) throw error;

        if ((data?.paginas_permitidas || []).includes(VEICULOS_PAGE_ID)) {
            return true;
        }
    } catch (error) {
        console.error('Erro ao verificar permissao da pagina de veiculos:', error);
    }

    document.body.innerHTML = `
        <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center;font-family:Arial,sans-serif;">
            <div>
                <h1 style="margin-bottom:12px;">Acesso negado</h1>
                <p>Voce nao tem permissao para acessar a pagina de veiculos.</p>
                <a href="menu.html" style="display:inline-block;margin-top:16px;color:#2563eb;">Voltar ao menu</a>
            </div>
        </div>
    `;
    return false;
}

function setupEventListeners() {
    // Botão Buscar
    const btnBuscar = document.getElementById('btn-buscar');
    if (btnBuscar) {
        btnBuscar.addEventListener('click', carregarVeiculos);
    }

    // Botão Novo Veículo
    const btnNovo = document.getElementById('btn-novo-veiculo');
    if (btnNovo) {
        btnNovo.addEventListener('click', () => abrirModalVeiculo());
    }

    // Botão Importar
    const btnImportar = document.getElementById('btn-importar-massa');
    if (btnImportar) {
        btnImportar.addEventListener('click', () => {
            const modal = document.getElementById('modalImportacao');
            if (modal) modal.classList.remove('hidden');
        });
    }

    // Botão Exportar
    const btnExportar = document.getElementById('btn-exportar-xls');
    if (btnExportar) {
        btnExportar.addEventListener('click', exportarExcel);
    }

    // Fechar modal de importação (Botão X)
    const closeImportBtn = document.querySelector('#modalImportacao .close-button');
    if (closeImportBtn) {
        closeImportBtn.addEventListener('click', () => {
            document.getElementById('modalImportacao').classList.add('hidden');
        });
    }

    // Form de importação
    const formImportacao = document.getElementById('formImportacao');
    if (formImportacao) {
        formImportacao.addEventListener('submit', handleImportacao);
    }

    // Modal de Veículo (Novo/Editar) - Fechar
    const closeVeiculoBtn = document.getElementById('btnCloseModalVeiculo');
    if (closeVeiculoBtn) {
        closeVeiculoBtn.addEventListener('click', fecharModalVeiculo);
    }

    // Form de Veículo - Salvar
    const formVeiculo = document.getElementById('formVeiculo');
    if (formVeiculo) {
        formVeiculo.addEventListener('submit', salvarVeiculo);
    }

    const anexosExistentes = document.getElementById('veiculoAnexosExistentes');
    if (anexosExistentes) {
        anexosExistentes.addEventListener('click', handleDownloadAnexoVeiculo);
    }

    // Delegação de eventos na tabela (Editar/Excluir)
    const gridBody = document.getElementById('grid-veiculos-body');
    if (gridBody) {
        gridBody.addEventListener('click', handleTableClick);
    }

    // Fechar modais ao clicar fora (Backdrop)
    window.addEventListener('click', (e) => {
        const modalVeiculo = document.getElementById('modalVeiculo');
        const modalImportacao = document.getElementById('modalImportacao');
        if (e.target === modalVeiculo) fecharModalVeiculo();
        if (e.target === modalImportacao) modalImportacao.classList.add('hidden');
    });

    // UX: Atualizar nome do arquivo no input de importação
    const fileInput = document.getElementById('arquivoImportacao');
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            const fileName = e.target.files[0]?.name;
            const label = document.getElementById('arquivoImportacaoLabel');
            const wrapper = document.getElementById('dropZoneImportacao');
            if (label && fileName) {
                const icon = document.createElement('i');
                icon.className = 'fas fa-file-excel';
                label.replaceChildren(icon, document.createTextNode(` ${fileName}`));
                wrapper.style.borderColor = '#006937';
                wrapper.style.backgroundColor = '#f0fff4';
            }
        });
    }

    // Adiciona atalho Ctrl+S para salvar no modal do veículo.
    const modalVeiculo = document.getElementById('modalVeiculo');
    if (modalVeiculo) {
        modalVeiculo.addEventListener('keydown', (e) => {
            // Verifica se o modal está visível antes de acionar o atalho
            if (modalVeiculo.classList.contains('hidden')) return;

            if (e.ctrlKey && e.key.toLowerCase() === 's') {
                e.preventDefault(); // Impede a ação padrão do navegador (salvar página)

                // Encontra o botão de salvar dentro do formulário e simula um clique
                const formVeiculo = document.getElementById('formVeiculo');
                const btnSalvar = formVeiculo?.querySelector('button[type="submit"]');
                if (btnSalvar) {
                    btnSalvar.click();
                }
            }
        });
    }

    // Atualiza capacidade total ao informar os dois tanques.
    ['veiculoTanque1', 'veiculoTanque2'].forEach(id => {
        const input = document.getElementById(id);
        if (input) input.addEventListener('input', atualizarCapacidadeTotalCombustivel);
    });

    // Auto-preenche Tipo Motor ao alterar Ano Fabricação
    const anoFabInput = document.getElementById('veiculoAnoFab');
    if (anoFabInput) anoFabInput.addEventListener('change', atualizarTipoMotorPorAno);

    ['veiculoTara', 'veiculoCapacidadeCarga'].forEach(id => {
        const input = document.getElementById(id);
        if (input) input.addEventListener('input', atualizarPbtPorTaraECapacidade);
    });

// Botão para baixar modelo de importação no modal
    const btnModeloImport = document.getElementById('btnBaixarModeloVeiculos');
    if (btnModeloImport) {
        btnModeloImport.addEventListener('click', (e) => { e.preventDefault(); baixarModeloImportacao(); });
    }

}

function handleTableClick(e) {
    const btnView = e.target.closest('.btn-view');
    const btnEdit = e.target.closest('.btn-edit');
    const btnDelete = e.target.closest('.btn-delete');

    if (usuarioSomenteVisualizaVeiculos() && (btnEdit || btnDelete)) {
        alert('Seu nivel de acesso permite somente visualizar os veiculos.');
        return;
    }

    if (btnView) visualizarVeiculo(btnView.dataset.id);
    if (btnEdit) editarVeiculo(btnEdit.dataset.id);
    if (btnDelete) excluirVeiculo(btnDelete.dataset.id);
}

async function carregarFiliais() {
    const select = document.getElementById('campo-filial');
    const selectImport = document.getElementById('importFilial');
    const selectModal = document.getElementById('veiculoFilial');
    const filialUsuario = getFilialUsuarioVeiculos();
    const restringirFilial = usuarioSomenteVisualizaVeiculos() && filialUsuario;

    try {
        const { data, error } = await supabaseClient
            .from('filiais')
            .select('nome, sigla')
            .order('nome');

        if (error) throw error;

        // Limpa opções exceto a primeira
        if (select) select.innerHTML = '<option value="">Todas</option>';
        if (selectImport) selectImport.innerHTML = '<option value="">Não alterar / não preencher</option>';
        if (selectModal) selectModal.innerHTML = '<option value="">Selecione</option>';

        const filiais = restringirFilial
            ? (data || []).filter(f => String(f.sigla || f.nome || '').trim().toUpperCase() === filialUsuario)
            : (data || []);

        if (filiais.length > 0) {
            filiais.forEach(f => {
                const option = document.createElement('option');
                option.value = f.sigla || f.nome;
                option.textContent = f.sigla ? `${f.nome} (${f.sigla})` : f.nome;

                if (select) select.appendChild(option.cloneNode(true));
                if (selectImport) selectImport.appendChild(option.cloneNode(true));
                if (selectModal) selectModal.appendChild(option.cloneNode(true));
            });
        }

        if (restringirFilial) {
            [select, selectImport, selectModal].filter(Boolean).forEach(item => {
                if (!Array.from(item.options).some(option => String(option.value).toUpperCase() === filialUsuario)) {
                    item.add(new Option(filialUsuario, filialUsuario));
                }
                item.value = filialUsuario;
                item.disabled = true;
            });
        }
    } catch (err) {
        console.error('Erro ao carregar filiais:', err);
    }
}

async function carregarFabricantes() {
    const select = document.getElementById('campo-fabricante');
    if (!select) return;

    try {
        let query = supabaseClient
            .from('veiculos')
            .select('fabricante')
            .not('fabricante', 'is', null)
            .neq('fabricante', '');

        if (usuarioSomenteVisualizaVeiculos() && getFilialUsuarioVeiculos()) {
            query = query.eq('filial', getFilialUsuarioVeiculos());
        }

        const { data, error } = await query;
        if (error) throw error;

        const unicos = [...new Set(data.map(v => v.fabricante?.trim()).filter(Boolean))].sort();

        unicos.forEach(fab => {
            select.add(new Option(fab, fab));
        });
    } catch (err) {
        console.error('Erro ao carregar fabricantes:', err);
    }
}

function carregarTipos() {
    const container = document.getElementById('campo-tipo-options');
    const selectModal = document.getElementById('veiculoTipo');

    // Lista fixa conforme solicitado
    const tipos = ['CAMINHÃO 3/4','BITREM','BITRUCK','HR/VAN','LS','MUNCK','SEMI-REBOQUE','TRUCK','EMPILHADEIRA', 'GERADOR'];

    if (!container) return;

    container.innerHTML = '';

    tipos.forEach(tipo => {
        const label = document.createElement('label');
        label.style.display = 'block';
        label.style.padding = '5px';
        label.style.cursor = 'pointer';
        label.innerHTML = `<input type="checkbox" class="filtro-tipo-checkbox" value="${tipo}"> ${tipo}`;
        container.appendChild(label);
    });

    // Popula o select do modal também
    if (selectModal) {
        selectModal.innerHTML = '<option value="">Selecione</option>';
        tipos.forEach(tipo => {
            selectModal.add(new Option(tipo, tipo));
        });
    }
}

async function carregarVeiculos() {
    const tbody = document.getElementById('grid-veiculos-body');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Carregando...</td></tr>';

    const filialUsuario = getFilialUsuarioVeiculos();
    const filial = usuarioSomenteVisualizaVeiculos() && filialUsuario
        ? filialUsuario
        : document.getElementById('campo-filial').value;
    const placa = document.getElementById('campo-placa').value.trim();
    const modelo = document.getElementById('campo-modelo').value.trim();
    const situacao = document.getElementById('campo-situacao').value;
    const tipoMotor = document.getElementById('campo-tipo-motor')?.value || '';
    const fabricante = document.getElementById('campo-fabricante')?.value || '';

    // Tipos selecionados
    const tiposSelecionados = Array.from(document.querySelectorAll('.filtro-tipo-checkbox:checked')).map(cb => cb.value);

    try {
        let query = supabaseClient
            .from('veiculos')
            .select('*')
            .order('placa');

        if (filial) query = query.eq('filial', filial);
        if (placa) query = query.ilike('placa', `%${placa}%`);
        if (modelo) query = query.ilike('modelo', `%${modelo}%`);
        if (situacao) query = query.eq('situacao', situacao);
        if (tipoMotor) query = query.eq('tipo_motor', tipoMotor);
        if (fabricante) query = query.eq('fabricante', fabricante);
        if (tiposSelecionados.length > 0) query = query.in('tipo', tiposSelecionados);

        const { data, error } = await query;

        if (error) throw error;

        veiculosData = data;
        renderizarTabela(data);

        // Atualiza contador
        const contador = document.getElementById('grid-records-count');
        if (contador) contador.textContent = `${data.length} veículos`;

    } catch (err) {
        console.error('Erro ao carregar veículos:', err);
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:red;">Erro ao carregar dados.</td></tr>';
    }
}

function renderizarTabela(veiculos) {
    const tbody = document.getElementById('grid-veiculos-body');
    tbody.innerHTML = '';

    if (veiculos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Nenhum veículo encontrado.</td></tr>';
        return;
    }

    veiculos.forEach(v => {
        const tr = document.createElement('tr');

        const tdFilial = document.createElement('td'); tdFilial.textContent = v.filial || '-';
        const tdPlaca = document.createElement('td'); tdPlaca.textContent = v.placa; tdPlaca.style.fontWeight = 'bold';
        const tdModelo = document.createElement('td'); tdModelo.textContent = v.modelo || '-';
        const tdRenavan = document.createElement('td'); tdRenavan.textContent = normalizarRenavan(v.renavan) || '-';
        const tdTipo = document.createElement('td'); tdTipo.textContent = v.tipo || '-';

        const tdSituacao = document.createElement('td');
        const spanStatus = document.createElement('span');
        spanStatus.className = `status-badge ${v.situacao === 'ativo' ? 'status-ativo' : 'status-inativo'}`;
        spanStatus.textContent = v.situacao || '-';
        tdSituacao.appendChild(spanStatus);

        const tdQr = document.createElement('td');
        if (v.qrcode) {
            tdQr.innerHTML = '<i class="fas fa-qrcode" title="Possui QR Code"></i>';
        } else {
            tdQr.textContent = '-';
        }

        const tdAcoes = document.createElement('td');

        const btnView = document.createElement('button');
        btnView.className = 'btn-icon view btn-view';
        btnView.title = 'Visualizar';
        btnView.dataset.id = v.id;
        btnView.innerHTML = '<i class="fas fa-eye"></i>';
        tdAcoes.appendChild(btnView);

        if (usuarioTemAcessoTotalVeiculos()) {
            const btnEdit = document.createElement('button');
            btnEdit.className = 'btn-icon edit btn-edit';
            btnEdit.title = 'Editar';
            btnEdit.dataset.id = v.id;
            btnEdit.innerHTML = '<i class="fas fa-edit"></i>';
            btnEdit.style.marginLeft = '5px';

            const btnDelete = document.createElement('button');
            btnDelete.className = 'btn-icon delete btn-delete';
            btnDelete.title = 'Excluir';
            btnDelete.dataset.id = v.id;
            btnDelete.innerHTML = '<i class="fas fa-trash"></i>';
            btnDelete.style.marginLeft = '5px';

            tdAcoes.append(btnEdit, btnDelete);
        }

        tr.append(tdFilial, tdPlaca, tdModelo, tdRenavan, tdTipo, tdSituacao, tdQr, tdAcoes);
        tbody.appendChild(tr);
    });
}

function setupMultiselect() {
    const display = document.getElementById('campo-tipo-display');
    const options = document.getElementById('campo-tipo-options');
    const text = document.getElementById('campo-tipo-text');

    if (!display || !options) return;

    // Toggle Dropdown
    display.addEventListener('click', (e) => {
        e.stopPropagation();
        options.classList.toggle('hidden');
    });

    // Fechar ao clicar fora
    document.addEventListener('click', (e) => {
        if (!display.contains(e.target) && !options.contains(e.target)) {
            options.classList.add('hidden');
        }
    });

    // Lógica de atualização de texto e busca (Identica ao Tacógrafo)
    options.addEventListener('change', () => {
        updateTipoFilterText(options, text);
        carregarVeiculos();
    });
}

/**
 * Atualiza o texto exibido no seletor de Tipos baseado nas seleções.
 * Segue exatamente o padrão de TacografoUI.updateStatusFilterText
 */
function updateTipoFilterText(optionsContainer, textElement) {
    const checked = Array.from(optionsContainer.querySelectorAll('.filtro-tipo-checkbox:checked'));
    if (checked.length === 0) {
        textElement.textContent = 'Todos';
    } else if (checked.length <= 2) {
        textElement.textContent = checked.map(cb => cb.value).join(', ');
    } else {
        textElement.textContent = `${checked.length} selecionados`;
    }
}

function setInputValue(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value ?? '';
}

function setSelectBoolean(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value ? 'true' : 'false';
}

function parseNumberValue(value) {
    if (value === null || value === undefined || value === '') return null;
    const parsed = parseFloat(String(value).replace(',', '.'));
    return Number.isNaN(parsed) ? null : parsed;
}

function normalizarRenavan(value) {
    const digitos = String(value || '').replace(/\D/g, '');
    if (!digitos) return null;
    return digitos.padStart(11, '0');
}

function atualizarCapacidadeTotalCombustivel() {
    const tanque1 = parseNumberValue(document.getElementById('veiculoTanque1')?.value) || 0;
    const tanque2 = parseNumberValue(document.getElementById('veiculoTanque2')?.value) || 0;
    const total = document.getElementById('veiculoVolumeTanque');
    if (total) total.value = tanque1 + tanque2 > 0 ? (tanque1 + tanque2).toFixed(2) : '';
}

function atualizarTipoMotorPorAno() {
    const ano = parseInt(document.getElementById('veiculoAnoFab')?.value);
    const select = document.getElementById('veiculoTipoMotor');
    if (!select || !ano || ano < 1900) return;
    select.value = ano >= 2023 ? 'EURO 6' : 'EURO 5';
}

function atualizarPbtPorTaraECapacidade() {
    const tara = parseNumberValue(document.getElementById('veiculoTara')?.value);
    const capacidadeCarga = parseNumberValue(document.getElementById('veiculoCapacidadeCarga')?.value);
    const pbt = document.getElementById('veiculoPBT');

    if (!pbt || tara === null || capacidadeCarga === null) return;

    pbt.value = (tara + capacidadeCarga).toFixed(2);
}

function abrirModalVeiculo(veiculo = null, somenteLeitura = false) {
    if (!somenteLeitura && usuarioSomenteVisualizaVeiculos()) {
        alert('Seu nivel de acesso permite somente visualizar os veiculos.');
        return;
    }

    const modal = document.getElementById('modalVeiculo');
    const form = document.getElementById('formVeiculo');
    const title = document.getElementById('modalTitle');

    if (!modal || !form) return;

    form.reset();
    renderizarAnexosVeiculo(veiculo);

    if (veiculo) {
        title.textContent = 'Editar Veículo';
        setInputValue('veiculoId', veiculo.id);
        setInputValue('veiculoPlacaOriginal', veiculo.placa);
        setInputValue('veiculoFilial', veiculo.filial);
        setInputValue('veiculoPlaca', veiculo.placa);
        setInputValue('veiculoModelo', veiculo.modelo);
        setInputValue('veiculoTipo', veiculo.tipo);
        setInputValue('veiculoSituacao', veiculo.situacao || 'ativo');
        setInputValue('veiculoQrcode', veiculo.qrcode);
        setInputValue('veiculoRenavan', veiculo.renavan);
        setInputValue('veiculoAnoFab', veiculo.anofab);
        setInputValue('veiculoAnoMod', veiculo.anomod);
        setInputValue('veiculoNumeroCRV', veiculo.numero_crv);
        setInputValue('veiculoChassi', veiculo.chassi);
        setInputValue('veiculoFabricante', veiculo.fabricante || veiculo.marca);
        setInputValue('veiculoModeloVersao', veiculo.modelo_versao);
        setInputValue('veiculoEspecie', veiculo.especie);
        setInputValue('veiculoCor', veiculo.cor);
        setInputValue('veiculoCombustivel', veiculo.combustivel);
        setInputValue('veiculoPotenciaCilindrada', veiculo.potencia_cilindrada);
        setInputValue('veiculoMotor', veiculo.motor);
        setInputValue('veiculoEixos', veiculo.eixos);
        setInputValue('veiculoPBT', veiculo.pbt);
        setInputValue('veiculoCarroceria', veiculo.carroceria);
        setInputValue('veiculoCidadeEmplac', veiculo.cidade_emplacamento || veiculo.local_emplacamento);
        setInputValue('veiculoObservacoes', veiculo.observacoes_veiculo);
        setInputValue('veiculoTipoMotor', veiculo.tipo_motor);
        setInputValue('veiculoTransmissao', veiculo.transmissao);
        setSelectBoolean('veiculoVuc', veiculo.vuc);
        setInputValue('veiculoDimensoes', veiculo.dimensoes);
        setInputValue('veiculoTanque1', veiculo.tanque_combustivel_1);
        setInputValue('veiculoTanque2', veiculo.tanque_combustivel_2);
        setInputValue('veiculoVolumeTanque', veiculo.volume_tanque);
        setInputValue('veiculoMediaKm', veiculo.media_km);
        setInputValue('veiculoTara', veiculo.tara_veiculo);
        setInputValue('veiculoCapacidadeCarga', veiculo.capacidade_carga);
        setInputValue('veiculoTacografoTipo', veiculo.tacografo_tipo);
        setInputValue('veiculoTacografoMarca', veiculo.tacografo_marca);
        setInputValue('veiculoRastreador', veiculo.rastreador);
        setSelectBoolean('veiculoVideoMonitoramento', veiculo.video_monitoramento);
        setSelectBoolean('veiculoPedagioAutomatico', veiculo.cobranca_automatica_pedagio);
        setInputValue('veiculoCategoriaCobranca', veiculo.categoria_cobranca);
        setInputValue('veiculoModeloTK', veiculo.modelo_tk);
        setInputValue('veiculoSerieTK', veiculo.serie_tk);
        setInputValue('veiculoMotorTK', veiculo.motor_tk);
        setInputValue('veiculoCompressorTK', veiculo.compressor_tk);
        setInputValue('veiculoBau', veiculo.bau_tipo || veiculo.marca_implemento);
        setInputValue('veiculoSerieBau', veiculo.serie_bau);
        setInputValue('veiculoMesAnoFabr', veiculo.mes_ano_fabricacao);
        setInputValue('veiculoMecanismo', veiculo.mecanismo_operacional);
        setInputValue('veiculoSerieMecanismo', veiculo.serie_mecanismo);
    } else {
        title.textContent = 'Novo Veículo';
        setInputValue('veiculoId', '');
        setInputValue('veiculoPlacaOriginal', '');
        setInputValue('veiculoSituacao', 'ativo');
        setSelectBoolean('veiculoVuc', false);
        setSelectBoolean('veiculoVideoMonitoramento', false);
        setSelectBoolean('veiculoPedagioAutomatico', false);
    }

    if (somenteLeitura) title.textContent = 'Visualizar Veículo';
    aplicarModoSomenteLeituraFormVeiculo(somenteLeitura);

    atualizarCapacidadeTotalCombustivel();
    atualizarPbtPorTaraECapacidade();
    modal.classList.remove('hidden');
}

function aplicarModoSomenteLeituraFormVeiculo(somenteLeitura) {
    const form = document.getElementById('formVeiculo');
    if (!form) return;

    form.querySelectorAll('input, select, textarea').forEach(el => {
        el.disabled = somenteLeitura;
    });

    const btnSalvar = form.querySelector('button[type="submit"]');
    if (btnSalvar) btnSalvar.classList.toggle('hidden', somenteLeitura);

    const btnCancelar = form.querySelector('.form-actions .btn-red');
    if (btnCancelar) btnCancelar.textContent = somenteLeitura ? 'Fechar' : 'Cancelar';
}

function fecharModalVeiculo() {
    const modal = document.getElementById('modalVeiculo');
    if (modal) modal.classList.add('hidden');
}

async function editarVeiculo(id) {
    if (usuarioSomenteVisualizaVeiculos()) {
        alert('Seu nivel de acesso permite somente visualizar os veiculos.');
        return;
    }

    try {
        const { data, error } = await supabaseClient
            .from('veiculos')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;
        abrirModalVeiculo(data);
    } catch (err) {
        console.error('Erro ao carregar veículo:', err);
        alert('Erro ao carregar dados do veículo.');
    }
}

async function visualizarVeiculo(id) {
    try {
        const { data, error } = await supabaseClient
            .from('veiculos')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;
        abrirModalVeiculo(data, true);
    } catch (err) {
        console.error('Erro ao carregar veículo:', err);
        alert('Erro ao carregar dados do veículo.');
    }
}

async function salvarVeiculo(e) {
    e.preventDefault();
    if (usuarioSomenteVisualizaVeiculos()) {
        alert('Seu nivel de acesso permite somente visualizar os veiculos.');
        return;
    }

    const id = document.getElementById('veiculoId').value;
    const placaOriginal = normalizarPlacaVeiculo(document.getElementById('veiculoPlacaOriginal')?.value);
    const getVal = (id) => {
        const el = document.getElementById(id);
        return el ? (el.value || null) : null;
    };

    atualizarCapacidadeTotalCombustivel();
    atualizarPbtPorTaraECapacidade();

    const payload = {
        filial: getVal('veiculoFilial'),
        placa: getVal('veiculoPlaca')?.toUpperCase(),
        modelo: getVal('veiculoModelo'),
        tipo: getVal('veiculoTipo'),
        situacao: getVal('veiculoSituacao'),
        qrcode: getVal('veiculoQrcode'),
        renavan: normalizarRenavan(getVal('veiculoRenavan')),
        anofab: getVal('veiculoAnoFab'),
        anomod: getVal('veiculoAnoMod'),
        numero_crv: getVal('veiculoNumeroCRV'),
        chassi: getVal('veiculoChassi'),
        fabricante: getVal('veiculoFabricante'),
        marca: getVal('veiculoFabricante'),
        modelo_versao: getVal('veiculoModeloVersao'),
        especie: getVal('veiculoEspecie'),
        cor: getVal('veiculoCor'),
        combustivel: getVal('veiculoCombustivel'),
        potencia_cilindrada: getVal('veiculoPotenciaCilindrada'),
        motor: getVal('veiculoMotor'),
        eixos: parseInt(getVal('veiculoEixos')) || null,
        pbt: parseNumberValue(getVal('veiculoPBT')),
        carroceria: getVal('veiculoCarroceria'),
        cidade_emplacamento: getVal('veiculoCidadeEmplac'),
        local_emplacamento: getVal('veiculoCidadeEmplac'),
        observacoes_veiculo: getVal('veiculoObservacoes'),
        tipo_motor: getVal('veiculoTipoMotor'),
        transmissao: getVal('veiculoTransmissao'),
        vuc: getVal('veiculoVuc') === 'true',
        dimensoes: getVal('veiculoDimensoes'),
        tanque_combustivel_1: parseNumberValue(getVal('veiculoTanque1')),
        tanque_combustivel_2: parseNumberValue(getVal('veiculoTanque2')),
        volume_tanque: parseNumberValue(getVal('veiculoVolumeTanque')),
        qtdtanque: [getVal('veiculoTanque1'), getVal('veiculoTanque2')].filter(v => parseNumberValue(v) > 0).length || null,
        media_km: parseNumberValue(getVal('veiculoMediaKm')),
        tara_veiculo: parseNumberValue(getVal('veiculoTara')),
        capacidade_carga: parseNumberValue(getVal('veiculoCapacidadeCarga')),
        tacografo_tipo: getVal('veiculoTacografoTipo'),
        tacografo_marca: getVal('veiculoTacografoMarca'),
        rastreador: getVal('veiculoRastreador'),
        video_monitoramento: getVal('veiculoVideoMonitoramento') === 'true',
        cobranca_automatica_pedagio: getVal('veiculoPedagioAutomatico') === 'true',
        categoria_cobranca: getVal('veiculoCategoriaCobranca'),
        modelo_tk: getVal('veiculoModeloTK'),
        serie_tk: getVal('veiculoSerieTK'),
        motor_tk: getVal('veiculoMotorTK'),
        compressor_tk: getVal('veiculoCompressorTK'),
        bau_tipo: getVal('veiculoBau'),
        marca_implemento: getVal('veiculoBau'),
        serie_bau: getVal('veiculoSerieBau'),
        mes_ano_fabricacao: getVal('veiculoMesAnoFabr'),
        mecanismo_operacional: getVal('veiculoMecanismo'),
        serie_mecanismo: getVal('veiculoSerieMecanismo')
    };

    Object.keys(payload).forEach(key => {
        if (payload[key] === null || payload[key] === undefined || payload[key] === '') delete payload[key];
    });

    try {
        let savedId = id;
        let error;
        const placaNova = normalizarPlacaVeiculo(payload.placa);
        const placaFoiAlterada = Boolean(id && placaOriginal && placaNova && placaOriginal !== placaNova);

        if (placaFoiAlterada) {
            const confirmar = confirm(`Alterar a placa de ${placaOriginal} para ${placaNova}?\n\nEssa alteracao tambem sera aplicada nos registros vinculados a esta placa.`);
            if (!confirmar) return;

            const { error: rpcError } = await supabaseClient.rpc('renomear_placa_veiculo', {
                p_placa_antiga: placaOriginal,
                p_placa_nova: placaNova
            });
            if (rpcError) {
                error = rpcError;
            } else {
                ({ error } = await supabaseClient.from('veiculos').update(payload).eq('id', id));
            }
        } else if (id) {
            ({ error } = await supabaseClient.from('veiculos').update(payload).eq('id', id));
        } else {
            const result = await supabaseClient.from('veiculos').insert([payload]).select('id').single();
            error = result.error;
            savedId = result.data?.id;
        }

        if (error) throw error;
        if (!savedId) throw new Error('ID do veículo não retornado após salvar.');

        const anexosPayload = await uploadAnexosVeiculo(savedId, payload.placa);
        if (Object.keys(anexosPayload).length > 0) {
            const { error: anexosError } = await supabaseClient.from('veiculos').update(anexosPayload).eq('id', savedId);
            if (anexosError) throw anexosError;
        }

        registrarAuditoria(id ? 'ALTERAR' : 'INCLUIR', 'Veículos', `${id ? 'Alteração' : 'Inclusão'} do veículo placa ${payload.placa}`);
        alert('Veículo salvo com sucesso!');
        fecharModalVeiculo();
        carregarVeiculos();
    } catch (err) {
        console.error('Erro ao salvar:', err);
        alert('Erro ao salvar veículo: ' + err.message);
    }
}

function normalizarPlacaVeiculo(value) {
    return String(value || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

async function uploadFotosVeiculo(veiculoId, placa) {
    const fotos = [
        { inputId: 'veiculoFotoDianteira', coluna: 'foto_dianteira_url', nome: 'dianteira' },
        { inputId: 'veiculoFotoTraseira', coluna: 'foto_traseira_url', nome: 'traseira' },
        { inputId: 'veiculoFotoLateral1', coluna: 'foto_lateral_1_url', nome: 'lateral_1' },
        { inputId: 'veiculoFotoLateral2', coluna: 'foto_lateral_2_url', nome: 'lateral_2' }
    ];

    const uploaded = {};
    const pasta = String(placa || veiculoId).replace(/[^a-z0-9]/gi, '_').toUpperCase();

    for (const foto of fotos) {
        const input = document.getElementById(foto.inputId);
        const file = input?.files?.[0];
        if (!file) continue;

        const ext = file.name.split('.').pop() || 'jpg';
        const filePath = `${pasta}/${foto.nome}.${ext}`;
        const { error } = await supabaseClient.storage
            .from(VEICULOS_STORAGE_BUCKET)
            .upload(filePath, file, { upsert: true, contentType: file.type });

        if (error) throw new Error(`Falha ao enviar ${foto.nome}: ${error.message}`);
        uploaded[foto.coluna] = filePath;
    }

    return uploaded;
}

async function uploadAnexosVeiculo(veiculoId, placa) {
    const uploaded = await uploadFotosVeiculo(veiculoId, placa);
    const inputArquivo = document.getElementById('veiculoArquivoAnexo');
    const arquivo = inputArquivo?.files?.[0];

    if (!arquivo) return uploaded;

    const pasta = String(placa || veiculoId).replace(/[^a-z0-9]/gi, '_').toUpperCase();
    const nomeSeguro = normalizarNomeArquivo(arquivo.name || `arquivo_${Date.now()}`);
    const filePath = `${pasta}/arquivo/${Date.now()}_${nomeSeguro}`;
    const { error } = await supabaseClient.storage
        .from(VEICULOS_STORAGE_BUCKET)
        .upload(filePath, arquivo, { upsert: true, contentType: arquivo.type || 'application/octet-stream' });

    if (error) throw new Error(`Falha ao enviar arquivo do veiculo: ${error.message}`);

    uploaded.arquivo_anexo_url = filePath;
    uploaded.arquivo_anexo_nome = arquivo.name;
    uploaded.arquivo_anexo_tipo = arquivo.type || null;
    return uploaded;
}

function renderizarAnexosVeiculo(veiculo) {
    const container = document.getElementById('veiculoAnexosExistentes');
    if (!container) return;

    container.replaceChildren();

    const anexos = [];
    if (veiculo) {
        VEICULOS_FOTOS_CAMPOS.forEach((foto) => {
            const path = veiculo[foto.coluna];
            if (path) anexos.push({ label: foto.label, path, nome: obterNomeArquivo(path) });
        });

        if (veiculo.arquivo_anexo_url) {
            anexos.push({
                label: 'Arquivo do Veiculo',
                path: veiculo.arquivo_anexo_url,
                nome: veiculo.arquivo_anexo_nome || obterNomeArquivo(veiculo.arquivo_anexo_url)
            });
        }
    }

    container.classList.toggle('hidden', anexos.length === 0);
    anexos.forEach((anexo) => container.appendChild(criarItemAnexoVeiculo(anexo)));
}

function criarItemAnexoVeiculo(anexo) {
    const item = document.createElement('div');
    item.className = 'veiculo-anexo-item';

    const info = document.createElement('div');
    info.className = 'veiculo-anexo-info';

    const titulo = document.createElement('span');
    titulo.className = 'veiculo-anexo-titulo';
    titulo.textContent = anexo.label;

    const nome = document.createElement('span');
    nome.className = 'veiculo-anexo-nome';
    nome.textContent = anexo.nome || 'Arquivo salvo';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-download-anexo';
    btn.dataset.path = anexo.path;
    btn.dataset.nome = anexo.nome || '';
    btn.innerHTML = '<i class="fas fa-download"></i> Baixar';

    info.append(titulo, nome);
    item.append(info, btn);
    return item;
}

async function handleDownloadAnexoVeiculo(event) {
    const button = event.target.closest('.btn-download-anexo');
    if (!button) return;

    const path = button.dataset.path;
    if (!path) return;

    const originalText = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

    try {
        const { data, error } = await supabaseClient.storage
            .from(VEICULOS_STORAGE_BUCKET)
            .createSignedUrl(path, 60);

        if (error) throw error;
        const response = await fetch(data.signedUrl);
        if (!response.ok) throw new Error('Falha ao obter arquivo do storage.');

        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = button.dataset.nome || obterNomeArquivo(path);
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(blobUrl);
    } catch (err) {
        console.error('Erro ao baixar anexo do veiculo:', err);
        alert('Nao foi possivel baixar o arquivo.');
    } finally {
        button.disabled = false;
        button.innerHTML = originalText;
    }
}

function obterNomeArquivo(path) {
    return decodeURIComponent(String(path || '').split('/').pop() || 'arquivo');
}

function normalizarNomeArquivo(nome) {
    return String(nome || 'arquivo')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9._-]/g, '_');
}

async function excluirVeiculo(id) {
    if (usuarioSomenteVisualizaVeiculos()) {
        alert('Seu nivel de acesso permite somente visualizar os veiculos.');
        return;
    }

    if (!confirm('Tem certeza que deseja excluir este veículo?')) return;
    try {
        const { error } = await supabaseClient.from('veiculos').delete().eq('id', id);
        if (error) throw error;
        registrarAuditoria('EXCLUIR', 'Veículos', `Exclusão do veículo ID ${id}`);
        carregarVeiculos();
    } catch (err) {
        console.error('Erro ao excluir:', err);
        alert('Erro ao excluir veículo.');
    }
}

function exportarExcel() {
    if (usuarioSomenteVisualizaVeiculos()) {
        alert('Seu nivel de acesso permite somente visualizar os veiculos.');
        return;
    }

    if (veiculosData.length === 0) {
        alert('Sem dados para exportar.');
        return;
    }
    const ws = XLSX.utils.json_to_sheet(veiculosData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Veiculos");
    XLSX.writeFile(wb, "veiculos.xlsx");
}

function baixarModeloImportacao() {
    if (typeof XLSX === 'undefined') return alert('Biblioteca XLSX não carregada.');

    const headers = [
        'PLACA', 'FILIAL', 'SITUACAO', 'MODELO', 'TIPO', 'QRCODE',
        'RENAVAN', 'ANO_FAB', 'ANO_MOD', 'NUMERO_CRV', 'CHASSI', 'FABRICANTE',
        'MODELO_VERSAO', 'ESPECIE', 'COR', 'COMBUSTIVEL', 'POTENCIA_CILINDRADA',
        'MOTOR', 'EIXOS', 'PBT', 'CARROCERIA', 'LOCAL_EMPLACAMENTO', 'OBSERVACOES_VEICULO',
        'TRANSMISSAO', 'VUC', 'DIMENSOES', 'TANQUE_COMBUSTIVEL_1', 'TANQUE_COMBUSTIVEL_2',
        'VOLUME_TANQUE', 'MEDIA_KM', 'TARA_VEICULO', 'CAPACIDADE_CARGA', 'TACOGRAFO_TIPO', 'TACOGRAFO_MARCA',
        'RASTREADOR', 'VIDEO_MONITORAMENTO', 'COBRANCA_AUTOMATICA_PEDAGIO', 'CATEGORIA_COBRANCA',
        'MODELO_TK', 'SERIE_TK', 'MOTOR_TK', 'COMPRESSOR_TK', 'BAU_TIPO', 'MARCA_IMPLEMENTO',
        'SERIE_BAU', 'MES_ANO_FABRICACAO', 'MECANISMO', 'SERIE_MECANISMO'
    ];

    const data = [{
        'PLACA': 'ABC1234', 'FILIAL': 'MATRIZ', 'SITUACAO': 'ativo', 'MODELO': 'FH 540', 'TIPO': 'LS', 'QRCODE': '',
        'RENAVAN': '123456789', 'ANO_FAB': 2023, 'ANO_MOD': 2024, 'NUMERO_CRV': '1234567890', 'CHASSI': '9BWZZZ0000000000',
        'FABRICANTE': 'VOLVO', 'MODELO_VERSAO': 'FH 540 6X4', 'ESPECIE': 'CARGA', 'COR': 'BRANCO', 'COMBUSTIVEL': 'DIESEL',
        'POTENCIA_CILINDRADA': '540CV', 'MOTOR': 'D13', 'EIXOS': 6, 'PBT': 74.0, 'CARROCERIA': 'BAÚ', 'LOCAL_EMPLACAMENTO': 'SÃO PAULO',
        'OBSERVACOES_VEICULO': '', 'TRANSMISSAO': 'AUTOMÁTICA', 'VUC': 'NÃO', 'DIMENSOES': '18.0/2.6/4.4',
        'TANQUE_COMBUSTIVEL_1': 400, 'TANQUE_COMBUSTIVEL_2': 400, 'VOLUME_TANQUE': 800, 'MEDIA_KM': 2.5,
        'TARA_VEICULO': 9300, 'CAPACIDADE_CARGA': 74000, 'TACOGRAFO_TIPO': 'DIGITAL', 'TACOGRAFO_MARCA': 'VDO', 'RASTREADOR': 'SASCAR',
        'VIDEO_MONITORAMENTO': 'SIM', 'COBRANCA_AUTOMATICA_PEDAGIO': 'SIM', 'CATEGORIA_COBRANCA': '6 EIXOS',
        'MODELO_TK': '', 'SERIE_TK': '', 'MOTOR_TK': '', 'COMPRESSOR_TK': '', 'BAU_TIPO': 'REFRIGERADO',
        'MARCA_IMPLEMENTO': 'FACCHINI', 'SERIE_BAU': '', 'MES_ANO_FABRICACAO': '01/2024',
        'MECANISMO': '', 'SERIE_MECANISMO': ''
    }];

    const ws = XLSX.utils.json_to_sheet(data, { header: headers });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Modelo");
    XLSX.writeFile(wb, "Modelo_Importacao_Veiculos.xlsx");
}

function normalizarValorImportacao(dbCol, valor) {
    let excelVal = String(valor).trim();

    if (dbCol === 'renavan') return normalizarRenavan(excelVal);
    if (dbCol === 'situacao') return excelVal.toLowerCase();
    if (['vuc', 'video_monitoramento', 'cobranca_automatica_pedagio'].includes(dbCol)) {
        const normalized = excelVal.toUpperCase();
        return normalized === 'SIM' || normalized === 'TRUE' || normalized === 'S' || normalized === '1';
    }
    if (['anofab', 'anomod', 'qtdtanque', 'eixos'].includes(dbCol)) {
        return parseInt(excelVal, 10) || null;
    }
    if ([
        'volume_tanque', 'media_km', 'pbt', 'tanque_combustivel_1',
        'tanque_combustivel_2', 'tara_veiculo', 'capacidade_carga'
    ].includes(dbCol)) {
        return parseFloat(excelVal.replace(',', '.')) || null;
    }

    return excelVal;
}

function aplicarTotaisTanqueImportacao(target, base = {}) {
    const alterouTanque = Object.prototype.hasOwnProperty.call(target, 'tanque_combustivel_1') ||
        Object.prototype.hasOwnProperty.call(target, 'tanque_combustivel_2');

    if (!alterouTanque || Object.prototype.hasOwnProperty.call(target, 'volume_tanque')) return;

    const tanque1 = Number(target.tanque_combustivel_1 ?? base.tanque_combustivel_1) || 0;
    const tanque2 = Number(target.tanque_combustivel_2 ?? base.tanque_combustivel_2) || 0;

    if (tanque1 > 0 || tanque2 > 0) {
        target.volume_tanque = tanque1 + tanque2;
        target.qtdtanque = [tanque1, tanque2].filter(valor => valor > 0).length;
    }
}

async function handleImportacao(e) {
    e.preventDefault();
    if (usuarioSomenteVisualizaVeiculos()) {
        alert('Seu nivel de acesso permite somente visualizar os veiculos.');
        return;
    }

    const fileInput = document.getElementById('arquivoImportacao');
    const filialSelect = document.getElementById('importFilial');
    const filialPadrao = filialSelect.value;
    const btnSubmit = e.target.querySelector('button[type="submit"]');

    if (!fileInput.files.length) {
        alert('Selecione um arquivo (.xlsx ou .xls).');
        return;
    }

    const file = fileInput.files[0];
    const reader = new FileReader();

    const originalBtnText = btnSubmit.innerHTML;
    btnSubmit.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processando...';
    btnSubmit.disabled = true;

    reader.onload = async (event) => {
        try {
            const data = new Uint8Array(event.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const json = XLSX.utils.sheet_to_json(worksheet);

            if (json.length === 0) {
                throw new Error('O arquivo está vazio.');
            }

            const excelPlacas = json
                .map(row => {
                    const key = Object.keys(row).find(k => k.toUpperCase().trim() === 'PLACA');
                    return key ? String(row[key]).toUpperCase().trim() : null;
                })
                .filter(p => p);

            if (excelPlacas.length === 0) {
                throw new Error('Nenhuma coluna "PLACA" encontrada ou todas as placas estão vazias.');
            }

            const { data: existingVehicles, error: fetchError } = await supabaseClient
                .from('veiculos')
                .select('*')
                .in('placa', excelPlacas);

            if (fetchError) throw fetchError;

            const existingMap = new Map();
            existingVehicles.forEach(v => existingMap.set(v.placa, v));

            let insertedCount = 0;
            let updatedCount = 0;
            let skippedCount = 0;
            let errors = [];

            for (const row of json) {
                const rowNormalized = {};
                Object.keys(row).forEach(k => rowNormalized[k.toUpperCase().trim()] = row[k]);

                const placa = rowNormalized['PLACA'] ? String(rowNormalized['PLACA']).toUpperCase().trim() : null;
                if (!placa) continue;

                const existing = existingMap.get(placa);

                const fieldsMap = {
                    'FILIAL': 'filial',
                    'MODELO': 'modelo',
                    'TIPO': 'tipo',
                    'RENAVAN': 'renavan',
                    'SITUACAO': 'situacao',
                    'QRCODE': 'qrcode',
                    'MARCA': 'marca',
                    'CHASSI': 'chassi',
                    'ANO_FAB': 'anofab',
                    'ANO_MOD': 'anomod',
                    'NUMERO_CRV': 'numero_crv',
                    'MODELO_VERSAO': 'modelo_versao',
                    'ESPECIE': 'especie',
                    'COMBUSTIVEL': 'combustivel',
                    'POTENCIA_CILINDRADA': 'potencia_cilindrada',
                    'MOTOR': 'motor',
                    'CARROCERIA': 'carroceria',
                    'LOCAL_EMPLACAMENTO': 'local_emplacamento',
                    'OBSERVACOES_VEICULO': 'observacoes_veiculo',
                    'QTD_TANQUE': 'qtdtanque',
                    'VOLUME_TANQUE': 'volume_tanque',
                    'MEDIA_KM': 'media_km',
                    'FABRICANTE': 'fabricante',
                    'TIPO_MOTOR': 'tipo_motor',
                    'TRANSMISSAO': 'transmissao',
                    'EIXOS': 'eixos',
                    'PBT': 'pbt',
                    'DIMENSOES': 'dimensoes',
                    'VUC': 'vuc',
                    'COR': 'cor',
                    'CIDADE_EMPLAC': 'cidade_emplacamento',
                    'TANQUE_COMBUSTIVEL_1': 'tanque_combustivel_1',
                    'TANQUE_COMBUSTIVEL_2': 'tanque_combustivel_2',
                    'TARA_VEICULO': 'tara_veiculo',
                    'CAPACIDADE_CARGA': 'capacidade_carga',
                    'CAPACIDADE_DE_CARGA': 'capacidade_carga',
                    'TACOGRAFO_TIPO': 'tacografo_tipo',
                    'TACOGRAFO_MARCA': 'tacografo_marca',
                    'VIDEO_MONITORAMENTO': 'video_monitoramento',
                    'COBRANCA_AUTOMATICA_PEDAGIO': 'cobranca_automatica_pedagio',
                    'CATEGORIA_COBRANCA': 'categoria_cobranca',
                    'MODELO_TK': 'modelo_tk',
                    'SERIE_TK': 'serie_tk',
                    'MOTOR_TK': 'motor_tk',
                    'COMPRESSOR_TK': 'compressor_tk',
                    'BAU_TIPO': 'bau_tipo',
                    'MARCA_IMPLEMENTO': 'marca_implemento',
                    'SERIE_BAU': 'serie_bau',
                    'MES_ANO_FABRICACAO': 'mes_ano_fabricacao',
                    'MECANISMO': 'mecanismo_operacional',
                    'SERIE_MECANISMO': 'serie_mecanismo',
                    'RASTREADOR': 'rastreador'
                };

                if (existing) {
                    const updates = {};
                    let hasChanges = false;

                    for (const [excelCol, dbCol] of Object.entries(fieldsMap)) {
                        let excelVal = rowNormalized[excelCol];

                        if (excelVal !== undefined && excelVal !== null && String(excelVal).trim() !== '') {
                            excelVal = normalizarValorImportacao(dbCol, excelVal);

                            const dbVal = existing[dbCol];

                            // Se a coluna na planilha tiver valor e for diferente do que está no banco, atualiza.
                            // Se estiver vazio na planilha, o IF externo já ignora a coluna.
                            if (excelVal !== dbVal) {
                                updates[dbCol] = excelVal;
                                hasChanges = true;
                            }
                        }
                    }

                    if (hasChanges) {
                        aplicarTotaisTanqueImportacao(updates, existing);
                        const { error } = await supabaseClient.from('veiculos').update(updates).eq('id', existing.id);
                        if (error) errors.push(`Erro ao atualizar ${placa}: ${error.message}`);
                        else updatedCount++;
                    } else {
                        skippedCount++;
                    }

                } else {
                    const newRecord = { placa: placa };

                    for (const [excelCol, dbCol] of Object.entries(fieldsMap)) {
                        let excelVal = rowNormalized[excelCol];
                        if (excelVal !== undefined && excelVal !== null && String(excelVal).trim() !== '') {
                            newRecord[dbCol] = normalizarValorImportacao(dbCol, excelVal);
                        }
                    }

                    // Valores padrão obrigatórios se não vierem na planilha
                    aplicarTotaisTanqueImportacao(newRecord);
                    if (!newRecord.filial) newRecord.filial = filialPadrao;
                    if (!newRecord.situacao) newRecord.situacao = 'ativo';

                    if (!newRecord.filial) {
                        errors.push(`Erro ao inserir ${placa}: informe FILIAL na planilha ou selecione uma filial padrão no modal.`);
                        continue;
                    }

                    const { error } = await supabaseClient.from('veiculos').insert([newRecord]);
                    if (error) errors.push(`Erro ao inserir ${placa}: ${error.message}`);
                    else insertedCount++;
                }
            }

            let message = `Processamento concluido!\nInseridos: ${insertedCount}\nAtualizados: ${updatedCount}\nSem alteracoes: ${skippedCount}`;
            if (errors.length > 0) message += `\n\nErros (${errors.length}):\n` + errors.slice(0, 5).join('\n');

            alert(message);
            document.getElementById('modalImportacao').classList.add('hidden');
            carregarVeiculos();

        } catch (error) {
            console.error('Erro na importação:', error);
            alert('Falha na importação: ' + error.message);
        } finally {
            btnSubmit.innerHTML = originalBtnText;
            btnSubmit.disabled = false;
            fileInput.value = '';
        }
    };

    reader.readAsArrayBuffer(file);
}

function setupSorting() {
    const headers = document.querySelectorAll('th.sortable');
    headers.forEach(th => {
        th.addEventListener('click', () => {
            const column = th.dataset.sort;
            ordenarVeiculos(column);
        });
        th.style.cursor = 'pointer';
    });
}

function ordenarVeiculos(column) {
    if (currentSort.column === column) {
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort.column = column;
        currentSort.direction = 'asc';
    }

    document.querySelectorAll('th.sortable i').forEach(icon => {
        icon.className = 'fas fa-sort';
    });

    const activeTh = document.querySelector(`th[data-sort="${column}"] i`);
    if (activeTh) {
        activeTh.className = currentSort.direction === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down';
    }

    veiculosData.sort((a, b) => {
        let valA = (a[column] || '').toString().toLowerCase();
        let valB = (b[column] || '').toString().toLowerCase();

        if (valA < valB) return currentSort.direction === 'asc' ? -1 : 1;
        if (valA > valB) return currentSort.direction === 'asc' ? 1 : -1;
        return 0;
    });

    renderizarTabela(veiculosData);
}
