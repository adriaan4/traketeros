import 'dotenv/config';
import express from 'express';
import Stripe from 'stripe';
import crypto from 'crypto';
import path from 'path';
import {fileURLToPath} from 'url';

const app=express();
const stripe=new Stripe(process.env.STRIPE_SECRET_KEY);
const __filename=fileURLToPath(import.meta.url);
const __dirname=path.dirname(__filename);
function adminAuth(req,res,next){
  const h=req.headers.authorization||'';
  if(!h.startsWith('Basic ')) return res.set('WWW-Authenticate','Basic realm="Admin"').status(401).send('Autenticación requerida');
  const raw=Buffer.from(h.slice(6),'base64').toString();
  const i=raw.indexOf(':'); const u=raw.slice(0,i), p=raw.slice(i+1);
  if(u!==process.env.ADMIN_USER || p!==process.env.ADMIN_PASSWORD)
    return res.set('WWW-Authenticate','Basic realm="Admin"').status(401).send('Credenciales incorrectas');
  next();
}

app.post('/api/webhook',express.raw({type:'application/json'}),async(req,res)=>{
  try{
    const event=stripe.webhooks.constructEvent(req.body,req.headers['stripe-signature'],process.env.STRIPE_WEBHOOK_SECRET);
    console.log('Stripe:',event.type);
    res.json({received:true});
  }catch(e){res.status(400).send(`Webhook Error: ${e.message}`)}
});

app.use(express.json());
app.use(express.static(path.join(__dirname,'public')));

app.post('/api/create-checkout-session',async(req,res)=>{
  try{
    const session=await stripe.checkout.sessions.create({
      mode:'subscription',
      line_items:[{price:process.env.STRIPE_PRICE_ID,quantity:1}],
      payment_method_types:['card'],
      billing_address_collection:'auto',
      allow_promotion_codes:true,
      success_url:`${process.env.DOMAIN}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:`${process.env.DOMAIN}/?cancelled=1`
    });
    res.json({url:session.url});
  }catch(e){res.status(500).json({error:e.message})}
});

app.get('/api/subscription/:id',async(req,res)=>{
  try{
    const s=await stripe.checkout.sessions.retrieve(req.params.id,{expand:['subscription']});
    res.json({status:s.status,subscription_status:s.subscription?.status||null,email:s.customer_details?.email||null});
  }catch(e){res.status(404).json({error:'No encontrada'})}
});

app.get('/api/admin/overview',adminAuth,async(req,res)=>{
  try{
    const [customers,subs,invoices,payments]=await Promise.all([
      stripe.customers.list({limit:100}),
      stripe.subscriptions.list({limit:100,status:'all',expand:['data.customer','data.items.data.price']}),
      stripe.invoices.list({limit:100,expand:['data.customer']}),
      stripe.paymentIntents.list({limit:100})
    ]);
    const active=subs.data.filter(s=>s.status==='active'||s.status==='trialing');
    const revenue=invoices.data.filter(i=>i.status==='paid').reduce((a,i)=>a+(i.amount_paid||0),0);
    const members=customers.data.map(c=>{
      const ss=subs.data.filter(s=>(typeof s.customer==='string'?s.customer:s.customer?.id)===c.id).sort((a,b)=>b.created-a.created);
      const s=ss[0];
      return {name:c.name||'—',email:c.email||'—',subscription:s?{
        id:s.id,status:s.status,cancel:s.cancel_at_period_end,
        amount:s.items.data[0]?.price?.unit_amount||0,
        interval:s.items.data[0]?.price?.recurring?.interval||'month',
        next:s.current_period_end
      }:null}
    });
    res.json({
      stats:{customers:customers.data.length,active:active.length,revenue:revenue/100,payments:payments.data.filter(p=>p.status==='succeeded').length},
      members,
      invoices:invoices.data.map(i=>({number:i.number||i.id,email:i.customer?.email||'—',status:i.status,amount:i.amount_paid/100,date:i.created}))
    });
  }catch(e){res.status(500).json({error:e.message})}
});
app.post('/api/admin/cancel',adminAuth,async(req,res)=>{
  try{const s=await stripe.subscriptions.update(req.body.subscriptionId,{cancel_at_period_end:true});res.json({ok:true,cancel:s.cancel_at_period_end})}
  catch(e){res.status(500).json({error:e.message})}
});
app.post('/api/admin/reactivate',adminAuth,async(req,res)=>{
  try{const s=await stripe.subscriptions.update(req.body.subscriptionId,{cancel_at_period_end:false});res.json({ok:true,cancel:s.cancel_at_period_end})}
  catch(e){res.status(500).json({error:e.message})}
});

app.listen(process.env.PORT||3000,()=>console.log(`ClubPass público: http://localhost:${process.env.PORT||3000}`));
