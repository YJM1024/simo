const base='http://127.0.0.1:18911';const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));async function j(p,o){const r=await fetch(base+p,o);return [r.status,await r.text()];}
console.log('CHAT',(await j('/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId:'main',text:'mock:workflow-2 请拆解并执行一个小型工作流：整理一份简短的项目状态说明，不要执行系统命令，不要写文件。'})}))[0]);
let wf=null;for(let i=0;i<150;i++){await sleep(1000);const [st,b]=await j('/api/workflows?sessionId=main');if(st===200){const l=JSON.parse(b).workflows||[];if(l.length){wf=l[0];if(['done','failed','cancelled'].includes(wf.status))break;}}}
console.log('WF',wf&&wf.id,wf&&wf.status,(wf&&wf.tasks||[]).map(t=>[t.id,t.status,t.dependsOn]));
const [ms,mb]=await j('/api/messages?sessionId=main');const msgs=JSON.parse(mb).messages||[];const rs=msgs.filter(m=>m.role==='agent'&&m.taskId);console.log('REPORTS',rs.length);for(const r of rs)console.log('REPORT',r.text.slice(0,500).replace(/\n/g,' | '));
const [as,ab]=await j('/api/artifacts?sessionId=main');console.log('ARTIFACTS',(JSON.parse(ab).artifacts||[]).length);
