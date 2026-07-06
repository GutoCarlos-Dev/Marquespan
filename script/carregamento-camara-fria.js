import { supabaseClient } from './supabase.js';
import { registrarAuditoria } from './auditoria-utils.js';

document.addEventListener('DOMContentLoaded', () => {
    const CarregamentoCamaraFriaUI = {
        filialRestrita: '',
        acessoGlobal: true,
        produtosCache: [],
        estoqueContagemCache: new Map(),
        contagemReferencia: null,
        carregamentoAtual: null,

        init() {
            this.cache();
            this.bind();
            this.aplicarRestricaoFilial();
            this.preencherUsuario();
            this.definirDataAtual();
            this.loadFiliais();
            this.loadFabricas();
            this.renderCarregamentosRecentes();
            this.atualizarEstado(false);
        },

        cache() {
            this.filialSelect = document.getElementById('carregamentoFilial');
            this.fabricaSelect = document.getElementById('carregamentoFabrica');
            this.dataInput = document.getElementById('carregamentoData');
            this.usuarioInput = document.getElementById('carregamentoUsuario');
            this.contagemBadge = document.getElementById('carregamentoContagemBadge');
            this.contagemInfo = document.getElementById('carregamentoContagemInfo');
            this.btnCarregar = document.getElementById('btnCarregarProdutosCarregamento');
            this.btnSalvar = document.getElementById('btnSalvarCarregamento');
            this.btnLimpar = document.getElementById('btnLimparCarregamento');
            this.tableBody = document.getElementById('tableBodyCarregamentoCamara');
            this.recordsCount = document.getElementById('carregamentoRecordsCount');
            this.recentesBody = document.getElementById('tableBodyCarregamentosRecentes');
            this.recentesCount = document.getElementById('carregamentosRecentesCount');
            this.kpiNecessario = document.getElementById('kpiCarregamentoNecessario');
            this.kpiEstoque = document.getElementById('kpiCarregamentoEstoque');
            this.kpiFaltam = document.getElementById('kpiCarregamentoFaltam');
            this.kpiSobrando = document.getElementById('kpiCarregamentoSobrando');
        },

        bind() {
            this.btnCarregar.addEventListener('click', () => this.carregarProdutos());
            this.btnSalvar.addEventListener('click', () => this.salvarCarregamento());
            this.btnLimpar.addEventListener('click', () => this.limparLancamento());
            [this.filialSelect, this.fabricaSelect].forEach(el => {
                el.addEventListener('change', () => {
                    this.resetLancamento();
                    this.renderCarregamentosRecentes();
                });
            });
            this.tableBody.addEventListener('input', event => {
                if (event.target.matches('.input-paletes-estoque, .input-caixas-estoque')) {
                    this.atualizarLinha(event.target.closest('tr'));
                }
            });
            this.recentesBody.addEventListener('click', event => this.handleRecentesClick(event));
        },

        aplicarRestricaoFilial() {
            const usuario = this.getUsuarioLogado();
            const nivel = String(usuario?.nivel || '').trim().toLowerCase();
            this.acessoGlobal = ['administrador', 'gerencia'].includes(nivel) || !String(usuario?.filial || '').trim();
            this.filialRestrita = this.acessoGlobal ? '' : String(usuario.filial).trim();
        },

        preencherUsuario() {
            const usuario = this.getUsuarioLogado();
            this.usuarioInput.value = usuario?.nome || usuario?.usuario_login || '';
        },

        definirDataAtual() {
            this.dataInput.value = new Date().toISOString().slice(0, 10);
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

                this.fabricaSelect.innerHTML = '<option value="">Selecione</option>'
                    + (data || []).map(f => `<option value="${f.id}">${this.escapeHtml(f.nome)}</option>`).join('');
            } catch (error) {
                console.error('Erro ao carregar fabricas:', error);
                alert('Erro ao carregar fabricas.');
            }
        },

        formularioBaseValido(mostrarAlerta = true) {
            if (!this.filialSelect.value || !this.fabricaSelect.value || !this.dataInput.value) {
                if (mostrarAlerta) alert('Preencha Filial, Fabrica e Data.');
                return false;
            }
            return true;
        },

        async carregarProdutos() {
            if (!this.formularioBaseValido()) return;

            this.btnCarregar.disabled = true;
            this.btnCarregar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Carregando...';
            this.tableBody.innerHTML = '<tr><td colspan="10" style="text-align:center;">Carregando produtos e ultima contagem...</td></tr>';

            try {
                const contagem = await this.buscarUltimaContagemFinalizada();
                this.contagemReferencia = contagem;
                if (!contagem) {
                    this.produtosCache = [];
                    this.estoqueContagemCache = new Map();
                    this.tableBody.innerHTML = '<tr><td colspan="10" style="text-align:center;">Nenhuma contagem finalizada encontrada para esta Filial/Fabrica.</td></tr>';
                    this.atualizarContagemInfo();
                    this.atualizarEstado(false);
                    this.atualizarTotais();
                    return;
                }

                const [produtosResult, itensResult] = await Promise.all([
                    this.buscarProdutos(),
                    this.buscarItensContagem(contagem.id)
                ]);

                if (produtosResult.error) throw produtosResult.error;
                if (itensResult.error) throw itensResult.error;

                this.produtosCache = produtosResult.data || [];
                this.estoqueContagemCache = new Map((itensResult.data || []).map(item => [String(item.produto_id), item]));
                this.carregamentoAtual = null;
                this.renderProdutos();
                this.atualizarContagemInfo();
                this.atualizarEstado(true);
            } catch (error) {
                console.error('Erro ao carregar carregamento:', error);
                alert('Erro ao carregar carregamento: ' + error.message);
                this.tableBody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:#dc3545;">Erro ao carregar dados.</td></tr>';
            } finally {
                this.btnCarregar.disabled = false;
                this.btnCarregar.innerHTML = '<i class="fas fa-search"></i> Carregar';
            }
        },

        async buscarUltimaContagemFinalizada() {
            const { data, error } = await supabaseClient
                .from('contagens_camara_fria')
                .select('id, filial, semana, fabrica_id, funcionario, status, finalizada_em, updated_at, fabricas_camara_fria(nome)')
                .eq('filial', this.filialSelect.value)
                .eq('fabrica_id', this.fabricaSelect.value)
                .eq('status', 'FINALIZADA')
                .order('finalizada_em', { ascending: false })
                .order('updated_at', { ascending: false })
                .limit(1);
            if (error) throw error;
            return data?.[0] || null;
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

        buscarItensContagem(contagemId) {
            return supabaseClient
                .from('contagem_camara_fria_itens')
                .select('id, produto_id, quantidade_caixas, observacao')
                .eq('contagem_id', contagemId);
        },

        renderProdutos() {
            if (this.recordsCount) {
                this.recordsCount.textContent = `${this.produtosCache.length} produto${this.produtosCache.length === 1 ? '' : 's'}`;
            }

            if (this.produtosCache.length === 0) {
                this.tableBody.innerHTML = '<tr><td colspan="10" style="text-align:center;">Nenhum produto cadastrado para esta filial.</td></tr>';
                this.atualizarTotais();
                return;
            }

            this.tableBody.innerHTML = this.produtosCache.map(produto => {
                const itemContagem = this.estoqueContagemCache.get(String(produto.id));
                const estoque = Number(itemContagem?.quantidade_caixas) || 0;
                return `
                    <tr data-produto-id="${produto.id}" data-caixas-por-palete="${produto.caixas_por_palete || 0}" data-estoque-contagem="${estoque}">
                        <td>${this.escapeHtml(produto.codigo || '-')}</td>
                        <td>
                            <strong>${this.escapeHtml(produto.nome)}</strong>
                            <div class="produto-meta">${this.escapeHtml(produto.filial || 'TODAS')}</div>
                        </td>
                        <td>${this.escapeHtml(produto.tipo || '-')}</td>
                        <td>${produto.caixas_por_palete || '-'}</td>
                        <td><input type="number" min="0" step="1" class="input-paletes-estoque"></td>
                        <td><input type="number" min="0" step="1" class="input-caixas-estoque"></td>
                        <td class="carregamento-total">0</td>
                        <td class="carregamento-estoque">${estoque}</td>
                        <td class="carregamento-diferenca zerado">0</td>
                        <td><input type="text" class="input-observacao-estoque" placeholder="Opcional"></td>
                    </tr>
                `;
            }).join('');

            this.tableBody.querySelectorAll('tr[data-produto-id]').forEach(tr => this.atualizarLinha(tr));
        },

        atualizarLinha(tr) {
            if (!tr) return;
            const necessario = this.getNecessarioLinha(tr);
            const estoque = Number(tr.dataset.estoqueContagem) || 0;
            const diferenca = estoque - necessario;

            tr.querySelector('.carregamento-total').textContent = String(necessario);
            const diffCell = tr.querySelector('.carregamento-diferenca');
            diffCell.className = 'carregamento-diferenca ' + (diferenca < 0 ? 'falta' : diferenca > 0 ? 'sobra' : 'zerado');
            diffCell.textContent = diferenca < 0 ? `Faltam ${Math.abs(diferenca)}` : diferenca > 0 ? `Sobram ${diferenca}` : 'OK';
            this.atualizarTotais();
        },

        atualizarTotais() {
            const linhas = Array.from(this.tableBody.querySelectorAll('tr[data-produto-id]'));
            let necessario = 0;
            let estoque = 0;
            let faltam = 0;
            let sobrando = 0;

            linhas.forEach(tr => {
                const total = this.getNecessarioLinha(tr);
                const estoqueLinha = Number(tr.dataset.estoqueContagem) || 0;
                const diferenca = estoqueLinha - total;
                necessario += total;
                estoque += estoqueLinha;
                if (diferenca < 0) faltam += Math.abs(diferenca);
                if (diferenca > 0 && total > 0) sobrando += diferenca;
            });

            this.kpiNecessario.textContent = String(necessario);
            this.kpiEstoque.textContent = String(estoque);
            this.kpiFaltam.textContent = String(faltam);
            this.kpiSobrando.textContent = String(sobrando);
        },

        getNecessarioLinha(tr) {
            const paletes = this.getNumero(tr.querySelector('.input-paletes-estoque')?.value);
            const caixas = this.getNumero(tr.querySelector('.input-caixas-estoque')?.value);
            const caixasPorPalete = Number(tr.dataset.caixasPorPalete) || 0;
            return (paletes * caixasPorPalete) + caixas;
        },

        getNumero(value) {
            const numero = parseInt(value, 10);
            return Number.isFinite(numero) && numero >= 0 ? numero : 0;
        },

        async salvarCarregamento() {
            if (!this.formularioBaseValido()) return;
            if (!this.contagemReferencia) return alert('Carregue uma ultima contagem finalizada antes de salvar.');

            const linhas = Array.from(this.tableBody.querySelectorAll('tr[data-produto-id]'));
            const itens = [];

            for (const tr of linhas) {
                const total = this.getNecessarioLinha(tr);
                if (total <= 0) continue;
                const estoque = Number(tr.dataset.estoqueContagem) || 0;
                itens.push({
                    produto_id: tr.dataset.produtoId,
                    quantidade_necessaria_caixas: total,
                    estoque_contagem_caixas: estoque,
                    diferenca_caixas: estoque - total,
                    observacao: tr.querySelector('.input-observacao-estoque')?.value.trim() || null,
                    updated_at: new Date().toISOString()
                });
            }

            if (itens.length === 0) return alert('Informe a quantidade necessaria de pelo menos um produto.');

            this.btnSalvar.disabled = true;
            this.btnSalvar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
            try {
                const usuario = this.getUsuarioLogado();
                const payload = {
                    filial: this.filialSelect.value,
                    fabrica_id: this.fabricaSelect.value,
                    data_carregamento: this.dataInput.value,
                    contagem_referencia_id: this.contagemReferencia.id,
                    usuario: usuario?.nome || usuario?.usuario_login || 'Sistema',
                    status: 'ABERTO',
                    updated_at: new Date().toISOString()
                };

                const { data: carregamento, error } = await supabaseClient
                    .from('carregamentos_camara_fria')
                    .insert(payload)
                    .select('id')
                    .single();
                if (error) throw error;

                const itensPayload = itens.map(item => ({
                    ...item,
                    carregamento_id: carregamento.id
                }));
                const { error: itensError } = await supabaseClient
                    .from('carregamento_camara_fria_itens')
                    .insert(itensPayload);
                if (itensError) throw itensError;

                registrarAuditoria('INCLUIR', 'Câmara Fria', `Carregamento registrado - Filial: ${payload.filial}, Data: ${payload.data_carregamento}`);
                alert('Carregamento salvo com sucesso!');
                this.limparLancamento(false);
                await this.renderCarregamentosRecentes();
            } catch (error) {
                console.error('Erro ao salvar carregamento:', error);
                alert('Erro ao salvar carregamento: ' + error.message);
            } finally {
                this.btnSalvar.disabled = false;
                this.btnSalvar.innerHTML = '<i class="fas fa-save"></i> Salvar';
                this.atualizarEstado(Boolean(this.contagemReferencia));
            }
        },

        limparLancamento(confirmar = true) {
            if (confirmar && !confirm('Limpar as quantidades informadas?')) return;
            this.tableBody.querySelectorAll('tr[data-produto-id]').forEach(tr => {
                tr.querySelector('.input-paletes-estoque').value = '';
                tr.querySelector('.input-caixas-estoque').value = '';
                tr.querySelector('.input-observacao-estoque').value = '';
                this.atualizarLinha(tr);
            });
        },

        resetLancamento() {
            this.produtosCache = [];
            this.estoqueContagemCache = new Map();
            this.contagemReferencia = null;
            this.carregamentoAtual = null;
            this.tableBody.innerHTML = '<tr><td colspan="10" style="text-align:center;">Selecione Filial e Fabrica para carregar.</td></tr>';
            this.recordsCount.textContent = '';
            this.atualizarContagemInfo();
            this.atualizarTotais();
            this.atualizarEstado(false);
        },

        atualizarContagemInfo() {
            this.contagemBadge.className = 'contagem-status-badge';
            if (!this.contagemReferencia) {
                this.contagemBadge.textContent = 'Nenhuma contagem carregada';
                this.contagemInfo.textContent = '';
                return;
            }

            this.contagemBadge.classList.add('finalizada');
            this.contagemBadge.textContent = `Contagem ${this.formatSemanaDisplay(this.contagemReferencia.semana)}`;
            this.contagemInfo.textContent = `Finalizada em: ${this.formatDateTime(this.contagemReferencia.finalizada_em || this.contagemReferencia.updated_at)} | Funcionario: ${this.contagemReferencia.funcionario || '-'}`;
        },

        atualizarEstado(habilitado) {
            this.btnSalvar.disabled = !habilitado;
            this.btnLimpar.disabled = !habilitado;
        },

        async renderCarregamentosRecentes() {
            try {
                let query = supabaseClient
                    .from('carregamentos_camara_fria')
                    .select('id, filial, data_carregamento, usuario, status, created_at, contagens_camara_fria(semana), fabricas_camara_fria(nome)')
                    .order('created_at', { ascending: false })
                    .limit(100);

                if (this.filialSelect?.value) query = query.eq('filial', this.filialSelect.value);
                if (this.fabricaSelect?.value) query = query.eq('fabrica_id', this.fabricaSelect.value);

                const { data, error } = await query;
                if (error) throw error;

                const registros = data || [];
                this.recentesCount.textContent = `${registros.length} carregamento${registros.length === 1 ? '' : 's'}`;
                if (registros.length === 0) {
                    this.recentesBody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Nenhum carregamento encontrado.</td></tr>';
                    return;
                }

                this.recentesBody.innerHTML = registros.map(item => `
                    <tr>
                        <td>${this.escapeHtml(item.filial)}</td>
                        <td>${this.escapeHtml(item.fabricas_camara_fria?.nome || '-')}</td>
                        <td>${this.formatDate(item.data_carregamento)}</td>
                        <td>${this.escapeHtml(this.formatSemanaDisplay(item.contagens_camara_fria?.semana))}</td>
                        <td>${this.escapeHtml(item.usuario || '-')}</td>
                        <td><span class="carregamento-status-pill ${item.status === 'FINALIZADO' ? 'finalizado' : 'aberto'}">${item.status === 'FINALIZADO' ? 'Finalizado' : 'Aberto'}</span></td>
                        <td class="actions-cell">
                            <button class="btn-icon delete" data-action="excluir" data-id="${item.id}" title="Excluir"><i class="fas fa-trash"></i></button>
                        </td>
                    </tr>
                `).join('');
            } catch (error) {
                console.error('Erro ao carregar carregamentos recentes:', error);
            }
        },

        async handleRecentesClick(event) {
            const button = event.target.closest('button[data-action="excluir"]');
            if (!button) return;
            if (!confirm('Excluir este carregamento?')) return;

            try {
                const { error } = await supabaseClient
                    .from('carregamentos_camara_fria')
                    .delete()
                    .eq('id', button.dataset.id);
                if (error) throw error;
                registrarAuditoria('EXCLUIR', 'Câmara Fria', `Exclusão de carregamento ID ${button.dataset.id}`);
                await this.renderCarregamentosRecentes();
            } catch (error) {
                console.error('Erro ao excluir carregamento:', error);
                alert('Erro ao excluir carregamento: ' + error.message);
            }
        },

        getUsuarioLogado() {
            try {
                return JSON.parse(localStorage.getItem('usuarioLogado') || 'null');
            } catch {
                return null;
            }
        },

        formatSemanaDisplay(value) {
            const match = String(value || '').match(/^(\d{4})-W(\d{2})$/);
            return match ? `${match[2]}-${match[1]}` : (value || '-');
        },

        formatDate(value) {
            if (!value) return '-';
            return new Date(`${value}T00:00:00`).toLocaleDateString('pt-BR');
        },

        formatDateTime(value) {
            if (!value) return '-';
            return new Date(value).toLocaleString('pt-BR');
        },

        escapeHtml(value) {
            return String(value ?? '')
                .replace(/&/g, '&amp;')
                .replace(/"/g, '&quot;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
        }
    };

    CarregamentoCamaraFriaUI.init();
});
