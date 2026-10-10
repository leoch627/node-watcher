// @id: cbcgem
// @name: CBC Gem
// @description: 检测 CBC Gem 解锁状态
// @category: media
// @regions: ca
// @tags: stream, video
// @priority: 45
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const t="186,230,126",e="239,107,115",s="解锁",a="失败",o="网络",r="unlocked",n="failed";function handler(){let u=fetch("https://www.cbc.ca/g/stats/js/cbc-stats-top.js",{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36"},retry:3,timeout:5e3});return u?u.body.indexOf('country":"CA"')>-1?{text:`${s}(CA)`,background:t,status:r}:200===u.statusCode?{text:`${s}(全球)`,background:t,status:r}:451===u.statusCode?{text:a,background:e,status:n}:{text:"N/A",background:"142,140,142",status:"na"}:{text:`${a}(${o})`,background:e,status:n,error:o}}module.exports=handler;
