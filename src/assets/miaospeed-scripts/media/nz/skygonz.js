// @id: skygonz
// @name: Sky Go NZ
// @description: 检测 Sky Go 新西兰站解锁状态
// @category: media
// @regions: nz
// @tags: stream, video
// @priority: 45
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const e="186,230,126",t="239,107,115",s="解锁",n="失败",o="网络",r="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36",a="unlocked",i="failed";function handler(){let d=fetch("https://linear-s.stream.skyone.co.nz/sky-sport-1.mpd",{headers:{"User-Agent":r},retry:3,timeout:5e3});if(d&&200===d.statusCode)return{text:s,background:e,status:a};let c=fetch("https://login.sky.co.nz/authorize?audience=https%3A%2F%2Fapi.sky.co.nz&client_id=dXhXjmK9G90mOX3B02R1kV7gsC4bp8yx&redirect_uri=https%3A%2F%2Fwww.skygo.co.nz&connection=Sky-Internal-Connection&scope=openid%20profile%20email%20offline_access&response_type=code&response_mode=query",{headers:{"User-Agent":r},retry:3,timeout:5e3});if(!c)return{text:`${n}(${o})`,background:t,status:i,error:o};let u=c.url||"";return -1===u.indexOf("/authorize")&&u.indexOf("sky.co.nz")>-1?{text:s,background:e,status:a}:c.body.indexOf("Access Denied")>-1||403===c.statusCode||451===c.statusCode||200===c.statusCode?{text:n,background:t,status:i}:{text:"N/A",background:"142,140,142",status:"na"}}module.exports=handler;
