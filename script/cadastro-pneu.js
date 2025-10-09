import { supabase } from './supabase.js';

document.addEventListener("DOMContentLoaded", async () => {
  const form = document.getElementById("formPneu");
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");

  const selectMarca = document.getElementById("marca");
  const btnAdicionarMarca = document.getElementById("btn-adicionar-marca");
  const btnExcluirMarca = document.getElementById("btn-excluir-marca");

  const selectModelo = document.getElementById("modelo");
  const btnAdicionarModelo = document.getElementById("btn-adicionar-modelo");
  const btnExcluirModelo = document.getElementById("btn-excluir-modelo");

  const selectTipo = document.getElementById("tipo");
  const btnAdicionarTipo = document.getElementById("btn-adicionar-tipo");
  const btnExcluirTipo = document.getElementById("btn-excluir-tipo");

  // Marcas pré-cadastradas
  let marcas = ["BRIDGESTONE", "CONTINENTAL", "GOODYEAR", "MICHELIN", "PIRELLI"];

  // Modelos pré-cadastrados
  let modelos = ["225/75/16", "235/75/17.5", "275/80/22.5 - LISO", "275/80/22.5 - BORRACHUDO", "295/80/22.5 - LISO", "295/80/22.5 - BORRACHUDO"];

  // Tipos pré-cadastrados
  let tipos = ["NOVO", "RECAPADO"];

  // Função para atualizar opções do select de marcas
  function atualizarOpcoesMarcas() {
    selectMarca.innerHTML = '<option value="">Selecione ou adicione</option>';
    marcas.forEach((marca) => {
      const option = document.createElement("option");
      option.value = marca;
      option.textContent = marca;
      selectMarca.appendChild(option);
    });
  }

  // Função para atualizar opções do select de modelos
  function atualizarOpcoesModelos() {
    selectModelo.innerHTML = '<option value="">Selecione ou adicione</option>';
    modelos.forEach((modelo) => {
      const option = document.createElement("option");
      option.value = modelo;
      option.textContent = modelo;
      selectModelo.appendChild(option);
    });
  }

  // Função para atualizar opções do select de tipos
  function atualizarOpcoesTipos() {
    selectTipo.innerHTML = '<option value="">Selecione ou adicione</option>';
    tipos.forEach((tipo) => {
      const option = document.createElement("option");
      option.value = tipo;
      option.textContent = tipo;
      selectTipo.appendChild(option);
    });
  }

  atualizarOpcoesMarcas();
  atualizarOpcoesModelos();
  atualizarOpcoesTipos();

  // Adicionar nova marca
  btnAdicionarMarca.addEventListener("click", () => {
    const novaMarca = prompt("Digite o nome da nova marca:").toUpperCase().trim();
    if (novaMarca && !marcas.includes(novaMarca)) {
      marcas.push(novaMarca);
      atualizarOpcoesMarcas();
      selectMarca.value = novaMarca;
    } else if (marcas.includes(novaMarca)) {
      alert("Marca já existe na lista.");
    }
  });

  // Excluir marca selecionada
  btnExcluirMarca.addEventListener("click", () => {
    const marcaSelecionada = selectMarca.value;
    if (!marcaSelecionada) {
      alert("Selecione uma marca para excluir.");
      return;
    }
    const confirmar = confirm(`Tem certeza que deseja excluir a marca "${marcaSelecionada}"?`);
    if (confirmar) {
      marcas = marcas.filter((m) => m !== marcaSelecionada);
      atualizarOpcoesMarcas();
    }
  });

  // Adicionar novo modelo
  btnAdicionarModelo.addEventListener("click", () => {
    const novoModelo = prompt("Digite o nome do novo modelo:").trim();
    if (novoModelo && !modelos.includes(novoModelo)) {
      modelos.push(novoModelo);
      atualizarOpcoesModelos();
      selectModelo.value = novoModelo;
    } else if (modelos.includes(novoModelo)) {
      alert("Modelo já existe na lista.");
    }
  });

  // Excluir modelo selecionado
  btnExcluirModelo.addEventListener("click", () => {
    const modeloSelecionado = selectModelo.value;
    if (!modeloSelecionado) {
      alert("Selecione um modelo para excluir.");
      return;
    }
    const confirmar = confirm(`Tem certeza que deseja excluir o modelo "${modeloSelecionado}"?`);
    if (confirmar) {
      modelos = modelos.filter((m) => m !== modeloSelecionado);
      atualizarOpcoesModelos();
    }
  });

  // Adicionar novo tipo
  btnAdicionarTipo.addEventListener("click", () => {
    const novoTipo = prompt("Digite o nome do novo tipo:").toUpperCase().trim();
    if (novoTipo && !tipos.includes(novoTipo)) {
      tipos.push(novoTipo);
      atualizarOpcoesTipos();
      selectTipo.value = novoTipo;
    } else if (tipos.includes(novoTipo)) {
      alert("Tipo já existe na lista.");
    }
  });

  // Excluir tipo selecionado
  btnExcluirTipo.addEventListener("click", () => {
    const tipoSelecionado = selectTipo.value;
    if (!tipoSelecionado) {
      alert("Selecione um tipo para excluir.");
      return;
    }
    const confirmar = confirm(`Tem certeza que deseja excluir o tipo "${tipoSelecionado}"?`);
    if (confirmar) {
      tipos = tipos.filter((t) => t !== tipoSelecionado);
      atualizarOpcoesTipos();
    }
  });

  // 🔍 Preenche os campos se estiver em modo de edição
  if (id) {
    const { data: pneu, error } = await supabase
      .from("pneus")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !pneu) {
      alert("Erro ao carregar dados do pneu.");
      return;
    }

    Object.keys(pneu).forEach((campo) => {
      const input = document.getElementById(campo);
      if (input && pneu[campo] !== null) {
        input.value = pneu[campo];
      }
    });
  }

  // 💾 Submeter dados
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const marca = form.marca.value.trim();
    const modelo = form.modelo.value.trim();
    // const tamanho = form.tamanho.value.trim(); // campo removido conforme solicitação
    const tipo = form.tipo.value.trim();
    // const quantidade = parseInt(form.quantidade.value); // campo removido conforme solicitação

    if (!marca || !modelo || !tipo) {
      alert("Por favor, preencha os campos obrigatórios: Marca, Modelo e Tipo.");
      return;
    }

    const pneu = {
      marca,
      modelo,
      tipo,
    };

    try {
      if (id) {
        const { data, error } = await supabase
          .from("pneus")
          .update(pneu)
          .eq("id", id);

        if (error) {
          alert("Erro ao atualizar o pneu.");
          return;
        }

        alert("Pneu atualizado com sucesso!");
        form.reset();
        window.close();
      } else {
        const { data, error } = await supabase
          .from("pneus")
          .insert([pneu]);

        if (error) {
          alert("Erro ao salvar o pneu. Tente novamente.");
          return;
        }

        alert("Pneu cadastrado com sucesso!");
        form.reset();
        window.close();
      }
    } catch (err) {
      alert("Erro inesperado. Verifique sua conexão.");
    }
  });
});
