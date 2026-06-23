export const STATUS_COM_OFICINA = [
    'CHECK-IN OFICINA',
    'CHECK-IN ROTA',
    'FINALIZADO',
    'FINALIZADO AGUARDANDO O.S',
    'FINALIZADO ROTA',
    'INTERNADO'
];

export const STATUS_COM_VALOR = [
    'FINALIZADO',
    'FINALIZADO ROTA'
];

export function statusExigeOficina(status) {
    return STATUS_COM_OFICINA.includes(status);
}

export function statusExigeValor(status) {
    return STATUS_COM_VALOR.includes(status);
}

export function formatarMoedaInput(valor) {
    let value = String(valor || '').replace(/\D/g, '');
    value = (parseInt(value) / 100).toFixed(2) + '';
    value = value.replace('.', ',');
    value = value.replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1.');
    return 'R$ ' + value;
}

export function calcularValorTotalChecklist(root = document) {
    let total = 0;
    const valorInputs = root.querySelectorAll('.checklist-valor');

    valorInputs.forEach(input => {
        if (input.closest('.valor-wrapper').style.display !== 'none') {
            const valStr = input.value.replace('R$', '').replace(/\./g, '').replace(',', '.').trim();
            total += parseFloat(valStr) || 0;
        }
    });

    return total;
}

export function resetarChecklistModal(modal, updateStatusColor) {
    const checklistItems = modal.querySelectorAll('.checklist-item');

    checklistItems.forEach(div => {
        const detailsInput = div.querySelector('.checklist-details');
        if (detailsInput) detailsInput.value = '';

        const statusSelect = div.querySelector('.checklist-status');
        if (statusSelect) {
            statusSelect.value = '';
            updateStatusColor(statusSelect);
        }

        const oficinaWrapper = div.querySelector('.oficina-selector-wrapper');
        const oficinaSelect = div.querySelector('.oficina-selector');
        if (oficinaWrapper) oficinaWrapper.style.display = 'none';
        if (oficinaSelect) {
            oficinaSelect.value = '';
            oficinaSelect.required = false;
        }

        const valorWrapper = div.querySelector('.valor-wrapper');
        const valorInput = div.querySelector('.checklist-valor');
        if (valorWrapper) valorWrapper.style.display = 'none';
        if (valorInput) valorInput.value = 'R$ 0,00';
    });

    const extraField = document.getElementById('extra-eletrica-interna');
    if (extraField) {
        extraField.classList.add('hidden');
        const extraInput = extraField.querySelector('input');
        if (extraInput) extraInput.value = '';
    }
}

