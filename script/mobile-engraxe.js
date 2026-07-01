import { supabaseClient } from './supabase.js';

let currentListId = null;
let currentItems = [];
let currentFilter = 'TODOS';
let usuarioLogadoMobileEngraxe = null;
const NIVEIS_BLOQUEIO_LOCALIZACAO_MOBILE = new Set(['equipe_sabado', 'coleta_km']);

function normalizarFilialMobileEngraxe(value) {
    return String(value || '').trim().toUpperCase();
}

function getFilialUsuarioMobileEngraxe() {
    return normalizarFilialMobileEngraxe(usuarioLogadoMobileEngraxe?.filial);
}

function getNivelUsuarioMobile() {
    try {
        const usuario = JSON.parse(localStorage.getItem('usuarioLogado') || 'null');
        return String(usuario?.nivel || '').trim().toLowerCase();
    } catch {
        return '';
    }
}

function localizacaoBloqueadaMobile() {
    return NIVEIS_BLOQUEIO_LOCALIZACAO_MOBILE.has(getNivelUsuarioMobile());
}

document.addEventListener('DOMContentLoaded', () => {
    const usuario = JSON.parse(localStorage.getItem('usuarioLogado'));
    if (!usuario) { window.location.href = 'index.html'; return; }
    usuarioLogadoMobileEngraxe = usuario;

    carregarListasMobile();

    // Navegação
    const btnVoltar = document.getElementById('btnVoltarListas');
    if (btnVoltar) {
        btnVoltar.addEventListener('click', showViewListas);
    }
    
    // Modal
    const btnFechar = document.getElementById('btnFecharModal');
    if (btnFechar) btnFechar.addEventListener('click', fecharModal);

    const btnFecharLocalizacao = document.getElementById('btnFecharModalLocalizacao');
    if (btnFecharLocalizacao) btnFecharLocalizacao.addEventListener('click', fecharModalLocalizacao);

    const btnSalvar = document.getElementById('btnSalvarItemMobile');
    if (btnSalvar) btnSalvar.addEventListener('click', salvarItemMobile);
    
    // Filtro
    const filtro = document.getElementById('filtroVeiculoMobile');
    if (filtro) filtro.addEventListener('input', renderizarItensMobile); // Mudado para chamar renderizarItensMobile diretamente

    // Abas de Filtro
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            e.currentTarget.classList.add('active');
            currentFilter = e.currentTarget.dataset.filter;
            renderizarItensMobile();
        });
    });

    // Delegação de eventos para clique nos cards de itens (Performance e UX)
    const containerItens = document.getElementById('listaVeiculosContainer');
    if (containerItens) {
        containerItens.addEventListener('click', async (e) => {
            const botaoLocalizar = e.target.closest('.btn-localizar-veiculo');
            if (!botaoLocalizar) return;

            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            if (botaoLocalizar.disabled || localizacaoBloqueadaMobile()) return;
            await abrirModalLocalizacaoVeiculo(botaoLocalizar.dataset.placa);
        }, true);

        containerItens.addEventListener('click', async (e) => {
            const togglePlaqueta = e.target.closest('.plaqueta-toggle');
            if (togglePlaqueta) {
                e.preventDefault();
                e.stopPropagation();
                await alternarPlaquetaMobile(togglePlaqueta);
                return;
            }

            const botaoLocalizar = e.target.closest('.btn-localizar-veiculo');
            if (botaoLocalizar) {
                e.preventDefault();
                e.stopPropagation();
                if (botaoLocalizar.disabled || localizacaoBloqueadaMobile()) return;
                await abrirModalLocalizacaoVeiculo(botaoLocalizar.dataset.placa);
                return;
            }

            if (e.target.closest('button, a, input, select, textarea, label')) {
                return;
            }

            const card = e.target.closest('.card[data-item-id]');
            if (card) {
                const id = card.dataset.itemId;
                window.prepararEdicaoMobile(id);
            }
        });
    }

    // Cálculo automático de data no modal
    const editRealizado = document.getElementById('editRealizado');
    if (editRealizado) {
        editRealizado.addEventListener('change', (e) => {
            const dataRealizado = e.target.value;
            const inputProximo = document.getElementById('editProximo');
            if (dataRealizado) {
                const data = new Date(dataRealizado);
                data.setDate(data.getDate() + 21); // +21 dias
                inputProximo.value = data.toISOString().split('T')[0];
            } else {
                inputProximo.value = '';
            }
        });
    }
});

function showViewListas() {
    document.getElementById('viewItens').classList.add('hidden');
    document.getElementById('viewListas').classList.remove('hidden');
    carregarListasMobile();
}

async function carregarListasMobile() {
    const container = document.getElementById('listaDeListas');
    if (!container) return;
    
    container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Carregando listas...</div>';

    try {
        let query = supabaseClient
            .from('engraxe_listas')
            .select('*')
            .eq('status', 'ABERTA')
            .order('created_at', { ascending: false });
        const filialUsuario = getFilialUsuarioMobileEngraxe();
        if (filialUsuario) query = query.eq('filial', filialUsuario);

        const { data: listasAbertas, error } = await query;

        if (error) throw error;

        container.innerHTML = '';
        if (!listasAbertas || listasAbertas.length === 0) {
            container.innerHTML = '<div class="loading">Nenhuma lista aberta encontrada.</div>';
            return;
        }

        const cardsHtml = listasAbertas.map(lista => `
            <div class="card status-aberta" onclick="window.abrirLista('${lista.id}', '${lista.nome}')">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <h4>${lista.nome}</h4>
                        <p><i class="far fa-calendar-alt"></i> ${new Date(lista.created_at).toLocaleDateString('pt-BR')}</p>
                        <span class="status">ABERTA</span>
                    </div>
                    <i class="fas fa-chevron-right"></i>
                </div>
            </div>
        `).join('');

        container.innerHTML = cardsHtml;
    } catch (error) {
        console.error('Erro ao carregar listas:', error);
        container.innerHTML = '<div class="loading" style="color: red;">Erro ao carregar listas.</div>';
    }
}

// Expor função para o escopo global
window.abrirLista = async function(id, nome) {
    try {
        let queryLista = supabaseClient
            .from('engraxe_listas')
            .select('id, nome, filial')
            .eq('id', id);
        const filialUsuario = getFilialUsuarioMobileEngraxe();
        if (filialUsuario) queryLista = queryLista.eq('filial', filialUsuario);

        const { data: listaPermitida, error: listaError } = await queryLista.maybeSingle();
        if (listaError) throw listaError;
        if (!listaPermitida) {
            alert('Lista nao encontrada para a sua filial.');
            carregarListasMobile();
            return;
        }

        currentListId = id;
        const titulo = document.getElementById('tituloListaAtual');
        if (titulo) titulo.textContent = listaPermitida.nome || nome;
        
        document.getElementById('viewListas').classList.add('hidden');
        document.getElementById('viewItens').classList.remove('hidden');
        
        const container = document.getElementById('listaVeiculosContainer');
        container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Carregando itens...</div>';

        const { data: itens, error } = await supabaseClient
            .from('engraxe_itens')
            .select('*')
            .eq('lista_id', id)
            .order('placa');

        if (error) throw error;

        currentItems = itens || [];
        atualizarContadores();
        atualizarResumoPlaquetas();
        renderizarItensMobile();
    } catch (error) {
        console.error('Erro ao carregar itens:', error);
        container.innerHTML = '<div class="loading" style="color: red;">Erro ao carregar itens.</div>';
    }
}

function renderizarItensMobile() {
    const container = document.getElementById('listaVeiculosContainer');
    if (!container) return;

    const termo = document.getElementById('filtroVeiculoMobile').value.toLowerCase();
    
    // Filtragem combinada (Busca + Aba de Status)
    const itensFiltrados = currentItems.filter(i => {
        const matchTermo = i.placa.toLowerCase().includes(termo) || (i.modelo && i.modelo.toLowerCase().includes(termo));
        
        let matchStatus = true;
        const statusItem = i.status || 'PENDENTE';
        
        if (currentFilter !== 'TODOS') {
            if (currentFilter === 'OK') {
                matchStatus = statusItem === 'OK' || statusItem === 'REALIZADO';
            } else {
                matchStatus = statusItem === currentFilter;
            }
        }
        
        return matchTermo && matchStatus;
    });
    
    if (itensFiltrados.length === 0) {
        container.innerHTML = '<div class="loading">Nenhum veículo encontrado.</div>';
        return;
    }

    const cardsHtml = itensFiltrados.map(item => {
        const status = item.status || 'PENDENTE';
        let statusClass = 'status-pendente';
        
        if (status === 'OK' || status === 'REALIZADO') statusClass = 'status-realizado';
        else if (status === 'ROTA') statusClass = 'status-rota';
        else if (status === 'INTERNADO') statusClass = 'status-internado';
        
        const isDone = status === 'OK' || status === 'REALIZADO';
        const possuiPlaqueta = String(item.plaquinha || '').trim().toUpperCase() === 'SIM';
        const bloquearLocalizacao = localizacaoBloqueadaMobile();
        const localizacaoAttrs = bloquearLocalizacao
            ? 'disabled aria-disabled="true" title="Localizacao bloqueada para seu nivel"'
            : 'title="Localizar placa"';

        return `
            <div class="card ${statusClass}" data-item-id="${item.id}">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div style="flex: 1;">
                        <h4>${item.placa}</h4>
                        <p>${item.modelo || 'Modelo n/i'}</p>
                    </div>
                    <div style="text-align: right;">
                        <span class="status">${status}</span>
                        <button
                            type="button"
                            class="btn-localizar-veiculo ${bloquearLocalizacao ? 'localizacao-bloqueada' : ''}"
                            data-placa="${item.placa}"
                            ${localizacaoAttrs}
                            aria-label="${bloquearLocalizacao ? 'Localizacao bloqueada' : 'Localizar placa'} ${item.placa}"
                            onclick="return window.abrirLocalizacaoEngraxe(event, this.dataset.placa)"
                        >
                            <i class="fas fa-map-location-dot"></i>
                        </button>
                        ${isDone ? '<br><i class="fas fa-check-circle" style="color: #28a745; margin-top: 5px; font-size: 1.2rem;"></i>' : ''}
                    </div>
                </div>
                <div class="plaqueta-control">
                    <span>Placa</span>
                    <button
                        type="button"
                        class="plaqueta-toggle ${possuiPlaqueta ? 'active' : ''}"
                        data-item-id="${item.id}"
                        role="switch"
                        aria-checked="${possuiPlaqueta}"
                        aria-label="Plaqueta da placa ${item.placa}: ${possuiPlaqueta ? 'Sim' : 'Nao'}"
                    >
                        <span class="plaqueta-toggle-label">${possuiPlaqueta ? 'Sim' : 'Nao'}</span>
                        <span class="plaqueta-toggle-knob"></span>
                    </button>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = cardsHtml;
}

async function alternarPlaquetaMobile(botao) {
    if (botao.disabled) return;

    const id = botao.dataset.itemId;
    const item = currentItems.find(i => String(i.id) === String(id));
    if (!item) return;

    const valorAtual = String(item.plaquinha || '').trim().toUpperCase() === 'SIM' ? 'SIM' : 'NAO';
    const novoValor = valorAtual === 'SIM' ? 'NAO' : 'SIM';
    botao.disabled = true;

    try {
        const { error } = await supabaseClient
            .from('engraxe_itens')
            .update({ plaquinha: novoValor })
            .eq('id', id);

        if (error) throw error;

        item.plaquinha = novoValor;
        const ativo = novoValor === 'SIM';
        botao.classList.toggle('active', ativo);
        botao.setAttribute('aria-checked', String(ativo));
        botao.setAttribute('aria-label', `Plaqueta da placa ${item.placa}: ${ativo ? 'Sim' : 'Nao'}`);
        botao.querySelector('.plaqueta-toggle-label').textContent = ativo ? 'Sim' : 'Nao';
        atualizarResumoPlaquetas();
    } catch (error) {
        console.error('Erro ao atualizar plaqueta:', error);
        alert('Nao foi possivel atualizar a plaqueta.');
    } finally {
        botao.disabled = false;
    }
}

function atualizarResumoPlaquetas() {
    const resumo = document.getElementById('resumoPlaquetas');
    if (!resumo) return;

    const totalComPlaqueta = currentItems.filter(item =>
        String(item.plaquinha || '').trim().toUpperCase() === 'SIM'
    ).length;

    resumo.textContent = `(${totalComPlaqueta}/${currentItems.length})`;
}

function atualizarContadores() {
    const counts = currentItems.reduce((acc, item) => {
        const s = item.status || 'PENDENTE';
        if (s === 'PENDENTE') acc.pendentes++;
        else if (s === 'OK' || s === 'REALIZADO') acc.realizados++;
        else if (s === 'ROTA') acc.rota++;
        else if (s === 'INTERNADO') acc.internados++;
        return acc;
    }, { pendentes: 0, realizados: 0, rota: 0, internados: 0 });

    const setTxt = (id, txt) => {
        const el = document.getElementById(id);
        if (el) el.textContent = `(${txt})`;
    };

    setTxt('countTodos', currentItems.length);
    setTxt('countPendentes', counts.pendentes);
    setTxt('countRealizados', counts.realizados);
    setTxt('countRota', counts.rota);
    setTxt('countInternados', counts.internados);
}

function placaSemMascara(valor) {
    return String(valor || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function abrirModalLocalizacaoCarregando(placa) {
    const modal = document.getElementById('modalLocalizacaoVeiculo');
    const titulo = document.getElementById('modalLocalizacaoTitulo');
    const status = document.getElementById('statusLocalizacaoVeiculo');
    const iframe = document.getElementById('iframeLocalizacaoVeiculo');
    const link = document.getElementById('linkAbrirLocalizacaoMaps');

    if (titulo) titulo.textContent = `Localizar ${placa}`;
    if (status) {
        status.className = 'localizacao-status-mobile';
        status.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Consultando localizacao...';
    }
    if (iframe) iframe.src = 'about:blank';
    if (link) {
        link.href = '#';
        link.classList.add('hidden');
    }

    modal.style.display = 'flex';
    modal.classList.remove('hidden');
}

async function abrirModalLocalizacaoVeiculo(placaOriginal) {
    const placa = placaSemMascara(placaOriginal);
    const status = document.getElementById('statusLocalizacaoVeiculo');
    const iframe = document.getElementById('iframeLocalizacaoVeiculo');
    const link = document.getElementById('linkAbrirLocalizacaoMaps');

    if (placa.length !== 7) {
        alert('Placa invalida para localizacao.');
        return;
    }

    abrirModalLocalizacaoCarregando(placa);

    try {
        const { data, error } = await supabaseClient.functions.invoke('localizacao-veiculo', {
            body: { placa }
        });

        if (error) throw error;
        if (!data?.success) throw new Error(data?.message || 'Nao foi possivel localizar o veiculo.');

        const dados = data.data || {};
        const latitude = Number(dados.latitude);
        const longitude = Number(dados.longitude);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            throw new Error('O rastreador nao retornou coordenadas para esta placa.');
        }

        const coordenadas = `${latitude},${longitude}`;
        const urlMapa = `https://www.google.com/maps?q=${encodeURIComponent(coordenadas)}`;
        const urlEmbed = `${urlMapa}&output=embed`;

        if (iframe) iframe.src = urlEmbed;
        if (link) {
            link.href = urlMapa;
            link.classList.remove('hidden');
        }
        if (status) {
            status.className = 'localizacao-status-mobile sucesso';
            status.innerHTML = `<i class="fas fa-location-dot"></i> ${dados.endereco || coordenadas}`;
        }
    } catch (error) {
        console.error('Erro ao localizar veiculo:', error);
        if (status) {
            status.className = 'localizacao-status-mobile erro';
            status.innerHTML = `<i class="fas fa-triangle-exclamation"></i> ${error?.message || 'Nao foi possivel localizar o veiculo.'}`;
        }
    }
}

window.abrirLocalizacaoEngraxe = async function(event, placa) {
    event?.preventDefault();
    event?.stopPropagation();
    event?.stopImmediatePropagation?.();
    if (event?.currentTarget?.disabled || localizacaoBloqueadaMobile()) return false;
    await abrirModalLocalizacaoVeiculo(placa);
    return false;
};

function fecharModalLocalizacao() {
    const modal = document.getElementById('modalLocalizacaoVeiculo');
    const iframe = document.getElementById('iframeLocalizacaoVeiculo');
    if (iframe) iframe.src = 'about:blank';
    modal.style.display = 'none';
    modal.classList.add('hidden');
}

window.prepararEdicaoMobile = function(id) {
    const item = currentItems.find(i => i.id === id);
    if (!item) return;

    document.getElementById('editItemId').value = item.id;
    document.getElementById('modalPlacaTitulo').textContent = `Editar ${item.placa}`;
    
    // Preenche campos
    const formatDate = (d) => d && d.includes('T') ? d.split('T')[0] : d;

    // Define data de hoje (local) se não houver data realizada
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    const hoje = now.toISOString().split('T')[0];

    const dataRealizado = formatDate(item.data_realizado) || hoje;
    document.getElementById('editRealizado').value = dataRealizado;

    // Se não tinha data realizada (era novo/pendente), calcula o próximo vencimento (21 dias)
    let dataProximo = formatDate(item.data_proximo);
    if (!item.data_realizado && !dataProximo) {
        const d = new Date(dataRealizado);
        d.setDate(d.getDate() + 21);
        dataProximo = d.toISOString().split('T')[0];
    }
    document.getElementById('editProximo').value = dataProximo || '';
    
    document.getElementById('editPlaqueta').value =
        String(item.plaquinha || '').trim().toUpperCase() === 'SIM' ? 'SIM' : 'NAO';
    document.getElementById('editSeg').value = item.seg || '';
    
    // Normaliza status para o select
    let statusVal = item.status || 'PENDENTE';
    if (statusVal === 'REALIZADO') statusVal = 'OK'; // 'REALIZADO' é equivalente a 'OK' para exibição
    // Removido: Não mudar PENDENTE para OK automaticamente ao abrir o modal.
    document.getElementById('editStatus').value = statusVal;
    
    document.getElementById('editKm').value = item.km || '';

    // Mostra modal
    const modal = document.getElementById('modalEditarItem');
    modal.style.display = 'flex';
    modal.classList.remove('hidden');
}

async function salvarItemMobile() {
    const id = document.getElementById('editItemId').value;
    const realizado = document.getElementById('editRealizado').value;
    const proximo = document.getElementById('editProximo').value;
    const plaqueta = document.getElementById('editPlaqueta').value;
    const seg = document.getElementById('editSeg').value;
    const status = document.getElementById('editStatus').value;
    const km = document.getElementById('editKm').value;
    const usuario = JSON.parse(localStorage.getItem('usuarioLogado')).nome;

    const btn = document.getElementById('btnSalvarItemMobile');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = 'Salvando...';

    try {
        const updateData = {
            data_realizado: realizado || null,
            data_proximo: proximo || null,
            plaquinha: plaqueta,
            seg: seg,
            status: status,
            km: km ? parseInt(km) : null,
            usuario_realizou: usuario
        };

        const { error } = await supabaseClient
            .from('engraxe_itens')
            .update(updateData)
            .eq('id', id);

        if (error) throw error;

        // Atualiza cache local e re-renderiza
        const index = currentItems.findIndex(i => i.id === id);
        if (index !== -1) {
            currentItems[index] = { ...currentItems[index], ...updateData };
            atualizarContadores();
            renderizarItensMobile();
        }

        fecharModal();

    } catch (error) {
        console.error('Erro ao salvar item:', error);
        alert('Erro ao salvar item: ' + error.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

function fecharModal() {
    const modal = document.getElementById('modalEditarItem');
    modal.style.display = 'none';
    modal.classList.add('hidden');
}
