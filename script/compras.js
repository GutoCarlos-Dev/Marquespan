import { supabaseClient } from './supabase.js';

class SupabaseService {
  static async list(table, cols='*', opts={}){
    let q = supabaseClient.from(table).select(cols).order(opts.orderBy||'id',{ascending:!!opts.ascending});
    if(opts.eq) q = q.eq(opts.eq.field, opts.eq.value);
    if(opts.ilike) q = q.ilike(opts.ilike.field, opts.ilike.value);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  }

  static async insert(table, payload){
    const { data, error } = await supabaseClient.from(table).insert(payload).select();
    if (error) throw error;
    return data;
  }

  static async update(table, payload, key){
    const { data, error } = await supabaseClient.from(table).update(payload).eq(key.field, key.value).select();
    if (error) throw error;
    return data;
  }

  static async remove(table, key){
    const { data, error } = await supabaseClient.from(table).delete().eq(key.field, key.value);
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
    if(this.items.some(i=>i.cod===item.cod)) return false;
    this.items.push(item);
    this.save();
    return true;
  }

  remove(cod){
    this.items = this.items.filter(i=>i.cod!==cod);
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
    this.renderCompanies(3);
    this.populateProductDropdown();
    this.populateSupplierDropdowns();
    this.renderCart();
    this.generateNextQuotationCode();
    this.renderSavedQuotations();
    this._produtosSort = { field: 'nome', ascending: true };
    this._fornecedoresSort = { field: 'nome', ascending: true };
    this._savedQuotationsSort = { field: 'updated_at', ascending: false };
    this.renderProdutosGrid();
    this.renderFornecedoresGrid();
    this.editingQuotationId = null;
    this.setupUserAccess();
    document.addEventListener('keydown', (e)=>{ if(e.key === 'Escape'){ this.closeModal?.(); this.closeImportPanel?.(); this.closeDetailPanel?.(); } });
  },

  cache(){
    this.navLinks = document.querySelectorAll('#menu-compras button.painel-btn');
    this.sections = document.querySelectorAll('section.glass-panel');
    this.cartBody = document.getElementById('cartBody');
    this.cartProductInput = document.getElementById('cartProductInput');
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
    this.btnSubmitProduto = document.getElementById('btnSubmitProduto');
    this.formCadastrarFornecedor = document.getElementById('formCadastrarFornecedor');
    this.fornecedoresTableBody = document.getElementById('fornecedoresTableBody');
    this.btnSubmitFornecedor = document.getElementById('btnSubmitFornecedor');
    this.searchFornecedorInput = document.getElementById('searchFornecedorInput');
    this.importPanel = document.getElementById('importPanel');
    this.btnOpenImportExportModal = document.getElementById('btnOpenImportExportModal');
    this.closeModalButtons = document.querySelectorAll('.close-button');
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
    this.btnGeneratePdf = document.getElementById('btnGeneratePdf');
    this.recebimentoPanelBackdrop = document.getElementById('recebimentoPanelBackdrop');
    this.recebimentoPanel = document.getElementById('recebimentoPanel');
    this.btnSalvarRecebimento = document.getElementById('btnSalvarRecebimento');
    this.recebimentoItemsContainer = document.getElementById('recebimentoItems');
    this.nfContainer = document.getElementById('nfContainer');
    this.btnAddNF = document.getElementById('btnAddNF');
  },
  
  bind(){
    this.navLinks.forEach(btn=>btn.addEventListener('click', e=>{
      e.preventDefault();
      this.navLinks.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      this.showSection(btn.dataset.secao);
    }));

    this.btnAddToCart.addEventListener('click', ()=>this.handleAddToCart());
    this.btnClearCart.addEventListener('click', ()=>{ if(confirm('Limpar carrinho?')){this.cart.clear();this.renderCart()} });
    this.btnExportPdf.addEventListener('click', ()=>this.handleExportPdf());
    this.btnRegistrarCotacoes.addEventListener('click', ()=>this.handleRegisterQuotation());

    this.btnSearchQuotation?.addEventListener('click', ()=>this.renderSavedQuotations());
    this.filterStatusSelect?.addEventListener('change', ()=>this.renderSavedQuotations());

    this.produtosTableBody?.addEventListener('click', (e)=>this.handleProdutoTableClick(e));
    this.fornecedoresTableBody?.addEventListener('click', (e)=>this.handleFornecedorTableClick(e));

    this.btnOpenImportExportModal?.addEventListener('click', ()=>this.openImportPanel('produtos'));
    const btnForImport = document.getElementById('btnOpenImportExportFornecedor');
    if(btnForImport) btnForImport.addEventListener('click', ()=>this.openImportPanel('fornecedores'));
    this.closeModalButtons?.forEach(btn=>btn.addEventListener('click', ()=>this.closeModal()));
    
    this.btnImportProducts?.addEventListener('click', ()=>this.handleImport());
    this.btnConfirmImport?.addEventListener('click', ()=>this.confirmImport());
    this.btnExportProducts?.addEventListener('click', ()=>this.handleExport());

    this.detailPanelBackdrop?.addEventListener('click', e => { if (e.target === this.detailPanelBackdrop) this.closeDetailPanel() });
    this.recebimentoPanelBackdrop?.addEventListener('click', e => { if (e.target === this.recebimentoPanelBackdrop) this.closeRecebimentoPanel() });

    this.btnPrintQuotation?.addEventListener('click', () => {
        if(this.detailPanel.dataset.id) this.exportSavedQuotationPdf(this.detailPanel.dataset.id, 'print');
    });
    this.btnSalvarRecebimento?.addEventListener('click', ()=>this.salvarRecebimento());
    this.btnAddNF?.addEventListener('click', ()=>this.addNFInput());
    
    this.btnGeneratePdf?.addEventListener('click', () => {
        if(this.detailPanel.dataset.id) this.exportSavedQuotationPdf(this.detailPanel.dataset.id);
    });

    this.formCadastrarProduto?.addEventListener('submit', e=>this.handleProductForm(e));
    this.formCadastrarFornecedor?.addEventListener('submit', e=>this.handleFornecedorForm(e));

    const searchProdutoInput = document.getElementById('searchProdutoInput');
    if(searchProdutoInput) searchProdutoInput.addEventListener('input', () => this.renderProdutosGrid());

    if(this.searchFornecedorInput) this.searchFornecedorInput.addEventListener('input', () => this.renderFornecedoresGrid());

    try{
      const prodThs = document.querySelectorAll('#sectionCadastrarProdutos .data-grid thead th[data-field]');
      prodThs.forEach(th=>{
        const field = th.getAttribute('data-field');
        th.addEventListener('click', ()=>{ this.toggleProdutosSort(field) });
      });
      const fornThs = document.querySelectorAll('#sectionCadastrarFornecedor .data-grid thead th[data-field]');
      fornThs.forEach(th=>{
        const field = th.getAttribute('data-field');
        th.addEventListener('click', ()=>{ this.toggleFornecedoresSort(field) });
      });

      const savedQuotationsThs = document.querySelectorAll('#sectionCotacoesSalvas .data-grid thead th[data-field]');
      savedQuotationsThs.forEach(th => {
          const field = th.getAttribute('data-field');
          th.addEventListener('click', () => { this.toggleSavedQuotationsSort(field) });
      });
    }catch(e){ }
  },

  showSection(id){
    this.sections.forEach(s=>s.classList.add('hidden'));
    const el = document.getElementById(id);
    if(el) el.classList.remove('hidden');
    
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
    let abaInicial = 'sectionRealizarCotacoes';

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

    const btnParaAtivar = menuCompras.querySelector(`[data-secao="${abaInicial}"]`);
    if (btnParaAtivar) {
      btnParaAtivar.click();
    }
  },

  async populateProductDropdown(){
    try{
      const productList = document.getElementById('productList');
      if (!productList) return;
      const produtos = await SupabaseService.list('produtos', 'id, codigo_principal, nome, unidade_medida', {orderBy:'nome'});
      productList.innerHTML = '';
      produtos.forEach(p=>{
        const opt = document.createElement('option');
        opt.value = `${p.codigo_principal} - ${p.nome} ${p.unidade_medida?`(${p.unidade_medida})`:''}`;
        opt.dataset.id = p.id;
        productList.appendChild(opt);
      });
    }catch(e){console.error('Erro carregar produtos',e);}
  },

  async populateSupplierDropdowns(){
    try{
      const fornecedores = await SupabaseService.list('fornecedores', 'id, nome', {orderBy:'nome'});
      for(let i=1;i<=3;i++){
        let sel = document.getElementById(`empresa${i}Cot`);
        if(!sel) continue;
        const cur = sel.value;
        sel.innerHTML = '<option value="">-- Selecione um fornecedor --</option>';
        fornecedores.forEach(f=> sel.add(new Option(f.nome,f.id)));
        sel.value = cur;
      }
    }catch(e){console.error('Erro carregar fornecedores',e)}
  },

  renderCompanies(count){
    this.orccardrow.innerHTML = '';
    for(let i=1;i<=count;i++){
      const card = document.createElement('div');
      card.className='company-card';
      card.innerHTML = `
        <h4>Empresa ${i}</h4>
        <div class="form-group"><select id="empresa${i}Cot" class="glass-input compact-input"><option value="">-- Carregando --</option></select></div>
        <div class="form-group"><textarea id="obsEmpresa${i}" placeholder="Observações" class="glass-input" rows="2" oninput="this.value = this.value.toUpperCase()"></textarea></div>
        <div id="precosEmpresa${i}"></div>
        <div class="form-group"><input type="number" step="0.01" id="freteEmpresa${i}" placeholder="Frete (R$)" class="glass-input compact-input" /></div>
        <div class="form-group"><input type="text" id="totalEmpresa${i}" placeholder="Total (R$)" readonly class="glass-input compact-input" style="font-weight:bold; background-color: rgba(0,0,0,0.05);" /></div>
        <div class="winner-selector"><input type="radio" name="empresaVencedora" value="${i}" id="vencedor${i}" /><label for="vencedor${i}">Vencedor</label></div>
      `;
      this.orccardrow.appendChild(card);
    }
  },

  renderCart(){
    this.cartBody.innerHTML = '';
    for(let i=1;i<=3;i++) document.getElementById(`precosEmpresa${i}`).innerHTML='';

    this.cart.items.forEach(item=>{
      const tr = document.createElement('tr');
      tr.dataset.cod = item.cod;
      tr.innerHTML = `<td>${item.cod}</td><td>${item.produto}</td><td><input type="number" class="cart-item-qtd glass-input compact-input" value="${item.qtd}" min="1" data-cod="${item.cod}" style="width: 60px; text-align: center; padding: 2px;"></td><td>${item.uni||'UN'}</td><td><button class="btn-glass btn-red btn-remove compact-btn" style="padding: 2px 8px;"><i class="fas fa-trash"></i></button></td>`;
      this.cartBody.appendChild(tr);

      for(let i=1;i<=3;i++){
        const priceContainer = document.getElementById(`precosEmpresa${i}`);
        const div = document.createElement('div'); div.className='price-entry';
        div.innerHTML = `<label>${item.produto} (Qtd: ${item.qtd})</label><input type="number" step="0.01" id="price-${i}-${item.cod}" data-empresa="${i}" data-cod="${item.cod}" placeholder="Preço Unit. (R$)" class="glass-input compact-input" />`;
        priceContainer.appendChild(div);
      }
    });

    this.cartBody.querySelectorAll('.btn-remove').forEach(btn=>btn.addEventListener('click', e=>{
      const cod = e.target.closest('tr').dataset.cod; this.cart.remove(cod); this.renderCart(); this.updateAllTotals();
    }));

    this.cartBody.querySelectorAll('.cart-item-qtd').forEach(input => {
      input.addEventListener('change', e => {
        const cod = e.target.dataset.cod;
        const newQtd = parseInt(e.target.value, 10);
        if (newQtd > 0 && this.cart.updateCartItemQuantity(cod, newQtd)) {
          this.updateAllTotals();
        }
      });
    });

    document.querySelectorAll('input[id^="freteEmpresa"]').forEach(inp=>inp.addEventListener('input', e=>this.updateCompanyTotal(e.target.id.replace('freteEmpresa',''))));
    document.querySelectorAll('.price-entry input').forEach(inp=>inp.addEventListener('input', e=>this.updateCompanyTotal(e.target.dataset.empresa)));

    this.updateAllTotals();
  },

  updateCompanyTotal(index){
    let total = 0;
    this.cart.items.forEach(item=>{
      const inp = document.getElementById(`price-${index}-${item.cod}`);
      const price = inp ? parseFloat(inp.value)||0 : 0;
      total += price * item.qtd;
    });
    const freteInput = document.getElementById(`freteEmpresa${index}`);
    const frete = freteInput ? parseFloat(freteInput.value) || 0 : 0;
    const totalInput = document.getElementById(`totalEmpresa${index}`);
    if(totalInput) totalInput.value = (total + frete).toFixed(2);
  },

  updateAllTotals(){ this.updateCompanyTotal(1); this.updateCompanyTotal(2); this.updateCompanyTotal(3); },

  async handleAddToCart(){
    const productText = this.cartProductInput.value;
    const qtd = parseInt(this.cartQtd.value);

    if(!productText || isNaN(qtd) || qtd<=0) return alert('Selecione um produto e informe uma quantidade válida.');

    const productList = document.getElementById('productList');
    const selectedOption = Array.from(productList.options).find(opt => opt.value === productText);

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

  async handleExportPdf(){
    if(this.cart.items.length===0) return alert('Adicione produtos antes de exportar');
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    const getLogoBase64 = async () => {
      return new Promise((resolve) => {
        const img = new Image();
        img.src = 'logo.png';
        img.crossOrigin = 'Anonymous';
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#FFFFFF'; 
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0);
          resolve(canvas.toDataURL('image/jpeg'));
        };
        img.onerror = () => {
          console.warn('Logo não encontrado');
          resolve(null);
        };
      });
    };

    const logoBase64 = await getLogoBase64();
    if (logoBase64) {
      doc.addImage(logoBase64, 'JPEG', 14, 10, 40, 15);
    }

    const currentUser = this._getCurrentUser()?.nome || 'Usuário não identificado';
    const dateStr = new Date().toLocaleString('pt-BR');
    const code = this.quotationCode.value || 'N/A';

    doc.setFontSize(18);
    doc.setTextColor(0, 105, 55);
    
    doc.text('Cotação - Logistica', 14, 35);

    doc.setFontSize(10);
    doc.setTextColor(0);
    doc.text(`Código: ${code}`, 14, 42);
    doc.text(`Data de Emissão: ${dateStr}`, 14, 47);
    doc.text(`Responsável: ${currentUser}`, 14, 52);

    const columns = ['Código', 'Produto', 'Quantidade', 'Unidade', 'Valor Unit.', 'Valor Total'];
    const rows = this.cart.items.map(i => [i.cod, i.produto, i.qtd, i.uni || 'UN', 'R$ 0,00', 'R$ 0,00']);

    doc.autoTable({
      head: [columns],
      body: rows,
      startY: 60,
      theme: 'grid',
      headStyles: { fillColor: [0, 105, 55], textColor: 255, fontStyle: 'bold' },
      styles: { fontSize: 10, cellPadding: 3 },
      alternateRowStyles: { fillColor: [240, 240, 240] }
    });

    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(100);
      doc.text(`Página ${i} de ${pageCount}`, doc.internal.pageSize.width - 20, doc.internal.pageSize.height - 10, { align: 'right' });
      doc.text(`Marquespan - Sistema de Compras`, 14, doc.internal.pageSize.height - 10);
    }

    doc.save(`cotacao_${code}.pdf`);
  },

  async exportSavedQuotationPdf(id, mode = 'save'){
    try {
      const { data: cotacao, error: cotErr } = await supabaseClient.from('cotacoes').select('codigo_cotacao, created_at, data_cotacao, usuario, status, id_fornecedor_vencedor').eq('id', id).single();
      if (cotErr) throw cotErr;

      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();

      const getLogoBase64 = async () => {
        return new Promise((resolve) => {
          const img = new Image();
          img.src = 'logo.png';
          img.crossOrigin = 'Anonymous';
          img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#FFFFFF'; 
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
            resolve(canvas.toDataURL('image/jpeg'));
          };
          img.onerror = () => { resolve(null); };
        });
      };

      const logoBase64 = await getLogoBase64();
      if (logoBase64) doc.addImage(logoBase64, 'JPEG', 14, 10, 40, 15);

      const userIdent = cotacao.usuario || 'N/D';
      const dateStr = new Date(cotacao.created_at || cotacao.data_cotacao).toLocaleString('pt-BR');
      const code = cotacao.codigo_cotacao || 'N/A';

      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');

      const statusConfig = {
        'Pendente':  { titulo: 'Cotação - Logística',      color: [179, 107, 0] },
        'Aprovada':  { titulo: 'Pedido - Logística',       color: [27, 122, 27] },
        'Rejeitada': { titulo: 'Cotação Rejeitada',        color: [170, 0, 0]   },
        'Recebido Parcial': { titulo: 'Recebimento Parcial', color: [37, 12, 96] },
        'Recebido':  { titulo: 'Recebimento - Logística',  color: [11, 90, 136]  }
      };

      const config = statusConfig[cotacao.status] || { titulo: 'Cotação - Logística', color: [0, 105, 55] };

      doc.setTextColor(config.color[0], config.color[1], config.color[2]);
      doc.text(config.titulo, 14, 35);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(0);
      doc.text(`Código: ${code}`, 14, 42);
      doc.text(`Data de Emissão: ${dateStr}`, 14, 47);
      doc.text(`Responsável: ${userIdent}`, 14, 52);

      let startY = 60;

      if ((cotacao.status === 'Aprovada' || cotacao.status === 'Pendente' || cotacao.status === 'Recebido') && cotacao.id_fornecedor_vencedor) {
        const { data: fornecedor } = await supabaseClient.from('fornecedores').select('nome, telefone').eq('id', cotacao.id_fornecedor_vencedor).single();
        if (fornecedor) {
            doc.setFont('helvetica', 'bold');
            doc.text(`Fornecedor: ${fornecedor.nome}`, 14, 58);
            doc.setFont('helvetica', 'normal');
            const telText = fornecedor.telefone ? `Telefone: ${fornecedor.telefone}` : '';
            if(telText) doc.text(telText, 14, 63);
            startY = telText ? 70 : 65;
        }
      }

      let columns = [];
      let rows = [];

      if (cotacao.status === 'Recebido' || cotacao.status === 'Recebido Parcial') {
        if (cotacao.id_fornecedor_vencedor) {
             const { data: orcamento } = await supabaseClient.from('cotacao_orcamentos')
                  .select('id, valor_frete')
                  .eq('id_cotacao', id)
                  .eq('id_fornecedor', cotacao.id_fornecedor_vencedor)
                  .single();
             
             const { data: precos } = await supabaseClient.from('orcamento_item_precos')
                  .select('id_produto, preco_unitario')
                  .eq('id_orcamento', orcamento?.id);
             
             const priceMap = new Map((precos || []).map(p => [p.id_produto, p.preco_unitario]));

             const { data: recebimentos, error: recErr } = await supabaseClient
                .from('recebimentos')
                .select('qtd_pedida, qtd_recebida, id_produto, produtos(codigo_principal, nome, unidade_medida)')
                .eq('id_cotacao', id);
             if (recErr) throw recErr;

             const hasDivergence = recebimentos.some(r => r.qtd_recebida !== r.qtd_pedida);

             if (hasDivergence) {
                 columns = ['Produto', 'Qtd. Pedida', 'Qtd. Recebida', 'Divergência', 'Preço Unit.', 'Preço Total'];
             } else {
                 columns = ['Produto', 'QTD', 'Preço Unit.', 'Preço Total'];
             }

             let subtotal = 0;
             rows = recebimentos.map(r => {
                 const unitPrice = priceMap.get(r.id_produto) || 0;
                 const total = unitPrice * r.qtd_recebida;
                 subtotal += total;
                 
                 const divergencia = r.qtd_recebida - r.qtd_pedida;
                 const divStr = divergencia > 0 ? `+${divergencia}` : (divergencia === 0 ? 'OK' : `${divergencia}`);
                 const priceStr = `R$ ${unitPrice.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
                 const totalStr = `R$ ${total.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;

                 if (hasDivergence) {
                     return [r.produtos?.nome || '', r.qtd_pedida, r.qtd_recebida, divStr, priceStr, totalStr];
                 } else {
                     return [r.produtos?.nome || '', r.qtd_recebida, priceStr, totalStr];
                 }
             });

             const frete = orcamento?.valor_frete || 0;
             const totalGeral = subtotal + frete;

             const emptyCols = hasDivergence ? ['', '', '', ''] : ['', ''];
             
             rows.push([...emptyCols, 'Subtotal:', `R$ ${subtotal.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`]);
             if (frete > 0) rows.push([...emptyCols, 'Frete:', `R$ ${frete.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`]);
             rows.push([...emptyCols, 'TOTAL:', `R$ ${totalGeral.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`]);
        } else {
             const { data: recebimentos, error: recErr } = await supabaseClient.from('recebimentos').select('qtd_pedida, qtd_recebida, produtos(nome)').eq('id_cotacao', id);
             if (recErr) throw recErr;
             columns = ['Produto', 'Qtd. Pedida', 'Qtd. Recebida', 'Divergência', 'Preço Unit.', 'Preço Total'];
             rows = recebimentos.map(r => [r.produtos?.nome || '', r.qtd_pedida, r.qtd_recebida, (r.qtd_recebida - r.qtd_pedida), 'R$ 0,00', 'R$ 0,00']);
        }
      } else if (cotacao.status === 'Aprovada' || cotacao.status === 'Pendente') {
        if (cotacao.id_fornecedor_vencedor) {
             const { data: orcamento } = await supabaseClient.from('cotacao_orcamentos')
                  .select('id, valor_frete')
                  .eq('id_cotacao', id)
                  .eq('id_fornecedor', cotacao.id_fornecedor_vencedor)
                  .single();
             
             const { data: precos } = await supabaseClient.from('orcamento_item_precos')
                  .select('id_produto, preco_unitario')
                  .eq('id_orcamento', orcamento?.id);
             
             const priceMap = new Map((precos || []).map(p => [p.id_produto, p.preco_unitario]));

             const { data: itens, error: itensErr } = await supabaseClient.from('cotacao_itens')
                  .select('id_produto, quantidade, produtos(codigo_principal, nome, unidade_medida)')
                  .eq('id_cotacao', id);
             if (itensErr) throw itensErr;

             columns = ['Produto', 'QTD', 'Preço Unit.', 'Preço Total'];
             let subtotal = 0;
             
             rows = itens.map(i => {
                 const unitPrice = priceMap.get(i.id_produto) || 0;
                 const total = unitPrice * i.quantidade;
                 subtotal += total;
                 return [
                     i.produtos?.nome || '',
                     i.quantidade,
                     `R$ ${unitPrice.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`,
                     `R$ ${total.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`
                 ];
             });

             const frete = orcamento?.valor_frete || 0;
             const totalGeral = subtotal + frete;

             rows.push(['', '', 'Subtotal:', `R$ ${subtotal.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`]);
             if (frete > 0) rows.push(['', '', 'Frete:', `R$ ${frete.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`]);
             rows.push(['', '', 'TOTAL:', `R$ ${totalGeral.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`]);
        } else {
             const { data: itens, error: itensErr } = await supabaseClient.from('cotacao_itens').select('quantidade, produtos(codigo_principal, nome, unidade_medida)').eq('id_cotacao', id);
             if (itensErr) throw itensErr;
             columns = ['Código', 'Produto', 'Quantidade', 'Unidade', 'Preço Unit.', 'Preço Total'];
             rows = itens.map(i => [i.produtos?.codigo_principal || '', i.produtos?.nome || '', i.quantidade, i.produtos?.unidade_medida || 'UN', 'R$ 0,00', 'R$ 0,00']);
        }
      } else {
        const { data: itens, error: itensErr } = await supabaseClient.from('cotacao_itens').select('quantidade, produtos(codigo_principal, nome, unidade_medida)').eq('id_cotacao', id);
        if (itensErr) throw itensErr;

        columns = ['Código', 'Produto', 'Quantidade', 'Unidade', 'Preço Unit.', 'Preço Total'];
        rows = itens.map(i => [i.produtos?.codigo_principal || '', i.produtos?.nome || '', i.quantidade, i.produtos?.unidade_medida || 'UN', 'R$ 0,00', 'R$ 0,00']);
      }

      doc.autoTable({
        head: [columns], body: rows, startY: 60, theme: 'grid',
        startY: startY,
        headStyles: { fillColor: [0, 105, 55], textColor: 255, fontStyle: 'bold', halign: 'center' },
        styles: { fontSize: 10, cellPadding: 3 }, alternateRowStyles: { fillColor: [240, 240, 240] }
      });

      if (mode === 'print') {
        doc.autoPrint();
        window.open(doc.output('bloburl'), '_blank');
      } else {
        doc.save(`cotacao_${code}.pdf`);
      }
    } catch(e) { console.error(e); alert('Erro ao gerar PDF'); }
  },

  async handleRegisterQuotation(){
    if(this.cart.items.length===0) return alert('Adicione produtos para registrar a cotação');
    const code = this.quotationCode.value.trim(); if(!code) return alert('Código não gerado');

    const winner = document.querySelector('input[name="empresaVencedora"]:checked');
    let idFornecedorVencedor=null, valorTotalVencedor=null;
    if(winner){
      idFornecedorVencedor = document.getElementById(`empresa${winner.value}Cot`).value; 
      valorTotalVencedor = parseFloat(document.getElementById(`totalEmpresa${winner.value}`).value)||null
    }

    try{
      if (this.editingQuotationId) {
        const { data: oldCotacao } = await supabaseClient.from('cotacoes').select('status').eq('id', this.editingQuotationId).single();
        if (oldCotacao && oldCotacao.status === 'Recebido') {
          await supabaseClient.from('recebimentos').delete().eq('id_cotacao', this.editingQuotationId);
          alert('Atenção: O lançamento de estoque anterior foi revertido.');
        }
        await supabaseClient.from('cotacao_itens').delete().eq('id_cotacao', this.editingQuotationId);
        await supabaseClient.from('cotacao_orcamentos').delete().eq('id_cotacao', this.editingQuotationId);
      }

      const userIdent = this._getCurrentUser()?.nome || 'Sistema';
      const cotacaoPayload = { 
        codigo_cotacao: code, 
        status: 'Pendente',
        id_fornecedor_vencedor:idFornecedorVencedor, 
        valor_total_vencedor:valorTotalVencedor 
      };
      if(userIdent) cotacaoPayload.usuario = userIdent;

      let cot;
      try{
        if (this.editingQuotationId) {
          cot = await SupabaseService.update('cotacoes', cotacaoPayload, { field: 'id', value: this.editingQuotationId });
        } else {
          cot = await SupabaseService.insert('cotacoes', cotacaoPayload);
        }
      }catch(err){
        const emsg = String(err?.message || err?.error || JSON.stringify(err)).toLowerCase();
        if(emsg.includes('column') && emsg.includes('usuario') && emsg.includes('does not exist')){
          delete cotacaoPayload.usuario;
          if (this.editingQuotationId) { cot = await SupabaseService.update('cotacoes', cotacaoPayload, { field: 'id', value: this.editingQuotationId }); }
          else { cot = await SupabaseService.insert('cotacoes', cotacaoPayload); }
        } else throw err;
      }
      const cotacaoId = cot[0].id;

      const itens = this.cart.items.map(i=>({ id_cotacao:cotacaoId, id_produto:i.id, quantidade:i.qtd }));
      await SupabaseService.insert('cotacao_itens', itens);

      for(let idx=1;idx<=3;idx++){
        const fornecedorId = document.getElementById(`empresa${idx}Cot`).value;
        const valorTotal = parseFloat(document.getElementById(`totalEmpresa${idx}`).value)||null;
        const valorFrete = parseFloat(document.getElementById(`freteEmpresa${idx}`).value)||null;
        if(fornecedorId && valorTotal){
          const orc = await SupabaseService.insert('cotacao_orcamentos',{ id_cotacao:cotacaoId, id_fornecedor:fornecedorId, valor_total:valorTotal, valor_frete: valorFrete, observacao:(document.getElementById(`obsEmpresa${idx}`).value||'').toUpperCase() });
          const orcamentoId = orc[0].id;
          const precos = [];
          this.cart.items.forEach(it=>{
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
    if (!this.editingQuotationId) {
      this.generateNextQuotationCode();
    }
    this.editingQuotationId = null;
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
      let q = supabaseClient.from('cotacoes').select('id,codigo_cotacao,data_cotacao,updated_at,status,valor_total_vencedor,nota_fiscal,usuario,data_recebimento,usuario_recebimento,fornecedores(nome), cotacao_itens(quantidade, produtos(nome))');
      
      if(search) q = q.ilike('codigo_cotacao',`%${search}%`);
      if(status && status!=='Todas') q = q.eq('status',status);
      
      q = q.order(this._savedQuotationsSort.field, { ascending: this._savedQuotationsSort.ascending });

      const { data, error } = await q;
      if(error) throw error;
      this.savedQuotationsTableBody.innerHTML = '';
      if(!data || data.length===0) return this.savedQuotationsTableBody.innerHTML = `<tr><td colspan="10">Nenhuma cotação encontrada.</td></tr>`;

      const usuarioLogado = this._getCurrentUser();
      const nivelUsuario = usuarioLogado ? usuarioLogado.nivel.toLowerCase() : 'default';
      const podeExcluir = !['compras', 'estoque'].includes(nivelUsuario);

      data.forEach(c=>{
        const tr = document.createElement('tr');
        const winnerName = c.fornecedores ? c.fornecedores.nome : 'N/A';
        
        let winnerDisplay = winnerName;
        if ((c.status === 'Aprovada' || c.status === 'Recebido') && c.cotacao_itens && c.cotacao_itens.length > 0) {
            const itemsTooltip = c.cotacao_itens.map(i => `${i.quantidade}x ${i.produtos?.nome || 'Produto desconhecido'}`).join('\n');
            winnerDisplay = `<span title="${itemsTooltip}" style="cursor: help; text-decoration: underline dotted;">${winnerName}</span>`;
        }

        const totalValue = c.valor_total_vencedor ? `R$ ${parseFloat(c.valor_total_vencedor).toFixed(2)}` : 'N/A';
        const notaFiscal = c.nota_fiscal || 'N/A';
        
        const dataRecebimento = c.data_recebimento ? new Date(c.data_recebimento).toLocaleString('pt-BR') : '-';
        const usuarioRecebimento = c.usuario_recebimento || '-';

        const statusSelectId = `status-select-${c.id}`;
        const initialStatus = c.status || 'Pendente';
        const isRecebido = initialStatus === 'Recebido';
        const statusClass = `quotation-status-select status-${initialStatus.replace(/\s+/g, '-')}`;
        
        const statusSelect = `<select class="${statusClass}" id="${statusSelectId}" data-id="${c.id}" ${isRecebido || nivelUsuario === 'estoque' ? 'disabled' : ''}><option value="Pendente">Pendente</option><option value="Aprovada">Aprovada</option><option value="Rejeitada">Rejeitada</option><option value="Recebido Parcial">Recebido Parcial</option><option value="Recebido">Recebido</option></select>`;
        const dateToShow = c.updated_at || c.data_cotacao;
        const formattedDate = dateToShow ? new Date(dateToShow).toLocaleString('pt-BR') : 'N/D';
        const usuarioCell = c.usuario || 'N/D';

        const btnPdfHtml = `<button class="btn-action btn-pdf" data-id="${c.id}" title="Gerar PDF"><i class="fas fa-file-pdf"></i></button>`;
        const btnExcluirHtml = podeExcluir ? ` <button class="btn-action btn-delete" data-id="${c.id}">Excluir</button>` : '';
        const podeReceber = ['estoque', 'administrador'].includes(nivelUsuario) && (c.status === 'Aprovada' || c.status === 'Recebido Parcial');
        const btnReceberHtml = podeReceber ? ` <button class="btn-action btn-receive" data-id="${c.id}">Receber</button>` : '';
        const btnEditarHtml = ((!isRecebido || nivelUsuario === 'administrador') && nivelUsuario !== 'estoque') ? ` <button class="btn-action btn-edit" data-id="${c.id}">Editar</button>` : '';
        
        tr.innerHTML = `<td>${c.codigo_cotacao}</td><td>${formattedDate}</td><td>${usuarioCell}</td><td>${winnerDisplay}</td><td>${totalValue}</td><td>${notaFiscal}</td><td>${dataRecebimento}</td><td>${usuarioRecebimento}</td><td>${statusSelect}</td><td><button class="btn-action btn-view" data-id="${c.id}">Ver</button> ${btnPdfHtml}${btnEditarHtml}${btnReceberHtml}${btnExcluirHtml}</td>`;

        this.savedQuotationsTableBody.appendChild(tr);
        
        const selEl = document.getElementById(statusSelectId);
        if(selEl){ selEl.value = initialStatus; selEl.className = `quotation-status-select status-${initialStatus}` }
      });
      
      this.savedQuotationsTableBody.querySelectorAll('.btn-view').forEach(b=>b.addEventListener('click', e=>this.openDetailPanel(e.target.dataset.id)));
      this.savedQuotationsTableBody.querySelectorAll('.btn-pdf').forEach(b=>b.addEventListener('click', e=>this.exportSavedQuotationPdf(e.target.closest('button').dataset.id)));
      this.savedQuotationsTableBody.querySelectorAll('.btn-delete').forEach(b=>b.addEventListener('click', e=>this.deleteQuotation(e.target.dataset.id)));
      this.savedQuotationsTableBody.querySelectorAll('.btn-edit').forEach(b=>b.addEventListener('click', e=>this.loadQuotationForEditing(e.target.dataset.id)));
      this.savedQuotationsTableBody.querySelectorAll('.btn-receive').forEach(b=>b.addEventListener('click', e=>this.openRecebimentoPanel(e.target.dataset.id)));
      this.savedQuotationsTableBody.querySelectorAll('.quotation-status-select').forEach(sel=>sel.addEventListener('change', (e)=>{ const id = e.target.dataset.id; const newStatus = e.target.value; this.handleChangeQuotationStatus(id, newStatus); }));
      
      this.updateSortIcons('#sectionCotacoesSalvas', this._savedQuotationsSort);
    }catch(e){console.error('Erro renderSavedQuotations',e); this.savedQuotationsTableBody.innerHTML = `<tr><td colspan="10">Erro ao carregar cotações.</td></tr>`}
  },

  async openDetailPanel(id){
    try{
      const { data:cotacao, error:cotErr } = await supabaseClient.from('cotacoes').select('*,fornecedores(nome)').eq('id',id).single(); if(cotErr) throw cotErr;
      const { data:itens } = await supabaseClient.from('cotacao_itens').select('quantidade, produtos(codigo_principal,nome,id)').eq('id_cotacao',id);
      const { data:orcamentos } = await supabaseClient.from('cotacao_orcamentos').select('*,fornecedores(nome),valor_frete').eq('id_cotacao',id);
      for(const o of orcamentos){ const { data:precos } = await supabaseClient.from('orcamento_item_precos').select('preco_unitario,id_produto').eq('id_orcamento',o.id); o.precos=precos }
      const dataDisplay = cotacao.updated_at ? new Date(cotacao.updated_at).toLocaleString('pt-BR') : (cotacao.data_cotacao ? new Date(cotacao.data_cotacao).toLocaleString('pt-BR') : 'N/A');
      const usuarioDisplay = cotacao.usuario || cotacao.usuario_lancamento || cotacao.usuario_id || (cotacao.created_by ? String(cotacao.created_by) : null) || 'N/D';
      const statusBadge = `<span class="status status-${cotacao.status}">${cotacao.status}</span>`;
      const notaFiscalDisplay = cotacao.nota_fiscal ? `<p><strong>Nota Fiscal:</strong> ${cotacao.nota_fiscal}</p>` : '';

      let html = `<p><strong>Data/Hora:</strong> ${dataDisplay}</p><p><strong>Status:</strong> ${statusBadge}</p><p><strong>Usuário:</strong> ${usuarioDisplay}</p>${notaFiscalDisplay}<hr><h3>Orçamentos</h3>`;
      
      orcamentos.forEach(o=>{
        const isWinner = o.id_fornecedor===cotacao.id_fornecedor_vencedor; 
        const freteDisplay = o.valor_frete ? `<p><strong>Frete:</strong> R$ ${parseFloat(o.valor_frete).toFixed(2)}</p>` : '';
        html += `<div class="card ${isWinner?'winner':''}">${isWinner? '<span class="status status-Aprovada" style="float:right; margin-top:-5px;">VENCEDOR</span>':''}<h4>${o.fornecedores.nome}</h4><p><strong>Total+Frete:</strong> R$ ${parseFloat(o.valor_total).toFixed(2)}</p>${freteDisplay}<p><strong>Obs:</strong> ${o.observacao||'Nenhuma'}</p><table class="data-grid"><thead><tr><th>Produto</th><th>QTD</th><th>Preço Unitário</th><th>Preço Total</th></tr></thead><tbody>${o.precos.map(p=>{
          const itemDaCotacao = itens.find(it=>it.produtos.id===p.id_produto);
          const nomeProduto = itemDaCotacao ? itemDaCotacao.produtos.nome : 'Produto não encontrado';
          const quantidade = itemDaCotacao ? itemDaCotacao.quantidade : 0;
          const precoUnitario = parseFloat(p.preco_unitario);
          const precoTotal = quantidade * precoUnitario;
          return `<tr><td>${nomeProduto}</td><td>${quantidade}</td><td>R$ ${precoUnitario.toFixed(2)}</td><td>R$ ${precoTotal.toFixed(2)}</td></tr>`
        }).join('')}</tbody></table></div>`
      });
      this.quotationDetailTitle.innerHTML = `Detalhes: <span style="color: red; font-weight: bold;">${cotacao.codigo_cotacao}</span>`;

      this.detailPanel.dataset.id = id;

      if (cotacao.status === 'Recebido') {
        const { data: recebimentos, error: recErr } = await supabaseClient
          .from('recebimentos')
          .select('qtd_pedida, qtd_recebida, produtos(nome)')
          .eq('id_cotacao', id);

        if (recErr) throw recErr;

        if (recebimentos && recebimentos.length > 0) {
          html += `<hr><h3>Detalhes do Recebimento</h3>`;
          html += `<table class="data-grid"><thead><tr><th>Produto</th><th>Qtd. Pedida</th><th>Qtd. Recebida</th><th>Divergência</th></tr></thead><tbody>`;
          recebimentos.forEach(rec => {
            const divergencia = rec.qtd_recebida - rec.qtd_pedida;
            const divergenciaClass = divergencia < 0 ? 'divergence-negative' : (divergencia > 0 ? 'divergence-positive' : '');
            const divergenciaSignal = divergencia > 0 ? `+${divergencia}` : divergencia;
            html += `<tr><td>${rec.produtos.nome}</td><td>${rec.qtd_pedida}</td><td>${rec.qtd_recebida}</td><td class="${divergenciaClass}">${divergencia !== 0 ? divergenciaSignal : 'OK'}</td></tr>`;
          });
          html += `</tbody></table>`;
        }
      }

      this.quotationDetailBody.innerHTML = html;
      this.detailPanelBackdrop.classList.remove('hidden');
    }catch(e){console.error(e);alert('Erro ao abrir detalhes')}
  },

  async loadQuotationForEditing(id) {
    if (!confirm('Deseja editar esta cotação? As informações não salvas no formulário atual serão perdidas.')) return;

    try {
      this.clearQuotationForm();

      const { data: cotacao, error: cotErr } = await supabaseClient.from('cotacoes').select('*').eq('id', id).single();
      if (cotErr) throw cotErr;

      const { data: itens } = await supabaseClient.from('cotacao_itens').select('quantidade, produtos(*)').eq('id_cotacao', id);
      if (!itens) throw new Error('Itens da cotação não encontrados.');

      const { data: orcamentos } = await supabaseClient.from('cotacao_orcamentos').select('*, fornecedores(id, nome)').eq('id_cotacao', id);
      if (!orcamentos) throw new Error('Orçamentos não encontrados.');

      for (const o of orcamentos) {
        const { data: precos } = await supabaseClient.from('orcamento_item_precos').select('preco_unitario, id_produto').eq('id_orcamento', o.id);
        o.precos = precos || [];
      }

      this.editingQuotationId = id;
      this.quotationCode.value = cotacao.codigo_cotacao;

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

        if (cotacao.id_fornecedor_vencedor && orc.id_fornecedor === cotacao.id_fornecedor_vencedor) {
          const radio = document.getElementById(`vencedor${cardIndex}`);
          if (radio) radio.checked = true;
        }
      });

      this.updateAllTotals();
      this.showSection('sectionRealizarCotacoes');
    } catch (e) { console.error('Erro ao carregar cotação para edição', e); alert('Não foi possível carregar a cotação para edição.'); }
  },

  async openRecebimentoPanel(id) {
    try {
      const { data: cotacao, error: cotErr } = await supabaseClient.from('cotacoes').select('id, codigo_cotacao, id_fornecedor_vencedor, nota_fiscal').eq('id', id).single();
      if (cotErr) throw cotErr;

      const { data: itens } = await supabaseClient.from('cotacao_itens').select('quantidade, produtos(id, nome)').eq('id_cotacao', id);

      if(this.nfContainer) {
          this.nfContainer.innerHTML = '';
          const nfs = cotacao.nota_fiscal ? cotacao.nota_fiscal.split(',').map(s => s.trim()).filter(s => s) : [];
          
          if (nfs.length > 0) {
              nfs.forEach(nf => {
                  const div = document.createElement('div');
                  div.className = 'form-group';
                  div.style.marginTop = '10px';
                  div.innerHTML = `<label>Nota Fiscal:</label><input type="text" class="nota-fiscal-input" value="${nf}" placeholder="Digite o número da NF">`;
                  this.nfContainer.appendChild(div);
              });
          } else {
              this.nfContainer.innerHTML = `
                <div class="form-group">
                    <label>Nota Fiscal:</label>
                    <input type="text" class="nota-fiscal-input" placeholder="Digite o número da NF">
                </div>`;
          }
      }

      const { data: recebimentosAnteriores } = await supabaseClient.from('recebimentos').select('id_produto, qtd_recebida').eq('id_cotacao', id);
      const recebidoMap = {};
      if (recebimentosAnteriores) {
        recebimentosAnteriores.forEach(r => {
            recebidoMap[r.id_produto] = (recebidoMap[r.id_produto] || 0) + r.qtd_recebida;
        });
      }

      let priceMap = new Map();
      let frete = 0;
      if (cotacao.id_fornecedor_vencedor) {
          const { data: orcamento } = await supabaseClient.from('cotacao_orcamentos')
            .select('id, valor_frete')
            .eq('id_cotacao', id)
            .eq('id_fornecedor', cotacao.id_fornecedor_vencedor)
            .single();
          
          if (orcamento) {
              frete = parseFloat(orcamento.valor_frete) || 0;
              const { data: precos } = await supabaseClient.from('orcamento_item_precos')
                .select('id_produto, preco_unitario')
                .eq('id_orcamento', orcamento.id);
              
              if (precos) {
                  precos.forEach(p => priceMap.set(p.id_produto, parseFloat(p.preco_unitario)));
              }
          }
      }

      document.getElementById('recebimentoPanelTitle').textContent = `Recebimento - Cotação ${cotacao.codigo_cotacao}`;
      this.renderRecebimentoItems(itens, id, priceMap, frete, recebidoMap);
      this.recebimentoPanelBackdrop?.classList.remove('hidden');
    } catch (e) {
      console.error('Erro ao abrir painel de recebimento', e);
      alert('Não foi possível carregar os dados para recebimento.');
    }
  },

  updateRecebimentoCalculations() {
      let totalItens = 0;
      const frete = parseFloat(this.recebimentoItemsContainer.dataset.frete) || 0;

      this.recebimentoItemsContainer.querySelectorAll('.recebimento-item').forEach(div => {
          const input = div.querySelector('.qtd-recebida');
          const divDivergencia = div.querySelector('.item-divergencia');
          const divTotal = div.querySelector('.item-total');
          
          const qtdPedida = parseFloat(div.dataset.qtdPedida);
          const preco = parseFloat(div.dataset.preco);
          const qtdRecebida = parseFloat(input.value);

          if (isNaN(qtdRecebida)) return;

          const diff = qtdRecebida - qtdPedida;
          if (diff === 0) {
              divDivergencia.textContent = 'OK';
              divDivergencia.style.color = '#28a745';
          } else {
              divDivergencia.textContent = diff > 0 ? `+${diff}` : `${diff}`;
              divDivergencia.style.color = diff > 0 ? '#007bff' : '#dc3545';
          }

          const totalItem = qtdRecebida * preco;
          divTotal.textContent = `R$ ${totalItem.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
          
          totalItens += totalItem;
      });

      const totalGeral = totalItens + frete;
      const totalDisplay = document.getElementById('recebimentoTotalValue');
      if(totalDisplay) totalDisplay.textContent = totalGeral.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
  },

  renderRecebimentoItems(itens, cotacaoId, priceMap = new Map(), frete = 0, recebidoMap = {}) {
    if (!this.recebimentoItemsContainer) return;
    this.recebimentoItemsContainer.innerHTML = '';
    this.recebimentoItemsContainer.dataset.cotacaoId = cotacaoId;
    this.recebimentoItemsContainer.dataset.frete = frete;

    itens.forEach(item => {
      const qtdJaRecebida = recebidoMap[item.produtos.id] || 0;
      const qtdRestante = Math.max(0, item.quantidade - qtdJaRecebida);
      const inputValue = qtdRestante;

      const div = document.createElement('div');
      div.className = 'recebimento-item';
      div.dataset.itemId = item.produtos.id;
      div.dataset.qtdPedida = item.quantidade;
      
      const preco = priceMap.get(item.produtos.id) || 0;
      div.dataset.preco = preco;

      div.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
            <label for="qtd-recebida-${item.produtos.id}" style="margin:0;">${item.produtos.nome}</label>
            <span style="font-size:0.85em; color:#666;">Pedido: ${item.quantidade} | Já Rec.: ${qtdJaRecebida}</span>
        </div>
        <div style="display:flex; gap:10px; align-items:center;">
            <input type="number" class="qtd-recebida" id="qtd-recebida-${item.produtos.id}" placeholder="Qtd" value="${inputValue}" min="0" style="flex:1;" />
            <div class="item-divergencia" style="font-weight:bold; font-size:0.9em; width:40px; text-align:center; color:#28a745;">OK</div>
            <div class="item-total" style="font-size:0.9em; width:100px; text-align:right;">R$ 0,00</div>
        </div>
      `;
      this.recebimentoItemsContainer.appendChild(div);
    });

    const totalDiv = document.createElement('div');
    totalDiv.style.cssText = 'margin-top: 20px; padding: 15px; background: #e9ecef; border-radius: 8px; text-align: right; font-size: 1.1em; border: 1px solid #dee2e6;';
    totalDiv.innerHTML = `
        <div style="margin-bottom:5px; font-size:0.9em; color:#666;">Frete: R$ ${frete.toFixed(2)}</div>
        <div style="font-weight:bold; color:#006937;">Total Recebimento: <span id="recebimentoTotalValue">R$ 0,00</span></div>
    `;
    this.recebimentoItemsContainer.appendChild(totalDiv);

    this.recebimentoItemsContainer.querySelectorAll('.qtd-recebida').forEach(input => {
        input.addEventListener('input', () => this.updateRecebimentoCalculations());
    });

    this.updateRecebimentoCalculations();

    const btnSalvar = document.getElementById('btnSalvarRecebimento');
    const usuarioLogado = this._getCurrentUser();
    const nivelUsuario = usuarioLogado ? usuarioLogado.nivel.toLowerCase() : '';
    if (btnSalvar) {
      if (['estoque', 'administrador', 'compras'].includes(nivelUsuario)) {
        btnSalvar.style.display = 'block';
      } else {
        btnSalvar.style.display = 'none';
      }
    }
  },

  addNFInput(){
    if(!this.nfContainer) return;
    const div = document.createElement('div');
    div.className = 'form-group';
    div.style.marginTop = '10px';
    div.innerHTML = `<input type="text" class="nota-fiscal-input" placeholder="Digite o número da NF">`;
    this.nfContainer.appendChild(div);
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
    const form = this.formCadastrarProduto;
    const editingId = form.dataset.editingId;

    const payload = {
      codigo_principal: document.getElementById('produtoCodigo1').value,
      codigo_secundario: document.getElementById('produtoCodigo2').value,
      nome: document.getElementById('produtoNome').value,
      unidade_medida: document.getElementById('produtoUnidade').value,
    };

    if (!payload.codigo_principal || !payload.nome) {
      return alert('Os campos "Código 1" e "Nome do Produto" são obrigatórios.');
    }

    try {
      if (editingId) {
        await SupabaseService.update('produtos', payload, { field: 'id', value: editingId });
        alert('✅ Produto atualizado com sucesso!');
      } else {
        await SupabaseService.insert('produtos', payload);
        alert('✅ Produto cadastrado com sucesso!');
      }
      this.clearProductForm();
      this.renderProdutosGrid();
    } catch(err) {
      console.error(err);
      alert(`❌ Erro ao ${editingId ? 'atualizar' : 'cadastrar'} produto.`);
    }
  },

  clearProductForm() {
    this.formCadastrarProduto.reset();
    this.formCadastrarProduto.dataset.editingId = '';
    this.btnSubmitProduto.textContent = 'Cadastrar';
  },

  async loadProductForEditing(id) {
    try {
      const [product] = await SupabaseService.list('produtos', '*', { eq: { field: 'id', value: id } });
      if (!product) return alert('Produto não encontrado.');

      this.formCadastrarProduto.dataset.editingId = id;
      document.getElementById('produtoCodigo1').value = product.codigo_principal || '';
      document.getElementById('produtoCodigo2').value = product.codigo_secundario || '';
      document.getElementById('produtoNome').value = product.nome || '';
      document.getElementById('produtoUnidade').value = product.unidade_medida || '';

      this.btnSubmitProduto.textContent = 'Atualizar';
      this.formCadastrarProduto.scrollIntoView({ behavior: 'smooth' });
    } catch (e) {
      console.error('Erro ao carregar produto para edição', e);
    }
  },

  async handleFornecedorForm(e){
    e.preventDefault();
    const form = this.formCadastrarFornecedor;
    const editingId = form.dataset.editingId;

    const payload = {
      nome: document.getElementById('fornecedorNome').value,
      telefone: document.getElementById('fornecedorTelefone').value,
    };

    if (!payload.nome) {
      return alert('O campo "Nome do Fornecedor" é obrigatório.');
    }

    try {
      if (editingId) {
        await SupabaseService.update('fornecedores', payload, { field: 'id', value: editingId });
        alert('✅ Fornecedor atualizado com sucesso!');
      } else {
        await SupabaseService.insert('fornecedores', payload);
        alert('✅ Fornecedor cadastrado com sucesso!');
      }
      this.clearFornecedorForm();
      this.renderFornecedoresGrid();
    } catch(err) {
      console.error(err);
      alert(`❌ Erro ao ${editingId ? 'atualizar' : 'cadastrar'} fornecedor.`);
    }
  },

  clearFornecedorForm() {
    this.formCadastrarFornecedor.reset();
    this.formCadastrarFornecedor.dataset.editingId = '';
    this.btnSubmitFornecedor.textContent = 'Cadastrar';
  },

  async loadFornecedorForEditing(id) {
    try {
      const [fornecedor] = await SupabaseService.list('fornecedores', '*', { eq: { field: 'id', value: id } });
      if (!fornecedor) return alert('Fornecedor não encontrado.');

      this.formCadastrarFornecedor.dataset.editingId = id;
      document.getElementById('fornecedorNome').value = fornecedor.nome || '';
      document.getElementById('fornecedorTelefone').value = fornecedor.telefone || '';

      this.btnSubmitFornecedor.textContent = 'Atualizar';
      this.formCadastrarFornecedor.scrollIntoView({ behavior: 'smooth' });
    } catch (e) {
      console.error('Erro ao carregar fornecedor para edição', e);
    }
  },

  handleProdutoTableClick(e){
    const btn = e.target.closest('button');
    if(!btn) return;
    const id = btn.dataset.id;
    if(btn.classList.contains('btn-delete') && this._getCurrentUser()?.nivel.toLowerCase() !== 'compras') {
      if(confirm('Excluir produto?')) {
        SupabaseService.remove('produtos', {field:'id',value:id}).then(() => this.renderProdutosGrid());
      }
    }
    if (btn.classList.contains('btn-edit')) {
      this.loadProductForEditing(id);
    }
  },

  handleFornecedorTableClick(e){
    const btn = e.target.closest('button');
    if(!btn) return;
    const id = btn.dataset.id;
    if(btn.classList.contains('btn-delete') && this._getCurrentUser()?.nivel.toLowerCase() !== 'compras') {
      if(confirm('Excluir fornecedor?')) {
        SupabaseService.remove('fornecedores', {field:'id',value:id}).then(() => this.renderFornecedoresGrid());
      }
    }
    if (btn.classList.contains('btn-edit')) {
      this.loadFornecedorForEditing(id);
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

  toggleSavedQuotationsSort(field){
    if(this._savedQuotationsSort.field === field) {
      this._savedQuotationsSort.ascending = !this._savedQuotationsSort.ascending;
    } else {
      this._savedQuotationsSort.field = field;
      this._savedQuotationsSort.ascending = true;
    }
    this.renderSavedQuotations();
  },

  updateSortIcons(sectionId, sortState){
    const ths = document.querySelectorAll(`${sectionId} .data-grid thead th[data-field]`);
    ths.forEach(th => {
      const icon = th.querySelector('i');
      if(icon){
        icon.className = 'fas fa-sort';
        if(th.getAttribute('data-field') === sortState.field){
           icon.className = sortState.ascending ? 'fas fa-sort-up' : 'fas fa-sort-down';
        }
      }
    });
  },

  async renderProdutosGrid(){
    try {
      const searchTerm = document.getElementById('searchProdutoInput')?.value.trim();
      let queryOptions = {orderBy: this._produtosSort.field, ascending: this._produtosSort.ascending};

      if (searchTerm) {
        queryOptions.ilike = { field: 'nome', value: `%${searchTerm}%` };
      }

      const produtos = await SupabaseService.list('produtos', 'id, codigo_principal, codigo_secundario, nome, unidade_medida', queryOptions);
      this.produtosTableBody.innerHTML = produtos.map(p => `
        <tr>
          <td>${p.codigo_principal || ''}</td>
          <td>${p.codigo_secundario || ''}</td>
          <td>${p.nome || ''}</td>
          <td>${p.unidade_medida || ''}</td>
          <td>
            <button class="btn-edit" data-id="${p.id}">Editar</button>
            <button class="btn-delete" data-id="${p.id}">Excluir</button>
          </td>
        </tr>`).join('');
      
      this.updateSortIcons('#sectionCadastrarProdutos', this._produtosSort);
    } catch(e) {
      console.error('Erro ao carregar produtos', e);
    }
  },

  async renderFornecedoresGrid(){
    try {
      const searchTerm = this.searchFornecedorInput?.value.trim();
      let queryOptions = {orderBy: this._fornecedoresSort.field, ascending: this._fornecedoresSort.ascending};

      if (searchTerm) {
        queryOptions.ilike = { field: 'nome', value: `%${searchTerm}%` };
      }

      const fornecedores = await SupabaseService.list('fornecedores', 'id, nome, telefone', queryOptions);
      this.fornecedoresTableBody.innerHTML = fornecedores.map(f => `
        <tr>
          <td>${f.nome || ''}</td>
          <td>${f.telefone || ''}</td>
          <td>
            <button class="btn-edit" data-id="${f.id}">Editar</button>
            <button class="btn-delete" data-id="${f.id}">Excluir</button>
          </td>
        </tr>`).join('');

      this.updateSortIcons('#sectionCadastrarFornecedor', this._fornecedoresSort);
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

  async salvarRecebimento() {
    const cotacaoId = this.recebimentoItemsContainer.dataset.cotacaoId;

    if (!cotacaoId || cotacaoId.length < 36) {
        alert('❌ Erro crítico: ID da cotação inválido. Não é possível salvar o recebimento.');
        return;
    }

    const itens = [];
    document.querySelectorAll('.recebimento-item').forEach(div => {
        const idProduto = div.dataset.itemId;
        const qtdPedida = parseFloat(div.dataset.qtdPedida);
        const qtd = parseFloat(div.querySelector('.qtd-recebida').value);
        if (!isNaN(qtd) && qtd > 0 && idProduto && idProduto.length >= 36) {
            itens.push({
                id_cotacao: cotacaoId,
                id_produto: idProduto,
                qtd_recebida: qtd,
                qtd_pedida: qtdPedida,
                data_recebimento: new Date().toISOString()
            });
        }
    });

    if (itens.length) {
        try {
            // 1. Buscar informações da cotação para o histórico (código e NFs)
            const { data: cotacaoInfo } = await supabaseClient.from('cotacoes').select('codigo_cotacao').eq('id', cotacaoId).single();
            const codigoCotacao = cotacaoInfo?.codigo_cotacao || 'N/A';
            
            const nfInputs = document.querySelectorAll('.nota-fiscal-input');
            const nfs = Array.from(nfInputs).map(i => i.value.trim()).filter(v => v !== '').join(', ');
            const obsHistorico = `Recebimento Compras - Cotação ${codigoCotacao}${nfs ? ' - NF: ' + nfs : ''}`;

            // 2. Itera sobre os itens para salvar o recebimento e atualizar o estoque
            for (const item of itens) {
                // Salva o registro de recebimento individual
                await SupabaseService.insert('recebimentos', item);

                // Atualiza o estoque do produto
                try {
                    const { data: produto } = await supabaseClient.from('produtos').select('quantidade_em_estoque').eq('id', item.id_produto).single();
                    
                    if (produto) {
                        const qtdAnterior = parseFloat(produto.quantidade_em_estoque) || 0;
                        const novaQtd = qtdAnterior + parseFloat(item.qtd_recebida);
                        
                        // Atualiza a quantidade na tabela 'produtos'
                        await supabaseClient.from('produtos').update({ quantidade_em_estoque: novaQtd }).eq('id', item.id_produto);

                        // REGISTRA NO HISTÓRICO DE MOVIMENTAÇÕES (Para aparecer no Estoque Geral)
                        await supabaseClient.from('movimentacoes_estoque').insert({
                            produto_id: item.id_produto,
                            tipo_movimentacao: 'ENTRADA',
                            quantidade: item.qtd_recebida,
                            quantidade_anterior: qtdAnterior,
                            quantidade_nova: novaQtd,
                            usuario: this._getCurrentUser()?.nome || 'Sistema',
                            observacao: obsHistorico // Usa a observação padronizada
                        });
                    }
                } catch (errEstoque) {
                    console.error(`Erro ao atualizar estoque do produto ${item.id_produto}:`, errEstoque);
                    // Continua o processo mesmo que um item falhe na atualização de estoque
                }
            }

            // 3. Verificar se o pedido foi totalmente recebido para definir o status
            const { data: todosItens } = await supabaseClient.from('cotacao_itens').select('id_produto, quantidade').eq('id_cotacao', cotacaoId);
            const { data: todosRecebimentos } = await supabaseClient.from('recebimentos').select('id_produto, qtd_recebida').eq('id_cotacao', cotacaoId);
            
            const totalRecebidoMap = {};
            todosRecebimentos?.forEach(r => {
                totalRecebidoMap[r.id_produto] = (totalRecebidoMap[r.id_produto] || 0) + r.qtd_recebida;
            });

            let statusFinal = 'Recebido';
            if (todosItens) {
                for (const item of todosItens) {
                    const recebido = totalRecebidoMap[item.id_produto] || 0;
                    if (recebido < item.quantidade) {
                        statusFinal = 'Recebido Parcial';
                        break;
                    }
                }
            }

            // 4. Preparar o payload para atualizar a cotação principal
            const updatePayload = {
                status: statusFinal,
                data_recebimento: new Date().toISOString(),
                usuario_recebimento: this._getCurrentUser()?.nome || 'Sistema'
            };
            
            // Atualiza o campo nota_fiscal na cotação com base nos inputs
            const notaFiscalStr = Array.from(document.querySelectorAll('.nota-fiscal-input')).map(i => i.value.trim()).filter(v => v).join(', ');
            if (notaFiscalStr) {
                updatePayload.nota_fiscal = notaFiscalStr;
            }

            // 5. Atualizar a cotação
            await SupabaseService.update('cotacoes', updatePayload, { field: 'id', value: cotacaoId });
            
            alert('Recebimento salvo com sucesso!');
            this.closeRecebimentoPanel();
            this.renderSavedQuotations();

        } catch (e) {
            console.error(e);
            alert('Erro ao salvar recebimento: ' + e.message);
        }
    } else {
        alert('Nenhum item válido para receber');
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  UI.init();
  window.UI = UI;
  window.SupabaseService = SupabaseService;
});
