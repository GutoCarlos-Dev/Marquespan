import { supabaseClient } from '../supabase.js';

function criarLabelCheckbox(classe, value, text) {
    const label = document.createElement('label');
    label.style.cssText = 'display: block; padding: 8px 12px; cursor: pointer; border-bottom: 1px solid #f0f0f0; transition: background 0.2s;';
    label.innerHTML = `<input type="checkbox" class="${classe}" value="${value}" style="margin-right: 8px;"> ${text}`;
    return label;
}

function limparLabels(container) {
    const labels = container.querySelectorAll('label');
    labels.forEach(label => label.remove());
}

function popularSelect(select, placeholder, rows, getText, getValue = getText) {
    if (!select) return;
    select.innerHTML = `<option value="">${placeholder}</option>`;
    rows.forEach(row => {
        const text = getText(row);
        if (text) select.add(new Option(text, getValue(row)));
    });
}

function popularCheckboxes(container, rows, classe, getText, getValue = getText) {
    if (!container) return;
    limparLabels(container);
    rows.forEach(row => {
        const text = getText(row);
        if (text) container.appendChild(criarLabelCheckbox(classe, getValue(row), text));
    });
}

export async function carregarFiltrosDinamicosRelatorio(elements) {
    const oficinasMap = {};

    try {
        const { data: itens, error: errItens } = await supabaseClient
            .from('itens_verificacao')
            .select('descricao')
            .order('descricao');

        if (errItens) {
            console.error('Erro ao carregar itens para filtro:', errItens);
        } else if (itens && itens.length > 0) {
            popularSelect(elements.searchItemInput, 'Todos', itens, i => i.descricao);
            popularCheckboxes(elements.filtroItemOptions, itens, 'filtro-item-checkbox', i => i.descricao);
        }

        const { data: oficinas, error: errOficinas } = await supabaseClient
            .from('oficinas')
            .select('id, nome, filial')
            .order('nome');

        if (errOficinas) {
            console.error('Erro ao carregar oficinas para filtro:', errOficinas);
        } else {
            const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado'));
            const filialUsuario = usuarioLogado ? usuarioLogado.filial : null;
            const oficinasFiltradas = filialUsuario && oficinas
                ? oficinas.filter(o => !o.filial || o.filial === filialUsuario)
                : (oficinas || []);

            oficinasFiltradas.forEach(o => {
                oficinasMap[o.nome] = o.id;
            });

            if (oficinasFiltradas.length > 0) {
                popularSelect(elements.searchOficinaInput, 'Todas', oficinasFiltradas, o => o.nome);
                popularCheckboxes(elements.filtroOficinaOptions, oficinasFiltradas, 'filtro-oficina-checkbox', o => o.nome);
            }
        }
    } catch (e) {
        console.error('Erro critico ao carregar filtros dinamicos:', e);
    }

    return oficinasMap;
}

export function setupMultiselect({ display, options, text, checkboxClass, emptyText, selectedText }) {
    if (!display || !options || !text) return;

    display.addEventListener('click', (e) => {
        e.stopPropagation();
        options.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
        if (!options.classList.contains('hidden') && !display.contains(e.target) && !options.contains(e.target)) {
            options.classList.add('hidden');
        }
    });

    options.addEventListener('change', (e) => {
        if (e.target.classList.contains(checkboxClass)) {
            const selected = Array.from(options.querySelectorAll(`.${checkboxClass}`)).filter(c => c.checked);
            text.textContent = selected.length > 0 ? selectedText(selected.length) : emptyText;
        }
    });
}

export function limparSelecaoMultiselect(options, text, checkboxClass, emptyText) {
    if (!options || !text) return;
    options.querySelectorAll(`.${checkboxClass}`).forEach(cb => {
        cb.checked = false;
    });
    text.textContent = emptyText;
}

