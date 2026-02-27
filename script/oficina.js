import { supabaseClient } from './supabase.js';

document.addEventListener('DOMContentLoaded', () => {
    setupTabs();
    carregarOficinas();
    carregarItens();
    setupEventListeners();
});

function setupTabs() {
    const tabs = document.querySelectorAll('.painel-btn');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Remove active class from all tabs
            tabs.forEach(t => t.classList.remove('active'));
            // Add active class to clicked tab
            tab.classList.add('active');
            
            // Hide all sections
            document.querySelectorAll('section.glass-panel').forEach(section => {
                section.classList.add('hidden');
            });
            
            // Show target section
            const targetId = tab.dataset.tab;
            document.getElementById(targetId).classList.remove('hidden');
        });
    });
}

function setupEventListeners() {
    // Oficina Forms
    document.getElementById('formCadastrarOficina').addEventListener('submit', salvarOficina);
    document.getElementById('btnClearOficinaForm').addEventListener('click', limparFormularioOficina);
    document.getElementById('searchOficinaInput').addEventListener('input', filtrarOficinas);

    // Item Forms
    document.getElementById('formCadastrarItem').addEventListener('submit', salvarItem);
    document.getElementById('btnClearItemForm').addEventListener('click', limparFormularioItem);
}

// --- OFICINAS ---

async function carregarOficinas() {
    const tbody = document.getElementById('oficinaTableBody');
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Carregando...</td></tr>';

    try {
        const { data, error } = await supabaseClient
            .from('oficinas')
            .select('*, itens_verificacao(descricao)')
            .order('nome', { ascending: true });

        if (error) throw error;

        renderTableOficinas(data);
    } catch (err) {
        console.error('Erro ao carregar oficinas:', err);
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:red;">Erro ao carregar dados.</td></tr>';
    }
}

function renderTableOficinas(oficinas) {
    const tbody = document.getElementById('oficinaTableBody');
    tbody.innerHTML = '';

    if (!oficinas || oficinas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Nenhuma oficina cadastrada.</td></tr>';
        return;
    }

    oficinas.forEach(o => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${o.nome}</td>
            <td>${o.filial || '-'}</td>
            <td>${o.itens_verificacao?.descricao || '-'}</td>
            <td>
                <button class="btn-icon edit" title="Editar"><i class="fas fa-edit"></i></button>
                <button class="btn-icon delete" title="Excluir"><i class="fas fa-trash"></i></button>
            </td>
        `;

        tr.querySelector('.edit').addEventListener('click', () => editarOficina(o));
        tr.querySelector('.delete').addEventListener('click', () => excluirOficina(o.id));

        tbody.appendChild(tr);
    });
}

async function salvarOficina(e) {
    e.preventDefault();
    const id = document.getElementById('oficinaEditingId').value;
    const nome = document.getElementById('oficinaNome').value.trim();
    const filial = document.getElementById('oficinaFilial').value;
    const itemVerificador = document.getElementById('oficinaItemVerificador').value;

    const payload = { nome, filial, item_verificador_id: itemVerificador || null };

    try {
        let error;
        if (id) {
            const { error: err } = await supabaseClient.from('oficinas').update(payload).eq('id', id);
            error = err;
        } else {
            const { error: err } = await supabaseClient.from('oficinas').insert([payload]);
            error = err;
        }

        if (error) throw error;

        alert('Oficina salva com sucesso!');
        limparFormularioOficina();
        carregarOficinas();
    } catch (err) {
        console.error('Erro ao salvar oficina:', err);
        alert('Erro ao salvar: ' + err.message);
    }
}

function editarOficina(oficina) {
    document.getElementById('oficinaEditingId').value = oficina.id;
    document.getElementById('oficinaNome').value = oficina.nome;
    document.getElementById('oficinaFilial').value = oficina.filial;
    document.getElementById('oficinaItemVerificador').value = oficina.item_verificador_id || '';
    
    document.getElementById('btnClearOficinaForm').classList.remove('hidden');
    document.getElementById('oficinaNome').focus();
}

async function excluirOficina(id) {
    if (!confirm('Tem certeza que deseja excluir esta oficina?')) return;

    try {
        const { error } = await supabaseClient.from('oficinas').delete().eq('id', id);

        if (error) {
            // Tratamento específico para erro de chave estrangeira (FK)
            if (error.message.includes('violates foreign key constraint') || error.code === '23503') {
                if (confirm('Esta oficina possui registros vinculados em "Coletas de Manutenção".\n\nDeseja desvincular esses registros (definir como "Sem Oficina") e excluir a oficina permanentemente?')) {
                    
                    // 1. Desvincular registros na tabela filha
                    const { error: updateError } = await supabaseClient
                        .from('coletas_manutencao_checklist')
                        .update({ oficina_id: null })
                        .eq('oficina_id', id);

                    if (updateError) throw new Error('Erro ao desvincular registros: ' + updateError.message);

                    // 2. Tentar excluir novamente a oficina
                    const { error: deleteError } = await supabaseClient.from('oficinas').delete().eq('id', id);
                    if (deleteError) throw deleteError;

                    alert('Oficina excluída e registros desvinculados com sucesso!');
                    carregarOficinas();
                    return;
                }
            }
            throw error; // Lança outros erros ou se o usuário cancelar
        }
        carregarOficinas();
    } catch (err) {
        console.error('Erro ao excluir oficina:', err);
        alert('Erro ao excluir: ' + err.message);
    }
}

function limparFormularioOficina() {
    document.getElementById('formCadastrarOficina').reset();
    document.getElementById('oficinaEditingId').value = '';
    document.getElementById('btnClearOficinaForm').classList.add('hidden');
}

function filtrarOficinas(e) {
    const termo = e.target.value.toLowerCase();
    const linhas = document.querySelectorAll('#oficinaTableBody tr');
    linhas.forEach(linha => {
        const texto = linha.textContent.toLowerCase();
        linha.style.display = texto.includes(termo) ? '' : 'none';
    });
}

// --- ITENS VERIFICADORES ---

async function carregarItens() {
    const tbody = document.getElementById('itemTableBody');
    const selectOficina = document.getElementById('oficinaItemVerificador');
    
    tbody.innerHTML = '<tr><td colspan="2" style="text-align:center;">Carregando...</td></tr>';
    selectOficina.innerHTML = '<option value="">Carregando...</option>';

    try {
        const { data, error } = await supabaseClient
            .from('itens_verificacao')
            .select('*')
            .order('descricao', { ascending: true });

        if (error) throw error;

        // Render Table
        tbody.innerHTML = '';
        selectOficina.innerHTML = '<option value="">Selecione um item padrão</option>';

        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="2" style="text-align:center;">Nenhum item cadastrado.</td></tr>';
        } else {
            data.forEach(item => {
                // Table Row
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${item.descricao}</td>
                    <td>
                        <button class="btn-icon edit" title="Editar"><i class="fas fa-edit"></i></button>
                        <button class="btn-icon delete" title="Excluir"><i class="fas fa-trash"></i></button>
                    </td>
                `;
                tr.querySelector('.edit').addEventListener('click', () => editarItem(item));
                tr.querySelector('.delete').addEventListener('click', () => excluirItem(item.id));
                tbody.appendChild(tr);

                // Select Option
                const option = document.createElement('option');
                option.value = item.id;
                option.textContent = item.descricao;
                selectOficina.appendChild(option);
            });
        }
    } catch (err) {
        console.error('Erro ao carregar itens:', err);
        tbody.innerHTML = '<tr><td colspan="2" style="text-align:center; color:red;">Erro ao carregar dados.</td></tr>';
    }
}

async function salvarItem(e) {
    e.preventDefault();
    const id = document.getElementById('itemEditingId').value;
    const descricao = document.getElementById('itemDescricao').value.trim();

    try {
        let error;
        if (id) {
            const { error: err } = await supabaseClient.from('itens_verificacao').update({ descricao }).eq('id', id);
            error = err;
        } else {
            const { error: err } = await supabaseClient.from('itens_verificacao').insert([{ descricao }]);
            error = err;
        }

        if (error) throw error;

        alert('Item salvo com sucesso!');
        limparFormularioItem();
        carregarItens(); // Recarrega tabela e select
    } catch (err) {
        console.error('Erro ao salvar item:', err);
        alert('Erro ao salvar: ' + err.message);
    }
}

function editarItem(item) {
    document.getElementById('itemEditingId').value = item.id;
    document.getElementById('itemDescricao').value = item.descricao;
    document.getElementById('btnClearItemForm').classList.remove('hidden');
    document.getElementById('itemDescricao').focus();
}

async function excluirItem(id) {
    if (!confirm('Tem certeza? Isso pode afetar oficinas vinculadas.')) return;
    const { error } = await supabaseClient.from('itens_verificacao').delete().eq('id', id);
    if (error) return alert('Erro ao excluir: ' + error.message);
    carregarItens();
}

function limparFormularioItem() {
    document.getElementById('formCadastrarItem').reset();
    document.getElementById('itemEditingId').value = '';
    document.getElementById('btnClearItemForm').classList.add('hidden');
}