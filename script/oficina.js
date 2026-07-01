import { supabaseClient } from './supabase.js';
import { registrarAuditoria } from './auditoria-utils.js';

let filiaisPermitidasOficina = [];
let usuarioLogadoOficina = null;
let oficinasCache = [];
let oficinaSortState = { campo: 'nome', direcao: 'asc' };

document.addEventListener('DOMContentLoaded', async () => {
    usuarioLogadoOficina = getUsuarioLogadoOficina();
    aplicarRestricoesNivelOficina();
    setupTabs();
    await carregarFiliaisOficina();
    await carregarOficinas();
    carregarItens();
    setupEventListeners();
});

function getUsuarioLogadoOficina() {
    try {
        return JSON.parse(localStorage.getItem('usuarioLogado') || 'null');
    } catch {
        return null;
    }
}

function normalizarFilialOficina(valor) {
    return String(valor || '').trim().toUpperCase();
}

function getFilialUsuarioOficina() {
    return normalizarFilialOficina(usuarioLogadoOficina?.filial);
}

function isAdministradorOficina() {
    return String(usuarioLogadoOficina?.nivel || '').trim().toLowerCase() === 'administrador';
}

function aplicarRestricoesNivelOficina() {
    if (isAdministradorOficina()) return;

    const tabItens = document.querySelector('.painel-btn[data-tab="sectionCadastrarItem"]');
    const sectionItens = document.getElementById('sectionCadastrarItem');

    if (tabItens) tabItens.classList.add('hidden');
    if (sectionItens) sectionItens.classList.add('hidden');
}

function filialCombinaUsuario(filial, filialUsuario) {
    if (!filialUsuario) return true;
    const nome = normalizarFilialOficina(filial?.nome);
    const sigla = normalizarFilialOficina(filial?.sigla);
    const valor = normalizarFilialOficina(filial?.sigla || filial?.nome);
    return filialUsuario === nome || filialUsuario === sigla || filialUsuario === valor;
}

function getValorFilialOficina(filial) {
    return String(filial?.sigla || filial?.nome || '').trim();
}

function getLabelFilialOficina(filial) {
    return filial?.sigla ? `${filial.nome} (${filial.sigla})` : (filial?.nome || '');
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

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
    const oficinaNomeInput = document.getElementById('oficinaNome');
    if (oficinaNomeInput) {
        oficinaNomeInput.addEventListener('input', () => {
            const start = oficinaNomeInput.selectionStart;
            const end = oficinaNomeInput.selectionEnd;
            oficinaNomeInput.value = oficinaNomeInput.value.toUpperCase();
            oficinaNomeInput.setSelectionRange(start, end);
        });
    }

    document.getElementById('formCadastrarOficina').addEventListener('submit', salvarOficina);
    document.getElementById('btnClearOficinaForm').addEventListener('click', limparFormularioOficina);
    document.getElementById('searchOficinaInput').addEventListener('input', filtrarOficinas);
    document.querySelectorAll('[data-oficina-sort]').forEach(button => {
        button.addEventListener('click', () => ordenarOficinas(button.dataset.oficinaSort));
    });

    // Item Forms
    if (isAdministradorOficina()) {
        document.getElementById('formCadastrarItem').addEventListener('submit', salvarItem);
        document.getElementById('btnClearItemForm').addEventListener('click', limparFormularioItem);
    }
}

// --- OFICINAS ---

async function carregarFiliaisOficina() {
    const select = document.getElementById('oficinaFilial');
    if (!select) return;

    select.innerHTML = '<option value="">Carregando...</option>';

    try {
        const { data, error } = await supabaseClient
            .from('filiais')
            .select('nome, sigla')
            .order('nome', { ascending: true });

        if (error) throw error;

        const filialUsuario = getFilialUsuarioOficina();
        filiaisPermitidasOficina = filialUsuario
            ? (data || []).filter(filial => filialCombinaUsuario(filial, filialUsuario))
            : (data || []);

        select.innerHTML = '<option value="">Selecione a filial</option>';
        filiaisPermitidasOficina.forEach(filial => {
            const value = getValorFilialOficina(filial);
            if (!value) return;
            const option = document.createElement('option');
            option.value = value;
            option.textContent = getLabelFilialOficina(filial);
            select.appendChild(option);
        });

        if (filialUsuario && filiaisPermitidasOficina.length === 1) {
            select.value = getValorFilialOficina(filiaisPermitidasOficina[0]);
            select.disabled = true;
        } else {
            select.disabled = false;
        }
    } catch (err) {
        console.error('Erro ao carregar filiais da oficina:', err);
        select.innerHTML = '<option value="">Erro ao carregar filiais</option>';
    }
}

async function carregarOficinas() {
    const tbody = document.getElementById('oficinaTableBody');
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Carregando...</td></tr>';

    try {
        let query = supabaseClient
            .from('oficinas')
            .select('*, itens_verificacao(descricao)')
            .order('nome', { ascending: true });

        const filiaisFiltro = filiaisPermitidasOficina.map(getValorFilialOficina).filter(Boolean);
        if (filiaisFiltro.length === 0) {
            renderTableOficinas([]);
            return;
        }
        query = query.in('filial', filiaisFiltro);

        const { data, error } = await query;

        if (error) throw error;

        oficinasCache = data || [];
        renderTableOficinas(oficinasCache);
    } catch (err) {
        console.error('Erro ao carregar oficinas:', err);
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:red;">Erro ao carregar dados.</td></tr>';
    }
}

function renderTableOficinas(oficinas) {
    const tbody = document.getElementById('oficinaTableBody');
    tbody.innerHTML = '';

    const oficinasOrdenadas = ordenarListaOficinas(oficinas || []);
    atualizarIndicadoresOrdenacaoOficinas();

    if (oficinasOrdenadas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Nenhuma oficina cadastrada.</td></tr>';
        return;
    }

    oficinasOrdenadas.forEach(o => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${escapeHtml(o.nome)}</td>
            <td>${escapeHtml(o.filial || '-')}</td>
            <td>${escapeHtml(o.itens_verificacao?.descricao || '-')}</td>
            <td>
                <button class="btn-icon edit" title="Editar"><i class="fas fa-edit"></i></button>
                <button class="btn-icon delete" title="Excluir"><i class="fas fa-trash"></i></button>
            </td>
        `;

        tr.querySelector('.edit').addEventListener('click', () => editarOficina(o));
        tr.querySelector('.delete').addEventListener('click', () => excluirOficina(o.id));

        tbody.appendChild(tr);
    });

    filtrarOficinas();
}

function getValorOrdenacaoOficina(oficina, campo) {
    const valores = {
        nome: oficina?.nome,
        filial: oficina?.filial,
        item: oficina?.itens_verificacao?.descricao
    };
    return String(valores[campo] || '').trim();
}

function ordenarListaOficinas(oficinas) {
    return [...oficinas].sort((a, b) => {
        const valorA = getValorOrdenacaoOficina(a, oficinaSortState.campo);
        const valorB = getValorOrdenacaoOficina(b, oficinaSortState.campo);
        const compare = valorA.localeCompare(valorB, 'pt-BR', { numeric: true, sensitivity: 'base' });
        return oficinaSortState.direcao === 'asc' ? compare : -compare;
    });
}

function ordenarOficinas(campo) {
    if (!campo) return;

    if (oficinaSortState.campo === campo) {
        oficinaSortState.direcao = oficinaSortState.direcao === 'asc' ? 'desc' : 'asc';
    } else {
        oficinaSortState = { campo, direcao: 'asc' };
    }

    renderTableOficinas(oficinasCache);
}

function atualizarIndicadoresOrdenacaoOficinas() {
    document.querySelectorAll('[data-oficina-sort]').forEach(button => {
        const icon = button.querySelector('i');
        const ativo = button.dataset.oficinaSort === oficinaSortState.campo;
        button.classList.toggle('active', ativo);
        if (!icon) return;
        icon.className = ativo
            ? `fas fa-sort-${oficinaSortState.direcao === 'asc' ? 'up' : 'down'}`
            : 'fas fa-sort';
    });
}

async function salvarOficina(e) {
    e.preventDefault();
    const id = document.getElementById('oficinaEditingId').value;
    const nome = document.getElementById('oficinaNome').value.trim().toUpperCase();
    const filial = document.getElementById('oficinaFilial').value;
    const itemVerificador = document.getElementById('oficinaItemVerificador').value;

    if (!filiaisPermitidasOficina.some(f => getValorFilialOficina(f) === filial)) {
        alert('Seu usuário não tem permissão para salvar oficina nesta filial.');
        return;
    }

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

        registrarAuditoria(id ? 'ALTERAR' : 'INCLUIR', 'Oficina', `${id ? 'Alteração' : 'Inclusão'} de oficina: ${nome}`);
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

                    registrarAuditoria('EXCLUIR', 'Oficina', `Exclusão de oficina ID ${id} (com desvinculação de registros)`);
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
    const selectFilial = document.getElementById('oficinaFilial');
    if (getFilialUsuarioOficina() && filiaisPermitidasOficina.length === 1 && selectFilial) {
        selectFilial.value = getValorFilialOficina(filiaisPermitidasOficina[0]);
    }
}

function filtrarOficinas(e) {
    const termo = (e?.target?.value ?? document.getElementById('searchOficinaInput')?.value ?? '').toLowerCase();
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
    if (!isAdministradorOficina()) {
        alert('Disponível apenas para administrador.');
        return;
    }

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

        registrarAuditoria(id ? 'ALTERAR' : 'INCLUIR', 'Oficina', `${id ? 'Alteração' : 'Inclusão'} de item de verificação: ${descricao}`);
        alert('Item salvo com sucesso!');
        limparFormularioItem();
        carregarItens(); // Recarrega tabela e select
    } catch (err) {
        console.error('Erro ao salvar item:', err);
        alert('Erro ao salvar: ' + err.message);
    }
}

function editarItem(item) {
    if (!isAdministradorOficina()) {
        alert('Disponível apenas para administrador.');
        return;
    }

    document.getElementById('itemEditingId').value = item.id;
    document.getElementById('itemDescricao').value = item.descricao;
    document.getElementById('btnClearItemForm').classList.remove('hidden');
    document.getElementById('itemDescricao').focus();
}

async function excluirItem(id) {
    if (!isAdministradorOficina()) {
        alert('Disponível apenas para administrador.');
        return;
    }

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
