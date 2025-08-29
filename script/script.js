<<<<<<< HEAD
// script.js — funções utilitárias globais

export function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (sidebar) {
    sidebar.classList.toggle('collapsed');
  }
}

export function exibirUsuarioLogado() {
  const nomeUsuario = localStorage.getItem('usuarioLogado');
  const divUsuario = document.getElementById('usuario-logado');
  if (nomeUsuario && divUsuario) {
    divUsuario.textContent = `👤 Olá, ${nomeUsuario}`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  exibirUsuarioLogado();
});

function abrirModal() {
  document.getElementById("modalVeiculo").style.display = "flex";
}

function fecharModal() {
  document.getElementById("modalVeiculo").style.display = "none";
}
=======
// script.js — funções utilitárias globais

export function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (sidebar) {
    sidebar.classList.toggle('collapsed');
  }
}

export function exibirUsuarioLogado() {
  const nomeUsuario = localStorage.getItem('usuarioLogado');
  const divUsuario = document.getElementById('usuario-logado');
  if (nomeUsuario && divUsuario) {
    divUsuario.textContent = `👤 Olá, ${nomeUsuario}`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  exibirUsuarioLogado();
});

function abrirModal() {
  document.getElementById("modalVeiculo").style.display = "flex";
}

function fecharModal() {
  document.getElementById("modalVeiculo").style.display = "none";
}
>>>>>>> 10558e27b8270be434cb5b3e3a21a0e039cc7ab9
