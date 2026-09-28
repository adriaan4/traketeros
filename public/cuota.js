// Lista de la cuota: quién ha pagado + subida del justificante.
// Habla con /api/cuota (server.js).

const list = document.getElementById('cuotaList');
const msg = document.getElementById('cuotaMsg');

function say(text, bad) {
  msg.textContent = text || '';
  msg.className = 'cuota-msg' + (bad ? ' bad' : '');
}

function render(people) {
  list.innerHTML = '';
  for (const p of people) {
    const li = document.createElement('li');
    li.className = 'cuota-row' + (p.paid ? ' paid' : '');

    const name = document.createElement('span');
    name.className = 'cuota-name';
    name.textContent = p.name;
    li.appendChild(name);

    const btns = document.createElement('div');
    btns.className = 'cuota-btns';

    const yes = document.createElement('button');
    yes.type = 'button';
    yes.className = 'mini cuota-yes' + (p.paid ? ' active' : '');
    yes.textContent = 'He pagado';
    yes.addEventListener('click', () => setPaid(p.name, true));

    const no = document.createElement('button');
    no.type = 'button';
    no.className = 'mini cuota-no' + (!p.paid ? ' active' : '');
    no.textContent = 'No he pagado';
    no.addEventListener('click', () => setPaid(p.name, false));

    btns.append(yes, no);

    if (p.paid && p.receipt) {
      const ok = document.createElement('span');
      ok.className = 'cuota-ok';
      ok.textContent = '✅ Justificante enviado';
      btns.appendChild(ok);
    } else if (p.paid) {
      const label = document.createElement('label');
      label.className = 'mini cuota-upload';
      label.textContent = '📎 Subir justificante';
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.hidden = true;
      input.addEventListener('change', () => {
        if (input.files[0]) sendReceipt(p.name, input.files[0], label);
      });
      label.appendChild(input);
      btns.appendChild(label);
    }

    li.appendChild(btns);
    list.appendChild(li);
  }
}

async function api(url, options) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Ha habido un error. Inténtalo de nuevo.');
  return data;
}

async function load() {
  try {
    const data = await api('/api/cuota');
    render(data.people);
  } catch (e) {
    if (!list.children.length || list.querySelector('.cuota-loading')) {
      list.innerHTML = '<li class="cuota-loading">No se ha podido cargar la lista.</li>';
    }
  }
}

async function setPaid(name, paid) {
  say('');
  try {
    const data = await api('/api/cuota/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, paid })
    });
    render(data.people);
    if (paid) say(name + ', ahora sube la foto del justificante 📎');
  } catch (e) {
    say(e.message, true);
  }
}

async function sendReceipt(name, file, label) {
  say('Enviando justificante…');
  label.classList.add('busy');
  const form = new FormData();
  form.append('name', name);
  form.append('receipt', file);
  try {
    const data = await api('/api/cuota/receipt', { method: 'POST', body: form });
    render(data.people);
    say('¡Justificante enviado, ' + name + '! 🍻');
  } catch (e) {
    label.classList.remove('busy');
    say(e.message, true);
  }
}

load();
// Refresca solo cada 30 s por si otro marca su pago
setInterval(() => { if (!document.hidden) load(); }, 30000);
