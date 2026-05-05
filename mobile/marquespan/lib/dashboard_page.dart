import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:marquespan/models/user.dart';
import 'package:marquespan/widgets/app_drawer.dart';
import 'package:intl/intl.dart'; // For currency formatting

class DashboardPage extends StatefulWidget {
  final User? user;

  const DashboardPage({Key? key, this.user}) : super(key: key);

  @override
  State<DashboardPage> createState() => _DashboardPageState();
}

class _DashboardPageState extends State<DashboardPage> {
  int _totalVeiculos = 0;
  int _totalManutencoes = 0;
  double _custoTotalManutencoes = 0.0;
  double _litrosAbastecidos = 0.0;
  bool _isLoading = true;
  String _errorMessage = '';

  @override
  void initState() {
    super.initState();
    _fetchKpiData();
  }

  Future<void> _fetchKpiData() async {
    setState(() {
      _isLoading = true;
      _errorMessage = '';
    });

    try {
      final now = DateTime.now();
      final firstDayOfMonth = DateTime(now.year, now.month, 1);
      final lastDayOfMonth = DateTime(now.year, now.month + 1, 0);

      // Fetch Total Veiculos
      final veiculosCountResponse = await Supabase.instance.client
          .from('veiculos')
          .count(CountOption.exact);
      _totalVeiculos = veiculosCountResponse;

      // Fetch Total Manutencoes
      final manutencoesCountResponse = await Supabase.instance.client
          .from('coletas_manutencao_checklist')
          .select('id',
              count: CountOption.exact)
          .eq('status', 'FINALIZADO')
          .gte('created_at', firstDayOfMonth.toIso8601String())
          .lte('created_at', lastDayOfMonth.toIso8601String());
      _totalManutencoes = manutencoesCountResponse.count;

      // Fetch Custo Total Manutencoes
      final custoTotalResponse = await Supabase.instance.client
          .from('coletas_manutencao_checklist')
          .select('valor')
          .gte('created_at', firstDayOfMonth.toIso8601String())
          .lte('created_at', lastDayOfMonth.toIso8601String());
      _custoTotalManutencoes = custoTotalResponse
          .map((item) => (item['valor'] as num?)?.toDouble() ?? 0.0)
          .fold(0.0, (sum, value) => sum + value);

      // Fetch Litros Abastecidos
      final litrosAbastecidosResponse = await Supabase.instance.client
          .from('abastecimentos')
          .select('qtd_litros')
          .neq('numero_nota', 'AJUSTE DE ESTOQUE')
          .gte('data', firstDayOfMonth.toIso8601String())
          .lte('data', lastDayOfMonth.toIso8601String());
      _litrosAbastecidos = litrosAbastecidosResponse
          .map((item) => (item['qtd_litros'] as num?)?.toDouble() ?? 0.0)
          .fold(0.0, (sum, value) => sum + value);
    } catch (e) {
      _errorMessage = 'Erro ao carregar dados: ${e.toString()}';
      debugPrint('Error fetching KPI data: $e');
    } finally {
      setState(() {
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Dashboard Marquespan', style: TextStyle(color: Colors.white)),
        backgroundColor: const Color(0xFF006937),
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      drawer: AppDrawer(user: widget.user),
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFFe0f2f1), Color(0xFFc8e6c9)], // Light green gradient for background
          ),
        ),
        child: _isLoading
            ? const Center(child: CircularProgressIndicator(color: Color(0xFF006937)))
            : _errorMessage.isNotEmpty
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.all(16.0),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Text(_errorMessage, style: const TextStyle(color: Colors.red, fontSize: 16)),
                          const SizedBox(height: 20),
                          ElevatedButton(
                            onPressed: _fetchKpiData,
                            child: const Text('Tentar Novamente'),
                          ),
                        ],
                      ),
                    ),
                  )
                : RefreshIndicator(
                    onRefresh: _fetchKpiData,
                    color: const Color(0xFF006937),
                    child: SingleChildScrollView(
                      padding: const EdgeInsets.all(16.0),
                      physics: const AlwaysScrollableScrollPhysics(),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Olá, ${widget.user?.nome ?? 'Usuário'}!',
                            style: const TextStyle(
                              fontSize: 24,
                              fontWeight: FontWeight.bold,
                              color: Color(0xFF004d29),
                            ),
                          ),
                          const SizedBox(height: 20),
                          GridView.count(
                            crossAxisCount: 2,
                            shrinkWrap: true,
                            physics: const NeverScrollableScrollPhysics(),
                            mainAxisSpacing: 16.0,
                            crossAxisSpacing: 16.0,
                            children: [
                              _buildKpiCard(
                                icon: Icons.local_gas_station,
                                title: 'Litros Abastecidos',
                                value: '${NumberFormat.decimalPattern('pt_BR').format(_litrosAbastecidos)} L',
                                color: Colors.blueAccent,
                              ),
                              _buildKpiCard(
                                icon: Icons.build,
                                title: 'Custo Total Manutenções',
                                value: NumberFormat.currency(locale: 'pt_BR', symbol: 'R\$').format(_custoTotalManutencoes),
                                color: Colors.green,
                              ),
                              _buildKpiCard(
                                icon: Icons.local_shipping,
                                title: 'Veículos Cadastrados',
                                value: _totalVeiculos.toString(),
                                color: Colors.orange,
                              ),
                              _buildKpiCard(
                                icon: Icons.check_circle,
                                title: 'Manutenções Finalizadas',
                                value: _totalManutencoes.toString(),
                                color: Colors.cyan,
                              ),
                              _buildKpiCard(
                                icon: Icons.attach_money,
                                title: 'Multas',
                                value: NumberFormat.currency(locale: 'pt_BR', symbol: 'R\$').format(0.00),
                                color: Colors.redAccent,
                              ),
                              _buildKpiCard(
                                icon: Icons.toll,
                                title: 'Pedágios',
                                value: NumberFormat.currency(locale: 'pt_BR', symbol: 'R\$').format(0.00),
                                color: Colors.purpleAccent,
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
      ),
    );
  }

  Widget _buildKpiCard({required IconData icon, required String title, required String value, required Color color}) {
    return Card(
      elevation: 8,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(15)),
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(15),
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [color.withOpacity(0.8), color.withOpacity(0.6)],
          ),
        ),
        child: Padding(
          padding: const EdgeInsets.all(16.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Icon(icon, size: 36, color: Colors.white),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 14,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    value,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 22,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}