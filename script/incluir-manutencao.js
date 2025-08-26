
// 1. Alternância de abas
export function mostrarAba(id) {
  document.querySelectorAll('.aba-conteudo').forEach(sec => sec.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');

  document.querySelectorAll('.aba-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelector(`.aba-btn[onclick="mostrarAba('${id}')"]`).classList.add('active');
}

//2. Preencher campo de usuário logado
export function preencherUsuarioLogado() {
  const usuario = JSON.parse(localStorage.getItem('usuarioLogado'));
  if (usuario && usuario.nome) {
    document.getElementById('usuarioLogado').value = usuario.nome;
    document.getElementById('usuario-logado').textContent = `👤 Olá, ${usuario.nome}`;
  }
}

//3. Buscar placas de veículos no Supabase
import { supabase } from './script/supabase.js';

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

//4. Adicionar item à manutenção
export function adicionarItem() {
  const desc = document.getElementById('itemDescricao').value;
  const valor = parseFloat(document.getElementById('itemValor').value);
  if (!desc || isNaN(valor)) return;

  const linha = document.createElement('tr');
  linha.innerHTML = `
    <td>${desc}</td>
    <td>R$ ${valor.toFixed(2)}</td>
    <td><button onclick="this.parentElement.parentElement.remove(); atualizarTotal()">🗑️</button></td>
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

//5. Upload de arquivos PDF
export function adicionarArquivo() {
  const input = document.getElementById('arquivoPDF');
  if (!input.files.length) return;

  const file = input.files[0];
  const linha = document.createElement('tr');
  linha.innerHTML = `
    <td>${file.name}</td>
    <td><button onclick="this.parentElement.parentElement.remove()">🗑️</button></td>
  `;
  document.getElementById('tabelaArquivos').appendChild(linha);
  input.value = '';
}

//6. Inicialização da página
import {
  mostrarAba,
  preencherUsuarioLogado,
  carregarPlacas,
  adicionarItem,
  atualizarTotal,
  adicionarArquivo
} from './incluir-manutencao.js';

document.addEventListener('DOMContentLoaded', () => {
  preencherUsuarioLogado();
  carregarPlacas();
  mostrarAba('cadastro'); // inicia na aba Cadastro

  // Torna funções acessíveis globalmente
  window.mostrarAba = mostrarAba;
  window.adicionarItem = adicionarItem;
  window.atualizarTotal = atualizarTotal;
  window.adicionarArquivo = adicionarArquivo;
});
