class User {
  final String id;
  final String nome;
  final String usuarioLogin;
  final String nivel;
  final String? email;

  User({
    required this.id,
    required this.nome,
    required this.usuarioLogin,
    required this.nivel,
    this.email,
  });

  factory User.fromJson(Map<String, dynamic> json) {
    return User(
      id: json['id'],
      nome: json['nome'],
      usuarioLogin: json['usuario_login'],
      nivel: json['nivel'],
      email: json['email'],
    );
  }

  Map<String, dynamic> toJson() {
    return {'id': id, 'nome': nome, 'usuario_login': usuarioLogin, 'nivel': nivel, 'email': email};
  }
}