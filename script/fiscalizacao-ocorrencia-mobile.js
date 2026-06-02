import { supabaseClient } from './supabase.js';

let ocorrencias = [];
let ocorrenciaEditandoId = null;
const bucketAnexos = 'fiscalizacao_ocorrencias_anexos';
let anexosNovos = [];
let anexosExistentes = [];
let anexosParaRemover = [];

document.addEventListener('DOMContentLoaded', async () => {
  const hoje = new Date().toISOString().split('T')[0];
  document.getElementById('mobileData').value = hoje;
  document.getElementById('mobileFiltroDataDe').value = hoje;
  document.getElementById('mobileFiltroDataAte').value = hoje;
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
  document.getElementById('mobileFiltroDataDe').addEventListener('change', carregarOcorrencias);
  document.getElementById('mobileFiltroDataAte').addEventListener('change', carregarOcorrencias);
  document.getElementById('mobileBusca').addEventListener('input', renderCards);
  document.getElementById('mobileAnexos').addEventListener('change', handleAnexosChange);
  document.getElementById('listaAnexosMobile').addEventListener('click', handleAnexoClick);
  ['mobileEnvolveVeiculoEmpresa', 'mobileEnvolveVeiculoTerceiro', 'mobileEnvolveOutroPatrimonio'].forEach(id => {
    document.getElementById(id).addEventListener('change', atualizarGruposEnvolvimento);
  });
  document.getElementById('listaOcorrenciasMobile').addEventListener('click', (event) => {
    const card = event.target.closest('.ocorrencia-card');
    if (!card) return;
    const item = ocorrencias.find(ocorrencia => ocorrencia.id === card.dataset.id);
    if (item) abrirModal(item);
  });
}

async function abrirModal(item = null) {
  document.getElementById('formOcorrenciaMobile').reset();
  anexosNovos = [];
  anexosExistentes = [];
  anexosParaRemover = [];
  document.getElementById('mobileAnexos').value = '';

  ocorrenciaEditandoId = item?.id || null;
  document.querySelector('#modalOcorrenciaMobile .panel-header h3').innerHTML = ocorrenciaEditandoId
    ? '<i class="fas fa-pen"></i> Editar Ocorrencia'
    : '<i class="fas fa-clipboard-check"></i> Nova Ocorrencia';

  document.getElementById('mobileData').value = item?.data_ocorrencia || new Date().toISOString().split('T')[0];
  document.getElementById('mobileHorario').value = item?.hora_ocorrencia || '';
  document.getElementById('mobileRota').value = item?.rota || '';
  document.getElementById('mobilePlaca').value = item?.placa || '';
  document.getElementById('mobileMotorista').value = item?.motorista || '';
  document.getElementById('mobileAuxiliar').value = item?.auxiliar || '';
  document.getElementById('mobileLocalOcorrencia').value = item?.local_ocorrencia || '';
  document.getElementById('mobileRelatorio').value = item?.relatorio || '';
  preencherEnvolvimento(item?.envolvimento);
  atualizarGruposEnvolvimento();
  renderizarAnexos();
  document.getElementById('btnSalvarMobile').innerHTML = ocorrenciaEditandoId
    ? '<i class="fas fa-save"></i> SALVAR ALTERACOES'
    : '<i class="fas fa-save"></i> SALVAR OCORRENCIA';

  document.getElementById('modalOcorrenciaMobile').classList.remove('hidden');
  if (ocorrenciaEditandoId) await carregarAnexosExistentes(ocorrenciaEditandoId);
}

function fecharModal() {
  ocorrenciaEditandoId = null;
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
  let estavaEditando = Boolean(ocorrenciaEditandoId);

  try {
    const usuario = JSON.parse(localStorage.getItem('usuarioLogado')) || {};
    const nomeUsuario = usuario.nome || usuario.nomecompleto || usuario.nome_completo || usuario.usuario_login || 'Sistema';
    const payload = {
      data_ocorrencia: document.getElementById('mobileData').value,
      hora_ocorrencia: document.getElementById('mobileHorario').value || null,
      rota: document.getElementById('mobileRota').value.trim(),
      placa: document.getElementById('mobilePlaca').value.trim().toUpperCase(),
      motorista: document.getElementById('mobileMotorista').value.trim(),
      auxiliar: document.getElementById('mobileAuxiliar').value.trim() || null,
      local_ocorrencia: document.getElementById('mobileLocalOcorrencia').value.trim() || null,
      envolvimento: coletarEnvolvimento(),
      relatorio: document.getElementById('mobileRelatorio').value.trim()
    };

    let idOcorrencia = ocorrenciaEditandoId;
    if (estavaEditando) {
      payload.usuario_edicao_id = usuario.id || null;
      payload.usuario_edicao_nome = nomeUsuario;
      const { error } = await supabaseClient.from('fiscalizacao_ocorrencias').update(payload).eq('id', ocorrenciaEditandoId);
      if (error) throw error;
    } else {
      payload.usuario_id = usuario.id || null;
      payload.usuario_nome = nomeUsuario;
      payload.usuario_inclusao_id = payload.usuario_id;
      payload.usuario_inclusao_nome = payload.usuario_nome;
      const { data, error } = await supabaseClient.from('fiscalizacao_ocorrencias').insert([payload]).select('id').single();
      if (error) throw error;
      idOcorrencia = data.id;
    }

    await salvarAnexos(idOcorrencia);

    document.getElementById('formOcorrenciaMobile').reset();
    document.getElementById('mobileData').value = payload.data_ocorrencia;
    document.getElementById('mobileFiltroDataDe').value = payload.data_ocorrencia;
    document.getElementById('mobileFiltroDataAte').value = payload.data_ocorrencia;
    fecharModal();
    await carregarOcorrencias();
    alert(estavaEditando ? 'Ocorrencia atualizada com sucesso!' : 'Ocorrencia registrada com sucesso!');
  } catch (error) {
    console.error('Erro ao salvar ocorrencia:', error);
    alert(`Erro ao salvar ocorrencia: ${error.message}`);
  } finally {
    btn.disabled = false;
    btn.innerHTML = estavaEditando
      ? '<i class="fas fa-save"></i> SALVAR ALTERACOES'
      : '<i class="fas fa-save"></i> SALVAR OCORRENCIA';
  }
}

async function carregarOcorrencias() {
  const container = document.getElementById('listaOcorrenciasMobile');
  const dataDe = document.getElementById('mobileFiltroDataDe').value;
  const dataAte = document.getElementById('mobileFiltroDataAte').value;
  container.innerHTML = '<div class="empty-state"><i class="fas fa-spinner fa-spin"></i> Carregando...</div>';

  try {
    let query = supabaseClient
      .from('fiscalizacao_ocorrencias')
      .select('*')
      .order('created_at', { ascending: false });

    if (dataDe) query = query.gte('data_ocorrencia', dataDe);
    if (dataAte) query = query.lte('data_ocorrencia', dataAte);

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
    item.usuario_inclusao_nome,
    item.usuario_edicao_nome,
    item.rota,
    item.placa,
    item.motorista,
    item.auxiliar,
    item.local_ocorrencia,
    resumoEnvolvimento(item.envolvimento),
    item.relatorio
  ].some(valor => String(valor || '').toUpperCase().includes(busca)));

  document.getElementById('totalMobile').textContent = filtradas.length;

  if (!filtradas.length) {
    container.innerHTML = '<div class="empty-state">Nenhuma ocorrencia encontrada.</div>';
    return;
  }

  container.innerHTML = filtradas.map(item => `
    <article class="ocorrencia-card" data-id="${escapeHtml(item.id)}">
      <div class="card-top">
        <h3>${escapeHtml(item.placa || 'Sem placa')}</h3>
        <span class="card-date">${formatarData(item.data_ocorrencia)}</span>
      </div>
      <div class="card-info">
        <span><i class="fas fa-route"></i><strong>Rota:</strong> ${escapeHtml(item.rota || '-')}</span>
        <span><i class="fas fa-clock"></i><strong>Horario:</strong> ${escapeHtml(item.hora_ocorrencia || '-')}</span>
        <span><i class="fas fa-user-tie"></i><strong>Motorista:</strong> ${escapeHtml(item.motorista || '-')}</span>
        <span><i class="fas fa-user"></i><strong>Auxiliar:</strong> ${escapeHtml(item.auxiliar || '-')}</span>
        <span><i class="fas fa-location-dot"></i><strong>Local:</strong> ${escapeHtml(item.local_ocorrencia || '-')}</span>
        <span><i class="fas fa-car-burst"></i><strong>Envolvimento:</strong> ${escapeHtml(resumoEnvolvimento(item.envolvimento) || '-')}</span>
        <span><i class="fas fa-pen"></i><strong>Incluido por:</strong> ${escapeHtml(item.usuario_inclusao_nome || item.usuario_nome || '-')}</span>
        <span><i class="fas fa-user-pen"></i><strong>Ultima edicao:</strong> ${escapeHtml(item.usuario_edicao_nome || '-')}</span>
      </div>
      <p class="card-report">${escapeHtml(item.relatorio || '-')}</p>
      <div class="card-action-hint"><i class="fas fa-pen"></i> Tocar para editar</div>
    </article>
  `).join('');
}

function formatarData(data) {
  if (!data) return '-';
  return new Date(`${data}T00:00:00`).toLocaleDateString('pt-BR');
}

function coletarEnvolvimento() {
  return {
    veiculo_empresa: {
      ativo: document.getElementById('mobileEnvolveVeiculoEmpresa').checked,
      placa: document.getElementById('mobileEmpresaPlaca').value.trim().toUpperCase() || null,
      modelo: document.getElementById('mobileEmpresaModelo').value.trim() || null,
      motorista_responsavel: document.getElementById('mobileEmpresaMotoristaResponsavel').value.trim() || null,
      danos_causados: document.getElementById('mobileEmpresaDanos').value.trim() || null
    },
    veiculo_terceiro: {
      ativo: document.getElementById('mobileEnvolveVeiculoTerceiro').checked,
      placa: document.getElementById('mobileTerceiroPlaca').value.trim().toUpperCase() || null,
      modelo: document.getElementById('mobileTerceiroModelo').value.trim() || null,
      cor: document.getElementById('mobileTerceiroCor').value.trim() || null,
      condutor: document.getElementById('mobileTerceiroCondutor').value.trim() || null,
      contato: document.getElementById('mobileTerceiroContato').value.trim() || null,
      danos_causados: document.getElementById('mobileTerceiroDanos').value.trim() || null
    },
    outro_patrimonio: {
      ativo: document.getElementById('mobileEnvolveOutroPatrimonio').checked,
      tipo_patrimonio: document.getElementById('mobilePatrimonioTipo').value.trim() || null,
      responsavel: document.getElementById('mobilePatrimonioResponsavel').value.trim() || null,
      contato: document.getElementById('mobilePatrimonioContato').value.trim() || null,
      dano_causado: document.getElementById('mobilePatrimonioDano').value.trim() || null
    }
  };
}

function preencherEnvolvimento(envolvimento) {
  const dados = normalizarObjeto(envolvimento);
  const empresa = dados.veiculo_empresa || {};
  const terceiro = dados.veiculo_terceiro || {};
  const patrimonio = dados.outro_patrimonio || {};

  document.getElementById('mobileEnvolveVeiculoEmpresa').checked = Boolean(empresa.ativo);
  document.getElementById('mobileEmpresaPlaca').value = empresa.placa || '';
  document.getElementById('mobileEmpresaModelo').value = empresa.modelo || '';
  document.getElementById('mobileEmpresaMotoristaResponsavel').value = empresa.motorista_responsavel || '';
  document.getElementById('mobileEmpresaDanos').value = empresa.danos_causados || '';

  document.getElementById('mobileEnvolveVeiculoTerceiro').checked = Boolean(terceiro.ativo);
  document.getElementById('mobileTerceiroPlaca').value = terceiro.placa || '';
  document.getElementById('mobileTerceiroModelo').value = terceiro.modelo || '';
  document.getElementById('mobileTerceiroCor').value = terceiro.cor || '';
  document.getElementById('mobileTerceiroCondutor').value = terceiro.condutor || '';
  document.getElementById('mobileTerceiroContato').value = terceiro.contato || '';
  document.getElementById('mobileTerceiroDanos').value = terceiro.danos_causados || '';

  document.getElementById('mobileEnvolveOutroPatrimonio').checked = Boolean(patrimonio.ativo);
  document.getElementById('mobilePatrimonioTipo').value = patrimonio.tipo_patrimonio || '';
  document.getElementById('mobilePatrimonioResponsavel').value = patrimonio.responsavel || '';
  document.getElementById('mobilePatrimonioContato').value = patrimonio.contato || '';
  document.getElementById('mobilePatrimonioDano').value = patrimonio.dano_causado || '';
}

function atualizarGruposEnvolvimento() {
  document.getElementById('mobileGrupoVeiculoEmpresa').classList.toggle('hidden', !document.getElementById('mobileEnvolveVeiculoEmpresa').checked);
  document.getElementById('mobileGrupoVeiculoTerceiro').classList.toggle('hidden', !document.getElementById('mobileEnvolveVeiculoTerceiro').checked);
  document.getElementById('mobileGrupoOutroPatrimonio').classList.toggle('hidden', !document.getElementById('mobileEnvolveOutroPatrimonio').checked);
}

function normalizarObjeto(valor) {
  if (valor && typeof valor === 'object' && !Array.isArray(valor)) return valor;
  if (!valor) return {};
  try {
    const parsed = JSON.parse(valor);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function resumoEnvolvimento(envolvimento) {
  const dados = normalizarObjeto(envolvimento);
  const partes = [];
  if (dados.veiculo_empresa?.ativo) partes.push('Outro veiculo da empresa');
  if (dados.veiculo_terceiro?.ativo) partes.push('Veiculo de terceiros');
  if (dados.outro_patrimonio?.ativo) partes.push('Outro patrimonio');
  return partes.join('; ');
}

function handleAnexosChange(event) {
  anexosNovos.push(...Array.from(event.target.files || []));
  event.target.value = '';
  renderizarAnexos();
}

async function handleAnexoClick(event) {
  const button = event.target.closest('[data-anexo-action]');
  if (!button) return;

  const index = Number(button.dataset.index);
  const action = button.dataset.anexoAction;
  const tipo = button.dataset.tipo;

  if (action === 'remover' && tipo === 'novo') {
    anexosNovos.splice(index, 1);
    renderizarAnexos();
    return;
  }

  if (action === 'remover' && tipo === 'existente') {
    const anexo = anexosExistentes.splice(index, 1)[0];
    if (anexo?.caminho_arquivo) anexosParaRemover.push(anexo);
    renderizarAnexos();
    return;
  }

  if (action === 'baixar' && tipo === 'existente') {
    await baixarAnexo(anexosExistentes[index]);
  }
}

function renderizarAnexos() {
  const container = document.getElementById('listaAnexosMobile');
  const itens = [
    ...anexosExistentes.map((anexo, index) => ({ anexo, index, tipo: 'existente' })),
    ...anexosNovos.map((anexo, index) => ({ anexo, index, tipo: 'novo' }))
  ];

  if (!itens.length) {
    container.innerHTML = '<div class="anexo-mobile-item"><span class="anexo-mobile-nome">Nenhum anexo selecionado.</span></div>';
    return;
  }

  container.innerHTML = itens.map(({ anexo, index, tipo }) => {
    const nome = tipo === 'novo' ? anexo.name : anexo.nome_arquivo;
    return `
      <div class="anexo-mobile-item">
        <div class="anexo-mobile-nome">
          <i class="fas fa-file"></i>
          <span>${escapeHtml(nome || 'Arquivo')}</span>
          ${tipo === 'novo' ? '<strong>(Novo)</strong>' : ''}
        </div>
        <div class="anexo-mobile-acoes">
          ${tipo === 'existente' ? `
            <button type="button" class="btn-anexo-mobile btn-anexo-download" data-anexo-action="baixar" data-tipo="${tipo}" data-index="${index}" title="Baixar">
              <i class="fas fa-download"></i>
            </button>
          ` : ''}
          <button type="button" class="btn-anexo-mobile btn-anexo-remove" data-anexo-action="remover" data-tipo="${tipo}" data-index="${index}" title="Remover">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

async function carregarAnexosExistentes(idOcorrencia) {
  try {
    const { data, error } = await supabaseClient
      .from('fiscalizacao_ocorrencias_anexos')
      .select('*')
      .eq('ocorrencia_id', idOcorrencia)
      .order('created_at', { ascending: true });

    if (error) throw error;
    anexosExistentes = data || [];
    renderizarAnexos();
  } catch (error) {
    console.error('Erro ao carregar anexos:', error);
    anexosExistentes = [];
    renderizarAnexos();
  }
}

async function salvarAnexos(idOcorrencia) {
  if (anexosParaRemover.length) {
    const caminhos = anexosParaRemover.map(anexo => anexo.caminho_arquivo).filter(Boolean);
    if (caminhos.length) {
      const { error: storageError } = await supabaseClient.storage.from(bucketAnexos).remove(caminhos);
      if (storageError) throw storageError;

      const { error: deleteError } = await supabaseClient.from('fiscalizacao_ocorrencias_anexos').delete().in('caminho_arquivo', caminhos);
      if (deleteError) throw deleteError;
    }
  }

  for (const file of anexosNovos) {
    const caminho = `${idOcorrencia}/${Date.now()}-${sanitizarNomeArquivo(file.name)}`;
    const { data, error } = await supabaseClient.storage
      .from(bucketAnexos)
      .upload(caminho, file, { contentType: file.type || 'application/octet-stream' });

    if (error) throw error;

    const { error: insertError } = await supabaseClient
      .from('fiscalizacao_ocorrencias_anexos')
      .insert({
        ocorrencia_id: idOcorrencia,
        nome_arquivo: file.name,
        caminho_arquivo: data.path,
        tipo_arquivo: file.type || null,
        tamanho_bytes: file.size || null
      });

    if (insertError) throw insertError;
  }

  anexosNovos = [];
  anexosParaRemover = [];
}

async function baixarAnexo(anexo) {
  if (!anexo?.caminho_arquivo) return;
  const { data, error } = await supabaseClient.storage.from(bucketAnexos).createSignedUrl(anexo.caminho_arquivo, 60);
  if (error) return alert(`Erro ao gerar link do anexo: ${error.message}`);
  window.open(data.signedUrl, '_blank');
}

function sanitizarNomeArquivo(nome) {
  return String(nome || 'arquivo')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_');
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
