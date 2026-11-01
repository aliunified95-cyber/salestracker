import http from 'node:http';
import {readFile} from 'node:fs/promises';
import handler from '../api/index.js';
const types={html:'text/html',js:'text/javascript',css:'text/css',svg:'image/svg+xml'};
http.createServer(async(req,res)=>{
 const u=new URL(req.url,'http://localhost');
 res.status=n=>{res.statusCode=n;return res};res.json=b=>res.end(JSON.stringify(b));
 if(u.pathname.startsWith('/api/')){req.query={route:u.pathname.slice(5)};let b='';for await(const c of req)b+=c;try{req.body=b?JSON.parse(b):{}}catch{return res.status(400).json({error:'Invalid request'})}return handler(req,res)}
 const path=u.pathname==='/'?'index.html':u.pathname.slice(1);if(!/^[a-zA-Z0-9.-]+$/.test(path))return res.status(404).end();
 try{const b=await readFile(`public/${path}`);res.setHeader('Content-Type',types[path.split('.').at(-1)]||'text/plain');res.end(b)}catch{res.status(404).end()}
}).listen(4173,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:4173'));
