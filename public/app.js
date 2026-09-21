// Pago con Stripe Checkout.
// Llama a POST /api/create-checkout-session (server.js) y redirige a la URL que devuelve.

const btn = document.getElementById('pay');
const err = document.getElementById('payError');
const LABEL = btn ? btn.textContent : '';

// Si vuelve de Stripe sin pagar (cancel_url = /?cancelled=1)
if (err && new URLSearchParams(location.search).get('cancelled')) {
  err.textContent = 'Pago cancelado. Cuando quieras, lo intentas otra vez 😉';
}

function reset() {
  if (!btn) return;
  btn.disabled = false;
  btn.textContent = LABEL;
}

btn?.addEventListener('click', async () => {
  err.textContent = '';
  btn.disabled = true;
  btn.textContent = 'Abriendo pago…';

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
    err.textContent = e.message || 'Ha habido un error. Inténtalo de nuevo.';
    reset();
  }
});

// Si el usuario vuelve atrás desde Stripe, el botón tiene que seguir funcionando
window.addEventListener('pageshow', (e) => { if (e.persisted) reset(); });
