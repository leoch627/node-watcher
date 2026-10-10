// @id: crunchyroll
// @name: Crunchyroll
// @description: 检测 Crunchyroll 解锁状态
// @category: media
// @regions: us
// @tags: stream, video, anime
// @priority: 40
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const t="239,107,115",e="失败",o="网络",n="failed";function handler(){let r=fetch("https://www.crunchyroll.com/auth/v1/token",{method:"POST",body:"grant_type=client_id",headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36","Content-Type":"application/x-www-form-urlencoded",Authorization:"Basic Y3Jfd2ViOg=="},retry:3,timeout:5e3});return r?r.body.indexOf('"country":"US"')>-1?{text:"解锁",background:"186,230,126",status:"unlocked"}:{text:e,background:t,status:n}:{text:`${e}(${o})`,background:t,status:n,error:o}}module.exports=handler;
