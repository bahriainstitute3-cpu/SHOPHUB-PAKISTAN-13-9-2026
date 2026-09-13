import{d as f,a as V,u as X,g as ee,j as t}from"./index--_CEP_a4.js";import{b as te,r as c}from"./vendor-react-C703wYd8.js";import{p as se}from"./orders-Do9T3-s5.js";import{r as ae,v as re,c as Z,d as ie,e as C,x as P,q as ne,y as le,k as j}from"./vendor-firebase-CC_D3tih.js";import{D as E,r as de,l as oe}from"./deliveryZones-B8DcY9fQ.js";import"./vendor-emailjs-DtVQIX_c.js";async function h(n){if(!n)return[];const l=ae(Z(f,"users",n,"addresses"),re("createdAt","desc"));return(await ie(l)).docs.map(i=>({id:i.id,...i.data()}))}async function ce(n,l){const d={...l,fullName:(l.fullName||"").trim(),phone:(l.phone||"").trim(),city:(l.city||"").trim(),area:(l.area||"").trim(),address:(l.address||"").trim(),landmark:(l.landmark||"").trim(),default:!!l.default,createdAt:j(),updatedAt:j()},i=Z(f,"users",n,"addresses"),m=await ne(i,d);if(d.default){const a=await h(n);await Promise.all(a.filter(o=>o.id!==m.id&&o.default).map(o=>P(C(f,"users",n,"addresses",o.id),{default:!1,updatedAt:j()})))}return m.id}async function ue(n,l,d){const i=C(f,"users",n,"addresses",l),m={...d,fullName:(d.fullName||"").trim(),phone:(d.phone||"").trim(),city:(d.city||"").trim(),area:(d.area||"").trim(),address:(d.address||"").trim(),landmark:(d.landmark||"").trim(),updatedAt:j()};if(await P(i,m),m.default){const a=await h(n);await Promise.all(a.filter(o=>o.id!==l&&o.default).map(o=>P(C(f,"users",n,"addresses",o.id),{default:!1,updatedAt:j()})))}return l}async function me(n,l){await le(C(f,"users",n,"addresses",l))}async function pe(n,l){const d=await h(n);await Promise.all(d.map(i=>P(C(f,"users",n,"addresses",i.id),{default:i.id===l,updatedAt:j()})))}const he={bank:"Bank Transfer",jazzcash:"JazzCash",easypaisa:"EasyPaisa",cod:"Cash on Delivery"};function be(){const{items:n,subtotal:l,clearCart:d}=V(),{user:i}=X(),m=te(),[a,o]=c.useState({fullName:"",phone:"",city:"",area:"",address:"",landmark:"",postalCode:""}),[B,w]=c.useState([]),[b,y]=c.useState(""),[x,Y]=c.useState([]),[L,g]=c.useState("select"),[T,$]=c.useState("cod"),[_,M]=c.useState([]),[q,v]=c.useState(""),[R,O]=c.useState(!1),[W,I]=c.useState(!1),z=c.useRef(!1);c.useEffect(()=>{i?.uid&&h(i.uid).then(e=>{if(w(e),z.current)return;const s=e.find(r=>r.default)||e[0];s&&(y(s.id),k(s))})},[i]),c.useEffect(()=>{function e(){oe().then(s=>Y(s||[])).catch(s=>console.error("Could not load delivery charges:",s))}return e(),window.addEventListener("deliveryzoneschange",e),()=>window.removeEventListener("deliveryzoneschange",e)},[]),c.useEffect(()=>{if(x.length===0||!a.city)return;x.filter(r=>r.city!==E).some(r=>r.city.trim().toLowerCase()===a.city.trim().toLowerCase())&&g("select")},[x]),c.useEffect(()=>{if(n.length===0){M([]);return}let e=!1;return Promise.all(n.map(async s=>{const r=await ee(s.productId);return{productId:s.productId,productName:s.name,ownerEmail:r?.ownerEmail||"",sellerPaymentMethod:r?.sellerPaymentMethod||"cod",sellerAccountTitle:r?.sellerAccountTitle||"",sellerAccountNumber:r?.sellerAccountNumber||"",sellerBankName:r?.sellerBankName||""}})).then(s=>{e||M(s.filter(r=>r.sellerPaymentMethod!=="cod"))}),()=>{e=!0}},[n]);const F=x.filter(e=>e.city!==E),A=de(x,a.city),D=l+A;function k(e){o({...e});const s=x.filter(N=>N.city!==E),r=(e?.city||"").trim();if(!r){g("select");return}const p=s.some(N=>N.city.trim().toLowerCase()===r.toLowerCase());g(p?"select":"other")}function J(e){z.current=!0,e==="__other__"?(g("other"),o(s=>({...s,city:""}))):(g("select"),o(s=>({...s,city:e})))}function u(e,s){z.current=!0,o(r=>({...r,[e]:s}))}async function G(e){if(e.preventDefault(),v(""),!a.fullName||!a.phone||!a.city||!a.address)return v("Please fill in all required address fields.");O(!0);try{const s={...a},r=n.map(S=>({productId:S.productId,name:S.name,price:S.price,qty:S.qty,image:S.image})),{orderNumber:p,id:N}=await se({userId:i.uid,customerName:a.fullName,customerEmail:i.email,items:r,address:s,paymentMethod:T,subtotal:l,deliveryCharge:A,discount:0,total:D});d(),m(`/orders/${N}`,{state:{justPlaced:!0,orderNumber:p}})}catch(s){v(s.message||"Could not place order. Please try again.")}finally{O(!1)}}async function H(){if(i?.uid){if(!a.fullName||!a.phone||!a.city||!a.address)return v("Please complete the delivery address fields before saving.");I(!0),v("");try{if(b)await ue(i.uid,b,a);else{const r=await ce(i.uid,{...a,default:B.length===0});y(r)}const e=await h(i.uid);w(e);const s=e.find(r=>r.default)||e[0];s&&(y(s.id),k(s))}catch(e){v(e.message||"Could not save address.")}finally{I(!1)}}}async function U(e){y(e.id),k(e)}async function K(e){if(!i?.uid)return;await me(i.uid,e);const s=await h(i.uid);if(w(s),b===e){const r=s.find(p=>p.default)||s[0];y(r?.id||""),r?k(r):(o({fullName:"",phone:"",city:"",area:"",address:"",landmark:"",postalCode:""}),g("select"))}}async function Q(e){if(!i?.uid)return;await pe(i.uid,e);const s=await h(i.uid);w(s);const r=s.find(p=>p.id===e);r&&(y(r.id),k(r))}return n.length===0?t.jsx("div",{className:"container empty-state",style:{padding:60},children:"Your cart is empty."}):t.jsxs("div",{className:"container checkout-page",children:[t.jsx("style",{children:`
        .checkout-page {
          padding: 32px 20px;
          display: grid;
          grid-template-columns: 1fr 320px;
          gap: 30px;
          align-items: start;
        }
        .checkout-form-col {
          order: 1;
        }
        .checkout-summary-col {
          order: 2;
          position: sticky;
          top: 20px;
        }
        .checkout-address-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        .checkout-address-actions {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
        }
        .checkout-address-actions .btn-group {
          display: flex;
          gap: 6px;
        }

        /* Tablet: narrower summary column, tighter padding */
        @media (max-width: 1024px) {
          .checkout-page {
            grid-template-columns: 1fr 260px;
            gap: 20px;
            padding: 24px 16px;
          }
        }

        /* Mobile: single column, summary on top, address fields stack */
        @media (max-width: 720px) {
          .checkout-page {
            grid-template-columns: 1fr;
            gap: 16px;
            padding: 16px 12px;
          }
          .checkout-form-col {
            order: 2;
          }
          .checkout-summary-col {
            order: 1;
            position: static;
          }
          .checkout-address-row {
            grid-template-columns: 1fr;
            gap: 0;
          }
          .checkout-address-actions {
            flex-direction: column;
            align-items: flex-start;
            gap: 8px;
          }
          .checkout-address-actions .btn-group {
            width: 100%;
          }
          .checkout-address-actions .btn-group .btn {
            flex: 1;
          }
          .btn-block {
            font-size: 15px;
            padding: 14px;
          }
        }
      `}),t.jsx("div",{className:"checkout-summary-col",children:t.jsxs("div",{className:"card",style:{padding:20,height:"fit-content"},children:[t.jsx("h3",{style:{fontSize:16,marginBottom:16},children:"Order Summary"}),n.map(e=>t.jsxs("div",{style:{display:"flex",justifyContent:"space-between",fontSize:13.5,marginBottom:8},children:[t.jsxs("span",{children:[e.name," × ",e.qty]}),t.jsxs("span",{children:["Rs ",(e.price*e.qty).toLocaleString()]})]},e.productId)),t.jsxs("div",{style:{borderTop:"1px solid var(--line)",margin:"12px 0",paddingTop:12},children:[t.jsxs("div",{style:{display:"flex",justifyContent:"space-between",fontSize:14,marginBottom:6},children:[t.jsx("span",{children:"Product Subtotal"}),t.jsxs("span",{children:["Rs ",l.toLocaleString()]})]}),t.jsxs("div",{style:{display:"flex",justifyContent:"space-between",fontSize:14,marginBottom:6},children:[t.jsx("span",{children:"Delivery Charges"}),t.jsx("span",{children:a.city.trim()?`Rs ${A.toLocaleString()}`:"Select a city"})]}),t.jsxs("div",{style:{display:"flex",justifyContent:"space-between",fontWeight:800,fontSize:16,marginTop:10},children:[t.jsx("span",{children:"Grand Total"}),t.jsxs("span",{children:["Rs ",Math.max(0,D).toLocaleString()]})]})]})]})}),t.jsx("div",{className:"checkout-form-col",children:t.jsxs("form",{onSubmit:G,children:[t.jsx("h1",{style:{fontSize:24,marginBottom:20},children:"Checkout"}),t.jsxs("div",{className:"card",style:{padding:20,marginBottom:20},children:[t.jsx("h3",{style:{fontSize:16,marginBottom:14},children:"Delivery Address"}),B.length>0&&t.jsxs("div",{style:{marginBottom:18},children:[t.jsx("div",{style:{fontSize:12.5,fontWeight:700,color:"var(--ink-soft)",marginBottom:8,textTransform:"uppercase",letterSpacing:"0.04em"},children:"Saved addresses"}),t.jsx("div",{style:{display:"grid",gap:8},children:B.map(e=>t.jsxs("div",{style:{border:b===e.id?"1.5px solid var(--teal)":"1.5px solid var(--line)",borderRadius:10,padding:10},children:[t.jsxs("div",{className:"checkout-address-actions",children:[t.jsxs("button",{type:"button",onClick:()=>U(e),style:{textAlign:"left",fontWeight:700,background:"none",border:0,padding:0,color:"var(--ink)"},children:[e.fullName," · ",e.city,e.default&&t.jsx("span",{style:{marginLeft:8,color:"var(--success)",fontSize:11},children:"Default"})]}),t.jsxs("div",{className:"btn-group",children:[!e.default&&t.jsx("button",{type:"button",className:"btn btn-ghost btn-sm",onClick:()=>Q(e.id),children:"Set default"}),t.jsx("button",{type:"button",className:"btn btn-danger btn-sm",onClick:()=>K(e.id),children:"Delete"})]})]}),t.jsx("div",{style:{fontSize:12.5,color:"var(--ink-soft)",marginTop:4},children:e.address})]},e.id))})]}),t.jsxs("div",{className:"field",children:[t.jsx("label",{children:"Full Name"}),t.jsx("input",{required:!0,value:a.fullName,onChange:e=>u("fullName",e.target.value)})]}),t.jsxs("div",{className:"field",children:[t.jsx("label",{children:"Phone Number"}),t.jsx("input",{required:!0,value:a.phone,onChange:e=>u("phone",e.target.value)})]}),t.jsxs("div",{className:"checkout-address-row",children:[t.jsxs("div",{className:"field",children:[t.jsx("label",{children:"City"}),t.jsxs("select",{required:!0,value:L==="other"?"__other__":a.city||"",onChange:e=>J(e.target.value),children:[t.jsx("option",{value:"",disabled:!0,children:"Select city"}),F.map(e=>t.jsx("option",{value:e.city,children:e.city},e.id)),t.jsx("option",{value:"__other__",children:"Other city"})]}),L==="other"&&t.jsx("input",{required:!0,value:a.city,onChange:e=>u("city",e.target.value),placeholder:"Type your city name",style:{marginTop:8}}),a.city.trim()&&t.jsxs("div",{style:{fontSize:12,color:"var(--ink-soft)",marginTop:6},children:["Delivery charge for ",a.city,": ",t.jsxs("strong",{children:["Rs ",A.toLocaleString()]})]})]}),t.jsxs("div",{className:"field",children:[t.jsx("label",{children:"Area"}),t.jsx("input",{value:a.area,onChange:e=>u("area",e.target.value)})]}),t.jsxs("div",{className:"field",children:[t.jsx("label",{children:"State"}),t.jsx("input",{value:a.state||"",onChange:e=>u("state",e.target.value)})]}),t.jsxs("div",{className:"field",children:[t.jsx("label",{children:"Email"}),t.jsx("input",{type:"email",value:a.email||"",onChange:e=>u("email",e.target.value),placeholder:"e.g., you@example.com"})]})]}),t.jsxs("div",{className:"field",children:[t.jsx("label",{children:"Complete Address"}),t.jsx("textarea",{required:!0,rows:2,value:a.address,onChange:e=>u("address",e.target.value)})]}),t.jsxs("div",{className:"checkout-address-row",children:[t.jsxs("div",{className:"field",children:[t.jsx("label",{children:"Landmark (optional)"}),t.jsx("input",{value:a.landmark,onChange:e=>u("landmark",e.target.value)})]}),t.jsxs("div",{className:"field",children:[t.jsx("label",{children:"Postal Code"}),t.jsx("input",{value:a.postalCode||"",onChange:e=>u("postalCode",e.target.value),placeholder:"e.g., 75500"})]})]}),t.jsx("button",{type:"button",className:"btn btn-outline",disabled:W,onClick:H,children:W?"Saving…":b?"Save changes to address":"Save this address"})]}),t.jsxs("div",{className:"card",style:{padding:20,marginBottom:20},children:[t.jsx("h3",{style:{fontSize:16,marginBottom:14},children:"Payment Method"}),[{id:"cod",label:"Cash on Delivery"},{id:"bank_transfer",label:"Bank Transfer"},{id:"wallet",label:"Wallet Payment (JazzCash / EasyPaisa)"}].map(e=>t.jsxs("label",{style:{display:"flex",alignItems:"center",gap:10,padding:"10px 0",opacity:e.disabled?.5:1},children:[t.jsx("input",{type:"radio",name:"pm",disabled:e.disabled,checked:T===e.id,onChange:()=>$(e.id)}),e.label]},e.id)),T!=="cod"&&_.length>0&&t.jsxs("div",{style:{marginTop:16,display:"grid",gap:10},children:[t.jsx("div",{style:{fontSize:12.5,fontWeight:700,color:"var(--ink-soft)",textTransform:"uppercase",letterSpacing:"0.04em"},children:"Send payment to"}),_.map(e=>t.jsxs("div",{style:{border:"1.5px solid var(--line)",borderRadius:10,padding:12,fontSize:13.5},children:[t.jsx("div",{style:{fontWeight:700,marginBottom:4},children:e.productName}),t.jsx("div",{style:{color:"var(--ink-soft)"},children:he[e.sellerPaymentMethod]||e.sellerPaymentMethod}),e.sellerBankName&&t.jsxs("div",{children:["Bank: ",e.sellerBankName]}),e.sellerAccountTitle&&t.jsxs("div",{children:["Account Title: ",e.sellerAccountTitle]}),e.sellerAccountNumber&&t.jsxs("div",{children:["Account Number: ",t.jsx("strong",{children:e.sellerAccountNumber})]})]},e.productId)),t.jsx("p",{style:{fontSize:12,color:"var(--ink-soft)"},children:"Please send payment to the seller directly, then place your order below."})]})]}),q&&t.jsx("p",{className:"error-text",children:q}),t.jsx("button",{className:"btn btn-accent btn-block",disabled:R,children:R?"Placing order…":`Place Order — Rs ${D.toLocaleString()}`})]})})]})}export{be as default};
