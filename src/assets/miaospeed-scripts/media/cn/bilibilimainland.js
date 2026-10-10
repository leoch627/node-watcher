// @id: bilibilimainland
// @name: 哔哩哔哩大陆
// @description: 检测大陆限定内容 (api.bilibili.com) 是否可播放，适用于回国/中转节点场景
// @category: media
// @regions: cn
// @tags: stream, video
// @priority: 30
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const e="239,107,115",t="失败",a="网络",r="failed";function handler(){let n=fetch("https://api.bilibili.com/pgc/player/web/playurl?avid=82846771&qn=0&type=&otype=json&ep_id=307247&fourk=1&fnver=0&fnval=16&module=bangumi",{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36"},retry:3,timeout:5e3});if(!n)return{text:`${t}(${a})`,background:e,status:r,error:a};if(412===n.statusCode||n.body.indexOf("抱歉您所在地区不可观看")>-1||n.body.indexOf("The area is inaccessible")>-1)return{text:t,background:e,status:r};let o=get(safeParse(n.body),"code",0/0);return 0x98a621===o||0x98a23b===o||-10403===o?{text:t,background:e,status:r}:0===o?{text:"解锁",background:"186,230,126",status:"unlocked"}:{text:"N/A",background:"142,140,142",status:"na"}}module.exports=handler;
