import { supabaseClient } from './supabase.js';
import { registrarAuditoria } from './auditoria-utils.js';

document.addEventListener('DOMContentLoaded', () => {
    const ContagemCamaraFriaUI = {
        filialRestrita: '',
        acessoGlobal: true,
        contagemAtual: null,
        produtosCache: [],
        itensCache: new Map(),
        fabricasCache: [],

        init() {
            this.cache();
            this.bind();
            this.aplicarRestricaoFilial();
            this.definirSemanaAtual();
            this.preencherFuncionario();
            this.loadFiliais();
            this.loadFabricas();
            this.renderContagensRecentes();
            this.atualizarEstado();
        },

        cache() {
            this.filialSelect = document.getElementById('contagemFilial');
            this.semanaInput = document.getElementById('contagemSemana');
            this.diaSemanaSelect = document.getElementById('contagemDiaSemana');
            this.fabricaSelect = document.getElementById('contagemFabrica');
            this.funcionarioInput = document.getElementById('contagemFuncionario');
            this.statusBadge = document.getElementById('contagemStatusBadge');
            this.infoText = document.getElementById('contagemInfo');
            this.btnIniciar = document.getElementById('btnIniciarContagem');
            this.btnSalvar = document.getElementById('btnSalvarContagem');
            this.btnFinalizar = document.getElementById('btnFinalizarContagem');
            this.btnReabrir = document.getElementById('btnReabrirContagem');
            this.btnCancelar = document.getElementById('btnCancelarContagem');
            this.btnPDF = document.getElementById('btnResumoContagemPDF');
            this.tableBody = document.getElementById('tableBodyContagemCamara');
            this.modalContagem = document.getElementById('modalContagemProdutos');
            this.modalSubtitulo = document.getElementById('modalContagemSubtitulo');
            this.modalBuscaProduto = document.getElementById('modalBuscaProdutoContagem');
            this.modalBuscaProdutoCount = document.getElementById('modalBuscaProdutoCount');
            this.modalTableBody = document.getElementById('tableBodyModalContagemCamara');
            this.modalKpiCaixas = document.getElementById('modalKpiContagemCaixas');
            this.modalKpiPeso = document.getElementById('modalKpiContagemPeso');
            this.modalKpiItens = document.getElementById('modalKpiContagemItens');
            this.btnCloseModalContagem = document.getElementById('btnCloseModalContagem');
            this.btnModalFechar = document.getElementById('btnModalFecharContagem');
            this.btnModalSalvar = document.getElementById('btnModalSalvarContagem');
            this.btnModalFinalizar = document.getElementById('btnModalFinalizarContagem');
            this.btnModalReabrir = document.getElementById('btnModalReabrirContagem');
            this.recentesBody = document.getElementById('tableBodyContagensRecentes');
            this.recordsCount = document.getElementById('contagemRecordsCount');
            this.recentesCount = document.getElementById('contagensRecentesCount');
            this.kpiCaixas = document.getElementById('kpiContagemCaixas');
            this.kpiPeso = document.getElementById('kpiContagemPeso');
            this.kpiItens = document.getElementById('kpiContagemItens');
        },

        bind() {
            this.btnIniciar.addEventListener('click', () => this.iniciarContagem());
            this.btnSalvar.addEventListener('click', () => this.salvarItens());
            this.btnFinalizar.addEventListener('click', () => this.finalizarContagem());
            this.btnReabrir.addEventListener('click', () => this.reabrirContagem());
            this.btnCancelar.addEventListener('click', () => this.cancelarContagem());
            this.btnPDF.addEventListener('click', () => this.gerarResumoPDF());
            this.btnCloseModalContagem.addEventListener('click', () => this.closeModalContagem());
            this.btnModalFechar.addEventListener('click', () => this.closeModalContagem());
            this.btnModalSalvar.addEventListener('click', () => this.salvarItens());
            this.btnModalFinalizar.addEventListener('click', () => this.finalizarContagem());
            this.btnModalReabrir.addEventListener('click', () => this.reabrirContagem());
            this.modalContagem.addEventListener('click', (event) => {
                if (event.target === this.modalContagem) this.closeModalContagem();
            });
            [this.filialSelect, this.semanaInput, this.diaSemanaSelect, this.fabricaSelect].forEach(el => {
                el.addEventListener('change', () => {
                    this.contagemAtual = null;
                    this.itensCache = new Map();
                    this.closeModalContagem();
                    this.renderTabelaInicial();
                    this.atualizarEstado();
                    this.renderContagensRecentes();
                });
            });
            this.tableBody.addEventListener('input', (event) => {
                if (event.target.matches('.input-paletes-estoque, .input-caixas-estoque')) this.atualizarLinha(event.target.closest('tr'));
            });
            this.modalTableBody.addEventListener('input', (event) => {
                if (event.target.matches('.input-paletes-estoque, .input-caixas-estoque')) {
                    this.atualizarLinha(event.target.closest('tr'));
                    this.sincronizarPreviaComModal();
                }
            });
            this.modalBuscaProduto?.addEventListener('input', () => this.filtrarProdutosModal());
            this.recentesBody.addEventListener('click', this.handleRecentesClick.bind(this));
        },

        aplicarRestricaoFilial() {
            const usuarioLogado = this.getUsuarioLogado();
            const nivel = String(usuarioLogado?.nivel || '').trim().toLowerCase();
            this.acessoGlobal = ['administrador', 'gerencia'].includes(nivel) || !String(usuarioLogado?.filial || '').trim();
            this.filialRestrita = this.acessoGlobal ? '' : String(usuarioLogado.filial).trim();
        },

        preencherFuncionario() {
            const usuario = this.getUsuarioLogado();
            this.funcionarioInput.value = usuario?.nome || usuario?.usuario_login || '';
        },

        definirSemanaAtual() {
            const hoje = new Date();
            const data = new Date(Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()));
            const dia = data.getUTCDay() || 7;
            data.setUTCDate(data.getUTCDate() + 4 - dia);
            const ano = data.getUTCFullYear();
            const inicioAno = new Date(Date.UTC(ano, 0, 1));
            const semana = Math.ceil((((data - inicioAno) / 86400000) + 1) / 7);
            this.semanaInput.value = `${ano}-W${String(semana).padStart(2, '0')}`;
        },

        async loadFiliais() {
            try {
                const { data, error } = await supabaseClient
                    .from('filiais')
                    .select('nome, sigla')
                    .order('nome');
                if (error) throw error;

                this.filialSelect.innerHTML = '<option value="">Selecione</option>'
                    + (data || []).map(f => `<option value="${this.escapeHtml(f.sigla || f.nome)}">${this.escapeHtml(f.sigla ? `${f.nome} (${f.sigla})` : f.nome)}</option>`).join('');

                if (this.filialRestrita) {
                    if (!Array.from(this.filialSelect.options).some(option => option.value === this.filialRestrita)) {
                        this.filialSelect.add(new Option(this.filialRestrita, this.filialRestrita));
                    }
                    this.filialSelect.value = this.filialRestrita;
                    this.filialSelect.disabled = true;
                }
            } catch (error) {
                console.error('Erro ao carregar filiais:', error);
            }
        },

        async loadFabricas() {
            try {
                const { data, error } = await supabaseClient
                    .from('fabricas_camara_fria')
                    .select('id, nome')
                    .eq('ativo', true)
                    .order('nome');
                if (error) throw error;

                this.fabricasCache = data || [];
                this.fabricaSelect.innerHTML = '<option value="">Selecione</option>'
                    + this.fabricasCache.map(f => `<option value="${f.id}">${this.escapeHtml(f.nome)}</option>`).join('');
            } catch (error) {
                console.error('Erro ao carregar fabricas:', error);
                alert('Erro ao carregar fabricas.');
            }
        },

        formularioBaseValido() {
            if (!this.filialSelect.value || !this.semanaInput.value || !this.diaSemanaSelect.value || !this.fabricaSelect.value) {
                alert('Preencha Filial, Semana, Dia da Semana e Fabrica.');
                return false;
            }
            if (!this.funcionarioInput.value.trim()) {
                alert('Nao foi possivel identificar o funcionario logado.');
                return false;
            }
            return true;
        },

        async iniciarContagem() {
            if (!this.formularioBaseValido()) return;

            this.btnIniciar.disabled = true;
            this.btnIniciar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Iniciando...';
            try {
                const existente = await this.buscarContagemAtual();
                if (existente) {
                    this.contagemAtual = existente;
                } else {
                    const payload = {
                        filial: this.filialSelect.value,
                        semana: this.semanaInput.value,
                        dia_semana: this.diaSemanaSelect.value,
                        fabrica_id: this.fabricaSelect.value,
                        funcionario: this.funcionarioInput.value.trim(),
                        status: 'EM_ANDAMENTO',
                        updated_at: new Date().toISOString()
                    };
                    const { data, error } = await supabaseClient
                        .from('contagens_camara_fria')
                        .insert(payload)
                        .select('id, filial, semana, dia_semana, fabrica_id, funcionario, status, iniciada_em, finalizada_em, updated_at')
                        .single();
                    if (error) throw error;
                    this.contagemAtual = data;
                    registrarAuditoria('INCLUIR', 'Câmara Fria', `Início de contagem - Filial: ${payload.filial}, Semana: ${payload.semana}, Dia: ${this.formatDiaSemana(payload.dia_semana)}`);
                }

                await this.carregarItensContagem();
                this.openModalContagem();
                await this.renderContagensRecentes();
            } catch (error) {
                console.error('Erro ao iniciar contagem:', error);
                alert('Erro ao iniciar contagem: ' + error.message);
            } finally {
                this.btnIniciar.disabled = false;
                this.btnIniciar.innerHTML = '<i class="fas fa-play"></i> Iniciar';
                this.atualizarEstado();
            }
        },

        async buscarContagemAtual() {
            const { data, error } = await supabaseClient
                .from('contagens_camara_fria')
                .select('id, filial, semana, dia_semana, fabrica_id, funcionario, status, iniciada_em, finalizada_em, updated_at')
                .eq('filial', this.filialSelect.value)
                .eq('semana', this.semanaInput.value)
                .eq('dia_semana', this.diaSemanaSelect.value)
                .eq('fabrica_id', this.fabricaSelect.value)
                .maybeSingle();
            if (error) throw error;
            return data || null;
        },

        async carregarItensContagem() {
            if (!this.contagemAtual) return;

            this.tableBody.innerHTML = '<tr><td colspan="9" style="text-align:center;">Carregando produtos...</td></tr>';
            const [produtosResult, itensResult] = await Promise.all([
                this.buscarProdutos(),
                supabaseClient
                    .from('contagem_camara_fria_itens')
                    .select('id, produto_id, quantidade_caixas, observacao')
                    .eq('contagem_id', this.contagemAtual.id)
            ]);

            if (produtosResult.error) throw produtosResult.error;
            if (itensResult.error) throw itensResult.error;

            this.produtosCache = produtosResult.data || [];
            this.itensCache = new Map((itensResult.data || []).map(item => [String(item.produto_id), item]));
            this.renderProdutos();
        },

        buscarProdutos() {
            let query = supabaseClient
                .from('produtos_camara_fria')
                .select('id, codigo, nome, tipo, peso_caixa, caixas_por_palete, filial')
                .eq('ativo', true)
                .order('nome');

            if (this.filialSelect.value) query = query.or(`filial.eq.${this.filialSelect.value},filial.is.null`);
            return query;
        },

        renderProdutos() {
            if (this.recordsCount) {
                this.recordsCount.textContent = `${this.produtosCache.length} produto${this.produtosCache.length === 1 ? '' : 's'}`;
            }

            if (this.produtosCache.length === 0) {
                const vazio = '<tr><td colspan="9" style="text-align:center;">Nenhum produto cadastrado para esta filial.</td></tr>';
                this.tableBody.innerHTML = vazio;
                this.modalTableBody.innerHTML = vazio;
                this.atualizarTotais();
                return;
            }

            const bloqueado = this.contagemAtual?.status === 'FINALIZADA' ? 'disabled' : '';
            const linhasHtml = this.produtosCache.map(produto => {
                const item = this.itensCache.get(String(produto.id));
                const caixas = item?.quantidade_caixas ?? '';
                const caixasPorPalete = Number(produto.caixas_por_palete) || 0;
                const quantidades = this.calcularQuantidadesPelasCaixas(caixas, caixasPorPalete);
                const observacao = item?.observacao || '';
                const nomeBusca = this.normalizarTexto(produto.nome);
                return `
                    <tr data-produto-id="${produto.id}" data-item-id="${item?.id || ''}" data-peso-caixa="${produto.peso_caixa || 0}" data-caixas-por-palete="${caixasPorPalete}" data-produto-nome="${this.escapeHtml(nomeBusca)}">
                        <td>${this.escapeHtml(produto.codigo) || '-'}</td>
                        <td>
                            <strong>${this.escapeHtml(produto.nome)}</strong>
                            <div class="produto-meta">${this.escapeHtml(produto.filial || 'TODAS')} | ${caixasPorPalete || '-'} caixas/palete</div>
                        </td>
                        <td>${this.escapeHtml(produto.tipo) || '-'}</td>
                        <td>${produto.peso_caixa != null ? `${this.formatPeso(produto.peso_caixa)} KG` : '-'}</td>
                        <td><input type="number" min="0" step="1" class="input-paletes-estoque" value="${quantidades.paletes}" ${bloqueado}></td>
                        <td><input type="number" min="0" step="1" class="input-caixas-estoque" value="${quantidades.caixasAvulsas}" ${bloqueado}></td>
                        <td class="estoque-qtd-caixas">${caixas || 0}</td>
                        <td class="estoque-peso-total">0,000 KG</td>
                        <td><input type="text" class="input-observacao-estoque" value="${this.escapeHtml(observacao)}" placeholder="Opcional" ${bloqueado}></td>
                    </tr>
                `;
            }).join('');

            this.modalTableBody.innerHTML = linhasHtml;
            this.modalTableBody.querySelectorAll('tr[data-produto-id]').forEach(tr => this.atualizarLinha(tr));
            this.filtrarProdutosModal();
            this.sincronizarPreviaComModal();
            this.atualizarModalInfo();
        },

        renderTabelaInicial() {
            this.tableBody.innerHTML = '<tr><td colspan="9" style="text-align:center;">Selecione os campos e clique em Iniciar.</td></tr>';
            this.modalTableBody.innerHTML = '<tr><td colspan="9" style="text-align:center;">Inicie uma contagem para carregar os produtos.</td></tr>';
            if (this.recordsCount) this.recordsCount.textContent = '';
            if (this.modalBuscaProduto) this.modalBuscaProduto.value = '';
            if (this.modalBuscaProdutoCount) this.modalBuscaProdutoCount.textContent = '';
            this.atualizarTotais();
        },

        filtrarProdutosModal() {
            if (!this.modalTableBody) return;
            const termo = this.normalizarTexto(this.modalBuscaProduto?.value || '');
            const linhas = Array.from(this.modalTableBody.querySelectorAll('tr[data-produto-id]'));
            let visiveis = 0;

            linhas.forEach(tr => {
                const exibir = !termo || String(tr.dataset.produtoNome || '').includes(termo);
                tr.hidden = !exibir;
                if (exibir) visiveis += 1;
            });

            if (this.modalBuscaProdutoCount) {
                this.modalBuscaProdutoCount.textContent = termo
                    ? `${visiveis} de ${linhas.length} produto${linhas.length === 1 ? '' : 's'}`
                    : `${linhas.length} produto${linhas.length === 1 ? '' : 's'}`;
            }
        },

        atualizarLinha(tr) {
            if (!tr) return;
            const caixas = this.getCaixasLinha(tr);
            const pesoCaixa = Number(tr.dataset.pesoCaixa) || 0;
            const pesoTotal = caixas * pesoCaixa;
            const cellCaixas = tr.querySelector('.estoque-qtd-caixas');
            if (cellCaixas) cellCaixas.textContent = String(caixas);
            const cellPeso = tr.querySelector('.estoque-peso-total');
            if (cellPeso) cellPeso.textContent = `${this.formatPeso(pesoTotal)} KG`;
            this.atualizarTotais();
        },

        atualizarTotais() {
            const linhas = this.getLinhasContagem();
            let totalCaixas = 0;
            let totalPeso = 0;
            let itensContados = 0;

            linhas.forEach(tr => {
                const inputPaletes = tr.querySelector('.input-paletes-estoque');
                const inputCaixas = tr.querySelector('.input-caixas-estoque');
                const preenchido = String(inputPaletes?.value || '').trim() !== '' || String(inputCaixas?.value || '').trim() !== '';
                const caixas = this.getCaixasLinha(tr);
                const pesoCaixa = Number(tr.dataset.pesoCaixa) || 0;
                if (preenchido) itensContados++;
                totalCaixas += caixas;
                totalPeso += caixas * pesoCaixa;
            });

            this.kpiCaixas.textContent = String(totalCaixas);
            this.kpiPeso.textContent = `${this.formatPeso(totalPeso)} KG`;
            this.kpiItens.textContent = String(itensContados);
            if (this.modalKpiCaixas) this.modalKpiCaixas.textContent = String(totalCaixas);
            if (this.modalKpiPeso) this.modalKpiPeso.textContent = `${this.formatPeso(totalPeso)} KG`;
            if (this.modalKpiItens) this.modalKpiItens.textContent = String(itensContados);
        },

        getLinhasContagem() {
            const linhasModal = Array.from(this.modalTableBody?.querySelectorAll('tr[data-produto-id]') || []);
            if (linhasModal.length > 0) return linhasModal;
            return Array.from(this.tableBody.querySelectorAll('tr[data-produto-id]'));
        },

        sincronizarPreviaComModal() {
            if (!this.modalTableBody || !this.tableBody) return;
            const linhasModal = this.modalTableBody.querySelectorAll('tr[data-produto-id]');
            if (linhasModal.length === 0) {
                this.tableBody.innerHTML = this.modalTableBody.innerHTML;
                return;
            }

            this.tableBody.innerHTML = this.modalTableBody.innerHTML;
            this.tableBody.querySelectorAll('input').forEach(input => {
                input.disabled = true;
            });
        },

        atualizarModalInfo() {
            if (!this.modalSubtitulo) return;
            const filial = this.filialSelect.value || '-';
            const semana = this.formatSemanaDisplay(this.semanaInput.value);
            const diaSemana = this.formatDiaSemana(this.diaSemanaSelect.value || this.contagemAtual?.dia_semana);
            const fabrica = this.fabricaSelect.options[this.fabricaSelect.selectedIndex]?.text || '-';
            const funcionario = this.funcionarioInput.value || '-';
            this.modalSubtitulo.textContent = `Filial: ${filial} | Semana: ${semana} | Dia: ${diaSemana} | Fabrica: ${fabrica} | Funcionario: ${funcionario}`;
        },

        openModalContagem() {
            if (!this.modalContagem) return;
            this.atualizarModalInfo();
            this.filtrarProdutosModal();
            this.modalContagem.classList.remove('hidden');
            document.body.style.overflow = 'hidden';
        },

        closeModalContagem() {
            if (!this.modalContagem) return;
            this.modalContagem.classList.add('hidden');
            document.body.style.overflow = '';
        },

        getCaixasLinha(tr) {
            const paletes = this.getPaletesLinha(tr);
            const caixasAvulsas = this.getCaixasAvulsasLinha(tr);
            const caixasPorPalete = Number(tr.dataset.caixasPorPalete) || 0;
            const caixas = (paletes * caixasPorPalete) + caixasAvulsas;
            return Number.isFinite(caixas) && caixas >= 0 ? caixas : 0;
        },

        getPaletesLinha(tr) {
            const numero = parseInt(tr.querySelector('.input-paletes-estoque')?.value, 10);
            return Number.isFinite(numero) && numero >= 0 ? numero : 0;
        },

        getCaixasAvulsasLinha(tr) {
            const numero = parseInt(tr.querySelector('.input-caixas-estoque')?.value, 10);
            return Number.isFinite(numero) && numero >= 0 ? numero : 0;
        },

        calcularQuantidadesPelasCaixas(caixas, caixasPorPalete) {
            const totalCaixas = Number(caixas) || 0;
            if (!totalCaixas) return { paletes: '', caixasAvulsas: '' };
            if (!caixasPorPalete) return { paletes: '', caixasAvulsas: String(totalCaixas) };
            const paletes = Math.floor(totalCaixas / caixasPorPalete);
            const caixasAvulsas = totalCaixas % caixasPorPalete;
            return {
                paletes: paletes ? String(paletes) : '',
                caixasAvulsas: caixasAvulsas ? String(caixasAvulsas) : ''
            };
        },

        async salvarItens(mostrarAlerta = true) {
            if (!this.contagemAtual) return alert('Inicie a contagem antes de salvar.');
            if (this.contagemAtual.status === 'FINALIZADA') return alert('Esta contagem ja foi finalizada.');

            const linhas = this.getLinhasContagem();
            const upserts = [];
            const deletarIds = [];

            for (const tr of linhas) {
                const inputPaletes = tr.querySelector('.input-paletes-estoque');
                const inputCaixas = tr.querySelector('.input-caixas-estoque');
                const valorPaletes = String(inputPaletes?.value || '').trim();
                const valorCaixas = String(inputCaixas?.value || '').trim();
                const itemId = tr.dataset.itemId;

                if (!valorPaletes && !valorCaixas) {
                    if (itemId) deletarIds.push(itemId);
                    continue;
                }

                const paletes = this.getPaletesLinha(tr);
                const caixasAvulsas = this.getCaixasAvulsasLinha(tr);
                const caixasPorPalete = Number(tr.dataset.caixasPorPalete) || 0;
                if (!Number.isFinite(paletes) || paletes < 0 || !Number.isFinite(caixasAvulsas) || caixasAvulsas < 0) {
                    alert('Informe quantidades validas.');
                    inputPaletes?.focus();
                    return;
                }
                if (paletes > 0 && caixasPorPalete <= 0) {
                    alert('Para informar paletes, cadastre a quantidade de Caixas/Palete do produto.');
                    inputPaletes?.focus();
                    return;
                }
                const quantidade = this.getCaixasLinha(tr);

                upserts.push({
                    contagem_id: this.contagemAtual.id,
                    produto_id: tr.dataset.produtoId,
                    quantidade_caixas: quantidade,
                    observacao: tr.querySelector('.input-observacao-estoque')?.value.trim() || null,
                    updated_at: new Date().toISOString()
                });
            }

            this.btnSalvar.disabled = true;
            if (this.btnModalSalvar) this.btnModalSalvar.disabled = true;
            this.btnSalvar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
            if (this.btnModalSalvar) this.btnModalSalvar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
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
                    .eq('id', this.contagemAtual.id);
                if (updateError) throw updateError;

                registrarAuditoria('ALTERAR', 'Câmara Fria', `Itens de contagem salvos - Filial: ${this.contagemAtual.filial}, Semana: ${this.contagemAtual.semana}, Dia: ${this.formatDiaSemana(this.contagemAtual.dia_semana)}`);
                await this.recarregarContagemAtual();
                await this.carregarItensContagem();
                await this.renderContagensRecentes();
                if (mostrarAlerta) alert('Contagem salva com sucesso!');
                return true;
            } catch (error) {
                console.error('Erro ao salvar contagem:', error);
                if (!mostrarAlerta) throw error;
                alert('Erro ao salvar contagem: ' + error.message);
                return false;
            } finally {
                this.btnSalvar.disabled = false;
                this.btnSalvar.innerHTML = '<i class="fas fa-save"></i> Salvar';
                if (this.btnModalSalvar) {
                    this.btnModalSalvar.disabled = false;
                    this.btnModalSalvar.innerHTML = '<i class="fas fa-save"></i> Salvar';
                }
                this.atualizarEstado();
            }
        },

        async finalizarContagem() {
            if (!this.contagemAtual) return alert('Inicie a contagem antes de finalizar.');
            if (this.contagemAtual.status === 'FINALIZADA') return alert('Esta contagem ja esta finalizada.');
            if (!confirm('Finalizar esta contagem? Apos finalizar, os campos ficarao bloqueados.')) return;

            try {
                const salvou = await this.salvarItens(false);
                if (!salvou) return;

                const agora = new Date().toISOString();
                const { error } = await supabaseClient
                    .from('contagens_camara_fria')
                    .update({ status: 'FINALIZADA', finalizada_em: agora, updated_at: agora })
                    .eq('id', this.contagemAtual.id);
                if (error) throw error;

                registrarAuditoria('ALTERAR', 'Câmara Fria', `Contagem finalizada - Filial: ${this.contagemAtual.filial}, Semana: ${this.contagemAtual.semana}, Dia: ${this.formatDiaSemana(this.contagemAtual.dia_semana)}`);
                await this.recarregarContagemAtual();
                await this.carregarItensContagem();
                await this.renderContagensRecentes();
                alert('Contagem finalizada com sucesso!');
            } catch (error) {
                console.error('Erro ao finalizar contagem:', error);
                alert('Erro ao finalizar contagem: ' + error.message);
            } finally {
                this.atualizarEstado();
            }
        },

        async reabrirContagem(id = null) {
            const contagemId = id || this.contagemAtual?.id;
            if (!contagemId) return alert('Selecione uma contagem para reabrir.');
            if (!confirm('Reabrir esta contagem? Os campos voltarao a ficar liberados para edicao.')) return;

            this.btnReabrir.disabled = true;
            if (this.btnModalReabrir) this.btnModalReabrir.disabled = true;
            this.btnReabrir.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Reabrindo...';
            try {
                const agora = new Date().toISOString();
                const { error } = await supabaseClient
                    .from('contagens_camara_fria')
                    .update({ status: 'EM_ANDAMENTO', finalizada_em: null, updated_at: agora })
                    .eq('id', contagemId);
                if (error) throw error;

                registrarAuditoria('ALTERAR', 'Câmara Fria', `Contagem reaberta ID ${contagemId}`);
                if (!this.contagemAtual || String(this.contagemAtual.id) !== String(contagemId)) {
                    await this.abrirContagemPorId(contagemId);
                } else {
                    await this.recarregarContagemAtual();
                    await this.carregarItensContagem();
                    this.openModalContagem();
                    this.atualizarEstado();
                }

                await this.renderContagensRecentes();
                alert('Contagem reaberta com sucesso.');
            } catch (error) {
                console.error('Erro ao reabrir contagem:', error);
                alert('Erro ao reabrir contagem: ' + error.message);
            } finally {
                this.btnReabrir.innerHTML = '<i class="fas fa-lock-open"></i> Reabrir';
                this.atualizarEstado();
            }
        },

        async cancelarContagem() {
            if (!this.contagemAtual) return alert('Nenhuma contagem iniciada para cancelar.');
            if (this.contagemAtual.status === 'FINALIZADA') {
                return alert('Esta contagem ja foi finalizada e nao pode ser cancelada.');
            }

            const confirmar = confirm(
                'Cancelar esta contagem?\n\n' +
                'Todos os itens ja informados nesta contagem serao removidos.'
            );
            if (!confirmar) return;

            this.btnCancelar.disabled = true;
            this.btnCancelar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Cancelando...';
            try {
                const filialCancelada = this.contagemAtual.filial;
                const semanaCancelada = this.contagemAtual.semana;
                const { error } = await supabaseClient
                    .from('contagens_camara_fria')
                    .delete()
                    .eq('id', this.contagemAtual.id);
                if (error) throw error;

                registrarAuditoria('EXCLUIR', 'Câmara Fria', `Contagem cancelada - Filial: ${filialCancelada}, Semana: ${semanaCancelada}`);
                this.contagemAtual = null;
                this.itensCache = new Map();
                this.produtosCache = [];
                this.closeModalContagem();
                this.renderTabelaInicial();
                await this.renderContagensRecentes();
                alert('Contagem cancelada com sucesso.');
            } catch (error) {
                console.error('Erro ao cancelar contagem:', error);
                alert('Erro ao cancelar contagem: ' + error.message);
            } finally {
                this.btnCancelar.innerHTML = '<i class="fas fa-ban"></i> Cancelar';
                this.atualizarEstado();
            }
        },

        async recarregarContagemAtual() {
            if (!this.contagemAtual?.id) return;
            const { data, error } = await supabaseClient
                .from('contagens_camara_fria')
                .select('id, filial, semana, dia_semana, fabrica_id, funcionario, status, iniciada_em, finalizada_em, updated_at')
                .eq('id', this.contagemAtual.id)
                .single();
            if (error) throw error;
            this.contagemAtual = data;
        },

        atualizarEstado() {
            const temContagem = Boolean(this.contagemAtual);
            const finalizada = this.contagemAtual?.status === 'FINALIZADA';

            this.btnSalvar.disabled = !temContagem || finalizada;
            this.btnFinalizar.disabled = !temContagem || finalizada;
            this.btnReabrir.disabled = !temContagem || !finalizada;
            this.btnCancelar.disabled = !temContagem || finalizada;
            this.btnPDF.disabled = !temContagem;
            if (this.btnModalSalvar) this.btnModalSalvar.disabled = !temContagem || finalizada;
            if (this.btnModalFinalizar) this.btnModalFinalizar.disabled = !temContagem || finalizada;
            if (this.btnModalReabrir) this.btnModalReabrir.disabled = !temContagem || !finalizada;

            this.statusBadge.className = 'contagem-status-badge';
            if (!temContagem) {
                this.statusBadge.textContent = 'Nenhuma contagem iniciada';
                this.infoText.textContent = '';
                return;
            }

            if (finalizada) {
                this.statusBadge.classList.add('finalizada');
                this.statusBadge.textContent = 'Finalizada';
            } else {
                this.statusBadge.classList.add('em-andamento');
                this.statusBadge.textContent = 'Em andamento';
            }
            this.infoText.textContent = `Dia: ${this.formatDiaSemana(this.contagemAtual.dia_semana)} | Funcionario: ${this.contagemAtual.funcionario || '-'} | Iniciada em: ${this.formatDateTime(this.contagemAtual.iniciada_em)}`;
        },

        async renderContagensRecentes() {
            try {
                let query = supabaseClient
                    .from('contagens_camara_fria')
                    .select('id, filial, semana, dia_semana, funcionario, status, updated_at, fabricas_camara_fria(nome)')
                    .order('updated_at', { ascending: false })
                    .limit(100);

                if (this.filialSelect?.value) query = query.eq('filial', this.filialSelect.value);
                if (this.semanaInput?.value) query = query.eq('semana', this.semanaInput.value);
                if (this.diaSemanaSelect?.value) query = query.eq('dia_semana', this.diaSemanaSelect.value);
                if (this.fabricaSelect?.value) query = query.eq('fabrica_id', this.fabricaSelect.value);

                const { data, error } = await query;
                if (error) throw error;
                const contagens = data || [];
                if (this.recentesCount) this.recentesCount.textContent = `${contagens.length} contagem${contagens.length === 1 ? '' : 's'}`;

                if (contagens.length === 0) {
                    this.recentesBody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Nenhuma contagem encontrada.</td></tr>';
                    return;
                }

                this.recentesBody.innerHTML = contagens.map(contagem => `
                    <tr>
                        <td>${this.escapeHtml(contagem.filial)}</td>
                        <td>${this.escapeHtml(this.formatSemanaDisplay(contagem.semana))}</td>
                        <td>${this.escapeHtml(this.formatDiaSemana(contagem.dia_semana))}</td>
                        <td>${this.escapeHtml(contagem.fabricas_camara_fria?.nome || '-')}</td>
                        <td>${this.escapeHtml(contagem.funcionario || '-')}</td>
                        <td>${contagem.status === 'FINALIZADA' ? 'Finalizada' : 'Em andamento'}</td>
                        <td>${this.formatDateTime(contagem.updated_at)}</td>
                        <td class="actions-cell">
                            <button class="btn-icon edit" data-action="abrir" data-id="${contagem.id}" title="Abrir"><i class="fas fa-folder-open"></i></button>
                            ${contagem.status === 'FINALIZADA' ? `<button class="btn-icon edit" data-action="reabrir" data-id="${contagem.id}" title="Reabrir"><i class="fas fa-lock-open"></i></button>` : ''}
                            <button class="btn-icon" data-action="pdf" data-id="${contagem.id}" title="Gerar PDF"><i class="fas fa-file-pdf"></i></button>
                            <button class="btn-icon delete" data-action="excluir" data-id="${contagem.id}" title="Excluir"><i class="fas fa-trash"></i></button>
                        </td>
                    </tr>
                `).join('');
            } catch (error) {
                console.error('Erro ao carregar contagens recentes:', error);
            }
        },

        async handleRecentesClick(event) {
            const button = event.target.closest('button[data-action]');
            if (!button) return;

            if (button.dataset.action === 'abrir') {
                await this.abrirContagemPorId(button.dataset.id);
            } else if (button.dataset.action === 'reabrir') {
                await this.reabrirContagem(button.dataset.id);
            } else if (button.dataset.action === 'pdf') {
                await this.gerarResumoPDF(button.dataset.id);
            } else if (button.dataset.action === 'excluir') {
                await this.excluirContagemPorId(button.dataset.id);
            }
        },

        async excluirContagemPorId(id) {
            if (!confirm('Excluir esta contagem?\n\nTodos os itens vinculados tambem serao removidos.')) return;

            try {
                const { error } = await supabaseClient
                    .from('contagens_camara_fria')
                    .delete()
                    .eq('id', id);
                if (error) throw error;

                registrarAuditoria('EXCLUIR', 'Câmara Fria', `Exclusão de contagem ID ${id}`);
                if (String(this.contagemAtual?.id || '') === String(id)) {
                    this.contagemAtual = null;
                    this.itensCache = new Map();
                    this.produtosCache = [];
                    this.closeModalContagem();
                    this.renderTabelaInicial();
                    this.atualizarEstado();
                }

                await this.renderContagensRecentes();
                alert('Contagem excluida com sucesso.');
            } catch (error) {
                console.error('Erro ao excluir contagem:', error);
                alert('Erro ao excluir contagem: ' + error.message);
            }
        },

        async abrirContagemPorId(id) {
            try {
                const { data, error } = await supabaseClient
                    .from('contagens_camara_fria')
                    .select('id, filial, semana, dia_semana, fabrica_id, funcionario, status, iniciada_em, finalizada_em, updated_at')
                    .eq('id', id)
                    .single();
                if (error) throw error;

                this.contagemAtual = data;
                this.filialSelect.value = data.filial;
                this.semanaInput.value = data.semana;
                this.diaSemanaSelect.value = data.dia_semana || '';
                this.fabricaSelect.value = data.fabrica_id;
                this.funcionarioInput.value = data.funcionario || this.funcionarioInput.value;
                await this.carregarItensContagem();
                this.openModalContagem();
                this.atualizarEstado();
            } catch (error) {
                console.error('Erro ao abrir contagem:', error);
                alert('Erro ao abrir contagem: ' + error.message);
            }
        },

        async gerarResumoPDF(contagemId = null) {
            const id = contagemId || this.contagemAtual?.id;
            if (!id) return alert('Inicie ou selecione uma contagem para gerar o PDF.');
            if (!window.jspdf?.jsPDF) return alert('Biblioteca jsPDF nao carregada.');

            const btn = contagemId ? null : this.btnPDF;
            const original = btn?.innerHTML;
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gerando...';
            }

            try {
                const resumo = await this.buscarDadosResumo(id);
                if (!resumo.contagem) throw new Error('Contagem nao encontrada.');

                const { jsPDF } = window.jspdf;
                const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
                const logo = await this.getLogoBase64PDF();
                if (logo) doc.addImage(logo, 'JPEG', 14, 8, 40, 12);

                const fabrica = resumo.contagem.fabricas_camara_fria?.nome || '-';
                const linhas = resumo.itens.map(item => {
                    const produto = item.produtos_camara_fria || {};
                    const caixas = Number(item.quantidade_caixas) || 0;
                    const quantidades = this.calcularQuantidadesPDF(caixas, produto.caixas_por_palete);
                    const pesoTotal = caixas * (Number(produto.peso_caixa) || 0);
                    return [
                        produto.codigo || '-',
                        produto.nome || '-',
                        produto.tipo || '-',
                        String(quantidades.paletes),
                        String(quantidades.caixasAvulsas),
                        String(quantidades.totalCaixas),
                        `${this.formatPeso(pesoTotal)} KG`,
                        item.observacao || ''
                    ];
                });
                const totais = resumo.itens.reduce((acc, item) => {
                    const pesoCaixa = Number(item.produtos_camara_fria?.peso_caixa) || 0;
                    const caixas = Number(item.quantidade_caixas) || 0;
                    const quantidades = this.calcularQuantidadesPDF(caixas, item.produtos_camara_fria?.caixas_por_palete);
                    acc.paletes += quantidades.paletes;
                    acc.caixasAvulsas += quantidades.caixasAvulsas;
                    acc.caixas += quantidades.totalCaixas;
                    acc.peso += caixas * pesoCaixa;
                    if (caixas > 0) acc.itens += 1;
                    return acc;
                }, { paletes: 0, caixasAvulsas: 0, caixas: 0, peso: 0, itens: 0 });

                doc.setFontSize(16);
                doc.setTextColor(0, 105, 55);
                doc.text('RESUMO DA CONTAGEM - CAMARA FRIA', 14, 28);
                doc.setFontSize(10);
                doc.setTextColor(40);
                doc.text(`Filial: ${resumo.contagem.filial} | Semana: ${this.formatSemanaDisplay(resumo.contagem.semana)} | Dia: ${this.formatDiaSemana(resumo.contagem.dia_semana)} | Fabrica: ${fabrica}`, 14, 35);
                doc.text(`Funcionario: ${resumo.contagem.funcionario || '-'} | Status: ${resumo.contagem.status === 'FINALIZADA' ? 'Finalizada' : 'Em andamento'}`, 14, 41);
                doc.text(`Paletes: ${totais.paletes} | Caixas avulsas: ${totais.caixasAvulsas} | Total caixas: ${totais.caixas} | Peso: ${this.formatPeso(totais.peso)} KG`, 14, 47);

                doc.autoTable({
                    head: [['Codigo', 'Produto', 'Tipo', 'Paletes', 'Caixas', 'Total Caixas', 'Peso Total', 'Observacao']],
                    body: linhas.length ? linhas : [['-', 'Nenhum item contado', '-', '0', '0', '0', '0,000 KG', '']],
                    startY: 54,
                    theme: 'grid',
                    headStyles: { fillColor: [0, 105, 55], textColor: [255, 255, 255], fontSize: 8 },
                    styles: { fontSize: 8, cellPadding: 2 },
                    columnStyles: {
                        0: { cellWidth: 18 },
                        1: { cellWidth: 42 },
                        2: { cellWidth: 22 },
                        3: { halign: 'right', cellWidth: 16 },
                        4: { halign: 'right', cellWidth: 16 },
                        5: { halign: 'right', cellWidth: 21 },
                        6: { halign: 'right', cellWidth: 24 },
                        7: { cellWidth: 31 }
                    },
                    didParseCell: data => {
                        if (data.section === 'body' && data.row.index % 2 === 1) {
                            data.cell.styles.fillColor = [237, 247, 231];
                        }
                    }
                });

                const pageCount = doc.internal.getNumberOfPages();
                const pageWidth = doc.internal.pageSize.getWidth();
                for (let page = 1; page <= pageCount; page += 1) {
                    doc.setPage(page);
                    const pageHeight = doc.internal.pageSize.getHeight();
                    doc.setFontSize(8);
                    doc.setTextColor(100);
                    doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, pageHeight - 10);
                    doc.text(`Pagina ${page} de ${pageCount}`, pageWidth - 14, pageHeight - 10, { align: 'right' });
                }

                const nomeArquivo = `Resumo_Contagem_Camara_Fria_${resumo.contagem.filial}_${resumo.contagem.semana}_${resumo.contagem.dia_semana || 'DIA'}.pdf`.replace(/[^a-z0-9_.-]+/gi, '_');
                doc.save(nomeArquivo);
            } catch (error) {
                console.error('Erro ao gerar resumo PDF:', error);
                alert('Erro ao gerar PDF: ' + error.message);
            } finally {
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = original;
                }
            }
        },

        async buscarDadosResumo(id) {
            const [contagemResult, itensResult] = await Promise.all([
                supabaseClient
                    .from('contagens_camara_fria')
                    .select('id, filial, semana, dia_semana, funcionario, status, iniciada_em, finalizada_em, fabricas_camara_fria(nome)')
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
        },

        calcularQuantidadesPDF(caixas, caixasPorPalete) {
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
        },

        getLogoBase64PDF() {
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
        },

        getUsuarioLogado() {
            try {
                return JSON.parse(localStorage.getItem('usuarioLogado') || 'null');
            } catch {
                return null;
            }
        },

        formatDateTime(value) {
            if (!value) return '-';
            return new Date(value).toLocaleString('pt-BR');
        },

        formatSemanaDisplay(value) {
            const match = String(value || '').match(/^(\d{4})-W(\d{2})$/);
            return match ? `${match[2]}-${match[1]}` : (value || '-');
        },

        normalizarTexto(value) {
            return String(value || '')
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .toLowerCase()
                .trim();
        },

        formatDiaSemana(value) {
            const labels = {
                SEGUNDA: 'SEGUNDA',
                TERCA: 'TERÇA',
                QUARTA: 'QUARTA',
                QUINTA: 'QUINTA',
                SEXTA: 'SEXTA',
                SABADO: 'SÁBADO',
                DOMINGO: 'DOMINGO'
            };
            return labels[String(value || '').trim().toUpperCase()] || '-';
        },

        escapeHtml(value) {
            return String(value ?? '')
                .replace(/&/g, '&amp;')
                .replace(/"/g, '&quot;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
        },

        formatPeso(value) {
            return Number(value || 0).toLocaleString('pt-BR', {
                minimumFractionDigits: 3,
                maximumFractionDigits: 3
            });
        }
    };

    ContagemCamaraFriaUI.init();
});
