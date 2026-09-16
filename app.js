const pay=document.getElementById('pay');
const payError=document.getElementById('payError');

pay?.addEventListener('click', async ()=>{
  pay.disabled=true;
  pay.textContent='Abriendo pago…';
  payError.textContent='';
  try{
    const r=await fetch('/api/create-checkout-session',{method:'POST',headers:{'Content-Type':'application/json'}});
    const d=await r.json();
    if(!r.ok) throw new Error(d.error||'No se pudo iniciar el pago');
    location.href=d.url;
  }catch(e){
    pay.disabled=false;
    pay.textContent='Continuar al pago →';
    payError.textContent=e.message;
  }
});
