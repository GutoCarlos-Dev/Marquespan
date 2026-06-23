import { supabaseClient } from './supabase.js';
import XLSX from "https://cdn.sheetjs.com/xlsx-0.20.2/package/xlsx.mjs";

let currentListId = null;
let currentItems = [];
let currentFilter = 'TODOS';
const NIVEIS_BLOQUEIO_LOCALIZACAO_MOBILE = new Set(['equipe_sabado', 'coleta_km']);

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

document.addEventListener('DOMContentLoaded', async () => {
    const usuario = JSON.parse(localStorage.getItem('usuarioLogado'));
    if (!usuario) { window.location.href = 'index.html'; return; }

    await carregarListasAbertas();

    document.getElementById('btnVoltar').addEventListener('click', showScreenListas);
    document.getElementById('searchPlacaMobile').addEventListener('input', renderizarItens);
    
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            currentFilter = e.target.dataset.filter;
            renderizarItens();
        });
    });

    // Otimização: usa delegação de eventos para os cliques nos cards
    const listaDeItens = document.getElementById('listaDeItens');

    listaDeItens.addEventListener('click', async (e) => {
        const botaoLocalizar = e.target.closest('.btn-localizar-veiculo-lavagem');
        if (!botaoLocalizar) return;

        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (botaoLocalizar.disabled || localizacaoBloqueadaMobile()) return;
        await abrirModalLocalizacaoLavagem(botaoLocalizar.dataset.placa);
    }, true);

    listaDeItens.addEventListener('click', async (e) => {
        const botaoLocalizar = e.target.closest('.btn-localizar-veiculo-lavagem');
        if (botaoLocalizar) {
            e.preventDefault();
            e.stopPropagation();
            if (botaoLocalizar.disabled || localizacaoBloqueadaMobile()) return;
            await abrirModalLocalizacaoLavagem(botaoLocalizar.dataset.placa);
            return;
        }

        if (e.target.closest('button, a, input, select, textarea, label')) return;

        const card = e.target.closest('.card[data-item-id]');
        if (card) {
            const itemId = card.dataset.itemId;
            const item = currentItems.find(i => String(i.id) === itemId);
            if (item) {
                const statusNormalizado = normalizarStatusLavagem(item.status);
                if (statusNormalizado === 'INTERNADO' || statusNormalizado === 'DISPENSADO') return;
                abrirModalAcao(item);
            }
        }
    });

    document.querySelector('#modalAcaoMobile .close-modal')?.addEventListener('click', fecharModal);
    document.getElementById('btnFecharModalLocalizacaoLavagem')?.addEventListener('click', fecharModalLocalizacaoLavagem);
    document.getElementById('btnSalvarLavagem').addEventListener('click', salvarLavagem);
});

async function carregarListasAbertas() {
    const container = document.getElementById('listaDeListas');
    container.innerHTML = '<div class="loading">Carregando...</div>';

    try {
        const { data, error } = await supabaseClient
            .from('lavagem_listas')
            .select('*')
            .eq('status', 'ABERTA')
            .order('created_at', { ascending: false });

        if (error) throw error;

        container.innerHTML = '';
        if (!data || data.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding:20px; color:#666;">Nenhuma lista aberta disponível.</div>';
            return;
        }

        data.forEach(lista => {
            const card = document.createElement('div');
            card.className = 'card status-aberta';
            card.innerHTML = `
                <h4>${lista.nome}</h4>
                <p><i class="far fa-calendar-alt"></i> ${new Date(lista.data_lista).toLocaleDateString('pt-BR')}</p>
                <span class="status">ABERTA</span>
            `;
            card.onclick = () => abrirLista(lista);
            container.appendChild(card);
        });

    } catch (error) {
        console.error(error);
        container.innerHTML = '<div style="color:red; text-align:center;">Erro ao carregar listas.</div>';
    }
}

async function abrirLista(lista) {
    currentListId = lista.id;
    document.getElementById('tituloListaAtual').textContent = lista.nome;
    
    document.getElementById('screenListas').classList.add('hidden');
    document.getElementById('screenItens').classList.remove('hidden');
    
    await carregarItensDaLista(lista.id);
}

async function carregarItensDaLista(id) {
    const container = document.getElementById('listaDeItens');
    container.innerHTML = '<div class="loading">Carregando veículos...</div>';

    try {
        const { data, error } = await supabaseClient
            .from('lavagem_itens')
            .select('*')
            .eq('lista_id', id)
            .order('placa');

        if (error) throw error;

        currentItems = data;
        atualizarContadores();
        renderizarItens();

    } catch (error) {
        console.error(error);
        container.innerHTML = '<div style="color:red;">Erro ao carregar itens.</div>';
    }
}

function atualizarContadores() {
    // Otimização: usa reduce para contar todos os status em uma única passagem
    const counts = currentItems.reduce((acc, item) => {
        if (item.status === 'PENDENTE') {
            acc.pendentes++;
        } else if (item.status === 'REALIZADO') {
            acc.realizados++;
        } else if (item.status === 'AGENDADO') {
            acc.agendados++;
        } else if (item.status === 'INTERNADO') {
            acc.internados++;
        }
        return acc;
    }, { pendentes: 0, realizados: 0, agendados: 0, internados: 0 });

    const elTodos = document.getElementById('countTodos');
    if (elTodos) elTodos.textContent = `(${currentItems.length})`;
    
    const elPendentes = document.getElementById('countPendentes');
    if (elPendentes) elPendentes.textContent = `(${counts.pendentes})`;
    
    const elRealizados = document.getElementById('countRealizados');
    if (elRealizados) elRealizados.textContent = `(${counts.realizados})`;

    const elAgendados = document.getElementById('countAgendados');
    if (elAgendados) elAgendados.textContent = `(${counts.agendados})`;

    const elInternados = document.getElementById('countInternados');
    if (elInternados) elInternados.textContent = `(${counts.internados})`;
}

function normalizarStatusLavagem(status) {
    if (status === 'PULAR_LAVAGEM' || status === 'DISPENSADO') return 'DISPENSADO';
    return status || '';
}

function renderizarItens() {
    const container = document.getElementById('listaDeItens');
    const termo = document.getElementById('searchPlacaMobile').value.toUpperCase();

    const itensFiltrados = currentItems.filter(item => {
        const matchTermo = item.placa.includes(termo);
        const itemStatus = normalizarStatusLavagem(item.status); // Normaliza para filtro
        const matchStatus = currentFilter === 'TODOS' || itemStatus === currentFilter;
        return matchTermo && matchStatus;
    });
    
    if (itensFiltrados.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:20px; color:#999;">Nenhum veículo encontrado.</div>';
        return;
    }

    // Determine card class based on status
    function getCardStatusClass(status) {
        if (status === 'REALIZADO') return 'status-realizado';
        if (status === 'DISPENSADO' || status === 'PULAR_LAVAGEM') return 'status-dispensado';
        return 'status-pendente';
    }

    // Otimização: constrói uma string HTML e a insere de uma só vez, o que é muito mais rápido.
    const cardsHtml = itensFiltrados.map(item => {
        const isRealizado = item.status === 'REALIZADO';
        // Adicionado verificação se tipo_lavagem existe
        let infoExtra = isRealizado && item.tipo_lavagem ? `<br><small>Lavagem: ${item.tipo_lavagem}</small>` : '';
        const cardClass = getCardStatusClass(item.status);
        const bloquearLocalizacao = localizacaoBloqueadaMobile();
        const localizacaoAttrs = bloquearLocalizacao
            ? 'disabled aria-disabled="true" title="Localizacao bloqueada para seu nivel"'
            : 'title="Localizar placa"';
        
        return `
            <div class="card ${cardClass}" data-item-id="${item.id}">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div style="min-width:0; padding-right:10px;">
                        <h4>${item.placa}</h4>
                        <p>${item.modelo || 'Modelo não inf.'}${infoExtra}</p>
                    </div>
                    <div class="card-acoes-lavagem">
                        <span class="status">${normalizarStatusLavagem(item.status)}</span>
                        <button
                            type="button"
                            class="btn-localizar-veiculo-lavagem ${bloquearLocalizacao ? 'localizacao-bloqueada' : ''}"
                            data-placa="${item.placa}"
                            ${localizacaoAttrs}
                            aria-label="${bloquearLocalizacao ? 'Localizacao bloqueada' : 'Localizar placa'} ${item.placa}"
                            onclick="return window.abrirLocalizacaoLavagem(event, this.dataset.placa)">
                            <i class="fas fa-location-dot"></i>
                        </button>
                        ${isRealizado ? '<br><i class="fas fa-check-circle" style="color:green; margin-top:5px;"></i>' : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = cardsHtml;
}

function placaSemMascara(valor) {
    return String(valor || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function abrirModalLocalizacaoLavagemCarregando(placa) {
    const modal = document.getElementById('modalLocalizacaoLavagem');
    const titulo = document.getElementById('modalLocalizacaoLavagemTitulo');
    const status = document.getElementById('statusLocalizacaoLavagem');
    const iframe = document.getElementById('iframeLocalizacaoLavagem');
    const link = document.getElementById('linkAbrirLocalizacaoLavagemMaps');

    if (titulo) titulo.textContent = `Localizar ${placa}`;
    if (status) {
        status.className = 'localizacao-status-mobile';
        status.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Consultando localizacao...';
    }
    if (iframe) {
        iframe.src = 'about:blank';
        iframe.classList.add('hidden');
    }
    if (link) {
        link.href = '#';
        link.classList.add('hidden');
    }

    if (modal) {
        modal.style.display = 'flex';
        modal.classList.remove('hidden');
    }
}

async function abrirModalLocalizacaoLavagem(placaOriginal) {
    const placa = placaSemMascara(placaOriginal);
    const status = document.getElementById('statusLocalizacaoLavagem');
    const iframe = document.getElementById('iframeLocalizacaoLavagem');
    const link = document.getElementById('linkAbrirLocalizacaoLavagemMaps');

    if (placa.length !== 7) {
        alert('Placa invalida para localizacao.');
        return;
    }

    abrirModalLocalizacaoLavagemCarregando(placa);

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

        if (iframe) {
            iframe.src = urlEmbed;
            iframe.classList.remove('hidden');
        }
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

window.abrirLocalizacaoLavagem = async function(event, placa) {
    event?.preventDefault();
    event?.stopPropagation();
    event?.stopImmediatePropagation?.();
    if (event?.currentTarget?.disabled || localizacaoBloqueadaMobile()) return false;
    await abrirModalLocalizacaoLavagem(placa);
    return false;
};

let itemSelecionadoParaAcao = null;

function abrirModalAcao(item) {
    itemSelecionadoParaAcao = item;
    document.getElementById('modalPlacaVeiculo').textContent = item.placa;
    document.getElementById('modalModeloVeiculo').textContent = item.modelo || '';
    
    const tipos = ['PADRÃO MARQUESPAN', 'HIGIENIZAÇÃO CABINE', 'CONDENSADORA-TK', 'LAVAGEM MOTOR', 'LAVAGEM CHASSI MANUT.'];
    const container = document.getElementById('radioGroupTipos');
    container.innerHTML = '';

    // Botão Limpar Seleção
    const btnLimpar = document.createElement('button');
    btnLimpar.type = 'button';
    btnLimpar.innerHTML = '<i class="fas fa-eraser"></i> Limpar Seleção';
    btnLimpar.style.cssText = 'width: 100%; padding: 10px; margin-bottom: 10px; background: #f8f9fa; border: 1px solid #ddd; border-radius: 8px; cursor: pointer; color: #666; font-weight: 600;';
    btnLimpar.onclick = () => {
        container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.checked = false;
            cb.closest('.radio-option').classList.remove('selected');
        });
    };
    container.appendChild(btnLimpar);

    // Parse tipos existentes (separados por vírgula)
    const currentTypes = item.tipo_lavagem ? item.tipo_lavagem.split(',').map(t => t.trim()) : [];

    tipos.forEach(tipo => {
        const label = document.createElement('label');
        label.className = 'radio-option';
        const isChecked = currentTypes.includes(tipo);
        if (isChecked) label.classList.add('selected');
        
        label.innerHTML = `
            <input type="checkbox" name="tipoLavagem" value="${tipo}" ${isChecked ? 'checked' : ''}>
            ${tipo}
        `;
        
        // Highlight visual ao mudar
        label.addEventListener('change', (e) => {
            const checkbox = e.currentTarget.querySelector('input');
            if (checkbox.checked) {
                e.currentTarget.classList.add('selected');
            } else {
                e.currentTarget.classList.remove('selected');
            }
        });

        container.appendChild(label);
    });

    document.getElementById('modalAcaoMobile').classList.remove('hidden');
}

async function salvarLavagem() {
    if (!itemSelecionadoParaAcao) return;

    const checkboxes = document.querySelectorAll('input[name="tipoLavagem"]:checked');
    if (checkboxes.length === 0) {
        alert('Selecione pelo menos um tipo de lavagem.');
        return;
    }

    const tipoLavagem = Array.from(checkboxes).map(cb => cb.value).join(', ');
    const usuario = JSON.parse(localStorage.getItem('usuarioLogado')).nome;
    const btn = document.getElementById('btnSalvarLavagem');
    
    btn.disabled = true;
    btn.innerHTML = 'Salvando...';

    try {
        const { error } = await supabaseClient
            .from('lavagem_itens')
            .update({
                status: 'REALIZADO',
                tipo_lavagem: tipoLavagem,
                data_realizado: new Date().toISOString(),
                usuario_realizou: usuario
            })
            .eq('id', itemSelecionadoParaAcao.id);

        if (error) throw error;

        const index = currentItems.findIndex(i => i.id === itemSelecionadoParaAcao.id);
        if (index > -1) {
            currentItems[index].status = 'REALIZADO';
            currentItems[index].tipo_lavagem = tipoLavagem;
        }

        fecharModal();
        renderizarItens();
        atualizarContadores();

    } catch (error) {
        console.error(error);
        alert('Erro ao salvar: ' + error.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-check"></i> Confirmar Lavagem';
    }
}

function fecharModal() {
    document.getElementById('modalAcaoMobile').classList.add('hidden');
    itemSelecionadoParaAcao = null;
}

function fecharModalLocalizacaoLavagem() {
    const modal = document.getElementById('modalLocalizacaoLavagem');
    const iframe = document.getElementById('iframeLocalizacaoLavagem');
    if (iframe) iframe.src = 'about:blank';
    if (modal) {
        modal.style.display = 'none';
        modal.classList.add('hidden');
    }
}

function showScreenListas() {
    document.getElementById('screenItens').classList.add('hidden');
    document.getElementById('screenListas').classList.remove('hidden');
    carregarListasAbertas();
}
