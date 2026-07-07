import { supabaseClient } from './supabase.js';
import { registrarAuditoria } from './auditoria-utils.js';

document.addEventListener('DOMContentLoaded', () => {
    const CarregamentoCamaraFriaUI = {
        filialRestrita: '',
        acessoGlobal: true,
        produtosCache: [],
        estoqueContagemCache: new Map(),
        lancamentosCache: [],
        totaisPorProduto: new Map(),
        contagemReferencia: null,
        carregamentoAtual: null,
        realtimeChannel: null,

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
            this.kpiTotalLancado = document.getElementById('kpiCarregamentoNecessario');
            this.kpiEstoque = document.getElementById('kpiCarregamentoEstoque');
            this.kpiProdutosLancados = document.getElementById('kpiCarregamentoFaltam');
            this.kpiUsuarios = document.getElementById('kpiCarregamentoSobrando');
        },

        bind() {
            this.btnCarregar.addEventListener('click', () => this.abrirOuCriarLista());
            this.btnSalvar.addEventListener('click', () => this.finalizarCarregamento());
            this.btnLimpar.addEventListener('click', () => this.limparCamposLancamento());

            [this.filialSelect, this.fabricaSelect, this.dataInput].forEach(el => {
                el.addEventListener('change', () => {
                    this.resetLancamento();
                    this.renderCarregamentosRecentes();
                });
            });

            this.tableBody.addEventListener('input', event => {
                if (event.target.matches('.input-paletes-lancar, .input-caixas-lancar')) {
                    this.atualizarPreviewLinha(event.target.closest('tr'));
                }
            });

            this.tableBody.addEventListener('click', event => {
                const button = event.target.closest('button[data-action="lancar"]');
                if (button) this.lancarProduto(button.closest('tr'));
            });

            this.recentesBody.addEventListener('click', event => this.handleRecentesClick(event));
            window.addEventListener('beforeunload', () => this.desconectarRealtime());
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

                this.fabricaSelect.innerHTML = '<option value="">Todas / Contagem unica</option>'
                    + (data || []).map(f => `<option value="${f.id}">${this.escapeHtml(f.nome)}</option>`).join('');
            } catch (error) {
                console.error('Erro ao carregar fabricas:', error);
                alert('Erro ao carregar fabricas.');
            }
        },

        formularioBaseValido(mostrarAlerta = true) {
            if (!this.filialSelect.value || !this.dataInput.value) {
                if (mostrarAlerta) alert('Preencha Filial e Data.');
                return false;
            }
            return true;
        },

        async abrirOuCriarLista() {
            if (!this.formularioBaseValido()) return;

            this.btnCarregar.disabled = true;
            this.btnCarregar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Abrindo...';
            this.tableBody.innerHTML = '<tr><td colspan="10" style="text-align:center;">Abrindo lista colaborativa...</td></tr>';

            try {
                const contagem = await this.buscarUltimaContagemFinalizada();
                this.contagemReferencia = contagem;

                if (!contagem) {
                    this.produtosCache = [];
                    this.estoqueContagemCache = new Map();
                    this.tableBody.innerHTML = '<tr><td colspan="10" style="text-align:center;">Nenhuma contagem finalizada encontrada para esta Filial.</td></tr>';
                    this.atualizarContagemInfo();
                    this.atualizarEstado(false);
                    this.atualizarTotais();
                    return;
                }

                let carregamento = await this.buscarListaAberta();
                if (!carregamento) carregamento = await this.criarLista(contagem);
                this.carregamentoAtual = carregamento;

                const [produtosResult, itensResult] = await Promise.all([
                    this.buscarProdutos(),
                    this.buscarItensContagem(contagem.id)
                ]);
                if (produtosResult.error) throw produtosResult.error;
                if (itensResult.error) throw itensResult.error;

                this.produtosCache = produtosResult.data || [];
                this.estoqueContagemCache = new Map((itensResult.data || []).map(item => [String(item.produto_id), item]));

                await this.buscarLancamentos();
                this.renderProdutos();
                this.atualizarContagemInfo();
                this.atualizarEstado(true);
                this.configurarRealtime();
                this.renderCarregamentosRecentes();
            } catch (error) {
                console.error('Erro ao abrir lista de carregamento:', error);
                alert('Erro ao abrir lista de carregamento: ' + error.message);
                this.tableBody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:#dc3545;">Erro ao abrir a lista.</td></tr>';
            } finally {
                this.btnCarregar.disabled = false;
                this.btnCarregar.innerHTML = '<i class="fas fa-folder-open"></i> Abrir/Criar';
            }
        },

        async buscarListaAberta() {
            let query = supabaseClient
                .from('carregamentos_camara_fria')
                .select('id, filial, fabrica_id, data_carregamento, contagem_referencia_id, usuario, status, created_at, updated_at')
                .eq('filial', this.filialSelect.value)
                .eq('data_carregamento', this.dataInput.value)
                .eq('status', 'ABERTO')
                .order('created_at', { ascending: false })
                .limit(1);

            query = this.fabricaSelect.value
                ? query.eq('fabrica_id', this.fabricaSelect.value)
                : query.is('fabrica_id', null);

            const { data, error } = await query;
            if (error) throw error;
            return data?.[0] || null;
        },

        async criarLista(contagem) {
            const usuario = this.getUsuarioLogado();
            const payload = {
                filial: this.filialSelect.value,
                fabrica_id: this.fabricaSelect.value || null,
                data_carregamento: this.dataInput.value,
                contagem_referencia_id: contagem.id,
                usuario: usuario?.nome || usuario?.usuario_login || 'Sistema',
                status: 'ABERTO',
                updated_at: new Date().toISOString()
            };

            const { data, error } = await supabaseClient
                .from('carregamentos_camara_fria')
                .insert(payload)
                .select('id, filial, fabrica_id, data_carregamento, contagem_referencia_id, usuario, status, created_at, updated_at')
                .single();
            if (error) throw error;

            registrarAuditoria('INCLUIR', 'Camara Fria', `Lista de carregamento criada - Filial: ${payload.filial}, Data: ${payload.data_carregamento}`);
            return data;
        },

        async buscarUltimaContagemFinalizada() {
            let query = supabaseClient
                .from('contagens_camara_fria')
                .select('id, filial, semana, dia_semana, fabrica_id, funcionario, status, finalizada_em, updated_at, fabricas_camara_fria(nome)')
                .eq('filial', this.filialSelect.value)
                .eq('status', 'FINALIZADA')
                .order('finalizada_em', { ascending: false })
                .order('updated_at', { ascending: false })
                .limit(1);

            if (this.fabricaSelect.value) query = query.eq('fabrica_id', this.fabricaSelect.value);

            const { data, error } = await query;
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

        async buscarLancamentos() {
            if (!this.carregamentoAtual?.id) {
                this.lancamentosCache = [];
                this.recalcularTotaisLancamentos();
                return;
            }

            const { data, error } = await supabaseClient
                .from('carregamento_camara_fria_lancamentos')
                .select('id, carregamento_id, produto_id, usuario, quantidade_caixas, observacao, created_at')
                .eq('carregamento_id', this.carregamentoAtual.id)
                .order('created_at', { ascending: true });
            if (error) throw error;

            this.lancamentosCache = data || [];
            this.recalcularTotaisLancamentos();
        },

        recalcularTotaisLancamentos() {
            const mapa = new Map();
            this.lancamentosCache.forEach(lancamento => {
                const produtoId = String(lancamento.produto_id);
                if (!mapa.has(produtoId)) {
                    mapa.set(produtoId, {
                        total: 0,
                        usuarios: new Set(),
                        ultimoUsuario: '',
                        ultimoHorario: '',
                        ultimaObservacao: ''
                    });
                }

                const item = mapa.get(produtoId);
                item.total += Number(lancamento.quantidade_caixas) || 0;
                if (lancamento.usuario) item.usuarios.add(lancamento.usuario);
                item.ultimoUsuario = lancamento.usuario || '-';
                item.ultimoHorario = lancamento.created_at || '';
                item.ultimaObservacao = lancamento.observacao || '';
            });
            this.totaisPorProduto = mapa;
        },

        configurarRealtime() {
            this.desconectarRealtime();
            if (!this.carregamentoAtual?.id) return;

            this.realtimeChannel = supabaseClient
                .channel(`carregamento-camara-fria-${this.carregamentoAtual.id}`)
                .on(
                    'postgres_changes',
                    {
                        event: '*',
                        schema: 'public',
                        table: 'carregamento_camara_fria_lancamentos',
                        filter: `carregamento_id=eq.${this.carregamentoAtual.id}`
                    },
                    async () => {
                        try {
                            await this.buscarLancamentos();
                            this.atualizarLinhasLancamentos();
                            this.atualizarTotais();
                        } catch (error) {
                            console.error('Erro ao atualizar lancamentos em tempo real:', error);
                        }
                    }
                )
                .subscribe();
        },

        desconectarRealtime() {
            if (this.realtimeChannel) {
                supabaseClient.removeChannel(this.realtimeChannel);
                this.realtimeChannel = null;
            }
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
                const totalInfo = this.totaisPorProduto.get(String(produto.id));
                return `
                    <tr data-produto-id="${produto.id}" data-caixas-por-palete="${produto.caixas_por_palete || 0}" data-estoque-contagem="${estoque}">
                        <td>${this.escapeHtml(produto.codigo || '-')}</td>
                        <td>
                            <strong>${this.escapeHtml(produto.nome)}</strong>
                            <div class="produto-meta">${this.escapeHtml(produto.filial || 'TODAS')}</div>
                        </td>
                        <td>${this.escapeHtml(produto.tipo || '-')}</td>
                        <td>${produto.caixas_por_palete || '-'}</td>
                        <td class="carregamento-estoque">${estoque}</td>
                        <td><input type="number" min="0" step="1" class="input-paletes-lancar" ${this.carregamentoAtual?.status === 'FINALIZADO' ? 'disabled' : ''}></td>
                        <td><input type="number" min="0" step="1" class="input-caixas-lancar" ${this.carregamentoAtual?.status === 'FINALIZADO' ? 'disabled' : ''}></td>
                        <td>
                            <button type="button" class="btn-glass btn-green btn-lancar-produto" data-action="lancar" ${this.carregamentoAtual?.status === 'FINALIZADO' ? 'disabled' : ''}>
                                <i class="fas fa-plus"></i> <span class="preview-lancar">${this.getPreviewLinhaHtml(0)}</span>
                            </button>
                        </td>
                        <td class="carregamento-total-lancado">${totalInfo?.total || 0}</td>
                        <td class="carregamento-usuarios">${totalInfo ? totalInfo.usuarios.size : 0}</td>
                        <td class="carregamento-ultimo">${this.formatUltimoLancamento(totalInfo)}</td>
                    </tr>
                `;
            }).join('');

            this.tableBody.querySelectorAll('tr[data-produto-id]').forEach(tr => this.atualizarPreviewLinha(tr));
            this.atualizarTotais();
        },

        atualizarLinhasLancamentos() {
            this.tableBody.querySelectorAll('tr[data-produto-id]').forEach(tr => {
                const totalInfo = this.totaisPorProduto.get(String(tr.dataset.produtoId));
                tr.querySelector('.carregamento-total-lancado').textContent = String(totalInfo?.total || 0);
                tr.querySelector('.carregamento-usuarios').textContent = String(totalInfo ? totalInfo.usuarios.size : 0);
                tr.querySelector('.carregamento-ultimo').innerHTML = this.formatUltimoLancamento(totalInfo);
            });
        },

        atualizarPreviewLinha(tr) {
            if (!tr) return;
            const total = this.getQuantidadeLancamentoLinha(tr);
            const preview = tr.querySelector('.preview-lancar');
            if (preview) preview.textContent = total > 0 ? String(total) : 'Lancar';
        },

        async lancarProduto(tr) {
            if (!tr || !this.carregamentoAtual?.id) return;
            if (this.carregamentoAtual.status === 'FINALIZADO') return alert('Esta lista ja esta finalizada.');

            const quantidade = this.getQuantidadeLancamentoLinha(tr);
            if (quantidade <= 0) return alert('Informe paletes ou caixas para lancar.');

            const usuario = this.getUsuarioLogado();
            const payload = {
                carregamento_id: this.carregamentoAtual.id,
                produto_id: tr.dataset.produtoId,
                usuario: usuario?.nome || usuario?.usuario_login || 'Sistema',
                quantidade_caixas: quantidade,
                created_at: new Date().toISOString()
            };

            const button = tr.querySelector('[data-action="lancar"]');
            if (button) button.disabled = true;

            try {
                const { error } = await supabaseClient
                    .from('carregamento_camara_fria_lancamentos')
                    .insert(payload);
                if (error) throw error;

                tr.querySelector('.input-paletes-lancar').value = '';
                tr.querySelector('.input-caixas-lancar').value = '';
                this.atualizarPreviewLinha(tr);
                await this.buscarLancamentos();
                this.atualizarLinhasLancamentos();
                this.atualizarTotais();
            } catch (error) {
                console.error('Erro ao lancar produto:', error);
                alert('Erro ao lancar produto: ' + error.message);
            } finally {
                if (button) button.disabled = false;
            }
        },

        getQuantidadeLancamentoLinha(tr) {
            const paletes = this.getNumero(tr.querySelector('.input-paletes-lancar')?.value);
            const caixas = this.getNumero(tr.querySelector('.input-caixas-lancar')?.value);
            const caixasPorPalete = Number(tr.dataset.caixasPorPalete) || 0;
            return (paletes * caixasPorPalete) + caixas;
        },

        atualizarTotais() {
            const totalLancado = this.lancamentosCache.reduce((acc, item) => acc + (Number(item.quantidade_caixas) || 0), 0);
            const estoque = Array.from(this.estoqueContagemCache.values()).reduce((acc, item) => acc + (Number(item.quantidade_caixas) || 0), 0);
            const produtosLancados = Array.from(this.totaisPorProduto.values()).filter(item => item.total > 0).length;
            const usuarios = new Set(this.lancamentosCache.map(item => item.usuario).filter(Boolean)).size;

            this.kpiTotalLancado.textContent = String(totalLancado);
            this.kpiEstoque.textContent = String(estoque);
            this.kpiProdutosLancados.textContent = String(produtosLancados);
            this.kpiUsuarios.textContent = String(usuarios);
        },

        getNumero(value) {
            const numero = parseInt(value, 10);
            return Number.isFinite(numero) && numero >= 0 ? numero : 0;
        },

        async finalizarCarregamento() {
            if (!this.carregamentoAtual?.id) return alert('Abra ou crie uma lista antes de finalizar.');
            if (!confirm('Finalizar esta lista de carregamento? Novos lancamentos serao bloqueados.')) return;

            await this.buscarLancamentos();
            const itens = Array.from(this.totaisPorProduto.entries())
                .filter(([, info]) => info.total > 0)
                .map(([produtoId, info]) => {
                    const estoque = Number(this.estoqueContagemCache.get(String(produtoId))?.quantidade_caixas) || 0;
                    return {
                        carregamento_id: this.carregamentoAtual.id,
                        produto_id: produtoId,
                        quantidade_necessaria_caixas: info.total,
                        estoque_contagem_caixas: estoque,
                        diferenca_caixas: estoque - info.total,
                        observacao: `Lancado por ${info.usuarios.size} usuario(s)`,
                        updated_at: new Date().toISOString()
                    };
                });

            if (itens.length === 0) return alert('Nenhum produto foi lancado nesta lista.');

            this.btnSalvar.disabled = true;
            this.btnSalvar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Finalizando...';

            try {
                const { error: deleteError } = await supabaseClient
                    .from('carregamento_camara_fria_itens')
                    .delete()
                    .eq('carregamento_id', this.carregamentoAtual.id);
                if (deleteError) throw deleteError;

                const { error: itensError } = await supabaseClient
                    .from('carregamento_camara_fria_itens')
                    .insert(itens);
                if (itensError) throw itensError;

                const { error: updateError } = await supabaseClient
                    .from('carregamentos_camara_fria')
                    .update({ status: 'FINALIZADO', updated_at: new Date().toISOString() })
                    .eq('id', this.carregamentoAtual.id);
                if (updateError) throw updateError;

                registrarAuditoria('ALTERAR', 'Camara Fria', `Lista de carregamento finalizada - ID: ${this.carregamentoAtual.id}`);
                alert('Lista finalizada com sucesso!');
                this.carregamentoAtual.status = 'FINALIZADO';
                this.desconectarRealtime();
                this.renderProdutos();
                this.atualizarEstado(false);
                this.renderCarregamentosRecentes();
            } catch (error) {
                console.error('Erro ao finalizar carregamento:', error);
                alert('Erro ao finalizar carregamento: ' + error.message);
            } finally {
                this.btnSalvar.disabled = false;
                this.btnSalvar.innerHTML = '<i class="fas fa-check"></i> Finalizar';
                this.atualizarEstado(this.carregamentoAtual?.status === 'ABERTO');
            }
        },

        limparCamposLancamento(confirmar = true) {
            if (confirmar && !confirm('Limpar as quantidades digitadas nesta tela? Os lancamentos ja enviados serao mantidos.')) return;
            this.tableBody.querySelectorAll('tr[data-produto-id]').forEach(tr => {
                tr.querySelector('.input-paletes-lancar').value = '';
                tr.querySelector('.input-caixas-lancar').value = '';
                this.atualizarPreviewLinha(tr);
            });
        },

        resetLancamento() {
            this.desconectarRealtime();
            this.produtosCache = [];
            this.estoqueContagemCache = new Map();
            this.lancamentosCache = [];
            this.totaisPorProduto = new Map();
            this.contagemReferencia = null;
            this.carregamentoAtual = null;
            this.tableBody.innerHTML = '<tr><td colspan="10" style="text-align:center;">Abra ou crie uma lista para iniciar os lancamentos.</td></tr>';
            this.recordsCount.textContent = '';
            this.atualizarContagemInfo();
            this.atualizarTotais();
            this.atualizarEstado(false);
        },

        atualizarContagemInfo() {
            this.contagemBadge.className = 'contagem-status-badge';
            if (!this.carregamentoAtual) {
                this.contagemBadge.textContent = 'Nenhuma lista aberta';
                this.contagemInfo.textContent = '';
                return;
            }

            this.contagemBadge.classList.add(this.carregamentoAtual.status === 'FINALIZADO' ? 'finalizada' : 'em-andamento');
            this.contagemBadge.textContent = `Lista ${this.carregamentoAtual.status === 'FINALIZADO' ? 'finalizada' : 'aberta'}`;
            const semana = this.formatSemanaDisplay(this.contagemReferencia?.semana);
            const fabrica = this.contagemReferencia?.fabricas_camara_fria?.nome || 'Contagem unica';
            this.contagemInfo.textContent = `Contagem base: ${semana} | ${fabrica} | Atualizacao ao vivo`;
        },

        atualizarEstado(habilitado) {
            this.btnSalvar.disabled = !habilitado;
            this.btnLimpar.disabled = !habilitado;
        },

        async renderCarregamentosRecentes() {
            try {
                let query = supabaseClient
                    .from('carregamentos_camara_fria')
                    .select('id, filial, fabrica_id, data_carregamento, usuario, status, created_at, contagens_camara_fria(semana), fabricas_camara_fria(nome)')
                    .order('created_at', { ascending: false })
                    .limit(100);

                if (this.filialSelect?.value) query = query.eq('filial', this.filialSelect.value);
                if (this.fabricaSelect?.value) query = query.eq('fabrica_id', this.fabricaSelect.value);

                const { data, error } = await query;
                if (error) throw error;

                const registros = data || [];
                this.recentesCount.textContent = `${registros.length} lista${registros.length === 1 ? '' : 's'}`;
                if (registros.length === 0) {
                    this.recentesBody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Nenhum carregamento encontrado.</td></tr>';
                    return;
                }

                this.recentesBody.innerHTML = registros.map(item => `
                    <tr>
                        <td>${this.escapeHtml(item.filial)}</td>
                        <td>${this.escapeHtml(item.fabricas_camara_fria?.nome || 'Contagem unica')}</td>
                        <td>${this.formatDate(item.data_carregamento)}</td>
                        <td>${this.escapeHtml(this.formatSemanaDisplay(item.contagens_camara_fria?.semana))}</td>
                        <td>${this.escapeHtml(item.usuario || '-')}</td>
                        <td><span class="carregamento-status-pill ${item.status === 'FINALIZADO' ? 'finalizado' : 'aberto'}">${item.status === 'FINALIZADO' ? 'Finalizado' : 'Aberto'}</span></td>
                        <td class="actions-cell">
                            <button class="btn-icon edit" data-action="abrir" data-id="${item.id}" data-filial="${this.escapeHtml(item.filial)}" data-fabrica="${item.fabrica_id || ''}" data-data="${item.data_carregamento}" title="Abrir"><i class="fas fa-folder-open"></i></button>
                            <button class="btn-icon delete" data-action="excluir" data-id="${item.id}" title="Excluir"><i class="fas fa-trash"></i></button>
                        </td>
                    </tr>
                `).join('');
            } catch (error) {
                console.error('Erro ao carregar carregamentos recentes:', error);
            }
        },

        async handleRecentesClick(event) {
            const button = event.target.closest('button[data-action]');
            if (!button) return;

            if (button.dataset.action === 'abrir') {
                if (!this.filialRestrita) this.filialSelect.value = button.dataset.filial || '';
                this.fabricaSelect.value = button.dataset.fabrica || '';
                this.dataInput.value = button.dataset.data || this.dataInput.value;
                await this.abrirListaPorId(button.dataset.id);
                return;
            }

            if (button.dataset.action === 'excluir') {
                if (!confirm('Excluir esta lista de carregamento?')) return;
                try {
                    const { error } = await supabaseClient
                        .from('carregamentos_camara_fria')
                        .delete()
                        .eq('id', button.dataset.id);
                    if (error) throw error;
                    registrarAuditoria('EXCLUIR', 'Camara Fria', `Exclusao de lista de carregamento ID ${button.dataset.id}`);
                    if (this.carregamentoAtual?.id === button.dataset.id) this.resetLancamento();
                    await this.renderCarregamentosRecentes();
                } catch (error) {
                    console.error('Erro ao excluir carregamento:', error);
                    alert('Erro ao excluir carregamento: ' + error.message);
                }
            }
        },

        async abrirListaPorId(id) {
            try {
                this.desconectarRealtime();
                const { data, error } = await supabaseClient
                    .from('carregamentos_camara_fria')
                    .select('id, filial, fabrica_id, data_carregamento, contagem_referencia_id, usuario, status, created_at, updated_at')
                    .eq('id', id)
                    .single();
                if (error) throw error;

                this.carregamentoAtual = data;
                this.contagemReferencia = data.contagem_referencia_id
                    ? await this.buscarContagemPorId(data.contagem_referencia_id)
                    : await this.buscarUltimaContagemFinalizada();

                const [produtosResult, itensResult] = await Promise.all([
                    this.buscarProdutos(),
                    this.contagemReferencia?.id ? this.buscarItensContagem(this.contagemReferencia.id) : Promise.resolve({ data: [] })
                ]);
                if (produtosResult.error) throw produtosResult.error;
                if (itensResult.error) throw itensResult.error;

                this.produtosCache = produtosResult.data || [];
                this.estoqueContagemCache = new Map((itensResult.data || []).map(item => [String(item.produto_id), item]));
                await this.buscarLancamentos();
                this.renderProdutos();
                this.atualizarContagemInfo();
                this.atualizarEstado(this.carregamentoAtual.status === 'ABERTO');
                if (this.carregamentoAtual.status === 'ABERTO') this.configurarRealtime();
            } catch (error) {
                console.error('Erro ao abrir lista:', error);
                alert('Erro ao abrir lista: ' + error.message);
            }
        },

        async buscarContagemPorId(id) {
            const { data, error } = await supabaseClient
                .from('contagens_camara_fria')
                .select('id, filial, semana, dia_semana, fabrica_id, funcionario, status, finalizada_em, updated_at, fabricas_camara_fria(nome)')
                .eq('id', id)
                .single();
            if (error) throw error;
            return data;
        },

        getUsuarioLogado() {
            try {
                return JSON.parse(localStorage.getItem('usuarioLogado') || 'null');
            } catch {
                return null;
            }
        },

        formatUltimoLancamento(info) {
            if (!info?.ultimoHorario) return '-';
            const horario = this.formatDateTime(info.ultimoHorario);
            const usuario = this.escapeHtml(info.ultimoUsuario || '-');
            return `<strong>${usuario}</strong><div class="produto-meta">${horario}</div>`;
        },

        getPreviewLinhaHtml(total) {
            return total > 0 ? String(total) : 'Lancar';
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
