export function criarLinhaDistribuicaoTanque({ tanquesDisponiveis, tanqueId = '', qtd = '' }) {
    const row = document.createElement('div');
    row.className = 'distribuicao-row';

    const select = document.createElement('select');
    select.className = 'tanque-select glass-input';
    select.innerHTML = '<option value="">-- Selecione um Tanque --</option>';
    tanquesDisponiveis.forEach(tanque => {
        const option = new Option(`${tanque.nome} (${tanque.tipo_combustivel})`, tanque.id);
        select.add(option);
    });
    select.value = tanqueId;

    const inputQtd = document.createElement('input');
    inputQtd.type = 'number';
    inputQtd.className = 'tanque-qtd glass-input';
    inputQtd.placeholder = 'Litros';
    inputQtd.step = '0.01';
    inputQtd.min = '0.01';
    inputQtd.value = qtd;

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn-remove-tanque';
    removeBtn.innerHTML = '<i class="fas fa-trash"></i>';
    removeBtn.title = 'Remover linha';

    row.appendChild(select);
    row.appendChild(inputQtd);
    row.appendChild(removeBtn);

    return row;
}
