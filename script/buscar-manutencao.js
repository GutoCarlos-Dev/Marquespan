import { supabase } from './supabase.js';

function preencherUsuarioLogado() {
  const usuario = JSON.parse(localStorage.getItem('usuarioLogado'));
  if (usuario?.nome) {
    document.getElementById('usuario-logado').textContent = `👤 Olá, ${usuario.nome}`;
  }
}

async function carregarFiltros() {
  const [placas, titulos, filiais, fornecedores] = await Promise.all([
    supabase.from('veiculos').select('placa'),
    supabase.from('titulomanutencao').select('manutencao'),
    supabase.from('filial').select('uf'),
    supabase.from('fornecedor').select('fornecedor')
  ]);

  preencherDatalist('listaPlacas', placas.data, 'placa');
  preencherDatalist('listaTitulos', titulos.data, 'manutencao');
  preencherSelect('filial', filiais.data, 'uf');
  preencherDatalist('listaFornecedores', fornecedores.data, 'fornecedor');
}

function preencherDatalist(id, data, campo) {
  const lista = document.getElementById(id);
  lista.innerHTML = '';
  data?.forEach(item => {
    if (item[campo]) {
      lista.appendChild(new Option(item[campo]));
    }
  });
}

function preencherSelect(id, data, campo) {
  const select = document.getElementById(id);
  select.innerHTML = '<option value="">Todos</option>';
  data?.forEach(item => {
    select.appendChild(new Option(item[campo], item[campo]));
  });
}

async function buscarManutencao() {
  const filtros = {
    dataInicial: document.getElementById('dataInicial').value,
    dataFinal: document.getElementById('dataFinal').value,
    titulo: document.getElementById('titulo').value,
    nfse: document.getElementById('nfse').value,
    os: document.getElementById('os').value,
    veiculo: document.getElementById('veiculo').value,
    filial: document.getElementById('filial').value,
    tipo: document.getElementById('tipoManutencao').value,
    fornecedor: document.getElementById('fornecedor').value
  };

  let query = supabase.from('manutencao').select('*');

  if (filtros.dataInicial) query = query.gte('data', filtros.dataInicial);
  if (filtros.dataFinal) query = query.lte('data', filtros.dataFinal);
  if (filtros.titulo) query = query.ilike('titulo', `%${filtros.titulo}%`);
  if (filtros.nfse) query = query.ilike('notaServico', `%${filtros.nfse}%`);
  if (filtros.os) query = query.ilike('numeroOS', `%${filtros.os}%`);
  if (filtros.veiculo) query = query.ilike('veiculo', `%${filtros.veiculo}%`);
  if (filtros.filial) query = query.eq('filial', filtros.filial);
  if (filtros.tipo) query = query.eq('tipoManutencao', filtros.tipo);
  if (filtros.fornecedor) query = query.ilike('fornecedor', `%${filtros.fornecedor}%`);

  const { data, error } = await query;

  if (error) {
    console.error('Erro ao buscar manutenções:', error);
    alert('❌ Erro ao buscar manutenções.');
    return;
  }

  preencherTabela(data);
}

// 📋 Preencher tabela de resultados
function preencherTabela(registros) {
  const tabela = document.getElementById('tabelaResultados');
  tabela.innerHTML = '';
  let total = 0;

  registros.forEach(m => {
    const linha = document.createElement('tr');
    linha.innerHTML = `
      <td><button onclick="abrirManutencao(${m.id})">🔎</button></td>
      <td>${m.titulo || ''}</td>
      <td>${m.veiculo || ''}</td>
      <td>${m.descricao || ''}</td>
      <td>${m.numeroOS || ''}</td>
      <td>${formatarData(m.data)}</td>
      <td>R$ ${formatarValor(m.valor || 0)}</td>
    `;
    tabela.appendChild(linha);
    total += parseFloat(m.valor || 0);
  });

  document.getElementById('totalRegistros').textContent = registros.length;
  document.getElementById('valorTotal').textContent = formatarValor(total);
}

function formatarData(data) {
  if (!data) return '';
  const d = new Date(data);
  return d.toLocaleDateString('pt-BR');
}

function formatarValor(valor) {
  return valor.toFixed(2).replace('.', ',');
}

// 🔗 Abrir manutenção
window.abrirManutencao = function(id) {
  window.location.href = `incluir-manutencao.html?id=${id}`;
}

// 🚀 Inicialização
document.addEventListener('DOMContentLoaded', () => {
  preencherUsuarioLogado();
  ativarSubmenu();
  carregarFiltros();

  document.getElementById('btnBuscarManutencao').addEventListener('click', buscarManutencao);

  document.getElementById('btnExportarPDF').addEventListener('click', () => {
    alert('📄 Exportar PDF ainda não implementado.');
  });

  document.getElementById('btnExportarXLS').addEventListener('click', () => {
    alert('📊 Exportar XLS ainda não implementado.');
  });
});

  document.querySelectorAll('.menu-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
    btn.parentElement.classList.toggle('active');
  });
});
