// @id: britbox-uk
// @name: BritBox UK
// @description: 检测 BritBox 英国站解锁状态
// @category: media
// @regions: uk
// @tags: stream, video
// @priority: 45
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const t="239,107,115",e="失败",o="网络",a="failed";function handler(){let d=fetch("https://www.britbox.com/",{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36"},retry:3,timeout:5e3});return d?403===d.statusCode||451===d.statusCode||d.body.indexOf("locationnotsupported")>-1||d.body.indexOf("locationnotvalidated")>-1?{text:e,background:t,status:a}:{text:"解锁",background:"186,230,126",status:"unlocked"}:{text:`${e}(${o})`,background:t,status:a,error:o}}module.exports=handler;
