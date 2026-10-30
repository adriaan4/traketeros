// Frases de los perfiles (admin): elegir a quién se le pone la frase. Misma autenticación de administrador que el resto del panel.
(function(){
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let personas=[],frases={};
  const key=n=>String(n).toLocaleLowerCase('es');
  function pintar(){
    const actual=$('frasePersona').value;
    $('frasePersona').innerHTML=personas.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join('');
    if(actual&&personas.includes(actual))$('frasePersona').value=actual;
    $('fraseInput').value=(frases[key($('frasePersona').value)]||{}).texto||'';
    const lista=personas.filter(n=>frases[key(n)]);
    $('fraseLista').innerHTML=lista.map(n=>`<li><div class="community-row"><span><b>${esc(n)}</b>: ${esc(frases[key(n)].texto)}</span><button class="community-button" type="button" data-q="${esc(n)}">Quitar</button></div></li>`).join('')||'<li class="community-empty">Todavía no hay ninguna frase.</li>';
  }
  async function guardar(name,texto){
    $('fraseMsg').textContent='Guardando…';
    try{
      const r=await fetch('/api/admin/community/perfil-frase',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,texto})});
      const d=await r.json();if(!r.ok)throw Error(d.error||'No se pudo guardar.');
      frases=d.frases||{};pintar();$('fraseMsg').textContent=texto?'¡Frase guardada para '+name+'!':'Frase de '+name+' quitada.';
    }catch(err){$('fraseMsg').textContent=err.message;}
  }
  Promise.all([fetch('/api/community/overview').then(r=>r.json()),fetch('/api/community/admin').then(r=>r.ok?r.json():{})]).then(([o,a])=>{
    personas=(o.people||[]).map(p=>p.name).sort((x,y)=>x.localeCompare(y,'es'));frases=a.perfilFrases||{};pintar();
  }).catch(()=>{$('fraseMsg').textContent='No se pudieron cargar las personas.';});
  $('frasePersona').addEventListener('change',()=>{$('fraseInput').value=(frases[key($('frasePersona').value)]||{}).texto||'';$('fraseMsg').textContent='';});
  $('fraseForm').addEventListener('submit',e=>{e.preventDefault();guardar($('frasePersona').value,$('fraseInput').value);});
  $('fraseLista').addEventListener('click',e=>{const b=e.target.closest('button[data-q]');if(b)guardar(b.dataset.q,'');});
})();
