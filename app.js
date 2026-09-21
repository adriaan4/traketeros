// Pago con Stripe Checkout.
// Llama a POST /api/create-checkout-session (server.js) y redirige a la URL que devuelve.

const btn = document.getElementById('pay');
const err = document.getElementById('payError');

// Si vuelve de Stripe sin pagar (cancel_url = /?cancelled=1)
if (new URLSearchParams(location.search).get('cancelled') && err) {
  err.textContent = 'Pago cancelado. Cuando quieras, lo intentas otra vez 😉';
}

btn?.addEventListener('click', async () => {
  const textoOriginal = btn.textContent;
  if (err) err.textContent = '';
  btn.disabled = true;
  btn.textContent = 'Un momento…';

  try {
    const res = await fetch('/api/create-checkout-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.url) {
      throw new Error(data.error || 'No se pudo iniciar el pago');
    }
    window.location.href = data.url;
  } catch (e) {
    if (err) err.textContent = e.message || 'Ha habido un error. Inténtalo de nuevo.';
    btn.disabled = false;
    btn.textContent = textoOriginal;
  }
});

// Si el usuario vuelve atrás desde Stripe, el botón debe seguir funcionando
window.addEventListener('pageshow', (e) => {
  if (e.persisted && btn) {
    btn.disabled = false;
    btn.textContent = btn.dataset.label || 'Venga, me apunto 🔥';
  }
});
