import { supabase } from './supabase.js';

document.addEventListener("DOMContentLoaded", async () => {
  const form = document.getElementById("formPneu");
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");

  const selectMarca = document.getElementById("marca");
  const btnAdicionarMarca = document.getElementById("btn-adicionar-marca");
  const btnExcluirMarca = document.getElementById("btn-excluir-marca");

  // Marcas pré-cadastradas
  let marcas = ["BRIDGESTONE", "CONTINENTAL", "GOODYEAR", "MICHELIN", "PIRELLI"];

  // Função para atualizar opções do select
  function atualizarOpcoesMarcas() {
    selectMarca.innerHTML = '<option value="">Selecione ou adicione</option>';
    marcas.forEach((marca) => {
      const option = document.createElement("option");
      option.value = marca;
      option.textContent = marca;
      selectMarca.appendChild(option);
    });
  }

  atualizarOpcoesMarcas();

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
    const tamanho = form.tamanho.value.trim();
    const tipo = form.tipo.value.trim();
    const quantidade = parseInt(form.quantidade.value);

    if (!marca || !modelo || !tamanho || !tipo) {
      alert("Por favor, preencha os campos obrigatórios: Marca, Modelo, Tamanho e Tipo.");
      return;
    }

    const pneu = {
      marca,
      modelo,
      tamanho,
      tipo,
      quantidade,
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
