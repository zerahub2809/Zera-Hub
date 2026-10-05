try {
  document.documentElement.dataset.theme = localStorage.getItem('zera_theme') === 'light' ? 'light' : 'dark';
} catch {
  document.documentElement.dataset.theme = 'dark';
}
