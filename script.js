const sb=window.supabaseClient;
const $=id=>document.getElementById(id);
const show=v=>{["loginView","signupView","forgotView"].forEach(x=>$(x)?.classList.toggle("hidden",x!==v));$("authStatus").textContent=""};
const msg=t=>$("authStatus").textContent=t;
async function ensureProfile(user){
  if(!user)return;
  const {data,error}=await sb.from("profiles").select("*").eq("id",user.id).maybeSingle();
  if(error) throw error;
  if(data)return data;
  const meta=user.user_metadata||{};
  const username=(meta.username||user.email?.split("@")[0]||"user").toLowerCase().replace(/[^a-z0-9_]/g,"").slice(0,32)||"user";
  const full_name=meta.full_name||username;
  const {data:created,error:e}=await sb.from("profiles").insert({id:user.id,username,full_name,bio:""}).select().single();
  if(e && !/duplicate/i.test(e.message)) throw e;
  return created;
}
$("showSignup").onclick=()=>show("signupView");
$("showLogin").onclick=()=>show("loginView");
$("forgotBtn").onclick=()=>show("forgotView");
$("forgotBack").onclick=()=>show("loginView");

$("loginForm").onsubmit=async e=>{
 e.preventDefault(); msg("Signing in...");
 const {data,error}=await sb.auth.signInWithPassword({email:$("loginEmail").value.trim(),password:$("loginPassword").value});
 if(error){msg(error.message);return}
 await ensureProfile(data.user);
 location.href="dashboard.html";
};
$("signupForm").onsubmit=async e=>{
 e.preventDefault(); msg("Creating account...");
 const username=$("signupUsername").value.trim().toLowerCase();
 if(!/^[a-z0-9_]{3,32}$/.test(username)){msg("Username: 3–32 letters, numbers or _.");return}
 if($("signupPassword").value!==$("signupConfirm").value){msg("Passwords do not match.");return}
 const exists=await sb.from("profiles").select("id").eq("username",username).maybeSingle();
 if(exists.data){msg("Username is already taken.");return}
 if(exists.error){msg(exists.error.message);return}
 const {data,error}=await sb.auth.signUp({email:$("signupEmail").value.trim(),password:$("signupPassword").value,options:{data:{full_name:$("signupName").value.trim(),username}}});
 if(error){msg(error.message);return}
 if(data.session){await ensureProfile(data.user);location.href="dashboard.html"}
 else msg("Account created. Check your email if confirmation is enabled, then login.");
};
$("forgotForm").onsubmit=async e=>{
 e.preventDefault(); msg("Sending...");
 const {error}=await sb.auth.resetPasswordForEmail($("forgotEmail").value.trim(),{redirectTo:location.origin+location.pathname});
 msg(error?error.message:"Reset email sent.");
};
(async()=>{const {data}=await sb.auth.getSession();if(data.session)location.href="dashboard.html"})();
