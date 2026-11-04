const socket=io();const $=id=>document.getElementById(id);let myRoom="",isHost=false;
function toast(msg){$("toast").textContent=msg;$("toast").style.display="block";setTimeout(()=>$("toast").style.display="none",2800)}
function name(){return $("name").value.trim()||"플레이어"}
$("create").onclick=()=>socket.emit("create",name());
$("join").onclick=()=>socket.emit("join",{code:$("code").value.trim(),name:name()});
$("start").onclick=()=>socket.emit("start");
$("submit").onclick=submitWord;$("word").addEventListener("keydown",e=>{if(e.key==="Enter")submitWord()});
function submitWord(){if($("word").value.trim()){socket.emit("word",$("word").value);$("word").value="";}}
$("pass").onclick=()=>socket.emit("pass");
socket.on("created",code=>{myRoom=code;isHost=true;$("login").classList.add("hidden");$("game").classList.remove("hidden");$("roomcode").textContent=code;$("start").style.display="block";});
socket.on("state",r=>{myRoom=r.code;$("roomcode").textContent=r.code;$("status").textContent=r.status==="waiting"?"대기 중":"게임 진행 중";$("currentword").textContent=r.word||"시작 단어 없음";$("timer").textContent=r.seconds;$("players").innerHTML=r.players.map((p,i)=>`<li>${i===r.turn&&r.status==="playing"?"▶ ":""}${escapeHtml(p.name)} · ${p.score}점${p.connected?"":" (연결 끊김)"}</li>`).join("");$("start").style.display=r.status==="waiting"?"block":"none";$("hint").textContent=r.status==="waiting"?"방 코드 공유 후 2명 이상 모이면 시작하세요.":"현재 차례인 플레이어가 단어를 입력합니다.";});
socket.on("wordPlayed",d=>{const div=document.createElement("div");div.textContent=`${d.name}: ${d.word} (+10점)`;$("log").prepend(div);});
socket.on("notice",toast);socket.on("errorMsg",toast);
function escapeHtml(s){return s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
