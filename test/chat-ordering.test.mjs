import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgent } from '../plugin/host.mjs';
test('a poll started before successful local read must not restore stale unread during SSE outage',async(t)=>{
 let snapshots=0,resolvePoll;
 const snapshot={friends:[{id:'peer',name:'Peer',unread:2,lastMessage:{id:5,from:'peer',to:'self',body:'five',at:1}}],incoming:[],outgoing:[]};
 const agent=createAgent({store:{read:async()=>({token:'a'.repeat(43)}),write:async()=>{}},deviceId:'fake-device',schedule:()=>1,unschedule:()=>{},connect:()=>({close(){}}),call:async(_method,path)=>{
  if(path==='/api/me')return {user:{id:'self',name:'Self'}};
  if(path==='/api/friends'){snapshots++;if(snapshots===1)return snapshot;if(snapshots===2)return new Promise(r=>resolvePoll=r);return {...snapshot,friends:snapshot.friends.map(f=>({...f,unread:0}))};}
  if(path==='/api/chats/peer/read')return {ok:true,upTo:5,unread:0};
  return {ok:true};
 }});
 t.after(()=>agent.dispose());await agent.start();
 const pendingPoll=agent.refresh();
 await agent.markRead('peer',5);
 assert.equal(agent.view().friends[0].unread,0);
 resolvePoll(snapshot);await pendingPoll;
 assert.equal(agent.view().friends[0].unread,0);
});
test('delayed incoming SSE must count as unread even if a newer outgoing HTTP result arrived first',async(t)=>{
 let onEvent;
 const agent=createAgent({store:{read:async()=>({token:'a'.repeat(43)}),write:async()=>{}},deviceId:'fake-device',schedule:()=>1,unschedule:()=>{},connect:opts=>{onEvent=opts.onEvent;return {close(){}};},call:async(method,path)=>{
  if(path==='/api/me')return {user:{id:'self',name:'Self'}};
  if(path==='/api/friends')return {friends:[{id:'peer',name:'Peer',unread:0,lastMessage:null}],incoming:[],outgoing:[]};
  if(path==='/api/chats/peer'&&method==='POST')return {message:{id:11,from:'self',to:'peer',body:'reply',at:2}};
  return {ok:true};
 }});
 t.after(()=>agent.dispose());await agent.start();
 await agent.send('peer','reply','outgoing-001');
 onEvent('message',{id:10,from:'peer',to:'self',body:'previous unseen incoming',at:1});
 assert.equal(agent.view().friends[0].lastMessage.id,11);
 assert.equal(agent.view().friends[0].unread,1);
});
