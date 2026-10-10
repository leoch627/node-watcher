// @id: deepseek
// @name: DeepSeek
// @description: 检测 DeepSeek (chat.deepseek.com) 在当前地区是否可用
// @category: ai
// @regions: global
// @tags: ai
// @priority: 8
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const t="186,230,126",e="239,107,115",s="解锁",a="失败",n="网络",r="unlocked",o="failed";function handler(){let u=fetch("https://116.205.40.114/sign_in",{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36",Host:"chat.deepseek.com"},sni:"chat.deepseek.com",retry:3,timeout:5e3});if(!u)return{text:`${a}(${n})`,background:e,status:o,error:n};if(403===u.statusCode)return{text:a,background:e,status:o};if(200===u.statusCode){let e=u.body.match(/<meta\s+name="region"\s+content="([^"]+)"/),a=e?e[1]:"";return a?{text:`${s}(${a})`,background:t,status:r,region:a}:{text:s,background:t,status:r}}return 202===u.statusCode?{text:a,background:e,status:o}:{text:"N/A",background:"142,140,142",status:"na"}}module.exports=handler;
