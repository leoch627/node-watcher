// @id: copilot
// @name: Microsoft Copilot
// @description: 检测 Microsoft Copilot 在当前地区是否可用
// @category: ai
// @regions: global
// @tags: ai
// @priority: 8
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const t="239,107,115",e="失败",r="网络",o="failed";function handler(){let s=fetch("https://copilot.microsoft.com/c/api/user?api-version=2",{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36"},noRedir:!0,retry:3,timeout:5e3});if(!s)return{text:`${e}(${r})`,background:t,status:o,error:r};if(302===s.statusCode)return"/"===s.headers.location?{text:`${e}(WAF)`,background:t,status:o}:{text:e,background:t,status:o};if(403===s.statusCode)return{text:e,background:t,status:o};if(200===s.statusCode){let t=get(safeParse(s.body),"regionCode","");if(t)return{text:`解锁(${t})`,background:"186,230,126",status:"unlocked",region:t}}return{text:"N/A",background:"142,140,142",status:"na"}}module.exports=handler;
