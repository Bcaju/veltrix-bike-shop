require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const { v2: cloudinary } = require("cloudinary");

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.static("public"));

const Product = mongoose.model("Product", new mongoose.Schema({
  name: {type:String, required:true, trim:true},
  category: {type:String, default:"Сэлбэг"},
  description: {type:String, default:""},
  price: {type:Number, required:true, min:0},
  oldPrice: {type:Number, default:0},
  stock: {type:Number, default:0, min:0},
  image: {type:String, default:""},
  featured: {type:Boolean, default:false},
  active: {type:Boolean, default:true}
}, {timestamps:true}));

const Order = mongoose.model("Order", new mongoose.Schema({
  code: {type:String, unique:true},
  customer: {type:String, required:true},
  phone: {type:String, required:true},
  address: {type:String, required:true},
  note: {type:String, default:""},
  items: [{productId:String, name:String, price:Number, quantity:Number}],
  total: Number,
  deliveryFee: {type:Number, default:0},
  status: {type:String, default:"Шинэ"},
  paymentMethod: {type:String, default:"Хүлээн авахдаа төлөх"},
  paymentStatus: {type:String, default:"Төлөөгүй"}
}, {timestamps:true}));

const Coupon = mongoose.model("Coupon", new mongoose.Schema({
  code:{type:String,unique:true,uppercase:true,trim:true},
  percent:{type:Number,min:1,max:90},
  active:{type:Boolean,default:true},
  expiresAt:Date
},{timestamps:true}));

const secret = () => process.env.JWT_SECRET || "change-this-secret-before-production";
function adminOnly(req,res,next){
  const token=(req.headers.authorization||"").replace(/^Bearer /,"");
  try { const data=jwt.verify(token,secret()); if(data.role!=="admin") throw new Error(); req.admin=data; next(); }
  catch { return res.status(401).json({error:"Админ эрх шаардлагатай"}); }
}
function cloudinaryReady(){
  return process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET;
}
if(cloudinaryReady()) cloudinary.config({
  cloud_name:process.env.CLOUDINARY_CLOUD_NAME,
  api_key:process.env.CLOUDINARY_API_KEY,
  api_secret:process.env.CLOUDINARY_API_SECRET
});

app.get("/health",(req,res)=>res.json({ok:true,db:mongoose.connection.readyState===1}));
app.get("/api/products",async(req,res)=>{
  try { const products=await Product.find({active:true}).sort({featured:-1,createdAt:-1}).lean(); res.json(products); }
  catch(e){res.status(500).json({error:"Бараа ачаалж чадсангүй"});}
});
app.post("/api/orders",async(req,res)=>{
  try{
    const {customer,phone,address,note,items,paymentMethod,coupon}=req.body;
    if(!customer||!phone||!address||!Array.isArray(items)||!items.length) return res.status(400).json({error:"Мэдээллээ бүрэн бөглөнө үү"});
    let clean=[], subtotal=0;
    for(const item of items){
      const p=await Product.findOne({_id:item.productId,active:true});
      const q=Math.max(1,Math.floor(Number(item.quantity)||1));
      if(!p||p.stock<q) return res.status(400).json({error:`${p?.name||"Бараа"} үлдэгдэл хүрэлцэхгүй байна`});
      clean.push({productId:String(p._id),name:p.name,price:p.price,quantity:q}); subtotal+=p.price*q;
    }
    let discount=0;
    if(coupon){const c=await Coupon.findOne({code:String(coupon).toUpperCase(),active:true}); if(c&&(!c.expiresAt||c.expiresAt>Date.now())) discount=Math.round(subtotal*c.percent/100);}
    const deliveryFee=subtotal>=150000?0:8000;
    const order=await Order.create({code:"VX"+Date.now().toString().slice(-8),customer,phone,address,note,items:clean,total:Math.max(0,subtotal-discount)+deliveryFee,deliveryFee,paymentMethod:paymentMethod||"Хүлээн авахдаа төлөх"});
    for(const item of clean) await Product.updateOne({_id:item.productId},{$inc:{stock:-item.quantity}});
    res.status(201).json({ok:true,code:order.code,total:order.total});
  }catch(e){res.status(500).json({error:"Захиалга үүсгэхэд алдаа гарлаа"});}
});
app.post("/api/admin/login",async(req,res)=>{
  const password=String(req.body.password||"");
  if(!process.env.ADMIN_PASSWORD) return res.status(503).json({error:"Render дээр ADMIN_PASSWORD тохируулаагүй байна"});
  const ok=await bcrypt.compare(password,process.env.ADMIN_PASSWORD).catch(()=>false) || password===process.env.ADMIN_PASSWORD;
  if(!ok) return res.status(401).json({error:"Нууц үг буруу байна"});
  res.json({token:jwt.sign({role:"admin"},secret(),{expiresIn:"12h"})});
});
app.get("/api/admin/overview",adminOnly,async(req,res)=>{
  const [products,orders,all]=await Promise.all([Product.countDocuments({active:true}),Order.countDocuments(),Order.find({status:{$ne:"Цуцалсан"}}).select("total createdAt status")]);
  const revenue=all.reduce((s,o)=>s+(o.total||0),0);
  const month=new Date(); month.setDate(1); month.setHours(0,0,0,0);
  const monthly=all.filter(o=>o.createdAt>=month).reduce((s,o)=>s+(o.total||0),0);
  res.json({products,orders,revenue,monthly,lowStock:await Product.countDocuments({active:true,stock:{$lte:3}})});
});
app.get("/api/admin/products",adminOnly,async(req,res)=>res.json(await Product.find().sort({createdAt:-1})));
app.post("/api/admin/products",adminOnly,async(req,res)=>{
  try{const p=await Product.create(req.body);res.status(201).json(p);}catch(e){res.status(400).json({error:"Барааны мэдээллээ шалгана уу"});}
});
app.put("/api/admin/products/:id",adminOnly,async(req,res)=>{
  try{const p=await Product.findByIdAndUpdate(req.params.id,req.body,{new:true,runValidators:true});if(!p)return res.status(404).json({error:"Бараа олдсонгүй"});res.json(p);}catch(e){res.status(400).json({error:"Шинэчлэхэд алдаа гарлаа"});}
});
app.delete("/api/admin/products/:id",adminOnly,async(req,res)=>{
  const p=await Product.findByIdAndUpdate(req.params.id,{active:false},{new:true}); if(!p)return res.status(404).json({error:"Бараа олдсонгүй"});res.json({ok:true});
});
app.get("/api/admin/orders",adminOnly,async(req,res)=>res.json(await Order.find().sort({createdAt:-1}).limit(300)));
app.patch("/api/admin/orders/:id",adminOnly,async(req,res)=>{
  const allowed=["Шинэ","Баталгаажсан","Хүргэлтэд гарсан","Хүргэгдсэн","Цуцалсан"];
  const patch={};
  if(allowed.includes(req.body.status))patch.status=req.body.status;
  if(["Төлөөгүй","Төлсөн","Буцаасан"].includes(req.body.paymentStatus))patch.paymentStatus=req.body.paymentStatus;
  const o=await Order.findByIdAndUpdate(req.params.id,patch,{new:true});if(!o)return res.status(404).json({error:"Захиалга олдсонгүй"});res.json(o);
});
app.get("/api/admin/coupons",adminOnly,async(req,res)=>res.json(await Coupon.find().sort({createdAt:-1})));
app.post("/api/admin/coupons",adminOnly,async(req,res)=>{
  try{const c=await Coupon.create({code:String(req.body.code||"").toUpperCase(),percent:Number(req.body.percent),expiresAt:req.body.expiresAt||null});res.status(201).json(c);}
  catch(e){res.status(400).json({error:"Купоны код давхардсан эсвэл мэдээлэл буруу байна"});}
});
app.delete("/api/admin/coupons/:id",adminOnly,async(req,res)=>{await Coupon.findByIdAndDelete(req.params.id);res.json({ok:true});});
app.post("/api/admin/upload-signature",adminOnly,async(req,res)=>{
  if(!cloudinaryReady())return res.status(503).json({error:"Cloudinary тохируулаагүй. Зургийн шууд URL ашиглаж болно."});
  const timestamp=Math.round(Date.now()/1000), params={timestamp};
  const signature=cloudinary.utils.api_sign_request(params,process.env.CLOUDINARY_API_SECRET);
  res.json({cloudName:process.env.CLOUDINARY_CLOUD_NAME,apiKey:process.env.CLOUDINARY_API_KEY,timestamp,signature});
});
app.get("/admin",(req,res)=>res.sendFile(require("path").join(__dirname,"public","admin.html")));

const port=process.env.PORT||3000;
mongoose.connect(process.env.MONGODB_URI||"")
 .then(()=>{console.log("VELTRIX database connected");app.listen(port,()=>console.log("VELTRIX running on "+port));})
 .catch(err=>{console.error("Database connection failed:",err.message);process.exit(1);});
