// @id: kimi
// @name: Kimi
// @description: 检测月之暗面 Kimi (kimi.com) 在当前地区是否可用
// @category: ai
// @regions: global
// @tags: ai
// @priority: 8
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const t="186,230,126",e="239,107,115",o="解锁",r="失败",a="网络",s="unlocked",n="failed";function handler(){let i=fetch("https://www.kimi.com/apiv2/kimi.gateway.order.v1.GoodsService/ListGoods",{method:"POST",body:"{}",headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36","Content-Type":"application/json"},retry:3,timeout:5e3});if(!i)return{text:`${r}(${a})`,background:e,status:n,error:a};if(403===i.statusCode)return{text:r,background:e,status:n};if(200===i.statusCode){let e=i.body.match(/"useRegion":"REGION_([^"]+)"/),r=e?e[1]:"";return r?{text:`${o}(${r})`,background:t,status:s,region:r}:{text:o,background:t,status:s}}return{text:"N/A",background:"142,140,142",status:"na"}}module.exports=handler;
