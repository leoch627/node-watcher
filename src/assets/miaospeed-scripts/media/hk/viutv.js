// @id: viutv
// @name: ViuTV
// @description: 检测 ViuTV 本地内容 解锁状态
// @category: media
// @regions: hk
// @tags: stream, video
// @priority: 20
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const e="失败",t="网络",r="状态",n="解析",o="239,107,115",a="failed";function handler(){let d=fetch("https://api.viu.now.com/p8/3/getLiveURL",{method:"POST",headers:{"Content-Type":"application/json","User-Agent":"Mozilla/5.0 (Linux; Android 16; SM-S938B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.71 Mobile Safari/537.36"},body:safeStringify({callerReferenceNo:"20210726112323",contentId:"099",contentType:"Channel",channelno:"099",mode:"prod",deviceId:"29b3cb117a635d5b56",deviceType:"ANDROID_WEB"}),noRedir:!1,retry:3,timeout:5e3});if(!d)return{text:`${e}(${t})`,background:o,status:a,error:t};{if(200!==d.statusCode)return{text:`${e}(${r})`,background:o,status:a,error:r};let t=safeParse(d.body);if(!t)return{text:`${e}(${n})`,background:o,status:a,error:n};switch(t.responseCode){case"GEO_CHECK_FAIL":default:return{text:e,background:o,status:a};case"SUCCESS":return{text:"解锁",background:"186,230,126",status:"unlocked"}}}}module.exports=handler;
