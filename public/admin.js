let token=localStorage.getItem("vx-admin-token")||"",allProducts=[];
const $=id=>document.getElementById(id);
const auth=()=>({"Content-Type":"application/json","Authorization":"Bearer "+token});

async function api(path,opts={}){
 const r=await fetch(path,{...opts,headers:{...auth(),...(opts.headers||{})}});
 const d=await r.json();
 if(!r.ok)throw Error(d.error||"Алдаа гарлаа");
 return d;
}

function money(n){return Number(n||0).toLocaleString("mn-MN")+"₮";}
function esc(s){
 return String(s||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

async function start(){
 if(!token)return;
 try{
  $("login").classList.add("hidden");
  $("dashboard").classList.remove("hidden");
  await Promise.all([overview(),products(),orders(),coupons()]);
 }catch(e){
  token="";
  localStorage.removeItem("vx-admin-token");
  $("login").classList.remove("hidden");
  $("dashboard").classList.add("hidden");
  $("loginMsg").textContent=e.message;
 }
}

$("loginBtn").onclick=async()=>{
 try{
  const r=await fetch("/api/admin/login",{
   method:"POST",
   headers:{"Content-Type":"application/json"},
   body:JSON.stringify({password:$("password").value})
  });
  const d=await r.json();
  if(!r.ok)throw Error(d.error);
  token=d.token;
  localStorage.setItem("vx-admin-token",token);
  start();
 }catch(e){$("loginMsg").textContent=e.message;}
};

$("logout").onclick=()=>{
 token="";
 localStorage.removeItem("vx-admin-token");
 location.reload();
};

async function overview(){
 const d=await api("/api/admin/overview");
 $("stats").innerHTML=[
  ["Идэвхтэй бараа",d.products],
  ["Нийт захиалга",d.orders],
  ["Нийт борлуулалт",money(d.revenue)],
  ["Энэ сарын борлуулалт",money(d.monthly)],
  ["Бага үлдэгдэл",d.lowStock]
 ].map(x=>`<div class="stat"><small>${x[0]}</small><b>${x[1]}</b></div>`).join("");
}

async function products(){
 allProducts=await api("/api/admin/products");
 $("productTable").innerHTML=`<div class="table-wrap"><table>
 <tr><th>Бараа</th><th>Үнэ</th><th>Үлдэгдэл</th><th>Төлөв</th><th>Үйлдэл</th></tr>
 ${allProducts.map(p=>`<tr>
 <td>${esc(p.name)}<small>${esc(p.category)}</small></td>
 <td>${money(p.price)}</td><td>${p.stock}</td>
 <td>${p.active?"Идэвхтэй":"Архивласан"}</td>
 <td><button onclick="editProduct('${p._id}')">Засах</button>
 <button onclick="deleteProduct('${p._id}')">Устгах</button></td>
 </tr>`).join("")}
 </table></div>`;
}

function showPreview(url){
 const img=$("imagePreview");
 if(url){
  img.src=url;
  img.style.display="block";
 }else{
  img.removeAttribute("src");
  img.style.display="none";
 }
}

$("pimage").addEventListener("input",()=>{
 showPreview($("pimage").value.trim());
});

$("pimageFile").addEventListener("change",async()=>{
 const file=$("pimageFile").files[0];
 if(!file)return;

 if(!file.type.startsWith("image/")){
  $("uploadMsg").textContent="Зөвхөн зураг сонгоно уу.";
  $("pimageFile").value="";
  return;
 }

 if(file.size>10*1024*1024){
  $("uploadMsg").textContent="Зураг 10MB-аас бага байх ёстой.";
  $("pimageFile").value="";
  return;
 }

 $("uploadMsg").textContent="Зураг байршуулж байна...";
 try{
  const signed=await api("/api/admin/upload-signature",{
   method:"POST",
   body:JSON.stringify({})
  });

  const form=new FormData();
  form.append("file",file);
  form.append("api_key",signed.apiKey);
  form.append("timestamp",signed.timestamp);
  form.append("signature",signed.signature);

  const response=await fetch(
   `https://api.cloudinary.com/v1_1/${signed.cloudName}/image/upload`,
   {method:"POST",body:form}
  );

  const result=await response.json();
  if(!response.ok)throw Error(result.error?.message||"Зураг upload амжилтгүй.");

  $("pimage").value=result.secure_url;
  showPreview(result.secure_url);
  $("uploadMsg").textContent="Зураг амжилттай байршууллаа!";
 }catch(e){
  $("uploadMsg").textContent="Алдаа: "+e.message;
 }
});

window.editProduct=id=>{
 const p=allProducts.find(x=>x._id===id);
 $("pid").value=p._id;
 $("pname").value=p.name;
 $("pcat").value=p.category;
 $("pprice").value=p.price;
 $("pold").value=p.oldPrice||0;
 $("pstock").value=p.stock;
 $("pimage").value=p.image||"";
 $("pdesc").value=p.description||"";
 $("pfeatured").checked=!!p.featured;
 $("pimageFile").value="";
 $("uploadMsg").textContent="Одоо байгаа зураг";
 showPreview(p.image||"");
 $("productForm").classList.remove("hidden");
};

window.deleteProduct=async id=>{
 if(!confirm("Энэ барааг дэлгүүрээс нуух уу?"))return;
 try{
  await api("/api/admin/products/"+id,{method:"DELETE"});
  await products();
  await overview();
 }catch(e){$("adminMsg").textContent=e.message;}
};

$("newProduct").onclick=()=>{
 $("productForm").reset();
 $("pid").value="";
 $("uploadMsg").textContent="Зураг сонгоогүй байна.";
 showPreview("");
 $("productForm").classList.remove("hidden");
};

$("cancelForm").onclick=()=>{
 $("productForm").classList.add("hidden");
 $("productForm").reset();
 $("pid").value="";
 $("uploadMsg").textContent="Зураг сонгоогүй байна.";
 showPreview("");
};

$("productForm").onsubmit=async e=>{
 e.preventDefault();
 const id=$("pid").value;
 const body={
  name:$("pname").value,
  category:$("pcat").value,
  price:Number($("pprice").value),
  oldPrice:Number($("pold").value),
  stock:Number($("pstock").value),
  image:$("pimage").value,
  description:$("pdesc").value,
  featured:$("pfeatured").checked
 };
 try{
  await api(id?"/api/admin/products/"+id:"/api/admin/products",{
   method:id?"PUT":"POST",
   body:JSON.stringify(body)
  });
  $("productForm").classList.add("hidden");
  await products();
  await overview();
  $("adminMsg").textContent="Бараа хадгалагдлаа.";
 }catch(e){$("adminMsg").textContent=e.message;}
};

async function orders(){
 const os=await api("/api/admin/orders");
 $("orderTable").innerHTML=`<div class="table-wrap"><table>
 <tr><th>Захиалга</th><th>Харилцагч</th><th>Бараа</th><th>Нийт</th><th>Төлөв</th><th>Төлбөр</th></tr>
 ${os.map(o=>`<tr>
 <td>${esc(o.code)}<small>${new Date(o.createdAt).toLocaleString("mn-MN")}</small></td>
 <td>${esc(o.customer)}<small>${esc(o.phone)} · ${esc(o.address)}</small></td>
 <td>${o.items.map(i=>esc(i.name)+" × "+i.quantity).join("<br>")}</td>
 <td>${money(o.total)}</td>
 <td><select onchange="changeOrder('${o._id}','status',this.value)">
 ${["Шинэ","Баталгаажсан","Хүргэлтэд гарсан","Хүргэгдсэн","Цуцалсан"].map(s=>`<option ${o.status===s?"selected":""}>${s}</option>`).join("")}
 </select></td>
 <td><select onchange="changeOrder('${o._id}','paymentStatus',this.value)">
 ${["Төлөөгүй","Төлсөн","Буцаасан"].map(s=>`<option ${o.paymentStatus===s?"selected":""}>${s}</option>`).join("")}
 </select></td>
 </tr>`).join("")}
 </table></div>`;
}

window.changeOrder=async(id,key,value)=>{
 try{
  await api("/api/admin/orders/"+id,{
   method:"PATCH",
   body:JSON.stringify({[key]:value})
  });
  await overview();
 }catch(e){$("adminMsg").textContent=e.message;}
};

async function coupons(){
 const cs=await api("/api/admin/coupons");
 $("couponTable").innerHTML=cs.map(c=>
  `<div class="cart-row"><b>${esc(c.code)} — ${c.percent}%</b>
  <button onclick="removeCoupon('${c._id}')">Устгах</button></div>`
 ).join("")||"<p>Купон алга.</p>";
}

window.removeCoupon=async id=>{
 await api("/api/admin/coupons/"+id,{method:"DELETE"});
 coupons();
};

$("couponForm").onsubmit=async e=>{
 e.preventDefault();
 try{
  await api("/api/admin/coupons",{
   method:"POST",
   body:JSON.stringify({
    code:$("couponCode").value,
    percent:Number($("couponPercent").value)
   })
  });
  $("couponForm").reset();
  coupons();
 }catch(e){$("adminMsg").textContent=e.message;}
};

$("refreshOrders").onclick=orders;

document.querySelectorAll("[data-tab]").forEach(b=>b.onclick=()=>{
 document.querySelectorAll("[data-tab]").forEach(x=>x.classList.toggle("active",x===b));
 ["products","orders","coupons"].forEach(t=>
  $("tab-"+t).classList.toggle("hidden",t!==b.dataset.tab)
 );
});

start();
