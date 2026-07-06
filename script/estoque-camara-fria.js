import { supabaseClient } from './supabase.js';

document.addEventListener('DOMContentLoaded', () => {
    const EstoqueCamaraFriaUI = {
        filialRestrita: '',
        acessoGlobal: true,
        produtosCache: [],
        estoqueCache: new Map(),
        fabricasCache: [],

        init() {
            this.cache();
            this.bind();
            this.aplicarRestricaoFilial();
            this.definirSemanaAtual();
            this.loadFiliais();
            this.loadFabricas();
            this.renderHistorico();
        },

        cache() {
            this.filialSelect = document.getElementById('estoqueFilial');
            this.semanaInput = document.getElementById('estoqueSemana');
            this.fabricaSelect = document.getElementById('estoqueFabrica');
            this.btnCarregar = document.getElementById('btnCarregarEstoque');
            this.btnSalvar = document.getElementById('btnSalvarEstoque');
            this.btnLimpar = document.getElementById('btnLimparLancamento');
            this.btnAbrirCadastroFabrica = document.getElementById('btnAbrirCadastroFabrica');
            this.tableBody = document.getElementById('tableBodyEstoqueCamara');
            this.historicoBody = document.getElementById('tableBodyHistoricoEstoqueCamara');
            this.recordsCount = document.getElementById('estoqueRecordsCount');
            this.historicoCount = document.getElementById('historicoRecordsCount');
            this.kpiTotalCaixas = document.getElementById('kpiTotalCaixas');
            this.kpiPesoTotal = document.getElementById('kpiPesoTotal');
            this.kpiProdutosRegistrados = document.getElementById('kpiProdutosRegistrados');

            this.modalFabrica = document.getElementById('modalCadastroFabrica');
            this.formFabrica = document.getElementById('formCadastroFabrica');
            this.fabricaEditingId = document.getElementById('fabricaEditingId');
            this.fabricaFilial = document.getElementById('fabricaFilial');
            this.fabricaNome = document.getElementById('fabricaNome');
            this.btnCloseCadastroFabrica = document.getElementById('btnCloseCadastroFabrica');
            this.btnCancelarCadastroFabrica = document.getElementById('btnCancelarCadastroFabrica');
            this.btnSalvarCadastroFabrica = document.getElementById('btnSalvarCadastroFabrica');
            this.tbodyFabricas = document.getElementById('tbodyFabricasCadastradas');
        },

        bind() {
            this.btnCarregar.addEventListener('click', () => this.carregarLancamento());
            this.btnSalvar.addEventListener('click', () => this.salvarEstoque());
            this.btnLimpar.addEventListener('click', () => this.limparLancamento());
            this.filialSelect.addEventListener('change', async () => {
                this.fabricaSelect.value = '';
                if (this.fabricaFilial) this.fabricaFilial.value = this.filialSelect.value;
                await this.loadFabricas();
                this.renderHistorico();
                if (this.formularioBaseValido(false)) this.carregarLancamento();
            });
            [this.semanaInput, this.fabricaSelect].forEach(el => {
                el.addEventListener('change', () => {
                    this.renderHistorico();
                    if (this.formularioBaseValido(false)) this.carregarLancamento();
                });
            });
            this.tableBody.addEventListener('input', (e) => {
                if (e.target.matches('.input-caixas-estoque')) this.atualizarLinha(e.target.closest('tr'));
            });
            this.historicoBody.addEventListener('click', this.handleHistoricoClick.bind(this));

            this.btnAbrirCadastroFabrica.addEventListener('click', () => this.openCadastroFabrica());
            this.btnCloseCadastroFabrica.addEventListener('click', () => this.closeCadastroFabrica());
            this.btnCancelarCadastroFabrica.addEventListener('click', () => this.closeCadastroFabrica());
            this.modalFabrica.addEventListener('click', (e) => {
                if (e.target === this.modalFabrica) this.closeCadastroFabrica();
            });
            this.formFabrica.addEventListener('submit', this.handleFabricaSubmit.bind(this));
            this.tbodyFabricas.addEventListener('click', this.handleFabricasGridClick.bind(this));
        },

        aplicarRestricaoFilial() {
            const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado') || 'null');
            const nivel = String(usuarioLogado?.nivel || '').trim().toLowerCase();
            this.acessoGlobal = ['administrador', 'gerencia'].includes(nivel) || !String(usuarioLogado?.filial || '').trim();
            this.filialRestrita = this.acessoGlobal ? '' : String(usuarioLogado.filial).trim();
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
                if (this.fabricaFilial) {
                    this.fabricaFilial.innerHTML = '<option value="">Selecione</option>'
                        + (data || []).map(f => `<option value="${this.escapeHtml(f.sigla || f.nome)}">${this.escapeHtml(f.sigla ? `${f.nome} (${f.sigla})` : f.nome)}</option>`).join('');
                }

                if (this.filialRestrita) {
                    if (!Array.from(this.filialSelect.options).some(o => o.value === this.filialRestrita)) {
                        this.filialSelect.add(new Option(this.filialRestrita, this.filialRestrita));
                    }
                    this.filialSelect.value = this.filialRestrita;
                    this.filialSelect.disabled = true;
                    if (this.fabricaFilial) {
                        this.fabricaFilial.value = this.filialRestrita;
                        this.fabricaFilial.disabled = true;
                    }
                }

                await this.loadFabricas();
                if (this.formularioBaseValido(false)) this.carregarLancamento();
            } catch (error) {
                console.error('Erro ao carregar filiais:', error);
            }
        },

        async loadFabricas() {
            try {
                let query = supabaseClient
                    .from('fabricas_camara_fria')
                    .select('id, filial, nome, ativo')
                    .eq('ativo', true)
                    .order('nome');
                if (this.filialSelect.value) query = query.eq('filial', this.filialSelect.value);

                const { data, error } = await query;
                if (error) throw error;

                this.fabricasCache = data || [];
                const valorAtual = this.fabricaSelect.value;
                this.fabricaSelect.innerHTML = '<option value="">Selecione</option>'
                    + this.fabricasCache.map(f => `<option value="${f.id}">${this.escapeHtml(f.nome)}</option>`).join('');
                if (valorAtual && this.fabricasCache.some(f => String(f.id) === String(valorAtual))) {
                    this.fabricaSelect.value = valorAtual;
                }

                this.renderFabricasGrid();
            } catch (error) {
                console.error('Erro ao carregar fabricas:', error);
                alert('Erro ao carregar fabricas.');
            }
        },

        formularioBaseValido(mostrarAlerta = true) {
            if (!this.filialSelect.value || !this.semanaInput.value || !this.fabricaSelect.value) {
                if (mostrarAlerta) alert('Preencha Filial, Semana e Fabrica.');
                return false;
            }
            return true;
        },

        async carregarLancamento() {
            if (!this.formularioBaseValido()) return;
            this.tableBody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Carregando...</td></tr>';

            try {
                const filial = this.filialSelect.value;
                const [produtosResult, estoqueResult] = await Promise.all([
                    this.buscarProdutos(filial),
                    this.buscarEstoqueSemana()
                ]);

                if (produtosResult.error) throw produtosResult.error;
                if (estoqueResult.error) throw estoqueResult.error;

                this.produtosCache = produtosResult.data || [];
                this.estoqueCache = new Map((estoqueResult.data || []).map(item => [String(item.produto_id), item]));
                this.renderProdutos();
                this.renderHistorico();
            } catch (error) {
                console.error('Erro ao carregar estoque semanal:', error);
                this.tableBody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#dc3545;">Erro ao carregar estoque.</td></tr>';
            }
        },

        buscarProdutos(filial) {
            let query = supabaseClient
                .from('produtos_camara_fria')
                .select('id, codigo, nome, tipo, peso_caixa, caixas_por_palete, filial')
                .eq('ativo', true)
                .order('nome');

            if (filial) query = query.or(`filial.eq.${filial},filial.is.null`);
            return query;
        },

        buscarEstoqueSemana() {
            return supabaseClient
                .from('estoque_camara_fria')
                .select('id, produto_id, quantidade_caixas, observacao')
                .eq('filial', this.filialSelect.value)
                .eq('semana', this.semanaInput.value)
                .eq('fabrica_id', this.fabricaSelect.value);
        },

        renderProdutos() {
            if (this.recordsCount) {
                this.recordsCount.textContent = `${this.produtosCache.length} produto${this.produtosCache.length === 1 ? '' : 's'}`;
            }

            if (this.produtosCache.length === 0) {
                this.tableBody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Nenhum produto cadastrado para esta filial.</td></tr>';
                this.atualizarTotais();
                return;
            }

            this.tableBody.innerHTML = this.produtosCache.map(produto => {
                const estoque = this.estoqueCache.get(String(produto.id));
                const caixas = estoque?.quantidade_caixas ?? '';
                const observacao = estoque?.observacao || '';
                return `
                    <tr data-produto-id="${produto.id}" data-estoque-id="${estoque?.id || ''}" data-peso-caixa="${produto.peso_caixa || 0}">
                        <td>${this.escapeHtml(produto.codigo) || '-'}</td>
                        <td>
                            <strong>${this.escapeHtml(produto.nome)}</strong>
                            <div class="produto-meta">${this.escapeHtml(produto.filial || 'TODAS')}</div>
                        </td>
                        <td>${this.escapeHtml(produto.tipo) || '-'}</td>
                        <td>${produto.peso_caixa != null ? `${this.formatPeso(produto.peso_caixa)} KG` : '-'}</td>
                        <td>${produto.caixas_por_palete || '-'}</td>
                        <td><input type="number" min="0" step="1" class="input-caixas-estoque" value="${caixas}"></td>
                        <td class="estoque-peso-total">0,000 KG</td>
                        <td><input type="text" class="input-observacao-estoque" value="${this.escapeHtml(observacao)}" placeholder="Opcional"></td>
                    </tr>
                `;
            }).join('');

            this.tableBody.querySelectorAll('tr[data-produto-id]').forEach(tr => this.atualizarLinha(tr));
        },

        atualizarLinha(tr) {
            if (!tr) return;
            const caixas = this.getCaixasLinha(tr);
            const pesoCaixa = Number(tr.dataset.pesoCaixa) || 0;
            const pesoTotal = caixas * pesoCaixa;
            const cellPeso = tr.querySelector('.estoque-peso-total');
            if (cellPeso) cellPeso.textContent = `${this.formatPeso(pesoTotal)} KG`;
            this.atualizarTotais();
        },

        atualizarTotais() {
            const linhas = Array.from(this.tableBody.querySelectorAll('tr[data-produto-id]'));
            let totalCaixas = 0;
            let totalPeso = 0;
            let produtosRegistrados = 0;

            linhas.forEach(tr => {
                const caixasInput = tr.querySelector('.input-caixas-estoque');
                const preenchido = String(caixasInput?.value || '').trim() !== '';
                const caixas = this.getCaixasLinha(tr);
                const pesoCaixa = Number(tr.dataset.pesoCaixa) || 0;

                if (preenchido) produtosRegistrados++;
                totalCaixas += caixas;
                totalPeso += caixas * pesoCaixa;
            });

            this.kpiTotalCaixas.textContent = String(totalCaixas);
            this.kpiPesoTotal.textContent = `${this.formatPeso(totalPeso)} KG`;
            this.kpiProdutosRegistrados.textContent = String(produtosRegistrados);
        },

        getCaixasLinha(tr) {
            const value = tr.querySelector('.input-caixas-estoque')?.value;
            const numero = parseInt(value, 10);
            return Number.isFinite(numero) && numero >= 0 ? numero : 0;
        },

        async salvarEstoque() {
            if (!this.formularioBaseValido()) return;

            const usuario = JSON.parse(localStorage.getItem('usuarioLogado') || 'null');
            const linhas = Array.from(this.tableBody.querySelectorAll('tr[data-produto-id]'));
            if (linhas.length === 0) return alert('Carregue os produtos antes de salvar.');

            const upserts = [];
            const deletarIds = [];

            for (const tr of linhas) {
                const caixasInput = tr.querySelector('.input-caixas-estoque');
                const observacaoInput = tr.querySelector('.input-observacao-estoque');
                const valorTexto = String(caixasInput?.value || '').trim();
                const estoqueId = tr.dataset.estoqueId;

                if (!valorTexto) {
                    if (estoqueId) deletarIds.push(estoqueId);
                    continue;
                }

                const quantidade = parseInt(valorTexto, 10);
                if (!Number.isFinite(quantidade) || quantidade < 0) {
                    alert('Informe apenas quantidades validas de caixas.');
                    caixasInput.focus();
                    return;
                }

                upserts.push({
                    filial: this.filialSelect.value,
                    semana: this.semanaInput.value,
                    fabrica_id: this.fabricaSelect.value,
                    produto_id: tr.dataset.produtoId,
                    quantidade_caixas: quantidade,
                    observacao: observacaoInput.value.trim() || null,
                    usuario: usuario?.nome || 'Sistema',
                    updated_at: new Date().toISOString()
                });
            }

            if (upserts.length === 0 && deletarIds.length === 0) {
                return alert('Informe a quantidade de caixas de pelo menos um produto.');
            }

            this.btnSalvar.disabled = true;
            this.btnSalvar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
            try {
                if (upserts.length > 0) {
                    const { error } = await supabaseClient
                        .from('estoque_camara_fria')
                        .upsert(upserts, { onConflict: 'filial,semana,fabrica_id,produto_id' });
                    if (error) throw error;
                }

                if (deletarIds.length > 0) {
                    const { error } = await supabaseClient
                        .from('estoque_camara_fria')
                        .delete()
                        .in('id', deletarIds);
                    if (error) throw error;
                }

                alert('Estoque semanal salvo com sucesso!');
                await this.carregarLancamento();
            } catch (error) {
                console.error('Erro ao salvar estoque:', error);
                alert('Erro ao salvar estoque: ' + error.message);
            } finally {
                this.btnSalvar.disabled = false;
                this.btnSalvar.innerHTML = '<i class="fas fa-save"></i> Salvar';
            }
        },

        limparLancamento() {
            this.tableBody.querySelectorAll('tr[data-produto-id]').forEach(tr => {
                tr.querySelector('.input-caixas-estoque').value = '';
                tr.querySelector('.input-observacao-estoque').value = '';
                this.atualizarLinha(tr);
            });
        },

        async renderHistorico() {
            try {
                let query = supabaseClient
                    .from('estoque_camara_fria')
                    .select('id, filial, semana, quantidade_caixas, usuario, updated_at, produtos_camara_fria(codigo, nome, peso_caixa), fabricas_camara_fria(nome)')
                    .order('semana', { ascending: false })
                    .order('updated_at', { ascending: false })
                    .limit(300);

                if (this.filialSelect?.value) query = query.eq('filial', this.filialSelect.value);
                if (this.semanaInput?.value) query = query.eq('semana', this.semanaInput.value);
                if (this.fabricaSelect?.value) query = query.eq('fabrica_id', this.fabricaSelect.value);

                const { data, error } = await query;
                if (error) throw error;

                const registros = data || [];
                if (this.historicoCount) this.historicoCount.textContent = `${registros.length} registro${registros.length === 1 ? '' : 's'}`;

                if (registros.length === 0) {
                    this.historicoBody.innerHTML = '<tr><td colspan="9" style="text-align:center;">Nenhum registro encontrado.</td></tr>';
                    return;
                }

                this.historicoBody.innerHTML = registros.map(item => {
                    const produto = item.produtos_camara_fria || {};
                    const pesoTotal = (Number(item.quantidade_caixas) || 0) * (Number(produto.peso_caixa) || 0);
                    return `
                        <tr>
                            <td>${this.escapeHtml(item.filial)}</td>
                            <td>${this.escapeHtml(item.semana)}</td>
                            <td>${this.escapeHtml(item.fabricas_camara_fria?.nome || '-')}</td>
                            <td>${this.escapeHtml(produto.codigo || '-')}</td>
                            <td>${this.escapeHtml(produto.nome || '-')}</td>
                            <td>${item.quantidade_caixas}</td>
                            <td>${this.formatPeso(pesoTotal)} KG</td>
                            <td>${this.escapeHtml(item.usuario || '-')}</td>
                            <td class="actions-cell">
                                <button class="btn-icon delete" data-id="${item.id}" title="Excluir"><i class="fas fa-trash"></i></button>
                            </td>
                        </tr>
                    `;
                }).join('');
            } catch (error) {
                console.error('Erro ao carregar historico:', error);
                this.historicoBody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#dc3545;">Erro ao carregar historico.</td></tr>';
            }
        },

        async handleHistoricoClick(e) {
            const btn = e.target.closest('button.delete');
            if (!btn) return;
            if (!confirm('Excluir este registro de estoque?')) return;

            try {
                const { error } = await supabaseClient
                    .from('estoque_camara_fria')
                    .delete()
                    .eq('id', btn.dataset.id);
                if (error) throw error;
                await this.carregarLancamento();
            } catch (error) {
                console.error('Erro ao excluir registro:', error);
                alert('Erro ao excluir registro: ' + error.message);
            }
        },

        openCadastroFabrica() {
            if (!this.filialSelect.value && !this.filialRestrita) {
                alert('Selecione a filial antes de cadastrar uma fabrica.');
                this.filialSelect.focus();
                return;
            }
            if (this.fabricaFilial) this.fabricaFilial.value = this.filialSelect.value || this.filialRestrita;
            this.modalFabrica.classList.remove('hidden');
            this.fabricaNome.focus();
        },

        closeCadastroFabrica() {
            this.modalFabrica.classList.add('hidden');
            this.clearFabricaForm();
        },

        clearFabricaForm() {
            this.formFabrica.reset();
            this.fabricaEditingId.value = '';
            if (this.fabricaFilial) this.fabricaFilial.value = this.filialSelect.value || this.filialRestrita || '';
            this.btnSalvarCadastroFabrica.innerHTML = '<i class="fas fa-save"></i> Salvar Fabrica';
        },

        async handleFabricaSubmit(e) {
            e.preventDefault();
            if (!this.fabricaFilial.value) {
                alert('Selecione a filial da fabrica.');
                this.fabricaFilial.focus();
                return;
            }
            const payload = {
                filial: this.fabricaFilial.value,
                nome: this.fabricaNome.value.trim(),
                ativo: true,
                updated_at: new Date().toISOString()
            };
            if (this.fabricaEditingId.value) payload.id = this.fabricaEditingId.value;

            try {
                const { error } = await supabaseClient.from('fabricas_camara_fria').upsert(payload);
                if (error) throw error;
                this.clearFabricaForm();
                await this.loadFabricas();
            } catch (error) {
                console.error('Erro ao salvar fabrica:', error);
                alert('Erro ao salvar fabrica: ' + error.message);
            }
        },

        renderFabricasGrid() {
            this.tbodyFabricas.innerHTML = this.fabricasCache.length
                ? this.fabricasCache.map(fabrica => `
                    <tr>
                        <td>${this.escapeHtml(fabrica.filial || '-')}</td>
                        <td>${this.escapeHtml(fabrica.nome)}</td>
                        <td class="actions-cell">
                            <button class="btn-icon edit" data-id="${fabrica.id}" title="Editar"><i class="fas fa-pen"></i></button>
                            <button class="btn-icon delete" data-id="${fabrica.id}" title="Excluir"><i class="fas fa-trash"></i></button>
                        </td>
                    </tr>
                `).join('')
                : '<tr><td colspan="3" style="text-align:center;">Nenhuma fabrica cadastrada para esta filial.</td></tr>';
        },

        handleFabricasGridClick(e) {
            const button = e.target.closest('button');
            if (!button) return;
            const fabrica = this.fabricasCache.find(item => String(item.id) === String(button.dataset.id));
            if (!fabrica) return;

            if (button.classList.contains('edit')) {
                this.fabricaEditingId.value = fabrica.id;
                if (this.fabricaFilial) this.fabricaFilial.value = fabrica.filial || this.filialSelect.value || '';
                this.fabricaNome.value = fabrica.nome;
                this.btnSalvarCadastroFabrica.innerHTML = '<i class="fas fa-save"></i> Atualizar Fabrica';
            } else if (button.classList.contains('delete')) {
                this.deleteFabrica(fabrica);
            }
        },

        async deleteFabrica(fabrica) {
            if (!confirm(`Excluir a fabrica "${fabrica.nome}"?`)) return;

            try {
                const { data: emUso, error: consultaError } = await supabaseClient
                    .from('estoque_camara_fria')
                    .select('id')
                    .eq('fabrica_id', fabrica.id)
                    .limit(1);
                if (consultaError) throw consultaError;
                if (emUso && emUso.length > 0) {
                    alert('Esta fabrica possui registros de estoque e nao pode ser excluida.');
                    return;
                }

                const { error } = await supabaseClient
                    .from('fabricas_camara_fria')
                    .delete()
                    .eq('id', fabrica.id);
                if (error) throw error;

                await this.loadFabricas();
            } catch (error) {
                console.error('Erro ao excluir fabrica:', error);
                alert('Erro ao excluir fabrica: ' + error.message);
            }
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

    EstoqueCamaraFriaUI.init();
});
