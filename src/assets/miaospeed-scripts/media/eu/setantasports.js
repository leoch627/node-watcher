// @id: setantasports
// @name: Setanta Sports
// @description: 检测 Setanta Sports 解锁状态
// @category: media
// @regions: eu
// @tags: stream, live
// @priority: 45
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const e="239,107,115",t="失败",a="网络",r="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36",o="failed";function handler(){let n=fetch("https://dce-frontoffice.imggaming.com/api/v2/consent-prompt",{headers:{"User-Agent":r,Realm:"dce.adjara","x-api-key":"857a1e5d-e35e-4fdf-805b-a87b6f8364bf"},retry:3,timeout:1e4});if(!n)return{text:`${t}(${a})`,background:e,status:o,error:a};if(403===n.statusCode)return{text:`${t}(WAF)`,background:"253,109,20",status:"warning"};let d=get(safeParse(n.body),"outsideAllowedTerritories",null),s=fetch("https://dce-frontoffice.imggaming.com/api/v3/i18n/country-codes",{headers:{"User-Agent":r,Realm:"dce.adjara","x-api-key":"857a1e5d-e35e-4fdf-805b-a87b6f8364bf"},retry:3,timeout:1e4}),i=get(s?safeParse(s.body):null,"callerCountryCode","").toLowerCase();return null===d?{text:"N/A",background:"142,140,142",status:"na"}:d?{text:`${t}${i?`(${i})`:""}`,background:e,status:o,region:i}:{text:`解锁${i?`(${i})`:""}`,background:"186,230,126",status:"unlocked",region:i}}module.exports=handler;
