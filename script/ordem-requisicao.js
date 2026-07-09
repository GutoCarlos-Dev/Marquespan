const STORAGE_KEY_REQUISICOES = 'marquespan_ordem_requisicao_salvas_v1';

let clienteIndex = 0;
let requisicaoAtualId = null;

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('dataOrdem').value = new Date().toISOString().slice(0, 10);
  atualizarSemanaPorData();
  document.getElementById('dataOrdem').addEventListener('change', atualizarSemanaPorData);
  document.getElementById('btnAdicionarCliente').addEventListener('click', () => adicionarCliente({}, true));
  document.getElementById('btnSalvarLocal').addEventListener('click', salvarRequisicaoLocal);
  document.getElementById('btnGerarPDF').addEventListener('click', baixarPDF);
  document.getElementById('btnCompartilharWhatsapp').addEventListener('click', compartilharWhatsapp);
  document.getElementById('btnLimparFormulario').addEventListener('click', limparFormulario);
  document.getElementById('supervisorNome').addEventListener('input', aplicarMaiusculo);
  adicionarCliente({}, false);
  renderizarRequisicoesSalvas();
});

function aplicarMaiusculo(event) {
  const input = event.target;
  const inicio = input.selectionStart;
  const fim = input.selectionEnd;
  input.value = String(input.value || '').toLocaleUpperCase('pt-BR');
  input.setSelectionRange?.(inicio, fim);
}

function adicionarCliente(dados = {}, focar = true) {
  clienteIndex += 1;
  const container = document.getElementById('clientesContainer');
  const card = document.createElement('article');
  card.className = 'cliente-card';
  card.dataset.clienteId = String(clienteIndex);
  card.innerHTML = `
    <div class="cliente-card-header">
      <strong>Cliente ${clienteIndex}</strong>
      <button type="button" class="btn-remove" title="Remover cliente"><i class="fas fa-trash"></i></button>
    </div>
    <div class="form-group">
      <label>Ordem</label>
      <input type="number" class="glass-input cliente-ordem" min="1" step="1" inputmode="numeric" value="${escapeHtml(dados.ordem || clienteIndex)}">
    </div>
    <div class="form-group">
      <label>Nome do Cliente</label>
      <input type="text" class="glass-input cliente-nome" placeholder="NOME DO CLIENTE" autocomplete="off" autocapitalize="characters" value="${escapeHtml(dados.nome || '')}">
    </div>
    <div class="form-group">
      <label>Cidade</label>
      <input type="text" class="glass-input cliente-cidade" placeholder="Cidade" autocomplete="off" autocapitalize="characters" value="${escapeHtml(dados.cidade || '')}">
    </div>
    <div class="form-group">
      <label>OBS.</label>
      <textarea class="glass-input cliente-obs" rows="2" placeholder="Observacao" autocapitalize="characters">${escapeHtml(dados.obs || '')}</textarea>
    </div>
  `;

  card.querySelector('.cliente-nome').addEventListener('input', aplicarMaiusculo);
  card.querySelector('.cliente-cidade').addEventListener('input', aplicarMaiusculo);
  card.querySelector('.cliente-obs').addEventListener('input', aplicarMaiusculo);
  card.querySelector('.btn-remove').addEventListener('click', () => {
    if (document.querySelectorAll('.cliente-card').length === 1) {
      card.querySelectorAll('input, textarea').forEach(input => {
        input.value = input.classList.contains('cliente-ordem') ? '1' : '';
      });
      return;
    }
    card.remove();
    renumerarOrdensVazias();
  });

  container.appendChild(card);
  atualizarTitulosClientes();
  if (focar) {
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => card.querySelector('.cliente-nome').focus(), 250);
  }
}

function renumerarOrdensVazias() {
  document.querySelectorAll('.cliente-card').forEach((card, index) => {
    const ordem = card.querySelector('.cliente-ordem');
    if (!ordem.value) ordem.value = String(index + 1);
  });
  atualizarTitulosClientes();
}

function atualizarTitulosClientes() {
  document.querySelectorAll('.cliente-card').forEach((card, index) => {
    const titulo = card.querySelector('.cliente-card-header strong');
    if (titulo) titulo.textContent = `Cliente ${index + 1}`;
  });
}

function obterDadosFormulario() {
  const semana = normalizarTexto(document.getElementById('semanaOrdem').value);
  const supervisor = normalizarTexto(document.getElementById('supervisorNome').value);
  const dataOrdem = document.getElementById('dataOrdem').value;
  const clientes = Array.from(document.querySelectorAll('.cliente-card'))
    .map((card, index) => ({
      ordem: Number(card.querySelector('.cliente-ordem').value || index + 1),
      nome: normalizarTexto(card.querySelector('.cliente-nome').value),
      cidade: normalizarTexto(card.querySelector('.cliente-cidade').value),
      obs: normalizarTexto(card.querySelector('.cliente-obs').value)
    }))
    .filter(cliente => cliente.nome || cliente.cidade || cliente.obs)
    .sort((a, b) => a.ordem - b.ordem);

  return { semana, supervisor, dataOrdem, clientes };
}

function validarFormulario() {
  const dados = obterDadosFormulario();
  if (!dados.semana) {
    alert('Informe a semana.');
    document.getElementById('semanaOrdem').focus();
    return null;
  }
  if (!dados.supervisor) {
    alert('Informe o nome do supervisor.');
    document.getElementById('supervisorNome').focus();
    return null;
  }
  if (!dados.clientes.length) {
    alert('Adicione pelo menos um cliente.');
    return null;
  }
  if (dados.clientes.some(cliente => !cliente.nome)) {
    alert('Informe o nome de todos os clientes lancados.');
    return null;
  }
  return dados;
}

async function criarPDFBlob() {
  const dados = validarFormulario();
  if (!dados) return null;
  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) {
    alert('Biblioteca PDF nao carregada.');
    return null;
  }

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const logo = await carregarLogoComFundoBranco();
  const pageWidth = doc.internal.pageSize.getWidth();

  if (logo) doc.addImage(logo, 'JPEG', 14, 10, 42, 12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 105, 55);
  doc.setFontSize(17);
  doc.text('ORDEM DE REQUISICAO', pageWidth / 2, 20, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80);
  doc.setFontSize(10);
  doc.text(`Referente a Semana: ${dados.semana}`, 14, 34);
  doc.text(`Supervisor: ${dados.supervisor}`, 14, 40);
  doc.text(`Data: ${formatarData(dados.dataOrdem)}`, pageWidth - 14, 34, { align: 'right' });
  doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, pageWidth - 14, 40, { align: 'right' });

  doc.autoTable({
    startY: 50,
    head: [['Ordem', 'Cliente', 'Cidade', 'OBS.']],
    body: dados.clientes.map(cliente => [
      String(cliente.ordem),
      cliente.nome,
      cliente.cidade || '-',
      cliente.obs || '-'
    ]),
    styles: {
      fontSize: 9,
      cellPadding: 2,
      overflow: 'linebreak',
      valign: 'middle'
    },
    headStyles: {
      fillColor: [0, 105, 55],
      textColor: [255, 255, 255],
      fontStyle: 'bold'
    },
    columnStyles: {
      0: { cellWidth: 18, halign: 'center' },
      1: { cellWidth: 62 },
      2: { cellWidth: 45 },
      3: { cellWidth: 'auto' }
    },
    margin: { left: 14, right: 14 }
  });

  adicionarRodape(doc);
  return {
    blob: doc.output('blob'),
    filename: `Ordem_Requisicao_${new Date().toISOString().slice(0, 10)}.pdf`
  };
}

function salvarRequisicaoLocal() {
  const dados = validarFormulario();
  if (!dados) return;

  const salvas = obterRequisicoesSalvas();
  const agora = new Date().toISOString();
  const id = requisicaoAtualId || criarIdLocal();
  const registroExistente = salvas.find(item => item.id === id);
  const registro = {
    id,
    ...dados,
    criadoEm: registroExistente?.criadoEm || agora,
    atualizadoEm: agora
  };

  const atualizadas = registroExistente
    ? salvas.map(item => (item.id === id ? registro : item))
    : [registro, ...salvas];

  if (!gravarRequisicoesSalvas(atualizadas)) return;
  requisicaoAtualId = id;
  renderizarRequisicoesSalvas();
  alert('Requisicao salva localmente neste aparelho/navegador.');
}

async function baixarPDF() {
  const arquivo = await criarPDFBlob();
  if (!arquivo) return;
  const url = URL.createObjectURL(arquivo.blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = arquivo.filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function compartilharWhatsapp() {
  const arquivo = await criarPDFBlob();
  if (!arquivo) return;
  const file = new File([arquivo.blob], arquivo.filename, { type: 'application/pdf' });

  if (navigator.canShare?.({ files: [file] }) && navigator.share) {
    await navigator.share({
      title: 'Ordem de Requisicao',
      text: 'Segue Ordem de Requisicao em PDF.',
      files: [file]
    });
    return;
  }

  const url = URL.createObjectURL(arquivo.blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = arquivo.filename;
  link.click();
  URL.revokeObjectURL(url);

  const texto = encodeURIComponent('Ordem de Requisicao gerada. O PDF foi baixado neste dispositivo para envio pelo WhatsApp.');
  window.open(`https://wa.me/?text=${texto}`, '_blank', 'noopener');
}

function limparFormulario() {
  if (!confirm('Deseja limpar todo o formulario?')) return;
  resetarFormulario();
}

function resetarFormulario() {
  requisicaoAtualId = null;
  document.getElementById('supervisorNome').value = '';
  document.getElementById('dataOrdem').value = new Date().toISOString().slice(0, 10);
  atualizarSemanaPorData();
  document.getElementById('clientesContainer').innerHTML = '';
  clienteIndex = 0;
  adicionarCliente({}, false);
}

function carregarRequisicaoSalva(id) {
  const registro = obterRequisicoesSalvas().find(item => item.id === id);
  if (!registro) {
    alert('Requisicao salva nao encontrada.');
    renderizarRequisicoesSalvas();
    return;
  }

  requisicaoAtualId = registro.id;
  document.getElementById('semanaOrdem').value = registro.semana || '';
  document.getElementById('supervisorNome').value = registro.supervisor || '';
  document.getElementById('dataOrdem').value = registro.dataOrdem || new Date().toISOString().slice(0, 10);
  document.getElementById('clientesContainer').innerHTML = '';
  clienteIndex = 0;

  const clientes = Array.isArray(registro.clientes) && registro.clientes.length ? registro.clientes : [{}];
  clientes.forEach(cliente => adicionarCliente(cliente, false));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function excluirRequisicaoSalva(id) {
  if (!confirm('Deseja excluir esta requisicao salva localmente?')) return;
  const atualizadas = obterRequisicoesSalvas().filter(item => item.id !== id);
  if (!gravarRequisicoesSalvas(atualizadas)) return;
  if (requisicaoAtualId === id) requisicaoAtualId = null;
  renderizarRequisicoesSalvas();
}

function renderizarRequisicoesSalvas() {
  const tbody = document.getElementById('requisicoesSalvasBody');
  if (!tbody) return;

  const salvas = obterRequisicoesSalvas();
  if (!salvas.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="ordem-salvas-vazio">Nenhuma requisicao salva localmente.</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = salvas.map(registro => `
    <tr>
      <td data-label="Referente a Semana">${escapeHtml(registro.semana || '-')}</td>
      <td data-label="Data">${escapeHtml(formatarData(registro.dataOrdem))}</td>
      <td data-label="Supervisor">${escapeHtml(registro.supervisor || '-')}</td>
      <td data-label="Clientes">${Number(registro.clientes?.length || 0)}</td>
      <td data-label="Acoes">
        <div class="acoes-salvas">
          <button type="button" class="btn-grid btn-editar" data-editar-requisicao="${escapeHtml(registro.id)}">
            <i class="fas fa-pen"></i> Editar
          </button>
          <button type="button" class="btn-grid btn-excluir" data-excluir-requisicao="${escapeHtml(registro.id)}">
            <i class="fas fa-trash"></i> Excluir
          </button>
        </div>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-editar-requisicao]').forEach(botao => {
    botao.addEventListener('click', () => carregarRequisicaoSalva(botao.dataset.editarRequisicao));
  });
  tbody.querySelectorAll('[data-excluir-requisicao]').forEach(botao => {
    botao.addEventListener('click', () => excluirRequisicaoSalva(botao.dataset.excluirRequisicao));
  });
}

function obterRequisicoesSalvas() {
  try {
    const salvas = JSON.parse(localStorage.getItem(STORAGE_KEY_REQUISICOES) || '[]');
    return Array.isArray(salvas) ? salvas : [];
  } catch (error) {
    console.warn('Nao foi possivel ler requisicoes salvas localmente.', error);
    return [];
  }
}

function gravarRequisicoesSalvas(requisicoes) {
  try {
    localStorage.setItem(STORAGE_KEY_REQUISICOES, JSON.stringify(requisicoes));
    return true;
  } catch (error) {
    console.error('Nao foi possivel salvar localmente.', error);
    alert('Nao foi possivel salvar localmente. Verifique o espaco do navegador ou permissoes.');
    return false;
  }
}

function criarIdLocal() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `req-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function adicionarRodape(doc) {
  const pageCount = doc.internal.getNumberOfPages();
  for (let pagina = 1; pagina <= pageCount; pagina += 1) {
    doc.setPage(pagina);
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text('GTSYSTEM - Marquespan', 14, pageHeight - 10);
    doc.text(`Pagina ${pagina} de ${pageCount}`, pageWidth - 14, pageHeight - 10, { align: 'right' });
  }
}

function carregarLogoComFundoBranco() {
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = 'logo.png';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/jpeg', 0.95));
    };
    img.onerror = () => resolve(null);
  });
}

function formatarData(value) {
  if (!value) return '-';
  const [ano, mes, dia] = value.split('-');
  return `${dia}/${mes}/${ano}`;
}

function atualizarSemanaPorData() {
  document.getElementById('semanaOrdem').value = calcularSemanaAno(document.getElementById('dataOrdem').value);
}

function calcularSemanaAno(dataISO) {
  if (!dataISO) return '';
  const [ano, mes, dia] = dataISO.split('-').map(Number);
  if (!ano || !mes || !dia) return '';

  const data = new Date(Date.UTC(ano, mes - 1, dia));
  const diaSemana = data.getUTCDay() || 7;
  data.setUTCDate(data.getUTCDate() + 4 - diaSemana);

  const anoSemana = data.getUTCFullYear();
  const inicioAno = new Date(Date.UTC(anoSemana, 0, 1));
  const semana = Math.ceil((((data - inicioAno) / 86400000) + 1) / 7);
  return `${String(semana).padStart(2, '0')}-${anoSemana}`;
}

function normalizarTexto(value) {
  return String(value || '').trim().toLocaleUpperCase('pt-BR');
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[char]));
}
