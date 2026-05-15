import { supabaseClient } from './supabase.js';

let ocorrencias = [];
let ocorrenciaEditandoId = null;
let sortState = { field: 'data_ocorrencia', ascending: false };
const niveisComExclusao = ['administrador', 'gerencia'];

document.addEventListener('DOMContentLoaded', async () => {
  const hoje = new Date();
  const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  document.getElementById('filtroDataDe').valueAsDate = primeiroDia;
  document.getElementById('filtroDataAte').valueAsDate = hoje;
  document.getElementById('ocorrenciaData').valueAsDate = hoje;

  bindEvents();
  await carregarListas();
  await buscarOcorrencias();
});

function bindEvents() {
  document.getElementById('btnIncluirOcorrencia').addEventListener('click', abrirModal);
  document.getElementById('btnBuscarOcorrencias').addEventListener('click', buscarOcorrencias);
  document.getElementById('btnExportarXLS').addEventListener('click', exportarExcel);
  document.getElementById('btnExportarPDF').addEventListener('click', exportarPDF);
  document.getElementById('filtroLocal').addEventListener('input', renderizarTabela);
  document.getElementById('formOcorrencia').addEventListener('submit', salvarOcorrencia);
  document.getElementById('btnFecharModal').addEventListener('click', fecharModal);
  document.getElementById('btnCancelarOcorrencia').addEventListener('click', fecharModal);
  document.getElementById('modalOcorrencia').addEventListener('click', (event) => {
    if (event.target.id === 'modalOcorrencia') fecharModal();
  });
  document.getElementById('tbodyOcorrencias').addEventListener('click', handleTabelaClick);

  document.querySelectorAll('.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const field = th.dataset.sort;
      sortState.ascending = sortState.field === field ? !sortState.ascending : true;
      sortState.field = field;
      renderizarTabela();
    });
  });
}

async function carregarListas() {
  try {
    const [veiculosRes, motoristasRes, auxiliaresRes, rotasRes] = await Promise.all([
      supabaseClient.from('veiculos').select('placa').eq('situacao', 'ativo').order('placa'),
      supabaseClient.from('funcionario').select('nome, nome_completo').ilike('funcao', '%Motorista%').order('nome'),
      supabaseClient.from('funcionario').select('nome, nome_completo').ilike('funcao', '%Auxiliar%').order('nome'),
      supabaseClient.from('rotas').select('numero').order('numero', { ascending: true })
    ]);

    preencherDatalist('listaPlacas', veiculosRes.data?.map(v => v.placa));
    preencherDatalist('listaMotoristas', motoristasRes.data?.map(nomeFuncionario));
    preencherDatalist('listaAuxiliares', auxiliaresRes.data?.map(nomeFuncionario));
    preencherDatalist('listaRotas', rotasRes.data?.map(r => r.numero));
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

function abrirModal(item = null) {
  document.getElementById('formOcorrencia').reset();
  ocorrenciaEditandoId = item?.id || null;
  document.querySelector('#modalOcorrencia .modal-header h3').textContent = ocorrenciaEditandoId ? 'Editar Ocorrencia' : 'Ocorrencia';
  document.getElementById('btnSalvarOcorrencia').textContent = ocorrenciaEditandoId ? 'Salvar Alteracoes' : 'Salvar';
  document.getElementById('ocorrenciaData').value = item?.data_ocorrencia || new Date().toISOString().split('T')[0];
  document.getElementById('ocorrenciaRota').value = item?.rota || '';
  document.getElementById('ocorrenciaPlaca').value = item?.placa || '';
  document.getElementById('ocorrenciaMotorista').value = item?.motorista || '';
  document.getElementById('ocorrenciaAuxiliar').value = item?.auxiliar || '';
  document.getElementById('ocorrenciaRelatorio').value = item?.relatorio || '';
  document.getElementById('modalOcorrencia').classList.remove('hidden');
}

function fecharModal() {
  ocorrenciaEditandoId = null;
  document.getElementById('modalOcorrencia').classList.add('hidden');
}

async function handleTabelaClick(event) {
  const button = event.target.closest('[data-action]');
  if (!button) return;

  const item = ocorrencias.find(ocorrencia => ocorrencia.id === button.dataset.id);
  if (!item) return;

  if (button.dataset.action === 'editar') {
    abrirModal(item);
    return;
  }

  if (button.dataset.action === 'excluir') {
    if (!usuarioPodeExcluir()) {
      alert('Seu nivel de acesso permite apenas editar ocorrencias.');
      return;
    }
    await excluirOcorrencia(item);
  }
}

async function salvarOcorrencia(event) {
  event.preventDefault();
  const btn = document.getElementById('btnSalvarOcorrencia');
  btn.disabled = true;
  btn.textContent = 'Salvando...';

  try {
    const usuario = JSON.parse(localStorage.getItem('usuarioLogado')) || {};
    const estavaEditando = Boolean(ocorrenciaEditandoId);
    const payload = {
      data_ocorrencia: document.getElementById('ocorrenciaData').value,
      rota: document.getElementById('ocorrenciaRota').value.trim(),
      placa: document.getElementById('ocorrenciaPlaca').value.trim().toUpperCase(),
      motorista: document.getElementById('ocorrenciaMotorista').value.trim(),
      auxiliar: document.getElementById('ocorrenciaAuxiliar').value.trim() || null,
      relatorio: document.getElementById('ocorrenciaRelatorio').value.trim()
    };

    if (!estavaEditando) {
      payload.usuario_id = usuario.id || null;
      payload.usuario_nome = usuario.nome || usuario.nomecompleto || usuario.nome_completo || usuario.usuario_login || 'Sistema';
    }

    const { error } = estavaEditando
      ? await supabaseClient.from('fiscalizacao_ocorrencias').update(payload).eq('id', ocorrenciaEditandoId)
      : await supabaseClient.from('fiscalizacao_ocorrencias').insert([payload]);

    if (error) throw error;

    fecharModal();
    await buscarOcorrencias();
    alert(estavaEditando ? 'Ocorrencia atualizada com sucesso!' : 'Ocorrencia registrada com sucesso!');
  } catch (error) {
    console.error('Erro ao salvar ocorrencia:', error);
    alert(`Erro ao salvar ocorrencia: ${error.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Salvar';
  }
}

async function excluirOcorrencia(item) {
  const confirmar = confirm(`Deseja excluir a ocorrencia da placa ${item.placa || '-'} em ${formatarData(item.data_ocorrencia)}?`);
  if (!confirmar) return;

  try {
    const { error } = await supabaseClient
      .from('fiscalizacao_ocorrencias')
      .delete()
      .eq('id', item.id);

    if (error) throw error;

    await buscarOcorrencias();
    alert('Ocorrencia excluida com sucesso!');
  } catch (error) {
    console.error('Erro ao excluir ocorrencia:', error);
    alert(`Erro ao excluir ocorrencia: ${error.message}`);
  }
}

async function buscarOcorrencias() {
  const btn = document.getElementById('btnBuscarOcorrencias');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Buscando...';

  try {
    const dataDe = document.getElementById('filtroDataDe').value;
    const dataAte = document.getElementById('filtroDataAte').value;
    const placa = document.getElementById('filtroPlaca').value.trim().toUpperCase();
    const motorista = document.getElementById('filtroMotorista').value.trim();
    const rota = document.getElementById('filtroRota').value.trim();

    let query = supabaseClient.from('fiscalizacao_ocorrencias').select('*');
    if (dataDe) query = query.gte('data_ocorrencia', dataDe);
    if (dataAte) query = query.lte('data_ocorrencia', dataAte);
    if (placa) query = query.ilike('placa', `%${placa}%`);
    if (motorista) query = query.ilike('motorista', `%${motorista}%`);
    if (rota) query = query.ilike('rota', `%${rota}%`);

    const { data, error } = await query.order('data_ocorrencia', { ascending: false }).order('created_at', { ascending: false });
    if (error) throw error;

    ocorrencias = data || [];
    renderizarTabela();
  } catch (error) {
    console.error('Erro ao buscar ocorrencias:', error);
    alert(`Erro ao buscar ocorrencias: ${error.message}`);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-search"></i> Buscar';
  }
}

function getDadosGrid() {
  const termo = document.getElementById('filtroLocal').value.trim().toUpperCase();
  let dados = [...ocorrencias];

  if (termo) {
    dados = dados.filter(item => [
      item.data_ocorrencia,
      item.usuario_nome,
      item.rota,
      item.placa,
      item.motorista,
      item.auxiliar,
      item.relatorio
    ].some(valor => String(valor || '').toUpperCase().includes(termo)));
  }

  dados.sort((a, b) => {
    let valA = a[sortState.field] ?? '';
    let valB = b[sortState.field] ?? '';
    if (typeof valA === 'string') valA = valA.toUpperCase();
    if (typeof valB === 'string') valB = valB.toUpperCase();
    if (valA < valB) return sortState.ascending ? -1 : 1;
    if (valA > valB) return sortState.ascending ? 1 : -1;
    return 0;
  });

  return dados;
}

function renderizarTabela() {
  const tbody = document.getElementById('tbodyOcorrencias');
  const dados = getDadosGrid();
  document.getElementById('totalRegistros').textContent = dados.length;

  if (dados.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding: 20px;">Nenhum registro encontrado.</td></tr>';
    atualizarIconesOrdenacao();
    return;
  }

  tbody.innerHTML = dados.map(item => `
    <tr>
      <td>${formatarData(item.data_ocorrencia)}</td>
      <td>${escapeHtml(item.usuario_nome || '-')}</td>
      <td>${escapeHtml(item.rota || '-')}</td>
      <td><strong>${escapeHtml(item.placa || '-')}</strong></td>
      <td>${escapeHtml(item.motorista || '-')}</td>
      <td>${escapeHtml(item.auxiliar || '-')}</td>
      <td class="ocorrencia-texto">${escapeHtml(item.relatorio || '-')}</td>
      <td class="acoes-cell">
        <button type="button" class="btn-grid-action btn-edit" data-action="editar" data-id="${escapeHtml(item.id)}" title="Editar">
          <i class="fas fa-pen"></i>
        </button>
        ${usuarioPodeExcluir() ? `
          <button type="button" class="btn-grid-action btn-delete" data-action="excluir" data-id="${escapeHtml(item.id)}" title="Excluir">
            <i class="fas fa-trash"></i>
          </button>
        ` : ''}
      </td>
    </tr>
  `).join('');

  atualizarIconesOrdenacao();
}

function atualizarIconesOrdenacao() {
  document.querySelectorAll('.sortable i').forEach(i => i.className = 'fas fa-sort');
  const ativo = document.querySelector(`.sortable[data-sort="${sortState.field}"] i`);
  if (ativo) ativo.className = sortState.ascending ? 'fas fa-sort-up' : 'fas fa-sort-down';
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

function usuarioPodeExcluir() {
  const usuario = JSON.parse(localStorage.getItem('usuarioLogado')) || {};
  return niveisComExclusao.includes(String(usuario.nivel || '').toLowerCase());
}

function dadosParaExportacao() {
  return getDadosGrid().map(item => ({
    Data: formatarData(item.data_ocorrencia),
    'Usuario que Registrou': item.usuario_nome || '',
    Rota: item.rota || '',
    Placa: item.placa || '',
    Motorista: item.motorista || '',
    Auxiliar: item.auxiliar || '',
    Ocorrencia: item.relatorio || ''
  }));
}

function exportarExcel() {
  const rows = dadosParaExportacao();
  if (!rows.length) return alert('Nenhum registro para exportar.');
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Ocorrencias');
  XLSX.writeFile(wb, `fiscalizacao_ocorrencias_${Date.now()}.xlsx`);
}

async function getLogoBase64() {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = 'logo.png';
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/jpeg'));
    };
    img.onerror = () => resolve(null);
  });
}

async function exportarPDF() {
  const rows = dadosParaExportacao();
  if (!rows.length) return alert('Nenhum registro para exportar.');
  if (!window.jspdf) return alert('Biblioteca jsPDF nao carregada.');

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('l', 'mm', 'a4');
  const logo = await getLogoBase64();

  if (logo) doc.addImage(logo, 'JPEG', 14, 10, 40, 12);

  doc.setFontSize(18);
  doc.setTextColor(0, 105, 55);
  doc.text('Fiscalizacao - Ocorrencias', 60, 18);
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 283, 18, { align: 'right' });

  doc.autoTable({
    head: [['Data', 'Usuario que Registrou', 'Rota', 'Placa', 'Motorista', 'Auxiliar', 'Ocorrencia']],
    body: rows.map(row => [
      row.Data,
      row['Usuario que Registrou'],
      row.Rota,
      row.Placa,
      row.Motorista,
      row.Auxiliar,
      row.Ocorrencia
    ]),
    startY: 30,
    theme: 'grid',
    headStyles: { fillColor: [0, 105, 55], fontSize: 9 },
    styles: { fontSize: 8, cellPadding: 2 },
    alternateRowStyles: { fillColor: [240, 240, 240] },
    columnStyles: {
      6: { cellWidth: 90 }
    }
  });

  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(`Pagina ${i} de ${pageCount}`, 283, doc.internal.pageSize.getHeight() - 10, { align: 'right' });
  }

  doc.save(`fiscalizacao_ocorrencias_${Date.now()}.pdf`);
}
