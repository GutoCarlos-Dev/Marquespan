import { supabaseClient } from './supabase.js';

let veiculosAptosCache = [];
let currentListId = null;
let currentListItems = [];

document.addEventListener('DOMContentLoaded', async () => {
    const usuario = JSON.parse(localStorage.getItem('usuarioLogado'));
    if (!usuario) { window.location.href = 'index.html'; return; }

    // Init dates
    const hoje = new Date();
    const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    document.getElementById('filtroDataIni').value = inicioMes.toISOString().split('T')[0];
    document.getElementById('filtroDataFim').value = hoje.toISOString().split('T')[0];

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
    document.getElementById('btnConfirmarCriacao')?.addEventListener('click', criarNovaLista);
    
    document.getElementById('filtroPlacaNovaLista').addEventListener('input', filtrarVeiculosModal);
    document.getElementById('filtroFilialNovaLista').addEventListener('change', filtrarVeiculosModal);
    document.getElementById('filtroTipoNovaLista')?.addEventListener('change', filtrarVeiculosModal);
    document.getElementById('chkAllNovaLista').addEventListener('change', toggleAllVeiculos);

    document.getElementById('btnCloseModalDetalhes').addEventListener('click', () => document.getElementById('modalDetalhesLista').classList.add('hidden'));
    document.getElementById('filtroDetalhesInput').addEventListener('input', filtrarItensDetalhes);
    document.getElementById('btnFinalizarLista').addEventListener('click', finalizarListaAtual);
    document.getElementById('btnExportarPDF').addEventListener('click', gerarPDFLista);

    await carregarListas();
});

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
        const selectTipo = document.getElementById('filtroTipoNovaLista');
        if (selectTipo) {
            const tipos = [...new Set(veiculosAptosCache.map(v => v.tipo).filter(Boolean))].sort();
            selectTipo.innerHTML = '<option value="">Todos os Tipos</option>';
            tipos.forEach(t => selectTipo.add(new Option(t, t)));
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
    const tipoInput = document.getElementById('filtroTipoNovaLista');
    
    const placa = placaInput ? placaInput.value.toUpperCase() : '';
    const filial = filialInput ? filialInput.value : '';
    const tipo = tipoInput ? tipoInput.value : '';

    const filtrados = veiculosAptosCache.filter(v => {
        const matchPlaca = !placa || v.placa.includes(placa);
        const matchFilial = !filial || v.filial === filial;
        const matchTipo = !tipo || v.tipo === tipo;
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
    
    const tbody = document.getElementById('tbodyDetalhesItens');
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Carregando itens...</td></tr>';

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
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:red;">Erro ao carregar itens.</td></tr>';
    }
}

function renderizarItensDetalhes(itens) {
    const tbody = document.getElementById('tbodyDetalhesItens');
    tbody.innerHTML = '';

    let realizados = 0;
    let pendentes = 0;

    itens.forEach(item => {
        if (item.status === 'REALIZADO') realizados++; else pendentes++;

        const tr = document.createElement('tr');
        const tiposLavagem = ['SIMPLES', 'DIFERENCIADA', 'BAÚ COMPLETO', 'MOTOR', 'THERMO KING', 'CHASSI'];
        
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
        const isRealizado = item.status === 'REALIZADO';

        tr.innerHTML = `
            <td><strong>${item.placa}</strong></td>
            <td>${item.modelo || '-'}</td>
            <td>
                <select class="select-tipo-lavagem" onchange="atualizarItem('${item.id}', 'tipo', this.value)">
                    ${options}
                </select>
            </td>
            <td>
                <span class="badge ${isRealizado ? 'badge-realizado' : 'badge-pendente'}" 
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
    document.getElementById('countPendentes').textContent = pendentes;
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
    const novoStatus = statusAtual === 'PENDENTE' ? 'REALIZADO' : 'PENDENTE';
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