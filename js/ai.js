// Receipt scanning with Gemini. Check Google AI Studio for the current model name if this one is retired.
const MODEL='gemini-2.5-flash';

export const RECEIPT_PROMPT=`You are a receipt parser for restaurant, cafe and store receipts, mostly from the Philippines (currency PHP).
Read the photo and return ONLY JSON that matches the schema.
Rules:
1. List every purchased line item. Never list subtotal, VAT, service charge, tip, payment or change lines as items.
2. "price" is the price of ONE unit. If the receipt shows only a line total for a quantity above 1, divide it by the quantity.
3. If a line has no quantity, use 1. Join item names that wrap onto two lines.
4. Add-ons that carry their own price are separate items. Modifiers with no price belong in the parent item's name.
5. Apply a discount that belongs to one line (PWD, senior, promo) to that item's price. Put receipt-wide discounts in "discount" as a positive number.
6. "tax" is VAT or other tax shown as an added charge. If prices already include VAT and VAT is only informational, use 0.
7. "service_charge" is any service charge (SC). Do not include tips.
8. Numbers only: no currency symbols or thousands separators. Use null for anything you cannot read. Never guess.
9. Keep item names in the receipt's own language, trimmed, in normal capitalization.`;

const N={type:'NUMBER',nullable:true};
const SCHEMA={type:'OBJECT',required:['items'],properties:{
  merchant:{type:'STRING',nullable:true},
  items:{type:'ARRAY',items:{type:'OBJECT',required:['name','qty','price'],properties:{name:{type:'STRING'},qty:{type:'NUMBER'},price:{type:'NUMBER'}}}},
  subtotal:N,tax:N,service_charge:N,discount:N,total:N}};

async function shrink(file,max=1600){
  const b=await createImageBitmap(file),s=Math.min(1,max/Math.max(b.width,b.height));
  const cv=document.createElement('canvas');cv.width=Math.round(b.width*s);cv.height=Math.round(b.height*s);
  cv.getContext('2d').drawImage(b,0,0,cv.width,cv.height);
  return cv.toDataURL('image/jpeg',.85).split(',')[1];
}

export async function scanReceipt(file,key){
  const data=await shrink(file);
  const res=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,{
    method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},
    body:JSON.stringify({contents:[{parts:[{text:RECEIPT_PROMPT},{inline_data:{mime_type:'image/jpeg',data}}]}],
      generationConfig:{temperature:0,responseMimeType:'application/json',responseSchema:SCHEMA}})});
  if(!res.ok)throw new Error('Gemini '+res.status);
  const out=JSON.parse((await res.json()).candidates[0].content.parts[0].text);
  if(!out.items?.length)throw new Error('No items found');
  return out;
}
