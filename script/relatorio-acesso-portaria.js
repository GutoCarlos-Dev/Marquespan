import { supabaseClient } from './supabase.js';
import { configurarFiltroFilialUsuario } from './shared/filtro-filial-usuario.js';
import { normalizarFilial } from './shared/filial-utils.js';

const TIMEZONE = 'America/Sao_Paulo';
let registros = [];
let registrosExibidos = [];

document.addEventListener('DOMContentLoaded', async () => {
  definirPeriodoPadrao();
  await configurarFiltroFilialUsuario(document.getElementById('filtroFilial'));
  document.getElementById('formFiltrosRelatorio').addEventListener('submit', event => {
    event.preventDefault();
    buscarRelatorio();
  });
  document.getElementById('btnLimpar').addEventListener('click', limparFiltros);
  document.getElementById('btnExcel').addEventListener('click', exportarExcel);
  document.getElementById('btnPDF').addEventListener('click', exportarPDF);
  document.getElementById('filtroLocal').addEventListener('input', aplicarFiltrosLocais);
  document.getElementById('filtroFilial').addEventListener('change', buscarRelatorio);
  document.querySelectorAll('#formFiltrosRelatorio input[type="text"]').forEach(input => {
    input.addEventListener('input', () => {
      const inicio = input.selectionStart;
      const fim = input.selectionEnd;
      input.value = input.value.toLocaleUpperCase('pt-BR');
      input.setSelectionRange?.(inicio, fim);
    });
  });
});

function definirPeriodoPadrao() {
  const hoje = new Date();
  const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  document.getElementById('dataInicial').value = formatarDataInput(primeiroDia);
  document.getElementById('dataFinal').value = formatarDataInput(hoje);
}

function formatarDataInput(data) {
  return [
    data.getFullYear(),
    String(data.getMonth() + 1).padStart(2, '0'),
    String(data.getDate()).padStart(2, '0')
  ].join('-');
}

async function buscarTodos(montarQuery, tamanhoPagina = 1000) {
  const resultado = [];
  for (let inicio = 0; ; inicio += tamanhoPagina) {
    const { data, error } = await montarQuery().range(inicio, inicio + tamanhoPagina - 1);
    if (error) throw error;
    resultado.push(...(data || []));
    if (!data || data.length < tamanhoPagina) return resultado;
  }
}

async function buscarRelatorio() {
  const botao = document.getElementById('btnBuscar');
  botao.disabled = true;
  botao.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Buscando';

  try {
    const campoPeriodo = document.getElementById('tipoPeriodo').value;
    const dataInicial = document.getElementById('dataInicial').value;
    const dataFinal = document.getElementById('dataFinal').value;
    const status = document.getElementById('filtroStatus').value;
    const filial = normalizarFilial(document.getElementById('filtroFilial').value);
    const montarQuery = () => {
      let query = supabaseClient
        .from('portaria_acessos')
        .select('*')
        .order(campoPeriodo, { ascending: false, nullsFirst: false });
      if (dataInicial) query = query.gte(campoPeriodo, dataLocalParaIso(dataInicial, '00:00:00'));
      if (dataFinal) query = query.lte(campoPeriodo, dataLocalParaIso(dataFinal, '23:59:59.999'));
      if (status) query = query.eq('status', status);
      if (filial) query = query.eq('filial', filial);
      return query;
    };

    registros = await buscarTodos(montarQuery);
    aplicarFiltrosLocais();
  } catch (error) {
    console.error('Erro ao buscar relatorio de acessos:', error);
    alert(`Erro ao buscar relatorio: ${error.message}`);
  } finally {
    botao.disabled = false;
    botao.innerHTML = '<i class="fas fa-search"></i> Buscar';
  }
}

function aplicarFiltrosLocais() {
  const filtros = {
    pessoa: normalizar(document.getElementById('filtroPessoa').value),
    documento: normalizarDocumento(document.getElementById('filtroDocumento').value),
    empresa: normalizar(document.getElementById('filtroEmpresa').value),
    placa: normalizar(document.getElementById('filtroPlaca').value),
    carreta: normalizar(document.getElementById('filtroCarreta').value),
    setor: normalizar(document.getElementById('filtroSetor').value),
    produto: normalizar(document.getElementById('filtroProduto').value),
    usuario: normalizar(document.getElementById('filtroUsuario').value),
    filial: normalizarFilial(document.getElementById('filtroFilial').value),
    divergencia: document.getElementById('filtroDivergencia').value,
    local: normalizar(document.getElementById('filtroLocal').value)
  };

  registrosExibidos = registros.filter(item => {
    const auditoria = analisarRegistro(item);
    if (filtros.pessoa && !normalizar(item.pessoa_nome).includes(filtros.pessoa)) return false;
    if (filtros.documento && !normalizarDocumento(item.pessoa_documento).includes(filtros.documento)) return false;
    if (filtros.empresa && !normalizar(`${item.empresa_nome || ''} ${item.empresa_documento || ''}`).includes(filtros.empresa)) return false;
    if (filtros.placa && !normalizar(`${auditoria.placaEntrada} ${auditoria.placaSaida}`).includes(filtros.placa)) return false;
    if (filtros.carreta && !normalizar(`${auditoria.carretaEntrada} ${auditoria.carretaSaida}`).includes(filtros.carreta)) return false;
    if (filtros.setor && !normalizar(item.setor_nome).includes(filtros.setor)) return false;
    if (filtros.produto && !normalizar(`${item.produto_servico || ''} ${item.observacoes || ''}`).includes(filtros.produto)) return false;
    if (filtros.usuario && !normalizar(item.usuario_nome).includes(filtros.usuario)) return false;
    if (filtros.filial && normalizarFilial(item.filial) !== filtros.filial) return false;
    if (!atendeFiltroDivergencia(auditoria, filtros.divergencia)) return false;
    if (filtros.local && !normalizar(Object.values(item).filter(valor => typeof valor === 'string').join(' ')).includes(filtros.local)) return false;
    return true;
  });

  renderizarTabela();
  atualizarIndicadores();
}

function analisarRegistro(item) {
  const placaEntrada = normalizar(item.placa_entrada || item.placa_veiculo);
  const placaSaida = normalizar(item.placa_saida);
  const carretaEntrada = normalizar(item.carreta_cacamba_entrada || item.carreta_cacamba);
  const carretaSaida = normalizar(item.carreta_cacamba_saida);
  const fluxoIncompleto = !item.entrada_em || (item.status === 'saida' && !item.saida_em);
  const podeComparar = Boolean(item.saida_em);
  const divergenciaPlaca = podeComparar && placaEntrada !== placaSaida;
  const divergenciaCarreta = podeComparar && carretaEntrada !== carretaSaida;
  return {
    placaEntrada,
    placaSaida,
    carretaEntrada,
    carretaSaida,
    fluxoIncompleto,
    divergenciaPlaca,
    divergenciaCarreta,
    divergente: divergenciaPlaca || divergenciaCarreta
  };
}

function atendeFiltroDivergencia(auditoria, filtro) {
  if (!filtro) return true;
  if (filtro === 'qualquer') return auditoria.divergente;
  if (filtro === 'placa') return auditoria.divergenciaPlaca;
  if (filtro === 'carreta') return auditoria.divergenciaCarreta;
  if (filtro === 'sem') return !auditoria.divergente && !auditoria.fluxoIncompleto;
  if (filtro === 'incompleto') return auditoria.fluxoIncompleto;
  return true;
}

function renderizarTabela() {
  const tbody = document.getElementById('tbodyRelatorio');
  if (!registrosExibidos.length) {
    tbody.innerHTML = '<tr><td colspan="18" class="auditoria-empty">Nenhum registro encontrado.</td></tr>';
    return;
  }

  tbody.innerHTML = registrosExibidos.map(item => {
    const auditoria = analisarRegistro(item);
    const classeLinha = auditoria.fluxoIncompleto ? 'linha-incompleta' : auditoria.divergente ? 'linha-divergente' : '';
    return `
      <tr class="${classeLinha}">
        <td>${formatarDataHora(item.created_at)}</td>
        <td>${formatarDataHora(item.entrada_em)}</td>
        <td>${formatarDataHora(item.saida_em)}</td>
        <td>${calcularPermanencia(item.entrada_em, item.saida_em)}</td>
        <td>${escapeHtml(item.filial || '-')}</td>
        <td>${escapeHtml(item.pessoa_nome || '-')}</td>
        <td>${escapeHtml(item.pessoa_documento || '-')}</td>
        <td>${escapeHtml(item.empresa_nome || '-')}</td>
        <td>${escapeHtml(auditoria.placaEntrada || '-')}</td>
        <td>${escapeHtml(auditoria.placaSaida || '-')}</td>
        <td>${escapeHtml(auditoria.carretaEntrada || '-')}</td>
        <td>${escapeHtml(auditoria.carretaSaida || '-')}</td>
        <td>${montarBadgeConferencia(auditoria)}</td>
        <td>${escapeHtml(item.setor_nome || '-')}</td>
        <td>${escapeHtml(item.produto_servico || '-')}</td>
        <td>${escapeHtml(item.observacoes || '-')}</td>
        <td><span class="status-auditoria ${escapeHtml(item.status || 'aguardando')}">${escapeHtml(formatarStatus(item.status))}</span></td>
        <td>${escapeHtml(item.usuario_nome || '-')}</td>
      </tr>
    `;
  }).join('');
}

function montarBadgeConferencia(auditoria) {
  if (auditoria.fluxoIncompleto) return '<span class="conferencia-badge conferencia-incompleta">FLUXO INCOMPLETO</span>';
  if (!auditoria.divergente) return '<span class="conferencia-badge conferencia-ok">SEM DIVERGENCIA</span>';
  const tipos = [];
  if (auditoria.divergenciaPlaca) tipos.push('CAVALO');
  if (auditoria.divergenciaCarreta) tipos.push('CARRETA/CACAMBA');
  return `<span class="conferencia-badge conferencia-divergente">${tipos.join(' + ')}</span>`;
}

function atualizarIndicadores() {
  const divergencias = registrosExibidos.filter(item => analisarRegistro(item).divergente).length;
  const pessoas = new Set(registrosExibidos.map(item => normalizarDocumento(item.pessoa_documento) || normalizar(item.pessoa_nome)).filter(Boolean));
  document.getElementById('kpiTotal').textContent = registrosExibidos.length;
  document.getElementById('kpiDentro').textContent = registrosExibidos.filter(item => item.status === 'entrada').length;
  document.getElementById('kpiSaidas').textContent = registrosExibidos.filter(item => item.status === 'saida').length;
  document.getElementById('kpiDivergencias').textContent = divergencias;
  document.getElementById('kpiPessoas').textContent = pessoas.size;
}

function limparFiltros() {
  document.getElementById('formFiltrosRelatorio').reset();
  document.getElementById('tipoPeriodo').value = 'entrada_em';
  document.getElementById('filtroLocal').value = '';
  definirPeriodoPadrao();
  registros = [];
  registrosExibidos = [];
  renderizarTabela();
  atualizarIndicadores();
}

function montarLinhasExportacao() {
  return registrosExibidos.map(item => {
    const auditoria = analisarRegistro(item);
    return {
      Cadastro: formatarDataHora(item.created_at),
      Entrada: formatarDataHora(item.entrada_em),
      Saida: formatarDataHora(item.saida_em),
      'Tempo interno': calcularPermanencia(item.entrada_em, item.saida_em),
      Filial: item.filial || '',
      Pessoa: item.pessoa_nome || '',
      Documento: item.pessoa_documento || '',
      Empresa: item.empresa_nome || '',
      'Documento empresa': item.empresa_documento || '',
      'Cavalo entrada': auditoria.placaEntrada,
      'Cavalo saida': auditoria.placaSaida,
      'Carreta/Cacamba entrada': auditoria.carretaEntrada,
      'Carreta/Cacamba saida': auditoria.carretaSaida,
      Conferencia: textoConferencia(auditoria),
      Setor: item.setor_nome || '',
      'Produto/Servico': item.produto_servico || '',
      Observacoes: item.observacoes || '',
      Status: formatarStatus(item.status),
      Usuario: item.usuario_nome || ''
    };
  });
}

function exportarExcel() {
  const linhas = montarLinhasExportacao();
  if (!linhas.length) return alert('Nenhum registro para exportar.');
  if (!window.XLSX) return alert('Biblioteca Excel nao carregada.');
  const planilha = window.XLSX.utils.json_to_sheet(linhas);
  planilha['!cols'] = Object.keys(linhas[0]).map(chave => ({ wch: Math.min(40, Math.max(14, chave.length + 2)) }));
  const arquivo = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(arquivo, planilha, 'Auditoria de Acessos');
  window.XLSX.writeFile(arquivo, `Auditoria_Acessos_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

async function exportarPDF() {
  const linhas = montarLinhasExportacao();
  if (!linhas.length) return alert('Nenhum registro para exportar.');
  if (!window.jspdf?.jsPDF) return alert('Biblioteca PDF nao carregada.');
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' });
  const logo = await carregarLogoComFundoBranco();
  if (logo) doc.addImage(logo, 'JPEG', 14, 8, 38, 15);
  doc.setTextColor(0, 106, 45);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('MARQUESPAN - Auditoria de Entradas e Saidas', 58, 14);
  doc.setTextColor(80);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')} | Registros: ${linhas.length}`, 58, 20);
  doc.autoTable({
    startY: 29,
    head: [[
      'Entrada', 'Saida', 'Tempo', 'Filial', 'Pessoa', 'Documento', 'Empresa',
      'Cavalo Ent.', 'Cavalo Sai.', 'Carreta Ent.', 'Carreta Sai.',
      'Conferencia', 'Setor', 'Produto/Servico', 'Status', 'Usuario'
    ]],
    body: linhas.map(item => [
      item.Entrada, item.Saida, item['Tempo interno'], item.Filial, item.Pessoa, item.Documento,
      item.Empresa, item['Cavalo entrada'], item['Cavalo saida'],
      item['Carreta/Cacamba entrada'], item['Carreta/Cacamba saida'],
      item.Conferencia, item.Setor, item['Produto/Servico'], item.Status, item.Usuario
    ]),
    styles: { fontSize: 6.5, cellPadding: 1.5, overflow: 'linebreak' },
    headStyles: { fillColor: [0, 106, 45], textColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: [245, 248, 246] },
    margin: { left: 8, right: 8 }
  });
  doc.save(`Auditoria_Acessos_${new Date().toISOString().slice(0, 10)}.pdf`);
}

function carregarLogoComFundoBranco() {
  return new Promise(resolve => {
    const imagem = new Image();
    imagem.crossOrigin = 'anonymous';
    imagem.src = 'logo.png';
    imagem.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = imagem.naturalWidth || imagem.width;
      canvas.height = imagem.naturalHeight || imagem.height;
      const contexto = canvas.getContext('2d');
      contexto.fillStyle = '#FFFFFF';
      contexto.fillRect(0, 0, canvas.width, canvas.height);
      contexto.drawImage(imagem, 0, 0);
      resolve(canvas.toDataURL('image/jpeg', 0.95));
    };
    imagem.onerror = () => resolve(null);
  });
}

function textoConferencia(auditoria) {
  if (auditoria.fluxoIncompleto) return 'FLUXO INCOMPLETO';
  if (!auditoria.divergente) return 'SEM DIVERGENCIA';
  const tipos = [];
  if (auditoria.divergenciaPlaca) tipos.push('CAVALO');
  if (auditoria.divergenciaCarreta) tipos.push('CARRETA/CACAMBA');
  return `DIVERGENCIA: ${tipos.join(' + ')}`;
}

function calcularPermanencia(entrada, saida) {
  if (!entrada) return '-';
  const inicio = new Date(entrada);
  const fim = saida ? new Date(saida) : new Date();
  const minutos = Math.max(0, Math.floor((fim - inicio) / 60000));
  const dias = Math.floor(minutos / 1440);
  const horas = Math.floor((minutos % 1440) / 60);
  const restoMinutos = minutos % 60;
  return `${dias ? `${dias}d ` : ''}${String(horas).padStart(2, '0')}h ${String(restoMinutos).padStart(2, '0')}m`;
}

function formatarDataHora(valor) {
  if (!valor) return '-';
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return '-';
  return data.toLocaleString('pt-BR', { timeZone: TIMEZONE });
}

function dataLocalParaIso(data, horario) {
  const valor = new Date(`${data}T${horario}`);
  return Number.isNaN(valor.getTime()) ? `${data}T${horario}` : valor.toISOString();
}

function formatarStatus(status) {
  return {
    aguardando: 'Aguardando',
    entrada: 'Dentro da empresa',
    saida: 'Saida registrada'
  }[status] || status || '-';
}

function normalizar(valor) {
  return String(valor || '').trim().toLocaleUpperCase('pt-BR');
}

function normalizarDocumento(valor) {
  return normalizar(valor).replace(/[^A-Z0-9]/g, '');
}

function escapeHtml(valor) {
  return String(valor ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
