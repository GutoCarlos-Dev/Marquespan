import { supabaseClient } from './supabase.js';

let veiculosAptosCache = [];
let currentListId = null;
let currentListItems = [];
let currentSort = { key: null, asc: true };
let precosCache = [];

document.addEventListener('DOMContentLoaded', async () => {
    const usuario = JSON.parse(localStorage.getItem('usuarioLogado'));
    if (!usuario) { window.location.href = 'index.html'; return; }

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
    document.getElementById('btn-bulk-aplicar-tipo')?.addEventListener('click', bulkAplicarTipo);
    document.getElementById('btn-bulk-agendar')?.addEventListener('click', bulkAgendar);

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
});

function updateMultiselectText() {
    const checked = document.querySelectorAll('.tipo-checkbox:checked');
    const textSpan = document.getElementById('filtroTipoNovaListaText');
    if (checked.length === 0) {
        textSpan.textContent = 'Todos os Tipos';
    } else if (checked.length === 1) {
        textSpan.textContent = checked[0].value;
    } else {
        textSpan.textContent = `${checked.length} selecionados`;
    }
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
            const total = itensDestaLista.length;
            const realizados = itensDestaLista.filter(i => i.status === 'REALIZADO').length;
            const percent = total > 0 ? Math.round((realizados / total) * 100) : 0;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${new Date(lista.created_at).toLocaleDateString('pt-BR')}</td>
                <td>${lista.nome}</td>
                <td>${new Date(lista.data_lista).toLocaleDateString('pt-BR')}</td>
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

    if (dataInput) dataInput.value = new Date().toISOString().split('T')[0];
    if (nomeInput) nomeInput.value = `Lavagem - ${new Date().toLocaleDateString('pt-BR')}`;
    
    modal.classList.remove('hidden');
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Carregando veículos aptos...</td></tr>';

    try {
        const { data, error } = await supabaseClient
            .from('veiculos')
            .select('*')
            .neq('situacao', 'INTERNADO')
            .neq('situacao', 'inativo')
            .order('placa');

        if (error) throw error;

        veiculosAptosCache = data;
        
        const filiais = [...new Set(data.map(v => v.filial).filter(Boolean))].sort();
        const selectFilial = document.getElementById('filtroFilialNovaLista');
        selectFilial.innerHTML = '<option value="">Todas Filiais</option>';
        filiais.forEach(f => selectFilial.add(new Option(f, f)));

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
                label.innerHTML = `<input type="checkbox" class="tipo-checkbox" value="${t}" style="margin-right: 8px;"> ${t}`;
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
        tr.innerHTML = `
            <td style="text-align:center;"><input type="checkbox" class="chk-veiculo" value="${v.placa}" data-modelo="${v.modelo}" data-marca="${v.marca}"></td>
            <td><strong>${v.placa}</strong></td>
            <td>${v.modelo || '-'}</td>
            <td>${v.marca || '-'}</td>
            <td>${v.filial || '-'}</td>
            <td><span class="badge badge-realizado">APTO</span></td>
        `;
        tbody.appendChild(tr);
    });
    atualizarContadorSelecao();
}

function filtrarVeiculosModal() {
    const placaInput = document.getElementById('filtroPlacaNovaLista');
    const filialInput = document.getElementById('filtroFilialNovaLista');
    
    const placa = placaInput ? placaInput.value.toUpperCase() : '';
    const filial = filialInput ? filialInput.value : '';
    const checkedTypes = Array.from(document.querySelectorAll('.tipo-checkbox:checked')).map(cb => cb.value);

    const filtrados = veiculosAptosCache.filter(v => {
        const matchPlaca = !placa || v.placa.includes(placa);
        const matchFilial = !filial || v.filial === filial;
        const matchTipo = checkedTypes.length === 0 || checkedTypes.includes(v.tipo);
        return matchPlaca && matchFilial && matchTipo;
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

async function criarNovaLista() {
    const nome = document.getElementById('nomeNovaLista').value;
    const dataLista = document.getElementById('dataDaLista').value;
    const selecionados = Array.from(document.querySelectorAll('.chk-veiculo:checked')).map(chk => ({
        placa: chk.value,
        modelo: chk.dataset.modelo,
        marca: chk.dataset.marca
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
                usuario_criacao: usuario
            }])
            .select()
            .single();

        if (errLista) throw errLista;

        const itens = selecionados.map(v => ({
            lista_id: lista.id,
            placa: v.placa,
            modelo: v.modelo,
            marca: v.marca,
            status: 'PENDENTE',
            tipo_lavagem: null
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

    // Popula o select de tipo para ações em massa
    const selectBulkTipo = document.getElementById('select-bulk-tipo');
    if (selectBulkTipo) {
        const tiposLavagem = ['SIMPLES', 'BAÚ COMPLETO', 'CHASSI','MOTOR', 'THERMO KING'];
        selectBulkTipo.innerHTML = '<option value="">Aplicar tipo...</option>';
        tiposLavagem.forEach(t => {
            selectBulkTipo.add(new Option(t, t));
        });
    }

    // Reseta o contador e o checkbox "todos"
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

        currentListItems = data;
        renderizarItensDetalhes(data);

    } catch (error) {
        console.error(error);
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:red;">Erro ao carregar itens.</td></tr>';
    }
}

function renderizarItensDetalhes(itens) {
    const tbody = document.getElementById('tbodyDetalhesItens');
    tbody.innerHTML = '';
    
    let realizados = 0;
    let pendentes = 0;
    let agendados = 0;

    if (itens.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Nenhum item para exibir.</td></tr>';
        document.getElementById('countRealizados').textContent = 0;
        document.getElementById('countPendentes').textContent = 0;
        return;
    }

    itens.forEach(item => {
        if (item.status === 'REALIZADO') realizados++;
        else if (item.status === 'AGENDADO') agendados++;
        else pendentes++;

        const tr = document.createElement('tr');
        const tiposLavagem = ['SIMPLES', 'BAÚ COMPLETO', 'CHASSI','MOTOR', 'THERMO KING'];
        
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

        const dataRealizado = item.data_realizado ? new Date(item.data_realizado).toLocaleDateString('pt-BR') : '-';
        
        let badgeClass = 'badge-pendente';
        if (item.status === 'REALIZADO') {
            badgeClass = 'badge-realizado';
        } else if (item.status === 'AGENDADO') {
            badgeClass = 'badge-agendado';
        }

        tr.innerHTML = `
            <td style="text-align:center;"><input type="checkbox" class="chk-item-detalhe" value="${item.id}"></td>
            <td><strong>${item.placa}</strong></td>
            <td>${item.modelo || '-'}</td>
            <td>${item.marca || '-'}</td>
            <td>
                <select class="select-tipo-lavagem" onchange="atualizarItem('${item.id}', 'tipo', this.value)">
                    ${options}
                </select>
            </td>
            <td>
                <span class="badge ${badgeClass}" 
                      style="cursor:pointer;" 
                      onclick="toggleStatusItem('${item.id}', '${item.status}')">
                    ${item.status}
                </span>
            </td>
            <td>${dataRealizado}</td>
            <td>
                <button class="btn-icon delete" onclick="removerItemLista('${item.id}')"><i class="fas fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    document.getElementById('countRealizados').textContent = realizados;
    document.getElementById('countPendentes').textContent = pendentes + agendados;
    atualizarContadorSelecaoDetalhes();
}

window.atualizarItem = async function(id, campo, valor) {
    try {
        const updateData = {};
        if (campo === 'tipo') updateData.tipo_lavagem = valor;

        const { error } = await supabaseClient
            .from('lavagem_itens')
            .update(updateData)
            .eq('id', id);

        if (error) throw error;
        
        const item = currentListItems.find(i => i.id === id);
        if (item && campo === 'tipo') item.tipo_lavagem = valor;

    } catch (error) {
        console.error(error);
        alert('Erro ao atualizar item.');
    }
}

window.toggleStatusItem = async function(id, statusAtual) {
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
    if (!confirm('Deseja finalizar esta lista?')) return;
    try {
        await supabaseClient.from('lavagem_listas').update({ status: 'FINALIZADA' }).eq('id', currentListId);
        alert('Lista finalizada!');
        document.getElementById('modalDetalhesLista').classList.add('hidden');
        carregarListas();
    } catch (error) {
        alert('Erro ao finalizar lista.');
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

window.gerarPDFListaPorId = async function(id, nomeLista) {
    if (!window.jspdf) return alert('Biblioteca PDF não carregada.');
    
    try {
        const { data: itens, error } = await supabaseClient
            .from('lavagem_itens')
            .select('*')
            .eq('lista_id', id)
            .order('placa');

        if (error) throw error;

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        // Logo
        try {
            const response = await fetch('logo.png');
            if (response.ok) {
                const blob = await response.blob();
                const reader = new FileReader();
                const base64data = await new Promise((resolve) => {
                    reader.onloadend = () => resolve(reader.result);
                    reader.readAsDataURL(blob);
                });
                doc.addImage(base64data, 'PNG', 14, 10, 40, 15);
            }
        } catch (e) { console.warn('Logo não carregado'); }

        doc.setFontSize(18);
        doc.setTextColor(0, 105, 55); // Verde Marquespan
        doc.text('Relatório de Lavagem', 14, 35);
        
        doc.setFontSize(12);
        doc.setTextColor(0);
        doc.text(`Lista: ${nomeLista}`, 14, 42);
        doc.text(`Data de Emissão: ${new Date().toLocaleDateString('pt-BR')}`, 14, 48);

        const columns = ['Placa', 'Modelo', 'Marca', 'Tipo', 'Status', 'Data Realizado'];
        const rows = itens.map(item => [
            item.placa,
            item.modelo || '',
            item.marca || '',
            item.tipo_lavagem || '-',
            item.status,
            item.data_realizado ? new Date(item.data_realizado).toLocaleDateString('pt-BR') : '-'
        ]);

        doc.autoTable({
            head: [columns],
            body: rows,
            startY: 55,
            theme: 'grid',
            headStyles: { fillColor: [0, 105, 55] },
            styles: { fontSize: 10, cellPadding: 2 },
            alternateRowStyles: { fillColor: [240, 240, 240] },
            didParseCell: function(data) {
                if (data.section === 'body' && data.column.index === 4) { // Status column
                    const status = data.cell.raw;
                    if (status === 'REALIZADO') {
                        data.cell.styles.textColor = [40, 167, 69]; // Green
                        data.cell.styles.fontStyle = 'bold';
                    } else {
                        data.cell.styles.textColor = [220, 53, 69]; // Red
                    }
                }
            }
        });

        doc.save(`Lavagem_${nomeLista.replace(/[^a-z0-9]/gi, '_')}.pdf`);

    } catch (error) {
        console.error('Erro ao gerar PDF:', error);
        alert('Erro ao gerar PDF: ' + error.message);
    }
}

window.gerarPDFLista = function() {
    const doc = new jspdf.jsPDF();
    const titulo = document.getElementById('tituloDetalhesLista').textContent;
    
    doc.text(`Relatório de Lavagem - ${titulo}`, 14, 20);
    
    const rows = currentListItems.map(item => [
        item.placa,
        item.modelo || '',
        item.tipo_lavagem || '-',
        item.status,
        item.data_realizado ? new Date(item.data_realizado).toLocaleDateString('pt-BR') : '-'
    ]);

    doc.autoTable({
        head: [['Placa', 'Modelo', 'Tipo', 'Status', 'Data']],
        body: rows,
        startY: 30,
    });

    doc.save(`Lavagem_${titulo}.pdf`);
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
    // Seleciona apenas os checkboxes visíveis (respeitando o filtro)
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

    if (novoStatus === 'REALIZADO') {
        // Verifica se todos os selecionados têm um tipo de lavagem definido
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
                usuario_realizou: novoStatus === 'REALIZADO' ? usuario : null
            })
            .in('id', ids);

        if (error) throw error;

        // Atualiza a view local
        ids.forEach(id => {
            const itemIndex = currentListItems.findIndex(i => i.id == id);
            if (itemIndex > -1) {
                currentListItems[itemIndex].status = novoStatus;
                currentListItems[itemIndex].data_realizado = dataRealizado;
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

        // Atualiza a view local
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

    if (!confirm(`Deseja agendar ${ids.length} item(ns) para ${new Date(dataAgendamento).toLocaleDateString('pt-BR')}?`)) return;

    try {
        const { error } = await supabaseClient
            .from('lavagem_itens')
            .update({ 
                status: 'AGENDADO',
                data_realizado: dataAgendamento // Usamos data_realizado para armazenar a data do agendamento
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
        let valA = a[key] || '';
        let valB = b[key] || '';

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
            valor: p.valor
        }));
        renderizarTabelaPrecos();
    } catch (error) {
        console.error('Erro ao carregar preços:', error);
    }
}

async function salvarPreco() {
    const tipoVeiculo = document.getElementById('precoTipoVeiculo').value.trim().toUpperCase();
    const tipoLavagem = document.getElementById('precoTipoLavagem').value;
    const valor = parseFloat(document.getElementById('precoValor').value);

    if (!tipoVeiculo || !tipoLavagem || isNaN(valor)) {
        return alert('Preencha todos os campos corretamente.');
    }

    // Check if exists
    const exists = precosCache.find(p => p.tipoVeiculo === tipoVeiculo && p.tipoLavagem === tipoLavagem);
    
    try {
        if (exists) {
            if(!confirm('Já existe um preço para este tipo de veículo e lavagem. Deseja atualizar?')) return;
            const { error } = await supabaseClient.from('lavagem_precos').update({ valor }).eq('id', exists.id);
            if (error) throw error;
        } else {
            const { error } = await supabaseClient.from('lavagem_precos').insert({ tipo_veiculo: tipoVeiculo, tipo_lavagem: tipoLavagem, valor });
            if (error) throw error;
        }
        
        await carregarPrecos();
        alert('Preço salvo com sucesso!');
        document.getElementById('precoValor').value = '';
    } catch (error) {
        console.error('Erro ao salvar preço:', error);
        alert('Erro ao salvar preço: ' + error.message);
    }
}

function renderizarTabelaPrecos() {
    const tbody = document.getElementById('tbodyPrecos');
    if (!tbody) return;
    tbody.innerHTML = '';

    precosCache.forEach((p, index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${p.tipoVeiculo}</td>
            <td>${p.tipoLavagem}</td>
            <td>R$ ${p.valor.toFixed(2)}</td>
            <td><button class="btn-icon delete" onclick="removerPreco(${p.id})"><i class="fas fa-trash"></i></button></td>
        `;
        tbody.appendChild(tr);
    });
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
        // 1. Fetch Lavagem Itens (Realizados)
        const { data: itens, error } = await supabaseClient
            .from('lavagem_itens')
            .select('*')
            .gte('data_realizado', `${dataIni}T00:00:00`)
            .lte('data_realizado', `${dataFim}T23:59:59`)
            .eq('status', 'REALIZADO');

        if (error) throw error;

        // 2. Fetch Veiculos to get Type
        const { data: veiculos } = await supabaseClient
            .from('veiculos')
            .select('placa, tipo');
        
        const veiculoMap = new Map();
        veiculos.forEach(v => veiculoMap.set(v.placa, v.tipo));

        // 3. Calculate
        let totalGasto = 0;
        let totalQtd = 0;
        tbody.innerHTML = '';

        itens.forEach(item => {
            const tipoVeiculo = veiculoMap.get(item.placa) || 'DESCONHECIDO';
            const tipoLavagem = item.tipo_lavagem;
            
            // Find price
            const precoObj = precosCache.find(p => 
                p.tipoVeiculo === tipoVeiculo.toUpperCase() && 
                p.tipoLavagem === tipoLavagem
            );
            
            const valor = precoObj ? precoObj.valor : 0;
            totalGasto += valor;
            totalQtd++;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${new Date(item.data_realizado).toLocaleDateString('pt-BR')}</td>
                <td>${item.placa}</td>
                <td>${item.modelo || '-'}</td>
                <td>${tipoVeiculo}</td>
                <td>${tipoLavagem || '-'}</td>
                <td>R$ ${valor.toFixed(2)}</td>
            `;
            tbody.appendChild(tr);
        });

        document.getElementById('relTotalGasto').textContent = `R$ ${totalGasto.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
        document.getElementById('relTotalQtd').textContent = totalQtd;

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