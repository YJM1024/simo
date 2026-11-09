const base='http://127.0.0.1:18908';
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
async function j(path,opt){const r=await fetch(base+path,opt);return [r.status,await r.text()];}
console.log('HEALTH',(await j('/api/health'))[0]);
console.log('CHAT',(await j('/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId:'main',text:'mock:workflow-2 请拆解并执行一个小型工作流：整理一份简短的项目状态说明。'})}))[0]);
let wf=null;
for(let i=0;i<120;i++){await sleep(1000);const [st,body]=await j('/api/workflows?sessionId=main'); if(st===200){const data=JSON.parse(body); const list=data.workflows||[]; if(list.length){wf=list[0]; if(['done','failed','cancelled'].includes(wf.status)) break;}}}
console.log('WORKFLOW',wf&&wf.id,wf&&wf.status,'tasks',wf&&wf.tasks&&wf.tasks.map(t=>[t.id,t.status,t.dependsOn]));
const [ms,mb]=await j('/api/messages?sessionId=main'); const msgs=JSON.parse(mb).messages||[];
const reports=msgs.filter(m=>m.role==='agent'&&m.taskId); console.log('REPORTS',reports.length); for(const r of reports){console.log('REPORT',r.text.slice(0,500).replace(/\n/g,' | '));}
const [ts,tb]=await j('/api/tasks?sessionId=main&status=done'); console.log('TASKS_DONE',(JSON.parse(tb).tasks||[]).length);
