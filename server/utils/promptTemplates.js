/**
 * AI 提示词模板
 * 用于 DeepSeek API 的结构化输出
 */

/**
 * JD解析提示词 - 提取JD中的关键信息
 */
const JD_PARSE_PROMPT = (rawText) => `你是一个专业的招聘JD分析专家。请分析以下岗位JD，提取关键信息并以JSON格式返回。

JD文本：
"""
${rawText}
"""

请提取以下字段，以JSON格式返回（只返回JSON，不要其他文字）：
{
  "company": "公司名称（如果无法识别则为空字符串）",
  "position": "岗位名称",
  "skills": ["技能要求列表（技术栈、工具、语言等）"],
  "experience": "经验年限要求（如"3年以上"）",
  "education": "学历要求（如"本科及以上"）",
  "requirements": ["所有关键要求的详细列表，每条一句话"],
  "responsibilities": ["岗位职责描述列表"]
}`;

/**
 * 简历解析提示词 - AI自动识别简历板块
 */
const RESUME_PARSE_PROMPT = (rawText) => `你是一个专业的简历解析专家。请分析以下简历文本，自动识别各个板块并以JSON格式返回。

简历文本：
"""
${rawText}
"""

请按以下JSON格式返回（只返回JSON，不要其他文字）：
{
  "personalInfo": {
    "name": "姓名（如果存在）",
    "phone": "电话",
    "email": "邮箱"
  },
  "education": [
    {
      "school": "学校名称",
      "major": "专业",
      "degree": "学历（本科/硕士/博士）",
      "period": "时间段（如"2019-2023"）",
      "description": "其他描述"
    }
  ],
  "experience": [
    {
      "company": "公司名称",
      "position": "岗位名称",
      "period": "时间段",
      "description": "工作内容描述"
    }
  ],
  "projects": [
    {
      "name": "项目名称",
      "role": "担任角色",
      "period": "时间段",
      "description": "项目描述"
    }
  ],
  "skills": ["技能1", "技能2"],
  "certifications": ["证书1", "语言能力"]
}

注意：
- 尽量准确地识别各个板块的边界
- 如果某板块不存在，返回空数组或空对象
- 保持原文的关键信息完整`;

/**
 * 匹配分析提示词 - 核心：JD与简历的匹配分析
 * @param {Object} jdParsed - JD解析结果
 * @param {Object} resumeParsed - 简历解析结果
 * @param {Array} supplements - 补充信息
 * @param {string} [skillSynonyms=''] - 技能同义词参考文本（可选）
 */
const MATCH_ANALYSIS_PROMPT = (jdParsed, resumeParsed, supplements, skillSynonyms = '') => {
  const supplementText = supplements && supplements.length > 0
    ? `\n补充信息（用户额外提供的经历）：\n${JSON.stringify(supplements, null, 2)}`
    : '';

  const synonymSection = skillSynonyms
    ? `\n## 技能同义词参考（用于辅助判断技能匹配，同名不同写法视为同一技能）\n${skillSynonyms}\n`
    : '';

  return `你是一个专业的简历匹配度分析专家。你需要分析一份简历与一个岗位JD的匹配程度，给出量化的评分和详细的维度分析。

## JD要求
${JSON.stringify(jdParsed, null, 2)}

## 简历内容
${JSON.stringify(resumeParsed, null, 2)}${supplementText}${synonymSection}
请从以下6个维度进行评分（0-100分），并给出详细分析：

1. **技能匹配** - 简历中的硬技能（技术栈、工具、语言）与JD要求的匹配程度
2. **经验匹配** - 工作经历、职责内容与JD要求的相似度和相关性
3. **教育匹配** - 学历、专业、学校背景是否符合JD要求
4. **项目匹配** - 项目经历与JD涉及的行业/业务领域的相关性
5. **关键词覆盖** - JD中核心关键词在简历中出现的比例
6. **成果量化度** - 简历中是否有数据支撑和量化指标

### 分析示例（参考评分标准和输出格式）：
以下是一个示例分析，帮助你理解评分尺度和输出规范：
-
JD要求（示例）：React、Vue、TypeScript、3年前端经验、本科及以上
简历技能（示例）：Vue.js、JavaScript、CSS、HTML5
简历经验（示例）：2年前端开发经验
→ 预期分析结果：
  - 技能匹配分数约 50-65：Vue 匹配（同义词），但缺 React（核心要求）、TS，基础技能JS/CSS不足以完全弥补
  - 经验匹配分数约 60-70：2年 vs 要求3年，有差距但方向对口
  - 教育匹配：视简历具体学历而定
-
JD要求（示例）：Python、MySQL、Redis、分布式系统、5年以上后端经验
简历技能（示例）：Java、Python、MySQL、Redis、Kafka、Docker
简历经验（示例）：5年后端开发，负责高并发订单系统
→ 预期分析结果：
  - 技能匹配分数约 80-90：Python/MySQL/Redis 直配，Kafka/Docker 为加分项
  - 经验匹配分数约 85-95：5年经验匹配，高并发与分布式强相关
  - 关键词覆盖分数约 85：大部分覆盖，分布式系统可通过"高并发订单系统"部分匹配
-
请按上述尺度进行评分，以JSON格式返回分析结果（只返回JSON，不要其他文字）：

{
  "overallScore": 整体匹配分数0-100,
  "overallGrade": "等级（优秀/良好/一般/待提升）",
  "summary": "一句话总结评语",

  "dimensions": [
    {
      "key": "skillMatch",
      "name": "技能匹配",
      "score": 分数,
      "detail": "详细分析说明",
      "matchedItems": [
        { "item": "匹配的技能名称", "relevance": "为什么匹配" }
      ],
      "gapItems": [
        { "item": "缺失的技能名称", "suggestion": "改进建议" }
      ]
    }
  ],

  "requirementChecklist": [
    {
      "requirement": "JD中的一条具体要求",
      "status": "matched 或 partial 或 unmatched",
      "matchedSections": [
        {
          "sectionType": "对应简历板块（experience/education/project/skill）",
          "sectionIndex": 板块索引（从0开始）,
          "label": "板块标题（如公司名/学校名）",
          "evidence": "匹配的证据原文"
        }
      ],
      "suggestion": "如果不匹配或部分匹配，给出改进建议"
    }
  ],

  "sectionAnalysis": [
    {
      "sectionType": "简历板块类型（experience/education/project/skill）",
      "sectionIndex": 板块索引（从0开始）,
      "label": "板块标题（如公司名/学校名）",
      "matchScore": 该板块的匹配度分数0-100,
      "originalText": "该板块的原文摘要",

      "jdExpectations": "JD对此板块类型的核心要求概述",
      "resumeSummary": "简历该板块的实际内容摘要",

      "comparisons": [
        {
          "item": "比对要点名称（如工作年限、技术栈、业务领域）",
          "category": "通用或垂直",
          "jdRequirement": "JD侧的具体要求",
          "resumeResponse": "简历侧的实际内容",
          "status": "matched或partial或unmatched",
          "analysis": "为什么匹配/不匹配的推理过程",

          "barrier": "行业壁垒 low/medium/high（差距项才需评估，匹配项留空）",
          "barrierReason": "壁垒原因分析",
          "learnability": "知识易学度 low/medium/high（差距项才需评估，匹配项留空）",
          "learnabilityReason": "易学度原因分析",
          "advice": "综合建议：差距是否值得弥补、如何弥补"
        }
      ],

      "通用优势": ["跨行业可迁移的优势"],
      "通用差距": ["跨行业通用的不足"],
      "垂直优势": ["该行业/领域的特有优势"],
      "垂直差距": ["该行业/领域的特有不足"],

      "suggestions": ["具体可操作的改进建议，带示例"]
    }
  ]
}

### 板块分析指南（重要）：

对简历的**每个板块**，请按以下思维链分析：

**步骤1 - 明确JD要求**：JD 对这个板块类型（experience/education/project/skill）有什么具体要求？写入 jdExpectations

**步骤2 - 概括简历事实**：用户在这个板块实际展示了什么？写入 resumeSummary

**步骤3 - 逐项比对**：将 JD 要求拆解为若干具体要点（每个板块 3-5 个要点），逐一对比：
  - 每个要点标注 category："通用"（跨行业可迁移的能力，如编程语言、项目经验）还是"垂直"（特定行业知识，如电商、金融、医疗）
  - 写清楚 JD 要求什么、简历有什么、为什么匹配/不匹配
  - **对于 unmatched 或 partial 的差距项**，额外评估：
    - barrier：进入该领域的门槛（low=低, medium=中, high=高）
    - barrierReason：为什么这个门槛高/低
    - learnability：这个知识/技能学起来多容易（low=难, medium=中, high=容易）
    - learnabilityReason：为什么容易/难学
    - advice：综合建议——这个差距值不值得追，怎么追
  - **对于 matched 的匹配项**，上述评估字段留空即可

**步骤4 - 分类优劣**：将比对结果归纳为通用优势/通用差距/垂直优势/垂直差距

**步骤5 - 具体建议**：给出可操作的建议。不要把"垂直差距"说得太可怕——通用能力可以迁移，这是求职者需要知道的

### 板块分析示例：

以下是一个板块分析的示例，供你参考格式和深度：

简历板块（示例）：{
  "label": "某科技有限公司 - 前端工程师",
  "description": "负责公司后台管理系统的前端开发，使用Vue.js + Element UI，独立完成3个模块的开发"
}
JD对该类型板块的要求：3年以上前端经验、Vue.js、电商平台经验、大型项目经验
→ 预期分析：
{
  "jdExpectations": "要求3年以上前端经验、熟悉Vue.js、有电商平台开发经验、有大型项目经验",
  "resumeSummary": "3年Vue.js开发经验，负责后台管理系统（非电商领域）",
  "comparisons": [
    { "item": "工作年限", "category": "通用", "jdRequirement": "3年以上前端经验", "resumeResponse": "3年", "status": "matched", "analysis": "年限刚好满足，且经验连续" },
    { "item": "核心技能", "category": "通用", "jdRequirement": "Vue.js", "resumeResponse": "使用Vue.js开发", "status": "matched", "analysis": "直配，且有实际项目落地" },
    { "item": "业务领域", "category": "垂直", "jdRequirement": "电商平台经验", "resumeResponse": "后台管理系统（非电商）", "status": "unmatched", "analysis": "行业跨领域，但通用前端能力可迁移", "barrier": "medium", "barrierReason": "电商业务逻辑(商品/订单/支付)与后台系统差异较大，但技术栈通用", "learnability": "high", "learnabilityReason": "前端技术栈可直接迁移，电商业务模式网上资源丰富", "advice": "值得尝试。通用能力强是核心竞争力，电商知识可边做边学" },
    { "item": "项目规模", "category": "通用", "jdRequirement": "大型项目经验", "resumeResponse": "未提及项目规模", "status": "unmatched", "analysis": "缺少量化数据，无法判断规模", "barrier": "low", "barrierReason": "只需补充数据描述，不需要学新技能", "learnability": "high", "learnabilityReason": "补充量化数据是写作技巧，学习成本极低", "advice": "最容易弥补的差距。添加用户量/数据量/团队规模等数字即可" }
  ],
  "通用优势": ["3年Vue.js开发经验", "独立完成模块开发"],
  "通用差距": ["缺少项目规模量化数据"],
  "垂直优势": [],
  "垂直差距": ["无电商领域经验"],
  "suggestions": [
    "💪 通用能力强（Vue.js/3年经验），这是核心竞争力，不要因为没做过电商就否定自己",
    "💡 补充项目规模数据：'支撑500+内部用户'或'日处理10万+请求'",
    "🎯 如果有电商相关项目接触（哪怕只是了解过支付/商品模块），建议补充在简历中"
  ]
}

### 评分标准：
- 整体分数 = 各维度加权平均
- 90+：非常匹配，简历与JD高度契合
- 75-89：良好，大部分要求满足，有少量差距
- 60-74：一般，部分要求满足，有明显提升空间
- <60：待提升，与JD要求差距较大

### 重要：
- 技能匹配时注意同义词：React=React.js=React框架，Vue=Vue.js=Vue3 等
- requirementChecklist 中的 matchedSections 要精确映射到简历的具体板块
- sectionAnalysis 中的 sectionType 和 sectionIndex 要与简历解析结果对应
- 补充信息如果有，也要纳入分析范围
- 评分要严格，不要虚高。有差距就如实反映
- 板块分析中，每个板块要给出 jdExpectations → resumeSummary → comparisons → 优劣 → suggestions 的完整思维链
- comparisons 中的 category 要准确区分：通用能力（可跨行业迁移）vs 垂直领域能力（行业特有）
- suggestions 中要鼓励用户：通用能力匹配度高就是基本盘没问题，垂直差距可以通过学习弥补`;
};

/**
 * 单板块重评估提示词 - 用户修改某段简历后，仅重新评估这一个板块
 */
const REEVALUATE_SECTION_PROMPT = (jdParsed, originalSection, revisedText) => {
  // 提取 JD 中与该板块相关的核心要求
  const jdSummary = {
    position: jdParsed.position,
    skills: jdParsed.skills,
    experience: jdParsed.experience,
    education: jdParsed.education,
    requirements: jdParsed.requirements,
  };

  return `你是一个专业的简历板块评估专家。用户修改了简历中的一个板块，请针对修改后的内容重新评估与JD的匹配度。

## JD核心要求（该岗位）
${JSON.stringify(jdSummary, null, 2)}

## 板块类型
${originalSection.sectionType}（${originalSection.sectionType === 'experience' ? '工作经历' : originalSection.sectionType === 'education' ? '教育背景' : originalSection.sectionType === 'project' ? '项目经历' : '技能'})

## 原始内容
${originalSection.originalText || originalSection.label}

## 修改后的内容
${revisedText}

## 原匹配分数
${originalSection.matchScore}

请按以下步骤评估修改后的内容：
1. 分析修改内容与JD要求的匹配变化
2. 逐项比对（与原来的 comparisons 对比）
3. 给出新的匹配分数和建议

以JSON格式返回：
{
  "matchScore": 新匹配分数0-100,
  "comparisons": [
    {
      "item": "比对要点名称",
      "category": "通用或垂直",
      "jdRequirement": "JD侧要求",
      "resumeResponse": "修改后的内容摘要",
      "status": "matched或partial或unmatched",
      "analysis": "推理过程",
      "barrier": "行业壁垒（差距项填写）",
      "barrierReason": "壁垒原因",
      "learnability": "知识易学度（差距项填写）",
      "learnabilityReason": "易学度原因",
      "advice": "综合建议"
    }
  ],
  "通用优势": ["跨行业可迁移的优势"],
  "通用差距": ["跨行业通用的不足"],
  "垂直优势": ["该行业/领域的特有优势"],
  "垂直差距": ["该行业/领域的特有不足"],
  "suggestions": ["改进建议"]
}

注意：评分要公正，修改前的分数是${originalSection.matchScore}分，如果修改确实提升了匹配度就加分，没有变化或变差就保持或减分。只返回JSON。`;
};

module.exports = {
  JD_PARSE_PROMPT,
  RESUME_PARSE_PROMPT,
  MATCH_ANALYSIS_PROMPT,
  REEVALUATE_SECTION_PROMPT,
};
