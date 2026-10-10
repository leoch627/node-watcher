// @id: abema
// @name: Abema
// @description: 检测 Abema TV 网络电视解锁状态
// @category: media
// @regions: jp
// @tags: stream, video, live
// @priority: 40
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const t="239,107,115",e="失败",r="网络",o="响应",a="IP阻止",n="failed";function handler(){let u=fetch("https://api.abema.io/v1/ip/check?device=android",{method:"GET",headers:{"user-agent":"Mozilla/5.0 (Linux; Android 16; SM-S938B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.71 Mobile Safari/537.36"},noRedir:!0,retry:3,timeout:5e3});if(!u)return{text:`${e}(${r})`,background:t,status:n,error:r};if(403===u.statusCode)return{text:`${e}(${a})`,background:t,status:n,error:a};if(200!==u.statusCode)return{text:`${e}(${r})`,background:t,status:n,error:r};let s=u.body,d=safeParse(s);if(!d)return{text:`${e}(${o})`,background:t,status:n,error:o};if(!d.isoCountryCode&&(s.indexOf("blocked_location")>-1||s.indexOf("anonymous_ip")>-1))return{text:e,background:t,status:n};let i=d.isoCountryCode;return i?"JP"===i?{text:`解锁(${i})`,background:"186,230,126",status:"unlocked",region:i}:{text:`仅海外(${i})`,background:"253,109,20",status:"warning",region:i}:{text:e,background:t,status:n}}module.exports=handler;
