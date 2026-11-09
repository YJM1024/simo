const base='http://127.0.0.1:18910';
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
async function j(path,opt){const r=await fetch(base+path,opt);return [r.status,await r.text()];}
console.log('CHAT',(await j('/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId:'main',text:'mock:workflow-2 请拆解并执行一个小型工作流：整理一份简短的项目状态说明，不要执行系统命令，不要写文件。'})}))[0]);
let wf=null;
for(let i=0;i<150;i++){await sleep(1000);const [st,body]=await j('/api/workflows?sessionId=main'); if(st===200){const list=JSON.parse(body).workflows||[];if(list.length){wf=list[0]; if(['done','failed','cancelled'].includes(wf.status)) break;}}}
console.log('WF',wf&&wf.id,wf&&wf.status,(wf&&wf.tasks||[]).map(t=>[t.id,t.status,t.dependsOn]));
const [ms,mb]=await j('/api/messages?sessionId=main');const msgs=JSON.parse(mb).messages||[];const reports=msgs.filter(m=>m.role==='agent'&&m.taskId);console.log('REPORTS',reports.length);for(const r of reports)console.log('REPORT',r.text.slice(0,800).replace(/\n/g,' | '));
console.log('DONE_TASKS',(JSON.parse((await j('/api/tasks?sessionId=main&status=done'))[1]).tasks||[]).length);
