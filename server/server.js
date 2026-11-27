import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { scrapeInvestingFund, scrapeInvestingQuoteOnly, closeScraperBrowser } from './services/investingScraper.js';
const __filename=fileURLToPath(import.meta.url), __dirname=path.dirname(__filename);
const app=express(), PORT=process.env.PORT||3000, START_TIME=Date.now();
app.disable('x-powered-by'); app.use(cors()); app.use(express.json({limit:'2mb'}));
app.use((req,res,next)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','SAMEORIGIN');next();});
const PUBLIC_DIR = path.resolve(__dirname, '../public');
app.use((req,res,next)=>{ if (/\.(?:html?|js|css)$/i.test(req.path)) res.setHeader('Cache-Control','no-store, max-age=0, must-revalidate'); next(); });
app.use(express.static(PUBLIC_DIR,{etag:false,maxAge:0}));
const MAX_CONCURRENT = process.env.PUPPETEER_CONCURRENCY ? parseInt(process.env.PUPPETEER_CONCURRENCY, 10) : 1;
const MAX_JOB_AGE_MS = 15 * 60 * 1000;
const jobs = new Map();
const cleanQuery=v=>typeof v==='string'?v.trim():'';
const uniqueQueries=qs=>[...new Set((Array.isArray(qs)?qs:[]).map(cleanQuery).filter(Boolean))];
function createJob(queries){const id=randomUUID();const job={id,status:'queued',createdAt:Date.now(),startedAt:null,finishedAt:null,total:queries.length,processed:0,updated:0,failed:0,currentQuery:'',results:[],error:null};jobs.set(id,job);processQuoteJob(job,queries).catch(err=>{job.status='failed';job.error=err?.message||'Error procesando el lote.';job.finishedAt=Date.now();});return job;}
async function processQuoteJob(job,queries){job.status='running';job.startedAt=Date.now();for(let i=0;i<queries.length;i+=MAX_CONCURRENT){const batch=queries.slice(i,i+MAX_CONCURRENT);const settled=await Promise.allSettled(batch.map(async query=>{job.currentQuery=query;return scrapeInvestingQuoteOnly(query);}));settled.forEach((r,index)=>{const query=batch[index];if(r.status==='fulfilled'&&r.value?.success){job.results.push({query,...r.value});job.updated++;}else{job.results.push({query,success:false,error:r.reason?.message||r.value?.error||'Error desconocido'});job.failed++;}job.processed++;});}job.status='completed';job.currentQuery='';job.finishedAt=Date.now();}
function jobSnapshot(job){return{success:job.status!=='failed',async:true,jobId:job.id,status:job.status,total:job.total,processed:job.processed,updated:job.updated,failed:job.failed,currentQuery:job.currentQuery,results:job.status==='completed'?job.results:undefined,error:job.error||undefined};}
function pruneJobs(){const cutoff=Date.now()-MAX_JOB_AGE_MS;for(const [id,job] of jobs){if((job.finishedAt||job.createdAt)<cutoff)jobs.delete(id);}} setInterval(pruneJobs,60000).unref();
app.get('/api/health',(req,res)=>res.json({status:'ok',version:'1.0.0',timestamp:new Date().toISOString(),uptime:Math.floor((Date.now()-START_TIME)/1000),jobs:jobs.size}));
app.post('/api/scrape-fund',async(req,res)=>{const query=cleanQuery(req.body?.query);const allowedRanges=new Set(['day','week','month','3months','6months','year','5years','max']);const range=allowedRanges.has(req.body?.range)?req.body.range:'6months';if(!query||query.length>500)return res.status(400).json({success:false,error:'Introduce un ISIN, slug o URL válida de Investing.com.'});try{return res.json(await scrapeInvestingFund(query,{range}));}catch(err){console.error('[API /api/scrape-fund]',err);return res.status(502).json({success:false,error:err?.message||'No se pudieron obtener los datos del fondo.'});}});
app.post('/api/refresh-quotes',async(req,res)=>{const queries=uniqueQueries(req.body?.queries);if(!queries.length)return res.status(400).json({success:false,error:'Se requiere un array "queries".'});if(queries.length>50)return res.status(400).json({success:false,error:'Máximo 50 fondos por lote.'});if(queries.length>MAX_CONCURRENT)return res.status(202).json(jobSnapshot(createJob(queries)));const results=[];for(const query of queries){try{results.push({query,...await scrapeInvestingQuoteOnly(query)});}catch(err){results.push({query,success:false,error:err?.message||'Error desconocido'});}}return res.json({success:true,async:false,status:'completed',total:queries.length,processed:queries.length,updated:results.filter(r=>r.success).length,failed:results.filter(r=>!r.success).length,results});});
app.get('/api/refresh-quotes/jobs/:id',(req,res)=>{const job=jobs.get(req.params.id);if(!job)return res.status(404).json({success:false,error:'Lote no encontrado o caducado.'});res.json(jobSnapshot(job));});
app.post('/api/refresh-quotes/jobs/:id/ack',(req,res)=>{const job=jobs.get(req.params.id);if(!job)return res.status(404).json({success:false,error:'Lote no encontrado o caducado.'});if(job.status==='completed'||job.status==='failed')jobs.delete(req.params.id);res.json({success:true});});
app.get('*',(req,res)=>res.sendFile(path.join(PUBLIC_DIR,'index.html')));
let activeServer=null,shuttingDown=false;
function startServer(port){
  const server=app.listen(port,'127.0.0.1',()=>{
    activeServer=server;
    console.log(`\n🚀 ECONEXO v1.0.0 está activo: http://127.0.0.1:${port}`);
    console.log(`   Verificación: http://127.0.0.1:${port}/api/health\n`);
  });
  server.on('error',err=>{
    if(err.code==='EADDRINUSE'){
      console.error(`[ECONEXO v1.0.0] El puerto ${port} ya está ocupado.`);
      process.exitCode=1;
    } else console.error('[ECONEXO v1.0.0] Error al iniciar el servidor:',err);
  });
}
startServer(PORT);
async function shutdown(signal){if(shuttingDown)return;shuttingDown=true;console.log(`[Server] Recibida señal ${signal}; cerrando servidor y Chromium...`);if(activeServer)await new Promise(resolve=>activeServer.close(resolve));await closeScraperBrowser();process.exit(0);} process.once('SIGINT',()=>shutdown('SIGINT'));process.once('SIGTERM',()=>shutdown('SIGTERM'));
