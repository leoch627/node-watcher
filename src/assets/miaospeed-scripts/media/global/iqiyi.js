// @id: iqiyi
// @name: 爱奇艺国际版
// @description: 检测 iQiyi Global 在当前地区是否可用
// @category: media
// @regions: global
// @tags: stream, video
// @priority: 10
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
function handler(){let e=fetch("https://www.iq.com",{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36"},noRedir:!1,retry:3,timeout:5e3});if(!e)return{text:"N/A",background:"142,140,142",status:"na"};let t=(e.headers["x-custom-client-ip"]||"").split(":"),n=t.length>=2?t[t.length-1]:"";return n?("ntw"===n&&(n="tw"),{text:`解锁(${n.toUpperCase()})`,background:"186,230,126",status:"unlocked",region:n}):{text:"失败",background:"239,107,115",status:"failed"}}module.exports=handler;
