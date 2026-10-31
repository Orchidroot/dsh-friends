import test from 'node:test';
import assert from 'node:assert/strict';
import { createFriendsService } from '../server/service.mjs';
import { createAgent, createUpstream, createRpcHandler } from '../plugin/host.mjs';
import { connectEvents } from '../plugin/stream.mjs';
import { randomUUID } from 'node:crypto';

async function until(predicate, message='state not observed') {
  const end=Date.now()+3000;
  while(Date.now()<end) { if(predicate()) return; await new Promise((r)=>setTimeout(r,10)); }
  assert.fail(message);
}
async function setup(t) {
  const app=createFriendsService({database:':memory:'});
  await new Promise((r)=>app.server.listen(0,'127.0.0.1',r));
  const origin=`http://127.0.0.1:${app.server.address().port}`, call=createUpstream(origin), agents=[];
  t.after(async()=>{ for(const a of agents) await a.dispose(); await app.close(); });
  function make() {
    let value;
    const agent=createAgent({store:{read:async()=>value,write:async(v)=>{value=v;}},call,deviceId:randomUUID(),schedule:()=>0,unschedule(){},connect:(options)=>connectEvents({...options,origin,maxBackoffMs:50})});
    agents.push(agent); return agent;
  }
  async function pair() {
    const a=make(),b=make(); await a.start();await b.start();await a.register('Alice');await b.register('Bob');
    await a.addFriend(b.view().user.code); await b.refresh(); await b.respond(b.view().incoming[0].id,'accept'); await a.refresh();
    await until(()=>b.view().friends.length===1);
    return {a,b};
  }
  return {app,origin,call,pair,make};
}

test('Host SSE delivers messages immediately, long-poll wakes, and history loads',async(t)=>{
  const {pair}=await setup(t);const {a,b}=await pair();
  const baseline=await b.wait(0,-1,0);
  const waiting=b.wait(baseline.cursor,b.view().revision,2000);
  const sent=await a.send(b.view().user.id,'你好，浮动聊天',randomUUID());
  const next=await waiting;
  // A presence snapshot can also wake wait; read remaining events until the message is visible.
  await until(()=>b.view().friends[0].lastMessage?.id===sent.message.id);
  const events=await b.wait(baseline.cursor,-1,0);
  assert.ok(events.events.some((e)=>e.kind==='message'&&e.data.body==='你好，浮动聊天'));
  assert.equal(b.view().friends[0].unread,1);
  assert.equal((await b.history(a.view().user.id)).messages[0].body,'你好，浮动聊天');
  assert.ok(typeof next.inboxEpoch==='string');
  assert.ok(!('token' in next));
  assert.equal(JSON.stringify(next).includes('Bearer'),false);
});

test('safe retry using the same clientId persists only one message and one unread',async(t)=>{
  const {pair}=await setup(t);const {a,b}=await pair();const clientId=randomUUID();
  const first=await a.send(b.view().user.id,'retry me',clientId);
  const second=await a.send(b.view().user.id,'retry me',clientId);
  assert.equal(first.message.id,second.message.id);
  await until(()=>b.view().friends[0].unread===1);
  assert.equal((await b.history(a.view().user.id)).messages.length,1);
  await assert.rejects(a.send(b.view().user.id,'other text',clientId),(e)=>e.status===409);
});

test('mark-read is acknowledged by server and updates both Host windows',async(t)=>{
  const {pair}=await setup(t);const {a,b}=await pair();
  const sent=await a.send(b.view().user.id,'read this',randomUUID());
  await until(()=>b.view().friends[0].unread===1);
  await b.markRead(a.view().user.id,sent.message.id);
  await until(()=>b.view().friends[0].unread===0);
  const history=await a.history(b.view().user.id);
  assert.equal(history.peerRead,sent.message.id);
});

test('long-poll cancel, timeout and disposal clean up waiters',async(t)=>{
  const {make}=await setup(t);const a=make();await a.start();
  const abort=new AbortController();const waiting=a.wait(0,a.view().revision,2000,abort.signal);abort.abort();
  const start=Date.now();await waiting;assert.ok(Date.now()-start<200);
  const timeout=await a.wait(0,a.view().revision,10);assert.equal(timeout.events.length,0);
  const pending=a.wait(0,a.view().revision,2000);await a.dispose();await pending;
});

test('Host epoch resets and buffered private messages disappear on forget',async(t)=>{
  const {pair}=await setup(t);const {a,b}=await pair();
  await a.send(b.view().user.id,'private-old',randomUUID());
  await until(()=>b.view().friends[0].unread===1);
  const before=await b.wait(0,-1,0);await b.forget();const after=await b.wait(0,-1,0);
  assert.notEqual(before.inboxEpoch,after.inboxEpoch);
  assert.deepEqual(after.events,[]);assert.deepEqual(after.friends,[]);
  assert.ok(!JSON.stringify(after).includes('private-old'));
});

test('RPC accepts 2000 Chinese characters, but never arbitrary upstream paths',async(t)=>{
  const {pair}=await setup(t);const {a,b}=await pair();const handle=createRpcHandler(a,'http://friends.local');
  const req=(body)=>new Request('http://dsh.internal/api/dsh-friends.rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const response=await handle(req({op:'send',friendId:b.view().user.id,body:'中'.repeat(2000),clientId:randomUUID()}));
  assert.equal(response.status,200);assert.equal((await response.json()).message.body.length,2000);
  assert.equal((await handle(req({op:'send',friendId:'../../api/me',body:'bad',clientId:randomUUID()}))).status,400);
  assert.equal((await handle(req({op:'call',path:'/api/me'}))).status,400);
});

test('stream close works during reconnect delay and missing response cannot hang forever',async()=>{
  let attempts=0;
  const events=connectEvents({origin:'http://local.invalid',token:'not-a-real-credential',onEvent(){},fetcher:async()=>{attempts++;throw new Error('offline');},maxBackoffMs:500});
  await until(()=>attempts===1);
  events.close();await events.finished;
  assert.equal(attempts,1);
});
