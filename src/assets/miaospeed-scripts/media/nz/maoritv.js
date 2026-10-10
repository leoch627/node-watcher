// @id: maoritv
// @name: Māori Television
// @description: 检测 Whakaata Māori(Māori Television) 解锁状态
// @category: media
// @regions: nz
// @tags: stream, video, live
// @priority: 45
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const t="239,107,115",e="失败",a="网络",i="failed";function handler(){let o=fetch("https://edge.api.brightcove.com/playback/v1/accounts/1614493167001/videos/6352727601112",{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36",Accept:"application/json;pk=BCpkADawqM2E9yW4lLgKIEIV5majz5djzZCIqJiYMkP5yYaYdF6AQYq4isPId1ZLtQdGnK1ErLYG0-r1N-3DzAEdbfvw9SFdDWz_i09pLp8Njx1ybslyIXid-X_Dx31b7-PLdQhJCws-vk6Y",Origin:"https://www.maoritelevision.com"},retry:3,timeout:5e3});if(!o)return{text:`${e}(${a})`,background:t,status:i,error:a};if(o.body.indexOf("CLIENT_GEO")>-1||o.body.indexOf("ACCESS_DENIED")>-1)return{text:e,background:t,status:i};let r=get(safeParse(o.body),"account_id","");return r&&"0"!==r?{text:"解锁",background:"186,230,126",status:"unlocked"}:{text:"N/A",background:"142,140,142",status:"na"}}module.exports=handler;
