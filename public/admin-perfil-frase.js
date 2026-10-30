// Frase de los perfiles (admin). Usa la misma autenticación de administrador que el resto del panel.
(function(){
  const input=document.getElementById('fraseInput'),msg=document.getElementById('fraseMsg');
  fetch('/api/community/admin').then(r=>r.ok?r.json():null).then(d=>{if(d&&typeof d.perfilFrase==='string')input.value=d.perfilFrase;}).catch(()=>{});
  document.getElementById('fraseForm').addEventListener('submit',async e=>{
    e.preventDefault();msg.textContent='Guardando…';
    try{
      const r=await fetch('/api/admin/community/perfil-frase',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({texto:input.value})});
      const d=await r.json();
      if(!r.ok)throw Error(d.error||'No se pudo guardar.');
      input.value=d.perfilFrase;msg.textContent=d.perfilFrase?'¡Frase guardada!':'Frase quitada: los perfiles no mostrarán ninguna.';
    }catch(err){msg.textContent=err.message;}
  });
})();
