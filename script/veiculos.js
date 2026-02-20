import { supabaseClient } from './supabase.js';

let veiculosData = [];
let currentSort = { column: null, direction: 'asc' };

document.addEventListener('DOMContentLoaded', () => {
    carregarFiliais();
    carregarTipos();
    carregarVeiculos();
    setupEventListeners();
    setupMultiselect();
    setupSorting();
});

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
                label.innerHTML = `<i class="fas fa-file-excel"></i> ${fileName}`;
                wrapper.style.borderColor = '#006937';
                wrapper.style.backgroundColor = '#f0fff4';
            }
        });
    }

    // ✅ Adiciona atalho Ctrl+S para salvar no modal do veículo
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
}

function handleTableClick(e) {
    const btnEdit = e.target.closest('.btn-edit');
    const btnDelete = e.target.closest('.btn-delete');

    if (btnEdit) editarVeiculo(btnEdit.dataset.id);
    if (btnDelete) excluirVeiculo(btnDelete.dataset.id);
}

async function carregarFiliais() {
    const select = document.getElementById('campo-filial');
    const selectImport = document.getElementById('importFilial');
    const selectModal = document.getElementById('veiculoFilial');
    
    try {
        const { data, error } = await supabaseClient
            .from('filiais')
            .select('nome, sigla')
            .order('nome');

        if (error) throw error;

        // Limpa opções exceto a primeira
        if (select) select.innerHTML = '<option value="">Todas</option>';
        if (selectImport) selectImport.innerHTML = '<option value="">Selecione a Filial</option>';
        if (selectModal) selectModal.innerHTML = '<option value="">Selecione</option>';

        if (data) {
            data.forEach(f => {
                const option = document.createElement('option');
                option.value = f.sigla || f.nome;
                option.textContent = f.sigla ? `${f.nome} (${f.sigla})` : f.nome;
                
                if (select) select.appendChild(option.cloneNode(true));
                if (selectImport) selectImport.appendChild(option.cloneNode(true));
                if (selectModal) selectModal.appendChild(option.cloneNode(true));
            });
        }
    } catch (err) {
        console.error('Erro ao carregar filiais:', err);
    }
}

function carregarTipos() {
    const container = document.getElementById('campo-tipo-options');
    const selectModal = document.getElementById('veiculoTipo');
    
    // Lista fixa conforme solicitado
    const tipos = ['HR/VAN', 'MUNKC', 'SEMI-REBOQUE', 'OPERACIONAL', 'RESERVA', 'CAVALO MECANICO', 'TOCO', 'TRUCK', 'BITRUCK', 'INOPERANTE'];
    
    if (!container) return;
    
    // Reconstrói o HTML do zero para garantir que o cabeçalho e itens existam
    container.innerHTML = `
        <div class="dropdown-header" style="padding: 8px; border-bottom: 1px solid #eee; margin-bottom: 5px;">
            <button type="button" id="btn-limpar-tipo" style="width: 100%; padding: 5px; cursor: pointer; background: #f8f9fa; border: 1px solid #ddd; border-radius: 4px;">Limpar Selecionados</button>
        </div>
    `;

    tipos.forEach(tipo => {
        const label = document.createElement('label');
        label.className = 'dropdown-item';
        label.style.display = 'block';
        label.style.padding = '6px 10px';
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

    const filial = document.getElementById('campo-filial').value;
    const placa = document.getElementById('campo-placa').value.trim();
    const modelo = document.getElementById('campo-modelo').value.trim();
    const situacao = document.getElementById('campo-situacao').value;
    
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
        const tdRenavan = document.createElement('td'); tdRenavan.textContent = v.renavan || '-';
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
        
        const btnEdit = document.createElement('button');
        btnEdit.className = 'btn-icon edit btn-edit';
        btnEdit.title = 'Editar';
        btnEdit.dataset.id = v.id;
        btnEdit.innerHTML = '<i class="fas fa-edit"></i>';
        
        const btnDelete = document.createElement('button');
        btnDelete.className = 'btn-icon delete btn-delete';
        btnDelete.title = 'Excluir';
        btnDelete.dataset.id = v.id;
        btnDelete.innerHTML = '<i class="fas fa-trash"></i>';
        btnDelete.style.marginLeft = '5px';

        tdAcoes.append(btnEdit, btnDelete);

        tr.append(tdFilial, tdPlaca, tdModelo, tdRenavan, tdTipo, tdSituacao, tdQr, tdAcoes);
        tbody.appendChild(tr);
    });
}

function setupMultiselect() {
    const display = document.getElementById('campo-tipo-display');
    const options = document.getElementById('campo-tipo-options');
    const text = document.getElementById('campo-tipo-text');
    const btnLimpar = document.getElementById('btn-limpar-tipo'); 

    if (!display || !options) return;

    display.addEventListener('click', (e) => {
        e.stopPropagation();
        options.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
        if (!display.contains(e.target) && !options.contains(e.target)) {
            options.classList.add('hidden');
        }
    });

    options.addEventListener('change', () => {
        const checked = options.querySelectorAll('.filtro-tipo-checkbox:checked');
        if (checked.length === 0) {
            text.textContent = 'Todos os Tipos';
        } else if (checked.length === 1) {
            text.textContent = checked[0].value;
        } else {
            text.textContent = `${checked.length} selecionados`;
        }
    });

    if (btnLimpar) {
        btnLimpar.addEventListener('click', (e) => {
            e.stopPropagation();
            options.querySelectorAll('.filtro-tipo-checkbox').forEach(cb => cb.checked = false);
            text.textContent = 'Todos os Tipos';
        });
    }
}

function abrirModalVeiculo(veiculo = null) {
    const modal = document.getElementById('modalVeiculo');
    const form = document.getElementById('formVeiculo');
    const title = document.getElementById('modalTitle');

    if (!modal || !form) return;

    form.reset();
    
    if (veiculo) {
        title.textContent = 'Editar Veículo';
        document.getElementById('veiculoId').value = veiculo.id;
        document.getElementById('veiculoFilial').value = veiculo.filial || '';
        document.getElementById('veiculoPlaca').value = veiculo.placa || '';
        document.getElementById('veiculoMarca').value = veiculo.marca || '';
        document.getElementById('veiculoModelo').value = veiculo.modelo || '';
        document.getElementById('veiculoRenavan').value = veiculo.renavan || '';
        document.getElementById('veiculoTipo').value = veiculo.tipo || '';
        document.getElementById('veiculoSituacao').value = veiculo.situacao || 'ativo';
        document.getElementById('veiculoQrcode').value = veiculo.qrcode || '';
        
        // Campos opcionais que podem não existir no form
        const chassi = document.getElementById('veiculoChassi');
        if(chassi) chassi.value = veiculo.chassi || '';
        
        const anoFab = document.getElementById('veiculoAnoFab');
        if(anoFab) anoFab.value = veiculo.anofab || '';
        
        const anoMod = document.getElementById('veiculoAnoMod');
        if(anoMod) anoMod.value = veiculo.anomod || '';
        
        const qtdTanque = document.getElementById('veiculoQtdTanque');
        if(qtdTanque) qtdTanque.value = veiculo.qtdtanque || '';
    } else {
        title.textContent = 'Novo Veículo';
        document.getElementById('veiculoId').value = '';
    }

    modal.classList.remove('hidden');
}

function fecharModalVeiculo() {
    const modal = document.getElementById('modalVeiculo');
    if (modal) modal.classList.add('hidden');
}

async function editarVeiculo(id) {
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

async function salvarVeiculo(e) {
    e.preventDefault();
    
    const id = document.getElementById('veiculoId').value;
    
    // Helper para pegar valor ou null
    const getVal = (id) => {
        const el = document.getElementById(id);
        return el ? (el.value || null) : null;
    };

    const payload = {
        filial: getVal('veiculoFilial'),
        placa: getVal('veiculoPlaca')?.toUpperCase(),
        marca: getVal('veiculoMarca'),
        modelo: getVal('veiculoModelo'),
        renavan: getVal('veiculoRenavan'),
        tipo: getVal('veiculoTipo'),
        situacao: getVal('veiculoSituacao'),
        qrcode: getVal('veiculoQrcode'),
        chassi: getVal('veiculoChassi'),
        anofab: getVal('veiculoAnoFab'),
        anomod: getVal('veiculoAnoMod'),
        qtdtanque: getVal('veiculoQtdTanque')
    };

    // Remove campos nulos que não devem ser enviados se vazios
    if (!payload.anofab) delete payload.anofab;
    if (!payload.anomod) delete payload.anomod;
    if (!payload.qtdtanque) delete payload.qtdtanque;

    try {
        let error;
        if (id) {
            ({ error } = await supabaseClient.from('veiculos').update(payload).eq('id', id));
        } else {
            ({ error } = await supabaseClient.from('veiculos').insert([payload]));
        }

        if (error) throw error;
        alert('Veículo salvo com sucesso!');
        fecharModalVeiculo();
        carregarVeiculos();
    } catch (err) {
        console.error('Erro ao salvar:', err);
        alert('Erro ao salvar veículo: ' + err.message);
    }
}

async function excluirVeiculo(id) {
    if (!confirm('Tem certeza que deseja excluir este veículo?')) return;
    try {
        const { error } = await supabaseClient.from('veiculos').delete().eq('id', id);
        if (error) throw error;
        carregarVeiculos();
    } catch (err) {
        console.error('Erro ao excluir:', err);
        alert('Erro ao excluir veículo.');
    }
}

function exportarExcel() {
    if (veiculosData.length === 0) {
        alert('Sem dados para exportar.');
        return;
    }
    const ws = XLSX.utils.json_to_sheet(veiculosData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Veiculos");
    XLSX.writeFile(wb, "veiculos.xlsx");
}

async function handleImportacao(e) {
    e.preventDefault();
    
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
                    'MARCA': 'marca'
                };

                if (existing) {
                    const updates = {};
                    let hasChanges = false;

                    for (const [excelCol, dbCol] of Object.entries(fieldsMap)) {
                        let excelVal = rowNormalized[excelCol];
                        
                        if (excelVal !== undefined && excelVal !== null && String(excelVal).trim() !== '') {
                            excelVal = String(excelVal).trim();
                            if (dbCol === 'situacao') excelVal = excelVal.toLowerCase();

                            const dbVal = existing[dbCol] ? String(existing[dbCol]).trim() : '';

                            if (excelVal !== dbVal) {
                                updates[dbCol] = excelVal;
                                hasChanges = true;
                            }
                        }
                    }

                    if (hasChanges) {
                        const { error } = await supabaseClient.from('veiculos').update(updates).eq('id', existing.id);
                        if (error) errors.push(`Erro ao atualizar ${placa}: ${error.message}`);
                        else updatedCount++;
                    } else {
                        skippedCount++;
                    }

                } else {
                    const newRecord = {
                        placa: placa,
                        filial: (rowNormalized['FILIAL'] && String(rowNormalized['FILIAL']).trim() !== '') ? String(rowNormalized['FILIAL']).trim() : filialPadrao,
                        modelo: rowNormalized['MODELO'] ? String(rowNormalized['MODELO']).trim() : '',
                        tipo: rowNormalized['TIPO'] ? String(rowNormalized['TIPO']).trim() : '',
                        renavan: rowNormalized['RENAVAN'] ? String(rowNormalized['RENAVAN']).trim() : '',
                        situacao: rowNormalized['SITUACAO'] ? String(rowNormalized['SITUACAO']).trim().toLowerCase() : 'ativo',
                        qrcode: rowNormalized['QRCODE'] ? String(rowNormalized['QRCODE']).trim() : '',
                        marca: rowNormalized['MARCA'] ? String(rowNormalized['MARCA']).trim() : ''
                    };

                    const { error } = await supabaseClient.from('veiculos').insert([newRecord]);
                    if (error) errors.push(`Erro ao inserir ${placa}: ${error.message}`);
                    else insertedCount++;
                }
            }

            let message = `Processamento concluído!\n✅ Inseridos: ${insertedCount}\n🔄 Atualizados: ${updatedCount}\n⏭️ Sem alterações: ${skippedCount}`;
            if (errors.length > 0) message += `\n\n⚠️ Erros (${errors.length}):\n` + errors.slice(0, 5).join('\n');
            
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
