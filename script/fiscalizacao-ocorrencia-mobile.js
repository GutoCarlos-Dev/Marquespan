import { supabaseClient } from './supabase.js';

let ocorrencias = [];

document.addEventListener('DOMContentLoaded', async () => {
  const hoje = new Date().toISOString().split('T')[0];
  document.getElementById('mobileData').value = hoje;
  document.getElementById('mobileFiltroData').value = hoje;
  mostrarUsuario();
  bindEvents();
  await carregarListas();
  await carregarOcorrencias();
});

function bindEvents() {
  document.getElementById('btnAdicionarOcorrencia').addEventListener('click', abrirModal);
  document.getElementById('btnFecharModalMobile').addEventListener('click', fecharModal);
  document.getElementById('modalOcorrenciaMobile').addEventListener('click', (event) => {
    if (event.target.id === 'modalOcorrenciaMobile') fecharModal();
  });
  document.getElementById('formOcorrenciaMobile').addEventListener('submit', salvarOcorrencia);
  document.getElementById('btnAtualizarMobile').addEventListener('click', carregarOcorrencias);
  document.getElementById('mobileFiltroData').addEventListener('change', carregarOcorrencias);
  document.getElementById('mobileBusca').addEventListener('input', renderCards);
}

function mostrarUsuario() {
  const usuario = JSON.parse(localStorage.getItem('usuarioLogado')) || {};
  document.getElementById('usuarioAtual').textContent = usuario.nome || usuario.nomecompleto || usuario.nome_completo || usuario.usuario_login || 'Usuario';
}

function abrirModal() {
  document.getElementById('formOcorrenciaMobile').reset();
  document.getElementById('mobileData').value = new Date().toISOString().split('T')[0];
  mostrarUsuario();
  document.getElementById('modalOcorrenciaMobile').classList.remove('hidden');
}

function fecharModal() {
  document.getElementById('modalOcorrenciaMobile').classList.add('hidden');
}

async function carregarListas() {
  try {
    const [veiculosRes, motoristasRes, auxiliaresRes, rotasRes] = await Promise.all([
      supabaseClient.from('veiculos').select('placa').eq('situacao', 'ativo').order('placa'),
      supabaseClient.from('funcionario').select('nome, nome_completo').ilike('funcao', '%Motorista%').order('nome'),
      supabaseClient.from('funcionario').select('nome, nome_completo').ilike('funcao', '%Auxiliar%').order('nome'),
      supabaseClient.from('rotas').select('numero').order('numero', { ascending: true })
    ]);

    preencherDatalist('listaPlacasMobile', veiculosRes.data?.map(v => v.placa));
    preencherDatalist('listaMotoristasMobile', motoristasRes.data?.map(nomeFuncionario));
    preencherDatalist('listaAuxiliaresMobile', auxiliaresRes.data?.map(nomeFuncionario));
    preencherDatalist('listaRotasMobile', rotasRes.data?.map(r => r.numero));
  } catch (error) {
    console.error('Erro ao carregar listas:', error);
  }
}

function preencherDatalist(id, valores = []) {
  const datalist = document.getElementById(id);
  datalist.innerHTML = '';
  [...new Set(valores.filter(Boolean))].forEach(valor => {
    const option = document.createElement('option');
    option.value = valor;
    datalist.appendChild(option);
  });
}

function nomeFuncionario(funcionario) {
  return funcionario?.nome_completo || funcionario?.nome || '';
}

async function salvarOcorrencia(event) {
  event.preventDefault();
  const btn = document.getElementById('btnSalvarMobile');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';

  try {
    const usuario = JSON.parse(localStorage.getItem('usuarioLogado')) || {};
    const payload = {
      data_ocorrencia: document.getElementById('mobileData').value,
      rota: document.getElementById('mobileRota').value.trim(),
      placa: document.getElementById('mobilePlaca').value.trim().toUpperCase(),
      motorista: document.getElementById('mobileMotorista').value.trim(),
      auxiliar: document.getElementById('mobileAuxiliar').value.trim() || null,
      relatorio: document.getElementById('mobileRelatorio').value.trim(),
      usuario_id: usuario.id || null,
      usuario_nome: usuario.nome || usuario.nomecompleto || usuario.nome_completo || usuario.usuario_login || 'Sistema'
    };

    const { error } = await supabaseClient.from('fiscalizacao_ocorrencias').insert([payload]);
    if (error) throw error;

    document.getElementById('formOcorrenciaMobile').reset();
    document.getElementById('mobileData').value = payload.data_ocorrencia;
    document.getElementById('mobileFiltroData').value = payload.data_ocorrencia;
    fecharModal();
    await carregarOcorrencias();
    alert('Ocorrencia registrada com sucesso!');
  } catch (error) {
    console.error('Erro ao salvar ocorrencia:', error);
    alert(`Erro ao salvar ocorrencia: ${error.message}`);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-save"></i> SALVAR OCORRENCIA';
  }
}

async function carregarOcorrencias() {
  const container = document.getElementById('listaOcorrenciasMobile');
  const data = document.getElementById('mobileFiltroData').value;
  container.innerHTML = '<div class="empty-state"><i class="fas fa-spinner fa-spin"></i> Carregando...</div>';

  try {
    let query = supabaseClient
      .from('fiscalizacao_ocorrencias')
      .select('*')
      .order('created_at', { ascending: false });

    if (data) query = query.eq('data_ocorrencia', data);

    const { data: rows, error } = await query;
    if (error) throw error;

    ocorrencias = rows || [];
    renderCards();
  } catch (error) {
    console.error('Erro ao carregar ocorrencias:', error);
    container.innerHTML = '<div class="empty-state" style="color:#dc3545;">Erro ao carregar ocorrencias.</div>';
  }
}

function renderCards() {
  const container = document.getElementById('listaOcorrenciasMobile');
  const busca = document.getElementById('mobileBusca').value.trim().toUpperCase();

  const filtradas = ocorrencias.filter(item => [
    item.data_ocorrencia,
    item.usuario_nome,
    item.rota,
    item.placa,
    item.motorista,
    item.auxiliar,
    item.relatorio
  ].some(valor => String(valor || '').toUpperCase().includes(busca)));

  document.getElementById('totalMobile').textContent = filtradas.length;

  if (!filtradas.length) {
    container.innerHTML = '<div class="empty-state">Nenhuma ocorrencia encontrada.</div>';
    return;
  }

  container.innerHTML = filtradas.map(item => `
    <article class="ocorrencia-card">
      <div class="card-top">
        <h3>${escapeHtml(item.placa || 'Sem placa')}</h3>
        <span class="card-date">${formatarData(item.data_ocorrencia)}</span>
      </div>
      <div class="card-info">
        <span><i class="fas fa-route"></i><strong>Rota:</strong> ${escapeHtml(item.rota || '-')}</span>
        <span><i class="fas fa-user-tie"></i><strong>Motorista:</strong> ${escapeHtml(item.motorista || '-')}</span>
        <span><i class="fas fa-user"></i><strong>Auxiliar:</strong> ${escapeHtml(item.auxiliar || '-')}</span>
        <span><i class="fas fa-pen"></i><strong>Registro:</strong> ${escapeHtml(item.usuario_nome || '-')}</span>
      </div>
      <p class="card-report">${escapeHtml(item.relatorio || '-')}</p>
    </article>
  `).join('');
}

function formatarData(data) {
  if (!data) return '-';
  return new Date(`${data}T00:00:00`).toLocaleDateString('pt-BR');
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
