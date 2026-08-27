import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { LiveKitRoom, VideoConference, AudioConference, RoomAudioRenderer, ControlBar, useLocalParticipant } from "@livekit/components-react";
import "@livekit/components-styles";
import {
  Bell, Gamepad2, Headphones, MessageCircle, Mic, MonitorUp, Phone, Plus, Search,
  Settings, Users, Video, X, Send, UserPlus, Server, LogOut, Check, UserX, PhoneOff,
  Menu, ChevronLeft, CircleDot, Loader2, ShieldCheck
} from "lucide-react";
import { supabase } from "./lib/supabase";
import { dmRoom, roomToken } from "./lib/livekit";
import "./index.css";

type Session = Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"];
type Profile = { id:string; username:string; display_name:string; avatar_url:string|null; bio:string|null; status:string };
type Friend = { id:string; username:string; display_name:string; avatar_url:string|null; status:string; friendship_id:string; friendship_status:string; requester_id:string; receiver_id:string };
type Conversation = { id:string; kind:string; name:string|null; avatar_url:string|null; created_at:string };
type Message = { id:string; conversation_id:string|null; user_id:string; content:string; created_at:string; profiles?: Profile };

function initials(name:string){ return name.trim().split(/\s+/).slice(0,2).map(x=>x[0]).join("").toUpperCase() || "CP"; }
function Avatar({profile,size="md"}:{profile?:Partial<Profile>|null;size?:"sm"|"md"|"lg"}){return <div className={`avatar ${size}`}><span>{initials(profile?.display_name||profile?.username||"CP")}</span></div>}
function Button({children,className="",...props}:{children:React.ReactNode;className?:string}&React.ButtonHTMLAttributes<HTMLButtonElement>){return <button className={`btn ${className}`} {...props}>{children}</button>}

function Auth(){
 const [signup,setSignup]=useState(false),[email,setEmail]=useState(""),[pass,setPass]=useState(""),[name,setName]=useState(""),[username,setUsername]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 const submit=async()=>{setError("");setBusy(true);try{
   if(signup){if(!name.trim()||!username.trim())throw new Error("Display name and username are required.");
    const clean=username.toLowerCase().replace(/[^a-z0-9_]/g,""); if(clean.length<3)throw new Error("Username must be at least 3 letters/numbers.");
    const {error}=await supabase.auth.signUp({email,password:pass,options:{data:{display_name:name.trim(),username:clean}}}); if(error)throw error;
   } else {const {error}=await supabase.auth.signInWithPassword({email,password:pass});if(error)throw error;}
 }catch(e){setError(e instanceof Error?e.message:"Something went wrong");}finally{setBusy(false)}};
 return <div className="auth"><div className="auth-card"><div className="brand-mark">CP</div><div className="eyebrow">PRIVATE GAMING NETWORK</div><h1>{signup?"Create your squad account":"Welcome back"}</h1><p className="muted">Chat, call, stream and play together in one private space.</p>
 {signup&&<><input className="field" placeholder="Display name" value={name} onChange={e=>setName(e.target.value)}/><input className="field" placeholder="Username" value={username} onChange={e=>setUsername(e.target.value)}/></>}
 <input className="field" type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)}/><input className="field" type="password" placeholder="Password" value={pass} onChange={e=>setPass(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()}/>
 {error&&<div className="error">{error}</div>}<Button disabled={busy} className="primary full" onClick={submit}>{busy?<Loader2 className="spin"/>:signup?"Create account":"Sign in"}</Button>
 <button className="switch" onClick={()=>setSignup(v=>!v)}>{signup?"Already have an account? Sign in":"New here? Create an account"}</button></div></div>
}

function Media({mode,conversationId,close}:{mode:"voice"|"video"|"stream";conversationId:string;close:()=>void}){
 const [token,setToken]=useState<string>(),[url,setUrl]=useState<string>(),[error,setError]=useState("");
 useEffect(()=>{let alive=true;roomToken(dmRoom(conversationId)).then(r=>{if(!alive)return;setToken(r.token);setUrl(r.url)}).catch(e=>alive&&setError(e instanceof Error?e.message:"Could not start media"));return()=>{alive=false}},[conversationId]);
 if(error)return <div className="media-overlay"><div className="media-error"><ShieldCheck size={32}/><h2>Could not start the call</h2><p>{error}</p><Button onClick={close}>Close</Button></div></div>;
 if(!token||!url)return <div className="media-overlay"><div className="connecting"><Loader2 className="spin" size={28}/> Connecting to secure media…</div></div>;
 return <div className="media-overlay"><LiveKitRoom token={token} serverUrl={url} connect audio video={mode==="video"} options={{adaptiveStream:true,dynacast:true}} onError={e=>setError(e instanceof Error?e.message:"LiveKit connection failed")} onMediaDeviceFailure={()=>setError("Microphone or camera access failed")} onDisconnected={close} data-lk-theme="default">
   {mode==="voice" ? <AudioConference/> : <VideoConference/>}
   <RoomAudioRenderer/>
   <div className="media-controls"><ControlBar controls={{microphone:true,camera:mode==="video",screenShare:mode!=="voice",leave:false}} variation="minimal" /></div>
   <div className="media-topbar"><span className="live-pill"><CircleDot size={14}/> {mode==="stream"?"GAME STREAM":"LIVE CALL"}</span><span className="media-hint">{mode==="stream"?"Click Share Screen and choose your game window":"Your voice and media are encrypted in transit by LiveKit"}</span><Button className="danger" onClick={close}><PhoneOff size={18}/> End</Button></div>
 </LiveKitRoom></div>;
}

function App(){
 const [session,setSession]=useState<Session>(null),[profile,setProfile]=useState<Profile|null>(null),[page,setPage]=useState("Home"),[mobileOpen,setMobileOpen]=useState(false),[search,setSearch]=useState(""),[selected,setSelected]=useState<Conversation|null>(null),[media,setMedia]=useState<"voice"|"video"|"stream"|null>(null);
 const [friends,setFriends]=useState<Friend[]>([]),[conversations,setConversations]=useState<Conversation[]>([]),[pendingCount,setPendingCount]=useState(0);
 const [incoming,setIncoming]=useState<{conversationId:string;mode:"voice"|"video"|"stream";fromId:string;fromName:string}|null>(null);
 useEffect(()=>{supabase.auth.getSession().then(({data})=>setSession(data.session));const {data}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s));return()=>data.subscription.unsubscribe()},[]);
 useEffect(()=>{if(!session){setProfile(null);return;} loadProfile();loadFriends();loadConversations();},[session]);
 async function loadProfile(){const {data}=await supabase.from("profiles").select("*").eq("id",session!.user.id).maybeSingle();if(data)setProfile(data);}
 async function loadFriends(){const {data}=await supabase.from("friendships").select("id,status,requester_id,receiver_id,requester:profiles!friendships_requester_id_fkey(id,username,display_name,avatar_url,status),receiver:profiles!friendships_receiver_id_fkey(id,username,display_name,avatar_url,status)").or(`requester_id.eq.${session!.user.id},receiver_id.eq.${session!.user.id}`);const rows=(data||[]).map((r:any)=>{const p=r.requester_id===session!.user.id?r.receiver:r.requester;return {...p,friendship_id:r.id,friendship_status:r.status,requester_id:r.requester_id,receiver_id:r.receiver_id};});setFriends(rows);setPendingCount(rows.filter(x=>x.friendship_status==="pending"&&x.receiver_id===session!.user.id).length);}
 async function loadConversations(){const {data}=await supabase.from("conversation_members").select("conversation:conversations(id,kind,name,avatar_url,created_at)").eq("user_id",session!.user.id);setConversations((data||[]).map((x:any)=>x.conversation).filter(Boolean));}
 useEffect(()=>{if(!session)return;const channel=supabase.channel(`user-${session.user.id}`).on("postgres_changes",{event:"*",schema:"public",table:"friendships"},()=>loadFriends()).on("postgres_changes",{event:"INSERT",schema:"public",table:"conversation_members",filter:`user_id=eq.${session.user.id}`},()=>loadConversations()).subscribe();return()=>{supabase.removeChannel(channel)}},[session]);
 useEffect(()=>{if(!session)return;const ch=supabase.channel(`user-${session.user.id}`).on("broadcast",{event:"call_invite"},({payload})=>{if(payload?.fromId===session.user.id)return;setIncoming({conversationId:payload.conversationId,mode:payload.mode,fromId:payload.fromId,fromName:payload.fromName||"Friend"});}).on("broadcast",{event:"call_cancel"},({payload})=>{if(payload?.conversationId===selected?.id)setIncoming(null)}).on("broadcast",{event:"call_end"},({payload})=>{if(payload?.conversationId===selected?.id){setIncoming(null);setMedia(null)}}).subscribe();return()=>{supabase.removeChannel(ch)}},[session,selected?.id]);
 useEffect(()=>{const openDm=(event:Event)=>{const conversation=(event as CustomEvent<Conversation>).detail;if(!conversation?.id)return;setSelected(conversation);setPage("Messages")};window.addEventListener("connectplay:open-dm",openDm);return()=>window.removeEventListener("connectplay:open-dm",openDm)},[]);
 const sendUserBroadcast=async(userId:string,event:string,payload:Record<string,unknown>)=>{const ch=supabase.channel(`user-${userId}`);try{await new Promise<void>((resolve,reject)=>{let settled=false;const finish=(failure?:Error)=>{if(settled)return;settled=true;failure?reject(failure):resolve()};ch.subscribe(async status=>{if(status==="SUBSCRIBED"){try{const result=await ch.send({type:"broadcast",event,payload});if(result!=="ok")finish(new Error("Friend could not be reached"));else finish()}catch(error){finish(error instanceof Error?error:new Error("Could not send call notification"))}}else if(status==="CHANNEL_ERROR"||status==="TIMED_OUT"){finish(new Error("Friend could not be reached"))}});setTimeout(()=>finish(new Error("Friend could not be reached")),5000)});}finally{await supabase.removeChannel(ch)}};
 const startMedia=async(mode:"voice"|"video"|"stream")=>{if(!currentConversation){setPage("Friends");return;}const {data:members,error}=await supabase.from("conversation_members").select("user_id").eq("conversation_id",currentConversation.id);if(error){alert(error.message);return;}const peer=(members||[]).find((m:any)=>m.user_id!==session!.user.id);if(!peer){alert("Your friend is not available in this conversation yet.");return;}setMedia(mode);try{await sendUserBroadcast(peer.user_id,"call_invite",{conversationId:currentConversation.id,mode,fromId:session!.user.id,fromName:profile?.display_name||"Friend"});}catch(e){setMedia(null);alert(e instanceof Error?e.message:"Could not notify your friend");}};
 const closeMedia=async()=>{const conversation=currentConversation;setMedia(null);if(!conversation)return;const {data:members}=await supabase.from("conversation_members").select("user_id").eq("conversation_id",conversation.id);const peer=(members||[]).find((m:any)=>m.user_id!==session!.user.id);if(peer)await sendUserBroadcast(peer.user_id,"call_end",{conversationId:conversation.id});};
 const acceptIncoming=()=>{if(!incoming)return;const c=conversations.find(x=>x.id===incoming.conversationId)||{id:incoming.conversationId,kind:"dm",name:incoming.fromName,avatar_url:null,created_at:new Date().toISOString()};setSelected(c);setPage("Messages");setMedia(incoming.mode);setIncoming(null)};
 const declineIncoming=async()=>{if(!incoming)return;await sendUserBroadcast(incoming.fromId,"call_cancel",{conversationId:incoming.conversationId});setIncoming(null)};
 if(!session)return <Auth/>;
 const currentConversation=selected||conversations[0]||null;
 return <div className="app-shell">
  <aside className={`rail ${mobileOpen?"open":""}`}><div className="brand-mark small">CP</div>{[["Home",Gamepad2],["Friends",Users],["Messages",MessageCircle]].map(([n,I]:any)=><button key={n} onClick={()=>{setPage(n);setMobileOpen(false)}} className={`rail-btn ${page===n?"active":""}`}><I size={20}/><span>{n}</span></button>)}<div className="rail-bottom"><button className="rail-btn"><Bell size={20}/></button><button className="rail-btn"><Settings size={20}/></button></div></aside>
  <aside className="sidebar"><div className="sidebar-head"><b>ConnectPlay</b><span>●</span></div><Button className={`side-link ${page==="Home"?"selected":""}`} onClick={()=>setPage("Home")}><Gamepad2 size={16}/> Home</Button><Button className={`side-link ${page==="Friends"?"selected":""}`} onClick={()=>setPage("Friends")}><UserPlus size={16}/> Friends {pendingCount>0&&<em>{pendingCount}</em>}</Button><div className="section-label">DIRECT MESSAGES</div><Button className="side-link add" onClick={()=>setPage("Friends")}><Plus size={16}/> Start a conversation</Button>{conversations.map(c=><Button key={c.id} className={`side-link ${page==="Messages"&&currentConversation?.id===c.id?"selected":""}`} onClick={()=>{setSelected(c);setPage("Messages")}}><MessageCircle size={16}/>{c.name||"Direct message"}</Button>)}<div className="sidebar-footer"><Avatar profile={profile} size="sm"/><div className="user-meta"><b>{profile?.display_name||session.user.email}</b><span>@{profile?.username||"player"}</span></div><button className="logout" onClick={()=>supabase.auth.signOut()}><LogOut size={16}/></button></div></aside>
  <main className="main"><header className="topbar"><button className="mobile-menu" onClick={()=>setMobileOpen(v=>!v)}><Menu/></button><div className="page-title">{page==="Messages"&&currentConversation?<><MessageCircle size={18}/> {currentConversation.name||"Direct message"}</>:page}</div><div className="search-box"><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search people or messages"/></div>{page==="Messages"&&currentConversation&&<div className="call-actions"><button onClick={()=>startMedia("voice")} title="Voice call"><Phone size={18}/></button><button onClick={()=>startMedia("video")} title="Video call"><Video size={18}/></button><button onClick={()=>startMedia("stream")} title="Stream game"><MonitorUp size={18}/></button></div>}</header>
  <div className="content">{page==="Messages"&&currentConversation?<Chat conversation={currentConversation} session={session} profile={profile} />:page==="Messages"?<div className="empty messages-empty"><MessageCircle size={28}/><h2>No conversations yet</h2><p>Open a friend's profile to start messaging.</p><Button className="primary" onClick={()=>setPage("Friends")}><Users size={16}/> Find friends</Button></div>:page==="Friends"?<Friends friends={friends} session={session} search={search} reload={()=>{loadFriends();loadConversations()}}/>:<Home onStart={startMedia} onFriends={()=>setPage("Friends")}/>}</div></main>{media&&currentConversation&&<Media mode={media} conversationId={currentConversation.id} close={closeMedia}/>} {incoming&&<div className="incoming-overlay"><div className="incoming-card"><div className="eyebrow">INCOMING {incoming.mode.toUpperCase()}</div><div className="incoming-avatar">{initials(incoming.fromName)}</div><h2>{incoming.fromName}</h2><p>Your friend is calling you.</p><div className="incoming-actions"><Button className="danger" onClick={declineIncoming}><PhoneOff size={18}/> Decline</Button><Button className="primary" onClick={acceptIncoming}><Phone size={18}/> Accept</Button></div></div></div>}</div>
}

function Home({onStart,onFriends}:{onStart:(m:"voice"|"video"|"stream")=>void;onFriends:()=>void}){return <div className="home"><section className="hero"><div className="eyebrow">PRIVATE GAMING NETWORK</div><h1>Your squad.<br/><span>One place.</span></h1><p>Talk, message, video call and stream your games with the people you actually play with.</p><div className="hero-actions"><Button className="primary" onClick={onFriends}><Users size={18}/> Add your friends</Button><Button className="ghost" onClick={()=>onStart("stream")}><MonitorUp size={18}/> Stream gameplay</Button></div></section><div className="feature-grid">{[[Headphones,"Voice calls","Low-latency audio through LiveKit","voice"],[Video,"Video calls","Camera, mic and screen sharing","video"],[Gamepad2,"Game streaming","Share your game window with your squad","stream"]].map(([I,title,desc,mode]:any)=><div className="feature" key={title}><div className="feature-icon"><I size={20}/></div><h3>{title}</h3><p>{desc}</p><Button className="text-btn" onClick={()=>onStart(mode)}>Try it <ChevronLeft size={14} className="rotate"/></Button></div>)}</div></div>}

function Friends({friends,session,search,reload}:{friends:Friend[];session:Session;search:string;reload:()=>void}){
 const [query,setQuery]=useState(search),[results,setResults]=useState<Profile[]>([]),[busy,setBusy]=useState<string|null>(null);
 const doSearch=async()=>{if(query.trim().length<2){setResults([]);return;}const {data}=await supabase.from("profiles").select("*").ilike("username",`%${query.trim()}%`).neq("id",session!.user.id).limit(12);setResults(data||[])};
 const request=async(id:string)=>{
   if(busy)return;
   setBusy(id);
   try{
     const {error}=await supabase.rpc("send_friend_request",{other_user_id:id});
     if(error) throw error;
     setResults(v=>v.filter(p=>p.id!==id));
     await reload();
   }catch(e){alert(e instanceof Error?e.message:"Could not send friend request");}
   finally{setBusy(null)}
 };
 const respond=async(id:string,status:"accepted"|"rejected"|"blocked")=>{
   setBusy(id);
   try{
     const {error}=await supabase.rpc("respond_friend_request",{friendship_id:id,new_status:status});
     if(error) throw error;
     await reload();
   }catch(e){alert(e instanceof Error?e.message:"Could not update friend request");}
   finally{setBusy(null)}
 };
 const startDm=async(friend:Friend)=>{const {data,error}=await supabase.rpc("create_or_get_dm",{other_user_id:friend.id});if(error){alert(error.message);return;}window.dispatchEvent(new CustomEvent("connectplay:open-dm",{detail:data}));};
 const pending=friends.filter(f=>f.friendship_status==="pending"&&f.receiver_id===session!.user.id),accepted=friends.filter(f=>f.friendship_status==="accepted");
 return <div className="page"><div className="page-heading"><div><div className="eyebrow">SOCIAL</div><h2>Friends</h2><p>Find your people and start a private conversation.</p></div></div><div className="search-panel"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doSearch()} placeholder="Search by username"/><Button className="primary" onClick={doSearch}>Search</Button></div>{results.length>0&&<div className="result-list">{results.map(p=><div className="friend-card" key={p.id}><Avatar profile={p}/><div className="friend-main"><b>{p.display_name}</b><span>@{p.username}</span></div><Button disabled={busy===p.id} className="small-btn" onClick={()=>request(p.id)}><UserPlus size={15}/> Add</Button></div>)}</div>}{pending.length>0&&<><div className="section-title">Friend requests</div><div className="friend-grid">{pending.map(f=><div className="friend-card" key={f.friendship_id}><Avatar profile={f}/><div className="friend-main"><b>{f.display_name}</b><span>@{f.username}</span></div><div className="actions"><Button className="small-btn accept" disabled={busy===f.friendship_id} onClick={()=>respond(f.friendship_id,"accepted")}><Check size={15}/></Button><Button className="small-btn danger-lite" disabled={busy===f.friendship_id} onClick={()=>respond(f.friendship_id,"rejected")}><UserX size={15}/></Button></div></div>)}</div></>}<div className="section-title">Your friends</div><div className="friend-grid">{accepted.length?accepted.map(f=><div className="friend-card" key={f.friendship_id}><Avatar profile={f}/><div className="friend-main"><b>{f.display_name}</b><span>@{f.username} · {f.status}</span></div><div className="actions"><Button className="small-btn" onClick={()=>startDm(f)}><MessageCircle size={15}/> Message</Button></div></div>):<div className="empty">No friends yet. Search for a username above.</div>}</div></div>
}

function Chat({conversation,session,profile}:{conversation:Conversation;session:Session;profile:Profile|null}){
 const [messages,setMessages]=useState<Message[]>([]),[text,setText]=useState(""),[sending,setSending]=useState(false),bottom=useRef<HTMLDivElement>(null);
 useEffect(()=>{let mounted=true;(async()=>{const {data}=await supabase.from("messages").select("id,conversation_id,user_id,content,created_at").eq("conversation_id",conversation.id).order("created_at",{ascending:true}).limit(300);if(mounted)setMessages(data||[]);})();const ch=supabase.channel(`conversation-${conversation.id}`).on("postgres_changes",{event:"INSERT",schema:"public",table:"messages",filter:`conversation_id=eq.${conversation.id}`},payload=>setMessages(v=>v.some(m=>m.id===payload.new.id)?v:[...v,payload.new as Message])).subscribe();return()=>{mounted=false;supabase.removeChannel(ch)}},[conversation.id]);
 useEffect(()=>bottom.current?.scrollIntoView({behavior:"smooth"}),[messages.length]);
 const send=async()=>{const content=text.trim();if(!content||sending)return;setSending(true);const {data,error}=await supabase.from("messages").insert({conversation_id:conversation.id,user_id:session!.user.id,content}).select().single();if(!error&&data)setMessages(v=>v.some(m=>m.id===data.id)?v:[...v,data]);if(error)alert(error.message);setText("");setSending(false)};
 return <div className="chat"><div className="chat-intro"><div className="big-avatar"><Avatar profile={profile} size="lg"/></div><h2>{conversation.name||"Direct message"}</h2><p>Private conversation · messages are synced in real time.</p></div><div className="messages">{messages.map(m=><div key={m.id} className={`message ${m.user_id===session!.user.id?"mine":""}`}><Avatar profile={m.user_id===session!.user.id?profile:null} size="sm"/><div><div className="message-meta"><b>{m.user_id===session!.user.id?profile?.display_name||"You":"Friend"}</b><span>{new Date(m.created_at).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}</span></div><div className="bubble">{m.content}</div></div></div>)}<div ref={bottom}/></div><div className="composer"><input value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send()}}} placeholder={`Message ${conversation.name||"your friend"}`}/><button disabled={sending} onClick={send}><Send size={18}/></button></div></div>
}

const root=createRoot(document.getElementById("root")!);root.render(<App/>);
