import { supabaseClient, supabaseKey } from './supabase.js';
import { registrarAuditoria } from './auditoria-utils.js';

const USUARIOS_PAGE_ID = 'usuarios.html';
const ADMIN_USUARIOS_FUNCTION_URL = 'https://hlzcycvlcuhgnnjkmslt.supabase.co/functions/v1/admin-usuarios';
const NIVEIS_GERENCIAMENTO_USUARIOS = new Set(['administrador']);
const CONFIGURACAO_SESSAO_ID = 'global';
const TEMPO_INATIVIDADE_PADRAO_MINUTOS = 30;

let usuariosCache = [];
let sortConfig = { column: 'nome', direction: 'asc' };
let configuracaoInatividadeDisponivel = true;

document.addEventListener('DOMContentLoaded', async () => {
    const acessoPermitido = await verificarPermissaoPaginaUsuarios();
    if (!acessoPermitido) {
        document.body.innerHTML = '<div style="text-align: center; padding: 50px;"><h1>Acesso Negado</h1><p>Voce nao tem permissao para acessar esta pagina.</p><a href="dashboard.html">Voltar ao Dashboard</a></div>';
        return;
    }

    carregarUsuarios();
    carregarNiveis();
    carregarFiliais();
    setupEventListeners();
    carregarConfiguracaoSessao();
});

function getUsuarioAtual() {
    try {
        return JSON.parse(localStorage.getItem('usuarioLogado') || 'null');
    } catch {
        return null;
    }
}

async function verificarPermissaoPaginaUsuarios() {
    const usuario = getUsuarioAtual();
    const nivel = String(usuario?.nivel || '').toLowerCase();

    if (!NIVEIS_GERENCIAMENTO_USUARIOS.has(nivel)) {
        return false;
    }

    if (nivel === 'administrador') {
        return true;
    }

    try {
        const { data, error } = await supabaseClient
            .from('nivel_permissoes')
            .select('paginas_permitidas')
            .eq('nivel', nivel)
            .maybeSingle();

        if (error) throw error;
        return Array.isArray(data?.paginas_permitidas) && data.paginas_permitidas.includes(USUARIOS_PAGE_ID);
    } catch (err) {
        console.error('Erro ao verificar permissao da pagina:', err);
        return false;
    }
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

async function getAdminUsuariosHeaders() {
    const {
        data: { session },
        error
    } = await supabaseClient.auth.getSession();

    if (error || !session?.access_token) {
        throw new Error('Sessao expirada. Faca login novamente.');
    }

    return {
        'Content-Type': 'application/json',
        apikey: supabaseKey,
        Authorization: `Bearer ${session.access_token}`
    };
}

function setupEventListeners() {
    document.getElementById('formConfiguracaoSessao')?.addEventListener('submit', salvarConfiguracaoSessao);

    // Botão Novo Usuário
    document.getElementById('btnAdicionarNovo').addEventListener('click', () => {
        document.getElementById('cadastro').classList.remove('hidden');
        document.getElementById('busca').classList.add('hidden');
        limparFormulario();
    });

    // Botão Cancelar
    document.getElementById('btnCancelar').addEventListener('click', () => {
        document.getElementById('cadastro').classList.add('hidden');
        document.getElementById('busca').classList.remove('hidden');
        limparFormulario();
    });

    // Botão Atualizar Lista
    document.getElementById('btnAtualizarLista').addEventListener('click', carregarUsuarios);

    // Form Submit
    document.getElementById('formUsuario').addEventListener('submit', salvarUsuario);

    // Busca em tempo real
    document.getElementById('termoBusca').addEventListener('input', (e) => {
        const termo = e.target.value.toLowerCase();
        const linhas = document.querySelectorAll('#corpoTabelaUsuarios tr');
        
        linhas.forEach(linha => {
            const texto = linha.textContent.toLowerCase();
            linha.style.display = texto.includes(termo) ? '' : 'none';
        });
    });

    // Ordenação da tabela
    document.querySelectorAll('#tabelaUsuarios thead th[data-sort]').forEach(th => {
        th.addEventListener('click', () => {
            const column = th.dataset.sort;
            if (sortConfig.column === column) {
                sortConfig.direction = sortConfig.direction === 'asc' ? 'desc' : 'asc';
            } else {
                sortConfig.column = column;
                sortConfig.direction = 'asc';
            }
            renderTable(usuariosCache);
        });
    });
}

function atualizarStatusConfiguracao(mensagem, tipo = '') {
    const status = document.getElementById('statusConfiguracaoSessao');
    if (!status) return;

    status.textContent = mensagem;
    status.className = `session-config-status ${tipo}`.trim();
}

async function carregarConfiguracaoSessao() {
    const select = document.getElementById('tempoInatividade');
    if (!select) return;

    atualizarStatusConfiguracao('Carregando configuracao...');

    try {
        const { data, error } = await supabaseClient
            .from('configuracoes_sistema')
            .select('tempo_inatividade_minutos')
            .eq('id', CONFIGURACAO_SESSAO_ID)
            .maybeSingle();

        if (error) throw error;

        const minutos = Number(data?.tempo_inatividade_minutos);
        select.value = String(Number.isFinite(minutos) && minutos >= 0
            ? minutos
            : TEMPO_INATIVIDADE_PADRAO_MINUTOS);
        atualizarStatusConfiguracao('');
    } catch (error) {
        configuracaoInatividadeDisponivel = false;
        console.warn('Configuracao de inatividade ainda nao foi criada no Supabase.');
        select.value = String(TEMPO_INATIVIDADE_PADRAO_MINUTOS);
        select.disabled = true;
        document.getElementById('btnSalvarConfiguracaoSessao').disabled = true;
        atualizarStatusConfiguracao('Execute o script SQL de configuracao no Supabase.', 'error');
    }
}

async function salvarConfiguracaoSessao(event) {
    event.preventDefault();

    const select = document.getElementById('tempoInatividade');
    const botao = document.getElementById('btnSalvarConfiguracaoSessao');
    const minutos = Number(select?.value);
    if (!Number.isInteger(minutos) || minutos < 0 || minutos > 1440) {
        atualizarStatusConfiguracao('Informe um valor entre 0 e 1440 minutos.', 'error');
        return;
    }

    botao.disabled = true;
    atualizarStatusConfiguracao('Salvando...');

    try {
        const { error } = await supabaseClient
            .from('configuracoes_sistema')
            .upsert({
                id: CONFIGURACAO_SESSAO_ID,
                tempo_inatividade_minutos: minutos,
                atualizado_em: new Date().toISOString()
            }, { onConflict: 'id' });

        if (error) throw error;

        const descricao = minutos === 0
            ? 'Logout por inatividade desativado.'
            : `Tempo definido para ${minutos} minutos.`;
        atualizarStatusConfiguracao(descricao, 'success');
    } catch (error) {
        console.error('Erro ao salvar configuracao da sessao:', error);
        atualizarStatusConfiguracao('Nao foi possivel salvar a configuracao.', 'error');
    } finally {
        botao.disabled = false;
    }
}

async function carregarNiveis() {
    const selectNivel = document.getElementById('nivel');
    try {
        const { data, error } = await supabaseClient
            .from('nivel_permissoes')
            .select('nivel')
            .order('nivel');

        if (error) throw error;

        // Limpa opções exceto a primeira
        selectNivel.innerHTML = '<option value="" disabled selected>Selecione o nível</option>';
        
        const niveis = new Map();
        (data || []).forEach(({ nivel }) => {
            const valor = String(nivel || '').trim();
            if (!valor) return;

            const chave = valor.toLowerCase();
            const atual = niveis.get(chave);
            if (!atual || valor === chave) {
                niveis.set(chave, valor);
            }
        });

        Array.from(niveis.values()).sort((a, b) => a.localeCompare(b)).forEach(nivel => {
            const option = document.createElement('option');
            option.value = nivel;
            option.textContent = nivel;
            selectNivel.appendChild(option);
        });

    } catch (err) {
        console.error('Erro ao carregar níveis:', err);
        // Fallback básico
        selectNivel.innerHTML += '<option value="administrador">administrador</option><option value="Usuario">Usuário</option>';
    }
}

async function carregarFiliais() {
    const selectFilial = document.getElementById('filial');
    if (!selectFilial) return;

    try {
        const { data, error } = await supabaseClient
            .from('filiais')
            .select('nome, sigla')
            .order('nome');

        if (error) throw error;

        // Mantém a opção padrão e adiciona as do banco
        selectFilial.innerHTML = '<option value="" selected>Todas (Acesso Global)</option>';

        if (data) {
            data.forEach(f => {
                const option = document.createElement('option');
                option.value = f.sigla || f.nome;
                option.textContent = f.sigla ? `${f.nome} (${f.sigla})` : f.nome;
                selectFilial.appendChild(option);
            });
        }
    } catch (err) {
        console.error('Erro ao carregar filiais:', err);
    }
}

async function carregarUsuarios() {
    const tbody = document.getElementById('corpoTabelaUsuarios');
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;">Carregando...</td></tr>';

    try {
        let { data, error } = await supabaseClient
            .from('usuarios')
            .select('id, auth_user_id, nome, nomecompleto, email, nivel, filial, status, status_updated_at, tempo_inatividade_minutos')
            .order('nome', { ascending: true });

        if (error) {
            const fallback = await supabaseClient
                .from('usuarios')
                .select('id, auth_user_id, nome, nomecompleto, email, nivel, filial, status, status_updated_at')
                .order('nome', { ascending: true });

            if (fallback.error) throw fallback.error;

            configuracaoInatividadeDisponivel = false;
            data = (fallback.data || []).map(usuario => ({
                ...usuario,
                tempo_inatividade_minutos: null
            }));
        }

        usuariosCache = data;
        renderTable(usuariosCache);
    } catch (err) {
        console.error('Erro ao carregar usuários:', err);
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; color:red;">Erro ao carregar dados.</td></tr>';
    }
}

function renderTable(usuarios) {
    const tbody = document.getElementById('corpoTabelaUsuarios');
    tbody.innerHTML = '';

    if (usuarios.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;">Nenhum usuário encontrado.</td></tr>';
        return;
    }

    // Ordenar dados localmente antes de renderizar
    const sorted = [...usuarios].sort((a, b) => {
        let valA = a[sortConfig.column];
        let valB = b[sortConfig.column];

        if (sortConfig.column === 'nomecompleto') {
            valA = a.nomecompleto || '';
            valB = b.nomecompleto || '';
        }

        if (sortConfig.column === 'status') {
            valA = getExibicaoStatus(a);
            valB = getExibicaoStatus(b);
        }

        if (valA === null || valA === undefined) valA = '';
        if (valB === null || valB === undefined) valB = '';

        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();

        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
    });

    sorted.forEach(u => {
        const statusExibicao = getExibicaoStatus(u);
        const statusClass = `status-${String(statusExibicao).toLowerCase().replace(/[^a-z0-9_-]/g, '-')}`;
        const possuiTempoIndividual = u.tempo_inatividade_minutos !== null
            && u.tempo_inatividade_minutos !== undefined;
        const tempoIndividual = possuiTempoIndividual ? Number(u.tempo_inatividade_minutos) : null;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${escapeHtml(u.id)}</td>
            <td>${escapeHtml(u.nome)}</td>
            <td>${escapeHtml(u.nomecompleto || '-')}</td>
            <td>${escapeHtml(u.email || '-')}</td>
            <td>${escapeHtml(u.nivel || '-')}</td>
            <td>${escapeHtml(u.filial || 'Todas')}</td>
            <td style="text-align:center;"><span class="badge-status ${statusClass}">${escapeHtml(statusExibicao)}</span></td>
            <td style="text-align:center;">
                <select
                    class="user-idle-select ${tempoIndividual === 0 ? 'isento' : ''}"
                    title="${configuracaoInatividadeDisponivel ? 'Regra de inatividade' : 'Execute a migracao SQL para habilitar'}"
                    ${configuracaoInatividadeDisponivel ? '' : 'disabled'}
                >
                    <option value="" ${!possuiTempoIndividual ? 'selected' : ''}>Padrao global</option>
                    <option value="0" ${tempoIndividual === 0 ? 'selected' : ''}>Isento</option>
                    <option value="5" ${tempoIndividual === 5 ? 'selected' : ''}>5 minutos</option>
                    <option value="10" ${tempoIndividual === 10 ? 'selected' : ''}>10 minutos</option>
                    <option value="15" ${tempoIndividual === 15 ? 'selected' : ''}>15 minutos</option>
                    <option value="30" ${tempoIndividual === 30 ? 'selected' : ''}>30 minutos</option>
                    <option value="60" ${tempoIndividual === 60 ? 'selected' : ''}>1 hora</option>
                    <option value="120" ${tempoIndividual === 120 ? 'selected' : ''}>2 horas</option>
                    <option value="240" ${tempoIndividual === 240 ? 'selected' : ''}>4 horas</option>
                    <option value="480" ${tempoIndividual === 480 ? 'selected' : ''}>8 horas</option>
                </select>
            </td>
            <td>
                <button class="btn-icon edit" title="Editar"><i class="fas fa-edit"></i></button>
                <button class="btn-icon delete" title="Excluir"><i class="fas fa-trash"></i></button>
            </td>
        `;

        // Eventos dos botões
        tr.querySelector('.edit').addEventListener('click', () => editarUsuario(u));
        tr.querySelector('.delete').addEventListener('click', () => excluirUsuario(u.id));
        tr.querySelector('.user-idle-select').addEventListener('change', event => {
            salvarRegraInatividadeUsuario(u, event.target);
        });

        tbody.appendChild(tr);
    });

    updateSortIcons();
}

async function salvarRegraInatividadeUsuario(usuario, select) {
    const valorAnterior = usuario.tempo_inatividade_minutos;
    const novoValor = select.value === '' ? null : Number(select.value);
    select.disabled = true;

    try {
        const { error } = await supabaseClient
            .from('usuarios')
            .update({ tempo_inatividade_minutos: novoValor })
            .eq('id', usuario.id);

        if (error) throw error;

        usuario.tempo_inatividade_minutos = novoValor;
        select.classList.toggle('isento', novoValor === 0);
        registrarAuditoria(
            'ALTERAR',
            'Usuarios',
            `Regra de inatividade de ${usuario.nome}: ${descreverRegraInatividade(novoValor)}`
        );
    } catch (error) {
        console.error('Erro ao salvar regra individual de inatividade:', error);
        select.value = valorAnterior === null || valorAnterior === undefined ? '' : String(valorAnterior);
        alert('Nao foi possivel salvar a regra de inatividade deste usuario.');
    } finally {
        select.disabled = false;
    }
}

function descreverRegraInatividade(minutos) {
    if (minutos === null || minutos === undefined) return 'padrao global';
    if (minutos === 0) return 'isento';
    return `${minutos} minutos`;
}

function getExibicaoStatus(u) {
    let statusExibicao = u.status || 'ATIVO';
    if (statusExibicao === 'TEMPORARIO' && u.status_updated_at) {
        const dataInicio = new Date(u.status_updated_at);
        const agora = new Date();
        const diffHoras = (agora - dataInicio) / (1000 * 60 * 60);
        if (diffHoras >= 24) return 'INATIVO';
    }
    return statusExibicao;
}

function updateSortIcons() {
    document.querySelectorAll('#tabelaUsuarios thead th[data-sort] i').forEach(icon => {
        icon.className = 'fas fa-sort';
        const th = icon.closest('th');
        if (th.dataset.sort === sortConfig.column) {
            icon.className = sortConfig.direction === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down';
        }
    });
}

async function salvarUsuario(e) {
    e.preventDefault();

    const id = document.getElementById('usuarioId').value;
    const nome = document.getElementById('nome').value.trim();
    const nomecompleto = document.getElementById('nomecompleto').value.trim();
    const email = document.getElementById('email').value.trim();
    const nivel = document.getElementById('nivel').value;
    const filial = document.getElementById('filial').value;
    const status = document.getElementById('status').value;
    const senha = document.getElementById('senha').value.trim();

    if (!nome || !nivel || !status) {
        alert('⚠️ Preencha nome, nível e status.');
        return;
    }

    if (!id && !senha) {
        alert('⚠️ Senha é obrigatória para novos usuários.');
        return;
    }

    const btnSalvar = document.querySelector('#formUsuario button[type="submit"]');

    try {
        btnSalvar.disabled = true;
        btnSalvar.innerText = 'Salvando...';

        const payload = {
            acao: id ? 'editar' : 'criar',
            id: id || null,
            nome,
            nomecompleto,
            email,
            nivel,
            filial,
            status,
            senha
        };

        const response = await fetch(
            ADMIN_USUARIOS_FUNCTION_URL,
            {
                method: 'POST',
                headers: await getAdminUsuariosHeaders(),
                body: JSON.stringify(payload)
            }
        );

        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(result.error || 'Erro ao salvar usuário.');
        }

        registrarAuditoria(id ? 'ALTERAR' : 'INCLUIR', 'Usuários', `${id ? 'Alteração' : 'Inclusão'} do usuário ${nome} (Nível: ${nivel})`);
        alert('✅ Usuário salvo com sucesso!');
        document.getElementById('btnCancelar').click();
        carregarUsuarios();

    } catch (err) {
        console.error('Erro ao salvar usuário:', err);
        alert('❌ ' + err.message);
    } finally {
        btnSalvar.disabled = false;
        btnSalvar.innerText = 'Salvar';
    }
}

function editarUsuario(usuario) {
    document.getElementById('usuarioId').value = usuario.id;
    document.getElementById('nome').value = usuario.nome;
    document.getElementById('nomecompleto').value = usuario.nomecompleto || '';
    document.getElementById('email').value = usuario.email || '';
    document.getElementById('nivel').value = usuario.nivel;
    document.getElementById('status').value = usuario.status || 'ATIVO';
    document.getElementById('filial').value = usuario.filial || '';
    document.getElementById('senha').value = ''; // Senha fica vazia para não alterar

    document.getElementById('cadastro').classList.remove('hidden');
    document.getElementById('busca').classList.add('hidden');
}

async function excluirUsuario(id) {
    const usuarioAtual = getUsuarioAtual();
    if (String(usuarioAtual?.id || '') === String(id)) {
        alert('Voce nao pode excluir o proprio usuario logado.');
        return;
    }

    if (!confirm('Tem certeza que deseja excluir este usuário?')) return;

    try {
        const response = await fetch(
            ADMIN_USUARIOS_FUNCTION_URL,
            {
                method: 'POST',
                headers: await getAdminUsuariosHeaders(),
                body: JSON.stringify({ acao: 'excluir', id })
            }
        );

        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(result.error || 'Erro ao excluir usuario.');
        }
        
        registrarAuditoria('EXCLUIR', 'Usuários', `Exclusão do usuário ID ${id}`);
        alert('Usuário excluído com sucesso!');
        carregarUsuarios();
    } catch (err) {
        console.error('Erro ao excluir:', err);
        alert('Erro ao excluir: ' + err.message);
    }
}

function limparFormulario() {
    document.getElementById('formUsuario').reset();
    document.getElementById('usuarioId').value = '';
}
