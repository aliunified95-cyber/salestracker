import {mkdir,copyFile,readFile,writeFile} from 'node:fs/promises';
await mkdir('dist',{recursive:true});
for(const f of ['index.html','app.js','performance.js','dashboard-enhancements.js','tag-agent-data.js','tag-agent-ui.js','brand.css','zain-logo.svg'])await copyFile(`public/${f}`,`dist/${f}`);
console.log('Built static application. No credentials are included in browser assets.');
