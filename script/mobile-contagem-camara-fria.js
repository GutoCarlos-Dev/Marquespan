import { supabaseClient } from './supabase.js';

const state = {
    filialRestrita: '',
    acessoGlobal: true,
    contagemAtual: null,
    produtos: [],
    itens: new Map(),
    fabricas: [],
    busca: ''
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
    preencherFuncionario();
    definirSemanaAtual();

    await Promise.all([loadFiliais(), loadFabricas()]);
    await renderContagensRecentes();
});

function cache() {
    el.screenInicio = document.getElementById('screenInicio');
    el.screenProdutos = document.getElementById('screenProdutos');
    el.filial = document.getElementById('mobileContagemFilial');
    el.semana = document.getElementById('mobileContagemSemana');
    el.fabrica = document.getElementById('mobileContagemFabrica');
    el.funcionario = document.getElementById('mobileContagemFuncionario');
    el.btnIniciar = document.getElementById('btnMobileIniciarContagem');
    el.btnVoltar = document.getElementById('btnMobileVoltar');
    el.btnSalvar = document.getElementById('btnMobileSalvarContagem');
    el.btnFinalizar = document.getElementById('btnMobileFinalizarContagem');
    el.btnPDF = document.getElementById('btnMobileResumoPDF');
    el.btnCancelar = document.getElementById('btnMobileCancelarContagem');
    el.recentes = document.getElementById('mobileContagensRecentes');
    el.produtosLista = document.getElementById('mobileProdutosLista');
    el.busca = document.getElementById('mobileBuscaProduto');
    el.titulo = document.getElementById('mobileTituloContagem');
    el.subtitulo = document.getElementById('mobileSubtituloContagem');
    el.status = document.getElementById('mobileStatusContagem');
    el.info = document.getElementById('mobileInfoContagem');
    el.kpiCaixas = document.getElementById('mobileKpiCaixas');
    el.kpiPeso = document.getElementById('mobileKpiPeso');
    el.kpiItens = document.getElementById('mobileKpiItens');
}

function bind() {
    el.btnIniciar.addEventListener('click', iniciarContagem);
    el.btnVoltar.addEventListener('click', voltarInicio);
    el.btnSalvar.addEventListener('click', () => salvarItens(true));
    el.btnFinalizar.addEventListener('click', finalizarContagem);
    el.btnPDF.addEventListener('click', () => gerarResumoPDF());
    el.btnCancelar.addEventListener('click', cancelarContagem);
    el.busca.addEventListener('input', () => {
        state.busca = el.busca.value.trim().toLowerCase();
        renderProdutos();
    });

    [el.filial, el.semana, el.fabrica].forEach(input => {
        input.addEventListener('change', () => renderContagensRecentes());
    });

    el.produtosLista.addEventListener('input', event => {
        if (event.target.matches('.input-paletes, .input-caixas')) {
            atualizarCard(event.target.closest('.produto-card'));
            atualizarTotais();
        }
    });
}

function aplicarRestricaoFilial() {
    const usuario = getUsuarioLogado();
    const nivel = String(usuario?.nivel || '').trim().toLowerCase();
    state.acessoGlobal = ['administrador', 'gerencia'].includes(nivel) || !String(usuario?.filial || '').trim();
    state.filialRestrita = state.acessoGlobal ? '' : String(usuario.filial).trim();
}

function preencherFuncionario() {
    const usuario = getUsuarioLogado();
    el.funcionario.value = usuario?.nome || usuario?.usuario_login || '';
}

function definirSemanaAtual() {
    const hoje = new Date();
    const data = new Date(Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()));
    const dia = data.getUTCDay() || 7;
    data.setUTCDate(data.getUTCDate() + 4 - dia);
    const ano = data.getUTCFullYear();
    const inicioAno = new Date(Date.UTC(ano, 0, 1));
    const semana = Math.ceil((((data - inicioAno) / 86400000) + 1) / 7);
    el.semana.value = `${ano}-W${String(semana).padStart(2, '0')}`;
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

async function loadFabricas() {
    try {
        const { data, error } = await supabaseClient
            .from('fabricas_camara_fria')
            .select('id, nome')
            .eq('ativo', true)
            .order('nome');
        if (error) throw error;

        state.fabricas = data || [];
        el.fabrica.innerHTML = '<option value="">Selecione</option>'
            + state.fabricas.map(f => `<option value="${f.id}">${escapeHtml(f.nome)}</option>`).join('');
    } catch (error) {
        console.error('Erro ao carregar fabricas:', error);
        alert('Erro ao carregar fabricas.');
    }
}

function validarBase() {
    if (!el.filial.value || !el.semana.value || !el.fabrica.value) {
        alert('Preencha Filial, Semana e Fabrica.');
        return false;
    }
    if (!el.funcionario.value.trim()) {
        alert('Nao foi possivel identificar o funcionario.');
        return false;
    }
    return true;
}

async function iniciarContagem() {
    if (!validarBase()) return;

    setLoadingButton(el.btnIniciar, true, '<i class="fas fa-spinner fa-spin"></i> Iniciando...');
    try {
        const existente = await buscarContagemAtual();
        if (existente) {
            state.contagemAtual = existente;
        } else {
            const payload = {
                filial: el.filial.value,
                semana: el.semana.value,
                fabrica_id: el.fabrica.value,
                funcionario: el.funcionario.value.trim(),
                status: 'EM_ANDAMENTO',
                updated_at: new Date().toISOString()
            };
            const { data, error } = await supabaseClient
                .from('contagens_camara_fria')
                .insert(payload)
                .select('id, filial, semana, fabrica_id, funcionario, status, iniciada_em, finalizada_em, updated_at')
                .single();
            if (error) throw error;
            state.contagemAtual = data;
        }

        await carregarProdutosEItens();
        abrirTelaProdutos();
        await renderContagensRecentes();
    } catch (error) {
        console.error('Erro ao iniciar contagem:', error);
        alert('Erro ao iniciar contagem: ' + error.message);
    } finally {
        setLoadingButton(el.btnIniciar, false, '<i class="fas fa-play"></i> Iniciar Contagem');
    }
}

async function buscarContagemAtual() {
    const { data, error } = await supabaseClient
        .from('contagens_camara_fria')
        .select('id, filial, semana, fabrica_id, funcionario, status, iniciada_em, finalizada_em, updated_at')
        .eq('filial', el.filial.value)
        .eq('semana', el.semana.value)
        .eq('fabrica_id', el.fabrica.value)
        .maybeSingle();
    if (error) throw error;
    return data || null;
}

async function carregarProdutosEItens() {
    if (!state.contagemAtual) return;

    el.produtosLista.innerHTML = '<div class="loading">Carregando produtos...</div>';

    let produtosQuery = supabaseClient
        .from('produtos_camara_fria')
        .select('id, codigo, nome, tipo, peso_caixa, caixas_por_palete, filial')
        .eq('ativo', true)
        .order('nome');

    if (state.contagemAtual.filial) {
        produtosQuery = produtosQuery.or(`filial.eq.${state.contagemAtual.filial},filial.is.null`);
    }

    const [produtosResult, itensResult] = await Promise.all([
        produtosQuery,
        supabaseClient
            .from('contagem_camara_fria_itens')
            .select('id, produto_id, quantidade_caixas, observacao')
            .eq('contagem_id', state.contagemAtual.id)
    ]);

    if (produtosResult.error) throw produtosResult.error;
    if (itensResult.error) throw itensResult.error;

    state.produtos = produtosResult.data || [];
    state.itens = new Map((itensResult.data || []).map(item => [String(item.produto_id), item]));
    renderProdutos();
    atualizarCabecalhoContagem();
}

function abrirTelaProdutos() {
    el.screenInicio.classList.add('hidden');
    el.screenProdutos.classList.remove('hidden');
    atualizarCabecalhoContagem();
}

function voltarInicio() {
    el.screenProdutos.classList.add('hidden');
    el.screenInicio.classList.remove('hidden');
    renderContagensRecentes();
}

function atualizarCabecalhoContagem() {
    const contagem = state.contagemAtual;
    if (!contagem) return;

    const fabrica = getNomeFabrica(contagem.fabrica_id);
    el.titulo.textContent = `${contagem.filial} | ${formatSemanaDisplay(contagem.semana)}`;
    el.subtitulo.textContent = `${fabrica} | ${contagem.funcionario || '-'}`;
    el.status.textContent = contagem.status === 'FINALIZADA' ? 'Finalizada' : 'Em andamento';
    el.status.className = `status-pill ${contagem.status === 'FINALIZADA' ? 'finalizada' : ''}`;
    el.info.textContent = `Iniciada em: ${formatDateTime(contagem.iniciada_em)}`;

    const finalizada = contagem.status === 'FINALIZADA';
    el.btnSalvar.disabled = finalizada;
    el.btnFinalizar.disabled = finalizada;
    el.btnCancelar.disabled = finalizada;
}

function renderProdutos() {
    const termo = state.busca;
    const produtos = state.produtos.filter(produto => {
        if (!termo) return true;
        return `${produto.codigo || ''} ${produto.nome || ''} ${produto.tipo || ''}`.toLowerCase().includes(termo);
    });

    if (produtos.length === 0) {
        el.produtosLista.innerHTML = '<div class="empty-state">Nenhum produto encontrado.</div>';
        atualizarTotais();
        return;
    }

    const finalizada = state.contagemAtual?.status === 'FINALIZADA';
    el.produtosLista.innerHTML = produtos.map(produto => {
        const item = state.itens.get(String(produto.id));
        const totalCaixas = Number(item?.quantidade_caixas) || 0;
        const caixasPorPalete = Number(produto.caixas_por_palete) || 0;
        const quantidades = calcularQuantidadesPelasCaixas(totalCaixas, caixasPorPalete);
        const pesoTotal = totalCaixas * (Number(produto.peso_caixa) || 0);
        const disabled = finalizada ? 'disabled' : '';

        return `
            <article class="card produto-card"
                data-produto-id="${produto.id}"
                data-item-id="${item?.id || ''}"
                data-peso-caixa="${produto.peso_caixa || 0}"
                data-caixas-por-palete="${caixasPorPalete}">
                <div class="produto-card-header">
                    <div>
                        <h4>${escapeHtml(produto.nome)}</h4>
                        <p class="produto-meta">
                            ${escapeHtml(produto.codigo || '-')} | ${escapeHtml(produto.tipo || '-')} | ${caixasPorPalete || '-'} caixas/palete
                        </p>
                    </div>
                    <span class="status-pill">${escapeHtml(produto.filial || 'TODAS')}</span>
                </div>

                <div class="produto-grid">
                    <div class="form-group">
                        <label>Qtd Paletes</label>
                        <input type="number" min="0" step="1" class="input-paletes" value="${quantidades.paletes}" ${disabled}>
                    </div>
                    <div class="form-group">
                        <label>Qtd Caixas</label>
                        <input type="number" min="0" step="1" class="input-caixas" value="${quantidades.caixasAvulsas}" ${disabled}>
                    </div>
                </div>

                <div class="produto-total-row">
                    <div class="total-box">
                        <span>Total Caixas</span>
                        <strong class="total-caixas">${totalCaixas}</strong>
                    </div>
                    <div class="total-box">
                        <span>Peso Total</span>
                        <strong class="total-peso">${formatPeso(pesoTotal)} KG</strong>
                    </div>
                </div>

                <div class="produto-observacao">
                    <label>Observacao</label>
                    <textarea class="input-observacao" rows="2" placeholder="Opcional" ${disabled}>${escapeHtml(item?.observacao || '')}</textarea>
                </div>
            </article>
        `;
    }).join('');

    atualizarTotais();
}

function atualizarCard(card) {
    if (!card) return;
    const caixas = getCaixasCard(card);
    const pesoCaixa = Number(card.dataset.pesoCaixa) || 0;
    card.querySelector('.total-caixas').textContent = String(caixas);
    card.querySelector('.total-peso').textContent = `${formatPeso(caixas * pesoCaixa)} KG`;
}

function atualizarTotais() {
    const cards = Array.from(el.produtosLista.querySelectorAll('.produto-card'));
    let caixas = 0;
    let peso = 0;
    let itens = 0;

    cards.forEach(card => {
        const temValor = String(card.querySelector('.input-paletes')?.value || '').trim() !== ''
            || String(card.querySelector('.input-caixas')?.value || '').trim() !== '';
        const totalCaixas = getCaixasCard(card);
        caixas += totalCaixas;
        peso += totalCaixas * (Number(card.dataset.pesoCaixa) || 0);
        if (temValor) itens += 1;
    });

    el.kpiCaixas.textContent = String(caixas);
    el.kpiPeso.textContent = `${formatPeso(peso)} KG`;
    el.kpiItens.textContent = String(itens);
}

async function salvarItens(mostrarAlerta = true) {
    if (!state.contagemAtual) return false;
    if (state.contagemAtual.status === 'FINALIZADA') {
        alert('Esta contagem ja foi finalizada.');
        return false;
    }

    const cards = Array.from(el.produtosLista.querySelectorAll('.produto-card'));
    const upserts = [];
    const deletarIds = [];

    for (const card of cards) {
        const valorPaletes = String(card.querySelector('.input-paletes')?.value || '').trim();
        const valorCaixas = String(card.querySelector('.input-caixas')?.value || '').trim();
        const itemId = card.dataset.itemId;

        if (!valorPaletes && !valorCaixas) {
            if (itemId) deletarIds.push(itemId);
            continue;
        }

        const paletes = getNumeroInteiro(card.querySelector('.input-paletes')?.value);
        const caixasAvulsas = getNumeroInteiro(card.querySelector('.input-caixas')?.value);
        const caixasPorPalete = Number(card.dataset.caixasPorPalete) || 0;
        if (paletes < 0 || caixasAvulsas < 0) {
            alert('Informe quantidades validas.');
            return false;
        }
        if (paletes > 0 && caixasPorPalete <= 0) {
            alert('Para informar paletes, cadastre a quantidade de Caixas/Palete do produto.');
            return false;
        }

        upserts.push({
            contagem_id: state.contagemAtual.id,
            produto_id: card.dataset.produtoId,
            quantidade_caixas: getCaixasCard(card),
            observacao: card.querySelector('.input-observacao')?.value.trim() || null,
            updated_at: new Date().toISOString()
        });
    }

    setLoadingButton(el.btnSalvar, true, '<i class="fas fa-spinner fa-spin"></i> Salvando...');
    try {
        if (upserts.length > 0) {
            const { error } = await supabaseClient
                .from('contagem_camara_fria_itens')
                .upsert(upserts, { onConflict: 'contagem_id,produto_id' });
            if (error) throw error;
        }

        if (deletarIds.length > 0) {
            const { error } = await supabaseClient
                .from('contagem_camara_fria_itens')
                .delete()
                .in('id', deletarIds);
            if (error) throw error;
        }

        const { error: updateError } = await supabaseClient
            .from('contagens_camara_fria')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', state.contagemAtual.id);
        if (updateError) throw updateError;

        await recarregarContagemAtual();
        await carregarProdutosEItens();
        await renderContagensRecentes();
        if (mostrarAlerta) alert('Contagem salva com sucesso!');
        return true;
    } catch (error) {
        console.error('Erro ao salvar contagem:', error);
        if (mostrarAlerta) alert('Erro ao salvar contagem: ' + error.message);
        return false;
    } finally {
        setLoadingButton(el.btnSalvar, false, '<i class="fas fa-save"></i> Salvar');
        atualizarCabecalhoContagem();
    }
}

async function finalizarContagem() {
    if (!state.contagemAtual) return;
    if (state.contagemAtual.status === 'FINALIZADA') return alert('Esta contagem ja esta finalizada.');
    if (!confirm('Finalizar esta contagem? Apos finalizar, os campos ficarao bloqueados.')) return;

    setLoadingButton(el.btnFinalizar, true, '<i class="fas fa-spinner fa-spin"></i> Finalizando...');
    try {
        const salvou = await salvarItens(false);
        if (!salvou) return;

        const agora = new Date().toISOString();
        const { error } = await supabaseClient
            .from('contagens_camara_fria')
            .update({ status: 'FINALIZADA', finalizada_em: agora, updated_at: agora })
            .eq('id', state.contagemAtual.id);
        if (error) throw error;

        await recarregarContagemAtual();
        await carregarProdutosEItens();
        await renderContagensRecentes();
        alert('Contagem finalizada com sucesso!');
    } catch (error) {
        console.error('Erro ao finalizar contagem:', error);
        alert('Erro ao finalizar contagem: ' + error.message);
    } finally {
        setLoadingButton(el.btnFinalizar, false, '<i class="fas fa-check"></i> Finalizar');
        atualizarCabecalhoContagem();
    }
}

async function cancelarContagem() {
    if (!state.contagemAtual) return;
    if (state.contagemAtual.status === 'FINALIZADA') {
        alert('Esta contagem ja foi finalizada e nao pode ser cancelada.');
        return;
    }

    const confirmar = confirm(
        'Cancelar esta contagem?\n\n' +
        'Todos os itens ja informados nesta contagem serao removidos.'
    );
    if (!confirmar) return;

    setLoadingButton(el.btnCancelar, true, '<i class="fas fa-spinner fa-spin"></i> Cancelando...');
    try {
        const { error } = await supabaseClient
            .from('contagens_camara_fria')
            .delete()
            .eq('id', state.contagemAtual.id);
        if (error) throw error;

        state.contagemAtual = null;
        state.produtos = [];
        state.itens = new Map();
        el.produtosLista.innerHTML = '<div class="empty-state">Contagem cancelada.</div>';
        voltarInicio();
        await renderContagensRecentes();
        alert('Contagem cancelada com sucesso.');
    } catch (error) {
        console.error('Erro ao cancelar contagem:', error);
        alert('Erro ao cancelar contagem: ' + error.message);
    } finally {
        setLoadingButton(el.btnCancelar, false, '<i class="fas fa-ban"></i> Cancelar');
    }
}

async function recarregarContagemAtual() {
    if (!state.contagemAtual?.id) return;
    const { data, error } = await supabaseClient
        .from('contagens_camara_fria')
        .select('id, filial, semana, fabrica_id, funcionario, status, iniciada_em, finalizada_em, updated_at')
        .eq('id', state.contagemAtual.id)
        .single();
    if (error) throw error;
    state.contagemAtual = data;
}

async function renderContagensRecentes() {
    try {
        let query = supabaseClient
            .from('contagens_camara_fria')
            .select('id, filial, semana, funcionario, status, updated_at, fabrica_id, fabricas_camara_fria(nome)')
            .order('updated_at', { ascending: false })
            .limit(50);

        if (el.filial?.value) query = query.eq('filial', el.filial.value);
        if (el.semana?.value) query = query.eq('semana', el.semana.value);
        if (el.fabrica?.value) query = query.eq('fabrica_id', el.fabrica.value);

        const { data, error } = await query;
        if (error) throw error;

        const contagens = data || [];
        if (contagens.length === 0) {
            el.recentes.innerHTML = '<div class="empty-state">Nenhuma contagem encontrada.</div>';
            return;
        }

        el.recentes.innerHTML = contagens.map(contagem => `
            <article class="card recent-card ${contagem.status === 'FINALIZADA' ? 'finalizada' : 'em-andamento'}" data-id="${contagem.id}">
                <div class="card-header-row">
                    <div>
                        <h4>${escapeHtml(contagem.filial)} | Semana ${escapeHtml(formatSemanaDisplay(contagem.semana))}</h4>
                        <p>${escapeHtml(contagem.fabricas_camara_fria?.nome || '-')}</p>
                        <small>${escapeHtml(contagem.funcionario || '-')} | ${formatDateTime(contagem.updated_at)}</small>
                    </div>
                    <span class="status-pill ${contagem.status === 'FINALIZADA' ? 'finalizada' : ''}">
                        ${contagem.status === 'FINALIZADA' ? 'Finalizada' : 'Em andamento'}
                    </span>
                </div>
            </article>
        `).join('');

        el.recentes.querySelectorAll('.recent-card').forEach(card => {
            card.addEventListener('click', () => abrirContagemPorId(card.dataset.id));
        });
    } catch (error) {
        console.error('Erro ao carregar contagens recentes:', error);
        el.recentes.innerHTML = '<div class="empty-state">Erro ao carregar contagens.</div>';
    }
}

async function abrirContagemPorId(id) {
    try {
        const { data, error } = await supabaseClient
            .from('contagens_camara_fria')
            .select('id, filial, semana, fabrica_id, funcionario, status, iniciada_em, finalizada_em, updated_at')
            .eq('id', id)
            .single();
        if (error) throw error;

        state.contagemAtual = data;
        el.filial.value = data.filial;
        el.semana.value = data.semana;
        el.fabrica.value = data.fabrica_id;
        el.funcionario.value = data.funcionario || el.funcionario.value;
        await carregarProdutosEItens();
        abrirTelaProdutos();
    } catch (error) {
        console.error('Erro ao abrir contagem:', error);
        alert('Erro ao abrir contagem: ' + error.message);
    }
}

async function gerarResumoPDF() {
    if (!state.contagemAtual?.id) return alert('Inicie ou selecione uma contagem para gerar o PDF.');
    if (!window.jspdf?.jsPDF) return alert('Biblioteca jsPDF nao carregada.');

    setLoadingButton(el.btnPDF, true, '<i class="fas fa-spinner fa-spin"></i> PDF');
    try {
        const resumo = await buscarDadosResumo(state.contagemAtual.id);
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const logo = await getLogoBase64PDF();
        if (logo) doc.addImage(logo, 'JPEG', 14, 8, 40, 12);

        const fabrica = resumo.contagem.fabricas_camara_fria?.nome || '-';
        const totais = resumo.itens.reduce((acc, item) => {
            const pesoCaixa = Number(item.produtos_camara_fria?.peso_caixa) || 0;
            const caixas = Number(item.quantidade_caixas) || 0;
            const quantidades = calcularQuantidadesPDF(caixas, item.produtos_camara_fria?.caixas_por_palete);
            acc.paletes += quantidades.paletes;
            acc.caixasAvulsas += quantidades.caixasAvulsas;
            acc.caixas += quantidades.totalCaixas;
            acc.peso += caixas * pesoCaixa;
            if (caixas > 0) acc.itens += 1;
            return acc;
        }, { paletes: 0, caixasAvulsas: 0, caixas: 0, peso: 0, itens: 0 });

        const linhas = resumo.itens.map(item => {
            const produto = item.produtos_camara_fria || {};
            const caixas = Number(item.quantidade_caixas) || 0;
            const quantidades = calcularQuantidadesPDF(caixas, produto.caixas_por_palete);
            return [
                produto.codigo || '-',
                produto.nome || '-',
                produto.tipo || '-',
                String(quantidades.paletes),
                String(quantidades.caixasAvulsas),
                String(quantidades.totalCaixas),
                `${formatPeso(caixas * (Number(produto.peso_caixa) || 0))} KG`,
                item.observacao || ''
            ];
        });

        doc.setFontSize(16);
        doc.setTextColor(0, 105, 55);
        doc.text('RESUMO DA CONTAGEM - CAMARA FRIA', 14, 28);
        doc.setFontSize(10);
        doc.setTextColor(40);
        doc.text(`Filial: ${resumo.contagem.filial} | Semana: ${formatSemanaDisplay(resumo.contagem.semana)} | Fabrica: ${fabrica}`, 14, 35);
        doc.text(`Funcionario: ${resumo.contagem.funcionario || '-'} | Status: ${resumo.contagem.status === 'FINALIZADA' ? 'Finalizada' : 'Em andamento'}`, 14, 41);
        doc.text(`Paletes: ${totais.paletes} | Caixas avulsas: ${totais.caixasAvulsas} | Total caixas: ${totais.caixas} | Peso: ${formatPeso(totais.peso)} KG`, 14, 47);

        doc.autoTable({
            head: [['Codigo', 'Produto', 'Tipo', 'Paletes', 'Caixas', 'Total Caixas', 'Peso Total', 'Observacao']],
            body: linhas.length ? linhas : [['-', 'Nenhum item contado', '-', '0', '0', '0', '0,000 KG', '']],
            startY: 54,
            theme: 'grid',
            headStyles: { fillColor: [0, 105, 55], textColor: [255, 255, 255], fontSize: 8 },
            styles: { fontSize: 8, cellPadding: 2 }
        });

        const nomeArquivo = `Resumo_Contagem_Camara_Fria_${resumo.contagem.filial}_${resumo.contagem.semana}.pdf`.replace(/[^a-z0-9_.-]+/gi, '_');
        doc.save(nomeArquivo);
    } catch (error) {
        console.error('Erro ao gerar PDF:', error);
        alert('Erro ao gerar PDF: ' + error.message);
    } finally {
        setLoadingButton(el.btnPDF, false, '<i class="fas fa-file-pdf"></i> PDF');
    }
}

async function buscarDadosResumo(id) {
    const [contagemResult, itensResult] = await Promise.all([
        supabaseClient
            .from('contagens_camara_fria')
            .select('id, filial, semana, funcionario, status, iniciada_em, finalizada_em, fabricas_camara_fria(nome)')
            .eq('id', id)
            .single(),
        supabaseClient
            .from('contagem_camara_fria_itens')
            .select('quantidade_caixas, observacao, produtos_camara_fria(codigo, nome, tipo, peso_caixa, caixas_por_palete)')
            .eq('contagem_id', id)
            .order('quantidade_caixas', { ascending: false })
    ]);
    if (contagemResult.error) throw contagemResult.error;
    if (itensResult.error) throw itensResult.error;
    return { contagem: contagemResult.data, itens: itensResult.data || [] };
}

function calcularQuantidadesPDF(caixas, caixasPorPalete) {
    const totalCaixas = Number(caixas) || 0;
    const capacidadePalete = Number(caixasPorPalete) || 0;
    if (!totalCaixas || !capacidadePalete) {
        return { paletes: 0, caixasAvulsas: totalCaixas, totalCaixas };
    }
    return {
        paletes: Math.floor(totalCaixas / capacidadePalete),
        caixasAvulsas: totalCaixas % capacidadePalete,
        totalCaixas
    };
}

function getCaixasCard(card) {
    const paletes = getNumeroInteiro(card.querySelector('.input-paletes')?.value);
    const caixasAvulsas = getNumeroInteiro(card.querySelector('.input-caixas')?.value);
    const caixasPorPalete = Number(card.dataset.caixasPorPalete) || 0;
    const total = (paletes * caixasPorPalete) + caixasAvulsas;
    return Number.isFinite(total) && total >= 0 ? total : 0;
}

function getNumeroInteiro(value) {
    const numero = parseInt(value, 10);
    return Number.isFinite(numero) ? numero : 0;
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

function getNomeFabrica(id) {
    return state.fabricas.find(fabrica => String(fabrica.id) === String(id))?.nome || '-';
}

function getUsuarioLogado() {
    try {
        return JSON.parse(localStorage.getItem('usuarioLogado') || 'null');
    } catch {
        return null;
    }
}

function formatDateTime(value) {
    if (!value) return '-';
    return new Date(value).toLocaleString('pt-BR');
}

function formatSemanaDisplay(value) {
    const match = String(value || '').match(/^(\d{4})-W(\d{2})$/);
    return match ? `${match[2]}-${match[1]}` : (value || '-');
}

function formatPeso(value) {
    return Number(value || 0).toLocaleString('pt-BR', {
        minimumFractionDigits: 3,
        maximumFractionDigits: 3
    });
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function setLoadingButton(button, loading, html) {
    if (!button) return;
    button.disabled = loading;
    button.innerHTML = html;
}

function getLogoBase64PDF() {
    return new Promise(resolve => {
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
