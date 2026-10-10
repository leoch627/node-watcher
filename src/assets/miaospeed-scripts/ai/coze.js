// @id: coze
// @name: Coze
// @description: 检测字节跳动 Coze (coze.com) 在当前地区是否可用
// @category: ai
// @regions: global
// @tags: ai
// @priority: 8
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const t="239,107,115",e="失败",r="网络",o="failed";function handler(){let n=fetch("https://www.coze.com/api/developer/get_login_info",{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36"},retry:3,timeout:5e3});if(!n)return{text:`${e}(${r})`,background:t,status:o,error:r};if(403===n.statusCode)return{text:`${e}(WAF)`,background:"253,109,20",status:"warning"};if(n.body.indexOf("Your region is not supported")>-1)return{text:e,background:t,status:o};let a=safeParse(n.body),s=get(a,"data.CountryCode","");return get(a,"data.IsForbiddenRegion",!1)?{text:`${e}${s?`(${s})`:""}`,background:t,status:o,region:s}:s?{text:`解锁(${s})`,background:"186,230,126",status:"unlocked",region:s}:{text:"N/A",background:"142,140,142",status:"na"}}module.exports=handler;
