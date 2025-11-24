import { supabase } from './supabase.js';

// Compras.js - Versão refatorada mantendo funcionalidades principais
// Estrutura: Services (Supabase), UI, Cart, TESTE

class SupabaseService {
  static async list(table, cols='*', opts={}){
    let q = supabase.from(table).select(cols).order(opts.orderBy||'id',{ascending:!!opts.ascending});
    if(opts.eq) q = q.eq(opts.eq.field, opts.eq.value);
    if(opts.ilike) q = q.ilike(opts.ilike.field, opts.ilike.value);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  }

  static async insert(table, payload){
    const { data, error } = await supabase.from(table).insert(payload).select();
    if (error) throw error;
    return data;
  }

  static async update(table, payload, key){
    const { data, error } = await supabase.from(table).update(payload).eq(key.field, key.value).select();
    if (error) throw error;
    return data;
  }

  static async remove(table, key){
    const { data, error } = await supabase.from(table).delete().eq(key.field, key.value);
    if (error) throw error;
    return data;
  }
}

class Cart {
  constructor(){
    this.items = [];
    this.load();
  }

  add(item){
    if(this.items.some(i=>i.cod===item.cod)) return false; // Corrigido: &gt; para >
    this.items.push(item);
    this.save();
    return true;
  }

  remove(cod){
    this.items = this.items.filter(i=>i.cod!==cod); // Corrigido: &gt; para >
    this.save();
  }

  updateCartItemQuantity(cod, newQtd) {
    const item = this.items.find(i => i.cod === cod);
    if (item) {
      item.qtd = newQtd;
      this.save();
      return true;
    }
    return false;
  }

  clear(){
    this.items = [];
    this.save();
  }

  save(){
    localStorage.setItem('cotacaoCart', JSON.stringify(this.items));
  }

  load(){
    const saved = localStorage.getItem('cotacaoCart');
    if(saved) this.items = JSON.parse(saved);
  }
}

const UI = {
  init(){
    this.cache();
    this.bind();
    this.cart = new Cart();
    this.renderCompanies(3); // gera 3 cards
    this.populateProductDropdown();
    this.populateSupplierDropdowns();
    this.renderCart();
    this.generateNextQuotationCode();
    this.renderSavedQuotations();
    // sort state
    this._produtosSort = { field: 'nome', ascending: true };
    this._fornecedoresSort = { field: 'nome', ascending: true };
    this.renderProdutosGrid(); // carregar produtos no início
    this.renderFornecedoresGrid(); // carregar fornecedores no início
    this.editingQuotationId = null; // Controla o modo de edição
    this.setupUserAccess();
    // Close panels/modals on Escape
    document.addEventListener('keydown', (e)=>{ if(e.key === 'Escape'){ this.closeModal?.(); this.closeImportPanel?.(); this.closeDetailPanel?.(); } }); // Corrigido: &gt; para >
  },

  cache(){
    this.navLinks = document.querySelectorAll('#menu-compras button.painel-btn');
    this.sections = document.querySelectorAll('section.section');
    this.cartBody = document.getElementById('cartBody'); // Cache do corpo do carrinho
    this.cartProductInput = document.getElementById('cartProductInput'); // Novo input de produto
    this.cartQtd = document.getElementById('cartQtd');
    this.btnAddToCart = document.getElementById('btnAddToCart');
    this.btnClearCart = document.getElementById('btnClearCart');
    this.btnExportPdf = document.getElementById('btnExportPdf');
    this.btnRegistrarCotacoes = document.getElementById('btnRegistrarCotacoes');
    this.quotationCode = document.getElementById('quotationCode');
    this.orccardrow = document.getElementById('orccardrow');
    this.savedQuotationsTableBody = document.getElementById('savedQuotationsTableBody');
    this.searchQuotationInput = document.getElementById('searchQuotation');
    this.filterStatusSelect = document.getElementById('filterStatus');
    this.btnSearchQuotation = document.getElementById('btnSearchQuotation');
    this.formCadastrarProduto = document.getElementById('formCadastrarProduto');
    this.produtosTableBody = document.getElementById('produtosTableBody');
    this.formCadastrarFornecedor = document.getElementById('formCadastrarFornecedor');
    this.fornecedoresTableBody = document.getElementById('fornecedoresTableBody');
    this.importPanel = document.getElementById('importPanel');
    this.btnOpenImportExportModal = document.getElementById('btnOpenImportExportModal');
    this.closeModalButtons = document.querySelectorAll('.modal .close-button');
    this.btnImportProducts = document.getElementById('btnImportProducts');
    this.btnExportProducts = document.getElementById('btnExportProducts');
    this.importExcelFile = document.getElementById('importExcelFile');
    this.importPreview = document.getElementById('importPreview');
    this.importStatus = document.getElementById('importStatus');
    this.btnConfirmImport = document.getElementById('btnConfirmImport');
    this.detailPanelBackdrop = document.getElementById('detailPanelBackdrop');
    this.detailPanel = document.getElementById('detailPanel');
    this.quotationDetailTitle = document.getElementById('quotationDetailTitle');
    this.quotationDetailBody = document.getElementById('quotationDetailBody');
    this.btnPrintQuotation = document.getElementById('btnPrintQuotation');
    // Cache para o novo painel de recebimento
    this.recebimentoPanelBackdrop = document.getElementById('recebimentoPanelBackdrop');
    this.recebimentoPanel = document.getElementById('recebimentoPanel');
    this.btnSalvarRecebimento = document.getElementById('btnSalvarRecebimento');
    this.recebimentoItemsContainer = document.getElementById('recebimentoItems');
  },

  bind(){
    // Navigation
    this.navLinks.forEach(btn=>btn.addEventListener('click', e=>{ // Corrigido: &gt; para >
      e.preventDefault();
      this.navLinks.forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); }); // Corrigido: &gt; para >
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      this.showSection(btn.dataset.secao);
    }));

    this.btnAddToCart.addEventListener('click', ()=>this.handleAddToCart()); // Corrigido: &gt; para >
    this.btnClearCart.addEventListener('click', ()=>{ if(confirm('Limpar carrinho?')){this.cart.clear();this.renderCart()} }); // Corrigido: &gt; para >
    this.btnExportPdf.addEventListener('click', ()=>this.handleExportPdf()); // Corrigido: &gt; para >
    this.btnRegistrarCotacoes.addEventListener('click', ()=>this.handleRegisterQuotation()); // Corrigido: &gt; para >

    this.btnSearchQuotation?.addEventListener('click', ()=>this.renderSavedQuotations()); // Corrigido: &gt; para >
    this.filterStatusSelect?.addEventListener('change', ()=>this.renderSavedQuotations()); // Corrigido: &gt; para >

    this.produtosTableBody?.addEventListener('click', (e)=>this.handleProdutoTableClick(e)); // Corrigido: &gt; para >
    this.fornecedoresTableBody?.addEventListener('click', (e)=>this.handleFornecedorTableClick(e)); // Corrigido: &gt; para >

    this.btnOpenImportExportModal?.addEventListener('click', ()=>this.openImportPanel('produtos')); // Corrigido: &gt; para >
    // Import/Export for fornecedores
    const btnForImport = document.getElementById('btnOpenImportExportFornecedor');
    if(btnForImport) btnForImport.addEventListener('click', ()=>this.openImportPanel('fornecedores')); // Corrigido: &gt; para >
    this.closeModalButtons?.forEach(btn=>btn.addEventListener('click', ()=>this.closeModal())); // Corrigido: &gt; para >
    const panelCloseBtn = this.importPanel?.querySelector('.close-button');
    if(panelCloseBtn) panelCloseBtn.addEventListener('click', ()=>this.closeImportPanel()); // Corrigido: &gt; para >

    this.btnImportProducts?.addEventListener('click', ()=>this.handleImport()); // Corrigido: &gt; para >
    this.btnConfirmImport?.addEventListener('click', ()=>this.confirmImport()); // Corrigido: &gt; para >
    this.btnExportProducts?.addEventListener('click', ()=>this.handleExport()); // Corrigido: &gt; para >

    // Novo painel de detalhes
    this.detailPanel?.querySelector('.close-button').addEventListener('click', () => this.closeDetailPanel());
    this.detailPanelBackdrop?.addEventListener('click', e => { if (e.target === this.detailPanelBackdrop) this.closeDetailPanel() });

    // Novo painel de recebimento
    this.recebimentoPanel?.querySelector('.close-button').addEventListener('click', ()=>this.closeRecebimentoPanel());
    this.recebimentoPanelBackdrop?.addEventListener('click', e=>{ if(e.target===this.recebimentoPanelBackdrop) this.closeRecebimentoPanel() });

    // print and close buttons for quotation details
    this.btnPrintQuotation?.addEventListener('click', ()=>this.printQuotation()); // Corrigido: &gt; para >
    this.btnSalvarRecebimento?.addEventListener('click', ()=>this.salvarRecebimento());

    // product form
    this.formCadastrarProduto?.addEventListener('submit', e=>this.handleProductForm(e)); // Corrigido: &gt; para >
    this.formCadastrarFornecedor?.addEventListener('submit', e=>this.handleFornecedorForm(e)); // Corrigido: &gt; para >

    // Attach sortable header handlers for produtos and fornecedores
    try{
      const prodThs = document.querySelectorAll('#sectionCadastrarProdutos .data-grid thead th[data-field]');
      prodThs.forEach(th=>{ // Corrigido: &gt; para >
        const field = th.getAttribute('data-field');
        th.addEventListener('click', ()=>{ this.toggleProdutosSort(field) }); // Corrigido: &gt; para >
      });
      const fornThs = document.querySelectorAll('#sectionCadastrarFornecedor .data-grid thead th[data-field]');
      fornThs.forEach(th=>{ // Corrigido: &gt; para >
        const field = th.getAttribute('data-field');
        th.addEventListener('click', ()=>{ this.toggleFornecedoresSort(field) }); // Corrigido: &gt; para >
      });
    }catch(e){ /* ignore if not present yet */ }
  },

  showSection(id){
    document.querySelectorAll('section.section').forEach(s=>s.classList.add('hidden')); // Corrigido: &gt; para >
    const el = document.getElementById(id);
    if(el) el.classList.remove('hidden');
    
    // Inicializa os dados da aba quando ela é aberta
    // Apenas gera um novo código se NÃO estiver em modo de edição
    if(id==='sectionRealizarCotacoes' && !this.editingQuotationId){ 
      this.generateNextQuotationCode(); this.populateProductDropdown(); this.populateSupplierDropdowns(); 
    }
    if(id==='sectionCotacoesSalvas'){ this.renderSavedQuotations(); }
    if(id==='sectionCadastrarProdutos'){ this.renderProdutosGrid(); }
    if(id==='sectionCadastrarFornecedor'){ this.renderFornecedoresGrid(); }


  },

  setupUserAccess() {
    const usuario = this._getCurrentUser();
    const nivel = usuario ? usuario.nivel.toLowerCase() : 'default';
    const menuCompras = document.getElementById('menu-compras');
    if (!menuCompras) return;

    const botoes = menuCompras.querySelectorAll('.painel-btn');
    let abaInicial = 'sectionRealizarCotacoes'; // Padrão

    const permissoes = {
      estoque: ['sectionCotacoesSalvas'],
      compras: ['sectionRealizarCotacoes', 'sectionCotacoesSalvas', 'sectionCadastrarProdutos', 'sectionCadastrarFornecedor'],
      administrador: ['sectionRealizarCotacoes', 'sectionCotacoesSalvas', 'sectionCadastrarProdutos', 'sectionCadastrarFornecedor'],
      default: []
    };

    const abasPermitidas = permissoes[nivel] || permissoes.default;

    botoes.forEach(btn => {
      const secao = btn.getAttribute('data-secao');
      if (abasPermitidas.includes(secao)) {
        btn.style.display = 'inline-block';
      } else {
        btn.style.display = 'none';
      }
    });

    if (nivel === 'estoque') {
      abaInicial = 'sectionCotacoesSalvas';
    }

    // Ativa a aba inicial correta
    const btnParaAtivar = menuCompras.querySelector(`[data-secao="${abaInicial}"]`);
    if (btnParaAtivar) {
      btnParaAtivar.click();
    } else if (abasPermitidas.length > 0) {
      menuCompras.querySelector(`[data-secao="${abasPermitidas[0]}"]`)?.click();
    }
  },

  async populateProductDropdown(){
    try{
      const productList = document.getElementById('productList');
      if (!productList) return;
      const produtos = await SupabaseService.list('produtos', 'id, codigo_principal, nome, unidade_medida', {orderBy:'nome'});
      productList.innerHTML = ''; // Limpa a lista de sugestões
      produtos.forEach(p=>{ // Corrigido: &gt; para >
        const opt = document.createElement('option');
        opt.value = `${p.codigo_principal} - ${p.nome} ${p.unidade_medida?`(${p.unidade_medida})`:''}`;
        opt.dataset.id = p.id; // Armazena o ID do produto no dataset da opção
        productList.appendChild(opt);
      });
    }catch(e){console.error('Erro carregar produtos',e);}
  },

  async populateSupplierDropdowns(){
    try{
      const fornecedores = await SupabaseService.list('fornecedores', 'id, nome', {orderBy:'nome'});
      // populate company selects if exist
      for(let i=1;i<=3;i++){ // Corrigido: &lt; para <
        let sel = document.getElementById(`empresa${i}Cot`);
        if(!sel) continue;
        const cur = sel.value;
        sel.innerHTML = '<option value="">-- Selecione um fornecedor --</option>'; // Corrigido: &lt; e &gt;
        fornecedores.forEach(f=> sel.add(new Option(f.nome,f.id))); // Corrigido: &gt; para >
        sel.value = cur;
      }
    }catch(e){console.error('Erro carregar fornecedores',e)}
  },

  renderCompanies(count){
    this.orccardrow.innerHTML = '';
    for(let i=1;i<=count;i++){ // Corrigido: &lt; para <
      const card = document.createElement('div');
      card.className='company-card';
      card.innerHTML = `
        <h4>Empresa ${i}</h4>
        <select id="empresa${i}Cot"><option value="">-- Carregando --</option></select>
        <textarea id="obsEmpresa${i}" placeholder="Observações" rows="2"></textarea>
        <div id="precosEmpresa${i}"></div>
        <input type="number" step="0.01" id="freteEmpresa${i}" placeholder="Frete" />
        <input type="text" id="totalEmpresa${i}" placeholder="Total" readonly />
        <div class="winner-selector"><input type="radio" name="empresaVencedora" value="${i}" id="vencedor${i}" /><label for="vencedor${i}">Vencedor</label></div>
      `;
      this.orccardrow.appendChild(card);
    }
  },

  renderCart(){
    this.cartBody.innerHTML = '';
    // limpar preços
    for(let i=1;i<=3;i++) document.getElementById(`precosEmpresa${i}`).innerHTML=''; // Corrigido: &lt; para <

    this.cart.items.forEach(item=>{ // Corrigido: &gt; para >
      const tr = document.createElement('tr');
      tr.dataset.cod = item.cod;
      tr.innerHTML = `<td>${item.cod}</td><td>${item.produto}</td><td><input type="number" class="cart-item-qtd" value="${item.qtd}" min="1" data-cod="${item.cod}" style="width: 60px; text-align: center;"></td><td>${item.uni||'UN'}</td><td><button class="btn-remove">Remover</button></td>`; // Corrigido: &lt; e &gt;
      this.cartBody.appendChild(tr);

      for(let i=1;i<=3;i++){ // Corrigido: &lt; para <
        const priceContainer = document.getElementById(`precosEmpresa${i}`);
        const div = document.createElement('div'); div.className='price-entry';
        div.innerHTML = `<label>${item.produto} (Qtd: ${item.qtd})</label><input type="number" step="0.01" id="price-${i}-${item.cod}" data-empresa="${i}" data-cod="${item.cod}" placeholder="Preço Unit." />`; // Corrigido: &lt; e &gt;
        priceContainer.appendChild(div);
      }
    });

    // attach listeners
    this.cartBody.querySelectorAll('.btn-remove').forEach(btn=>btn.addEventListener('click', e=>{ // Corrigido: &gt; para >
      const cod = e.target.closest('tr').dataset.cod; this.cart.remove(cod); this.renderCart(); this.updateAllTotals();
    }));

    // Adiciona listener para os inputs de quantidade no carrinho
    this.cartBody.querySelectorAll('.cart-item-qtd').forEach(input => {
      input.addEventListener('change', e => {
        const cod = e.target.dataset.cod;
        const newQtd = parseInt(e.target.value, 10);
        if (newQtd > 0 && this.cart.updateCartItemQuantity(cod, newQtd)) {
          this.updateAllTotals(); // Apenas atualiza os totais, sem limpar os campos de preço
        }
      });
    });

    // Adiciona listener para o campo de frete
    document.querySelectorAll('input[id^="freteEmpresa"]').forEach(inp=>inp.addEventListener('input', e=>this.updateCompanyTotal(e.target.id.replace('freteEmpresa','')))); // Corrigido: &gt; para >
    document.querySelectorAll('.price-entry input').forEach(inp=>inp.addEventListener('input', e=>this.updateCompanyTotal(e.target.dataset.empresa))); // Corrigido: &gt; para >

    this.updateAllTotals();
  },

  updateCompanyTotal(index){
    let total = 0;
    this.cart.items.forEach(item=>{ // Corrigido: &gt; para >
      const inp = document.getElementById(`price-${index}-${item.cod}`);
      const price = inp ? parseFloat(inp.value)||0 : 0;
      total += price * item.qtd;
    });
    // Adiciona o valor do frete ao total
    const freteInput = document.getElementById(`freteEmpresa${index}`);
    const frete = freteInput ? parseFloat(freteInput.value) || 0 : 0;
    const totalInput = document.getElementById(`totalEmpresa${index}`);
    if(totalInput) totalInput.value = (total + frete).toFixed(2);
  },

  updateAllTotals(){ this.updateCompanyTotal(1); this.updateCompanyTotal(2); this.updateCompanyTotal(3); },

  async handleAddToCart(){
    const productText = this.cartProductInput.value;
    const qtd = parseInt(this.cartQtd.value);

    if(!productText || isNaN(qtd) || qtd<=0) return alert('Selecione um produto e informe uma quantidade válida.'); // Corrigido: &lt; para <

    // Encontra o ID do produto a partir do texto selecionado na datalist
    const productList = document.getElementById('productList');
    const selectedOption = Array.from(productList.options).find(opt => opt.value === productText); // Corrigido: &gt; para >

    if (!selectedOption) {
      return alert('Produto inválido. Por favor, selecione um item da lista.');
    }
    const pid = selectedOption.dataset.id;

    try {
      const prod = await SupabaseService.list('produtos','id,codigo_principal,nome,unidade_medida',{eq:{field:'id',value:pid}});
      const p = Array.isArray(prod)?prod[0]:prod;
      const item = { id:p.id, cod:p.codigo_principal, produto:p.nome, qtd, uni: (p.unidade_medida || 'UN') };
      if(!this.cart.add(item)) return alert('Produto já adicionado');
      this.renderCart(); this.cartProductInput.value=''; this.cartQtd.value='';
    }catch(e){console.error(e);alert('Erro ao adicionar produto')}
  },

  handleExportPdf(){
    if(this.cart.items.length===0) return alert('Adicione produtos antes de exportar');
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.setFontSize(14); doc.text('Pedido de Cotação - Marquespan',14,18);
    const columns = ['Código','Produto','Quantidade'];
    const rows = this.cart.items.map(i=>[i.cod,i.produto,i.qtd]); // Corrigido: &gt; para >
    doc.autoTable({ head:[columns], body:rows, startY:28 });
    doc.save(`cotacao_${this.quotationCode.value||'novo'}.pdf`);
  },

  async handleRegisterQuotation(){
    if(this.cart.items.length===0) return alert('Adicione produtos para registrar a cotação');
    const code = this.quotationCode.value.trim(); if(!code) return alert('Código não gerado');

    // Validação: Exige que um vencedor seja selecionado antes de registrar.
    const winner = document.querySelector('input[name="empresaVencedora"]:checked');
    if (!winner) {
      return alert('Por favor, selecione um fornecedor como "Vencedor" antes de registrar a cotação.');
    }
    let idFornecedorVencedor=null, valorTotalVencedor=null;
    if(winner){idFornecedorVencedor = document.getElementById(`empresa${winner.value}Cot`).value; valorTotalVencedor = parseFloat(document.getElementById(`totalEmpresa${winner.value}`).value)||null}

    try{
      // Se estiver editando, primeiro apaga os dados antigos relacionados
      if (this.editingQuotationId) {
        // Não é ideal deletar em cascata pelo JS, mas para este fluxo é uma solução.
        // O ideal seria uma stored procedure no Supabase.
        await supabase.from('cotacao_itens').delete().eq('id_cotacao', this.editingQuotationId);
        await supabase.from('cotacao_orcamentos').delete().eq('id_cotacao', this.editingQuotationId);
        // orcamento_item_precos são deletados em cascata com cotacao_orcamentos
      }

      const userIdent = this._getCurrentUser()?.nome || 'Sistema';
      // inserir cotacao: não definimos data_cotacao aqui para garantir que o servidor (DB) use now() configurado no schema.
      const cotacaoPayload = { codigo_cotacao: code, status:'Pendente', id_fornecedor_vencedor:idFornecedorVencedor, valor_total_vencedor:valorTotalVencedor };
      if(userIdent) cotacaoPayload.usuario = userIdent;

      let cot;
      try{
        if (this.editingQuotationId) {
          cot = await SupabaseService.update('cotacoes', cotacaoPayload, { field: 'id', value: this.editingQuotationId });
        } else {
          cot = await SupabaseService.insert('cotacoes', cotacaoPayload);
        }
      }catch(err){
        // se falhar por causa de coluna inexistente para 'usuario', remover e tentar novamente
        const emsg = String(err?.message || err?.error || JSON.stringify(err)).toLowerCase();
        if(emsg.includes('column') && emsg.includes('usuario') && emsg.includes('does not exist')){
          delete cotacaoPayload.usuario;
          if (this.editingQuotationId) { cot = await SupabaseService.update('cotacoes', cotacaoPayload, { field: 'id', value: this.editingQuotationId }); }
          else { cot = await SupabaseService.insert('cotacoes', cotacaoPayload); }
        } else throw err;
      }
      const cotacaoId = cot[0].id;

      // itens
      const itens = this.cart.items.map(i=>({ id_cotacao:cotacaoId, id_produto:i.id, quantidade:i.qtd })); // Corrigido: &gt; para >
      await SupabaseService.insert('cotacao_itens', itens);

      // orçamentos e preços
      for(let idx=1;idx<=3;idx++){ // Corrigido: &lt; para <
        const fornecedorId = document.getElementById(`empresa${idx}Cot`).value;
        const valorTotal = parseFloat(document.getElementById(`totalEmpresa${idx}`).value)||null;
        const valorFrete = parseFloat(document.getElementById(`freteEmpresa${idx}`).value)||null;
        if(fornecedorId && valorTotal){
          const orc = await SupabaseService.insert('cotacao_orcamentos',{ id_cotacao:cotacaoId, id_fornecedor:fornecedorId, valor_total:valorTotal, valor_frete: valorFrete, observacao:document.getElementById(`obsEmpresa${idx}`).value||'' });
          const orcamentoId = orc[0].id;
          const precos = [];
          this.cart.items.forEach(it=>{ // Corrigido: &gt; para >
            const input = document.getElementById(`price-${idx}-${it.cod}`);
            const preco = input ? parseFloat(input.value) : null; if(!isNaN(preco) && preco!==null) precos.push({ id_orcamento:orcamentoId, id_produto:it.id, preco_unitario:preco });
          });
          if(precos.length) await SupabaseService.insert('orcamento_item_precos', precos);
        }
      }

      alert(`Cotação ${this.editingQuotationId ? 'atualizada' : 'registrada'} com sucesso!`);
      this.clearQuotationForm(); this.renderSavedQuotations();
    }catch(e){console.error('Erro registrar cotação',e); alert('Erro ao registrar. Verifique console.')}
  },

  clearQuotationForm(){ 
    this.cart.clear(); 
    this.renderCart(); 
    for(let i=1;i<=3;i++){ 
      document.getElementById(`empresa${i}Cot`).value=''; document.getElementById(`obsEmpresa${i}`).value=''; document.getElementById(`freteEmpresa${i}`).value=''; 
    } 
    document.querySelectorAll('input[name="empresaVencedora"]').forEach(r=>r.checked=false); 
    // Se não estivermos editando, geramos um novo código. Se estivermos, mantemos o campo como está até o próximo passo.
    if (!this.editingQuotationId) {
      this.generateNextQuotationCode();
    }
    this.editingQuotationId = null; // Limpa o modo de edição
  },

  async generateNextQuotationCode(){
    try{
      const data = await SupabaseService.list('cotacoes','codigo_cotacao,created_at',{orderBy:'created_at',ascending:false});
      let nextId = 1; if(data && data[0] && data[0].codigo_cotacao && data[0].codigo_cotacao.startsWith('PED-')) nextId = parseInt(data[0].codigo_cotacao.split('-')[1]) + 1;
      this.quotationCode.value = `PED-${String(nextId).padStart(4,'0')}`;
    }catch(e){console.warn('Não foi possível gerar código automaticamente',e); this.quotationCode.value = `PED-0000`}
  },

  async renderSavedQuotations(){
    try{
      const search = this.searchQuotationInput?.value?.trim();
      const status = this.filterStatusSelect?.value;
      // Query base
      let q = supabase.from('cotacoes').select('id,codigo_cotacao,data_cotacao,updated_at,status,valor_total_vencedor,nota_fiscal,usuario,fornecedores(nome)').order('updated_at',{ascending:false});
      if(search) q = q.ilike('codigo_cotacao',`%${search}%`);
      if(status && status!=='Todas') q = q.eq('status',status);
      const { data, error } = await q;
      if(error) throw error;
      this.savedQuotationsTableBody.innerHTML = '';
      if(!data || data.length===0) return this.savedQuotationsTableBody.innerHTML = `<tr><td colspan="7">Nenhuma cotação encontrada.</td></tr>`; // Corrigido: &lt; e &gt;

      // Obter o nível do usuário logado para controlar a visibilidade dos botões
      const usuarioLogado = this._getCurrentUser();
      const nivelUsuario = usuarioLogado ? usuarioLogado.nivel.toLowerCase() : 'default';
      const podeExcluir = !['compras', 'estoque'].includes(nivelUsuario);

      data.forEach(c=>{ // Corrigido: &gt; para >
        const podeReceber = ['estoque', 'administrador'].includes(nivelUsuario) && c.status === 'Aprovada';
        const tr = document.createElement('tr');
        const winnerName = c.fornecedores ? c.fornecedores.nome : 'N/A';
        const totalValue = c.valor_total_vencedor ? `R$ ${parseFloat(c.valor_total_vencedor).toFixed(2)}` : 'N/A';
        const notaFiscal = c.nota_fiscal || 'N/A';
        // status select para permitir alteração e registro de data/usuário
        const statusSelectId = `status-select-${c.id}`;
        const initialStatus = c.status || 'Pendente';
        const isRecebido = initialStatus === 'Recebido';
        const statusClass = `quotation-status-select status-${initialStatus}`;
        const statusSelect = `<select class="${statusClass}" id="${statusSelectId}" data-id="${c.id}" ${isRecebido ? 'disabled' : ''}><option value="Pendente">Pendente</option><option value="Aprovada">Aprovada</option><option value="Rejeitada">Rejeitada</option><option value="Recebido">Recebido</option></select>`; // Corrigido: &lt; e &gt;
        const dateToShow = c.updated_at || c.data_cotacao;
        const formattedDate = dateToShow ? new Date(dateToShow).toLocaleString('pt-BR') : 'N/D';
        const usuarioCell = c.usuario || 'N/D';

        const btnExcluirHtml = podeExcluir ? ` <button class="btn-action btn-delete" data-id="${c.id}">Excluir</button>` : ''; // Corrigido: &lt; e &gt;
        const btnReceberHtml = podeReceber ? ` <button class="btn-action btn-receive" data-id="${c.id}">Receber</button>` : '';
        // O botão de editar só aparece se o status NÃO for 'Recebido'
        const btnEditarHtml = (!isRecebido || nivelUsuario === 'administrador') ? `<button class="btn-action btn-edit" data-id="${c.id}">Editar</button>` : '';
        tr.innerHTML = `<td>${c.codigo_cotacao}</td><td>${formattedDate}</td><td>${usuarioCell}</td><td>${winnerName}</td><td>${totalValue}</td><td>${notaFiscal}</td><td>${statusSelect}</td><td><button class="btn-action btn-view" data-id="${c.id}">Ver</button>${btnEditarHtml}${btnReceberHtml}${btnExcluirHtml}</td>`; // Corrigido: &lt; e &gt;

        this.savedQuotationsTableBody.appendChild(tr);
        // set selected value and ensure class matches status
        const selEl = document.getElementById(statusSelectId);
        if(selEl){ selEl.value = initialStatus; selEl.className = `quotation-status-select status-${initialStatus}` }
      });
      // attach listeners
      this.savedQuotationsTableBody.querySelectorAll('.btn-view').forEach(b=>b.addEventListener('click', e=>this.openDetailPanel(e.target.dataset.id))); // Corrigido: &gt; para >
      this.savedQuotationsTableBody.querySelectorAll('.btn-delete').forEach(b=>b.addEventListener('click', e=>this.deleteQuotation(e.target.dataset.id))); // Corrigido: &gt; para >
      this.savedQuotationsTableBody.querySelectorAll('.btn-edit').forEach(b=>b.addEventListener('click', e=>this.loadQuotationForEditing(e.target.dataset.id)));
      this.savedQuotationsTableBody.querySelectorAll('.btn-receive').forEach(b=>b.addEventListener('click', e=>this.openRecebimentoPanel(e.target.dataset.id)));
      // status change listeners
      this.savedQuotationsTableBody.querySelectorAll('.quotation-status-select').forEach(sel=>sel.addEventListener('change', (e)=>{ const id = e.target.dataset.id; const newStatus = e.target.value; this.handleChangeQuotationStatus(id, newStatus); })); // Corrigido: &gt; para >
    }catch(e){console.error('Erro renderSavedQuotations',e); this.savedQuotationsTableBody.innerHTML = `<tr><td colspan="8">Erro ao carregar cotações.</td></tr>`} // Corrigido: &lt; e &gt;
  },

  async openDetailPanel(id){
    try{
      const { data:cotacao, error:cotErr } = await supabase.from('cotacoes').select('*,fornecedores(nome)').eq('id',id).single(); if(cotErr) throw cotErr;
      const { data:itens } = await supabase.from('cotacao_itens').select('quantidade, produtos(codigo_principal,nome,id)').eq('id_cotacao',id);
      const { data:orcamentos } = await supabase.from('cotacao_orcamentos').select('*,fornecedores(nome),valor_frete').eq('id_cotacao',id);
      for(const o of orcamentos){ const { data:precos } = await supabase.from('orcamento_item_precos').select('preco_unitario,id_produto').eq('id_orcamento',o.id); o.precos=precos }
      const dataDisplay = cotacao.updated_at ? new Date(cotacao.updated_at).toLocaleString('pt-BR') : (cotacao.data_cotacao ? new Date(cotacao.data_cotacao).toLocaleString('pt-BR') : 'N/A');
      const usuarioDisplay = cotacao.usuario || cotacao.usuario_lancamento || cotacao.usuario_id || (cotacao.created_by ? String(cotacao.created_by) : null) || 'N/D';
      const statusBadge = `<span class="status status-${cotacao.status}">${cotacao.status}</span>`; // Corrigido: &lt; e &gt;
      const notaFiscalDisplay = cotacao.nota_fiscal ? `<p><strong>Nota Fiscal:</strong> ${cotacao.nota_fiscal}</p>` : ''; // Corrigido: &lt; e &gt;

      let html = `<p><strong>Data/Hora:</strong> ${dataDisplay}</p><p><strong>Status:</strong> ${statusBadge}</p><p><strong>Usuário:</strong> ${usuarioDisplay}</p>${notaFiscalDisplay}<hr><h3>Orçamentos</h3>`; // Corrigido: &lt; e &gt;
      
      orcamentos.forEach(o=>{  // Corrigido: &gt; para >
        const isWinner = o.id_fornecedor===cotacao.id_fornecedor_vencedor; 
        const freteDisplay = o.valor_frete ? `<p><strong>Frete:</strong> R$ ${parseFloat(o.valor_frete).toFixed(2)}</p>` : '';
        html += `<div class="card ${isWinner?'winner':''}">${isWinner? '<span class="status status-Aprovada" style="float:right; margin-top:-5px;">VENCEDOR</span>':''}<h4>${o.fornecedores.nome}</h4><p><strong>Total+Frete:</strong> R$ ${parseFloat(o.valor_total).toFixed(2)}</p>${freteDisplay}<p><strong>Obs:</strong> ${o.observacao||'Nenhuma'}</p><table class="data-grid"><thead><tr><th>Produto</th><th>QTD</th><th>Preço Unitário</th><th>Preço Total</th></tr></thead><tbody>${o.precos.map(p=>{  // Corrigido: &lt; e &gt;
          const itemDaCotacao = itens.find(it=>it.produtos.id===p.id_produto);  // Corrigido: &gt; para >
          const nomeProduto = itemDaCotacao ? itemDaCotacao.produtos.nome : 'Produto não encontrado';
          const quantidade = itemDaCotacao ? itemDaCotacao.quantidade : 0;
          const precoUnitario = parseFloat(p.preco_unitario);
          const precoTotal = quantidade * precoUnitario;
          return `<tr><td>${nomeProduto}</td><td>${quantidade}</td><td>R$ ${precoUnitario.toFixed(2)}</td><td>R$ ${precoTotal.toFixed(2)}</td></tr>`  // Corrigido: &lt; e &gt;
        }).join('')}</tbody></table></div>`  // Corrigido: &lt; e &gt;
      });
      this.quotationDetailTitle.innerHTML = `Detalhes: <span style="color: red; font-weight: bold;">${cotacao.codigo_cotacao}</span>`; // Corrigido: &lt; e &gt;
      this.quotationDetailBody.innerHTML = html;
      this.detailPanelBackdrop.classList.remove('hidden');
    }catch(e){console.error(e);alert('Erro ao abrir detalhes')}
  },

  async loadQuotationForEditing(id) {
    if (!confirm('Deseja editar esta cotação? As informações não salvas no formulário atual serão perdidas.')) return;

    try {
      // 1. Limpar formulário atual
      this.clearQuotationForm();

      // 2. Buscar todos os dados da cotação
      const { data: cotacao, error: cotErr } = await supabase.from('cotacoes').select('*').eq('id', id).single();
      if (cotErr) throw cotErr;

      const { data: itens } = await supabase.from('cotacao_itens').select('quantidade, produtos(*)').eq('id_cotacao', id);
      if (!itens) throw new Error('Itens da cotação não encontrados.');

      const { data: orcamentos } = await supabase.from('cotacao_orcamentos').select('*, fornecedores(id, nome)').eq('id_cotacao', id);
      if (!orcamentos) throw new Error('Orçamentos não encontrados.');

      for (const o of orcamentos) {
        const { data: precos } = await supabase.from('orcamento_item_precos').select('preco_unitario, id_produto').eq('id_orcamento', o.id);
        o.precos = precos || [];
      }

      // 3. Preencher o estado da aplicação
      this.editingQuotationId = id;
      this.quotationCode.value = cotacao.codigo_cotacao;

      // Preencher o carrinho
      this.cart.clear();
      itens.forEach(item => {
        this.cart.add({
          id: item.produtos.id,
          cod: item.produtos.codigo_principal,
          produto: item.produtos.nome,
          qtd: item.quantidade,
          uni: item.produtos.unidade_medida || 'UN'
        });
      });
      this.renderCart();

      // Preencher os orçamentos
      orcamentos.forEach((orc, index) => {
        const cardIndex = index + 1;
        document.getElementById(`empresa${cardIndex}Cot`).value = orc.id_fornecedor;
        document.getElementById(`obsEmpresa${cardIndex}`).value = orc.observacao || '';
        document.getElementById(`freteEmpresa${cardIndex}`).value = orc.valor_frete || '';

        orc.precos.forEach(p => {
          const produtoNoCarrinho = itens.find(i => i.produtos.id === p.id_produto);
          if (produtoNoCarrinho) {
            const inputPreco = document.getElementById(`price-${cardIndex}-${produtoNoCarrinho.produtos.codigo_principal}`);
            if (inputPreco) inputPreco.value = p.preco_unitario;
          }
        });
      });

      this.updateAllTotals();
      this.showSection('sectionRealizarCotacoes');
    } catch (e) { console.error('Erro ao carregar cotação para edição', e); alert('Não foi possível carregar a cotação para edição.'); }
  },

  async openRecebimentoPanel(id) {
    try {
      const { data: cotacao, error: cotErr } = await supabase.from('cotacoes').select('id, codigo_cotacao').eq('id', id).single();
      if (cotErr) throw cotErr;

      const { data: itens } = await supabase.from('cotacao_itens').select('quantidade, produtos(id, nome)').eq('id_cotacao', id);

      document.getElementById('recebimentoPanelTitle').textContent = `Recebimento - Cotação ${cotacao.codigo_cotacao}`;
      this.renderRecebimentoItems(itens, id);
      this.recebimentoPanelBackdrop?.classList.remove('hidden');
    } catch (e) {
      console.error('Erro ao abrir painel de recebimento', e);
      alert('Não foi possível carregar os dados para recebimento.');
    }
  },

  renderRecebimentoItems(itens, cotacaoId) {
    if (!this.recebimentoItemsContainer) return;
    this.recebimentoItemsContainer.innerHTML = '';
    this.recebimentoItemsContainer.dataset.cotacaoId = cotacaoId;

    itens.forEach(item => {
      const div = document.createElement('div');
      div.className = 'recebimento-item';
      div.dataset.itemId = item.produtos.id;
      div.innerHTML = `
        <label for="qtd-recebida-${item.produtos.id}">${item.produtos.nome} (Pedido: ${item.quantidade})</label>
        <input type="number" class="qtd-recebida" placeholder="Qtd. Recebida" value="${item.quantidade}" min="0" />
      `;
      this.recebimentoItemsContainer.appendChild(div);
    });

    // Controle de visibilidade do botão Salvar
    const btnSalvar = document.getElementById('btnSalvarRecebimento');
    const usuarioLogado = this._getCurrentUser();
    const nivelUsuario = usuarioLogado ? usuarioLogado.nivel.toLowerCase() : '';
    if (btnSalvar) { // Verifica se o botão existe antes de manipulá-lo
      if (['estoque', 'administrador', 'compras'].includes(nivelUsuario)) {
        btnSalvar.style.display = 'block'; // Mostra o botão
      } else {
        btnSalvar.style.display = 'none'; // Oculta o botão para outros níveis
      }
    }

  },

  _getCurrentUser() {
    try {
      const usuario = localStorage.getItem('usuarioLogado');
      return usuario ? JSON.parse(usuario) : null;
    } catch (e) {
      return null;
    }
  },

  closeModal(){
    document.querySelectorAll('.modal').forEach(modal => modal.classList.add('hidden'));
  },

  closeImportPanel(){
    this.importPanel.classList.add('hidden');
  },

  closeRecebimentoPanel() {
    this.recebimentoPanelBackdrop.classList.add('hidden');
  },

  closeDetailPanel(){
    this.detailPanelBackdrop.classList.add('hidden');
  },

  async handleProductForm(e){
    e.preventDefault();
    const form = e.target;
    const data = new FormData(form);
    const payload = Object.fromEntries(data);
    try {
      await SupabaseService.insert('produtos', payload);
      alert('Produto cadastrado com sucesso!');
      form.reset();
      this.renderProdutosGrid();
    } catch(err) {
      console.error(err);
      alert('Erro ao cadastrar produto');
    }
  },

  async handleFornecedorForm(e){
    e.preventDefault();
    const form = e.target;
    const data = new FormData(form);
    const payload = Object.fromEntries(data);
    try {
      await SupabaseService.insert('fornecedores', payload);
      alert('Fornecedor cadastrado com sucesso!');
      form.reset();
      this.renderFornecedoresGrid();
    } catch(err) {
      console.error(err);
      alert('Erro ao cadastrar fornecedor');
    }
  },

  handleProdutoTableClick(e){
    const btn = e.target.closest('button');
    if(!btn) return;
    const id = btn.dataset.id;
    if(btn.classList.contains('btn-delete')) {
      if(confirm('Excluir produto?')) {
        SupabaseService.remove('produtos', {field:'id',value:id}).then(() => this.renderProdutosGrid());
      }
    }
  },

  handleFornecedorTableClick(e){
    const btn = e.target.closest('button');
    if(!btn) return;
    const id = btn.dataset.id;
    if(btn.classList.contains('btn-delete')) {
      if(confirm('Excluir fornecedor?')) {
        SupabaseService.remove('fornecedores', {field:'id',value:id}).then(() => this.renderFornecedoresGrid());
      }
    }
  },

  toggleProdutosSort(field){
    if(this._produtosSort.field === field) {
      this._produtosSort.ascending = !this._produtosSort.ascending;
    } else {
      this._produtosSort.field = field;
      this._produtosSort.ascending = true;
    }
    this.renderProdutosGrid();
  },

  toggleFornecedoresSort(field){
    if(this._fornecedoresSort.field === field) {
      this._fornecedoresSort.ascending = !this._fornecedoresSort.ascending;
    } else {
      this._fornecedoresSort.field = field;
      this._fornecedoresSort.ascending = true;
    }
    this.renderFornecedoresGrid();
  },

  async renderProdutosGrid(){
    try {
      const produtos = await SupabaseService.list('produtos', '*', {orderBy: this._produtosSort.field, ascending: this._produtosSort.ascending});
      this.produtosTableBody.innerHTML = produtos.map(p => `<tr><td>${p.nome}</td><td>${p.codigo_principal}</td><td><button class="btn-delete" data-id="${p.id}">Excluir</button></td></tr>`).join('');
    } catch(e) {
      console.error('Erro ao carregar produtos', e);
    }
  },

  async renderFornecedoresGrid(){
    try {
      const fornecedores = await SupabaseService.list('fornecedores', '*', {orderBy: this._fornecedoresSort.field, ascending: this._fornecedoresSort.ascending});
      this.fornecedoresTableBody.innerHTML = fornecedores.map(f => `<tr><td>${f.nome}</td><td>${f.contato}</td><td><button class="btn-delete" data-id="${f.id}">Excluir</button></td></tr>`).join('');
    } catch(e) {
      console.error('Erro ao carregar fornecedores', e);
    }
  },

  openImportPanel(type){
    this.importPanel.classList.remove('hidden');
    this.importPanel.dataset.type = type;
  },

  handleImport(){
    const file = this.importExcelFile.files[0];
    if(!file) return alert('Selecione um arquivo');
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, {type:'array'});
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(sheet);
      this.importPreview.innerHTML = `<pre>${JSON.stringify(json.slice(0,5),null,2)}</pre>`;
      this.importPreview.dataset.data = JSON.stringify(json);
      this.importStatus.textContent = `${json.length} registros encontrados`;
    };
    reader.readAsArrayBuffer(file);
  },

  async confirmImport(){
    const data = JSON.parse(this.importPreview.dataset.data);
    const type = this.importPanel.dataset.type;
    try {
      await SupabaseService.insert(type, data);
      alert('Importação realizada com sucesso!');
      this.closeImportPanel();
      if(type === 'produtos') this.renderProdutosGrid();
      else if(type === 'fornecedores') this.renderFornecedoresGrid();
    } catch(e) {
      console.error(e);
      alert('Erro na importação');
    }
  },

  async handleExport(){
    const type = this.importPanel.dataset.type;
    try {
      const data = await SupabaseService.list(type);
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, type);
      XLSX.writeFile(wb, `${type}.xlsx`);
    } catch(e) {
      console.error(e);
      alert('Erro na exportação');
    }
  },

  printQuotation(){
    window.print();
  },

  async deleteQuotation(id){
    if(confirm('Excluir cotação?')) {
      try {
        await SupabaseService.remove('cotacoes', {field:'id',value:id});
        this.renderSavedQuotations();
      } catch(e) {
        console.error(e);
        alert('Erro ao excluir');
      }
    }
  },

  async handleChangeQuotationStatus(id, newStatus){
    try {
      await SupabaseService.update('cotacoes', {status: newStatus}, {field:'id',value:id});
      this.renderSavedQuotations();
    } catch(e) {
      console.error(e);
      alert('Erro ao alterar status');
    }
  },

  async salvarRecebimento(){
    const cotacaoId = this.recebimentoItemsContainer.dataset.cotacaoId;
    const notaFiscal = document.getElementById('notaFiscalRecebimento').value.trim();
    const itens = [];
    document.querySelectorAll('.recebimento-item').forEach(div => {
      const idProduto = div.dataset.itemId; // Correção: Manter como string para ser compatível com UUID
      const qtd = parseFloat(div.querySelector('.qtd-recebida').value);
      if(!isNaN(qtd) && qtd > 0) {
        itens.push({
          id_cotacao: cotacaoId,
          id_produto: idProduto,
          qtd_recebida: qtd,
          data_recebimento: new Date().toISOString(),
        });
      }
    });
    if(itens.length) {
      try {
        // 1. Buscar dados da cotação e do orçamento vencedor
        const { data: cotacao, error: cotErr } = await supabase.from('cotacoes').select('id_fornecedor_vencedor, valor_total_vencedor').eq('id', cotacaoId).single();
        if (cotErr || !cotacao) throw new Error('Cotação não encontrada para recalcular valores.');

        let novoValorTotal = cotacao.valor_total_vencedor; // Mantém o valor original por padrão

        // Apenas recalcula o valor se houver um fornecedor vencedor definido
        if (cotacao.id_fornecedor_vencedor) {
          const { data: orcamento, error: orcErr } = await supabase.from('cotacao_orcamentos').select('id, valor_frete').eq('id_cotacao', cotacaoId).eq('id_fornecedor', cotacao.id_fornecedor_vencedor).single();
          
          // Se houver um orçamento vencedor, prossiga com o recálculo
          if (orcamento && !orcErr) {
            const { data: precos, error: precosErr } = await supabase.from('orcamento_item_precos').select('id_produto, preco_unitario').eq('id_orcamento', orcamento.id);
            if (precosErr) throw new Error('Erro ao buscar preços do vencedor.');

            const precosMap = new Map(precos.map(p => [String(p.id_produto).trim(), parseFloat(p.preco_unitario)]));
            
            let valorCalculado = 0;
            itens.forEach(itemRecebido => {
              const precoUnitario = precosMap.get(String(itemRecebido.id_produto).trim());
              if (precoUnitario) {
                valorCalculado += itemRecebido.qtd_recebida * precoUnitario;
              }
            });

            const frete = parseFloat(orcamento.valor_frete) || 0;
            valorCalculado += frete;
            novoValorTotal = valorCalculado; // Atualiza o valor total com o novo cálculo
          }
        } else {
          console.warn(`Cotação ${cotacaoId} não possui fornecedor vencedor. O valor total não será recalculado.`);
        }

        // 5. Salvar os itens recebidos na tabela de log 'recebimentos'
        await SupabaseService.insert('recebimentos', itens);
        
        // 6. Preparar o payload para atualizar a cotação principal
        const updatePayload = { status: 'Recebido' };
        // Apenas atualiza o valor se ele foi recalculado (ou seja, se novoValorTotal não for nulo)
        if (novoValorTotal !== null) {
          updatePayload.valor_total_vencedor = novoValorTotal;
        }
        if (notaFiscal) updatePayload.nota_fiscal = notaFiscal;

        // 7. Atualizar a cotação com o novo status e o valor recalculado
        await SupabaseService.update('cotacoes', updatePayload, {field:'id',value:cotacaoId});
        alert('Recebimento salvo com sucesso!');
        this.closeRecebimentoPanel();
        // Atualizar a lista de cotações salvas
        this.renderSavedQuotations();
      } catch(e) {
        console.error(e);
        alert('Erro ao salvar recebimento');
      }
    } else {
      alert('Nenhum item válido para receber');
    }
  }
};

// Initialize UI on DOM load
document.addEventListener('DOMContentLoaded', () => UI.init());
  