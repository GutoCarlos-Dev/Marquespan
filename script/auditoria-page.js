import { supabaseClient } from './supabase.js';
import { registrarAuditoria } from './auditoria-utils.js';

const POR_PAGINA = 100;
let paginaAtual = 1;
let totalRegistros = 0;
let canalPresenca = null;

// Verificação de acesso — somente administrador
const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado'));
if (!usuarioLogado || String(usuarioLogado.nivel || '').toLowerCase() !== 'administrador') {
    alert('⛔ Acesso restrito a administradores.');
    window.location.href = 'dashboard.html';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function escapeHtml(v) {
    return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function formatarTs(ts) {
    if (!ts) return '-';
    return new Date(ts).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

const NOMES_PAGINA = {
    'dashboard.html': 'Dashboard',
    'funcionario.html': 'Funcionários',
    'incluir-manutencao.html': 'Manutenção',
    'buscar-manutencao.html': 'Rel. Manutenção',
    'abastecimento.html': 'Abastecimento',
    'usuarios.html': 'Usuários',
    'auditoria.html': 'Auditoria',
    'veiculos.html': 'Veículos',
    'escala.html': 'Escala',
    'diaria.html': 'Diária',
    'portaria-controle-acesso.html': 'Portaria',
    'compras.html': 'Compras',
    'estoque_geral.html': 'Estoque',
};
const nomePagina = p => NOMES_PAGINA[p] || (p ? p.replace('.html', '') : 'Sistema');

// ---------------------------------------------------------------------------
// Presença — usuários online
// ---------------------------------------------------------------------------
function renderOnlineUsers(state) {
    // Cada key pode ter múltiplas entradas (uma por aba aberta).
    // Deduplica por user_id mantendo a aba com a entrada mais recente.
    const allPresences = Object.values(state).flat();
    const mapaUsuarios = new Map();
    allPresences.forEach(u => {
        const chave = u.user_id ?? u.nome;
        const existente = mapaUsuarios.get(chave);
        if (!existente || new Date(u.entrou_em) > new Date(existente.entrou_em)) {
            mapaUsuarios.set(chave, u);
        }
    });
    const users = [...mapaUsuarios.values()];

    document.getElementById('countOnline').textContent = users.length;

    const container = document.getElementById('onlineUsersGrid');
    if (!users.length) {
        container.innerHTML = '<p style="color:#aaa;font-style:italic;padding:8px 0;">Nenhum usuário online no momento.</p>';
        return;
    }

    const meuId = String(usuarioLogado?.id ?? '');

    container.innerHTML = users.map(u => {
        const ehEuMesmo = String(u.user_id) === meuId;
        return `
        <div class="online-card">
            <div class="online-avatar"><i class="fas fa-user-circle"></i></div>
            <div class="online-info">
                <strong>${escapeHtml(u.nome)}</strong>
                <span><i class="fas fa-building" style="font-size:0.6rem;margin-right:3px;"></i>${escapeHtml(u.filial || 'Global')}</span>
                <span><i class="fas fa-window-maximize" style="font-size:0.6rem;margin-right:3px;"></i>${escapeHtml(nomePagina(u.pagina))}</span>
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
                <div class="online-badge"><i class="fas fa-circle"></i>&nbsp;Online</div>
                ${ehEuMesmo ? '' : `<button onclick="forcarDeslogar(${u.user_id}, '${escapeHtml(u.nome)}')" title="Forçar logout" style="background:#dc3545;color:#fff;border:none;border-radius:6px;padding:3px 8px;font-size:0.68rem;cursor:pointer;font-weight:600;"><i class="fas fa-sign-out-alt"></i> Deslogar</button>`}
            </div>
        </div>`;
    }).join('');
}

function iniciarPresenca() {
    canalPresenca = supabaseClient.channel('presenca_usuarios');
    canalPresenca
        .on('presence', { event: 'sync' }, () => {
            renderOnlineUsers(canalPresenca.presenceState());
        })
        .on('broadcast', { event: 'logout_confirmado' }, ({ payload }) => {
            // Feedback visual quando o usuário confirma que foi deslogado
            const nome = payload?.nome || 'Usuário';
            const toast = document.createElement('div');
            toast.textContent = `✅ ${nome} foi desconectado com sucesso.`;
            Object.assign(toast.style, {
                position:'fixed', bottom:'24px', right:'24px', background:'#28a745',
                color:'#fff', padding:'12px 20px', borderRadius:'8px',
                fontWeight:'600', fontSize:'0.85rem', zIndex:'9999',
                boxShadow:'0 4px 12px rgba(0,0,0,0.2)'
            });
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 4000);
        })
        .subscribe();
}

window.forcarDeslogar = function(userId, nome) {
    if (!confirm(`Deseja forçar o logout de "${nome}"?\n\nO usuário será redirecionado para a tela de login imediatamente.`)) return;

    canalPresenca.send({
        type: 'broadcast',
        event: 'force_logout',
        payload: { user_id: String(userId), nome }
    });

    registrarAuditoria('EXCLUIR', 'Sistema', `Logout forçado do usuário: ${nome} (ID ${userId})`);
};

// ---------------------------------------------------------------------------
// Log de auditoria
// ---------------------------------------------------------------------------
function acaoBadge(acao) {
    return `<span class="badge-acao acao-${escapeHtml(acao)}">${escapeHtml(acao)}</span>`;
}

function getFiltros() {
    return {
        dataInicio: document.getElementById('filtroDataInicio').value,
        dataFim:    document.getElementById('filtroDataFim').value,
        usuario:    document.getElementById('filtroUsuario').value.trim(),
        modulo:     document.getElementById('filtroModulo').value,
        acao:       document.getElementById('filtroAcao').value,
    };
}

function buildQuery(base, f) {
    if (f.dataInicio) base = base.gte('timestamp', f.dataInicio + 'T00:00:00-03:00');
    if (f.dataFim)    base = base.lte('timestamp', f.dataFim   + 'T23:59:59-03:00');
    if (f.usuario)    base = base.ilike('usuario_nome', `%${f.usuario}%`);
    if (f.modulo)     base = base.eq('modulo', f.modulo);
    if (f.acao)       base = base.eq('acao', f.acao);
    return base;
}

async function carregarLog() {
    const tbody = document.getElementById('tbodyAuditoria');
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;color:#888;">Carregando...</td></tr>';

    const f = getFiltros();
    const inicio = (paginaAtual - 1) * POR_PAGINA;
    const fim    = paginaAtual * POR_PAGINA - 1;

    let query = buildQuery(
        supabaseClient.from('auditoria_sistema').select('*', { count: 'exact' }).order('timestamp', { ascending: false }).range(inicio, fim),
        f
    );

    const { data, error, count } = await query;

    if (error) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:red;">Erro ao carregar dados. Verifique se a tabela foi criada no Supabase.</td></tr>';
        console.error('[Auditoria] Erro ao carregar log:', error);
        return;
    }

    totalRegistros = count ?? 0;
    document.getElementById('countTotal').textContent = totalRegistros.toLocaleString('pt-BR');

    if (!data?.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#888;padding:20px;">Nenhum registro encontrado com os filtros aplicados.</td></tr>';
        document.getElementById('paginacaoInfo').textContent = '';
        document.getElementById('btnPrev').disabled = true;
        document.getElementById('btnNext').disabled = true;
        return;
    }

    tbody.innerHTML = data.map(r => `
        <tr>
            <td style="white-space:nowrap;font-size:0.82rem;">${formatarTs(r.timestamp)}</td>
            <td><strong>${escapeHtml(r.usuario_nome)}</strong></td>
            <td style="font-size:0.82rem;">${escapeHtml(r.filial || '-')}</td>
            <td>${acaoBadge(r.acao)}</td>
            <td style="font-size:0.82rem;">${escapeHtml(r.modulo)}</td>
            <td class="descricao-cell" title="${escapeHtml(r.descricao)}">${escapeHtml(r.descricao)}</td>
        </tr>
    `).join('');

    const totalPaginas = Math.ceil(totalRegistros / POR_PAGINA);
    document.getElementById('paginacaoInfo').textContent =
        `Página ${paginaAtual} de ${totalPaginas} — ${totalRegistros.toLocaleString('pt-BR')} registros`;
    document.getElementById('btnPrev').disabled = paginaAtual <= 1;
    document.getElementById('btnNext').disabled = paginaAtual >= totalPaginas;
}

async function carregarStatsHoje() {
    const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    const { count } = await supabaseClient
        .from('auditoria_sistema')
        .select('*', { count: 'exact', head: true })
        .gte('timestamp', hoje + 'T00:00:00-03:00')
        .lte('timestamp', hoje + 'T23:59:59-03:00');
    document.getElementById('countHoje').textContent = (count ?? 0).toLocaleString('pt-BR');
}

// ---------------------------------------------------------------------------
// Ações globais (chamadas pelo HTML)
// ---------------------------------------------------------------------------
window.aplicarFiltros = function () {
    paginaAtual = 1;
    carregarLog();
};

window.limparFiltros = function () {
    ['filtroDataInicio', 'filtroDataFim', 'filtroUsuario'].forEach(id => document.getElementById(id).value = '');
    ['filtroModulo', 'filtroAcao'].forEach(id => document.getElementById(id).value = '');
    paginaAtual = 1;
    carregarLog();
};

window.mudarPagina = function (dir) {
    paginaAtual = Math.max(1, paginaAtual + dir);
    carregarLog();
};

window.exportarXLSX = async function () {
    const f = getFiltros();
    let query = buildQuery(
        supabaseClient.from('auditoria_sistema')
            .select('timestamp, usuario_nome, filial, acao, modulo, descricao')
            .order('timestamp', { ascending: false })
            .limit(5000),
        f
    );

    const { data, error } = await query;
    if (error || !data?.length) { alert('⚠️ Sem dados para exportar com os filtros atuais.'); return; }

    const rows = data.map(r => ({
        'Data/Hora':  formatarTs(r.timestamp),
        'Usuário':    r.usuario_nome,
        'Filial':     r.filial || '-',
        'Ação':       r.acao,
        'Módulo':     r.modulo,
        'Descrição':  r.descricao,
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Auditoria');
    XLSX.writeFile(wb, `auditoria_${new Date().toLocaleDateString('en-CA')}.xlsx`);
};

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    iniciarPresenca();
    carregarLog();
    carregarStatsHoje();

    // Enter nos campos de filtro dispara a busca
    ['filtroUsuario', 'filtroDataInicio', 'filtroDataFim'].forEach(id => {
        document.getElementById(id)?.addEventListener('keydown', e => {
            if (e.key === 'Enter') aplicarFiltros();
        });
    });
    ['filtroModulo', 'filtroAcao'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', aplicarFiltros);
    });
});
