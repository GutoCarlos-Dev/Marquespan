import { supabaseClient } from '../supabase.js';
import { formatarMoedaInput, statusExigeOficina, statusExigeValor } from './checklist.js';

const STATIC_ITEMS = [
    'ACESSORIOS',
    'ALINHAMENTO / BALANCEAMENTO',
    'AR-CONDICIONADO',
    'BORRACHARIA',
    'ELETRICA / MECANICA - INTERNA',
    'MECANICA - EXTERNA',
    'MOLEIRO',
    'TACOGRAFO',
    'TAPEÇARIA',
    'THERMO KING',
    'VIDROS / FECHADURAS',
    'SERVIÇOS_GERAIS',
    'CONCESSIONARIA',
    'ANKA',
    'TARRAXA',
    'USIMAC',
    'LUCAS BAU',
    'IBIFURGO',
    'IBIPORAN'
];

function agruparOficinasPorItem(oficinas) {
    const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado'));
    const filialUsuario = usuarioLogado ? usuarioLogado.filial : null;
    const oficinasPorItem = {};

    if (!oficinas) return oficinasPorItem;

    const oficinasFiltradas = filialUsuario
        ? oficinas.filter(of => !of.filial || of.filial === filialUsuario)
        : oficinas;

    oficinasFiltradas.forEach(oficina => {
        const key = oficina.item_verificador_id;
        if (!oficinasPorItem[key]) oficinasPorItem[key] = [];
        oficinasPorItem[key].push(oficina);
    });

    return oficinasPorItem;
}

function montarOptionsOficina(oficinasDoItem) {
    let oficinaOptions = '<option value="">Selecione a Oficina</option>';
    oficinasDoItem.forEach(of => {
        oficinaOptions += `<option value="${of.id}">${of.nome}</option>`;
    });
    return oficinaOptions;
}

function criarCampoExtraEletrica(statusSelect, wrapper) {
    const extraDiv = document.createElement('div');
    extraDiv.id = 'extra-eletrica-interna';
    extraDiv.className = 'checklist-extra hidden';
    extraDiv.style.cssText = 'margin-top: -10px; padding: 15px; background-color: #e8f4fd; border: 1px solid #b8daff; border-radius: 0 0 8px 8px; border-top: none;';
    extraDiv.innerHTML = `
        <label style="font-weight: bold; color: #0056b3; display: block; margin-bottom: 5px;"><i class="fas fa-cogs"></i> Peças Usadas (Mecanica/Elétrica):</label>
        <input type="text" class="checklist-pecas" placeholder="Informe as peças utilizadas..." style="width: 100%; padding: 8px; border: 1px solid #99caff; border-radius: 4px;" oninput="this.value = this.value.toUpperCase()">
    `;
    wrapper.appendChild(extraDiv);

    statusSelect.addEventListener('change', (e) => {
        if (e.target.value === 'FINALIZADO') {
            extraDiv.classList.remove('hidden');
        } else {
            extraDiv.classList.add('hidden');
            extraDiv.querySelector('input').value = '';
        }
    });
}

function criarChecklistItem(item, oficinasPorItem, callbacks) {
    const wrapper = document.createElement('div');
    wrapper.className = 'checklist-row-wrapper';

    const div = document.createElement('div');
    div.className = 'checklist-item';
    div.dataset.item = item.descricao;
    div.dataset.itemId = item.id;

    const oficinasDoItem = oficinasPorItem[item.id] || oficinasPorItem[item.descricao] || [];
    div.innerHTML = `
        <label class="checklist-label">${item.descricao}</label>
        <input type="text" class="checklist-details" placeholder="Detalhes...">
        <select class="checklist-status">
            <option value="" selected>-</option>
            <option value="PENDENTE">PENDENTE</option>
            <option value="FINALIZADO">FINALIZADO</option>
            <option value="INTERNADO">INTERNADO</option>
            <option value="CHECK-IN OFICINA">CHECK-IN OFICINA</option>
            <option value="CHECK-IN ROTA">CHECK-IN ROTA</option>
            <option value="FINALIZADO ROTA">FINALIZADO ROTA</option>
        </select>
        <div class="oficina-selector-wrapper" style="display: none; margin-top: 5px;">
            <select class="oficina-selector" style="width: 100%; padding: 5px; border: 1px solid #ccc; border-radius: 4px; background-color: #f0f8ff;">
                ${montarOptionsOficina(oficinasDoItem)}
            </select>
        </div>
        <div class="valor-wrapper" style="display: none; margin-top: 5px;">
            <input type="text" class="checklist-valor" placeholder="R$ 0,00" value="R$ 0,00" style="width: 100%; padding: 5px; border: 1px solid #28a745; border-radius: 4px; color: #155724; font-weight: bold;">
        </div>
    `;
    wrapper.appendChild(div);

    const statusSelect = div.querySelector('.checklist-status');
    const oficinaWrapper = div.querySelector('.oficina-selector-wrapper');
    const oficinaSelect = div.querySelector('.oficina-selector');
    const valorWrapper = div.querySelector('.valor-wrapper');
    const valorInput = div.querySelector('.checklist-valor');

    statusSelect.addEventListener('change', (e) => {
        oficinaWrapper.style.display = 'none';
        oficinaSelect.required = false;

        const val = e.target.value;
        if (statusExigeOficina(val)) {
            oficinaWrapper.style.display = 'block';
            if (oficinasDoItem.length > 0) {
                oficinaSelect.required = true;
            }
        } else {
            oficinaSelect.value = '';
        }

        if (statusExigeValor(val)) {
            valorWrapper.style.display = 'block';
        } else {
            valorWrapper.style.display = 'none';
            valorInput.value = 'R$ 0,00';
        }

        callbacks.onCalcularValorTotal();
        callbacks.onUpdateStatusColor(e.target);
    });

    valorInput.addEventListener('input', (e) => {
        e.target.value = formatarMoedaInput(e.target.value);
        callbacks.onCalcularValorTotal();
    });

    if (item.descricao === 'ELETRICA INTERNA' || item.descricao === 'ELETRICA / MECANICA - INTERNA') {
        criarCampoExtraEletrica(statusSelect, wrapper);
    }

    return wrapper;
}

export async function carregarChecklistDinamico({ callbacks }) {
    const container = document.getElementById('checklistContainer') || document.querySelector('.checklist-container');
    if (!container) return;

    try {
        let { data: itens, error: errorItens } = await supabaseClient
            .from('itens_verificacao')
            .select('*')
            .order('descricao');

        if (errorItens || !itens || itens.length === 0) {
            console.warn('Usando lista estatica de checklist (Tabela nao encontrada ou vazia).', errorItens);
            itens = STATIC_ITEMS.map((desc, index) => ({ id: `static-${index}`, descricao: desc }));
        }

        const { data: oficinas } = await supabaseClient
            .from('oficinas')
            .select('id, nome, filial, item_verificador_id');

        const oficinasPorItem = agruparOficinasPorItem(oficinas);
        container.innerHTML = '';

        const fragment = document.createDocumentFragment();
        itens.forEach(item => {
            fragment.appendChild(criarChecklistItem(item, oficinasPorItem, callbacks));
        });
        container.appendChild(fragment);

        callbacks.onAplicarRestricoes();
    } catch (err) {
        console.error('Erro critico no script do checklist:', err);
    }
}

