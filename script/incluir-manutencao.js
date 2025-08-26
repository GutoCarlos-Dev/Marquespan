// 📦 Importações
import { supabase } from './script/supabase.js';

// 1️⃣ Alternância de abas principais (se ainda usadas)
export function mostrarAba(id) {
  document.querySelectorAll('.aba-conteudo').forEach(sec => sec.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');

  document.querySelectorAll('.aba-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelector(`.aba-btn[data-aba="${id}"]`).classList.add('active');
}

// 2️⃣ Alternância de painéis internos (Cadastro, Itens, Upload)
export function mostrarPainelInterno(id) {
  document.querySelectorAll('.painel-conteudo').forEach(div => div.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');

  document.querySelectorAll('.painel-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelector(`.painel-btn[data-painel="${id}"]`).classList.add('active');
}

// 3️⃣ Preencher campo de usuário logado
export function preencherUsuarioLogado() {
  const usuario = JSON.parse(localStorage.getItem('usuarioLogado'));
  if (usuario && usuario.nome) {
    document.getElementById('usuarioLogado').value = usuario.nome;
    document.getElementById('usuario-logado').textContent = `👤 Olá, ${usuario.nome}`;
  }
}

// 4️⃣ Buscar placas de veículos no Supabase
export async function carregarPlacas() {
  const { data, error } = await supabase.from('veiculos').select('placa');
  const select = document.getElementById('veiculo');
  if (data) {
    data.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v.placa;
      opt.textContent = v.placa;
      select.appendChild(opt);
    });
  }
}

// 5️⃣ Adicionar item à manutenção
export function adicionarItem() {
  const desc = document.getElementById('itemDescricao').value;
  const valor = parseFloat(document.getElementById('itemValor').value);
  if (!desc || isNaN(valor)) return;

  const linha = document.createElement('tr');
  linha.innerHTML = `
    <td>${desc}</td>
    <td>R$ ${valor.toFixed(2)}</td>
    <td><button class="btn-remover-item">🗑️</button></td>
  `;
  document.getElementById('tabelaItens').appendChild(linha);
  atualizarTotal();
}

export function atualizarTotal() {
  let total = 0;
  document.querySelectorAll('#tabelaItens tr').forEach(row => {
    const valor = parseFloat(row.children[1].textContent.replace('R$', '').trim());
    total += valor;
  });
  document.getElementById('totalItens').textContent = total.toFixed(2);
}

// 6️⃣ Upload de arquivos PDF
export function adicionarArquivo() {
  const input = document.getElementById('arquivoPDF');
  if (!input.files.length) return;

  const file = input.files[0];
  const linha = document.createElement('tr');
  linha.innerHTML = `
    <td>${file.name}</td>
    <td><button class="btn-remover-arquivo">🗑️</button></td>
  `;
  document.getElementById('tabelaArquivos').appendChild(linha);
  input.value = '';
}

// 7️⃣ Inicialização da página
document.addEventListener('DOMContentLoaded', () => {
  preencherUsuarioLogado();
  carregarPlacas();
  mostrarPainelInterno('cadastroInterno'); // inicia com Cadastro ativo

  // Alternância de painéis internos
  document.querySelectorAll('.painel-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      mostrarPainelInterno(btn.dataset.painel);
    });
  });

  // Adicionar item
  document.getElementById('formItem').addEventListener('submit', e => {
    e.preventDefault();
    adicionarItem();
  });

  // Remover item
  document.getElementById('tabelaItens').addEventListener('click', e => {
    if (e.target.classList.contains('btn-remover-item')) {
      e.target.closest('tr').remove();
      atualizarTotal();
    }
  });

  // Adicionar arquivo
  document.getElementById('formUpload').addEventListener('submit', e => {
    e.preventDefault();
    adicionarArquivo();
  });

  // Remover arquivo
  document.getElementById('tabelaArquivos').addEventListener('click', e => {
    if (e.target.classList.contains('btn-remover-arquivo')) {
      e.target.closest('tr').remove();
    }
  });
});
