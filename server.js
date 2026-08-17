const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;
app.use(express.static('public'));
app.get('/health', (_, res) => res.json({ ok: true }));

const rooms = new Map();
const playerRoom = new Map();
const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const SUITS = ['S','H','D','C'];
const SYMBOL = {S:'♠',H:'♥',D:'♦',C:'♣'};
const RED = new Set(['H','D']);
const uid = () => crypto.randomBytes(8).toString('hex');
function makeRoomCode(){
  const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let c;
  do { c=''; for(let i=0;i<5;i++) c += chars[Math.floor(Math.random()*chars.length)]; } while(rooms.has(c));
  return c;
}
function makeDeck(copies=1){
  const d=[];
  for(let copy=0;copy<copies;copy++) for(const suit of SUITS) for(const rank of RANKS)
    d.push({id:`${copy}-${rank}-${suit}-${uid()}`,rank,suit});
  for(let i=d.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[d[i],d[j]]=[d[j],d[i]];}
  return d;
}
function value(c){
  if(c.rank==='K' && !RED.has(c.suit)) return 10;
  if(c.rank==='K' && RED.has(c.suit)) return -2;
  if(c.rank==='A') return 1;
  if(c.rank==='J') return 10;
  if(c.rank==='Q') return 10;
  return Number(c.rank);
}
function effectFor(c){
  if(['7','8'].includes(c.rank)) return 'peek-own';
  if(['9','10'].includes(c.rank)) return 'peek-opponent';
  if(c.rank==='J') return 'blind-swap';
  if(c.rank==='Q' || (c.rank==='K' && !RED.has(c.suit))) return 'compare-swap';
  return null;
}
function addLog(room,text){room.log.push(text);if(room.log.length>60)room.log.shift();}
function playerOf(room,socketId){return room.players.find(p=>p.id===socketId);}
function currentPlayer(room){return room.players[room.turnIndex];}
function score(hand){return hand.reduce((s,c)=>s+value(c),0);}
function handForViewer(p, viewerId, ended){
  return p.hand.map(c=>({id:c.id,rank:ended?c.rank:null,suit:ended?c.suit:null}));
}
function roomView(room,viewerId){
  const me=playerOf(room,viewerId), ended=room.status==='ended';
  return {
    code:room.code, mode:room.mode, status:room.status, hostId:room.hostId,
    turnIndex:room.turnIndex, turnStage:room.turnStage, caller:room.caller,
    finalTurnsLeft:room.finalTurnsLeft, deckCount:room.deck.length,
    discard:room.discard.map(c=>({id:c.id,rank:c.rank,suit:c.suit})),
    drawn: room.drawn ? {source:room.drawn.source,playerId:room.drawn.playerId,card:room.drawn.playerId===viewerId||ended?room.drawn.card:null} : null,
    effect: room.effect ? {type:room.effect.type,playerId:room.effect.playerId} : null,
    players:room.players.map(p=>({id:p.id,name:p.name,connected:p.connected,initialReady:p.initialReady,handCount:p.hand.length,hand:handForViewer(p,viewerId,ended)})),
    me:me?{id:me.id,name:me.name}:null,
    log:room.log.slice(-40)
  };
}
function broadcast(room){for(const p of room.players) if(p.socketId) io.to(p.socketId).emit('state',roomView(room,p.id));}
function sendError(cb,e){if(cb)cb({ok:false,error:e.message||String(e)});}
function requireRoom(socket){const code=socket.data.roomCode,room=rooms.get(code);if(!room)throw new Error('Room tidak ditemukan.');const p=playerOf(room,socket.id);if(!p)throw new Error('Kamu bukan pemain room ini.');return {room,player:p};}

function endGame(room,reason){
  room.status='ended';room.turnStage='ended';room.drawn=null;room.effect=null;room.finalTurnsLeft=0;
  addLog(room,`Game berakhir: ${reason}`);
}
function nextTurn(room){
  room.drawn=null;room.effect=null;room.turnStage='awaiting-draw';
  if(room.status==='final-round'){
    room.finalTurnsLeft--;
    if(room.finalTurnsLeft<=0){endGame(room,'Ronde terakhir selesai.');return;}
  }
  room.turnIndex=(room.turnIndex+1)%room.players.length;
  if(room.status==='playing' && room.deck.length===0) endGame(room,'Dek tengah habis.');
  if(room.status==='final-round' && room.deck.length===0) endGame(room,'Dek tengah habis.');
}
function startGame(room){
  const copies=room.players.length<=12?1:2;
  const deck=makeDeck(copies);
  room.players.forEach(p=>{p.hand=[];p.known=new Set();p.initialPeeked=new Set();p.initialReady=false;});
  for(let i=0;i<4;i++) for(const p of room.players)p.hand.push(deck.pop());
  room.deck=deck;room.discard=[];room.status='initial-peek';room.turnIndex=0;room.turnStage='initial-peek';room.drawn=null;room.effect=null;room.caller=null;room.finalTurnsLeft=null;
  addLog(room,`Game dimulai dengan ${copies} deck tanpa joker.`);
}

io.on('connection',socket=>{
  socket.on('createRoom',({name,mode},cb)=>{try{
    name=String(name||'').trim().slice(0,20);if(!name)throw new Error('Nama wajib diisi.');
    mode=mode==='duel'?'duel':'classic';const code=makeRoomCode();
    const p={id:socket.id,socketId:socket.id,name,hand:[],known:new Set(),initialPeeked:new Set(),initialReady:false,connected:true};
    const room={code,hostId:socket.id,mode,players:[p],status:'lobby',deck:[],discard:[],turnIndex:0,turnStage:'awaiting-draw',drawn:null,effect:null,caller:null,finalTurnsLeft:null,log:[`${name} membuat room.`]};
    rooms.set(code,room);playerRoom.set(socket.id,code);socket.data.roomCode=code;socket.join(code);cb({ok:true,code});broadcast(room);
  }catch(e){sendError(cb,e);}});

  socket.on('joinRoom',({code,name},cb)=>{try{
    code=String(code||'').trim().toUpperCase();name=String(name||'').trim().slice(0,20);const room=rooms.get(code);
    if(!room)throw new Error('Room tidak ditemukan.');if(room.status!=='lobby')throw new Error('Game sudah dimulai.');
    if(room.mode==='duel'&&room.players.length>=2)throw new Error('Room 1v1 sudah penuh.');
    if(room.mode==='classic'&&room.players.length>=15)throw new Error('Room sudah penuh.');if(!name)throw new Error('Nama wajib diisi.');
    const p={id:socket.id,socketId:socket.id,name,hand:[],known:new Set(),initialPeeked:new Set(),initialReady:false,connected:true};
    room.players.push(p);playerRoom.set(socket.id,code);socket.data.roomCode=code;socket.join(code);addLog(room,`${name} bergabung ke room.`);cb({ok:true,code});broadcast(room);
  }catch(e){sendError(cb,e);}});

  socket.on('startGame',(_,cb)=>{try{const {room}=requireRoom(socket);if(room.hostId!==socket.id)throw new Error('Hanya host yang bisa memulai.');if(room.mode==='duel'&&room.players.length!==2)throw new Error('1v1 membutuhkan tepat 2 pemain.');if(room.mode==='classic'&&room.players.length<4)throw new Error('Classic minimal 4 pemain.');startGame(room);cb({ok:true});broadcast(room);}catch(e){sendError(cb,e);}});

  socket.on('initialPeek',({cardId},cb)=>{try{const {room,player}=requireRoom(socket);if(room.status!=='initial-peek')throw new Error('Bukan fase lihat kartu awal.');if(player.initialReady)throw new Error('Kamu sudah siap.');if(player.initialPeeked.size>=2)throw new Error('Kamu hanya boleh membuka 2 kartu.');const card=player.hand.find(c=>c.id===cardId);if(!card)throw new Error('Kartu tidak ditemukan.');if(player.initialPeeked.has(cardId))throw new Error('Kartu itu sudah dilihat.');player.initialPeeked.add(cardId);player.known.add(cardId);socket.emit('privatePeek',{card,duration:3000});cb({ok:true});}catch(e){sendError(cb,e);}});

  socket.on('initialReady',(_,cb)=>{try{const {room,player}=requireRoom(socket);if(room.status!=='initial-peek')throw new Error('Bukan fase awal.');if(player.initialPeeked.size!==2)throw new Error('Kamu harus melihat tepat 2 kartu awal.');player.initialReady=true;if(room.players.every(p=>p.initialReady)){room.status='playing';room.turnIndex=0;room.turnStage='awaiting-draw';addLog(room,`Semua pemain siap. Giliran pertama: ${room.players[0].name}.`);}cb({ok:true});broadcast(room);}catch(e){sendError(cb,e);}});


  socket.on('draw',({source},cb)=>{try{const {room,player}=requireRoom(socket);if(source!=='deck')throw new Error('Kartu hanya diambil dari dek tengah.');if(!['playing','final-round'].includes(room.status)||room.turnStage!=='awaiting-draw'||currentPlayer(room).id!==socket.id)throw new Error('Belum giliranmu.');if(!room.deck.length){endGame(room,'Dek tengah habis.');cb({ok:true});broadcast(room);return;}const card=room.deck.pop();room.drawn={card,source:'deck',playerId:socket.id};room.turnStage='awaiting-decision';addLog(room,`${player.name} mengambil 1 kartu dari dek tengah.`);cb({ok:true});broadcast(room);}catch(e){sendError(cb,e);}});

  socket.on('swapDrawn',({handCardId},cb)=>{try{const {room,player}=requireRoom(socket);if(room.turnStage!=='awaiting-decision'||!room.drawn||room.drawn.playerId!==socket.id)throw new Error('Aksi tidak valid.');const i=player.hand.findIndex(c=>c.id===handCardId);if(i<0)throw new Error('Kartu tangan tidak ditemukan.');const old=player.hand[i];player.hand[i]=room.drawn.card;room.discard.push(old);addLog(room,`${player.name} menukar kartu yang diambil dengan kartu tangannya.`);nextTurn(room);cb({ok:true});broadcast(room);}catch(e){sendError(cb,e);}});
  socket.on('discardDrawn',(_,cb)=>{try{const {room,player}=requireRoom(socket);if(room.turnStage!=='awaiting-decision'||!room.drawn||room.drawn.playerId!==socket.id)throw new Error('Aksi tidak valid.');room.discard.push(room.drawn.card);addLog(room,`${player.name} membuang kartu yang diambil.`);nextTurn(room);cb({ok:true});broadcast(room);}catch(e){sendError(cb,e);}});

  socket.on('useEffect',(_,cb)=>{try{const {room,player}=requireRoom(socket);if(room.turnStage!=='awaiting-decision'||!room.drawn||room.drawn.playerId!==socket.id)throw new Error('Aksi tidak valid.');const effect=effectFor(room.drawn.card);if(!effect)throw new Error('Kartu ini tidak memiliki efek.');room.discard.push(room.drawn.card);room.effect={type:effect,playerId:socket.id};room.turnStage='awaiting-effect';addLog(room,`${player.name} menggunakan efek ${room.drawn.card.rank}.`);cb({ok:true});broadcast(room);}catch(e){sendError(cb,e);}});

  socket.on('peekOwn',({cardId},cb)=>{try{const {room,player}=requireRoom(socket);if(room.turnStage!=='awaiting-effect'||room.effect?.type!=='peek-own'||room.effect.playerId!==socket.id)throw new Error('Efek tidak aktif.');const card=player.hand.find(c=>c.id===cardId);if(!card)throw new Error('Kartu tidak ditemukan.');if(player.known.has(cardId))throw new Error('7/8 hanya boleh melihat kartu yang belum diketahui.');player.known.add(cardId);socket.emit('privatePeek',{card,duration:2000});room.effect=null;addLog(room,`${player.name} melihat 1 kartu sendiri dengan efek 7/8.`);nextTurn(room);cb({ok:true});broadcast(room);}catch(e){sendError(cb,e);}});
  socket.on('peekOpponent',({playerId,cardId},cb)=>{try{const {room,player}=requireRoom(socket);if(room.turnStage!=='awaiting-effect'||room.effect?.type!=='peek-opponent'||room.effect.playerId!==socket.id)throw new Error('Efek tidak aktif.');const target=room.players.find(p=>p.id===playerId);const card=target?.hand.find(c=>c.id===cardId);if(!target||!card||target.id===socket.id)throw new Error('Target tidak valid.');socket.emit('privatePeek',{card,duration:2000});room.effect=null;addLog(room,`${player.name} melihat 1 kartu ${target.name} dengan efek 9/10.`);nextTurn(room);cb({ok:true});broadcast(room);}catch(e){sendError(cb,e);}});

  socket.on('blindSwap',({ownCardId,targetPlayerId,targetCardId},cb)=>{try{const {room,player}=requireRoom(socket);if(room.turnStage!=='awaiting-effect'||room.effect?.type!=='blind-swap'||room.effect.playerId!==socket.id)throw new Error('Efek tidak aktif.');const target=room.players.find(p=>p.id===targetPlayerId);const a=player.hand.findIndex(c=>c.id===ownCardId),b=target?.hand.findIndex(c=>c.id===targetCardId);if(!target||target.id===player.id||a<0||b<0)throw new Error('Target/kartu tidak valid.');const own=player.hand[a],opp=target.hand[b];player.hand[a]=opp;target.hand[b]=own;room.effect=null;addLog(room,`${player.name} menukar 1 kartu secara tertutup dengan ${target.name}.`);nextTurn(room);cb({ok:true});broadcast(room);}catch(e){sendError(cb,e);}});

  socket.on('comparePeek',({ownCardId,targetPlayerId,targetCardId},cb)=>{try{const {room,player}=requireRoom(socket);if(room.turnStage!=='awaiting-effect'||room.effect?.type!=='compare-swap'||room.effect.playerId!==socket.id)throw new Error('Efek tidak aktif.');const target=room.players.find(p=>p.id===targetPlayerId);const own=player.hand.find(c=>c.id===ownCardId),opp=target?.hand.find(c=>c.id===targetCardId);if(!target||target.id===player.id||!own||!opp)throw new Error('Target/kartu tidak valid.');socket.emit('comparePeek',{own:{rank:own.rank,suit:own.suit},opponent:{rank:opp.rank,suit:opp.suit},duration:2000});room.pendingCompare={ownCardId,targetPlayerId,targetCardId};cb({ok:true});}catch(e){sendError(cb,e);}});
  socket.on('compareSwap',({swap},cb)=>{try{const {room,player}=requireRoom(socket);if(room.turnStage!=='awaiting-effect'||room.effect?.type!=='compare-swap'||room.effect.playerId!==socket.id||!room.pendingCompare)throw new Error('Perbandingan tidak aktif.');const {ownCardId,targetPlayerId,targetCardId}=room.pendingCompare;const target=room.players.find(p=>p.id===targetPlayerId);const a=player.hand.findIndex(c=>c.id===ownCardId),b=target?.hand.findIndex(c=>c.id===targetCardId);if(!target||a<0||b<0)throw new Error('Kartu tidak ditemukan.');if(swap){[player.hand[a],target.hand[b]]=[target.hand[b],player.hand[a]];addLog(room,`${player.name} membandingkan kartu dengan ${target.name} lalu menukarnya.`);}else addLog(room,`${player.name} membandingkan kartu dengan ${target.name} tanpa menukar.`);room.pendingCompare=null;room.effect=null;nextTurn(room);cb({ok:true});broadcast(room);}catch(e){sendError(cb,e);}});
  socket.on('finishEffect',(_,cb)=>{try{const {room,player}=requireRoom(socket);if(room.turnStage!=='awaiting-effect'||room.effect?.playerId!==socket.id)throw new Error('Efek tidak aktif.');room.effect=null;addLog(room,`${player.name} menyelesaikan efek.`);nextTurn(room);cb({ok:true});broadcast(room);}catch(e){sendError(cb,e);}});

  // Anyone may attempt to place a card matching the current top discard. A mismatch gives +1 card.
  socket.on('matchDiscard',({cardId},cb)=>{try{const {room,player}=requireRoom(socket);if(!['playing','final-round'].includes(room.status))throw new Error('Game belum berjalan.');if(!room.discard.length)throw new Error('Belum ada kartu di tumpukan buang.');const i=player.hand.findIndex(c=>c.id===cardId);if(i<0)throw new Error('Kartu tidak ditemukan.');const card=player.hand[i],top=room.discard[room.discard.length-1];if(card.rank!==top.rank){if(room.deck.length)player.hand.push(room.deck.pop());addLog(room,`${player.name} salah memasang ${card.rank}${SYMBOL[card.suit]}; penalti +1 kartu.`);}else{player.hand.splice(i,1);room.discard.push(card);addLog(room,`${player.name} memasang ${card.rank}${SYMBOL[card.suit]} ke buangan.`);}cb({ok:true});broadcast(room);}catch(e){sendError(cb,e);}});

  socket.on('declareFinish',(_,cb)=>{try{const {room,player}=requireRoom(socket);if(room.status!=='playing')throw new Error('Selesai hanya bisa dideklarasikan saat permainan normal.');room.status='final-round';room.caller=player.id;room.finalTurnsLeft=room.players.length-1;room.turnStage='awaiting-draw';const callerIndex=room.players.findIndex(p=>p.id===player.id);room.turnIndex=(callerIndex+1)%room.players.length;addLog(room,`${player.name} menyatakan SELESAI! Semua pemain lain mendapat tepat 1 giliran terakhir.`);if(room.finalTurnsLeft<=0)endGame(room,'Tidak ada pemain lain.');cb({ok:true});broadcast(room);}catch(e){sendError(cb,e);}});

  socket.on('disconnect',()=>{const code=playerRoom.get(socket.id);if(!code)return;const room=rooms.get(code);if(!room)return;const p=playerOf(room,socket.id);if(p){p.connected=false;p.socketId=null;addLog(room,`${p.name} terputus.`);broadcast(room);}});
});
server.listen(PORT,()=>console.log(`Kartu Terkecil running on http://localhost:${PORT}`));
