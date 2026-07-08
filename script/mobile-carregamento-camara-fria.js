import { supabaseClient } from './supabase.js';
import { registrarAuditoria } from './auditoria-utils.js';

const state = {
    filialRestrita: '',
    acessoGlobal: true,
    listaAtual: null,
    contagemReferencia: null,
    produtos: [],
    estoqueContagem: new Map(),
    lancamentos: [],
    totaisPorProduto: new Map(),
    busca: '',
    realtimeChannel: null
};

const el = {};

document.addEventListener('DOMContentLoaded', async () => {
    const usuario = getUsuarioLogado();
    if (!usuario) {
        window.location.href = 'index.html';
        return;
    }

    cache();
    bind();
    aplicarRestricaoFilial();
    preencherUsuario();
    definirDataAtual();

    await loadFiliais();
    await renderListasRecentes();
});

function cache() {
    el.screenInicio = document.getElementById('screenInicio');
    el.screenProdutos = document.getElementById('screenProdutos');
    el.filial = document.getElementById('mobileCarregamentoFilial');
    el.data = document.getElementById('mobileCarregamentoData');
    el.usuario = document.getElementById('mobileCarregamentoUsuario');
    el.btnAbrir = document.getElementById('btnMobileAbrirLista');
    el.btnVoltar = document.getElementById('btnMobileVoltar');
    el.btnFinalizar = document.getElementById('btnMobileFinalizarLista');
    el.btnAtualizar = document.getElementById('btnMobileAtualizarLista');
    el.recentes = document.getElementById('mobileCarregamentosRecentes');
    el.produtosLista = document.getElementById('mobileProdutosCarregamentoLista');
    el.busca = document.getElementById('mobileBuscaProdutoCarregamento');
    el.titulo = document.getElementById('mobileTituloLista');
    el.subtitulo = document.getElementById('mobileSubtituloLista');
    el.status = document.getElementById('mobileStatusLista');
    el.info = document.getElementById('mobileInfoLista');
    el.kpiTotalLancado = document.getElementById('mobileKpiTotalLancado');
    el.kpiProdutos = document.getElementById('mobileKpiProdutos');
    el.kpiUsuarios = document.getElementById('mobileKpiUsuarios');
    el.resumoUsuarios = document.getElementById('mobileResumoUsuarios');
}

function bind() {
    el.btnAbrir.addEventListener('click', abrirOuCriarLista);
    el.btnVoltar.addEventListener('click', voltarInicio);
    el.btnFinalizar.addEventListener('click', () => {
        if (state.listaAtual?.status === 'FINALIZADO') {
            reabrirLista();
        } else {
            finalizarLista();
        }
    });
    el.btnAtualizar.addEventListener('click', atualizarListaAtual);

    el.busca.addEventListener('input', () => {
        state.busca = el.busca.value.trim().toLowerCase();
        renderProdutos();
    });

    el.filial.addEventListener('change', renderListasRecentes);
    el.data.addEventListener('change', renderListasRecentes);

    el.recentes.addEventListener('click', event => {
        const card = event.target.closest('[data-lista-id]');
        if (card) abrirListaPorId(card.dataset.listaId);
    });

    el.produtosLista.addEventListener('input', event => {
        if (event.target.matches('.input-paletes, .input-caixas')) {
            const card = event.target.closest('.produto-card');
            if (event.target.matches('.input-caixas')) {
                distribuirCaixasEmPaletes(card, event.target);
            }
            atualizarPreviewCard(card);
        }
    });

    el.produtosLista.addEventListener('click', event => {
        const button = event.target.closest('[data-action="lancar"]');
        if (button) lancarProduto(button.closest('.produto-card'));
    });

    window.addEventListener('beforeunload', desconectarRealtime);
}

function aplicarRestricaoFilial() {
    const usuario = getUsuarioLogado();
    const nivel = String(usuario?.nivel || '').trim().toLowerCase();
    state.acessoGlobal = ['administrador', 'gerencia'].includes(nivel) || !String(usuario?.filial || '').trim();
    state.filialRestrita = state.acessoGlobal ? '' : String(usuario.filial).trim();
}

function preencherUsuario() {
    const usuario = getUsuarioLogado();
    el.usuario.value = usuario?.nome || usuario?.usuario_login || '';
}

function definirDataAtual() {
    el.data.value = new Date().toISOString().slice(0, 10);
}

async function loadFiliais() {
    try {
        const { data, error } = await supabaseClient
            .from('filiais')
            .select('nome, sigla')
            .order('nome');
        if (error) throw error;

        el.filial.innerHTML = '<option value="">Selecione</option>'
            + (data || []).map(f => {
                const value = escapeHtml(f.sigla || f.nome);
                const label = escapeHtml(f.sigla ? `${f.nome} (${f.sigla})` : f.nome);
                return `<option value="${value}">${label}</option>`;
            }).join('');

        if (state.filialRestrita) {
            if (!Array.from(el.filial.options).some(option => option.value === state.filialRestrita)) {
                el.filial.add(new Option(state.filialRestrita, state.filialRestrita));
            }
            el.filial.value = state.filialRestrita;
            el.filial.disabled = true;
        }
    } catch (error) {
        console.error('Erro ao carregar filiais:', error);
        alert('Erro ao carregar filiais.');
    }
}

function validarBase() {
    if (!el.filial.value || !el.data.value) {
        alert('Preencha Filial e Data.');
        return false;
    }
    if (!el.usuario.value.trim()) {
        alert('Nao foi possivel identificar o usuario.');
        return false;
    }
    return true;
}

async function abrirOuCriarLista() {
    if (!validarBase()) return;

    setLoadingButton(el.btnAbrir, true, '<i class="fas fa-spinner fa-spin"></i> Abrindo...');
    try {
        const contagem = await buscarUltimaContagemFinalizada();
        if (!contagem) {
            alert('Nenhuma contagem finalizada encontrada para esta filial.');
            return;
        }

        let lista = await buscarListaAberta();
        if (!lista) lista = await criarLista(contagem);

        await abrirLista(lista, contagem);
        await renderListasRecentes();
    } catch (error) {
        console.error('Erro ao abrir lista:', error);
        alert('Erro ao abrir lista: ' + error.message);
    } finally {
        setLoadingButton(el.btnAbrir, false, '<i class="fas fa-folder-open"></i> Abrir/Criar Lista');
    }
}

async function buscarUltimaContagemFinalizada() {
    const { data, error } = await supabaseClient
        .from('contagens_camara_fria')
        .select('id, filial, semana, dia_semana, fabrica_id, funcionario, status, finalizada_em, updated_at, fabricas_camara_fria(nome)')
        .eq('filial', el.filial.value)
        .eq('status', 'FINALIZADA')
        .order('finalizada_em', { ascending: false })
        .order('updated_at', { ascending: false })
        .limit(1);
    if (error) throw error;
    return data?.[0] || null;
}

async function buscarListaAberta() {
    const { data, error } = await supabaseClient
        .from('carregamentos_camara_fria')
        .select('id, filial, fabrica_id, data_carregamento, contagem_referencia_id, usuario, status, created_at, updated_at')
        .eq('filial', el.filial.value)
        .eq('data_carregamento', el.data.value)
        .is('fabrica_id', null)
        .eq('status', 'ABERTO')
        .order('created_at', { ascending: false })
        .limit(1);
    if (error) throw error;
    return data?.[0] || null;
}

async function criarLista(contagem) {
    const payload = {
        filial: el.filial.value,
        fabrica_id: null,
        data_carregamento: el.data.value,
        contagem_referencia_id: contagem.id,
        usuario: el.usuario.value.trim(),
        status: 'ABERTO',
        updated_at: new Date().toISOString()
    };

    const { data, error } = await supabaseClient
        .from('carregamentos_camara_fria')
        .insert(payload)
        .select('id, filial, fabrica_id, data_carregamento, contagem_referencia_id, usuario, status, created_at, updated_at')
        .single();
    if (error) throw error;

    registrarAuditoria('INCLUIR', 'Camara Fria', `Lista de carregamento criada via app - Filial: ${payload.filial}, Data: ${payload.data_carregamento}`);
    return data;
}

async function abrirListaPorId(id) {
    try {
        setTelaProdutosLoading();
        const { data, error } = await supabaseClient
            .from('carregamentos_camara_fria')
            .select('id, filial, fabrica_id, data_carregamento, contagem_referencia_id, usuario, status, created_at, updated_at')
            .eq('id', id)
            .single();
        if (error) throw error;

        if (!state.filialRestrita) el.filial.value = data.filial || '';
        el.data.value = data.data_carregamento || el.data.value;

        const contagem = data.contagem_referencia_id
            ? await buscarContagemPorId(data.contagem_referencia_id)
            : await buscarUltimaContagemFinalizada();

        await abrirLista(data, contagem);
    } catch (error) {
        console.error('Erro ao abrir lista recente:', error);
        alert('Erro ao abrir lista: ' + error.message);
        voltarInicio();
    }
}

async function buscarContagemPorId(id) {
    const { data, error } = await supabaseClient
        .from('contagens_camara_fria')
        .select('id, filial, semana, dia_semana, fabrica_id, funcionario, status, finalizada_em, updated_at, fabricas_camara_fria(nome)')
        .eq('id', id)
        .single();
    if (error) throw error;
    return data;
}

async function abrirLista(lista, contagem) {
    state.listaAtual = lista;
    state.contagemReferencia = contagem;
    state.busca = '';
    el.busca.value = '';

    setTelaProdutosLoading();
    await carregarProdutosEContagem();
    await buscarLancamentos();
    renderTelaLista();
    configurarRealtime();
}

function setTelaProdutosLoading() {
    el.screenInicio.classList.add('hidden');
    el.screenProdutos.classList.remove('hidden');
    el.produtosLista.innerHTML = '<div class="loading">Carregando produtos...</div>';
}

async function carregarProdutosEContagem() {
    const [produtosResult, itensResult] = await Promise.all([
        buscarProdutos(),
        buscarItensContagem(state.contagemReferencia?.id)
    ]);
    if (produtosResult.error) throw produtosResult.error;
    if (itensResult.error) throw itensResult.error;

    state.produtos = produtosResult.data || [];
    state.estoqueContagem = new Map((itensResult.data || []).map(item => [String(item.produto_id), item]));
}

function buscarProdutos() {
    let query = supabaseClient
        .from('produtos_camara_fria')
        .select('id, codigo, nome, tipo, peso_caixa, caixas_por_palete, filial')
        .eq('ativo', true)
        .order('nome');

    if (el.filial.value) query = query.or(`filial.eq.${el.filial.value},filial.is.null`);
    return query;
}

function buscarItensContagem(contagemId) {
    if (!contagemId) return Promise.resolve({ data: [] });
    return supabaseClient
        .from('contagem_camara_fria_itens')
        .select('id, produto_id, quantidade_caixas, observacao')
        .eq('contagem_id', contagemId);
}

async function buscarLancamentos() {
    if (!state.listaAtual?.id) {
        state.lancamentos = [];
        recalcularTotaisLancamentos();
        return;
    }

    const { data, error } = await supabaseClient
        .from('carregamento_camara_fria_lancamentos')
        .select('id, carregamento_id, produto_id, usuario, quantidade_caixas, observacao, created_at')
        .eq('carregamento_id', state.listaAtual.id)
        .order('created_at', { ascending: true });
    if (error) throw error;

    state.lancamentos = data || [];
    recalcularTotaisLancamentos();
}

function recalcularTotaisLancamentos() {
    const mapa = new Map();
    state.lancamentos.forEach(lancamento => {
        const produtoId = String(lancamento.produto_id);
        if (!mapa.has(produtoId)) {
            mapa.set(produtoId, {
                total: 0,
                usuarios: new Set(),
                usuarioTotais: new Map(),
                ultimoUsuario: '',
                ultimoHorario: ''
            });
        }
        const item = mapa.get(produtoId);
        const usuario = lancamento.usuario || 'Sistema';
        item.total += Number(lancamento.quantidade_caixas) || 0;
        item.usuarios.add(usuario);
        item.usuarioTotais.set(usuario, (item.usuarioTotais.get(usuario) || 0) + (Number(lancamento.quantidade_caixas) || 0));
        item.ultimoUsuario = usuario;
        item.ultimoHorario = lancamento.created_at || '';
    });
    state.totaisPorProduto = mapa;
}

function renderTelaLista() {
    el.screenInicio.classList.add('hidden');
    el.screenProdutos.classList.remove('hidden');

    const statusFinalizado = state.listaAtual?.status === 'FINALIZADO';
    el.titulo.textContent = `Lista ${formatDate(state.listaAtual?.data_carregamento)}`;
    el.subtitulo.textContent = `Filial: ${state.listaAtual?.filial || '-'} | Contagem: ${formatSemanaDisplay(state.contagemReferencia?.semana)}`;
    el.status.textContent = statusFinalizado ? 'Finalizada' : 'Aberta';
    el.status.className = `status-pill ${statusFinalizado ? 'finalizado' : ''}`;
    el.info.textContent = `${state.contagemReferencia?.fabricas_camara_fria?.nome || 'Contagem unica'} | Atualizacao ao vivo`;
    el.btnFinalizar.disabled = false;
    el.btnFinalizar.classList.toggle('btn-refresh', statusFinalizado);
    el.btnFinalizar.classList.toggle('btn-finish', !statusFinalizado);
    el.btnFinalizar.innerHTML = statusFinalizado
        ? '<i class="fas fa-lock-open"></i> Reabrir'
        : '<i class="fas fa-check"></i> Finalizar';

    renderProdutos();
    atualizarTotais();
    renderResumoUsuarios();
}

function renderProdutos() {
    const termo = state.busca;
    const filtrados = state.produtos.filter(produto => {
        if (!termo) return true;
        return [
            produto.codigo,
            produto.nome,
            produto.tipo
        ].some(value => String(value || '').toLowerCase().includes(termo));
    });

    if (filtrados.length === 0) {
        el.produtosLista.innerHTML = '<div class="empty-state">Nenhum produto encontrado.</div>';
        return;
    }

    const finalizado = state.listaAtual?.status === 'FINALIZADO';
    el.produtosLista.innerHTML = filtrados.map(produto => {
        const totalInfo = state.totaisPorProduto.get(String(produto.id));
        const estoque = Number(state.estoqueContagem.get(String(produto.id))?.quantidade_caixas) || 0;
        return `
            <article class="card produto-card" data-produto-id="${produto.id}" data-caixas-por-palete="${produto.caixas_por_palete || 0}">
                <div class="produto-card-header">
                    <div>
                        <h4>${escapeHtml(produto.nome)}</h4>
                        <small>${escapeHtml(produto.codigo || '-')} | ${escapeHtml(produto.tipo || '-')} | ${produto.caixas_por_palete || 0} cx/palete</small>
                    </div>
                    <span class="status-pill">${totalInfo?.total || 0}</span>
                </div>

                <div class="produto-total-row">
                    <div class="total-box">
                        <span>Estoque</span>
                        <strong>${estoque}</strong>
                    </div>
                    <div class="total-box">
                        <span>Lancado</span>
                        <strong class="total-lancado">${totalInfo?.total || 0}</strong>
                    </div>
                    <div class="total-box">
                        <span>Usuarios</span>
                        <strong class="total-usuarios">${totalInfo ? totalInfo.usuarios.size : 0}</strong>
                    </div>
                </div>

                <div class="produto-grid">
                    <div class="form-group">
                        <label>Paletes</label>
                        <input type="number" min="0" step="1" class="input-paletes" ${finalizado ? 'disabled' : ''}>
                    </div>
                    <div class="form-group">
                        <label>Caixas</label>
                        <input type="number" min="0" step="1" class="input-caixas" title="Digite o total de caixas para calcular os paletes" ${finalizado ? 'disabled' : ''}>
                    </div>
                </div>

                <button type="button" class="btn-lancar" data-action="lancar" ${finalizado ? 'disabled' : ''}>
                    <i class="fas fa-plus"></i> Lancar <span class="preview-lancar"></span>
                </button>
                <div class="ultimo-lancamento">${formatUltimoLancamento(totalInfo)}</div>
                <div class="usuarios-produto">${formatUsuariosProduto(totalInfo)}</div>
            </article>
        `;
    }).join('');
}

function atualizarPreviewCard(card) {
    if (!card) return;
    const total = getQuantidadeCard(card);
    const preview = card.querySelector('.preview-lancar');
    if (preview) preview.textContent = total > 0 ? `(${total})` : '';
}

function distribuirCaixasEmPaletes(card, inputCaixas) {
    if (!card || !inputCaixas) return;

    const valor = String(inputCaixas.value || '').trim();
    const caixasPorPalete = Number(card.dataset.caixasPorPalete) || 0;
    if (!valor || caixasPorPalete <= 0) return;

    const totalCaixas = parseInt(valor, 10);
    if (!Number.isFinite(totalCaixas) || totalCaixas < 0) return;

    const inputPaletes = card.querySelector('.input-paletes');
    const quantidades = calcularQuantidadesPelasCaixas(totalCaixas, caixasPorPalete);
    if (inputPaletes) inputPaletes.value = quantidades.paletes;
    inputCaixas.value = quantidades.caixasAvulsas;
}

async function lancarProduto(card) {
    if (!card || !state.listaAtual?.id) return;
    if (state.listaAtual.status === 'FINALIZADO') return alert('Esta lista ja esta finalizada.');

    const quantidade = getQuantidadeCard(card);
    if (quantidade <= 0) return alert('Informe paletes ou caixas para lancar.');

    const payload = {
        carregamento_id: state.listaAtual.id,
        produto_id: card.dataset.produtoId,
        usuario: el.usuario.value.trim() || 'Sistema',
        quantidade_caixas: quantidade,
        created_at: new Date().toISOString()
    };

    const button = card.querySelector('[data-action="lancar"]');
    setLoadingButton(button, true, '<i class="fas fa-spinner fa-spin"></i> Lancando...');

    try {
        const { error } = await supabaseClient
            .from('carregamento_camara_fria_lancamentos')
            .insert(payload);
        if (error) throw error;

        card.querySelector('.input-paletes').value = '';
        card.querySelector('.input-caixas').value = '';
        atualizarPreviewCard(card);
        await atualizarListaAtual(false);
    } catch (error) {
        console.error('Erro ao lancar produto:', error);
        alert('Erro ao lancar produto: ' + error.message);
    } finally {
        setLoadingButton(button, false, '<i class="fas fa-plus"></i> Lancar <span class="preview-lancar"></span>');
    }
}

function getQuantidadeCard(card) {
    const paletes = getNumero(card.querySelector('.input-paletes')?.value);
    const caixas = getNumero(card.querySelector('.input-caixas')?.value);
    const caixasPorPalete = Number(card.dataset.caixasPorPalete) || 0;
    return (paletes * caixasPorPalete) + caixas;
}

function calcularQuantidadesPelasCaixas(caixas, caixasPorPalete) {
    const totalCaixas = Number(caixas) || 0;
    if (!totalCaixas) return { paletes: '', caixasAvulsas: '' };
    if (!caixasPorPalete) return { paletes: '', caixasAvulsas: String(totalCaixas) };

    const paletes = Math.floor(totalCaixas / caixasPorPalete);
    const caixasAvulsas = totalCaixas % caixasPorPalete;
    return {
        paletes: paletes ? String(paletes) : '',
        caixasAvulsas: caixasAvulsas ? String(caixasAvulsas) : ''
    };
}

async function atualizarListaAtual(renderizarProdutos = true) {
    if (!state.listaAtual?.id) return;
    await buscarLancamentos();
    if (renderizarProdutos) renderProdutos();
    else atualizarCardsLancamentos();
    atualizarTotais();
}

function atualizarCardsLancamentos() {
    el.produtosLista.querySelectorAll('.produto-card').forEach(card => {
        const totalInfo = state.totaisPorProduto.get(String(card.dataset.produtoId));
        const total = totalInfo?.total || 0;
        card.querySelector('.status-pill').textContent = String(total);
        card.querySelector('.total-lancado').textContent = String(total);
        card.querySelector('.total-usuarios').textContent = String(totalInfo ? totalInfo.usuarios.size : 0);
        card.querySelector('.ultimo-lancamento').innerHTML = formatUltimoLancamento(totalInfo);
        card.querySelector('.usuarios-produto').innerHTML = formatUsuariosProduto(totalInfo);
    });
}

function atualizarTotais() {
    const totalLancado = state.lancamentos.reduce((acc, item) => acc + (Number(item.quantidade_caixas) || 0), 0);
    const produtosLancados = Array.from(state.totaisPorProduto.values()).filter(item => item.total > 0).length;
    const usuarios = new Set(state.lancamentos.map(item => item.usuario).filter(Boolean)).size;

    el.kpiTotalLancado.textContent = String(totalLancado);
    el.kpiProdutos.textContent = String(produtosLancados);
    el.kpiUsuarios.textContent = String(usuarios);
    renderResumoUsuarios();
}

function renderResumoUsuarios() {
    if (!el.resumoUsuarios) return;

    if (state.lancamentos.length === 0) {
        el.resumoUsuarios.innerHTML = '<div class="empty-state">Nenhum lancamento ainda.</div>';
        return;
    }

    const produtosPorId = new Map(state.produtos.map(produto => [String(produto.id), produto]));
    const usuarios = new Map();

    state.lancamentos.forEach(lancamento => {
        const usuario = lancamento.usuario || 'Sistema';
        const produto = produtosPorId.get(String(lancamento.produto_id));
        const produtoNome = produto?.nome || 'Produto nao encontrado';
        const produtoCodigo = produto?.codigo || '-';
        const quantidade = Number(lancamento.quantidade_caixas) || 0;

        if (!usuarios.has(usuario)) {
            usuarios.set(usuario, { total: 0, produtos: new Map() });
        }

        const infoUsuario = usuarios.get(usuario);
        infoUsuario.total += quantidade;
        const chaveProduto = String(lancamento.produto_id);
        const infoProduto = infoUsuario.produtos.get(chaveProduto) || {
            codigo: produtoCodigo,
            nome: produtoNome,
            total: 0
        };
        infoProduto.total += quantidade;
        infoUsuario.produtos.set(chaveProduto, infoProduto);
    });

    el.resumoUsuarios.innerHTML = Array.from(usuarios.entries()).map(([usuario, info]) => {
        const produtosHtml = Array.from(info.produtos.values())
            .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
            .map(produto => `<li><strong>${escapeHtml(produto.codigo)}</strong> - ${escapeHtml(produto.nome)}: ${produto.total} cx</li>`)
            .join('');

        return `
            <article class="card resumo-usuario-card">
                <h4><span>${escapeHtml(usuario)}</span><strong>${info.total} cx</strong></h4>
                <ul class="resumo-produtos">${produtosHtml}</ul>
            </article>
        `;
    }).join('');
}

async function finalizarLista() {
    if (!state.listaAtual?.id) return alert('Abra uma lista antes de finalizar.');
    if (!confirm('Finalizar esta lista? Novos lancamentos serao bloqueados.')) return;

    await buscarLancamentos();
    const itens = Array.from(state.totaisPorProduto.entries())
        .filter(([, info]) => info.total > 0)
        .map(([produtoId, info]) => {
            const estoque = Number(state.estoqueContagem.get(String(produtoId))?.quantidade_caixas) || 0;
            return {
                carregamento_id: state.listaAtual.id,
                produto_id: produtoId,
                quantidade_necessaria_caixas: info.total,
                estoque_contagem_caixas: estoque,
                diferenca_caixas: estoque - info.total,
                observacao: `Lancado por ${info.usuarios.size} usuario(s)`,
                updated_at: new Date().toISOString()
            };
        });

    if (itens.length === 0) return alert('Nenhum produto foi lancado nesta lista.');

    setLoadingButton(el.btnFinalizar, true, '<i class="fas fa-spinner fa-spin"></i> Finalizando...');
    try {
        const { error: deleteError } = await supabaseClient
            .from('carregamento_camara_fria_itens')
            .delete()
            .eq('carregamento_id', state.listaAtual.id);
        if (deleteError) throw deleteError;

        const { error: insertError } = await supabaseClient
            .from('carregamento_camara_fria_itens')
            .insert(itens);
        if (insertError) throw insertError;

        const { error: updateError } = await supabaseClient
            .from('carregamentos_camara_fria')
            .update({ status: 'FINALIZADO', updated_at: new Date().toISOString() })
            .eq('id', state.listaAtual.id);
        if (updateError) throw updateError;

        registrarAuditoria('ALTERAR', 'Camara Fria', `Lista de carregamento finalizada via app - ID: ${state.listaAtual.id}`);
        state.listaAtual.status = 'FINALIZADO';
        desconectarRealtime();
        renderTelaLista();
        await renderListasRecentes();
        alert('Lista finalizada com sucesso!');
    } catch (error) {
        console.error('Erro ao finalizar lista:', error);
        alert('Erro ao finalizar lista: ' + error.message);
    } finally {
        setLoadingButton(el.btnFinalizar, false, state.listaAtual?.status === 'FINALIZADO'
            ? '<i class="fas fa-lock-open"></i> Reabrir'
            : '<i class="fas fa-check"></i> Finalizar');
    }
}

async function reabrirLista() {
    if (!state.listaAtual?.id) return alert('Abra uma lista antes de reabrir.');
    if (state.listaAtual.status !== 'FINALIZADO') return;
    if (!confirm('Reabrir esta lista para continuar lancando?')) return;

    setLoadingButton(el.btnFinalizar, true, '<i class="fas fa-spinner fa-spin"></i> Reabrindo...');
    try {
        const { error } = await supabaseClient
            .from('carregamentos_camara_fria')
            .update({ status: 'ABERTO', updated_at: new Date().toISOString() })
            .eq('id', state.listaAtual.id);
        if (error) throw error;

        registrarAuditoria('ALTERAR', 'Camara Fria', `Lista de carregamento reaberta via app - ID: ${state.listaAtual.id}`);
        state.listaAtual.status = 'ABERTO';
        renderTelaLista();
        configurarRealtime();
        await renderListasRecentes();
        alert('Lista reaberta com sucesso. Voce ja pode continuar lancando.');
    } catch (error) {
        console.error('Erro ao reabrir lista:', error);
        alert('Erro ao reabrir lista: ' + error.message);
    } finally {
        setLoadingButton(el.btnFinalizar, false, state.listaAtual?.status === 'FINALIZADO'
            ? '<i class="fas fa-lock-open"></i> Reabrir'
            : '<i class="fas fa-check"></i> Finalizar');
    }
}

function configurarRealtime() {
    desconectarRealtime();
    if (!state.listaAtual?.id || state.listaAtual.status === 'FINALIZADO') return;

    state.realtimeChannel = supabaseClient
        .channel(`mobile-carregamento-camara-fria-${state.listaAtual.id}`)
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'carregamento_camara_fria_lancamentos',
                filter: `carregamento_id=eq.${state.listaAtual.id}`
            },
            async () => {
                try {
                    await atualizarListaAtual(false);
                } catch (error) {
                    console.error('Erro ao atualizar em tempo real:', error);
                }
            }
        )
        .subscribe();
}

function desconectarRealtime() {
    if (state.realtimeChannel) {
        supabaseClient.removeChannel(state.realtimeChannel);
        state.realtimeChannel = null;
    }
}

function voltarInicio() {
    desconectarRealtime();
    state.listaAtual = null;
    state.contagemReferencia = null;
    state.produtos = [];
    state.estoqueContagem = new Map();
    state.lancamentos = [];
    state.totaisPorProduto = new Map();
    el.screenProdutos.classList.add('hidden');
    el.screenInicio.classList.remove('hidden');
    renderListasRecentes();
}

async function renderListasRecentes() {
    try {
        let query = supabaseClient
            .from('carregamentos_camara_fria')
            .select('id, filial, fabrica_id, data_carregamento, usuario, status, created_at, contagens_camara_fria(semana), fabricas_camara_fria(nome)')
            .order('created_at', { ascending: false })
            .limit(30);

        if (el.filial?.value) query = query.eq('filial', el.filial.value);
        if (el.data?.value) query = query.eq('data_carregamento', el.data.value);

        const { data, error } = await query;
        if (error) throw error;

        const registros = data || [];
        if (registros.length === 0) {
            el.recentes.innerHTML = '<div class="empty-state">Nenhuma lista encontrada.</div>';
            return;
        }

        el.recentes.innerHTML = registros.map(item => `
            <article class="card recent-card ${item.status === 'FINALIZADO' ? 'finalizado' : 'aberto'}" data-lista-id="${item.id}">
                <div class="card-header-row">
                    <div>
                        <h4>${escapeHtml(item.filial)} - ${formatDate(item.data_carregamento)}</h4>
                        <small>${escapeHtml(item.fabricas_camara_fria?.nome || 'Contagem unica')} | Ref. ${formatSemanaDisplay(item.contagens_camara_fria?.semana)}</small>
                    </div>
                    <span class="status-pill ${item.status === 'FINALIZADO' ? 'finalizado' : ''}">${item.status === 'FINALIZADO' ? 'Finalizada' : 'Aberta'}</span>
                </div>
                <p>Usuario: ${escapeHtml(item.usuario || '-')}</p>
            </article>
        `).join('');
    } catch (error) {
        console.error('Erro ao carregar listas recentes:', error);
        el.recentes.innerHTML = '<div class="empty-state">Erro ao carregar listas.</div>';
    }
}

function getUsuarioLogado() {
    try {
        return JSON.parse(localStorage.getItem('usuarioLogado') || 'null');
    } catch {
        return null;
    }
}

function getNumero(value) {
    const numero = parseInt(value, 10);
    return Number.isFinite(numero) && numero >= 0 ? numero : 0;
}

function setLoadingButton(button, loading, html) {
    if (!button) return;
    button.disabled = loading;
    button.innerHTML = html;
}

function formatUltimoLancamento(info) {
    if (!info?.ultimoHorario) return 'Nenhum lancamento ainda.';
    return `Ultimo: <strong>${escapeHtml(info.ultimoUsuario || '-')}</strong> em ${formatDateTime(info.ultimoHorario)}`;
}

function formatUsuariosProduto(info) {
    if (!info?.usuarioTotais?.size) return 'Usuarios: nenhum lancamento.';
    const partes = Array.from(info.usuarioTotais.entries())
        .sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'))
        .map(([usuario, total]) => `${escapeHtml(usuario)}: <strong>${total} cx</strong>`);
    return `Usuarios: ${partes.join(' | ')}`;
}

function formatSemanaDisplay(value) {
    const match = String(value || '').match(/^(\d{4})-W(\d{2})$/);
    return match ? `${match[2]}-${match[1]}` : (value || '-');
}

function formatDate(value) {
    if (!value) return '-';
    return new Date(`${value}T00:00:00`).toLocaleDateString('pt-BR');
}

function formatDateTime(value) {
    if (!value) return '-';
    return new Date(value).toLocaleString('pt-BR');
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}
