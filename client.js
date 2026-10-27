/**
 * dsh-cn-nav — 浏览器半侧。
 *
 * 部件：
 *   1. 底部导航栏  → shell.bottom（四格：首页 / AI助手 / 短视频 / 个人）
 *   2. 首页        → main[cn-home]（官方公告条 + 文章 + 会话 + 广告位 + 快捷入口）
 *   3. 短视频      → main[cn-shortvideo]
 *   4. 个人中心    → main[cn-profile]（蓝白，余额 / 今日 / 近 7 天）
 *   5. 开屏广告    → 渲染在 BottomNav 内部（shell.bottom 跨面板切换保持挂载）
 *   6. 弹窗广告    → 同址，进入 AI助手 时 25% 概率
 *   7. 设置页      → settings.section
 *
 * 硬性约束：
 *   - 不写 document.body，不读别的插件 DOM，不 require 任何 Harness 客户端包。
 *   - 界面颜色优先走 --dsw-alias-* 主题 token；自绘的蓝白区块用它自己的变量。
 *   - 样式随组件以 <style> 渲染，组件卸载即消失。
 *   - 所有定时器/监听器都在 useEffect / ctx.effect 里注册并返回清理函数。
 */

// ─── 开屏占位素材 ───────────────────────────────────────────────────────────
// 原创占位海报（深墨底 + 朱砂晕染 + 云纹 + 印章）。默认内联进 DOM 渲染，
// 不发起图片请求 —— 避免被页面 CSP 的 img-src 拦掉。
// 必须定义在 __ModuleLoader__.load 之前：loader 可能同步执行 factory，
// 而模块级 const 在声明前处于 TDZ，提前取值会直接把整个客户端模块炸掉。
const PLACEHOLDER_ART_SVG = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1920" preserveAspectRatio="xMidYMid slice">',
  '<defs>',
  '<linearGradient id="bg" x1="0" y1="0" x2=".2" y2="1">',
  '<stop offset="0" stop-color="#05070f"/><stop offset=".45" stop-color="#081027"/>',
  '<stop offset="1" stop-color="#04060d"/></linearGradient>',
  '<radialGradient id="glow" cx=".72" cy=".27" r=".58">',
  '<stop offset="0" stop-color="#3d6bff" stop-opacity=".55"/>',
  '<stop offset=".45" stop-color="#1d3fd8" stop-opacity=".16"/>',
  '<stop offset="1" stop-color="#000000" stop-opacity="0"/></radialGradient>',
  '<linearGradient id="rule" x1="0" y1="0" x2="1" y2="0">',
  '<stop offset="0" stop-color="#2f6bff"/><stop offset="1" stop-color="#7ba3ff" stop-opacity="0"/>',
  '</linearGradient>',
  '<linearGradient id="title" x1="0" y1="0" x2="0" y2="1">',
  '<stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#c9dcff"/></linearGradient>',
  '<pattern id="grid" width="120" height="120" patternUnits="userSpaceOnUse">',
  '<path d="M120 0H0V120" fill="none" stroke="#8fb4ff" stroke-opacity=".055" stroke-width="1"/>',
  '</pattern>',
  '</defs>',
  '<rect width="1080" height="1920" fill="url(#bg)"/>',
  '<rect width="1080" height="1920" fill="url(#glow)"/>',
  '<rect width="1080" height="1920" fill="url(#grid)"/>',
  '<g fill="none" stroke="#8fb4ff" stroke-width="1.5">',
  '<circle cx="860" cy="520" r="300" stroke-opacity=".13"/>',
  '<circle cx="860" cy="520" r="440" stroke-opacity=".075"/>',
  '<circle cx="860" cy="520" r="580" stroke-opacity=".04"/>',
  '</g>',
  '<text x="120" y="742" font-size="30" letter-spacing="16" fill="#8fb4ff"',
  ' font-family="Segoe UI,Helvetica Neue,Arial,sans-serif">DEEPSEEK</text>',
  '<text x="112" y="896" font-size="132" font-weight="700" fill="url(#title)"',
  ' font-family="Microsoft YaHei,PingFang SC,Noto Sans CJK SC,sans-serif">&#28145;&#24230;&#24605;&#32771;</text>',
  '<rect x="118" y="944" width="132" height="4" rx="2" fill="url(#rule)"/>',
  '<text x="118" y="1024" font-size="42" fill="#9fb3d9"',
  ' font-family="Microsoft YaHei,PingFang SC,Noto Sans CJK SC,sans-serif">&#30334;&#19975;&#19978;&#19979;&#25991; &#183; &#19968;&#27425;&#35835;&#23436;</text>',
  '<text x="96" y="1648" font-size="340" font-weight="700" fill="none" stroke="#8fb4ff"',
  ' stroke-opacity=".07" stroke-width="2.5"',
  ' font-family="Segoe UI,Arial,sans-serif">1M</text>',
  '<rect x="118" y="1704" width="300" height="1" fill="#8fb4ff" opacity=".16"/>',
  '<text x="118" y="1778" font-size="30" fill="#5f7096"',
  ' font-family="Microsoft YaHei,PingFang SC,Noto Sans CJK SC,sans-serif">&#28857;&#25353;&#20102;&#35299;&#26356;&#22810;</text>',
  '</svg>'
].join('')

window.__ModuleLoader__.load({
  id: 'dsh-cn-nav',
  factory(require) {
    'use strict'

    let React = null
    try {
      React = require('react')
    } catch (error) {
      React = null
    }
    if (React === null || typeof React.createElement !== 'function') {
      return { inject: [], apply() {} }
    }

    const h = React.createElement
    const { useCallback, useEffect, useRef, useState } = React

    // ─── 常量 ───────────────────────────────────────────────────────────────
    const NS = 'dsh-cn-nav'
    const PANEL_HOME = 'cn-home'
    const PANEL_VIDEO = 'cn-shortvideo'
    const PANEL_PROFILE = 'cn-profile'
    const BILI_URL = 'https://www.bilibili.com/'
    const USAGE_URL = 'https://platform.deepseek.com/usage'
    const USAGE_ROUTE = '/dsh-cn-nav/usage'
    const NEWS_ROUTE = '/dsh-cn-nav/news'
    const NOTICE_ROUTE = '/dsh-cn-nav/notice'

    // ─── 开屏行为配置 ───────────────────────────────────────────────────────
    // 主视觉与点击链接在【设置 → ds概念版】里改（本地持久化）。
    const SPLASH = {
      /** 倒计时毫秒；这段时间内「跳过」不可用。 */
      countdownMs: 3000,
      /** 进入时是否出现。 */
      firstEntry: true,
      /** 'session' 每次启动一次（刷新不重复）| 'always' 每次加载 | 'version' 每版一次 */
      cadence: 'session',
      /** 误触诱导：点「跳过」那一下，按钮瞬移到左上角的概率，0 = 关闭。 */
      misclickChance: 0.1,
      /** 「摇一摇了解更多」提示出现的概率（纯装饰，不做真实摇动检测）。 */
      shakeChance: 0.5,
      /** 允许 Esc 关闭。 */
      closeOnEscape: true,
      /** 「跳过」距窗口顶部像素：桌面端标题栏会压住，往下让开。 */
      skipTop: 56,
      /** 会话切换时历史 turn 会成批挂载；达到这个条数视为切换而非新完成。 */
      batchIgnoreThreshold: 3
    }

    // ─── 弹窗广告 ───────────────────────────────────────────────────────────
    const POPUP = {
      /** 在 AI助手 / 首页 弹出的概率。 */
      probability: 0.25,
      /** 两次弹窗最小间隔（0 = 不限制）。 */
      cooldownMs: 0,
      /** 点击弹窗（DeepSeek 自己那条）打开的链接。 */
      clickUrl: 'https://www.deepseek.com',
      /** 点「关闭」时弹出挽留页的概率（1 = 每次都弹）。每次点关闭都独立掷骰。 */
      retentionChance: 0.85
    }

    // ─── 弹窗广告位上的赞助商 ───────────────────────────────────────────────
    // 每个赞助商带**多条文案**：一条克制（不逆天）、一条浮夸（逆天），随机抽。
    // `variant: 'art'` 用开屏那张海报；`variant: 'brand'` 用品牌卡片（logo + 文案）。
    // 架空品牌不带链接，点了不跳转。
    const SPONSORS = [
      {
        id: 'deepseek',
        variant: 'art',
        url: 'https://www.deepseek.com',
        // 真实品牌只放事实性描述，不编绝对化承诺。
        copies: [{ title: 'DeepSeek · 让智能触手可及', sub: '百万上下文 · 深度思考 · 开源开放' }]
      },
      {
        id: 'xunbao',
        variant: 'brand',
        brand: '寻宝',
        category: '网购',
        accent: '#2f6bff',
        accent2: '#1c4fd8',
        logo: { kind: 'text', char: '寻', bg: '#2f6bff', fg: '#ffffff' },
        copies: [
          { title: '1 分钱抢整箱手机，整点开抢先到先得', sub: '全网最低价，百亿补贴直接砍到骨头，买贵十倍赔' },
          { title: '全网好物，一搜就有', sub: '找同款、比价格，凑单还能省一笔' }
        ]
      },
      {
        id: 'xunbao-miao',
        variant: 'brand',
        brand: '寻宝秒购',
        category: '外卖',
        accent: '#ff7a1a',
        accent2: '#e2560a',
        logo: { kind: 'text', char: '寻', bg: '#2f6bff', fg: '#ffffff', banner: '秒购' },
        copies: [
          { title: '首单 0 元吃大餐，送不到直接赔一百', sub: '天天神券满 30 减 29，羊毛党已经杀疯了' },
          { title: '附近好店，三十分钟送到家', sub: '外卖、生鲜、日用品，一个 App 全搞定' }
        ]
      },
      {
        id: 'jingdaodao',
        variant: 'brand',
        brand: '井刀刀',
        category: '网购 · 低价',
        accent: '#e02e24',
        accent2: '#a8160f',
        logo: { kind: 'text', char: '井', bg: '#e02e24', fg: '#ffffff' },
        copies: [
          { title: '1 元包邮，9 块 9 抢两件，买到就是赚到', sub: '假一赔十、仅退款不退货，平台全程兜底' },
          { title: '天天低价，产地直发', sub: '平台担保交易，不满意随时退，运费我们出' }
        ]
      },
      {
        id: 'zhizhi',
        variant: 'brand',
        brand: '直直',
        category: '二手手机回收',
        accent: '#12b981',
        accent2: '#0b8f63',
        logo: { kind: 'icon', icon: 'dog', bg: '#12b981', fg: '#ffffff' },
        copies: [
          { title: '旧手机最高抵 8888 元，上门当场打款', sub: '比同行高 3 倍价，敢承诺假一赔十' },
          { title: '闲置手机，卖个实在价', sub: '检测师上门当场面验，当场结清' }
        ]
      },
      {
        id: 'manjiao',
        variant: 'brand',
        brand: '慢脚缓慢版',
        category: '看视频赚金币',
        accent: '#ff2d55',
        accent2: '#d10f36',
        logo: { kind: 'icon', icon: 'camera', bg: '#ff2d55', fg: '#ffffff' },
        copies: [
          { title: '刷 1 分钟提现 1 元，日入百元不是梦', sub: '新人开局白送 88 元，提现秒到账零门槛' },
          { title: '刷视频也能攒金币', sub: '金币天天换现金，越看越有' }
        ]
      },
      {
        id: 'douzi',
        variant: 'brand',
        brand: '豆子',
        category: '短视频 · 记录生活',
        accent: '#1f2937',
        accent2: '#0d1219',
        logo: { kind: 'icon', icon: 'seed', bg: '#101826', fg: '#f5c542' },
        copies: [
          { title: '发条视频就送 10 万赞，官方流量白送', sub: '素人 3 天涨粉 50 万，普通人也能当顶流' },
          { title: '记录生活的小美好', sub: '随手一拍就是作品，邻居也在看' }
        ]
      }
    ]

    /** 抽一个赞助商 → 再抽它的一条文案。 */
    function pickPopupAd() {
      const brand = SPONSORS[Math.floor(Math.random() * SPONSORS.length)] || SPONSORS[0]
      const copies = Array.isArray(brand.copies) && brand.copies.length > 0 ? brand.copies : [{}]
      const copy = copies[Math.floor(Math.random() * copies.length)] || {}
      return Object.assign({}, brand, { title: copy.title || '', sub: copy.sub || '' })
    }

    /** 当前这一屏弹窗展示的赞助商。 */
    let currentPopupAd = pickPopupAd()

    // ─── 会员（VIP）────────────────────────────────────────────────────────
    // 纯本地演示：没有任何真实支付通道。二维码扫出来是一段说明文字，
    // 真正的「解锁」是在付款页依次按下 上上下下左右左右 A B A B。
    const VIP_TIERS = [
      {
        id: 'none',
        label: '普通用户',
        short: '未开通',
        level: 0,
        perks: ['会看到开屏、弹窗、横幅与首页广告']
      },
      {
        id: 'silver',
        label: '白银会员',
        short: '白银',
        level: 1,
        perks: ['开屏广告全部免掉', '启动直达工作区', '专属白银徽章', '每日 10 次优先响应', '会员专属客服通道', '会员价购买皮肤']
      },
      {
        id: 'gold',
        label: '黄金会员',
        short: '黄金',
        level: 2,
        perks: [
          '开屏 + 弹窗广告免掉',
          '进入 AI助手不被打断',
          '专属黄金徽章 + 头像框',
          '每日 50 次优先响应',
          '会员专属客服通道',
          '会员价购买皮肤',
          '每年一次生日礼包'
        ]
      },
      {
        id: 'diamond',
        label: '钻石会员',
        short: '钻石',
        level: 3,
        perks: [
          '全部广告位免掉',
          '横幅与首页广告一并免',
          '专属钻石徽章 + 动态头像框',
          '不限次优先响应',
          '7×24 专属客服',
          '会员价购买皮肤',
          '每年一次生日礼包',
          '新功能内测优先体验'
        ]
      }
    ]

    const VIP_PLANS = [
      { id: 'week', label: '周卡', days: 7, price: { silver: 6, gold: 10, diamond: 16 }, note: '一次付清' },
      { id: 'month', label: '月卡', days: 30, price: { silver: 15, gold: 25, diamond: 40 }, note: '一次付清' },
      {
        id: 'month-auto',
        label: '连续包月',
        days: 30,
        price: { silver: 12, gold: 20, diamond: 32 },
        // 续费价 = 对应「一次性」套餐的原价，只有首期打折
        renewPlan: 'month',
        note: '首期 {price}，次月起 {renew}/月 自动续费，可随时取消'
      },
      { id: 'quarter', label: '季卡', days: 90, price: { silver: 38, gold: 68, diamond: 108 }, note: '一次付清' },
      {
        id: 'quarter-auto',
        label: '连续包季',
        days: 90,
        price: { silver: 30, gold: 55, diamond: 88 },
        renewPlan: 'quarter',
        note: '首季 {price}，次季起 {renew}/季 自动续费，可随时取消'
      },
      { id: 'year', label: '年卡', days: 365, price: { silver: 128, gold: 218, diamond: 348 }, note: '一次付清' },
      {
        id: 'year-auto',
        label: '连续包年',
        days: 365,
        price: { silver: 98, gold: 168, diamond: 268 },
        renewPlan: 'year',
        note: '首年 {price}，次年起 {renew}/年 自动续费，可随时取消'
      }
    ]

    /** 协议正文：九章五十条。目的很单纯 —— 没人会看完。 */
    const VIP_AGREEMENT = [
      '《ds概念版会员服务协议》',
      '【重要提示】请您在开通会员前仔细阅读本协议全部条款，特别是以加粗、下划线等方式提示的免除或限制责任的条款。您勾选并继续操作，即视为已充分阅读并同意本协议。',
      '',
      '第一章  总则',
      '第一条  本协议是您与 ds概念版（以下简称「本服务」）之间就开通、使用会员服务所订立的协议。',
      '第二条  您在页面中勾选「我已阅读并同意」并完成后续操作，即视为您已充分理解并接受本协议全部条款。',
      '第三条  本协议内容包括协议正文及本服务已经发布或将来可能发布的各类规则、公告、说明与操作指引，上述内容均为本协议不可分割的组成部分，与正文具有同等法律效力。',
      '第四条  本服务有权根据业务需要不时修订本协议，修订后的协议一经公布即替代原协议，您继续使用即视为接受修订后的协议。',
      '第五条  如您不同意本协议任何条款，请立即停止开通与使用本服务。',
      '',
      '第二章  定义',
      '第六条  「会员服务」指本服务向您提供的、以档位划分的增值服务，包括但不限于广告减免、界面特权、身份标识及其他由本服务不时增加或调整的权益。',
      '第七条  「会员有效期」指自开通成功之时起算、至所购套餐对应时长届满之时止的期间。',
      '第八条  「自动续费」指您在开通连续包月、连续包季或连续包年套餐后，本服务在每一计费周期届满前为您自动续订并扣划相应费用的服务。',
      '第九条  「服务费」指本服务为维持会员体系运行、内容分发、权益发放及客户服务所收取的费用，其计算方式由本服务根据运营情况确定。',
      '第十条  「不可抗力」指不能预见、不能避免且不能克服的客观情况。',
      '',
      '第三章  会员服务内容',
      '第十一条  会员权益按档位由低至高分为白银、黄金、钻石三档，高档位包含低档位的全部权益，并可额外获得本服务公布的专属权益。',
      '第十二条  各档位具体权益以开通页面实时展示为准，本服务有权根据运营需要调整权益内容，调整不影响已生效会员有效期内的核心权益。',
      '第十三条  广告减免权益的具体范围以本服务实际投放的广告类型为准；本服务新增的广告形式，可能不在既有减免范围之内。',
      '第十四条  身份标识权益仅在本服务界面内展示，不构成对任何第三方平台身份或资质的证明。',
      '第十五条  本服务提供的优先响应、专属客服等权益，均以本服务实际资源情况为限，不构成对响应时限的承诺。',
      '第十六条  本服务有权对会员权益设置合理的使用频次、单次上限及其他限制条件，具体限制以页面说明为准。',
      '',
      '第四章  费用、支付与自动续费',
      '第十七条  会员费用以开通页面展示的价格为准，该价格可能因档位、套餐周期、促销活动而不同。',
      '第十八条  促销价格仅适用于对应促销周期，促销期届满后按届时有效的标准价格执行。',
      '第十九条  选择自动续费套餐的，首个计费周期按首期优惠价格收取，此后每个计费周期按届时有效的标准价格自动扣划。',
      '第二十条  您理解并同意，自动续费将在每个计费周期届满前自动发起，您应确保支付方式处于可用状态。',
      '第二十一条  如需取消自动续费，您可在会员中心或支付渠道中关闭；关闭后不影响当期已生效的会员权益。',
      '第二十二条  会员费用一经支付，除本协议明确约定外不予退还；已使用部分对应的费用不予退还。',
      '第二十三条  本服务有权根据运营成本、市场情况等因素调整会员价格，价格调整自公布之日起对新开通或续订的订单生效。',
      '第二十四条  因支付渠道、网络故障等原因导致扣款失败的，本服务有权暂停相应权益直至扣款成功。',
      '',
      '第五章  用户权利与义务',
      '第二十五条  您应保证开通会员时所提供的信息真实、准确、完整，并及时更新。',
      '第二十六条  您不得将会员权益用于出租、出借、转让、赠与或以其他方式提供给第三方使用。',
      '第二十七条  您不得利用会员权益从事任何违反法律法规、公序良俗或损害本服务及第三方合法权益的行为。',
      '第二十八条  您不得通过技术手段绕过、破解、篡改本服务的会员校验机制。',
      '第二十九条  您理解并同意，会员权益仅限您本人在本服务指定范围内使用。',
      '第三十条  如您违反本协议约定，本服务有权视情节采取限制功能、暂停或终止会员服务等措施，且有权不予退还相应费用。',
      '第三十一条  您有权就会员服务向本服务提出咨询、建议与投诉，本服务将在合理期限内予以回应。',
      '',
      '第六章  个人信息与隐私保护',
      '第三十二条  本服务仅在实现会员服务所必需的范围内收集与使用您的信息。',
      '第三十三条  本服务将采取合理的技术与管理措施保护您的信息安全，防止信息泄露、毁损或丢失。',
      '第三十四条  未经您同意，本服务不会向第三方提供您的个人信息，法律法规另有规定的除外。',
      '第三十五条  您理解并同意，本服务可能通过站内通知、弹窗等方式向您发送与会员服务相关的信息。',
      '',
      '第七章  免责与责任限制',
      '第三十六条  因不可抗力、网络故障、设备故障、第三方服务中断等原因导致会员服务无法正常提供的，本服务不承担责任。',
      '第三十七条  本服务仅按现状提供服务，不对服务不间断、无差错作出保证。',
      '第三十八条  在法律允许的最大范围内，本服务对您承担的赔偿责任总额不超过您就涉事会员服务实际支付的费用。',
      '第三十九条  您因自身操作不当、设备原因或第三方原因造成的损失，由您自行承担。',
      '第四十条  本服务对会员权益的实际使用效果不作任何明示或默示的保证。',
      '',
      '第八章  服务变更、中止与终止',
      '第四十一条  本服务有权根据运营需要变更、中止或终止部分或全部会员权益。',
      '第四十二条  会员服务终止的，本服务将提前以适当方式告知，已支付但未使用的费用按本协议约定处理。',
      '第四十三条  您注销账户或主动申请终止会员服务的，未使用的费用不予退还。',
      '第四十四条  本协议终止后，关于费用、免责、争议解决等条款仍然有效。',
      '',
      '第九章  争议解决与附则',
      '第四十五条  本协议的订立、效力、解释与履行均适用中华人民共和国法律。',
      '第四十六条  因本协议产生的争议，双方应友好协商解决；协商不成的，任何一方均可向本服务所在地有管辖权的人民法院提起诉讼。',
      '第四十七条  本协议部分条款被认定无效或不可执行的，不影响其余条款的效力。',
      '第四十八条  本服务对本协议拥有最终解释权。',
      '第四十九条  本协议所涉会员服务属于概念演示项目的一部分，页面展示的价格、优惠、支付方式及权益内容均为虚构，不构成任何真实交易，亦不会产生任何真实扣款或自动续费。',
      '第五十条  本协议自公布之日起生效。'
    ].join('\n')

    // 二维码由 Python 的 qrcode 库预生成（version 8 / EC-M / 49×49），内容是：
    // 「概念演示：本页价格与收款方式均为虚构，请勿当真。输入 上上下下左右左右ABAB 解锁会员体验。」
    // 客户端不引任何依赖，直接把矩阵画成 SVG。
    const QR_SIZE = 49
    const QR_ROWS = [
      '1111111011001110011100101000110101100000101111111',
      '1000001000110011110111111111101000010011101000001',
      '1011101000110011011101110101100010111101101011101',
      '1011101011000010000000001000110111001001001011101',
      '1011101010000101100001111111100000110000001011101',
      '1000001011101010110100100010010111000110001000001',
      '1111111010101010101010101010101010101010101111111',
      '0000000010010101100111100010100110110010100000000',
      '1000101111010001111110111110110100000100111111001',
      '0001110000110010011100000101010001100000110111000',
      '0100111001111010011001101110011111001010111010101',
      '0111000101101011000100011001000010111101000001000',
      '0010001000111110011010101001111001010110111100100',
      '0010000010011111000110000000000010100101110111100',
      '0100001010010110101100110010001100011111011011111',
      '0011010100101001110001111000110101110011001101011',
      '1111011011101111101011010010011111001101111101011',
      '0001010010010000001101010011001010000100100011010',
      '0101111000101101010101001001100000110001110101011',
      '1110110110100111011010000000011110010101011111010',
      '0000011100011001010010100010110100000110100100011',
      '1011010101010100000100000111100000101101110001001',
      '1100111110011000010011111110001111011111111110111',
      '0000100010100011100111100010000010000011100011000',
      '1010101011010001110101101010111101100111101011111',
      '0111100010111011111000100011000110100100100011010',
      '1111111110101011101011111110110010000101111110111',
      '0011100111100111101110100100000110100010011111111',
      '0011011000010010000110011100110101100111111010111',
      '0101010100010000011001001110000010101101001100100',
      '0011111011000101000010100011111001001001111101001',
      '0110000101110000011110110001101000010111101000000',
      '1110101001001001010101101011100000100111011000101',
      '0111000010110001100001011000110101101000000100000',
      '0010101000100000111111000010010111110010011001001',
      '0010110101100011010001110101100000001010101100000',
      '0100011011001111000001111110110100000101011100101',
      '1110110110111111111101000101010011101000110001100',
      '0100011111111010000000110100111101000011001111101',
      '0111000010100010011011101001011010011011111111001',
      '1110001101001010101000111111110000010011111110001',
      '0000000011110110101101100011100110100100100010011',
      '1111111010111110110001101010001111111101101011111',
      '1000001000001101011110100011000010101010100010011',
      '1011101011000100001011111110100100100001111110111',
      '1011101001011011000110100000110011110001011001001',
      '1011101001100001101100101010111011001011010010111',
      '1000001000000000100000011110110101110000111101010',
      '1111111011001110001100110110011111000001110011011'
    ]

    // ─── 会话结束横幅广告 ───────────────────────────────────────────────────
    // 替代原来「每次会话结束按概率弹整屏开屏」的设计：改成顶部一条细横幅，
    // 不挡操作、会自己消失、也能手动关。
    const TURN_BANNER = {
      /** 每轮对话结束后出现的概率。 */
      probability: 0.5,
      /** 停留多久自动收起（毫秒）。 */
      durationMs: 12000,
      /** 距窗口顶部的像素：桌面端标题栏会压住，往下让开。 */
      top: 44
    }

    // 横幅轮播的文案（不写具体金额 —— 官方政策会变）。
    const BANNER_ADS = [
      { id: 'b-reason', text: 'DeepSeek 深度思考：复杂问题一次讲透', url: 'https://www.deepseek.com' },
      { id: 'b-context', text: '百万上下文，长文档一口气读完', url: 'https://www.deepseek.com' },
      { id: 'b-open', text: '模型开源开放，开发者友好', url: 'https://platform.deepseek.com' },
      { id: 'b-api', text: 'API 按量计费，价格友好，充多少用多少', url: 'https://platform.deepseek.com/top_up' }
    ]

    // ─── 开机层兼容 ─────────────────────────────────────────────────────────
    // 本插件是后来者：开机视频 / 启动屏真的在演时不出广告，等页面交还再出。
    const COMPAT = {
      pollMs: 100,
      settleMs: 150,
      maxWaitMs: 45000,
      visible(el) {
        if (el === null || el === undefined) return false
        try {
          if (el.isConnected === false) return false
          if (typeof el.getClientRects === 'function' && el.getClientRects().length === 0) return false
          const view = window
          if (view && typeof view.getComputedStyle === 'function') {
            const style = view.getComputedStyle(el)
            if (style === null || style === undefined) return true
            if (style.display === 'none' || style.visibility === 'hidden') return false
            if (style.opacity !== '' && Number(style.opacity) === 0) return false
          }
        } catch (error) {
          return true
        }
        return true
      },
      busy() {
        try {
          const boot = window.__DSH_BOOT_ANIM__
          if (boot && boot.failed !== true && COMPAT.visible(boot.el)) return true
        } catch (error) {
          /* 对方没装或改了内部结构 */
        }
        try {
          if (COMPAT.visible(document.getElementById('dsh-startup-root'))) return true
        } catch (error) {
          /* 同上 */
        }
        return false
      }
    }

    // ─── 个人页配置 ─────────────────────────────────────────────────────────
    const PROFILE = {
      /**
       * 显示名。留空 = 用登录的 DeepSeek 账号名；没登录就显示「未登录」。
       * 头像同理：优先取账号的 avatarUrl，取不到就用人头剪影。
       */
      name: '',
      version: '1.0.0'
    }

    // ─── 首页公告条（本地补充） ─────────────────────────────────────────────
    // 官网首页那条是自动同步的；这里放官网上没有的（例如平台侧计费公告）。
    const NOTICES = [
      {
        id: 'api-search-fetch-billing',
        text: 'DeepSeek API 现已支持网页搜索与抓取，按请求次数计费。服务端工具调用访问到 search/fetch 接口，将于北京时间 2026 年 11 月 1 日 00:00 开始按次收取调用费用。',
        url: '',
        dismissible: true
      }
    ]

    // ─── 首页广告位 ─────────────────────────────────────────────────────────
    // API 充值类**不写具体金额/单价** —— 官方政策会变，写死就是迟早过期的数字。
    const HOME_ADS = [
      {
        id: 'dsh-harness',
        kind: 'dsh',
        title: 'DeepSeek Harness',
        desc: '本地工作区 · 多会话并行 · 工具直连',
        url: 'https://www.deepseek.com'
      },
      {
        id: 'dsh-platform',
        kind: 'dsh',
        title: 'DeepSeek 开放平台',
        desc: '一行代码接入，模型能力即刻可用',
        url: 'https://platform.deepseek.com'
      },
      {
        id: 'api-topup',
        kind: 'recharge',
        title: 'API 余额充值',
        desc: '按量计费，价格友好，充多少用多少',
        url: 'https://platform.deepseek.com/top_up'
      },
      {
        id: 'api-topup-tip',
        kind: 'recharge',
        title: '额度不够了？',
        desc: '随时充值即刻到账，没有套餐套路',
        url: 'https://platform.deepseek.com/top_up'
      }
    ]

    // ─── 首页快捷入口 ───────────────────────────────────────────────────────
    const SHORTCUTS = [
      { id: 'plugins', panel: 'plugins', labelKey: 'shortcutPlugins', descKey: 'shortcutPluginsDesc' },
      { id: 'schedules', panel: 'schedules', labelKey: 'shortcutSchedules', descKey: 'shortcutSchedulesDesc' }
    ]

    // ─── 语言 ───────────────────────────────────────────────────────────────
    const DICT = {
      zh: {
        navAria: '主导航',
        navHome: '首页',
        navConversation: 'AI助手',
        navVideo: '短视频',
        navProfile: '个人',
        videoTitle: '短视频',
        videoReload: '刷新',
        videoExternal: '在浏览器打开',
        videoHint: '内容来自哔哩哔哩，加载不出来就点「在浏览器打开」',
        profileSub: '本地工作区 · 插件已启用',
        rowAbout: '关于本插件',
        meBalance: '账户余额',
        meUpdated: '更新于',
        meNotSignedIn: '未登录',
        meToday: '今天',
        meTodayUsed: '今日已用',
        meTodayEstimate: '本地估算',
        meLast7: '近 7 天使用记录',
        meSourceTitle: '数据来源',
        meSourceBalance: 'DeepSeek 余额接口',
        mePoll: '每 5 分钟自动观测',
        meDaysTracked: '已记账 {n} 天',
        meNoKey: '还没配置 DEEPSEEK_API_KEY。在 DSH 设置里填上 DeepSeek API Key，这里就会自动取数。',
        meStale: '离线数据 · 余额未刷新',
        meRefreshNow: '立即刷新',
        meLoading: '正在读取账本…',
        meError: '读取失败',
        meRetry: '重试',
        meNoData: '暂无数据',
        homeHi: '你好',
        homeHiNamed: '你好，{name}',
        homeSub: '今天想做点什么？',
        homeNewChat: '新建会话',
        homeNews: '官方公告',
        homeNewsAuto: '自动同步',
        homeRefresh: '刷新',
        homeSessions: '会话',
        homeNoSessions: '还没有会话，点右上角新建一个。',
        homeNoNews: '公告加载失败，点「刷新」重试。',
        adCreative: '广告创意',
        vipTitle: '会员中心',
        vipOpen: '开通会员',
        vipRenew: '续费',
        vipCurrent: '当前权益',
        vipExpires: '{date} 到期',
        vipNoExpire: '未开通',
        vipChooseTier: '选择档位',
        vipChoosePlan: '选择套餐',
        vipAgree: '我已阅读并同意上述协议，并知悉本页不涉及任何真实付款',
        vipPay: '立即支付 {price}',
        vipPayTitle: '扫码支付',
        vipScan: '请使用{channel}扫描二维码完成支付',
        vipBack: '返回修改',
        vipClose: '关闭',
        vipOk: '好的',
        vipSuccess: '开通成功',
        vipSuccessDesc: '{tier} 已生效，{date} 到期',
        vipUpgradeNote: '升级补差价：原价 {base}，已按当前会员剩余价值抵扣 {credit}',
        vipLocked: '已是更高档位',
        vipFirstOnly: '首期',
        vipPerksTitle: '{tier} 权益',
        vipDailyPrice: '折合每天仅 {price}',
        vipSocialProof: '今日已有 12,846 人升级会员',
        vipGiftTag: '首充礼包',
        vipGiftText: '新用户专享，首次开通额外赠送权益',
        vipCountdown: '距优惠结束 {time}',
        vipRefund: '申请退款',
        vipRefundTitle: '申请退款',
        vipRefundExpires: '会员到期',
        vipRefundNote: '退款金额将按会员权益剩余情况折算并扣除相应服务费后计算，具体到账金额以实际退回为准。退款提交后会员立即失效，已使用部分不予退还，款项将在 1-3 个工作日内原路退回。',
        vipRefundConfirm: '确认退款',
        vipRefundCancel: '暂不退款',
        vipRefundDone: '退款申请已提交',
        vipRefundDoneDesc: '退款金额将于 1-3 个工作日内原路退回，请留意原支付渠道通知',
        vipRefundFeeTip: '本次退款已自动扣除服务费，具体金额以实际到账为准',
        vipRefundResub: '重新开通 · 享专属折扣',
        vipNoDowngrade: '当前档位更高，不支持降档购买；到期后可重新选择',
        shortcutTitle: '快捷入口',
        shortcutPlugins: '插件',
        shortcutPluginsDesc: '管理已安装的插件',
        shortcutSchedules: '自动化任务',
        shortcutSchedulesDesc: '定时与周期性任务',
        popupAd: '广告',
        popupTitle: 'DeepSeek · 让智能触手可及',
        popupSub: '百万上下文 · 深度思考 · 开源开放',
        popupClose: '关闭',
        retainTitle: '真的要放弃吗？',
        retainSub: '这已经是今天能给到的最低价格了',
        retainCoupon: '¥5 无门槛券 · 仅此一次',
        retainTake: '领取并继续',
        retainLeave: '残忍离开',
        bannerCta: '查看',
        bannerClose: '关闭横幅',
        noticeMore: '点击查看详情',
        noticeKnown: '知道了',
        setSplash: '开屏广告',
        setSplashDesc: '启动时显示一次全屏开屏',
        setPreviewSplash: '预览开屏',
        setPreviewPopup: '预览弹窗',
        setSplashImage: '开屏图片链接',
        setSplashImageDesc: '留空使用内置矢量海报；填 https 图片地址会覆盖它',
        setSplashClickUrl: '开屏点击链接',
        setSplashClickUrlDesc: '点开屏主体时打开这个地址',
        setPopup: '弹窗广告',
        setPopupDesc: '在 AI助手 / 首页 按 25% 概率弹出居中卡片；切到短视频或个人会自动收起',
        setBanner: '会话结束横幅',
        setBannerDesc: '每轮对话结束后按概率在顶部弹一条可关闭的横幅，不打断操作',
        setHome: '首页',
        setHomeDesc: '关闭后底部导航只剩 AI助手 / 短视频 / 个人，开机也不再落到首页',
        settingsTitle: 'ds概念版',
        settingsSummary: '开屏 / 弹窗 / 首页',
        timeNow: '刚刚',
        timeMin: '{n} 分钟前',
        timeHour: '{n} 小时前',
        timeYesterday: '昨天',
        aboutBody: '第三方开源娱乐插件，与 DeepSeek 官方无关。开屏广告素材是原创占位图，可以在设置里换成自己的图。',
        aboutEmbed: '余额与用量由本插件自己向 api.deepseek.com/user/balance 取数，并记在自己的账本里；不依赖任何其他插件。',
        footText: 'MIT · 仅供娱乐',
        splashAd: '广告',
        splashSkip: '跳过',
        splashShake: '摇一摇跳转详情页',
        splashVipSkip: '白银会员可跳过 →'
      },
      en: {
        navAria: 'Main navigation',
        navHome: 'Home',
        navConversation: 'Assistant',
        navVideo: 'Videos',
        navProfile: 'Account',
        videoTitle: 'Videos',
        videoReload: 'Reload',
        videoExternal: 'Open in browser',
        videoHint: 'Content is served by bilibili.com. If it stays blank, use “Open in browser”.',
        profileSub: 'Local workspace · plugin active',
        rowAbout: 'About this plugin',
        meBalance: 'Balance',
        meUpdated: 'Updated',
        meNotSignedIn: 'Not signed in',
        meToday: 'Today',
        meTodayUsed: 'Used today',
        meTodayEstimate: 'local est.',
        meLast7: 'Last 7 days',
        meSourceTitle: 'Data source',
        meSourceBalance: 'DeepSeek balance API',
        mePoll: 'auto-checked every 5 min',
        meDaysTracked: '{n} days tracked',
        meNoKey: 'DEEPSEEK_API_KEY is not configured. Add a DeepSeek API key in DSH settings.',
        meStale: 'cached · balance not refreshed',
        meRefreshNow: 'Refresh now',
        meLoading: 'Reading ledger…',
        meError: 'Read failed',
        meRetry: 'Retry',
        meNoData: 'No data',
        homeHi: 'Hi',
        homeHiNamed: 'Hi, {name}',
        homeSub: 'What shall we do today?',
        homeNewChat: 'New chat',
        homeNews: 'Announcements',
        homeNewsAuto: 'auto-synced',
        homeRefresh: 'Refresh',
        homeSessions: 'Sessions',
        homeNoSessions: 'No sessions yet. Create one from the top right.',
        homeNoNews: 'Failed to load announcements. Press Refresh.',
        adCreative: 'Ad concept',
        vipTitle: 'Membership',
        vipOpen: 'Join',
        vipRenew: 'Renew',
        vipCurrent: 'Your plan',
        vipExpires: 'expires {date}',
        vipNoExpire: 'not a member',
        vipChooseTier: 'Choose a tier',
        vipChoosePlan: 'Choose a plan',
        vipAgree: 'I have read the agreement above and understand this page involves no real payment',
        vipPay: 'Pay {price}',
        vipPayTitle: 'Scan to pay',
        vipScan: 'Scan the QR code with {channel} to complete payment',
        vipBack: 'Back',
        vipClose: 'Close',
        vipOk: 'OK',
        vipSuccess: 'Membership activated',
        vipSuccessDesc: '{tier} is active until {date}',
        vipUpgradeNote: 'Upgrade price: {base} minus {credit} of remaining value',
        vipLocked: 'Higher tier active',
        vipFirstOnly: 'Intro',
        vipPerksTitle: 'What {tier} includes',
        vipDailyPrice: 'Only {price} per day',
        vipSocialProof: '12,846 people upgraded today',
        vipGiftTag: 'First-purchase gift',
        vipGiftText: 'New members only, extra perks on your first purchase',
        vipCountdown: 'Offer ends in {time}',
        vipRefund: 'Request refund',
        vipRefundTitle: 'Request refund',
        vipRefundExpires: 'Expires on',
        vipRefundNote: 'The refund is calculated from your remaining membership value after deducting the applicable service fee; the final amount is subject to what is actually returned. Your membership ends as soon as the request is submitted, used time is not refunded, and the money returns to the original payment method within 1-3 business days.',
        vipRefundConfirm: 'Confirm refund',
        vipRefundCancel: 'Not now',
        vipRefundDone: 'Refund requested',
        vipRefundDoneDesc: 'The refund will be returned to your original payment method within 1-3 business days',
        vipRefundFeeTip: 'A service fee has been deducted from this refund; the final amount is subject to what actually arrives',
        vipRefundResub: 'Rejoin · exclusive discount',
        vipNoDowngrade: 'Your current tier is higher; downgrades are not available until it expires',
        shortcutTitle: 'Shortcuts',
        shortcutPlugins: 'Plugins',
        shortcutPluginsDesc: 'Manage installed plugins',
        shortcutSchedules: 'Automation',
        shortcutSchedulesDesc: 'Scheduled and periodic tasks',
        popupAd: 'AD',
        popupTitle: 'DeepSeek · Intelligence within reach',
        popupSub: 'Million-token context · deep reasoning · open source',
        popupClose: 'Close',
        retainTitle: 'Are you really leaving?',
        retainSub: "This is the lowest price we can offer today",
        retainCoupon: '¥5 coupon · one time only',
        retainTake: 'Claim and continue',
        retainLeave: 'Leave anyway',
        bannerCta: 'Open',
        bannerClose: 'Dismiss banner',
        noticeMore: 'Details',
        noticeKnown: 'Got it',
        setSplash: 'Splash ad',
        setSplashDesc: 'Show a full-screen splash once at startup',
        setPreviewSplash: 'Preview splash',
        setPreviewPopup: 'Preview popup',
        setSplashImage: 'Splash image URL',
        setSplashImageDesc: 'Leave empty for the built-in vector poster',
        setSplashClickUrl: 'Splash click URL',
        setSplashClickUrlDesc: 'Opened when the splash body is clicked',
        setPopup: 'Popup ad',
        setPopupDesc: 'Pops up 25% of the time on Assistant / Home; dismissed when switching to Videos or Account',
        setBanner: 'Turn-end banner',
        setBannerDesc: 'After each turn, sometimes shows a dismissible banner at the top without interrupting',
        setHome: 'Home page',
        setHomeDesc: 'When off, the bottom bar keeps Assistant / Videos / Account and boot no longer lands on Home',
        settingsTitle: 'DS Concept Edition',
        settingsSummary: 'Splash / popup / home',
        timeNow: 'just now',
        timeMin: '{n}m ago',
        timeHour: '{n}h ago',
        timeYesterday: 'yesterday',
        aboutBody: 'Third-party open-source fan plugin, not affiliated with DeepSeek. The splash artwork is an original placeholder; you can swap it in Settings.',
        aboutEmbed: 'Balance and usage are fetched by this plugin itself from api.deepseek.com/user/balance and kept in its own ledger. No other plugin is required.',
        footText: 'MIT · for fun only',
        splashAd: 'AD',
        splashSkip: 'Skip',
        splashShake: 'Shake to view details',
        splashVipSkip: 'Silver members skip →'
      }
    }

    let translate = function (key) {
      const dict = DICT.zh
      return dict[key] === undefined ? key : dict[key]
    }
    const t = (key) => translate(key)

    /** 极简模板替换，只支持 {name} / {n}。 */
    function tf(key, vars) {
      let out = t(key)
      if (vars && typeof vars === 'object') {
        for (const name of Object.keys(vars)) out = out.split('{' + name + '}').join(String(vars[name]))
      }
      return out
    }

    // ─── 小工具 ─────────────────────────────────────────────────────────────
    function readStore(store, key) {
      try {
        const target = window[store]
        return target ? target.getItem(key) : null
      } catch (error) {
        return null
      }
    }

    function writeStore(store, key, value) {
      try {
        const target = window[store]
        if (target) target.setItem(key, value)
      } catch (error) {
        /* 隐私模式下会抛，忽略 */
      }
    }

    function readFlag(key) {
      return readStore('localStorage', key)
    }

    function writeFlag(key, value) {
      writeStore('localStorage', key, value)
    }

    function openExternal(url) {
      try {
        window.open(url, '_blank', 'noopener,noreferrer')
      } catch (error) {
        /* 被拦截就算了 */
      }
    }

    function currencySymbol(code) {
      const upper = String(code || '').toUpperCase()
      if (upper === 'CNY') return '¥'
      if (upper === 'USD') return '$'
      if (upper === 'EUR') return '€'
      return upper === '' ? '¥' : upper + ' '
    }

    function fmtMoney(value, currency) {
      if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
      return currencySymbol(currency) + value.toFixed(2)
    }

    function fmtClock(timestamp) {
      const n = Number(timestamp)
      if (!Number.isFinite(n) || n <= 0) return '—'
      try {
        const d = new Date(n)
        const pad = (v) => (v < 10 ? '0' + v : String(v))
        return pad(d.getHours()) + ':' + pad(d.getMinutes())
      } catch (error) {
        return '—'
      }
    }

    /** 只到天的日期：2026-11-26。 */
    function fmtDate(timestamp) {
      const n = Number(timestamp)
      if (!Number.isFinite(n) || n <= 0) return '—'
      try {
        const d = new Date(n)
        const pad = (v) => (v < 10 ? '0' + v : String(v))
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
      } catch (error) {
        return '—'
      }
    }

    function fmtRelative(timestamp) {
      const n = Number(timestamp)
      if (!Number.isFinite(n) || n <= 0) return ''
      const diff = Date.now() - n
      if (diff < 60000) return t('timeNow')
      if (diff < 3600000) return tf('timeMin', { n: Math.floor(diff / 60000) })
      if (diff < 86400000) return tf('timeHour', { n: Math.floor(diff / 3600000) })
      if (diff < 172800000) return t('timeYesterday')
      try {
        const d = new Date(n)
        return d.getMonth() + 1 + '/' + d.getDate()
      } catch (error) {
        return ''
      }
    }

    function noticeStorageKey(id) {
      return 'dsh-cn-nav:notice:' + id
    }

    /** 读一遍本地已读标记 → { id: boolean }。 */
    function readNoticeDismissed() {
      const map = {}
      for (const notice of NOTICES) map[notice.id] = readFlag(noticeStorageKey(notice.id)) === '1'
      map['official-home'] = readFlag(noticeStorageKey('official-home')) === '1'
      return map
    }

    // ─── 设置（本地持久化 + 订阅） ──────────────────────────────────────────
    const SETTINGS_KEY = 'dsh-cn-nav:settings'
    const SETTINGS_DEFAULT = {
      splash: true,
      popup: true,
      banner: true,
      home: true,
      splashImage: '',
      splashClickUrl: USAGE_URL
    }

    function readSettings() {
      try {
        const raw = readFlag(SETTINGS_KEY)
        if (!raw) return { ...SETTINGS_DEFAULT }
        const parsed = JSON.parse(raw)
        if (!parsed || typeof parsed !== 'object') return { ...SETTINGS_DEFAULT }
        return {
          splash: parsed.splash !== false,
          popup: parsed.popup !== false,
          banner: parsed.banner !== false,
          home: parsed.home !== false,
          splashImage: typeof parsed.splashImage === 'string' ? parsed.splashImage : '',
          splashClickUrl:
            typeof parsed.splashClickUrl === 'string' && parsed.splashClickUrl !== ''
              ? parsed.splashClickUrl
              : USAGE_URL
        }
      } catch (error) {
        return { ...SETTINGS_DEFAULT }
      }
    }

    let settings = readSettings()
    const settingsListeners = new Set()

    function subscribeSettings(fn) {
      settingsListeners.add(fn)
      return () => settingsListeners.delete(fn)
    }

    function updateSettings(patch) {
      settings = { ...settings, ...patch }
      writeFlag(SETTINGS_KEY, JSON.stringify(settings))
      settingsListeners.forEach((fn) => {
        try {
          fn(settings)
        } catch (error) {
          /* 单个订阅者出错不影响其他 */
        }
      })
    }

    function useSettings() {
      const [value, setValue] = useState(settings)
      useEffect(() => {
        setValue(settings)
        return subscribeSettings(setValue)
      }, [])
      return value
    }

    // ─── 会员状态（本地持久化 + 订阅） ──────────────────────────────────────
    const VIP_KEY = 'dsh-cn-nav:vip'

    function tierById(id) {
      for (const tier of VIP_TIERS) {
        if (tier.id === id) return tier
      }
      return VIP_TIERS[0]
    }

    function readVip() {
      try {
        const raw = readFlag(VIP_KEY)
        if (!raw) return { tier: 'none', expiresAt: 0, plan: '' }
        const parsed = JSON.parse(raw)
        if (!parsed || typeof parsed !== 'object') return { tier: 'none', expiresAt: 0, plan: '' }
        return {
          tier: tierById(typeof parsed.tier === 'string' ? parsed.tier : 'none').id,
          expiresAt: Number(parsed.expiresAt) || 0,
          startedAt: Number(parsed.startedAt) || 0,
          paid: Number(parsed.paid) || 0,
          plan: typeof parsed.plan === 'string' ? parsed.plan : ''
        }
      } catch (error) {
        return { tier: 'none', expiresAt: 0, startedAt: 0, paid: 0, plan: '' }
      }
    }

    let vip = readVip()
    const vipListeners = new Set()

    function subscribeVip(fn) {
      vipListeners.add(fn)
      return () => vipListeners.delete(fn)
    }

    function setVip(next) {
      vip = next
      writeFlag(VIP_KEY, JSON.stringify(next))
      // 买到了能免开屏的档位：正盖在下面的开屏立刻收掉，不用再点跳过。
      if (adsBlocked('splash')) setSplashVisible(false)
      vipListeners.forEach((fn) => {
        try {
          fn(vip)
        } catch (error) {
          /* 单个订阅者出错不影响其他 */
        }
      })
    }

    /** 当前生效档位：过期自动按普通用户算。 */
    function vipActive() {
      if (!vip || vip.tier === 'none') return VIP_TIERS[0]
      if (vip.expiresAt > 0 && Date.now() > vip.expiresAt) return VIP_TIERS[0]
      return tierById(vip.tier)
    }

    function vipLevel() {
      return vipActive().level
    }

    /**
     * 某类广告是否被会员权益免掉：
     *   白银(1) 免开屏 / 黄金(2) 再加免弹窗 / 钻石(3) 全免（含横幅与首页广告位）
     */
    function adsBlocked(kind) {
      const level = vipLevel()
      if (kind === 'splash') return level >= 1
      if (kind === 'popup') return level >= 2
      return level >= 3
    }

    function useVip() {
      const [value, setValue] = useState(vip)
      useEffect(() => {
        setValue(vip)
        return subscribeVip(setValue)
      }, [])
      return value
    }

    /** 当前会员剩余价值（按剩余时间折算已付金额）。 */
    function remainingCredit() {
      if (!vip || vip.tier === 'none' || !(vip.paid > 0) || !(vip.expiresAt > 0)) return 0
      const now = Date.now()
      if (now >= vip.expiresAt) return 0
      const total = Math.max(1, vip.expiresAt - (vip.startedAt > 0 ? vip.startedAt : vip.expiresAt - 86400000))
      return vip.paid * Math.min(1, (vip.expiresAt - now) / total)
    }

    /**
     * 某个「档位 × 套餐」的实际应付金额。
     *
     * 升级规则（我自己权衡的）：
     *   · 目标档位低于当前档位 = 直接禁选（blocked），不允许花钱降级覆盖
     *   · 同档续费 = 全价（相当于续期，不返还差价）
     *   · 升档 = 全价 − 现会员剩余价值；但至少收全价的 35%，
     *     免得「刚买白银马上升黄金几乎白嫖」。
     */
    function priceFor(tierId, plan) {
      const base = (plan && plan.price && plan.price[tierId]) || 0
      const target = tierById(tierId)
      const current = vipActive()
      if (current.level > target.level) {
        return { price: base, base, credit: 0, upgrading: false, blocked: true }
      }
      const credit = remainingCredit()
      if (current.level >= target.level || credit <= 0) {
        return { price: base, base, credit: 0, upgrading: false, blocked: false }
      }
      const floor = Math.max(1, Math.round(base * 0.35))
      const price = Math.max(floor, Math.round(base - credit))
      return { price, base, credit: Math.round(credit), upgrading: true, blocked: false }
    }

    // ─── 会员弹窗开合（全局：个人页、开屏、设置都能拉起） ───────────────────
    let vipDialogOpen = false
    const vipDialogListeners = new Set()

    function setVipDialogOpen(next) {
      if (vipDialogOpen === next) return
      vipDialogOpen = next
      vipDialogListeners.forEach((fn) => {
        try {
          fn(vipDialogOpen)
        } catch (error) {
          /* 单个订阅者出错不影响其他 */
        }
      })
    }

    function openVipDialog() {
      setVipDialogOpen(true)
    }

    function closeVipDialog() {
      setVipDialogOpen(false)
    }

    function useVipDialog() {
      const [value, setValue] = useState(vipDialogOpen)
      useEffect(() => {
        setValue(vipDialogOpen)
        vipDialogListeners.add(setValue)
        return () => vipDialogListeners.delete(setValue)
      }, [])
      return value
    }

    // ─── 状态：当前面板 ─────────────────────────────────────────────────────
    // 宿主没有「读当前面板」的 API，也没有面板切换事件，所以由本插件自己的
    // 面板挂载状态反推：都没挂载就认为停在会话上（或停在宿主的某个面板上）。
    const panelCounts = { home: 0, video: 0, profile: 0 }
    let activePanel = 'conversation'
    /** 用户从首页快捷入口跳到了宿主自己的面板（plugins / schedules）。 */
    let externalPanel = false
    /** 「开机进首页」只做一次。 */
    let bootedHome = false
    const panelListeners = new Set()

    function emitPanel() {
      panelListeners.forEach((fn) => {
        try {
          fn(activePanel)
        } catch (error) {
          /* 单个订阅者出错不影响其他 */
        }
      })
    }

    function recomputeActivePanel() {
      if (panelCounts.home + panelCounts.video + panelCounts.profile > 0) externalPanel = false
      const next =
        panelCounts.profile > 0
          ? 'profile'
          : panelCounts.video > 0
            ? 'video'
            : panelCounts.home > 0
              ? 'home'
              : externalPanel
                ? 'external'
                : 'conversation'
      if (next === activePanel) return
      const previous = activePanel
      activePanel = next
      emitPanel()
      // 弹窗只在「AI助手 / 首页」这两个界面生效：
      //   · 切进这两个界面时掷一次概率
      //   · 切到短视频 / 个人时立刻把正在显示的弹窗收掉（不留在别的界面上）
      if (next === 'video' || next === 'profile') {
        if (popupVisible) setPopupVisible(false)
        return
      }
      if (next === 'home' || next === 'conversation') {
        if (previous !== next) maybeShowPopup()
      }
    }

    function subscribePanel(fn) {
      panelListeners.add(fn)
      return () => panelListeners.delete(fn)
    }

    // ─── 状态：开屏可见性 ───────────────────────────────────────────────────
    let splashVisible = false
    const splashListeners = new Set()

    function setSplashVisible(next) {
      if (splashVisible === next) return
      splashVisible = next
      splashListeners.forEach((fn) => {
        try {
          fn(splashVisible)
        } catch (error) {
          /* 同上 */
        }
      })
    }

    function subscribeSplash(fn) {
      splashListeners.add(fn)
      return () => splashListeners.delete(fn)
    }

    // ─── 状态：弹窗可见性 ───────────────────────────────────────────────────
    let popupVisible = false
    const popupListeners = new Set()

    function setPopupVisible(next) {
      if (popupVisible === next) return
      popupVisible = next
      popupListeners.forEach((fn) => {
        try {
          fn(popupVisible)
        } catch (error) {
          /* 同上 */
        }
      })
    }

    function subscribePopup(fn) {
      popupListeners.add(fn)
      return () => popupListeners.delete(fn)
    }

    // ─── 状态：横幅广告 ─────────────────────────────────────────────────────
    let bannerAd = null
    const bannerListeners = new Set()

    function setBanner(next) {
      if (bannerAd === next) return
      bannerAd = next
      bannerListeners.forEach((fn) => {
        try {
          fn(bannerAd)
        } catch (error) {
          /* 单个订阅者出错不影响其他 */
        }
      })
    }

    function subscribeBanner(fn) {
      bannerListeners.add(fn)
      return () => bannerListeners.delete(fn)
    }

    // ─── 状态：明暗主题 ─────────────────────────────────────────────────────
    let scheme = 'dark'
    try {
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
        scheme = 'light'
      }
    } catch (error) {
      /* 保持 dark */
    }
    const schemeListeners = new Set()

    function setScheme(next) {
      if (next !== 'light' && next !== 'dark') return
      if (scheme === next) return
      scheme = next
      schemeListeners.forEach((fn) => {
        try {
          fn(scheme)
        } catch (error) {
          /* 同上 */
        }
      })
    }

    function subscribeScheme(fn) {
      schemeListeners.add(fn)
      return () => schemeListeners.delete(fn)
    }

    function useScheme() {
      const [value, setValue] = useState(scheme)
      useEffect(() => {
        setValue(scheme)
        return subscribeScheme(setValue)
      }, [])
      return value
    }

    // ─── 开屏触发策略 ───────────────────────────────────────────────────────
    const KEY_SEEN = 'dsh-cn-nav:splash:seen'

    function showSplash() {
      if (splashVisible) return
      setSplashVisible(true)
    }

    function maybeFirstEntry() {
      if (!SPLASH.firstEntry) return
      if (!settings.splash) return
      // 白银及以上免开屏。
      if (adsBlocked('splash')) return
      if (SPLASH.cadence === 'always') {
        showSplash()
        return
      }
      const store = SPLASH.cadence === 'version' ? 'localStorage' : 'sessionStorage'
      const token = SPLASH.cadence === 'version' ? PROFILE.version : '1'
      if (readStore(store, KEY_SEEN) === token) return
      writeStore(store, KEY_SEEN, token)
      showSplash()
    }

    /** 一轮对话结束：按概率弹顶部横幅（不打断操作）。 */
    function maybeShowBanner() {
      if (!settings.banner) return
      // 钻石全免。
      if (adsBlocked('banner')) return
      if (bannerAd !== null) return
      if (splashVisible || popupVisible) return
      if (Math.random() >= TURN_BANNER.probability) return
      const pick = BANNER_ADS[Math.floor(Math.random() * BANNER_ADS.length)]
      if (pick) setBanner(pick)
    }

    // 会话切换会把历史 turn 一次性成批挂载；真正「刚完成一轮」只会来一条。
    let turnBatch = 0
    let turnTimer = null

    function noteTurnCompleted() {
      turnBatch += 1
      if (turnTimer !== null) clearTimeout(turnTimer)
      turnTimer = setTimeout(() => {
        const batch = turnBatch
        turnBatch = 0
        turnTimer = null
        if (batch >= SPLASH.batchIgnoreThreshold) return
        maybeShowBanner()
      }, 250)
    }

    // ─── 弹窗触发 ───────────────────────────────────────────────────────────
    let lastPopupAt = 0
    /** 页面加载时刻：开局几秒内不弹，免得一进来就被挡住。 */
    const PAGE_STARTED_AT = Date.now()

    function maybeShowPopup() {
      if (!settings.popup) return
      // 黄金及以上免弹窗。
      if (adsBlocked('popup')) return
      if (popupVisible) return
      if (splashVisible) return
      if (Date.now() - PAGE_STARTED_AT < 3000) return
      if (POPUP.cooldownMs > 0 && Date.now() - lastPopupAt < POPUP.cooldownMs) return
      if (Math.random() >= POPUP.probability) return
      lastPopupAt = Date.now()
      currentPopupAd = pickPopupAd()
      setPopupVisible(true)
    }

    // ─── 面板导航 ───────────────────────────────────────────────────────────
    let pluginCtx = null

    function selectPanel(panelId) {
      let layout = null
      try {
        layout = pluginCtx === null ? null : pluginCtx.get('layout')
      } catch (error) {
        layout = null
      }
      if (layout === null || layout === undefined || typeof layout.selectPanel !== 'function') {
        console.warn('[dsh-cn-nav] layout service unavailable; panel switch skipped')
        return false
      }
      try {
        layout.selectPanel(panelId)
        return true
      } catch (error) {
        console.warn('[dsh-cn-nav] selectPanel failed', panelId, error)
        return false
      }
    }

    // ─── 图标 ───────────────────────────────────────────────────────────────
    // 全部手绘。选中态用「同形状低透明度填充」做双色，未选中是纯描边。
    function iconProps(active) {
      return {
        viewBox: '0 0 24 24',
        width: 22,
        height: 22,
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: active ? 2 : 1.7,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true',
        focusable: 'false'
      }
    }

    function IconHome(props) {
      const active = !!(props && props.active)
      return h(
        'svg',
        iconProps(active),
        h('path', {
          d: 'M3.6 10.5 12 3.7l8.4 6.8V19a1.6 1.6 0 0 1-1.6 1.6H5.2A1.6 1.6 0 0 1 3.6 19Z',
          fill: active ? 'currentColor' : 'none',
          fillOpacity: active ? 0.16 : 0
        }),
        h('path', { d: 'M9.7 20.5v-5.9h4.6v5.9' })
      )
    }

    function IconConversation(props) {
      const active = !!(props && props.active)
      return h(
        'svg',
        iconProps(active),
        h('path', {
          d: 'M3.2 6.2A2.2 2.2 0 0 1 5.4 4h13.2a2.2 2.2 0 0 1 2.2 2.2v7.6a2.2 2.2 0 0 1-2.2 2.2h-6.4L7.6 20v-4H5.4a2.2 2.2 0 0 1-2.2-2.2Z',
          fill: active ? 'currentColor' : 'none',
          fillOpacity: active ? 0.16 : 0
        }),
        h('path', { d: 'M7.6 8.6h8.8M7.6 11.9h5.2' })
      )
    }

    function IconVideo(props) {
      const active = !!(props && props.active)
      return h(
        'svg',
        iconProps(active),
        h('rect', {
          x: 2.6,
          y: 4.6,
          width: 18.8,
          height: 14.8,
          rx: 3.4,
          fill: active ? 'currentColor' : 'none',
          fillOpacity: active ? 0.16 : 0
        }),
        h('path', { d: 'M10.2 9.1 15.2 12l-5 2.9z', fill: 'currentColor', stroke: 'none' })
      )
    }

    function IconProfile(props) {
      const active = !!(props && props.active)
      return h(
        'svg',
        iconProps(active),
        h('circle', {
          cx: 12,
          cy: 8.2,
          r: 3.7,
          fill: active ? 'currentColor' : 'none',
          fillOpacity: active ? 0.16 : 0
        }),
        h('path', { d: 'M4.9 20.1c.7-3.6 3.6-5.5 7.1-5.5s6.4 1.9 7.1 5.5' })
      )
    }

    function IconPlugin() {
      return h(
        'svg',
        {
          viewBox: '0 0 24 24',
          width: 20,
          height: 20,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.7,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': 'true'
        },
        h('rect', { x: 3, y: 3, width: 7.6, height: 7.6, rx: 2 }),
        h('rect', { x: 13.4, y: 3, width: 7.6, height: 7.6, rx: 2 }),
        h('rect', { x: 3, y: 13.4, width: 7.6, height: 7.6, rx: 2 }),
        h('path', { d: 'M17.2 13.6v7.2M13.6 17.2h7.2' })
      )
    }

    function IconClock() {
      return h(
        'svg',
        {
          viewBox: '0 0 24 24',
          width: 20,
          height: 20,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.7,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': 'true'
        },
        h('circle', { cx: 12, cy: 12, r: 8.6 }),
        h('path', { d: 'M12 7.2V12l3.4 2' })
      )
    }

    const SHORTCUT_ICONS = { plugins: IconPlugin, schedules: IconClock }

    // ─── 赞助商 logo ────────────────────────────────────────────────────────
    // 手绘三个小图标：小狗 / 相机 / 瓜子。
    function IconDog() {
      return h(
        'svg',
        {
          viewBox: '0 0 24 24',
          width: 22,
          height: 22,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.7,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': 'true'
        },
        h('path', { d: 'M6.6 6.4C5.7 5.1 4.5 4 3.5 3.4c-.4 1.5-.3 3.3.5 4.7' }),
        h('path', { d: 'M17.4 6.4c.9-1.3 2.1-2.4 3.1-3 .4 1.5.3 3.3-.5 4.7' }),
        h('path', { d: 'M5.4 12.6a6.6 6.6 0 0 1 13.2 0c0 3.5-2.9 6.2-6.6 6.2s-6.6-2.7-6.6-6.2Z' }),
        h('circle', { cx: 9.6, cy: 11.8, r: 0.9, fill: 'currentColor', stroke: 'none' }),
        h('circle', { cx: 14.4, cy: 11.8, r: 0.9, fill: 'currentColor', stroke: 'none' }),
        h('path', { d: 'M10.5 15.2c.5.5 2.5.5 3 0' })
      )
    }

    function IconCamera() {
      return h(
        'svg',
        {
          viewBox: '0 0 24 24',
          width: 22,
          height: 22,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.7,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': 'true'
        },
        h('rect', { x: 2.6, y: 6.8, width: 18.8, height: 12.4, rx: 3 }),
        h('path', { d: 'M8.6 6.8 9.8 4.4h4.4l1.2 2.4' }),
        h('circle', { cx: 12, cy: 13, r: 3.3 })
      )
    }

    function IconSeed() {
      return h(
        'svg',
        {
          viewBox: '0 0 24 24',
          width: 22,
          height: 22,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.7,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': 'true'
        },
        h('path', { d: 'M12 3.4c3.3 2.2 5.4 5.5 5.4 9.2 0 4.1-2.4 7.2-5.4 8-3-.8-5.4-3.9-5.4-8 0-3.7 2.1-7 5.4-9.2Z' }),
        h('path', { d: 'M12 6.6v9.4', opacity: 0.5 })
      )
    }

    const AD_ICONS = { dog: IconDog, camera: IconCamera, seed: IconSeed }

    /** 未登录时的默认头像：人头剪影。 */
    function IconUser(props) {
      const size = (props && props.size) || 22
      return h(
        'svg',
        {
          viewBox: '0 0 24 24',
          width: size,
          height: size,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.7,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': 'true'
        },
        h('circle', { cx: 12, cy: 8.4, r: 3.8 }),
        h('path', { d: 'M4.6 20.2c.7-3.7 3.7-5.7 7.4-5.7s6.7 2 7.4 5.7' })
      )
    }

    function AdLogo(props) {
      const logo = (props && props.logo) || {}
      const children = []
      if (logo.kind === 'text') {
        children.push(h('span', { className: 'cnn-logo__char', key: 'c' }, logo.char || ''))
      } else {
        const Icon = AD_ICONS[logo.icon] || IconDog
        children.push(h(Icon, { key: 'i' }))
      }
      if (logo.banner) {
        children.push(h('span', { className: 'cnn-logo__banner', key: 'b' }, logo.banner))
      }
      return h(
        'span',
        {
          className:
            'cnn-logo' +
            (logo.kind === 'text' ? ' cnn-logo--text' : '') +
            (logo.banner ? ' cnn-logo--banner' : ''),
          style: { background: logo.bg || '#2f6bff', color: logo.fg || '#ffffff' }
        },
        children
      )
    }

    // ─── 底部导航栏 ─────────────────────────────────────────────────────────
    const TABS = [
      { id: 'home', labelKey: 'navHome', icon: IconHome },
      { id: 'conversation', labelKey: 'navConversation', icon: IconConversation },
      { id: 'video', labelKey: 'navVideo', icon: IconVideo },
      { id: 'profile', labelKey: 'navProfile', icon: IconProfile }
    ]

    function BottomNav() {
      const [selected, setSelected] = useState(activePanel)
      const theme = useScheme()
      const prefs = useSettings()
      const navigatedRef = useRef(false)
      // 首页关掉后，底部只剩 AI助手 / 短视频 / 个人。
      const tabs = prefs.home ? TABS : TABS.filter((tab) => tab.id !== 'home')

      useEffect(() => {
        setSelected(activePanel)
        return subscribePanel(setSelected)
      }, [])

      // 首页被关掉时，如果正停在本插件的首页就退回会话。
      useEffect(() => {
        if (!prefs.home && activePanel === 'home') selectPanel(null)
      }, [prefs.home])

      // 开机进入首页：一次性、可重试，用户一旦点过任何 Tab 就不再抢。
      useEffect(() => {
        let cancelled = false
        let timer = null
        let attempt = 0
        const tick = () => {
          if (cancelled) return
          if (!settings.home) {
            bootedHome = true
            return
          }
          if (navigatedRef.current || bootedHome) {
            bootedHome = true
            return
          }
          if (selectPanel(PANEL_HOME)) {
            bootedHome = true
            return
          }
          attempt += 1
          if (attempt >= 6) {
            bootedHome = true
            return
          }
          timer = setTimeout(tick, 400)
        }
        timer = setTimeout(tick, 700)
        return () => {
          cancelled = true
          if (timer !== null) clearTimeout(timer)
        }
      }, [])

      const onTab = useCallback((id) => {
        navigatedRef.current = true
        if (id === 'home') {
          selectPanel(PANEL_HOME)
          return
        }
        if (id === 'conversation') {
          selectPanel(null)
          return
        }
        if (id === 'video') {
          selectPanel(PANEL_VIDEO)
          return
        }
        selectPanel(PANEL_PROFILE)
      }, [])

      // external（跳到宿主面板）时找不到对应 Tab，此时不显示指示器。
      const found = tabs.findIndex((tab) => tab.id === selected)
      const index = found < 0 ? 0 : found

      return h(React.Fragment, null, [
        h(
          'div',
          {
            key: 'cnn-bar',
            className: 'cnn-bar',
            'data-cnn-scheme': theme,
            role: 'tablist',
            'aria-label': t('navAria'),
            onKeyDown: (event) => {
              if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
              event.preventDefault()
              const step = event.key === 'ArrowRight' ? 1 : -1
              const next = tabs[(index + step + tabs.length) % tabs.length]
              if (next) onTab(next.id)
            }
          },
          [
            h('style', { key: 'cnn-style' }, CSS),
            h('div', { className: 'cnn-bar__tabs', key: 'cnn-tabs' }, [
              found < 0
                ? null
                : h('span', {
                    key: 'cnn-indicator',
                    className: 'cnn-bar__indicator',
                    style: {
                      width: 100 / tabs.length + '%',
                      transform: 'translateX(' + index * 100 + '%)'
                    },
                    'aria-hidden': 'true'
                  }),
              ...tabs.map((tab) =>
                h(
                  'button',
                  {
                    key: tab.id,
                    type: 'button',
                    role: 'tab',
                    'aria-selected': selected === tab.id ? 'true' : 'false',
                    tabIndex: selected === tab.id ? 0 : -1,
                    className: 'cnn-tab' + (selected === tab.id ? ' is-active' : ''),
                    title: t(tab.labelKey),
                    onClick: () => onTab(tab.id)
                  },
                  h('span', { className: 'cnn-tab__icon' }, [
                    h(tab.icon, { active: selected === tab.id, key: 'svg' }),
                    // 国产特供：短视频永远挂着 99+，个人页偶尔一个红点，永远不消。
                    tab.id === 'video' ? h('span', { className: 'cnn-tab__badge', key: 'badge' }, '99+') : null,
                    tab.id === 'profile' ? h('span', { className: 'cnn-tab__dot', key: 'dot' }) : null
                  ]),
                  h('span', { className: 'cnn-tab__label' }, t(tab.labelKey))
                )
              )
            ])
          ]
        ),
        // 两个广告都挂在常驻的底栏里：面板怎么切都不会被卸载。
        h(SplashAd, { key: 'cnn-splash' }),
        h(PopupAd, { key: 'cnn-pop' }),
        h(TurnBanner, { key: 'cnn-banner' }),
        // 会员弹窗也常驻，开屏的「白银会员可跳过」才能直接拉起它。
        h(VipModal, { key: 'cnn-vip' })
      ])
    }

    // ─── 数据 hooks ─────────────────────────────────────────────────────────
    function useUsage() {
      const [state, setState] = useState({ status: 'loading', data: null, error: '' })
      const aliveRef = useRef(true)

      const load = useCallback((force) => {
        if (typeof fetch !== 'function') {
          setState({ status: 'error', data: null, error: 'fetch unavailable' })
          return
        }
        setState((prev) => ({ status: 'loading', data: prev.data, error: '' }))
        try {
          fetch(USAGE_ROUTE + (force === true ? '?force=1' : ''), {
            headers: { Accept: 'application/json' },
            cache: 'no-store'
          })
            .then((res) => {
              if (!res || !res.ok) throw new Error('HTTP ' + (res ? res.status : '??'))
              return res.json()
            })
            .then((data) => {
              if (!aliveRef.current) return
              setState({ status: data && data.ok ? 'ok' : 'empty', data, error: '' })
            })
            .catch((error) => {
              if (!aliveRef.current) return
              setState({
                status: 'error',
                data: null,
                error: String((error && error.message) || error).slice(0, 160)
              })
            })
        } catch (error) {
          setState({ status: 'error', data: null, error: String((error && error.message) || error).slice(0, 160) })
        }
      }, [])

      useEffect(() => {
        aliveRef.current = true
        load(false)
        return () => {
          aliveRef.current = false
        }
      }, [load])

      return [state, load]
    }

    function useNews() {
      const [state, setState] = useState({ status: 'loading', data: null, error: '' })
      const aliveRef = useRef(true)

      const load = useCallback((force) => {
        if (typeof fetch !== 'function') {
          setState({ status: 'error', data: null, error: 'fetch unavailable' })
          return
        }
        setState((prev) => ({ status: 'loading', data: prev.data, error: '' }))
        try {
          let controller = null
          let timer = null
          if (typeof AbortController === 'function') {
            controller = new AbortController()
            timer = setTimeout(() => controller.abort(), 12000)
          }
          fetch(NEWS_ROUTE + (force === true ? '?force=1' : ''), {
            headers: { Accept: 'application/json' },
            cache: 'no-store',
            signal: controller ? controller.signal : undefined
          })
            .then((res) => {
              if (!res || !res.ok) throw new Error('HTTP ' + (res ? res.status : '??'))
              return res.json()
            })
            .then((data) => {
              if (!aliveRef.current) return
              setState({ status: data && data.ok ? 'ok' : 'error', data, error: '' })
            })
            .catch((error) => {
              if (!aliveRef.current) return
              setState({
                status: 'error',
                data: null,
                error: String((error && error.message) || error).slice(0, 160)
              })
            })
          if (timer !== null) setTimeout(() => clearTimeout(timer), 0)
        } catch (error) {
          setState({ status: 'error', data: null, error: String((error && error.message) || error).slice(0, 160) })
        }
      }, [])

      useEffect(() => {
        aliveRef.current = true
        load(false)
        return () => {
          aliveRef.current = false
        }
      }, [load])

      return [state, load]
    }

    /** 官网首页底部那条公告（Host 自动同步）。 */
    function useHomeNotice() {
      const [state, setState] = useState({ status: 'loading', data: null, error: '' })
      const aliveRef = useRef(true)

      const load = useCallback((force) => {
        if (typeof fetch !== 'function') return
        try {
          fetch(NOTICE_ROUTE + (force === true ? '?force=1' : ''), {
            headers: { Accept: 'application/json' },
            cache: 'no-store'
          })
            .then((res) => {
              if (!res || !res.ok) throw new Error('HTTP ' + (res ? res.status : '??'))
              return res.json()
            })
            .then((data) => {
              if (!aliveRef.current) return
              setState({ status: data && data.ok ? 'ok' : 'error', data, error: '' })
            })
            .catch((error) => {
              if (!aliveRef.current) return
              setState({
                status: 'error',
                data: null,
                error: String((error && error.message) || error).slice(0, 160)
              })
            })
        } catch (error) {
          setState({ status: 'error', data: null, error: String((error && error.message) || error).slice(0, 160) })
        }
      }, [])

      useEffect(() => {
        aliveRef.current = true
        load(false)
        return () => {
          aliveRef.current = false
        }
      }, [load])

      return [state, load]
    }

    /** 会话列表：宿主的 sessions.list 是 ObservableSnapshot，直接订阅。 */
    function useSessionList() {
      const [state, setState] = useState(null)

      useEffect(() => {
        let source = null
        try {
          const sessions = pluginCtx === null ? null : pluginCtx.get('sessions')
          source = sessions && sessions.list ? sessions.list : null
        } catch (error) {
          source = null
        }
        if (source === null || typeof source.getSnapshot !== 'function') return undefined
        const read = () => {
          try {
            setState(source.getSnapshot())
          } catch (error) {
            /* 保持上一次 */
          }
        }
        read()
        const unsubscribe = typeof source.subscribe === 'function' ? source.subscribe(read) : null
        return () => {
          try {
            if (typeof unsubscribe === 'function') unsubscribe()
          } catch (error) {
            /* noop */
          }
        }
      }, [])

      return state
    }

    /** SessionListState → 排好序的轻量数组。 */
    function flattenSessions(listState) {
      if (!listState || !Array.isArray(listState.ids)) return []
      const byId = listState.byId || {}
      const out = []
      for (const id of listState.ids) {
        const summary = byId[id] || {}
        out.push({
          id,
          title: summary.title || summary.name || String(id).slice(-8),
          updatedAt: Number(
            summary.updatedAt || summary.lastActiveAt || summary.lastMessageAt || summary.createdAt || 0
          ),
          archived: summary.archived === true
        })
      }
      out.sort((a, b) => b.updatedAt - a.updatedAt)
      return out.filter((item) => item.archived !== true)
    }

    // ─── 首页 ───────────────────────────────────────────────────────────────
    function HomePanel() {
      const theme = useScheme()
      const [news, reloadNews] = useNews()
      const [homeNotice, reloadNotice] = useHomeNotice()
      const listState = useSessionList()
      const [dismissed, setDismissed] = useState(readNoticeDismissed)
      const [usage] = useUsage()
      const accountName =
        usage.status === 'ok' && usage.data && usage.data.account && typeof usage.data.account.name === 'string'
          ? usage.data.account.name.trim()
          : ''
      /** 优先登录账号名，其次配置名，都没有就只写「你好」。 */
      const greetName = accountName !== '' ? accountName : String(PROFILE.name || '').trim()

      useEffect(() => {
        panelCounts.home += 1
        recomputeActivePanel()
        return () => {
          panelCounts.home -= 1
          recomputeActivePanel()
        }
      }, [])

      const sessions = flattenSessions(listState).slice(0, 12)

      // 会话与广告混排：每 3 条会话后插一条广告。广告行走的是同一套 .cnn-sessions__item，
      // 看起来就是一张会话卡，区别只有底部那个极淡的「广告创意」。
      // 钻石会员首页不再出现广告位（否则广告卡依旧混在会话轨道里）。
      const homeAds = adsBlocked('sponsored') ? [] : HOME_ADS
      const mergedRows = []
      let adCursor = 0
      const pushAd = () => {
        if (adCursor >= homeAds.length) return
        mergedRows.push({ type: 'ad', ad: homeAds[adCursor++] })
      }
      sessions.forEach((item, index) => {
        mergedRows.push({ type: 'session', item })
        if ((index + 1) % 3 === 0) pushAd()
      })
      if (adCursor === 0) pushAd()
      const items = news.status === 'ok' && news.data && Array.isArray(news.data.items) ? news.data.items : []

      const autoNotice =
        homeNotice.status === 'ok' &&
        homeNotice.data &&
        typeof homeNotice.data.text === 'string' &&
        homeNotice.data.text !== ''
          ? { id: 'official-home', text: homeNotice.data.text, url: homeNotice.data.url || '', dismissible: true }
          : null
      const allNotices = autoNotice === null ? NOTICES : [autoNotice, ...NOTICES]
      const visibleNotices = allNotices.filter((notice) => dismissed[notice.id] !== true)

      const dismissNotice = (id) => {
        writeFlag(noticeStorageKey(id), '1')
        setDismissed((prev) => {
          const next = { ...prev }
          next[id] = true
          return next
        })
      }

      const uiWorkspaceOf = () => {
        try {
          return pluginCtx === null ? null : pluginCtx.get('uiWorkspace')
        } catch (error) {
          return null
        }
      }

      const openSession = (id) => {
        const uiWorkspace = uiWorkspaceOf()
        if (uiWorkspace && typeof uiWorkspace.openSession === 'function') {
          try {
            uiWorkspace.openSession(id)
          } catch (error) {
            console.warn('[dsh-cn-nav] openSession failed', error)
          }
        }
        selectPanel(null)
      }

      const newSession = () => {
        const uiWorkspace = uiWorkspaceOf()
        if (uiWorkspace && typeof uiWorkspace.startSession === 'function') {
          try {
            uiWorkspace.startSession()
          } catch (error) {
            console.warn('[dsh-cn-nav] startSession failed', error)
          }
        }
        selectPanel(null)
      }

      /** 跳到宿主自己的面板（插件 / 定时任务），此时底部导航不该再高亮任何一格。 */
      const openShortcut = (panelId) => {
        externalPanel = true
        recomputeActivePanel()
        selectPanel(panelId)
      }

      const notices =
        visibleNotices.length === 0
          ? null
          : h(
              'div',
              { className: 'cnn-notices', key: 'notices' },
              visibleNotices.map((notice) =>
                h('div', { className: 'cnn-notice', key: notice.id, role: 'status' }, [
                  h('span', { className: 'cnn-notice__text', key: 't' }, notice.text),
                  notice.url
                    ? h(
                        'button',
                        {
                          className: 'cnn-notice__more',
                          key: 'm',
                          type: 'button',
                          onClick: () => openExternal(notice.url)
                        },
                        t('noticeMore')
                      )
                    : null,
                  notice.dismissible === false
                    ? null
                    : h(
                        'button',
                        {
                          className: 'cnn-notice__close',
                          key: 'x',
                          type: 'button',
                          title: t('noticeKnown'),
                          'aria-label': t('noticeKnown'),
                          onClick: () => dismissNotice(notice.id)
                        },
                        '×'
                      )
                ])
              )
            )

      return h('div', { className: 'cnn-panel cnn-panel--scroll' }, [
        h('style', { key: 'cnn-style' }, CSS),
        h('div', { className: 'cnn-home', key: 'home', 'data-cnn-scheme': theme }, [
          notices,
          h('section', { className: 'cnn-home__hero', key: 'hero' }, [
            h(
              'div',
              { className: 'cnn-home__hi', key: 'hi' },
              greetName === '' ? t('homeHi') : tf('homeHiNamed', { name: greetName })
            ),
            h('div', { className: 'cnn-home__sub', key: 'sub' }, t('homeSub')),
            h('button', { className: 'cnn-home__new', key: 'new', type: 'button', onClick: newSession }, t('homeNewChat'))
          ]),

          h('section', { className: 'cnn-home__block', key: 'news' }, [
            h('div', { className: 'cnn-home__head', key: 'h' }, [
              h('span', { className: 'cnn-home__title', key: 't' }, t('homeNews')),
              h('span', { className: 'cnn-home__tag', key: 'g' }, t('homeNewsAuto')),
              h(
                'button',
                {
                  className: 'cnn-home__mini',
                  key: 'r',
                  type: 'button',
                  onClick: () => {
                    reloadNews(true)
                    reloadNotice(true)
                  }
                },
                t('homeRefresh')
              )
            ]),
            items.length > 0
              ? h(
                  'ul',
                  { className: 'cnn-news', key: 'list' },
                  items.map((item) =>
                    h(
                      'li',
                      { key: item.id || item.url },
                      h(
                        'button',
                        { type: 'button', className: 'cnn-news__item', onClick: () => openExternal(item.url) },
                        [
                          h('span', { className: 'cnn-news__date', key: 'd' }, item.date || ''),
                          h('span', { className: 'cnn-news__title', key: 't' }, item.title),
                          item.summary ? h('span', { className: 'cnn-news__sum', key: 's' }, item.summary) : null
                        ]
                      )
                    )
                  )
                )
              : h(
                  'p',
                  { className: 'cnn-home__empty', key: 'e' },
                  news.status === 'loading'
                    ? t('meLoading')
                    : t('homeNoNews') + (news.data && news.data.message ? '（' + news.data.message + '）' : '')
                )
          ]),

          h('section', { className: 'cnn-home__block', key: 'sessions' }, [
            h('div', { className: 'cnn-home__head', key: 'h' }, [
              h('span', { className: 'cnn-home__title', key: 't' }, t('homeSessions')),
              h('button', { className: 'cnn-home__mini', key: 'n', type: 'button', onClick: newSession }, t('homeNewChat'))
            ]),
            sessions.length === 0
              ? h('p', { className: 'cnn-home__empty', key: 'empty' }, t('homeNoSessions'))
              : null,

            // 横向可滑动：会话与广告混排成卡片，滑动翻页（scroll-snap）。
            // 广告行和会话行是同一套 .cnn-sessions__item 样式，只有右侧那个极淡的「广告创意」不同。
            // 保持原来的列表行样式，只把列表整体限高并加一条竖向滚动条。
            h(
              'div',
              { className: 'cnn-sessionscroll', key: 'scroll' },
              h(
                'ul',
                { className: 'cnn-sessions' },
                mergedRows.map((row) =>
                  row.type === 'ad'
                    ? h(
                        'li',
                        { key: 'ad-' + row.ad.id },
                        h(
                          'button',
                          {
                            type: 'button',
                            className: 'cnn-sessions__item cnn-sessions__item--ad',
                            title: row.ad.desc,
                            onClick: () => openExternal(row.ad.url)
                          },
                          [
                            h('span', { className: 'cnn-sessions__name', key: 'n' }, row.ad.title),
                            h('span', { className: 'cnn-ad__tag', key: 'g' }, t('adCreative'))
                          ]
                        )
                      )
                    : h(
                        'li',
                        { key: row.item.id },
                        h(
                          'button',
                          {
                            type: 'button',
                            className: 'cnn-sessions__item',
                            onClick: () => openSession(row.item.id)
                          },
                          [
                            h('span', { className: 'cnn-sessions__name', key: 'n' }, row.item.title),
                            h('span', { className: 'cnn-sessions__meta', key: 'm' }, fmtRelative(row.item.updatedAt))
                          ]
                        )
                      )
                )
              )
            )
          ]),

          h('section', { className: 'cnn-home__block', key: 'shortcuts' }, [
            h('div', { className: 'cnn-home__head', key: 'h' }, [
              h('span', { className: 'cnn-home__title', key: 't' }, t('shortcutTitle'))
            ]),
            h(
              'div',
              { className: 'cnn-shortcuts', key: 'g' },
              SHORTCUTS.map((item) => {
                const Icon = SHORTCUT_ICONS[item.id]
                return h(
                  'button',
                  { key: item.id, type: 'button', className: 'cnn-short', onClick: () => openShortcut(item.panel) },
                  [
                    h(
                      'span',
                      { className: 'cnn-short__icon', key: 'i', 'aria-hidden': 'true' },
                      Icon ? h(Icon, null) : null
                    ),
                    h('span', { className: 'cnn-short__body', key: 'b' }, [
                      h('span', { className: 'cnn-short__label', key: 'l' }, t(item.labelKey)),
                      h('span', { className: 'cnn-short__desc', key: 'd' }, t(item.descKey))
                    ])
                  ]
                )
              })
            )
          ])
        ])
      ])
    }

    // ─── 短视频面板 ─────────────────────────────────────────────────────────
    function VideoPanel() {
      const [nonce, setNonce] = useState(0)

      useEffect(() => {
        panelCounts.video += 1
        recomputeActivePanel()
        return () => {
          panelCounts.video -= 1
          recomputeActivePanel()
        }
      }, [])

      return h('div', { className: 'cnn-panel' }, [
        h('style', { key: 'cnn-style' }, CSS),
        h('div', { className: 'cnn-toolbar', key: 'bar' }, [
          h('span', { className: 'cnn-toolbar__title', key: 't' }, t('videoTitle')),
          h(
            'button',
            { type: 'button', className: 'cnn-btn', key: 'r', onClick: () => setNonce((n) => n + 1) },
            t('videoReload')
          ),
          h(
            'button',
            { type: 'button', className: 'cnn-btn', key: 'e', onClick: () => openExternal(BILI_URL) },
            t('videoExternal')
          )
        ]),
        h('iframe', {
          key: nonce,
          className: 'cnn-frame',
          src: BILI_URL,
          title: '哔哩哔哩',
          referrerPolicy: 'no-referrer-when-downgrade',
          allow: 'autoplay; fullscreen; encrypted-media; picture-in-picture',
          allowFullScreen: true
        }),
        h('div', { className: 'cnn-hint', key: 'hint' }, t('videoHint'))
      ])
    }

    // ─── 个人中心 ───────────────────────────────────────────────────────────
    function ProfilePanel() {
      const theme = useScheme()
      const [usage, reload] = useUsage()
      /** 账号头像加载失败（CSP / 401 / 网络）时的兜底开关。 */
      const [avatarFailed, setAvatarFailed] = useState(false)
      const [refundOpen, setRefundOpen] = useState(false)
      // 订阅会员状态：开通/续费后整页立即重渲染（徽章、卡片、广告门禁都跟着变）。
      const vipSnapshot = useVip()
      const activeTier = (() => {
        if (!vipSnapshot || vipSnapshot.tier === 'none') return VIP_TIERS[0]
        if (vipSnapshot.expiresAt > 0 && Date.now() > vipSnapshot.expiresAt) return VIP_TIERS[0]
        return tierById(vipSnapshot.tier)
      })()
      const vipMeta = () => {
        if (activeTier.level === 0) return t('vipNoExpire')
        return vipSnapshot && vipSnapshot.expiresAt > 0
          ? tf('vipExpires', { date: fmtDate(vipSnapshot.expiresAt) })
          : ''
      }

      useEffect(() => {
        panelCounts.profile += 1
        recomputeActivePanel()
        return () => {
          panelCounts.profile -= 1
          recomputeActivePanel()
        }
      }, [])

      const data = usage.data
      const ready = usage.status === 'ok' && !!data && data.ok === true
      const currency = (ready && data.currency) || 'CNY'
      const money = (value) => fmtMoney(value, currency)
      const last7 = ready && Array.isArray(data.last7) ? data.last7 : []
      const maxBar = last7.reduce((max, row) => Math.max(max, typeof row.amount === 'number' ? row.amount : 0), 0)

      /** 账号头像：取得到就显示图片，取不到/加载失败就用人头剪影。 */
      const avatarUrl =
        ready && data.account && typeof data.account.avatarUrl === 'string' ? data.account.avatarUrl : ''
      const showAvatarImg = avatarUrl !== '' && !avatarFailed
      useEffect(() => {
        setAvatarFailed(false)
      }, [avatarUrl])
      const avatarEl = h(
        'span',
        {
          className: 'cnn-me__avatar' + (showAvatarImg ? ' cnn-me__avatar--img' : ' cnn-me__avatar--icon'),
          key: 'avatar',
          'aria-hidden': 'true'
        },
        showAvatarImg
          ? h('img', { src: avatarUrl, alt: '', draggable: false, onError: () => setAvatarFailed(true) })
          : h(IconUser, { size: 22 })
      )

      /** 优先登录账号名，其次配置名，最后「未登录」。 */
      const nameOf = () => {
        const fromAccount =
          ready && data.account && typeof data.account.name === 'string' ? data.account.name.trim() : ''
        if (fromAccount !== '') return fromAccount
        const configured = String(PROFILE.name || '').trim()
        return configured === '' ? t('meNotSignedIn') : configured
      }

      const statusText = () => {
        if (usage.status === 'loading') return t('meLoading')
        if (usage.status === 'error') return t('meError')
        if (!ready) {
          if (data && data.reason === 'no-key') return t('meNoKey')
          return t('meNoData')
        }
        const base = t('meUpdated') + ' ' + fmtClock(data.observedAt)
        return data.stale ? base + ' · ' + t('meStale') : base
      }

      const hero = h('section', { className: 'cnn-hero', key: 'hero' }, [
        h('div', { className: 'cnn-hero__main', key: 'main' }, [
          h('div', { className: 'cnn-hero__label', key: 'l' }, t('meBalance') + ' · ' + currency),
          h('div', { className: 'cnn-hero__value', key: 'v' }, ready ? money(data.balance) : '—'),
          h('div', { className: 'cnn-hero__meta', key: 'm' }, statusText())
        ]),
        h(
          'button',
          { className: 'cnn-hero__cta', key: 'cta', type: 'button', onClick: () => reload(true) },
          t('meRefreshNow')
        )
      ])

      const stats = h('div', { className: 'cnn-stats', key: 'stats' }, [
        h('div', { className: 'cnn-stat', key: 'today' }, [
          h('div', { className: 'cnn-stat__k', key: 'k' }, t('meTodayUsed')),
          h('div', { className: 'cnn-stat__v', key: 'v' }, ready ? money(data.todayObserved) : '—'),
          h(
            'div',
            { className: 'cnn-stat__s', key: 's' },
            ready ? t('meTodayEstimate') + ' ' + money(data.todayEstimate) : ''
          )
        ]),
        h('div', { className: 'cnn-stat', key: 'week' }, [
          h('div', { className: 'cnn-stat__k', key: 'k' }, t('meLast7')),
          h('div', { className: 'cnn-stat__v', key: 'v' }, ready ? money(data.last7Total) : '—'),
          h('div', { className: 'cnn-stat__s', key: 's' }, ready ? currency : '')
        ])
      ])

      const alert =
        !ready && usage.status !== 'loading'
          ? h('div', { className: 'cnn-alert', key: 'alert' }, [
              h('span', { className: 'cnn-alert__text', key: 't' }, statusText()),
              h('button', { className: 'cnn-alert__btn', key: 'b', type: 'button', onClick: reload }, t('meRetry'))
            ])
          : null

      const chart = h('section', { className: 'cnn-block', key: 'chart' }, [
        h('div', { className: 'cnn-block__head', key: 'h' }, [
          h('span', { className: 'cnn-block__title', key: 't' }, t('meLast7')),
          h('span', { className: 'cnn-block__value', key: 'v' }, ready ? money(data.last7Total) : '—')
        ]),
        last7.length > 0
          ? h(
              'div',
              { className: 'cnn-bars', key: 'bars' },
              last7.map((row, index) => {
                const amount = typeof row.amount === 'number' ? row.amount : 0
                const pct = maxBar > 0 ? Math.max(3, Math.round((amount / maxBar) * 100)) : 3
                return h('div', { className: 'cnn-bar', key: row.day || index }, [
                  h(
                    'div',
                    { className: 'cnn-bar__track', key: 't' },
                    h('div', { className: 'cnn-bar__fill', key: 'f', style: { height: pct + '%' } })
                  ),
                  h(
                    'div',
                    { className: 'cnn-bar__label', key: 'l' },
                    index === last7.length - 1 ? t('meToday') : String(row.day || '').slice(5).replace('-', '/')
                  )
                ])
              })
            )
          : h('p', { className: 'cnn-block__empty', key: 'e' }, t('meNoData'))
      ])

      const source = h('section', { className: 'cnn-block', key: 'source' }, [
        h('div', { className: 'cnn-block__head', key: 'h' }, [
          h('span', { className: 'cnn-block__title', key: 't' }, t('meSourceTitle')),
          h(
            'button',
            { className: 'cnn-home__mini', key: 'r', type: 'button', onClick: () => reload(true) },
            t('meRefreshNow')
          )
        ]),
        h('div', { className: 'cnn-src', key: 'b' }, [
          h('div', { className: 'cnn-src__row', key: '1' }, [
            h('span', { className: 'cnn-src__k', key: 'k' }, t('meSourceBalance')),
            h('span', { className: 'cnn-src__v', key: 'v' }, currency)
          ]),
          h('div', { className: 'cnn-src__row', key: '2' }, [
            h('span', { className: 'cnn-src__k', key: 'k' }, 'endpoint'),
            h('span', { className: 'cnn-src__v cnn-src__mono', key: 'v' }, 'api.deepseek.com/user/balance')
          ]),
          h('div', { className: 'cnn-src__row', key: '3' }, [
            h('span', { className: 'cnn-src__k', key: 'k' }, t('mePoll')),
            h(
              'span',
              { className: 'cnn-src__v', key: 'v' },
              ready && typeof data.daysTracked === 'number' ? tf('meDaysTracked', { n: data.daysTracked }) : '—'
            )
          ])
        ])
      ])

      const about = h('section', { className: 'cnn-about', key: 'about' }, [
        h('h3', { className: 'cnn-about__title', key: 't' }, t('rowAbout')),
        h('p', { className: 'cnn-about__body', key: 'b1' }, t('aboutBody')),
        h('p', { className: 'cnn-about__body', key: 'b2' }, t('aboutEmbed'))
      ])

      // 会员卡片：档位徽章 + 到期时间 + 权益 + 开通/续费
      const vipCard = h('section', { className: 'cnn-block cnn-block--vip', key: 'vip' }, [
        h('div', { className: 'cnn-viprow', key: 'r' }, [
          h(VipBadge, { key: 'b', tier: activeTier }),
          h('span', { className: 'cnn-viprow__meta', key: 'm' }, vipMeta()),
          h(
            'button',
            { type: 'button', className: 'cnn-home__mini', key: 'btn', onClick: openVipDialog },
            activeTier.level > 0 ? t('vipRenew') : t('vipOpen')
          )
        ]),
        h(
          'div',
          { className: 'cnn-viprow__perks', key: 'p' },
          activeTier.perks.map((perk, index) => h('span', { className: 'cnn-viprow__perk', key: 'x' + index }, perk))
        ),
        activeTier.level > 0
          ? h(
              'button',
              { type: 'button', className: 'cnn-viprow__refund', key: 'refund', onClick: () => setRefundOpen(true) },
              t('vipRefund')
            )
          : null
      ])

      return h('div', { className: 'cnn-panel cnn-panel--scroll' }, [
        h('style', { key: 'cnn-style' }, CSS),
        h('div', { className: 'cnn-me', key: 'me', 'data-cnn-scheme': theme }, [
          h('header', { className: 'cnn-me__head', key: 'head' }, [
            avatarEl,
            h('div', { className: 'cnn-me__id', key: 'id' }, [
              h('div', { className: 'cnn-me__namerow', key: 'nr' }, [
                h('h2', { className: 'cnn-me__name', key: 'name' }, nameOf()),
                h(VipBadge, { key: 'vip', tier: activeTier })
              ]),
              h('p', { className: 'cnn-me__sub', key: 'sub' }, t('profileSub'))
            ])
          ]),
          vipCard,
          hero,
          stats,
          alert,
          chart,
          source,
          about,
          h('footer', { className: 'cnn-me__foot', key: 'foot' }, 'v' + PROFILE.version + ' · ' + t('footText'))
        ]),
        refundOpen ? h(RefundDialog, { key: 'refund', onClose: () => setRefundOpen(false) }) : null
      ])
    }

    // ─── 会话结束探针 ───────────────────────────────────────────────────────
    function TurnProbe() {
      useEffect(() => {
        noteTurnCompleted()
      }, [])
      return null
    }

    // ─── 开屏广告 ───────────────────────────────────────────────────────────
    function SplashAd() {
      const prefs = useSettings()
      const [visible, setVisible] = useState(splashVisible)
      const [remain, setRemain] = useState(Math.ceil(SPLASH.countdownMs / 1000))
      const [ready, setReady] = useState(false)
      const [moved, setMoved] = useState(false)
      const [closing, setClosing] = useState(false)
      /** 本次开屏是否显示「摇一摇」提示（每次出现时掷一次，不是每帧）。 */
      const [shake, setShake] = useState(false)
      const closeTimer = useRef(null)

      useEffect(() => {
        setVisible(splashVisible)
        return subscribeSplash(setVisible)
      }, [])

      // 进入时按节奏判定；URL 加 #cn-splash 可强制预览一次。
      useEffect(() => {
        let cancelled = false
        let timer = null
        const startedAt = Date.now()
        let quietSince = 0
        const tick = () => {
          if (cancelled) return
          const now = Date.now()
          const waited = now - startedAt
          const busy = COMPAT.busy()
          if (busy) {
            quietSince = 0
          } else if (quietSince === 0) {
            quietSince = now
          }
          const quietFor = quietSince === 0 ? 0 : now - quietSince
          if ((busy || quietFor < COMPAT.settleMs) && waited < COMPAT.maxWaitMs) {
            timer = setTimeout(tick, COMPAT.pollMs)
            return
          }
          timer = null
          maybeFirstEntry()
          try {
            if (String(window.location.hash).indexOf('cn-splash') >= 0) showSplash()
          } catch (error) {
            /* noop */
          }
        }
        tick()
        return () => {
          cancelled = true
          if (timer !== null) clearTimeout(timer)
        }
      }, [])

      const close = useCallback(() => {
        if (closeTimer.current !== null) return
        setClosing(true)
        closeTimer.current = setTimeout(() => {
          closeTimer.current = null
          setClosing(false)
          setSplashVisible(false)
        }, 220)
      }, [])

      useEffect(() => {
        if (!visible) return undefined
        const startedAt = Date.now()
        setMoved(false)
        setClosing(false)
        setReady(false)
        setShake(SPLASH.shakeChance > 0 && Math.random() < SPLASH.shakeChance)
        setRemain(Math.ceil(SPLASH.countdownMs / 1000))
        const timer = setInterval(() => {
          const left = SPLASH.countdownMs - (Date.now() - startedAt)
          if (left <= 0) {
            clearInterval(timer)
            setRemain(0)
            setReady(true)
            return
          }
          setRemain(Math.ceil(left / 1000))
        }, 120)
        return () => clearInterval(timer)
      }, [visible])

      useEffect(() => {
        if (!visible || !SPLASH.closeOnEscape) return undefined
        const onKey = (event) => {
          if (event.key === 'Escape') close()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [visible, close])

      useEffect(
        () => () => {
          if (closeTimer.current !== null) clearTimeout(closeTimer.current)
        },
        []
      )

      if (!visible) return null

      return h('div', {
        key: 'cnn-splash',
        className: 'cnn-splash' + (closing ? ' is-closing' : ''),
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': t('splashAd'),
        onClick: () => {
          if (closing) return
          openExternal(prefs.splashClickUrl || USAGE_URL)
        }
      }, [
        h('style', { key: 's' }, SPLASH_CSS),
        // 默认内联 SVG（不走 <img>，不受 img-src CSP 约束）；设置里填了图片才加载。
        prefs.splashImage
          ? h('img', { className: 'cnn-splash__art', key: 'art', src: prefs.splashImage, alt: '', draggable: false })
          : h('div', {
              className: 'cnn-splash__art cnn-splash__art--vector',
              key: 'art',
              'aria-hidden': 'true',
              dangerouslySetInnerHTML: { __html: PLACEHOLDER_ART_SVG }
            }),
        h('span', { className: 'cnn-splash__badge', key: 'b' }, t('adCreative')),
        // 「摇一摇了解更多」：概率出现，纯装饰，不做真实摇动检测，也不拦点击。
        shake
          ? h('div', { className: 'cnn-shake', key: 'shake', 'aria-hidden': 'true' }, [
              h(
                'svg',
                {
                  className: 'cnn-shake__icon',
                  key: 'i',
                  viewBox: '0 0 40 40',
                  fill: 'none',
                  stroke: 'currentColor',
                  strokeWidth: 2,
                  strokeLinecap: 'round'
                },
                h('rect', { x: 15, y: 7, width: 10, height: 26, rx: 3 }),
                h('path', { d: 'M9 13.5c-2.6 3.4-2.6 9.6 0 13' }),
                h('path', { d: 'M31 13.5c2.6 3.4 2.6 9.6 0 13' }),
                h('path', { d: 'M4.6 17.5c-1.1 1.9-1.1 3.1 0 5' }),
                h('path', { d: 'M35.4 17.5c1.1 1.9 1.1 3.1 0 5' }),
                h('circle', { cx: 20, cy: 30, r: 1, fill: 'currentColor', stroke: 'none' })
              ),
              h('span', { className: 'cnn-shake__text', key: 't' }, t('splashShake'))
            ])
          : null,
        h(
          'button',
          {
            type: 'button',
            key: 'skip',
            className: 'cnn-skip' + (moved ? ' is-moved' : '') + (ready ? ' is-ready' : ''),
            style: { top: (typeof SPLASH.skipTop === 'number' ? SPLASH.skipTop : 56) + 'px' },
            'aria-disabled': ready ? 'false' : 'true',
            'aria-label': t('splashSkip'),
            onPointerDown: () => {
              if (!ready || moved) return
              if (SPLASH.misclickChance > 0 && Math.random() < SPLASH.misclickChance) {
                // 指针按下时把按钮挪走：松手时指针已在广告上，
                // 浏览器把 click 派发给共同祖先（浮层根节点），于是打开了链接。
                setMoved(true)
              }
            },
            onClick: (event) => {
              event.stopPropagation()
              if (ready) close()
            }
          },
          ready ? t('splashSkip') : t('splashSkip') + ' ' + remain
        ),
        // 会员钩子：只在开屏上叠一个会员弹窗，**不关开屏** ——
        // 关掉开屏就等于白送一次「跳过」，那这个钩子就成了捷径。
        h(
          'button',
          {
            type: 'button',
            key: 'vip',
            className: 'cnn-splash__vip',
            style: { top: (typeof SPLASH.skipTop === 'number' ? SPLASH.skipTop : 56) + 42 + 'px' },
            onClick: (event) => {
              event.stopPropagation()
              openVipDialog()
            }
          },
          t('splashVipSkip')
        )
      ])
    }

    // ─── 弹窗广告 ───────────────────────────────────────────────────────────
    function PopupAd() {
      const [visible, setVisible] = useState(popupVisible)
      /** 'ad' = 正常广告；'retain' = 点关闭后弹出的挽留页。 */
      const [step, setStep] = useState('ad')

      useEffect(() => {
        setVisible(popupVisible)
        return subscribePopup(setVisible)
      }, [])

      useEffect(() => {
        if (visible) setStep('ad')
      }, [visible])

      useEffect(() => {
        try {
          if (String(window.location.hash).indexOf('cn-popup') >= 0) setPopupVisible(true)
        } catch (error) {
          /* noop */
        }
      }, [])

      useEffect(() => {
        if (!visible) return undefined
        const onKey = (event) => {
          if (event.key === 'Escape') setPopupVisible(false)
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [visible])

      /** 点关闭时按概率换成挽留页；挽留页上再点才真关。 */
      const requestClose = () => {
        if (step === 'ad' && Math.random() < POPUP.retentionChance) {
          setStep('retain')
          return
        }
        setPopupVisible(false)
      }

      if (!visible) return null

      // 挽留页：把「关闭」变成一个更难拒绝的选择。
      if (step === 'retain') {
        return h('div', { className: 'cnn-pop', role: 'presentation' }, [
          h('style', { key: 's' }, POPUP_CSS),
          h(
            'div',
            {
              className: 'cnn-pop__panel cnn-pop__panel--retain',
              key: 'panel',
              role: 'dialog',
              'aria-modal': 'true',
              'aria-label': t('retainTitle')
            },
            [
              h('div', { className: 'cnn-pop__retain-icon', key: 'i', 'aria-hidden': 'true' }, '!'),
              h('h3', { className: 'cnn-pop__retain-title', key: 't' }, t('retainTitle')),
              h('p', { className: 'cnn-pop__retain-sub', key: 's' }, t('retainSub')),
              h('div', { className: 'cnn-pop__retain-coupon', key: 'c' }, t('retainCoupon')),
              h(
                'button',
                { type: 'button', className: 'cnn-pop__close', key: 'ok', onClick: () => setPopupVisible(false) },
                t('retainTake')
              ),
              h(
                'button',
                { type: 'button', className: 'cnn-pop__leave', key: 'x', onClick: () => setPopupVisible(false) },
                t('retainLeave')
              )
            ]
          )
        ])
      }

      const ad = currentPopupAd || SPONSORS[0]
      const clickable = typeof ad.url === 'string' && ad.url !== ''

      // 两种版式：art = 海报整图；brand = 品牌卡片（logo + 品牌名 + 文案）。
      const header =
        ad.variant === 'art'
          ? h('div', { className: 'cnn-pop__art', key: 'art' }, [
              h('div', {
                className: 'cnn-pop__artinner',
                key: 'in',
                'aria-hidden': 'true',
                dangerouslySetInnerHTML: { __html: PLACEHOLDER_ART_SVG }
              }),
              h('span', { className: 'cnn-pop__badge', key: 'b' }, t('adCreative'))
            ])
          : h(
              'div',
              {
                className: 'cnn-pop__brand',
                key: 'brand',
                style: {
                  background:
                    'linear-gradient(135deg,' + (ad.accent || '#2f6bff') + ',' + (ad.accent2 || '#1c4fd8') + ')'
                }
              },
              [
                h(AdLogo, { key: 'logo', logo: ad.logo }),
                h('div', { className: 'cnn-pop__brandtext', key: 'txt' }, [
                  h('div', { className: 'cnn-pop__brandname', key: 'n' }, ad.brand),
                  h('div', { className: 'cnn-pop__category', key: 'c' }, [
                    h('span', { key: 'cat' }, ad.category),
                    // 「广告创意」：极小极淡，标明这是创意稿而不是真实承诺
                    h('span', { className: 'cnn-pop__creative', key: 'cr' }, t('adCreative'))
                  ])
                ])
              ]
            )

      return h('div', { className: 'cnn-pop', role: 'presentation' }, [
        h('style', { key: 's' }, POPUP_CSS),
        h(
          'div',
          {
            className: 'cnn-pop__panel' + (clickable ? ' is-clickable' : ''),
            key: 'panel',
            role: 'dialog',
            'aria-modal': 'true',
            'aria-label': t('popupAd'),
            // 整张卡可点（关闭按钮除外）—— 这就是「弹窗点了要跳转」。
            onClick: () => {
              if (clickable) openExternal(ad.url)
            }
          },
          [
            header,
            h('div', { className: 'cnn-pop__body', key: 'body' }, [
              h('h3', { className: 'cnn-pop__title', key: 't' }, ad.title || t('popupTitle')),
              h('p', { className: 'cnn-pop__sub', key: 's' }, ad.sub || t('popupSub'))
            ]),
            h(
              'button',
              {
                className: 'cnn-pop__close',
                key: 'close',
                type: 'button',
                onClick: (event) => {
                  event.stopPropagation()
                  requestClose()
                }
              },
              t('popupClose')
            )
          ]
        )
      ])
    }

    // ─── 会话结束横幅广告 ───────────────────────────────────────────────────
    // 顶部一条细横幅：不挡操作、到点自动收起、也能手动关。
    function TurnBanner() {
      const [ad, setAd] = useState(bannerAd)

      useEffect(() => {
        setAd(bannerAd)
        return subscribeBanner(setAd)
      }, [])

      // 停留 TURN_BANNER.durationMs 后自动收起。
      useEffect(() => {
        if (ad === null) return undefined
        const timer = setTimeout(() => setBanner(null), TURN_BANNER.durationMs)
        return () => clearTimeout(timer)
      }, [ad])

      if (ad === null) return null

      return h(
        'div',
        {
          className: 'cnn-banner',
          key: 'cnn-banner',
          style: { top: (typeof TURN_BANNER.top === 'number' ? TURN_BANNER.top : 44) + 'px' },
          role: 'status'
        },
        [
          h('style', { key: 's' }, BANNER_CSS),
          h(
            'span',
            { className: 'cnn-banner__icon', key: 'i', 'aria-hidden': 'true' },
            h(
              'svg',
              {
                viewBox: '0 0 24 24',
                width: 14,
                height: 14,
                fill: 'none',
                stroke: 'currentColor',
                strokeWidth: 1.9,
                strokeLinecap: 'round',
                strokeLinejoin: 'round'
              },
              h('path', { d: 'M11.2 3.6 12.9 8.7 18 10.4 12.9 12.1 11.2 17.2 9.5 12.1 4.4 10.4 9.5 8.7Z' }),
              h('path', { d: 'M18.4 15.6 19 17.3 20.7 17.9 19 18.5 18.4 20.2 17.8 18.5 16.1 17.9 17.8 17.3Z' })
            )
          ),
          h('span', { className: 'cnn-banner__text', key: 't' }, ad.text),
          h(
            'button',
            { className: 'cnn-banner__cta', key: 'c', type: 'button', onClick: () => openExternal(ad.url) },
            t('bannerCta')
          ),
          h('span', { className: 'cnn-banner__tag', key: 'g' }, t('adCreative')),
          h(
            'button',
            {
              className: 'cnn-banner__close',
              key: 'x',
              type: 'button',
              title: t('bannerClose'),
              'aria-label': t('bannerClose'),
              onClick: () => setBanner(null)
            },
            '×'
          )
        ]
      )
    }

    // ─── 会员徽章 ───────────────────────────────────────────────────────────
    // 四档自己画的宝石徽章：未开通是灰的。
    function VipBadge(props) {
      const tier = (props && props.tier) || VIP_TIERS[0]
      return h('span', { className: 'cnn-vip cnn-vip--' + tier.id }, [
        h(
          'svg',
          {
            key: 'g',
            viewBox: '0 0 24 24',
            width: 11,
            height: 11,
            fill: 'none',
            stroke: 'currentColor',
            strokeWidth: 2,
            strokeLinejoin: 'round',
            'aria-hidden': 'true'
          },
          h('path', { d: 'M6.6 3.6h10.8l3.4 5.2L12 20.6 3.2 8.8Z' }),
          h('path', { d: 'M3.4 8.8h17.2M9.2 3.6 7.2 8.8 12 20.6l4.8-11.8-2-5.2' })
        ),
        h('span', { className: 'cnn-vip__text', key: 't' }, tier.short)
      ])
    }

    // ─── 会员二维码 ─────────────────────────────────────────────────────────
    // 把 49×49 矩阵按行合并成连续黑块画成一条 path，比逐格 rect 少一个数量级。
    let qrPathCache = ''
    function qrPathData() {
      if (qrPathCache !== '') return qrPathCache
      let d = ''
      for (let y = 0; y < QR_SIZE; y++) {
        const row = QR_ROWS[y] || ''
        let x = 0
        while (x < QR_SIZE) {
          if (row.charAt(x) === '1') {
            let run = 1
            while (x + run < QR_SIZE && row.charAt(x + run) === '1') run += 1
            d += 'M' + x + ' ' + y + 'h' + run + 'v1h-' + run + 'z'
            x += run
          } else {
            x += 1
          }
        }
      }
      qrPathCache = d
      return d
    }

    // ─── 会员中心弹窗 ───────────────────────────────────────────────────────
    /** 假限时：归零就重置回 00:59，永远抢不完。 */
    function VipCountdown() {
      const [left, setLeft] = useState(59)
      useEffect(() => {
        const timer = setInterval(() => {
          setLeft((prev) => (prev <= 1 ? 59 : prev - 1))
        }, 1000)
        return () => clearInterval(timer)
      }, [])
      const text = '00:' + (left < 10 ? '0' + left : String(left))
      return h('span', { className: 'cnn-vip__countdown' }, tf('vipCountdown', { time: text }))
    }

    /** 支付渠道：只有视觉，没有真实通道。 */
    function IconPayChat() {
      return h(
        'svg',
        { viewBox: '0 0 24 24', width: 15, height: 15, fill: 'currentColor', 'aria-hidden': 'true' },
        h('path', {
          d: 'M12 3.4C7.3 3.4 3.5 6.5 3.5 10.4c0 2.2 1.2 4.1 3.2 5.4l-.8 3.1 3.4-1.8c.9.2 1.8.3 2.7.3 4.7 0 8.5-3.1 8.5-7s-3.8-7-8.5-7Z'
        }),
        h('circle', { cx: 9.3, cy: 9.9, r: 1.15, fill: '#fff' }),
        h('circle', { cx: 14.7, cy: 9.9, r: 1.15, fill: '#fff' })
      )
    }

    function IconPayZhi() {
      return h(
        'svg',
        { viewBox: '0 0 24 24', width: 15, height: 15, 'aria-hidden': 'true' },
        h('rect', { x: 2, y: 2, width: 20, height: 20, rx: 6, fill: 'currentColor' }),
        h(
          'text',
          {
            x: 12,
            y: 16.6,
            textAnchor: 'middle',
            fontSize: 12.5,
            fontWeight: 700,
            fill: '#ffffff',
            fontFamily: 'Microsoft YaHei,PingFang SC,sans-serif'
          },
          '支'
        )
      )
    }

    const PAY_CHANNELS = [
      { id: 'wechat', label: '微信支付', color: '#07c160', icon: IconPayChat },
      { id: 'alipay', label: '支付宝', color: '#1677ff', icon: IconPayZhi }
    ]

    const KONAMI = [
      'ArrowUp',
      'ArrowUp',
      'ArrowDown',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'ArrowLeft',
      'ArrowRight',
      'KeyA',
      'KeyB',
      'KeyA',
      'KeyB'
    ]

    function VipDialog(props) {
      const onClose = (props && props.onClose) || function () {}
      const [tierId, setTierId] = useState(() => {
        // 默认选当前档位（续费）；没会员就默认黄金。
        const active = vipActive()
        return active.level > 0 ? active.id : 'gold'
      })
      const [planId, setPlanId] = useState('month')
      const [agreed, setAgreed] = useState(false)
      const [step, setStep] = useState('choose')
      const [channel, setChannel] = useState('wechat')
      const [granted, setGranted] = useState(null)
      const seqRef = useRef([])

      const tier = tierById(tierId)
      const plan = VIP_PLANS.find((item) => item.id === planId) || VIP_PLANS[0]
      /** 当前生效档位：用来封锁比它更低的档位。 */
      const currentTier = vipActive()
      const quote = priceFor(tier.id, plan)
      const price = quote.price
      // 自动续费套餐的「次期价」= 对应一次性套餐的原价，不走升档折扣。
      const renewPlan = plan.renewPlan ? VIP_PLANS.find((item) => item.id === plan.renewPlan) || null : null
      const renewPrice = renewPlan ? (renewPlan.price && renewPlan.price[tier.id]) || 0 : 0
      const note = String(plan.note || '')
        .split('{price}')
        .join('¥' + price)
        .split('{renew}')
        .join('¥' + renewPrice)

      const grant = () => {
        const startedAt = Date.now()
        const expiresAt = startedAt + plan.days * 86400000
        setVip({ tier: tier.id, expiresAt, startedAt, paid: price, plan: plan.id })
        setGranted({ tier, expiresAt })
        setStep('done')
      }

      // 付款页监听秘籍：↑↑↓↓←→←→ A B A B
      useEffect(() => {
        if (step !== 'pay') return undefined
        const onKey = (event) => {
          const raw = event.key
          const key = raw && raw.length === 1 ? 'Key' + raw.toUpperCase() : raw
          const seq = seqRef.current
          if (key === KONAMI[seq.length]) {
            seq.push(key)
            if (seq.length === KONAMI.length) {
              seqRef.current = []
              grant()
            }
          } else {
            seqRef.current = key === KONAMI[0] ? [key] : []
          }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [step, planId, tierId])

      const closeBtn = h(
        'button',
        { type: 'button', className: 'cnn-vip__close', onClick: onClose, 'aria-label': t('vipClose') },
        '×'
      )

      if (step === 'done') {
        return h('div', { className: 'cnn-vip-modal', role: 'dialog', 'aria-modal': 'true' }, [
          h('style', { key: 's' }, VIP_CSS),
          h('div', { className: 'cnn-vip-panel cnn-vip-panel--done', key: 'p' }, [
            closeBtn,
            h('div', { className: 'cnn-vip-done__icon', key: 'i' }, h(VipBadge, { tier: granted ? granted.tier : tier })),
            h('h3', { className: 'cnn-vip-done__title', key: 't' }, t('vipSuccess')),
            h(
              'p',
              { className: 'cnn-vip-done__desc', key: 'd' },
              tf('vipSuccessDesc', {
                tier: (granted ? granted.tier : tier).label,
                date: fmtDate(granted ? granted.expiresAt : Date.now())
              })
            ),
            h(
              'button',
              { type: 'button', className: 'cnn-vip__primary cnn-vip__primary--done', key: 'b', onClick: onClose },
              t('vipOk')
            )
          ])
        ])
      }

      if (step === 'pay') {
        const activeChannel = PAY_CHANNELS.find((item) => item.id === channel) || PAY_CHANNELS[0]
        return h('div', { className: 'cnn-vip-modal', role: 'dialog', 'aria-modal': 'true' }, [
          h('style', { key: 's' }, VIP_CSS),
          h('div', { className: 'cnn-vip-panel', key: 'p' }, [
            closeBtn,
            h('div', { className: 'cnn-vip__head', key: 'h' }, [
              h('span', { className: 'cnn-vip__title', key: 't' }, t('vipPayTitle')),
              h('span', { className: 'cnn-vip__price', key: 'p' }, '¥' + price)
            ]),
            // 支付渠道：只有配色和文案，没有真实通道
            h(
              'div',
              { className: 'cnn-vip__channels', key: 'ch' },
              PAY_CHANNELS.map((item) => {
                const Icon = item.icon
                return h(
                  'button',
                  {
                    key: item.id,
                    type: 'button',
                    className: 'cnn-vip__channel' + (item.id === channel ? ' is-active' : ''),
                    style:
                      item.id === channel
                        ? { borderColor: item.color, color: item.color, boxShadow: 'inset 0 0 0 1px ' + item.color }
                        : null,
                    onClick: () => setChannel(item.id)
                  },
                  [h('span', { className: 'cnn-vip__channel-icon', key: 'i' }, h(Icon)), h('span', { key: 't' }, item.label)]
                )
              })
            ),
            h(
              'div',
              { className: 'cnn-vip__qrwrap', key: 'q' },
              h(
                'svg',
                {
                  className: 'cnn-vip__qr',
                  viewBox: '0 0 ' + QR_SIZE + ' ' + QR_SIZE,
                  shapeRendering: 'crispEdges',
                  role: 'img',
                  'aria-label': tf('vipScan', { channel: activeChannel.label }),
                  style: { borderColor: activeChannel.color }
                },
                h('rect', { key: 'bg', width: QR_SIZE, height: QR_SIZE, fill: '#ffffff' }),
                h('path', { key: 'fg', d: qrPathData(), fill: '#0b0f18' })
              )
            ),
            h('p', { className: 'cnn-vip__scan', key: 's' }, tf('vipScan', { channel: activeChannel.label })),
            h(
              'div',
              { className: 'cnn-vip__actions', key: 'a' },
              [
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'cnn-vip__ghost',
                    key: 'b',
                    onClick: () => {
                      seqRef.current = []
                      setStep('choose')
                    }
                  },
                  t('vipBack')
                )
              ]
            )
          ])
        ])
      }

      return h('div', { className: 'cnn-vip-modal', role: 'dialog', 'aria-modal': 'true' }, [
        h('style', { key: 's' }, VIP_CSS),
        h('div', { className: 'cnn-vip-panel', key: 'p' }, [
          closeBtn,
          h('div', { className: 'cnn-vip__head', key: 'h' }, [
            h('span', { className: 'cnn-vip__title', key: 't' }, t('vipTitle')),
            h(VipCountdown, { key: 'cd' })
          ]),

          // 首充礼包：非会员才看得到，开了会员就消失。
          currentTier.level === 0
            ? h('div', { className: 'cnn-vip__gift', key: 'gift' }, [
                h('span', { className: 'cnn-vip__gift-tag', key: 't' }, t('vipGiftTag')),
                h('span', { className: 'cnn-vip__gift-text', key: 'x' }, t('vipGiftText'))
              ])
            : null,

          h('div', { className: 'cnn-vip__section', key: 'tier' }, [
            h('div', { className: 'cnn-vip__label', key: 'l' }, t('vipChooseTier')),
            h(
              'div',
              { className: 'cnn-vip__tiers', key: 'g' },
              VIP_TIERS.filter((item) => item.id !== 'none').map((item) => {
                // 低于当前档位的直接禁选：会员不能「花钱降级」把更高档位覆盖掉。
                const locked = item.level < currentTier.level
                return h(
                  'button',
                  {
                    key: item.id,
                    type: 'button',
                    disabled: locked,
                    className:
                      'cnn-vip__tier cnn-vip__tier--' +
                      item.id +
                      (item.id === tierId ? ' is-active' : '') +
                      (locked ? ' is-locked' : ''),
                    onClick: () => {
                      if (!locked) setTierId(item.id)
                    }
                  },
                  [
                    h(VipBadge, { key: 'b', tier: item }),
                    // 卡片只放两条钩子，完整清单在下面
                    ...item.perks.slice(0, 2).map((perk, index) =>
                      h('span', { className: 'cnn-vip__perk', key: 'p' + index }, perk)
                    ),
                    locked ? h('span', { className: 'cnn-vip__lock', key: 'lock' }, t('vipLocked')) : null
                  ]
                )
              })
            )
          ]),

          // 权益墙：把当前档位的全部权益铺开，看着才值钱
          h('div', { className: 'cnn-vip__section', key: 'perks' }, [
            h('div', { className: 'cnn-vip__label', key: 'l' }, tf('vipPerksTitle', { tier: tier.label })),
            h(
              'div',
              { className: 'cnn-vip__perks', key: 'g' },
              tier.perks.map((perk, index) =>
                h('div', { className: 'cnn-vip__perk-item', key: 'p' + index }, [
                  h(
                    'svg',
                    {
                      className: 'cnn-vip__tick',
                      key: 'i',
                      viewBox: '0 0 16 16',
                      width: 12,
                      height: 12,
                      fill: 'none',
                      stroke: 'currentColor',
                      strokeWidth: 2.2,
                      strokeLinecap: 'round',
                      strokeLinejoin: 'round',
                      'aria-hidden': 'true'
                    },
                    h('path', { d: 'M2.8 8.4 6.2 11.8 13.2 4.6' })
                  ),
                  h('span', { key: 't' }, perk)
                ])
              )
            ),
            h('div', { className: 'cnn-vip__proof', key: 'pf' }, t('vipSocialProof'))
          ]),

          h('div', { className: 'cnn-vip__section', key: 'plan' }, [
            h('div', { className: 'cnn-vip__label', key: 'l' }, t('vipChoosePlan')),
            h(
              'div',
              { className: 'cnn-vip__plans', key: 'g' },
              VIP_PLANS.map((item) => {
                const itemQuote = priceFor(tier.id, item)
                const renewPlanOf = item.renewPlan ? VIP_PLANS.find((one) => one.id === item.renewPlan) : null
                const itemRenew = renewPlanOf ? (renewPlanOf.price && renewPlanOf.price[tier.id]) || 0 : 0
                return h(
                  'button',
                  {
                    key: item.id,
                    type: 'button',
                    className: 'cnn-vip__plan' + (item.id === planId ? ' is-active' : ''),
                    onClick: () => setPlanId(item.id)
                  },
                  [
                    h('span', { className: 'cnn-vip__plan-name', key: 'n' }, [
                      item.label,
                      item.renewPlan
                        ? h('span', { className: 'cnn-vip__plan-flag', key: 'f' }, t('vipFirstOnly'))
                        : null
                    ]),
                    h('span', { className: 'cnn-vip__plan-price', key: 'p' }, [
                      // 自动续费套餐：把原价划掉，对比才明显
                      itemRenew > itemQuote.price
                        ? h('s', { className: 'cnn-vip__plan-was', key: 'w' }, '¥' + itemRenew)
                        : null,
                      h('span', { key: 'v' }, '¥' + itemQuote.price)
                    ])
                  ]
                )
              })
            ),
            quote.blocked
              ? h('div', { className: 'cnn-vip__upgrade', key: 'u' }, t('vipNoDowngrade'))
              : quote.upgrading
                ? h(
                    'div',
                    { className: 'cnn-vip__upgrade', key: 'u' },
                    tf('vipUpgradeNote', { base: '¥' + quote.base, credit: '¥' + quote.credit })
                  )
                : null,
            h('div', { className: 'cnn-vip__note', key: 'n' }, note),
            h(
              'div',
              { className: 'cnn-vip__daily', key: 'd' },
              tf('vipDailyPrice', { price: '¥' + (price / plan.days).toFixed(2) })
            )
          ]),

          h('div', { className: 'cnn-vip__section', key: 'agree' }, [
            h('pre', { className: 'cnn-vip__agree', key: 'a' }, VIP_AGREEMENT),
            h(
              'label',
              { className: 'cnn-vip__check', key: 'c' },
              [
                h('input', {
                  key: 'i',
                  type: 'checkbox',
                  checked: agreed,
                  onChange: (event) => setAgreed(event.target.checked)
                }),
                h('span', { key: 't' }, t('vipAgree'))
              ]
            )
          ]),

          h(
            'button',
            {
              type: 'button',
              className: 'cnn-vip__primary',
              key: 'pay',
              disabled: !agreed || quote.blocked,
              onClick: () => {
                if (quote.blocked) return
                seqRef.current = []
                setStep('pay')
              }
            },
            quote.blocked ? t('vipLocked') : tf('vipPay', { price: '¥' + price })
          )
        ])
      ])
    }

    /** 常驻挂载的入口：自己看全局开关，关着就返回 null。 */
    function VipModal() {
      const open = useVipDialog()
      if (!open) return null
      return h(VipDialog, { onClose: closeVipDialog })
    }

    // ─── 退款弹窗 ───────────────────────────────────────────────────────────
    // 规则：可退金额 = 剩余价值 × 50%；退款后会员立即失效。
    function RefundDialog(props) {
      const onClose = (props && props.onClose) || function () {}
      const [done, setDone] = useState(null)
      /** 退款成功后过两秒才补一句「已扣除服务费」——先斩后奏。 */
      const [feeTip, setFeeTip] = useState(false)
      const tier = vipActive()
      const remain = remainingCredit()
      const refundable = Math.round(remain * 0.5 * 100) / 100

      const confirm = () => {
        const amount = refundable
        setVip({ tier: 'none', expiresAt: 0, startedAt: 0, paid: 0, plan: '' })
        setDone(amount)
      }

      useEffect(() => {
        if (done === null) return undefined
        setFeeTip(false)
        const timer = setTimeout(() => setFeeTip(true), 2000)
        return () => clearTimeout(timer)
      }, [done])

      const closeBtn = h(
        'button',
        { type: 'button', className: 'cnn-vip__close', onClick: onClose, 'aria-label': t('vipClose') },
        '×'
      )

      if (done !== null) {
        return h('div', { className: 'cnn-vip-modal', role: 'dialog', 'aria-modal': 'true' }, [
          h('style', { key: 's' }, VIP_CSS),
          h('div', { className: 'cnn-vip-panel cnn-vip-panel--done', key: 'p' }, [
            closeBtn,
            h('div', { className: 'cnn-vip-done__title', key: 't' }, t('vipRefundDone')),
            h('p', { className: 'cnn-vip-done__desc', key: 'd' }, t('vipRefundDoneDesc')),
            feeTip ? h('p', { className: 'cnn-vip__fee-tip', key: 'tip' }, t('vipRefundFeeTip')) : null,
            h(
              'button',
              { type: 'button', className: 'cnn-vip__primary cnn-vip__primary--done', key: 'b', onClick: onClose },
              t('vipOk')
            ),
            // 退了就立刻再卖一次
            h(
              'button',
              {
                type: 'button',
                className: 'cnn-vip__ghost cnn-vip__ghost--full',
                key: 're',
                onClick: () => {
                  onClose()
                  openVipDialog()
                }
              },
              t('vipRefundResub')
            )
          ])
        ])
      }

      return h('div', { className: 'cnn-vip-modal', role: 'dialog', 'aria-modal': 'true' }, [
        h('style', { key: 's' }, VIP_CSS),
        h('div', { className: 'cnn-vip-panel', key: 'p' }, [
          closeBtn,
          h('div', { className: 'cnn-vip__head', key: 'h' }, [
            h('span', { className: 'cnn-vip__title', key: 't' }, t('vipRefundTitle')),
            h('span', { className: 'cnn-vip__sub', key: 's' }, tier.label)
          ]),
          // 金额一律不显示：只告诉他还剩多久，不告诉他能退多少。
          h('div', { className: 'cnn-vip__refundbox', key: 'box' }, [
            h('div', { className: 'cnn-vip__row', key: 'r2' }, [
              h('span', { key: 'k' }, t('vipRefundExpires')),
              h('strong', { key: 'v' }, fmtDate(vip.expiresAt))
            ])
          ]),
          h('p', { className: 'cnn-vip__warn', key: 'w' }, t('vipRefundNote')),
          h(
            'button',
            {
              type: 'button',
              className: 'cnn-vip__primary',
              key: 'ok',
              disabled: refundable <= 0,
              onClick: confirm
            },
            t('vipRefundConfirm')
          ),
          h(
            'button',
            { type: 'button', className: 'cnn-vip__ghost cnn-vip__ghost--full', key: 'c', onClick: onClose },
            t('vipRefundCancel')
          )
        ])
      ])
    }

    // ─── 设置页 ─────────────────────────────────────────────────────────────
    function SettingsPanel(props) {
      const view = props && props.view
      const current = useSettings()

      if (view === 'summary') {
        return h('span', { className: 'cnn-set__summary' }, t('settingsSummary'))
      }

      const toggleRow = (key, labelKey, descKey) =>
        h('div', { className: 'cnn-set__row', key: key }, [
          h('div', { className: 'cnn-set__text', key: 't' }, [
            h('div', { className: 'cnn-set__label', key: 'l' }, t(labelKey)),
            h('div', { className: 'cnn-set__desc', key: 'd' }, t(descKey))
          ]),
          h(
            'button',
            {
              key: 'b',
              type: 'button',
              role: 'switch',
              'aria-checked': current[key] ? 'true' : 'false',
              className: 'cnn-sw' + (current[key] ? ' is-on' : ''),
              onClick: () => updateSettings({ [key]: !current[key] })
            },
            h('span', { className: 'cnn-sw__knob' })
          )
        ])

      const textRow = (key, labelKey, descKey, placeholder) =>
        h('div', { className: 'cnn-set__field', key: key }, [
          h('label', { className: 'cnn-set__label', key: 'l' }, t(labelKey)),
          h('input', {
            key: 'i',
            className: 'cnn-set__input',
            type: 'text',
            value: current[key],
            placeholder: placeholder || '',
            spellCheck: false,
            onChange: (event) => updateSettings({ [key]: event.target.value })
          }),
          h('div', { className: 'cnn-set__desc', key: 'd' }, t(descKey))
        ])

      /** 预览按钮：直接触发一次广告，省得手动改地址栏。 */
      const previewRow = (key, label, onPreview) =>
        h('div', { className: 'cnn-set__preview', key: key }, [
          h(
            'button',
            { type: 'button', className: 'cnn-set__btn', onClick: onPreview },
            label
          )
        ])

      return h('section', { className: 'cnn-set' }, [
        h('style', { key: 's' }, SETTINGS_CSS),
        // 广告开关已按需求隐藏：是否出广告现在由会员档位决定，不在这里关。
        previewRow('preview-splash', t('setPreviewSplash'), () => showSplash()),
        textRow('splashImage', 'setSplashImage', 'setSplashImageDesc', 'https://…'),
        textRow('splashClickUrl', 'setSplashClickUrl', 'setSplashClickUrlDesc', 'https://…'),
        h('div', { className: 'cnn-set__divider', key: 'd1' }),
        previewRow('preview-popup', t('setPreviewPopup'), () => {
          currentPopupAd = pickPopupAd()
          setPopupVisible(true)
        }),
        h('div', { className: 'cnn-set__divider', key: 'd2' }),
        toggleRow('home', 'setHome', 'setHomeDesc')
      ])
    }

    // ─── 样式 ───────────────────────────────────────────────────────────────
    // 导航栏按明暗给两套配色；面板与个人页自带一套 --me-* 变量（蓝白）。
    const CSS = [
      '.cnn-bar{display:flex;align-items:stretch;height:56px;box-sizing:border-box;',
      'padding:0 8px;margin:0;user-select:none;-webkit-user-select:none;}',
      '.cnn-bar[data-cnn-scheme="dark"]{background:#141419;border-top:1px solid rgba(255,255,255,.075);',
      '--cnn-fg:#9aa0ab;--cnn-accent:#7b96ff;--cnn-pill:rgba(123,150,255,.14);}',
      '.cnn-bar[data-cnn-scheme="light"]{background:#f4f4f6;border-top:1px solid rgba(17,24,39,.08);',
      '--cnn-fg:#6b7280;--cnn-accent:#3358d4;--cnn-pill:rgba(51,88,212,.1);}',
      '.cnn-bar__tabs{position:relative;display:flex;align-items:stretch;flex:1 1 auto;min-width:0;}',
      '.cnn-bar__indicator{position:absolute;top:6px;bottom:6px;left:0;border-radius:12px;',
      'background:var(--cnn-pill);pointer-events:none;transition:transform .24s cubic-bezier(.4,0,.2,1);}',
      '.cnn-tab{position:relative;z-index:1;appearance:none;-webkit-appearance:none;border:0;background:none;margin:0;',
      'padding:5px 6px 4px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;',
      'flex:1 1 0;min-width:0;cursor:pointer;color:var(--cnn-fg,#9aa0ab);border-radius:12px;font:inherit;',
      'transition:color .16s ease;}',
      '.cnn-tab:hover{color:var(--cnn-accent,#7b96ff);}',
      '.cnn-tab.is-active{color:var(--cnn-accent,#7b96ff);}',
      '.cnn-tab:focus-visible{outline:2px solid var(--cnn-accent,#7b96ff);outline-offset:-2px;border-radius:12px;}',
      '.cnn-tab__icon{position:relative;display:flex;align-items:center;justify-content:center;height:22px;',
      'transition:transform .16s ease;}',
      // 国产特供：永远不消的红点与 99+
      '.cnn-tab__badge{position:absolute;top:-5px;right:-10px;min-width:16px;height:13px;padding:0 3px;',
      'box-sizing:border-box;border-radius:7px;background:#f5222d;color:#fff;font-size:8.5px;font-weight:600;',
      'line-height:13px;text-align:center;letter-spacing:0;pointer-events:none;',
      'box-shadow:0 0 0 2px rgba(20,20,25,.55);}',
      '.cnn-tab__dot{position:absolute;top:-2px;right:-4px;width:7px;height:7px;border-radius:50%;',
      'background:#f5222d;pointer-events:none;box-shadow:0 0 0 2px rgba(20,20,25,.55);}',
      '.cnn-tab.is-active .cnn-tab__icon{transform:translateY(-1px);}',
      '.cnn-tab__label{font-size:11px;line-height:1;letter-spacing:.02em;white-space:nowrap;}',
      '.cnn-tab.is-active .cnn-tab__label{font-weight:600;}',
      '@media (prefers-reduced-motion:reduce){.cnn-bar__indicator{transition:none}',
      '.cnn-tab__icon,.cnn-tab.is-active .cnn-tab__icon{transition:none;transform:none}}',

      '.cnn-panel{display:flex;flex-direction:column;height:100%;width:100%;min-height:0;overflow:hidden;',
      'background:var(--dsw-alias-bg-base,rgba(15,15,18,1));color:var(--dsw-alias-label-primary,rgba(230,230,230,1));}',
      // 内容多的面板（首页 / 个人）走这条：定高 + 块级纵向滚动，滚动条做细。
      '.cnn-panel--scroll{display:block;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;',
      'scrollbar-width:thin;}',
      '.cnn-panel--scroll::-webkit-scrollbar{width:8px;}',
      '.cnn-panel--scroll::-webkit-scrollbar-thumb{background:rgba(127,127,127,.32);border-radius:4px;}',
      '.cnn-panel--scroll::-webkit-scrollbar-thumb:hover{background:rgba(127,127,127,.5);}',
      '.cnn-panel--scroll::-webkit-scrollbar-track{background:transparent;}',
      '.cnn-toolbar{display:flex;align-items:center;gap:8px;padding:0 12px;height:44px;flex:0 0 auto;',
      'border-bottom:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.2));}',
      '.cnn-toolbar__title{font-size:13px;font-weight:600;margin-right:auto;}',
      '.cnn-btn{appearance:none;-webkit-appearance:none;border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.32));',
      'background:transparent;color:inherit;font:inherit;font-size:12px;padding:5px 10px;border-radius:8px;cursor:pointer;}',
      '.cnn-btn:hover{background:color-mix(in srgb,currentColor 10%,transparent);}',
      '.cnn-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4d6bfe);outline-offset:2px;}',
      '.cnn-frame{flex:1 1 auto;width:100%;min-height:280px;border:0;display:block;background:#fff;}',
      '.cnn-hint{flex:0 0 auto;padding:6px 12px;font-size:11px;line-height:1.5;',
      'color:var(--dsw-alias-label-secondary,rgba(154,160,166,1));',
      'border-top:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.16));}',

      // ── 蓝白主题变量（首页与个人页共用）
      '.cnn-me,.cnn-home{flex:0 0 auto;min-height:100%;padding:18px 16px 22px;box-sizing:border-box;',
      'display:flex;flex-direction:column;gap:12px;background:var(--me-bg);color:var(--me-text);',
      '--me-bg:#f4f7fd;--me-card:#ffffff;--me-line:#e3e9f5;--me-text:#12203a;--me-sub:#6b7a95;',
      '--me-blue:#2f6bff;--me-blue-2:#5b8bff;--me-soft:#e9f0ff;}',
      '.cnn-me[data-cnn-scheme="dark"],.cnn-home[data-cnn-scheme="dark"]{--me-bg:#0b1020;--me-card:#121a2e;',
      '--me-line:#22304d;--me-text:#e6edff;--me-sub:#8fa0c0;--me-blue:#5b86ff;--me-blue-2:#7ba3ff;',
      '--me-soft:#1b2a4d;}',

      // ── 首页公告条
      '.cnn-notices{display:flex;flex-direction:column;gap:8px;}',
      '.cnn-notice{display:flex;align-items:flex-start;gap:10px;padding:11px 13px;border-radius:12px;color:#fff;',
      'background:linear-gradient(135deg,var(--me-blue),#1c4fd8);font-size:12.5px;line-height:1.6;',
      'box-shadow:0 6px 18px rgba(47,107,255,.22);}',
      '.cnn-notice__text{flex:1 1 auto;min-width:0;}',
      '.cnn-notice__more{flex:0 0 auto;appearance:none;-webkit-appearance:none;border:0;border-radius:8px;',
      'padding:3px 9px;cursor:pointer;font:inherit;font-size:11.5px;white-space:nowrap;',
      'color:#fff;background:rgba(255,255,255,.18);}',
      '.cnn-notice__more:hover{background:rgba(255,255,255,.3);}',
      '.cnn-notice__close{flex:0 0 auto;appearance:none;-webkit-appearance:none;border:0;background:transparent;',
      'color:rgba(255,255,255,.92);font:inherit;font-size:15px;line-height:1;cursor:pointer;',
      'padding:2px 5px;border-radius:6px;}',
      '.cnn-notice__close:hover{background:rgba(255,255,255,.2);}',

      // ── 首页欢迎卡
      '.cnn-home__hero{border-radius:16px;padding:18px 16px;color:#fff;display:flex;flex-direction:column;gap:4px;',
      'background:linear-gradient(135deg,var(--me-blue),#1c4fd8);box-shadow:0 10px 26px rgba(47,107,255,.24);}',
      '.cnn-home__hi{font-size:20px;font-weight:700;line-height:1.3;}',
      '.cnn-home__sub{font-size:12px;opacity:.86;}',
      '.cnn-home__new{margin-top:10px;align-self:flex-start;appearance:none;-webkit-appearance:none;border:0;',
      'border-radius:11px;padding:9px 16px;cursor:pointer;font:inherit;font-size:13px;font-weight:700;',
      'color:var(--me-blue);background:#fff;}',
      '.cnn-home__new:hover{filter:brightness(.96);}',
      '.cnn-home__block{border-radius:13px;background:var(--me-card);border:1px solid var(--me-line);overflow:hidden;}',
      '.cnn-home__head{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid var(--me-line);}',
      '.cnn-home__title{font-size:13px;font-weight:700;margin-right:auto;}',
      '.cnn-home__tag{font-size:10px;padding:1px 6px;border-radius:999px;background:var(--me-soft);color:var(--me-blue);}',
      '.cnn-home__mini{appearance:none;-webkit-appearance:none;border:1px solid var(--me-line);background:transparent;',
      'color:var(--me-sub);border-radius:8px;padding:3px 9px;font:inherit;font-size:11px;cursor:pointer;}',
      '.cnn-home__mini:hover{color:var(--me-blue);border-color:var(--me-blue);}',
      '.cnn-home__empty{margin:0;padding:14px;font-size:12px;line-height:1.6;color:var(--me-sub);}',
      '.cnn-news{list-style:none;margin:0;padding:0;}',
      '.cnn-news>li+li{border-top:1px solid var(--me-line);}',
      '.cnn-news__item{display:block;width:100%;text-align:left;background:none;border:0;cursor:pointer;',
      'padding:11px 14px;font:inherit;color:inherit;}',
      '.cnn-news__item:hover{background:var(--me-soft);}',
      '.cnn-news__date{display:block;font-size:10px;color:var(--me-sub);font-variant-numeric:tabular-nums;}',
      '.cnn-news__title{display:block;margin-top:2px;font-size:13px;font-weight:600;line-height:1.45;}',
      '.cnn-news__sum{display:-webkit-box;margin-top:3px;font-size:11.5px;line-height:1.6;color:var(--me-sub);',
      '-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}',
      // ── 会话列表：保持原来的行样式，外面套一个限高 + 竖向滚动条的容器
      '.cnn-sessionscroll{max-height:216px;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;',
      'scrollbar-width:thin;scrollbar-color:rgba(127,127,127,.4) transparent;}',
      '.cnn-sessionscroll::-webkit-scrollbar{width:8px;}',
      '.cnn-sessionscroll::-webkit-scrollbar-track{background:transparent;}',
      '.cnn-sessionscroll::-webkit-scrollbar-thumb{background:rgba(127,127,127,.35);border-radius:4px;}',
      '.cnn-sessionscroll::-webkit-scrollbar-thumb:hover{background:rgba(127,127,127,.58);}',
      '.cnn-sessions{list-style:none;margin:0;padding:0;}',
      '.cnn-sessions>li+li{border-top:1px solid var(--me-line);}',
      '.cnn-sessions__item{display:flex;align-items:center;gap:10px;width:100%;text-align:left;background:none;',
      'border:0;cursor:pointer;padding:11px 14px;font:inherit;color:inherit;}',
      '.cnn-sessions__item:hover{background:var(--me-soft);}',
      '.cnn-sessions__item:focus-visible{outline:2px solid var(--me-blue);outline-offset:-2px;}',
      '.cnn-sessions__name{flex:1 1 auto;min-width:0;font-size:13px;white-space:nowrap;overflow:hidden;',
      'text-overflow:ellipsis;}',
      '.cnn-sessions__meta{flex:0 0 auto;font-size:10.5px;color:var(--me-sub);}',

      // ── 会话行里的广告：同一套行样式，只有右侧一个极淡的「广告创意」
      '.cnn-sessions__item--ad{cursor:pointer;}',
      '.cnn-ad__tag{flex:0 0 auto;font-size:8.5px;line-height:1;padding:2px 4px;border-radius:3px;',
      'color:var(--me-sub);opacity:.38;border:1px solid var(--me-line);letter-spacing:0;}',

      // ── 快捷入口
      '.cnn-shortcuts{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:12px 14px 14px;}',
      '.cnn-short{display:flex;align-items:center;gap:10px;padding:11px 12px;border-radius:12px;cursor:pointer;',
      'font:inherit;text-align:left;color:inherit;background:var(--me-bg);border:1px solid var(--me-line);}',
      '.cnn-short:hover{border-color:var(--me-blue);}',
      '.cnn-short:focus-visible{outline:2px solid var(--me-blue);outline-offset:2px;}',
      '.cnn-short__icon{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;',
      'width:34px;height:34px;border-radius:10px;background:var(--me-soft);color:var(--me-blue);}',
      '.cnn-short__body{min-width:0;display:flex;flex-direction:column;gap:1px;}',
      '.cnn-short__label{font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.cnn-short__desc{font-size:10.5px;color:var(--me-sub);white-space:nowrap;overflow:hidden;',
      'text-overflow:ellipsis;}',

      // ── 个人页
      '.cnn-me__head{display:flex;align-items:center;gap:12px;}',
      '.cnn-me__avatar{flex:0 0 auto;width:42px;height:42px;border-radius:14px;display:inline-flex;',
      'align-items:center;justify-content:center;font-size:19px;font-weight:700;color:#fff;',
      'background:linear-gradient(135deg,var(--me-blue-2),var(--me-blue));overflow:hidden;}',
      // 登录头像：铺满圆角、不拉伸；未登录：保留渐变底 + 人头剪影
      '.cnn-me__avatar--img{background:none;box-shadow:0 4px 12px rgba(20,40,90,.18);}',
      '.cnn-me__avatar--img img{width:100%;height:100%;object-fit:cover;display:block;border-radius:inherit;}',
      '.cnn-me__avatar--icon{color:rgba(255,255,255,.92);}',
      '.cnn-me__id{min-width:0;}',
      '.cnn-me__name{margin:0;font-size:16px;line-height:1.3;font-weight:700;',
      'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.cnn-me__sub{margin:2px 0 0;font-size:11px;line-height:1.5;color:var(--me-sub);}',
      // ── 会员徽章（未开通是灰的）
      '.cnn-me__namerow{display:flex;align-items:center;gap:7px;min-width:0;}',
      '.cnn-vip{display:inline-flex;align-items:center;gap:3px;flex:0 0 auto;padding:1px 6px 1px 4px;',
      'border-radius:999px;font-size:9.5px;line-height:1.6;border:1px solid currentColor;white-space:nowrap;}',
      '.cnn-vip--none{color:#9aa3b2;border-color:rgba(154,163,178,.45);background:rgba(154,163,178,.1);}',
      '.cnn-vip--silver{color:#8493a8;border-color:rgba(160,173,194,.7);background:rgba(195,204,217,.18);}',
      '.cnn-vip--gold{color:#b8801a;border-color:rgba(227,179,65,.7);background:rgba(227,179,65,.14);}',
      '.cnn-vip--diamond{color:#2f9fd0;border-color:rgba(91,200,245,.7);background:rgba(91,200,245,.15);}',
      '.cnn-block--vip{display:flex;flex-direction:column;gap:8px;}',
      '.cnn-viprow{display:flex;align-items:center;gap:8px;}',
      '.cnn-viprow__meta{margin-right:auto;font-size:11px;color:var(--me-sub);}',
      '.cnn-viprow__perks{display:flex;flex-wrap:wrap;gap:6px;}',
      '.cnn-viprow__perk{font-size:10.5px;line-height:1.7;padding:0 7px;border-radius:999px;',
      'background:var(--me-soft);color:var(--me-blue);}',
      '.cnn-viprow__refund{align-self:flex-start;appearance:none;-webkit-appearance:none;border:0;',
      'background:transparent;color:var(--me-sub);font:inherit;font-size:10.5px;cursor:pointer;',
      'text-decoration:underline;padding:0;}',
      '.cnn-viprow__refund:hover{color:#e5484d;}',
      '.cnn-hero{display:flex;align-items:flex-end;gap:12px;padding:16px;border-radius:16px;color:#fff;',
      'background:linear-gradient(135deg,var(--me-blue),#1c4fd8);box-shadow:0 10px 26px rgba(47,107,255,.26);}',
      '.cnn-hero__main{flex:1 1 auto;min-width:0;}',
      '.cnn-hero__label{font-size:11px;letter-spacing:.06em;opacity:.86;}',
      '.cnn-hero__value{margin-top:2px;font-size:30px;line-height:1.15;font-weight:700;',
      'font-variant-numeric:tabular-nums;}',
      '.cnn-hero__meta{margin-top:3px;font-size:11px;opacity:.82;white-space:nowrap;overflow:hidden;',
      'text-overflow:ellipsis;}',
      '.cnn-hero__cta{flex:0 0 auto;appearance:none;-webkit-appearance:none;border:0;border-radius:11px;',
      'padding:9px 16px;cursor:pointer;font:inherit;font-size:13px;font-weight:700;',
      'color:var(--me-blue);background:#fff;}',
      '.cnn-hero__cta:hover{filter:brightness(.96);}',
      '.cnn-hero__cta:focus-visible{outline:2px solid #fff;outline-offset:2px;}',
      '.cnn-stats{display:grid;grid-template-columns:1fr 1fr;gap:10px;}',
      '.cnn-stat{padding:12px 13px;border-radius:13px;background:var(--me-card);border:1px solid var(--me-line);}',
      '.cnn-stat__k{font-size:11px;color:var(--me-sub);}',
      '.cnn-stat__v{margin-top:3px;font-size:19px;font-weight:700;font-variant-numeric:tabular-nums;}',
      '.cnn-stat__s{margin-top:2px;font-size:11px;color:var(--me-sub);}',
      '.cnn-block{padding:13px 14px 15px;border-radius:13px;background:var(--me-card);border:1px solid var(--me-line);}',
      '.cnn-block__head{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:10px;}',
      '.cnn-block__title{font-size:12px;font-weight:600;color:var(--me-sub);}',
      '.cnn-block__value{font-size:14px;font-weight:700;font-variant-numeric:tabular-nums;}',
      '.cnn-block__empty{margin:0;font-size:12px;line-height:1.6;color:var(--me-sub);}',
      '.cnn-bars{display:flex;align-items:flex-end;gap:6px;height:96px;}',
      '.cnn-bar{flex:1 1 0;min-width:0;height:100%;display:flex;flex-direction:column;',
      'justify-content:flex-end;gap:5px;}',
      '.cnn-bar__track{flex:1 1 auto;display:flex;align-items:flex-end;border-radius:6px;',
      'background:var(--me-soft);overflow:hidden;}',
      '.cnn-bar__fill{width:100%;border-radius:6px;background:linear-gradient(180deg,var(--me-blue-2),var(--me-blue));}',
      '.cnn-bar__label{flex:0 0 auto;text-align:center;font-size:10px;color:var(--me-sub);white-space:nowrap;}',
      '.cnn-src{display:flex;flex-direction:column;gap:6px;}',
      '.cnn-src__row{display:flex;align-items:baseline;gap:10px;font-size:11.5px;}',
      '.cnn-src__k{flex:0 0 auto;color:var(--me-sub);}',
      '.cnn-src__v{flex:1 1 auto;min-width:0;text-align:right;overflow:hidden;text-overflow:ellipsis;',
      'white-space:nowrap;}',
      '.cnn-src__mono{font-family:ui-monospace,Consolas,"Courier New",monospace;font-size:11px;}',
      '.cnn-alert{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:12px;',
      'background:var(--me-soft);border:1px solid var(--me-line);color:var(--me-sub);',
      'font-size:12px;line-height:1.5;}',
      '.cnn-alert__text{flex:1 1 auto;min-width:0;}',
      '.cnn-alert__btn{flex:0 0 auto;appearance:none;-webkit-appearance:none;border:1px solid var(--me-blue);',
      'border-radius:9px;padding:5px 11px;cursor:pointer;font:inherit;font-size:12px;font-weight:600;',
      'color:var(--me-blue);background:transparent;}',
      '.cnn-alert__btn:hover{background:var(--me-bg);}',
      '.cnn-about{border-radius:13px;padding:13px 14px;display:flex;flex-direction:column;gap:8px;',
      'background:var(--me-card);border:1px solid var(--me-line);}',
      '.cnn-about__title{margin:0;font-size:13px;font-weight:700;}',
      '.cnn-about__body{margin:0;font-size:12px;line-height:1.7;color:var(--me-sub);}',
      '.cnn-me__foot{margin-top:auto;padding-top:4px;font-size:11px;text-align:center;',
      'color:var(--me-sub);opacity:.85;}',
      '@media (prefers-reduced-motion:reduce){.cnn-me *,.cnn-home *{transition:none!important}}'
    ].join('')

    const SPLASH_CSS = [
      '.cnn-splash{position:fixed;inset:0;z-index:1500;overflow:hidden;background:#08080b;',
      'pointer-events:auto;animation:cnn-fade-in .26s ease both;cursor:pointer;}',
      '.cnn-splash.is-closing{animation:cnn-fade-out .22s ease both;}',
      '.cnn-splash__art{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;',
      'user-select:none;-webkit-user-select:none;}',
      '.cnn-splash__art--vector{overflow:hidden;}',
      '.cnn-splash__art--vector svg{width:100%;height:100%;display:block;}',
      '.cnn-splash__badge{position:absolute;left:16px;bottom:18px;z-index:2;padding:2px 7px;border-radius:4px;',
      'font-size:10px;letter-spacing:.1em;color:rgba(255,255,255,.45);background:rgba(0,0,0,.24);',
      'border:1px solid rgba(255,255,255,.12);}',
      '.cnn-skip{position:absolute;top:56px;right:20px;z-index:3;min-width:86px;height:34px;padding:0 15px;',
      'display:inline-flex;align-items:center;justify-content:center;font:inherit;font-size:13px;font-weight:600;',
      'color:#fff;background:rgba(0,0,0,.44);border:1px solid rgba(255,255,255,.3);border-radius:17px;',
      'cursor:pointer;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);pointer-events:auto;}',
      '.cnn-skip:hover{background:rgba(0,0,0,.58);}',
      '.cnn-skip[aria-disabled="true"]{cursor:default;color:rgba(255,255,255,.76);}',
      '.cnn-skip.is-ready{background:rgba(0,0,0,.5);}',
      '.cnn-skip.is-moved{right:auto;left:24px;}',
      // 会员钩子：紧贴在「跳过」下面，点它直接开会员弹窗
      '.cnn-splash__vip{position:absolute;right:20px;z-index:3;appearance:none;-webkit-appearance:none;',
      'border:1px solid rgba(255,212,121,.5);background:rgba(0,0,0,.52);color:#ffd479;border-radius:15px;',
      'padding:5px 13px;font:inherit;font-size:11.5px;font-weight:600;line-height:1.6;cursor:pointer;',
      'white-space:nowrap;pointer-events:auto;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);}',
      '.cnn-splash__vip:hover{background:rgba(0,0,0,.7);border-color:rgba(255,212,121,.8);}',
      // 「摇一摇」提示：底部居中，图标轻微晃动，不拦点击
      '.cnn-shake{position:absolute;left:0;right:0;bottom:78px;z-index:2;display:flex;flex-direction:column;',
      'align-items:center;gap:5px;color:rgba(255,255,255,.88);pointer-events:none;',
      'animation:cnn-shake-in .45s ease both;}',
      '.cnn-shake__icon{width:26px;height:26px;display:block;animation:cnn-shake-wiggle 2.6s ease-in-out infinite;}',
      '.cnn-shake__text{font-size:10.5px;letter-spacing:.04em;text-shadow:0 1px 8px rgba(0,0,0,.6);}',
      '@keyframes cnn-shake-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}',
      '@keyframes cnn-shake-wiggle{0%,58%,100%{transform:rotate(0)}68%{transform:rotate(-9deg)}',
      '78%{transform:rotate(8deg)}88%{transform:rotate(-4deg)}}',
      '@keyframes cnn-fade-in{from{opacity:0}to{opacity:1}}',
      '@keyframes cnn-fade-out{from{opacity:1}to{opacity:0}}',
      '@media (prefers-reduced-motion:reduce){.cnn-splash,.cnn-splash.is-closing{animation:none}}'
    ].join('')

    const POPUP_CSS = [
      '.cnn-pop{position:fixed;inset:0;z-index:1400;display:flex;align-items:center;justify-content:center;',
      'padding:24px;box-sizing:border-box;background:rgba(6,10,20,.55);pointer-events:auto;',
      'animation:cnn-fade-in .18s ease both;}',
      '.cnn-pop__panel{width:min(340px,100%);max-height:90vh;overflow:auto;border-radius:18px;background:#fff;',
      'box-shadow:0 24px 64px rgba(0,0,0,.42);display:flex;flex-direction:column;',
      'animation:cnn-pop-in .22s cubic-bezier(.2,.8,.3,1) both;}',
      '.cnn-pop__art{position:relative;height:180px;overflow:hidden;background:#0b0b0f;cursor:pointer;}',
      '.cnn-pop__artinner{position:absolute;inset:0;}',
      '.cnn-pop__artinner svg{width:100%;height:100%;display:block;}',
      '.cnn-pop__badge{position:absolute;left:10px;bottom:8px;padding:1px 6px;border-radius:4px;',
      'font-size:9px;letter-spacing:.1em;color:rgba(255,255,255,.5);background:rgba(0,0,0,.32);',
      'border:1px solid rgba(255,255,255,.14);}',
      '.cnn-pop__body{padding:13px 16px 2px;}',
      '.cnn-pop__panel.is-clickable{cursor:pointer;}',
      // ── 品牌卡片头（赞助商 logo + 名称）
      '.cnn-pop__brand{display:flex;align-items:center;gap:12px;padding:16px;color:#fff;}',
      '.cnn-pop__brandtext{min-width:0;}',
      '.cnn-pop__brandname{font-size:16px;font-weight:700;line-height:1.25;white-space:nowrap;',
      'overflow:hidden;text-overflow:ellipsis;}',
      '.cnn-pop__category{display:flex;align-items:center;gap:6px;margin-top:3px;font-size:10.5px;',
      'opacity:.86;letter-spacing:.03em;}',
      '.cnn-pop__creative{font-size:8.5px;line-height:1.5;opacity:.42;letter-spacing:0;',
      'border:1px solid rgba(255,255,255,.22);border-radius:3px;padding:0 3px;}',
      '.cnn-logo{flex:0 0 auto;position:relative;width:52px;height:52px;border-radius:14px;display:inline-flex;',
      'align-items:center;justify-content:center;overflow:hidden;box-shadow:0 6px 16px rgba(0,0,0,.22);}',
      '.cnn-logo--text .cnn-logo__char{font-size:26px;font-weight:700;line-height:1;}',
      '.cnn-logo--banner{padding-bottom:16px;box-sizing:border-box;}',
      '.cnn-logo__banner{position:absolute;left:0;right:0;bottom:0;height:16px;display:flex;align-items:center;',
      'justify-content:center;font-size:9.5px;font-weight:700;letter-spacing:.06em;background:#ff7a1a;color:#fff;}',
      '.cnn-logo svg{display:block;}',
      '.cnn-pop__title{margin:0;font-size:15px;font-weight:700;line-height:1.4;color:#12203a;}',
      '.cnn-pop__sub{margin:4px 0 0;font-size:12px;line-height:1.6;color:#6b7a95;}',
      '.cnn-pop__close{margin:12px 16px 16px;appearance:none;-webkit-appearance:none;border:0;border-radius:11px;',
      'padding:11px 0;cursor:pointer;font:inherit;font-size:14px;font-weight:600;color:#fff;background:#2f6bff;}',
      '.cnn-pop__close:hover{filter:brightness(1.06);}',
      // ── 挽留页
      '.cnn-pop__panel--retain{padding:22px 20px 16px;gap:8px;align-items:center;text-align:center;}',
      '.cnn-pop__retain-icon{width:44px;height:44px;border-radius:50%;display:flex;align-items:center;',
      'justify-content:center;font-size:23px;font-weight:700;color:#fff;',
      'background:linear-gradient(135deg,#ff7a45,#f5222d);}',
      '.cnn-pop__retain-title{margin:2px 0 0;font-size:17px;font-weight:700;color:#12203a;}',
      '.cnn-pop__retain-sub{margin:0;font-size:12.5px;line-height:1.6;color:#6b7a95;}',
      '.cnn-pop__retain-coupon{margin-top:2px;padding:6px 15px;border-radius:999px;font-size:13px;',
      'font-weight:700;color:#f5222d;background:#fff1f0;border:1px dashed rgba(245,34,45,.5);}',
      '.cnn-pop__panel--retain .cnn-pop__close{margin:8px 0 0;width:100%;}',
      '.cnn-pop__leave{margin:0 0 2px;appearance:none;-webkit-appearance:none;border:0;background:transparent;',
      'color:#9aa3b2;font:inherit;font-size:11.5px;cursor:pointer;text-decoration:underline;}',
      '.cnn-pop__leave:hover{color:#6b7a95;}',
      '.cnn-pop__close:focus-visible{outline:2px solid #2f6bff;outline-offset:3px;}',
      '@keyframes cnn-pop-in{from{opacity:0;transform:translateY(10px) scale(.97)}to{opacity:1;transform:none}}',
      '@media (prefers-reduced-motion:reduce){.cnn-pop,.cnn-pop__panel{animation:none}}'
    ].join('')

    const BANNER_CSS = [
      '.cnn-banner{position:fixed;left:12px;right:12px;z-index:1300;display:flex;align-items:center;gap:9px;',
      'padding:9px 11px;border-radius:12px;color:#fff;pointer-events:auto;box-sizing:border-box;',
      'background:linear-gradient(135deg,#2f6bff,#1c4fd8);box-shadow:0 10px 28px rgba(20,60,200,.35);',
      'animation:cnn-banner-in .28s cubic-bezier(.2,.8,.3,1) both;}',
      '.cnn-banner__icon{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;opacity:.95;}',
      '.cnn-banner__text{flex:1 1 auto;min-width:0;font-size:12.5px;line-height:1.5;white-space:nowrap;',
      'overflow:hidden;text-overflow:ellipsis;}',
      '.cnn-banner__cta{flex:0 0 auto;appearance:none;-webkit-appearance:none;border:0;border-radius:8px;',
      'padding:4px 10px;cursor:pointer;font:inherit;font-size:12px;font-weight:600;color:#2f6bff;background:#fff;}',
      '.cnn-banner__cta:hover{filter:brightness(.95);}',
      '.cnn-banner__tag{flex:0 0 auto;font-size:8.5px;line-height:1;padding:2px 4px;border-radius:3px;',
      'color:rgba(255,255,255,.8);border:1px solid rgba(255,255,255,.28);opacity:.5;}',
      '.cnn-banner__close{flex:0 0 auto;appearance:none;-webkit-appearance:none;border:0;background:transparent;',
      'color:rgba(255,255,255,.9);font:inherit;font-size:15px;line-height:1;cursor:pointer;padding:2px 5px;',
      'border-radius:6px;}',
      '.cnn-banner__close:hover{background:rgba(255,255,255,.18);}',
      '@keyframes cnn-banner-in{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}}',
      '@media (prefers-reduced-motion:reduce){.cnn-banner{animation:none}}'
    ].join('')

    const SETTINGS_CSS = [
      '.cnn-set{display:flex;flex-direction:column;gap:14px;}',
      '.cnn-set__row{display:flex;align-items:center;gap:16px;}',
      '.cnn-set__text{flex:1 1 auto;min-width:0;}',
      '.cnn-set__label{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary,#e6e6e6);}',
      '.cnn-set__desc{font-size:11.5px;line-height:1.6;color:var(--dsw-alias-label-secondary,#9aa0a6);margin-top:2px;}',
      '.cnn-set__divider{height:1px;background:var(--dsw-alias-border-l1,rgba(127,127,127,.2));}',
      // 预览按钮
      '.cnn-set__preview{display:flex;gap:8px;margin-top:-6px;}',
      '.cnn-set__btn{appearance:none;-webkit-appearance:none;border-radius:8px;cursor:pointer;font:inherit;',
      'font-size:12px;padding:5px 12px;color:var(--dsw-alias-label-primary,#e6e6e6);',
      'border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.32));background:transparent;}',
      '.cnn-set__btn:hover{background:color-mix(in srgb,currentColor 10%,transparent);}',
      '.cnn-set__btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4d6bfe);outline-offset:2px;}',
      '.cnn-set__field{display:flex;flex-direction:column;gap:6px;}',
      '.cnn-set__input{width:100%;box-sizing:border-box;padding:8px 10px;border-radius:8px;font:inherit;',
      'font-size:12.5px;color:var(--dsw-alias-label-primary,#e6e6e6);',
      'background:var(--dsw-alias-bg-layer-2,rgba(28,28,34,1));',
      'border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.32));outline:none;}',
      '.cnn-set__input:focus{border-color:var(--dsw-alias-brand-primary,#4d6bfe);}',
      '.cnn-set__summary{font-size:12px;color:var(--dsw-alias-label-secondary,#9aa0a6);}',
      '.cnn-sw{position:relative;flex:0 0 auto;width:42px;height:24px;border-radius:12px;border:0;padding:0;',
      'cursor:pointer;background:var(--dsw-alias-state-idle-primary,#4a4a52);transition:background .16s ease;}',
      '.cnn-sw.is-on{background:var(--dsw-alias-brand-primary,#4d6bfe);}',
      '.cnn-sw__knob{position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#fff;',
      'transition:transform .18s cubic-bezier(.4,0,.2,1);}',
      '.cnn-sw.is-on .cnn-sw__knob{transform:translateX(18px);}',
      '.cnn-sw:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4d6bfe);outline-offset:2px;}',
      '@media (prefers-reduced-motion:reduce){.cnn-sw,.cnn-sw__knob{transition:none}}'
    ].join('')

    const VIP_CSS = [
      '.cnn-vip-modal{position:fixed;inset:0;z-index:1600;display:flex;align-items:center;justify-content:center;',
      'padding:20px;box-sizing:border-box;background:rgba(6,10,20,.6);}',
      '.cnn-vip-panel{position:relative;width:min(420px,100%);max-height:92vh;overflow:auto;box-sizing:border-box;',
      'border-radius:18px;background:#fff;color:#12203a;padding:18px;display:flex;flex-direction:column;gap:14px;',
      'box-shadow:0 24px 64px rgba(0,0,0,.45);animation:cnn-vip-in .22s cubic-bezier(.2,.8,.3,1) both;}',
      '@keyframes cnn-vip-in{from{opacity:0;transform:translateY(10px) scale(.97)}to{opacity:1;transform:none}}',
      '.cnn-vip__close{position:absolute;top:10px;right:10px;width:26px;height:26px;border:0;border-radius:8px;',
      'background:transparent;color:#6b7a95;font-size:18px;line-height:1;cursor:pointer;}',
      '.cnn-vip__close:hover{background:rgba(0,0,0,.06);}',
      '.cnn-vip__head{display:flex;align-items:baseline;gap:10px;padding-right:28px;}',
      '.cnn-vip__title{font-size:16px;font-weight:700;}',
      '.cnn-vip__price{margin-left:auto;font-size:18px;font-weight:700;color:#2f6bff;}',
      '.cnn-vip__countdown{margin-left:auto;font-size:11px;font-weight:600;color:#e5484d;',
      'font-variant-numeric:tabular-nums;white-space:nowrap;}',
      // 首充礼包
      '.cnn-vip__gift{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:10px;',
      'background:linear-gradient(135deg,#fff1f0,#ffe7e5);border:1px solid rgba(245,34,45,.28);}',
      '.cnn-vip__gift-tag{flex:0 0 auto;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:700;',
      'color:#fff;background:linear-gradient(135deg,#ff7a45,#f5222d);white-space:nowrap;}',
      '.cnn-vip__gift-text{font-size:11px;line-height:1.5;color:#b03a34;}',
      '.cnn-vip__section{display:flex;flex-direction:column;gap:8px;}',
      '.cnn-vip__label{font-size:11.5px;font-weight:600;color:#6b7a95;}',
      '.cnn-vip__tiers{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;}',
      '.cnn-vip__tier{display:flex;flex-direction:column;align-items:flex-start;gap:4px;padding:9px 8px;',
      'border-radius:11px;border:1px solid #e3e9f5;background:#f7f9fd;cursor:pointer;font:inherit;text-align:left;',
      'color:inherit;}',
      '.cnn-vip__tier.is-active{border-color:#2f6bff;background:#eef3ff;box-shadow:inset 0 0 0 1px rgba(47,107,255,.35);}',
      // 低于当前档位：禁选
      '.cnn-vip__tier.is-locked{opacity:.45;cursor:not-allowed;background:#f2f4f8;}',
      '.cnn-vip__tier.is-locked:hover{border-color:#e3e9f5;}',
      '.cnn-vip__lock{margin-top:2px;font-size:9px;line-height:1.4;color:#b8801a;}',
      '.cnn-vip__perk{font-size:10px;line-height:1.45;color:#6b7a95;}',
      '.cnn-vip__plans{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;}',
      '.cnn-vip__plan{display:flex;align-items:baseline;justify-content:space-between;gap:6px;padding:9px 10px;',
      'border-radius:11px;border:1px solid #e3e9f5;background:#f7f9fd;cursor:pointer;font:inherit;color:inherit;}',
      '.cnn-vip__plan.is-active{border-color:#2f6bff;background:#eef3ff;}',
      '.cnn-vip__plan-name{font-size:12px;font-weight:600;}',
      '.cnn-vip__plan-flag{margin-left:4px;font-size:8.5px;font-weight:600;color:#c8901f;background:#fff4dd;',
      'border:1px solid rgba(227,179,65,.55);border-radius:3px;padding:0 3px;vertical-align:1px;}',
      '.cnn-vip__plan-price{font-size:13px;font-weight:700;color:#2f6bff;}',
      '.cnn-vip__plan-was{margin-right:4px;font-size:10.5px;font-weight:400;color:#a9b4c6;',
      'text-decoration:line-through;}',
      // ── 权益墙
      '.cnn-vip__perks{display:grid;grid-template-columns:1fr 1fr;gap:6px 12px;}',
      '.cnn-vip__perk-item{display:flex;align-items:flex-start;gap:5px;font-size:11px;line-height:1.55;',
      'color:#3d4a61;}',
      '.cnn-vip__tick{flex:0 0 auto;margin-top:2px;color:#12b981;}',
      '.cnn-vip__proof{margin-top:2px;padding:5px 8px;border-radius:8px;text-align:center;',
      'font-size:10.5px;color:#b8801a;background:#fff7e6;border:1px solid rgba(227,179,65,.35);}',
      '.cnn-vip__daily{font-size:10.5px;color:#8a97ab;}',
      '.cnn-vip__note{font-size:10.5px;line-height:1.5;color:#8a97ab;}',
      '.cnn-vip__upgrade{font-size:11px;line-height:1.55;color:#b8801a;background:#fff7e6;',
      'border:1px solid rgba(227,179,65,.45);border-radius:9px;padding:7px 9px;}',
      '.cnn-vip__agree{margin:0;max-height:96px;overflow:auto;white-space:pre-wrap;font-family:inherit;',
      'font-size:10.5px;line-height:1.7;color:#6b7a95;background:#f7f9fd;border:1px solid #e9eef8;',
      'border-radius:10px;padding:9px;}',
      '.cnn-vip__check{display:flex;align-items:flex-start;gap:7px;font-size:11.5px;line-height:1.6;',
      'color:#3d4a61;cursor:pointer;}',
      '.cnn-vip__check input{margin-top:2px;}',
      '.cnn-vip__primary{appearance:none;-webkit-appearance:none;border:0;border-radius:12px;padding:12px 0;',
      'cursor:pointer;font:inherit;font-size:14px;font-weight:700;color:#fff;',
      'background:linear-gradient(135deg,#2f6bff,#1c4fd8);}',
      '.cnn-vip__primary:disabled{opacity:.45;cursor:not-allowed;}',
      // 成功页的按钮：从居中列里撑开成正常宽按钮，别再是细长竖条
      '.cnn-vip__primary--done{align-self:stretch;width:100%;max-width:240px;margin:6px auto 0;',
      'padding:11px 28px;letter-spacing:.02em;}',
      '.cnn-vip__qrwrap{display:flex;justify-content:center;padding:4px 0 8px;}',
      // ── 支付渠道
      '.cnn-vip__channels{display:grid;grid-template-columns:1fr 1fr;gap:8px;}',
      '.cnn-vip__channel{display:flex;align-items:center;justify-content:center;gap:6px;padding:9px 8px;',
      'border-radius:11px;border:1px solid #e3e9f5;background:#f7f9fd;cursor:pointer;font:inherit;',
      'font-size:12px;font-weight:600;color:#6b7a95;transition:border-color .15s ease,color .15s ease,background .15s ease;}',
      '.cnn-vip__channel.is-active{background:#fff;}',
      '.cnn-vip__channel-icon{display:inline-flex;align-items:center;}',
      '.cnn-vip__qr{width:196px;height:196px;border:1px solid #e3e9f5;border-radius:12px;padding:8px;background:#fff;}',
      '.cnn-vip__scan{margin:0;text-align:center;font-size:12px;color:#6b7a95;}',
      '.cnn-vip__actions{display:flex;gap:8px;}',
      '.cnn-vip__ghost{flex:1 1 auto;appearance:none;-webkit-appearance:none;border:1px solid #dfe6f3;',
      'background:transparent;color:#3d4a61;border-radius:11px;padding:10px 0;cursor:pointer;font:inherit;',
      'font-size:12.5px;font-weight:600;}',
      '.cnn-vip__ghost:hover{background:#f2f5fb;}',
      '.cnn-vip__ghost--full{width:100%;flex:0 0 auto;padding:10px 0;}',
      // ── 退款
      '.cnn-vip__sub{font-size:11px;color:#6b7a95;}',
      '.cnn-vip__refundbox{display:flex;flex-direction:column;gap:7px;padding:12px;border-radius:12px;',
      'background:#f7f9fd;border:1px solid #e9eef8;}',
      '.cnn-vip__row{display:flex;align-items:baseline;justify-content:space-between;gap:10px;',
      'font-size:12px;color:#6b7a95;}',
      '.cnn-vip__row strong{font-size:14px;font-weight:700;color:#12203a;font-variant-numeric:tabular-nums;}',
      '.cnn-vip__row--hl strong{font-size:16px;color:#2f6bff;}',
      '.cnn-vip__warn{margin:0;font-size:11px;line-height:1.65;color:#b03a34;background:#fff1f0;',
      'border:1px solid rgba(245,34,45,.22);border-radius:9px;padding:8px 9px;}',
      // 先斩后奏的那句小字
      '.cnn-vip__fee-tip{margin:-2px 0 0;font-size:10px;line-height:1.5;color:#b03a34;opacity:.72;',
      'text-align:center;}',
      '.cnn-vip-panel--done{align-items:center;text-align:center;gap:12px;padding:26px 20px;}',
      '.cnn-vip-done__icon{display:flex;justify-content:center;}',
      '.cnn-vip-done__title{margin:0;font-size:17px;font-weight:700;}',
      '.cnn-vip-done__desc{margin:0;font-size:12.5px;line-height:1.6;color:#6b7a95;}',
      '@media (prefers-reduced-motion:reduce){.cnn-vip-panel{animation:none}}'
    ].join('')

    // ─── 插件入口 ───────────────────────────────────────────────────────────
    function apply(ctx) {
      pluginCtx = ctx

      // 语言：拿到 locale 服务才注册，拿不到就用内置中文兜底。
      ctx.inject(['locale'], (owner) => {
        let locale = null
        try {
          locale = owner.get('locale')
        } catch (error) {
          locale = null
        }
        if (locale === null || locale === undefined || typeof locale.register !== 'function') return
        owner.effect(() => locale.register(NS, { zh: DICT.zh, en: DICT.en }), `${NS}: locale`)
        if (typeof locale.bind === 'function') translate = locale.bind(NS)
      })

      // 明暗：读一次快照，再跟随 theme/change。
      ctx.inject(['theme'], (owner) => {
        let theme = null
        try {
          theme = owner.get('theme')
        } catch (error) {
          theme = null
        }
        if (theme === null || theme === undefined || typeof theme.getTheme !== 'function') return
        const read = () => {
          try {
            const snapshot = theme.getTheme()
            const active = snapshot && snapshot.active ? snapshot.active.colorScheme : null
            if (active === 'light' || active === 'dark') setScheme(active)
          } catch (error) {
            /* 保持当前配色 */
          }
        }
        read()
        if (typeof owner.on === 'function') {
          owner.effect(() => owner.on('theme/change', read), `${NS}: theme`)
        }
      })

      // 槽位：每一个都单独 try/catch，一个注册失败不影响其他。
      ctx.inject(['slots'], (owner) => {
        let slots = null
        try {
          slots = owner.get('slots')
        } catch (error) {
          slots = null
        }
        if (slots === null || slots === undefined || typeof slots.inject !== 'function') return
        if (typeof slots.register !== 'function') return

        const disposers = []
        const contribute = (slotKey, options, Component) => {
          try {
            disposers.push(slots.inject(slotKey, () => slots.register(options, Component)))
          } catch (error) {
            console.warn('[dsh-cn-nav] failed to register into ' + slotKey, error)
          }
        }

        contribute('shell.bottom', { name: 'shell.bottom' }, BottomNav)
        contribute('main', { name: 'main', key: PANEL_HOME }, HomePanel)
        contribute('main', { name: 'main', key: PANEL_VIDEO }, VideoPanel)
        contribute('main', { name: 'main', key: PANEL_PROFILE }, ProfilePanel)
        // 开屏/弹窗不挂 shell.overlay：那一格的生命周期会随主面板切换塌掉。
        contribute('conversation.chat.turnTail', { name: 'conversation.chat.turnTail', id: 'cn-turn-probe', order: 900 }, TurnProbe)
        contribute(
          'settings.section',
          { name: 'settings.section', id: 'cn-nav', order: 40, label: () => t('settingsTitle') },
          SettingsPanel
        )

        owner.effect(
          () => () => {
            while (disposers.length > 0) {
              const dispose = disposers.pop()
              try {
                if (typeof dispose === 'function') dispose()
              } catch (error) {
                console.warn('[dsh-cn-nav] dispose failed', error)
              }
            }
          },
          `${NS}: slots`
        )
      })
    }

    return { inject: [], apply }
  }
})
