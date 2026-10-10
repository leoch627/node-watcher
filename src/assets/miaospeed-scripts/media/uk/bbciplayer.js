// @id: bbciplayer
// @name: BBC iPlayer
// @description: 检测 BBC iPlayer 解锁状态
// @category: media
// @regions: uk
// @tags: stream, video, live
// @priority: 50
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const t="239,107,115",e="失败",o="网络",s="failed";function handler(){let a=fetch("https://open.live.bbc.co.uk/mediaselector/6/select/version/2.0/mediaset/pc/vpid/bbc_one_london/format/json/jsfunc/JS_callbacks0",{method:"GET",headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.61 Safari/537.36"},noRedir:!1,retry:3,timeout:5e3});return a?200===a.statusCode?a.body.includes("geolocation")?{text:e,background:t,status:s}:{text:"解锁",background:"186,230,126",status:"unlocked"}:403===a.statusCode||451===a.statusCode?{text:e,background:t,status:s}:{text:`${e}(${a.statusCode})`,background:t,status:s}:{text:`${e}(${o})`,background:t,status:s,error:o}}module.exports=handler;
