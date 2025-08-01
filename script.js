document.getElementById('loginForm').addEventListener('submit', function(e) {
  e.preventDefault();
  const user = document.getElementById('username').value;
  const pass = document.getElementById('password').value;

  if (user === 'admin' && pass === 'admin') {
    document.getElementById('message').style.color = 'green';
    document.getElementById('message').textContent = 'Login bem-sucedido!';
    // Redirecionar ou carregar página interna
  } else {
    document.getElementById('message').textContent = 'Usuário ou senha inválidos.';
  }
});
