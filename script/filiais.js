import { supabaseClient } from './supabase.js';

document.addEventListener('DOMContentLoaded', async () => {
    const acessoPermitido = await verificarAdministradorAtual();
    if (!acessoPermitido) {
        mostrarAcessoNegado();
        return;
    }

    carregarFiliais();
    setupEventListeners();
});

async function verificarAdministradorAtual() {
    const {
        data: { session },
        error: sessionError
    } = await supabaseClient.auth.getSession();

    if (sessionError || !session?.user?.id) {
        return false;
    }

    const { data, error } = await supabaseClient
        .from('usuarios')
        .select('nivel, status')
        .eq('auth_user_id', session.user.id)
        .maybeSingle();

    if (error || !data) {
        console.error('Erro ao validar administrador:', error);
        return false;
    }

    return String(data.status || 'ATIVO').toUpperCase() !== 'INATIVO'
        && String(data.nivel || '').toLowerCase() === 'administrador';
}

function mostrarAcessoNegado() {
    document.body.innerHTML = '<div style="text-align: center; padding: 50px;"><h1>Acesso Negado</h1><p>Voce nao tem permissao para acessar esta pagina.</p><a href="dashboard.html">Voltar ao Dashboard</a></div>';
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function normalizarNomeFilial(valor) {
    return String(valor || '').trim().replace(/\s+/g, ' ');
}

function normalizarSiglaFilial(valor) {
    return String(valor || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
}

function normalizarNumeroCoordenada(valor) {
    const texto = String(valor || '').trim().replace(',', '.');
    const numero = Number(texto);
    return Number.isFinite(numero) ? numero : null;
}

function coordenadasValidas(lat, lng) {
    return Number.isFinite(lat)
        && Number.isFinite(lng)
        && Math.abs(lat) <= 90
        && Math.abs(lng) <= 180
        && lat !== 0
        && lng !== 0;
}

function validarGeolocalizacaoFilial(valor) {
    const texto = String(valor || '').trim();
    if (!texto) return { valido: true, texto: '' };

    const match = texto.match(/(-?\d+(?:[.,]\d+)?)\s*[,;]\s*(-?\d+(?:[.,]\d+)?)/);
    if (!match) return { valido: false };

    const lat = normalizarNumeroCoordenada(match[1]);
    const lng = normalizarNumeroCoordenada(match[2]);
    if (!coordenadasValidas(lat, lng)) return { valido: false };

    return { valido: true, texto: `${lat}, ${lng}` };
}

function setupEventListeners() {
    document.getElementById('formFilial').addEventListener('submit', salvarFilial);
    
    document.getElementById('btnCancelar').addEventListener('click', () => {
        limparFormulario();
    });
}

async function carregarFiliais() {
    const tbody = document.getElementById('tabelaFiliais');
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">Carregando...</td></tr>';

    try {
        const { data, error } = await supabaseClient
            .from('filiais')
            .select('id, nome, sigla, geolocalizacao')
            .order('nome', { ascending: true });

        if (error) throw error;

        renderTable(data);
    } catch (err) {
        console.error('Erro ao carregar filiais:', err);
        // Fallback se a tabela não existir ou erro
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:red;">Erro ao carregar dados.</td></tr>';
    }
}

function renderTable(filiais) {
    const tbody = document.getElementById('tabelaFiliais');
    tbody.innerHTML = '';

    if (!filiais || filiais.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Nenhuma filial cadastrada.</td></tr>';
        return;
    }

    filiais.forEach(f => {
        const tr = document.createElement('tr');
        const coordenadasTexto = f.geolocalizacao
            ? escapeHtml(f.geolocalizacao)
            : '<span style="color:#999;">Nao cadastrado</span>';
        tr.innerHTML = `
            <td>${escapeHtml(f.nome)}</td>
            <td><strong>${escapeHtml(f.sigla)}</strong></td>
            <td>${coordenadasTexto}</td>
            <td>
                <button class="btn-icon edit" title="Editar"><i class="fas fa-edit"></i></button>
                <button class="btn-icon delete" title="Excluir"><i class="fas fa-trash"></i></button>
            </td>
        `;

        // Eventos
        tr.querySelector('.edit').addEventListener('click', () => editarFilial(f));
        tr.querySelector('.delete').addEventListener('click', () => excluirFilial(f.id));

        tbody.appendChild(tr);
    });
}

async function salvarFilial(e) {
    e.preventDefault();

    const id = document.getElementById('filialId').value;
    const nome = normalizarNomeFilial(document.getElementById('filialNome').value);
    const sigla = normalizarSiglaFilial(document.getElementById('filialSigla').value);
    const geolocalizacaoInput = document.getElementById('filialGeolocalizacao');
    const resultadoGeo = validarGeolocalizacaoFilial(geolocalizacaoInput.value);

    if (!nome || !sigla) {
        alert('Preencha todos os campos.');
        return;
    }

    if (sigla.length < 2) {
        alert('Informe uma sigla valida com pelo menos 2 caracteres.');
        return;
    }

    if (!resultadoGeo.valido) {
        alert('Geolocalizacao invalida. Use o formato -23.330692, -47.851799 (ou deixe em branco).');
        return;
    }

    const geolocalizacao = resultadoGeo.texto;

    try {
        let error;
        if (id) {
            // Update
            const response = await supabaseClient.from('filiais').update({ nome, sigla, geolocalizacao }).eq('id', id);
            error = response.error;
        } else {
            // Insert
            const response = await supabaseClient.from('filiais').insert([{ nome, sigla, geolocalizacao }]);
            error = response.error;
        }

        if (error) throw error;

        alert('Filial salva com sucesso!');
        limparFormulario();
        carregarFiliais();

    } catch (err) {
        console.error('Erro ao salvar filial:', err);
        alert('Erro ao salvar: ' + err.message);
    }
}

function editarFilial(filial) {
    document.getElementById('filialId').value = filial.id;
    document.getElementById('filialNome').value = filial.nome || '';
    document.getElementById('filialSigla').value = filial.sigla || '';
    document.getElementById('filialGeolocalizacao').value = filial.geolocalizacao || '';
    document.getElementById('btnCancelar').classList.remove('hidden');
}

async function excluirFilial(id) {
    if (!confirm('Tem certeza que deseja excluir esta filial?')) return;

    const { error } = await supabaseClient.from('filiais').delete().eq('id', id);
    if (error) return alert('Erro ao excluir: ' + error.message);
    
    carregarFiliais();
}

function limparFormulario() {
    document.getElementById('formFilial').reset();
    document.getElementById('filialId').value = '';
    document.getElementById('btnCancelar').classList.add('hidden');
}
