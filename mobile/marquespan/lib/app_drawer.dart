import 'package:flutter/material.dart';
import 'package:marquespan/models/user.dart';
import 'package:marquespan/services/user_service.dart';
import 'package:marquespan/pages/dashboard_page.dart'; // Assuming DashboardPage is the main page
import 'package:marquespan/main.dart'; // For LoginPage

class AppDrawer extends StatelessWidget {
  final User? user;

  const AppDrawer({Key? key, this.user}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final userLevel = user?.nivel.toLowerCase() ?? 'guest';

    return Drawer(
      child: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFF006937), Color(0xFF004d29)],
          ),
        ),
        child: ListView(
          padding: EdgeInsets.zero,
          children: <Widget>[
            DrawerHeader(
              decoration: const BoxDecoration(
                color: Colors.transparent,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const CircleAvatar(
                    radius: 30,
                    backgroundColor: Colors.white,
                    child: Icon(Icons.person, size: 40, color: Color(0xFF006937)),
                  ),
                  const SizedBox(height: 10),
                  Text(
                    user?.nome ?? 'Visitante',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  Text(
                    user?.nivel ?? 'Nível Desconhecido',
                    style: const TextStyle(
                      color: Colors.white70,
                      fontSize: 14,
                    ),
                  ),
                ],
              ),
            ),
            _buildDrawerItem(
              context,
              icon: Icons.dashboard,
              title: 'Dashboard',
              onTap: () {
                Navigator.pop(context); // Close the drawer
                // Navigate to DashboardPage if not already there
                if (ModalRoute.of(context)?.settings.name != '/') {
                  Navigator.pushReplacementNamed(context, '/');
                }
              },
            ),
            if (userLevel == 'administrador' || userLevel == 'gerencia' || userLevel == 'coleta_km')
              _buildDrawerItem(
                context,
                icon: Icons.speed,
                title: 'Coletar KM',
                onTap: () {
                  Navigator.pop(context);
                  // TODO: Navigate to ColetarKMPage
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Navegar para Coletar KM')),
                  );
                },
              ),
            if (userLevel == 'administrador' || userLevel == 'gerencia')
              _buildDrawerItem(
                context,
                icon: Icons.route,
                title: 'Retorno Rota',
                onTap: () {
                  Navigator.pop(context);
                  // TODO: Navigate to RetornoRotaPage
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Navegar para Retorno Rota')),
                  );
                },
              ),
            if (userLevel == 'administrador' || userLevel == 'estoque')
              _buildDrawerItem(
                context,
                icon: Icons.oil_barrel,
                title: 'Engraxe',
                onTap: () {
                  Navigator.pop(context);
                  // TODO: Navigate to EngraxePage
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Navegar para Engraxe')),
                  );
                },
              ),
            if (userLevel == 'administrador' || userLevel == 'estoque')
              _buildDrawerItem(
                context,
                icon: Icons.car_wash,
                title: 'Lavagem',
                onTap: () {
                  Navigator.pop(context);
                  // TODO: Navigate to LavagemPage
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Navegar para Lavagem')),
                  );
                },
              ),
            if (userLevel == 'administrador' || userLevel == 'estoque')
              _buildDrawerItem(
                context,
                icon: Icons.local_gas_station,
                title: 'Abastecimento',
                onTap: () {
                  Navigator.pop(context);
                  // TODO: Navigate to AbastecimentoPage
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Navegar para Abastecimento')),
                  );
                },
              ),
            if (userLevel == 'administrador')
              _buildDrawerItem(
                context,
                icon: Icons.people,
                title: 'Usuários',
                onTap: () {
                  Navigator.pop(context);
                  // TODO: Navigate to UsuariosPage
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Navegar para Usuários')),
                  );
                },
              ),
            if (userLevel == 'administrador')
              _buildDrawerItem(
                context,
                icon: Icons.security,
                title: 'Permissões',
                onTap: () {
                  Navigator.pop(context);
                  // TODO: Navigate to PermissoesPage
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Navegar para Permissões')),
                  );
                },
              ),
            const Divider(color: Colors.white70),
            _buildDrawerItem(
              context,
              icon: Icons.logout,
              title: 'Sair',
              onTap: () async {
                await UserService.clearUser();
                if (context.mounted) {
                  Navigator.pushAndRemoveUntil(
                    context,
                    MaterialPageRoute(builder: (context) => const LoginPage()),
                    (route) => false,
                  );
                }
              },
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDrawerItem(BuildContext context, {required IconData icon, required String title, required VoidCallback onTap}) {
    return ListTile(
      leading: Icon(icon, color: Colors.white70),
      title: Text(
        title,
        style: const TextStyle(color: Colors.white, fontSize: 16),
      ),
      onTap: onTap,
    );
  }
}