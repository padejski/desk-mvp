import { useState, useRef, useCallback, useEffect } from "react";

// ─── Constants ────────────────────────────────────────────────────────────────

const PILOT_PASSWORD = "desk2026";
const API_URL = "/api/proxy";
const MODEL = "claude-sonnet-4-20250514";

const FORMATS = [
  { id: "news_report", label: "News Report", icon: "◉", desc: "Inverted pyramid, hard news" },
  { id: "breaking", label: "Breaking", icon: "⚡", desc: "Early, partial information" },
  { id: "feature", label: "Feature", icon: "✦", desc: "Narrative, longer form" },
  { id: "explainer", label: "Explainer", icon: "◈", desc: "Background, context-heavy" },
  { id: "brief", label: "Brief", icon: "◻", desc: "100–300 words" },
  { id: "qa", label: "Q&A", icon: "◇", desc: "Interview format" },
];

const BEATS = [
  { id: "government", label: "Government & Politics" },
  { id: "crime", label: "Crime & Courts" },
  { id: "education", label: "Education" },
  { id: "business", label: "Business & Economy" },
  { id: "health", label: "Health" },
  { id: "environment", label: "Environment" },
  { id: "community", label: "Community & People" },
  { id: "sports", label: "Sports" },
  { id: "other", label: "General / Other" },
];

const SENSITIVITY = [
  { id: "standard", label: "Standard", desc: "Routine coverage. Full API processing.", color: "#2d6a2d" },
  { id: "sensitive", label: "Sensitive", desc: "Sources or subjects at risk. Reduced logging.", color: "#8b5e00" },
  { id: "confidential", label: "Confidential", desc: "Self-hosted processing only. Coming soon.", color: "#7a1a1a", disabled: true },
];

// ─── Module Definitions ───────────────────────────────────────────────────────

const MODULES = [
  {
    id: "story_editor", label: "Story Editor", order: 1, core: true,
    icon: "✦", color: "#1a3a5c",
    desc: "Structure, news judgment, sourcing gaps",
    prompt: (format, beat, sensitive) => `You are a senior story editor at a local news outlet. Evaluate this story with rigorous professional standards.
FORMAT: ${format}${beat ? ` | BEAT: ${beat}` : ""}
${sensitive ? "NOTE: Handle with care. Do not repeat sensitive source details in your output." : ""}
Apply format-appropriate standards: a Breaking story is judged differently than a Feature or Explainer. Evaluate lead, structure, news judgment, sourcing, missing angles, and narrative logic against what is appropriate for this format${beat ? ` covering ${beat}` : ""}.
Score overall quality 1-10. Traffic light: green=strong, amber=needs work, red=weak.
Return ONLY this JSON:
{
  "score": <1-10>,
  "traffic_light": "green|amber|red",
  "summary": "2 sentence assessment",
  "findings": [
    {"category": "Lead", "status": "green|amber|red", "detail": "specific observation"},
    {"category": "Structure", "status": "green|amber|red", "detail": "..."},
    {"category": "News Judgment", "status": "green|amber|red", "detail": "..."},
    {"category": "Sourcing", "status": "green|amber|red", "detail": "..."},
    {"category": "Missing Angles", "status": "green|amber|red", "detail": "..."},
    {"category": "Narrative Logic", "status": "green|amber|red", "detail": "..."}
  ],
  "recommendations": ["actionable fix", "..."],
  "inline_flags": [{"quote": "max 8 words from story", "issue": "brief issue", "suggestion": "fix"}]
}`
  },
  {
    id: "factcheck", label: "Fact-Check", order: 2, core: true,
    icon: "◎", color: "#7c1f1f",
    desc: "Claims scored 1–10 for verification urgency",
    webSearch: true,
    prompt: (format, beat, sensitive) => `You are a rigorous fact-checker at a local news outlet. Extract every checkable claim from this story.
FORMAT: ${format}${beat ? ` | BEAT: ${beat}` : ""}
${sensitive ? "Do not expose source identities. Redact names in your output where sensitive." : ""}
Urgency score 1-10: 10 = high-stakes + unverified + potentially wrong. 1 = routine low-risk claim.
For local news: pay special attention to official statistics, meeting dates, budget figures, crime stats, names and titles of officials.${beat === "Crime & Courts" ? " Crime stories: verify charges, case status, names of accused carefully." : ""}${beat === "Government & Politics" ? " Government stories: verify vote counts, budget figures, official titles, meeting dates." : ""}${beat === "Health" ? " Health stories: verify statistics, treatment claims, institutional affiliations of sources." : ""}
Return ONLY this JSON:
{
  "score": <1-10, inverse of avg urgency — high score means story is well-verified>,
  "traffic_light": "green|amber|red",
  "summary": "2 sentence overall assessment",
  "total_claims": <n>,
  "high_priority_count": <claims scoring 7-10>,
  "claims": [
    {
      "claim": "near-exact quote of claim",
      "type": "statistic|date|name|event|quote|attribution|other",
      "assessment": "verified|unverified|disputed|likely_correct|needs_verification",
      "urgency": <1-10>,
      "notes": "what is known and why this score",
      "recommendation": "specific action for human fact-checker"
    }
  ]
}`
  },
  {
    id: "copyedit", label: "Copyedit", order: 3, core: true,
    icon: "✎", color: "#1a4a2a",
    desc: "Grammar, AP style, consistency, clarity",
    prompt: (format, beat) => "You are a senior copyeditor. Review this story for all copy issues. Apply AP Style unless a house style guide has been provided.\nFORMAT: " + format + (beat ? " | BEAT: " + beat : "") + "\nFormat-specific standards: " + formatContext(format) + "\nFor local news: check proper nouns carefully. Official names of local bodies, titles, geographic names.\nReturn ONLY this JSON:\n{\n  \"score\": <1-10, 10 = clean copy>,\n  \"traffic_light\": \"green|amber|red\",\n  \"overall_grade\": \"A|B|C|D|F\",\n  \"summary\": \"2 sentence assessment\",\n  \"error_count\": <n>,\n  \"severity_breakdown\": {\"critical\": <n>, \"moderate\": <n>, \"minor\": <n>},\n  \"issues\": [\n    {\n      \"quote\": \"exact phrase with error (max 10 words)\",\n      \"type\": \"grammar|style|punctuation|consistency|clarity|other\",\n      \"severity\": \"critical|moderate|minor\",\n      \"issue\": \"what is wrong\",\n      \"fix\": \"corrected version\"\n    }\n  ],\n  \"style_notes\": [\"general observation\", \"...\"]\n}"
  },
  {
    id: "legal", label: "Legal Review", order: 4, core: true,
    icon: "⚖", color: "#3d2a00",
    desc: "Defamation, source protection, publication risk",
    prompt: (format, beat, sensitive) => "You are a media law consultant reviewing a story for legal risk. This is a checklist, NOT legal counsel.\nFORMAT: " + format + (beat ? " | BEAT: " + beat : "") + (sensitive ? "\nIMPORTANT: Story marked sensitive. Apply heightened scrutiny to source protection and private individual exposure." : "") + "\nBeat-specific legal risks: " + beatLegalContext(beat) + "\nReturn ONLY this JSON:\n{\n  \"score\": <1-10, 10 = low legal risk>,\n  \"traffic_light\": \"green|amber|red\",\n  \"overall_risk\": \"low|medium|high|critical\",\n  \"summary\": \"2 sentence assessment\",\n  \"disclaimer\": \"Automated checklist only. Consult qualified media law counsel before publishing flagged items.\",\n  \"flags\": [\n    {\n      \"category\": \"Defamation|Privacy|Source Protection|Copyright|Other\",\n      \"risk_level\": \"low|medium|high|critical\",\n      \"quote\": \"relevant phrase if applicable\",\n      \"concern\": \"specific legal concern\",\n      \"recommendation\": \"editorial action to mitigate\"\n    }\n  ]\n}"
  },
  {
    id: "distribution", label: "Distribution", order: 5, core: true,
    icon: "◈", color: "#2a1a4a",
    desc: "Headlines, format, platform, timing",
    prompt: (format, beat) => "You are a digital editor advising a local news outlet on packaging and distribution.\nFORMAT: " + format + (beat ? " | BEAT: " + beat : "") + "\nFormat-specific packaging: " + formatDistContext(format) + "\nFor local news: think Facebook, community newsletters, NextDoor, local radio partnerships, print edition. Local audiences respond to personal stakes and community impact angles.\nReturn ONLY this JSON:\n{\n  \"score\": <1-10>,\n  \"traffic_light\": \"green|amber|red\",\n  \"summary\": \"2 sentence packaging recommendation\",\n  \"headlines\": [\n    {\"type\": \"direct\", \"text\": \"headline\", \"rationale\": \"why\"},\n    {\"type\": \"community_angle\", \"text\": \"headline\", \"rationale\": \"why\"},\n    {\"type\": \"seo\", \"text\": \"headline\", \"rationale\": \"why\"}\n  ],\n  \"recommended_format\": \"format name\",\n  \"format_rationale\": \"why\",\n  \"platforms\": [\n    {\"platform\": \"name\", \"priority\": \"primary|secondary\", \"approach\": \"how to present\"}\n  ],\n  \"timing\": {\"recommendation\": \"when\", \"rationale\": \"why\"},\n  \"social_hooks\": [\"hook\", \"...\"]\n}"
  },
  {
    id: "ethical", label: "Ethics", order: 6, core: false,
    icon: "◇", color: "#1a3a3a",
    desc: "Harm, privacy, trauma language, proportionality",
    prompt: (format, beat, sensitive) => "You are an ethics editor reviewing a story against SPJ Code of Ethics standards.\nFORMAT: " + format + (beat ? " | BEAT: " + beat : "") + (sensitive ? "\nIMPORTANT: Story marked sensitive. Apply maximum scrutiny to vulnerable subject protection." : "") + "\nBeat-specific ethics concerns: " + beatEthicsContext(beat) + "\nReturn ONLY this JSON:\n{\n  \"score\": <1-10, 10 = ethically sound>,\n  \"traffic_light\": \"green|amber|red\",\n  \"overall_rating\": \"passes|caution|concerns|do_not_publish\",\n  \"summary\": \"2 sentence assessment\",\n  \"flags\": [\n    {\n      \"principle\": \"Minimize Harm|Seek Truth|Act Independently|Be Accountable\",\n      \"severity\": \"low|medium|high\",\n      \"issue\": \"specific concern\",\n      \"quote\": \"relevant phrase if applicable\",\n      \"recommendation\": \"editorial action\"\n    }\n  ],\n  \"strengths\": [\"ethical strength\", \"...\"],\n  \"questions_for_reporter\": [\"question editor should ask reporter\", \"...\"]\n}"
  },
  {
    id: "source_diversity", label: "Source Diversity", order: 7, core: false,
    icon: "◉", color: "#3a1a3a",
    desc: "Source count, balance, missing perspectives",
    prompt: (format, beat) => "You are a diversity editor reviewing sourcing in this story for a local news outlet.\nFORMAT: " + format + (beat ? " | BEAT: " + beat : "") + "\nBeat-specific sourcing expectations: " + beatSourceContext(beat) + "\nReturn ONLY this JSON:\n{\n  \"score\": <1-10, 10 = excellent diversity>,\n  \"traffic_light\": \"green|amber|red\",\n  \"summary\": \"2 sentence assessment\",\n  \"source_count\": {\"named\": <n>, \"unnamed\": <n>, \"total\": <n>},\n  \"sources\": [\n    {\"name\": \"name or unnamed official\", \"affiliation\": \"role/org\", \"type\": \"official|expert|affected|community|other\"}\n  ],\n  \"missing_perspectives\": [\"perspective absent from story\", \"...\"],\n  \"over_represented\": \"any group dominating sourcing\",\n  \"recommendations\": [\"specific sourcing recommendation\", \"...\"]\n}"
  },
  {
    id: "accessibility", label: "Accessibility", order: 8, core: false,
    icon: "◫", color: "#1a2a4a",
    desc: "Reading level, clarity, inclusive language",
    prompt: (format, beat) => "You are an accessibility editor reviewing this story.\nFORMAT: " + format + (beat ? " | BEAT: " + beat : "") + "\nFormat and beat context: " + beatAccessContext(beat) + "\nReturn ONLY this JSON:\n{\n  \"score\": <1-10, 10 = highly accessible>,\n  \"traffic_light\": \"green|amber|red\",\n  \"overall_grade\": \"A|B|C|D|F\",\n  \"summary\": \"2 sentence assessment\",\n  \"reading_level\": {\"grade\": <estimated number>, \"label\": \"e.g. 10th grade\"},\n  \"avg_sentence_length\": <estimated words>,\n  \"issues\": [\n    {\n      \"type\": \"jargon|complexity|structure|inclusive_language|other\",\n      \"severity\": \"minor|moderate|significant\",\n      \"detail\": \"specific issue\",\n      \"quote\": \"relevant phrase if applicable\",\n      \"fix\": \"recommendation\"\n    }\n  ],\n  \"structural_recommendations\": [\"recommendation\", \"...\"]\n}"
  },
  {
    id: "prior_coverage", label: "Prior Coverage", order: 9, core: false,
    icon: "◑", color: "#2a2a1a",
    desc: "What's new, prior context, redundancy check",
    webSearch: true,
    prompt: (format, beat) => "You are a research editor checking whether this story covers new ground.\nFORMAT: " + format + (beat ? " | BEAT: " + beat : "") + "\n" + formatPriorContext(format) + "\nFor local news: note what background context a local reader would need, especially on ongoing stories like trials or budget processes.\nReturn ONLY this JSON:\n{\n  \"score\": <1-10, 10 = highly original or appropriately framed follow-up>,\n  \"traffic_light\": \"green|amber|red\",\n  \"summary\": \"2 sentence assessment\",\n  \"originality_score\": <1-10>,\n  \"new_elements\": [\"what appears genuinely new\", \"...\"],\n  \"likely_prior_coverage\": [{\"description\": \"type of prior coverage\", \"relevance\": \"why it matters\"}],\n  \"suggested_references\": [\"context the story should reference\", \"...\"],\n  \"recommendations\": [\"editorial recommendation\", \"...\"]\n}"
  },
  {
    id: "seo", label: "SEO & Metadata", order: 10, core: false,
    icon: "◬", color: "#1a3a2a",
    desc: "Slug, meta description, keywords",
    prompt: (format, beat) => "You are an SEO editor optimizing this story for a local news outlet.\nFORMAT: " + format + (beat ? " | BEAT: " + beat : "") + "\n" + formatSEOContext(format) + "\nFor local news: always include geographic keywords. Local search intent is hyper-specific.\nReturn ONLY this JSON:\n{\n  \"score\": <1-10>,\n  \"traffic_light\": \"green|amber|red\",\n  \"summary\": \"2 sentence SEO assessment\",\n  \"slug\": \"url-slug-here\",\n  \"meta_description\": \"150-160 char description\",\n  \"keywords\": {\"primary\": \"main keyword\", \"secondary\": [\"kw\", \"kw\", \"kw\"]},\n  \"search_headlines\": [\n    {\"text\": \"headline\", \"character_count\": <n>, \"notes\": \"why it works\"}\n  ],\n  \"optimization_score\": <1-10>\n}"
  }
];

// ─── Format/Beat Context Helpers (kept out of template literals to avoid JSON issues) ──

function formatContext(formatLabel) {
  const map = {
    "Breaking": "Breaking copy is expected to be rough. Flag critical errors only; note style issues as minor.",
    "Feature": "Feature copy: evaluate voice consistency, paragraph rhythm, and scene-setting clarity beyond pure AP compliance.",
    "Explainer": "Explainer copy: flag jargon that needs definition. Check technical terms are explained on first use.",
    "Q&A": "Q&A copy: check question phrasing for clarity and consistent speaker attribution.",
    "Brief": "Brief copy: every word counts. Flag wordiness aggressively.",
    "News Report": "Hard news copy: strict AP Style, tight sentences, active voice in leads.",
  };
  return map[formatLabel] || "Apply standard AP Style news copy standards.";
}

function formatDistContext(formatLabel) {
  const map = {
    "Breaking": "Breaking news: push notification copy first. Headline must be direct and factual. Update structure.",
    "Feature": "Feature: newsletter lead, longer social preview. Consider photo essay or audio companion.",
    "Explainer": "Explainer: evergreen placement, FAQ format for social, good for pinned content or resource pages.",
    "Brief": "Brief: aggregated roundup placement, newsletter filler, quick social post.",
    "Q&A": "Q&A: pullquote social cards, podcast clip if audio available.",
    "News Report": "Hard news: homepage lead, breaking push if it warrants it, direct headline.",
  };
  return map[formatLabel] || "Standard news distribution approach.";
}

function formatSEOContext(formatLabel) {
  const map = {
    "Breaking": "Breaking SEO: prioritize speed. Use direct keywords. Slug can be updated as story develops.",
    "Explainer": "Explainer SEO: target question-based queries such as What is, How does, Why did. Use evergreen slug.",
    "Feature": "Feature SEO: target longer-tail keywords. Headline can be evocative but needs primary keyword.",
    "Brief": "Brief SEO: keep slug short and direct. One primary keyword.",
    "Q&A": "Q&A SEO: include the interviewee name and topic as keywords.",
    "News Report": "News report SEO: primary keyword in first three words of headline and slug.",
  };
  return map[formatLabel] || "Standard news SEO approach.";
}

function formatPriorContext(formatLabel) {
  const map = {
    "Breaking": "Breaking stories are inherently new. Focus on whether the story needs prior context for readers.",
    "Explainer": "Explainers are often evergreen. Flag if this topic has been well covered and the story needs a clearer new-angle justification.",
  };
  return map[formatLabel] || "Check if this is a follow-up that needs to reference prior reporting.";
}

function beatLegalContext(beatLabel) {
  const map = {
    "Crime & Courts": "Crime stories: verify all charges are accurately described. Avoid implying guilt before conviction. Check fair report privilege for court documents. Named suspects who are private individuals carry high defamation risk.",
    "Government & Politics": "Government stories: officials are public figures with a lower defamation threshold. Watch for private conduct claims. Check fair comment privilege on public proceedings.",
    "Health": "Health stories: medical claims can cause harm. Check for false statements about treatments. Privacy risk if patient identities are disclosed.",
    "Business & Economy": "Business stories: financial claims can damage reputations. Check defamation risk on misconduct allegations.",
  };
  return map[beatLabel] || "For local news: heightened attention to private individuals, small business owners, local officials with limited public role.";
}

function beatEthicsContext(beatLabel) {
  const map = {
    "Crime & Courts": "Crime stories carry high ethics risk: naming victims, identifying juveniles, presumption of innocence, re-traumatization of survivors.",
    "Health": "Health stories: patient privacy, stigmatizing language around illness or mental health, balance of expert sources.",
    "Community & People": "Community stories: consent of private subjects, dignity of people in difficult circumstances, avoiding poverty porn.",
  };
  return map[beatLabel] || "Extra weight on private individuals who did not seek public attention. Proportionality of coverage to newsworthiness.";
}

function beatSourceContext(beatLabel) {
  const map = {
    "Government & Politics": "Government stories chronically over-index on officials. Flag if all sources are officials with no affected residents or independent experts.",
    "Crime & Courts": "Crime stories: check for balance between law enforcement and community or defendant perspective. Victims deserve voice.",
    "Business & Economy": "Business stories: check for worker voices alongside management and owner voices.",
    "Education": "Education stories: check for student and parent voices alongside administrator voices.",
  };
  return map[beatLabel] || "Flag over-reliance on official sources. Check for community voices, affected residents, underrepresented groups.";
}

function beatAccessContext(beatLabel) {
  const map = {
    "Crime & Courts": "Courts beat: legal terminology such as arraignment, indictment, plea must be explained on first use.",
    "Government & Politics": "Government beat: procedural terms such as ordinance, resolution, zoning variance must be explained.",
    "Health": "Health beat: medical terminology must be accessible. Avoid stigmatizing language.",
  };
  return map[beatLabel] || "Local audiences span all education levels. Aim for grade 8-10.";
}

function beatFactContext(beatLabel) {
  const map = {
    "Crime & Courts": "Crime stories: verify charges, case status, names of accused carefully. Check court record accuracy.",
    "Government & Politics": "Government stories: verify vote counts, budget figures, official titles, meeting dates.",
    "Health": "Health stories: verify statistics, treatment claims, institutional affiliations of sources.",
    "Business & Economy": "Business stories: verify financial figures, company names, executive titles.",
  };
  return map[beatLabel] || "Pay special attention to official statistics, meeting dates, budget figures, names and titles.";
}

// ─── API Caller ───────────────────────────────────────────────────────────────

async function callModule(mod, story, format, beat, sensitivity, adminDocs, signal) {
  const formatLabel = FORMATS.find(f => f.id === format)?.label || format;
  const beatLabel = beat ? (BEATS.find(b => b.id === beat)?.label || beat) : null;
  const isSensitive = sensitivity === "sensitive";
  const sensitiveNote = isSensitive ? "\nSENSITIVE STORY: Minimize identifying details in output. Do not repeat source names unnecessarily." : "";
  const docsNote = adminDocs ? "\nNEWSROOM REFERENCE DOCS:\n" + adminDocs.slice(0, 1200) : "";

  const body = {
    model: MODEL,
    max_tokens: 1000,
    system: mod.prompt(formatLabel, beatLabel, isSensitive) + sensitiveNote + docsNote,
    messages: [{ role: "user", content: "FORMAT: " + formatLabel + (beatLabel ? " | BEAT: " + beatLabel : "") + "\n\nSTORY TEXT:\n" + story }]
  };

  if (mod.webSearch) {
    body.tools = [{ type: "web_search_20250305", name: "web_search" }];
  }

  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal
  });

  if (!res.ok) throw new Error(`API ${res.status}`);
  const data = await res.json();
  const text = data.content.filter(b => b.type === "text").map(b => b.text).join("");
  const clean = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  try { return JSON.parse(clean); }
  catch {
    const m = clean.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error("JSON parse failed");
  }
}

// ─── Micro Components ─────────────────────────────────────────────────────────

const TL = ({ status, size = 12 }) => {
  const c = status === "green" ? "#2d6a2d" : status === "amber" ? "#b56a00" : status === "red" ? "#b52020" : "#aaa";
  return <span style={{ display: "inline-block", width: size, height: size, borderRadius: "50%", background: c, flexShrink: 0 }} />;
};

const Score = ({ score, color, size = 40 }) => {
  const r = size * 0.4, cx = size / 2, cy = size / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 10) * circ;
  const sc = score >= 7 ? "#2d6a2d" : score >= 4 ? "#b56a00" : "#b52020";
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e8e4dc" strokeWidth={size * 0.1} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color || sc} strokeWidth={size * 0.1}
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round" transform={`rotate(-90 ${cx} ${cy})`} />
      <text x={cx} y={cy + size * 0.13} textAnchor="middle"
        fontSize={size * 0.28} fontWeight="700" fill={color || sc} fontFamily="'Courier New', monospace">{score}</text>
    </svg>
  );
};

const Pill = ({ label, color, bg }) => (
  <span style={{
    padding: "2px 8px", borderRadius: 3, fontSize: 10, fontWeight: 700,
    textTransform: "uppercase", letterSpacing: 0.8, fontFamily: "'Courier New', monospace",
    background: bg || "#f0ede5", color: color || "#555"
  }}>{label}</span>
);

const urgencyColor = (u) => u >= 8 ? "#b52020" : u >= 5 ? "#b56a00" : "#2d6a2d";

// ─── Module Result Renderers ──────────────────────────────────────────────────

function StoryEditorResult({ r, mod }) {
  return (
    <div>
      <p style={S.summary}>{r.summary}</p>
      <div style={{ display: "grid", gap: 6, marginBottom: 18 }}>
        {(r.findings || []).map((f, i) => (
          <div key={i} style={{ ...S.findingRow, borderLeftColor: f.status === "green" ? "#2d6a2d" : f.status === "amber" ? "#b56a00" : "#b52020" }}>
            <span style={{ minWidth: 110, fontWeight: 700, fontSize: 11, color: mod.color, textTransform: "uppercase", letterSpacing: 0.5 }}>{f.category}</span>
            <TL status={f.status} />
            <span style={{ fontSize: 13, color: "#333", flex: 1 }}>{f.detail}</span>
          </div>
        ))}
      </div>
      {r.recommendations?.length > 0 && <RecList items={r.recommendations} color={mod.color} />}
    </div>
  );
}

function FactCheckResult({ r }) {
  return (
    <div>
      <div style={{ display: "flex", gap: 16, marginBottom: 18, flexWrap: "wrap" }}>
        {[["Claims", r.total_claims, "#555"], ["High Priority", r.high_priority_count, "#b52020"]].map(([l, v, c]) => (
          <div key={l} style={{ ...S.statBox, borderColor: c + "33" }}>
            <div style={{ fontSize: 26, fontWeight: 700, color: c, fontFamily: "'Courier New', monospace" }}>{v || 0}</div>
            <div style={{ fontSize: 10, color: "#888", textTransform: "uppercase", letterSpacing: 0.8 }}>{l}</div>
          </div>
        ))}
        <p style={{ ...S.summary, flex: 1, alignSelf: "center", margin: 0 }}>{r.summary}</p>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr>{["Urgency", "Claim", "Status", "Notes & Action"].map(h => (
              <th key={h} style={{ textAlign: "left", padding: "6px 10px", color: "#888", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, borderBottom: "1px solid #e8e4dc" }}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {(r.claims || []).map((c, i) => (
              <tr key={i} style={{ borderBottom: "1px solid #f5f2ec", background: i % 2 === 0 ? "#fff" : "#faf9f6" }}>
                <td style={{ padding: "9px 10px", verticalAlign: "top" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: urgencyColor(c.urgency), flexShrink: 0, display: "inline-block" }} />
                    <span style={{ fontWeight: 700, color: urgencyColor(c.urgency), fontFamily: "'Courier New', monospace", fontSize: 13 }}>{c.urgency}/10</span>
                  </span>
                </td>
                <td style={{ padding: "9px 10px", verticalAlign: "top", maxWidth: 180 }}>
                  <span style={{ fontStyle: "italic", color: "#444", fontSize: 12, lineHeight: 1.4 }}>"{c.claim}"</span>
                </td>
                <td style={{ padding: "9px 10px", verticalAlign: "top" }}>
                  <Pill label={c.assessment?.replace(/_/g, " ")} color={c.assessment === "verified" || c.assessment === "likely_correct" ? "#2d6a2d" : c.assessment === "disputed" || c.assessment === "unverified" ? "#b52020" : "#b56a00"} bg={c.assessment === "verified" || c.assessment === "likely_correct" ? "#e8f5e8" : c.assessment === "disputed" || c.assessment === "unverified" ? "#fce8e8" : "#fff5e0"} />
                </td>
                <td style={{ padding: "9px 10px", verticalAlign: "top", fontSize: 12, color: "#555", maxWidth: 200 }}>
                  <div style={{ marginBottom: 3 }}>{c.notes}</div>
                  {c.recommendation && <div style={{ color: "#2d6a2d", fontStyle: "italic" }}>→ {c.recommendation}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CopyeditResult({ r, mod }) {
  return (
    <div>
      <div style={{ display: "flex", gap: 14, marginBottom: 18, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ ...S.statBox }}><div style={{ fontSize: 24, fontWeight: 700, color: mod.color, fontFamily: "'Courier New', monospace" }}>{r.overall_grade}</div><div style={S.statLabel}>Grade</div></div>
        {["critical", "moderate", "minor"].map(s => (
          <div key={s} style={{ ...S.statBox, borderColor: s === "critical" ? "#b5202033" : s === "moderate" ? "#b56a0033" : "#55555533" }}>
            <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "'Courier New', monospace", color: s === "critical" ? "#b52020" : s === "moderate" ? "#b56a00" : "#555" }}>{r.severity_breakdown?.[s] || 0}</div>
            <div style={S.statLabel}>{s}</div>
          </div>
        ))}
        <p style={{ ...S.summary, flex: 1, margin: 0 }}>{r.summary}</p>
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {(r.issues || []).map((iss, i) => (
          <div key={i} style={{ padding: "11px 14px", background: "#faf9f6", borderRadius: 4, borderLeft: `3px solid ${iss.severity === "critical" ? "#b52020" : iss.severity === "moderate" ? "#b56a00" : "#bbb"}` }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 5, alignItems: "center" }}>
              <Pill label={iss.severity} color={iss.severity === "critical" ? "#b52020" : iss.severity === "moderate" ? "#b56a00" : "#555"} bg={iss.severity === "critical" ? "#fce8e8" : iss.severity === "moderate" ? "#fff5e0" : "#f0ede5"} />
              <span style={{ fontSize: 10, color: "#888", textTransform: "uppercase", letterSpacing: 0.8 }}>{iss.type}</span>
            </div>
            <div style={{ fontSize: 12, fontStyle: "italic", color: "#666", marginBottom: 3 }}>"{iss.quote}"</div>
            <div style={{ fontSize: 12, color: "#b52020", marginBottom: 2 }}>{iss.issue}</div>
            <div style={{ fontSize: 12, color: "#2d6a2d" }}>→ {iss.fix}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LegalResult({ r }) {
  const riskColor = (l) => l === "critical" ? "#7a1a1a" : l === "high" ? "#b52020" : l === "medium" ? "#b56a00" : "#2d6a2d";
  return (
    <div>
      <div style={{ padding: "10px 14px", background: "#fff8e8", border: "1px solid #e8c870", borderRadius: 4, fontSize: 12, color: "#7a5000", marginBottom: 16, fontStyle: "italic" }}>⚠ {r.disclaimer}</div>
      <div style={{ display: "flex", gap: 14, marginBottom: 18, alignItems: "center" }}>
        <div style={{ ...S.statBox, borderColor: riskColor(r.overall_risk) + "44" }}>
          <div style={{ fontSize: 12, color: "#888", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>Risk</div>
          <Pill label={r.overall_risk} color={riskColor(r.overall_risk)} bg={r.overall_risk === "low" ? "#e8f5e8" : r.overall_risk === "medium" ? "#fff5e0" : "#fce8e8"} />
        </div>
        <p style={{ ...S.summary, flex: 1, margin: 0 }}>{r.summary}</p>
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        {(r.flags || []).map((f, i) => (
          <div key={i} style={{ padding: "12px 14px", background: "#faf9f6", borderRadius: 4, borderLeft: `3px solid ${riskColor(f.risk_level)}` }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "center" }}>
              <span style={{ fontWeight: 700, fontSize: 12, color: "#3d2a00" }}>{f.category}</span>
              <Pill label={f.risk_level} color={riskColor(f.risk_level)} bg={f.risk_level === "low" ? "#e8f5e8" : f.risk_level === "medium" ? "#fff5e0" : "#fce8e8"} />
            </div>
            {f.quote && <div style={{ fontSize: 12, fontStyle: "italic", color: "#666", marginBottom: 5 }}>"{f.quote}"</div>}
            <div style={{ fontSize: 13, color: "#333", marginBottom: 4 }}>{f.concern}</div>
            <div style={{ fontSize: 12, color: "#2d6a2d" }}>→ {f.recommendation}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DistributionResult({ r, mod }) {
  return (
    <div>
      <p style={S.summary}>{r.summary}</p>
      <div style={{ marginBottom: 18 }}>
        <SectionLabel>Headline Variants</SectionLabel>
        {(r.headlines || []).map((h, i) => (
          <div key={i} style={{ padding: "10px 12px", background: "#faf9f6", borderRadius: 4, marginBottom: 6, borderLeft: `3px solid ${mod.color}` }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, color: mod.color, marginBottom: 3 }}>{h.type?.replace(/_/g, " ")}</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#111", marginBottom: 3, fontFamily: "'Playfair Display', Georgia, serif" }}>{h.text}</div>
            <div style={{ fontSize: 11, color: "#777" }}>{h.rationale}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <SectionLabel>Platforms</SectionLabel>
          {(r.platforms || []).map((p, i) => (
            <div key={i} style={{ padding: "9px 11px", background: "#faf9f6", borderRadius: 4, marginBottom: 6 }}>
              <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 3 }}>
                <span style={{ fontWeight: 700, fontSize: 12 }}>{p.platform}</span>
                <Pill label={p.priority} color={p.priority === "primary" ? mod.color : "#888"} />
              </div>
              <div style={{ fontSize: 11, color: "#666" }}>{p.approach}</div>
            </div>
          ))}
        </div>
        <div>
          <SectionLabel>Social Hooks</SectionLabel>
          {(r.social_hooks || []).map((h, i) => (
            <div key={i} style={{ padding: "9px 11px", background: "#faf9f6", borderRadius: 4, marginBottom: 6, fontSize: 12, color: "#333", borderLeft: `2px solid ${mod.color}` }}>{h}</div>
          ))}
        </div>
      </div>
      {r.timing && (
        <div style={{ marginTop: 14, padding: "10px 12px", background: "#faf9f6", borderRadius: 4, fontSize: 13 }}>
          <span style={{ fontWeight: 700, color: mod.color }}>Timing: </span>{r.timing.recommendation} — {r.timing.rationale}
        </div>
      )}
    </div>
  );
}

function EthicsResult({ r, mod }) {
  const sc = (s) => s === "high" ? "#b52020" : s === "medium" ? "#b56a00" : "#2d6a2d";
  const ratingColor = r.overall_rating === "passes" ? "#2d6a2d" : r.overall_rating === "caution" ? "#b56a00" : "#b52020";
  return (
    <div>
      <div style={{ display: "flex", gap: 14, marginBottom: 18, alignItems: "center" }}>
        <Pill label={r.overall_rating?.replace(/_/g, " ")} color={ratingColor} bg={r.overall_rating === "passes" ? "#e8f5e8" : r.overall_rating === "caution" ? "#fff5e0" : "#fce8e8"} />
        <p style={{ ...S.summary, flex: 1, margin: 0 }}>{r.summary}</p>
      </div>
      {(r.flags || []).map((f, i) => (
        <div key={i} style={{ padding: "11px 13px", background: "#faf9f6", borderRadius: 4, marginBottom: 8, borderLeft: `3px solid ${sc(f.severity)}` }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 5 }}>
            <span style={{ fontWeight: 700, fontSize: 11, color: mod.color, textTransform: "uppercase" }}>{f.principle}</span>
            <Pill label={f.severity} color={sc(f.severity)} bg={f.severity === "high" ? "#fce8e8" : f.severity === "medium" ? "#fff5e0" : "#f0ede5"} />
          </div>
          <div style={{ fontSize: 13, color: "#333", marginBottom: 4 }}>{f.issue}</div>
          {f.quote && <div style={{ fontSize: 11, fontStyle: "italic", color: "#666", marginBottom: 4 }}>"{f.quote}"</div>}
          <div style={{ fontSize: 12, color: "#2d6a2d" }}>→ {f.recommendation}</div>
        </div>
      ))}
      {r.questions_for_reporter?.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <SectionLabel>Questions for the Reporter</SectionLabel>
          {r.questions_for_reporter.map((q, i) => (
            <div key={i} style={{ fontSize: 13, color: "#333", padding: "6px 0", borderBottom: "1px solid #f0ede5" }}>? {q}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function SourceDiversityResult({ r, mod }) {
  return (
    <div>
      <div style={{ display: "flex", gap: 14, marginBottom: 18, flexWrap: "wrap", alignItems: "center" }}>
        {["named", "unnamed", "total"].map(k => (
          <div key={k} style={S.statBox}>
            <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "'Courier New', monospace", color: mod.color }}>{r.source_count?.[k] || 0}</div>
            <div style={S.statLabel}>{k}</div>
          </div>
        ))}
        <p style={{ ...S.summary, flex: 1, margin: 0 }}>{r.summary}</p>
      </div>
      {r.missing_perspectives?.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <SectionLabel>Missing Perspectives</SectionLabel>
          {r.missing_perspectives.map((p, i) => (
            <div key={i} style={{ fontSize: 13, color: "#b52020", padding: "5px 0", borderBottom: "1px solid #fce8e8" }}>✗ {p}</div>
          ))}
        </div>
      )}
      {r.over_represented && (
        <div style={{ padding: "9px 12px", background: "#fff5e0", borderRadius: 4, fontSize: 13, marginBottom: 12, color: "#7a4000" }}>
          ⚠ Over-represented: {r.over_represented}
        </div>
      )}
      <RecList items={r.recommendations} color={mod.color} />
    </div>
  );
}

function AccessibilityResult({ r, mod }) {
  return (
    <div>
      <div style={{ display: "flex", gap: 14, marginBottom: 18, flexWrap: "wrap", alignItems: "center" }}>
        <div style={S.statBox}><div style={{ fontSize: 24, fontWeight: 700, color: mod.color, fontFamily: "'Courier New', monospace" }}>{r.overall_grade}</div><div style={S.statLabel}>Grade</div></div>
        <div style={S.statBox}><div style={{ fontSize: 18, fontWeight: 700, color: mod.color, fontFamily: "'Courier New', monospace" }}>{r.reading_level?.grade || "?"}</div><div style={S.statLabel}>Grade Level</div></div>
        <div style={S.statBox}><div style={{ fontSize: 18, fontWeight: 700, color: mod.color, fontFamily: "'Courier New', monospace" }}>{r.avg_sentence_length || "?"}</div><div style={S.statLabel}>Avg Words/Sentence</div></div>
        <p style={{ ...S.summary, flex: 1, margin: 0 }}>{r.summary}</p>
      </div>
      {(r.issues || []).map((iss, i) => (
        <div key={i} style={{ padding: "11px 13px", background: "#faf9f6", borderRadius: 4, marginBottom: 8, borderLeft: `3px solid ${iss.severity === "significant" ? "#b52020" : iss.severity === "moderate" ? "#b56a00" : "#bbb"}` }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 5 }}>
            <Pill label={iss.severity} />
            <span style={{ fontSize: 10, color: "#888", textTransform: "uppercase" }}>{iss.type}</span>
          </div>
          <div style={{ fontSize: 13, color: "#333", marginBottom: 3 }}>{iss.detail}</div>
          {iss.fix && <div style={{ fontSize: 12, color: "#2d6a2d" }}>→ {iss.fix}</div>}
        </div>
      ))}
    </div>
  );
}

function PriorCoverageResult({ r, mod }) {
  return (
    <div>
      <p style={S.summary}>{r.summary}</p>
      {r.new_elements?.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <SectionLabel>What's New in This Story</SectionLabel>
          {r.new_elements.map((e, i) => (
            <div key={i} style={{ fontSize: 13, color: "#2d6a2d", padding: "5px 0", borderBottom: "1px solid #e8f5e8" }}>✓ {e}</div>
          ))}
        </div>
      )}
      {r.likely_prior_coverage?.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <SectionLabel>Likely Prior Coverage</SectionLabel>
          {r.likely_prior_coverage.map((p, i) => (
            <div key={i} style={{ padding: "9px 11px", background: "#faf9f6", borderRadius: 4, marginBottom: 6 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#333", marginBottom: 2 }}>{p.description}</div>
              <div style={{ fontSize: 11, color: "#777" }}>{p.relevance}</div>
            </div>
          ))}
        </div>
      )}
      <RecList items={r.suggested_references} color={mod.color} label="Suggested References" />
    </div>
  );
}

function SEOResult({ r, mod }) {
  return (
    <div>
      <p style={S.summary}>{r.summary}</p>
      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ padding: "11px 13px", background: "#faf9f6", borderRadius: 4 }}>
          <SectionLabel>URL Slug</SectionLabel>
          <code style={{ fontSize: 13, color: mod.color, fontFamily: "'Courier New', monospace" }}>/{r.slug}</code>
        </div>
        <div style={{ padding: "11px 13px", background: "#faf9f6", borderRadius: 4 }}>
          <SectionLabel>Meta Description <span style={{ color: r.meta_description?.length > 160 ? "#b52020" : "#2d6a2d" }}>({r.meta_description?.length || 0} chars)</span></SectionLabel>
          <div style={{ fontSize: 13, color: "#333" }}>{r.meta_description}</div>
        </div>
        <div style={{ padding: "11px 13px", background: "#faf9f6", borderRadius: 4 }}>
          <SectionLabel>Keywords</SectionLabel>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <span style={{ padding: "3px 10px", background: mod.color, color: "#fff", borderRadius: 3, fontSize: 11, fontWeight: 700 }}>{r.keywords?.primary}</span>
            {(r.keywords?.secondary || []).map((k, i) => (
              <span key={i} style={{ padding: "3px 10px", background: "#e8e4dc", color: "#444", borderRadius: 3, fontSize: 11 }}>{k}</span>
            ))}
          </div>
        </div>
        {(r.search_headlines || []).map((h, i) => (
          <div key={i} style={{ padding: "11px 13px", background: "#faf9f6", borderRadius: 4, borderLeft: `3px solid ${mod.color}` }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#111", marginBottom: 3, fontFamily: "'Playfair Display', Georgia, serif" }}>{h.text}</div>
            <div style={{ fontSize: 11, color: "#777" }}>{h.character_count} chars — {h.notes}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Shared Micro UI ──────────────────────────────────────────────────────────

const SectionLabel = ({ children }) => (
  <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2, color: "#999", marginBottom: 8 }}>{children}</div>
);

const RecList = ({ items, color, label = "Recommendations" }) => {
  if (!items?.length) return null;
  return (
    <div>
      <SectionLabel>{label}</SectionLabel>
      {items.map((r, i) => (
        <div key={i} style={{ fontSize: 13, color: "#333", padding: "6px 0", borderBottom: "1px solid #f0ede5", display: "flex", gap: 8 }}>
          <span style={{ color, fontWeight: 700, flexShrink: 0 }}>→</span>{r}
        </div>
      ))}
    </div>
  );
};

// ─── Shared Styles ────────────────────────────────────────────────────────────

const S = {
  summary: { fontSize: 14, color: "#333", lineHeight: 1.65, margin: "0 0 16px", fontFamily: "'Playfair Display', Georgia, serif" },
  findingRow: { display: "flex", alignItems: "flex-start", gap: 10, padding: "9px 12px", background: "#faf9f6", borderRadius: 4, borderLeft: "3px solid #ccc" },
  statBox: { padding: "10px 16px", background: "#faf9f6", borderRadius: 4, textAlign: "center", border: "1px solid #e8e4dc" },
  statLabel: { fontSize: 10, color: "#888", textTransform: "uppercase", letterSpacing: 0.8, marginTop: 2 },
};

const RENDERERS = {
  story_editor: StoryEditorResult,
  factcheck: FactCheckResult,
  copyedit: CopyeditResult,
  legal: LegalResult,
  distribution: DistributionResult,
  ethical: EthicsResult,
  source_diversity: SourceDiversityResult,
  accessibility: AccessibilityResult,
  prior_coverage: PriorCoverageResult,
  seo: SEOResult,
};

// ─── Executive Summary ────────────────────────────────────────────────────────

function ExecSummary({ results, moduleStatus, onSelectTab }) {
  const done = MODULES.filter(m => results[m.id]);
  if (!done.length) return null;

  const allScores = done.map(m => results[m.id]?.score).filter(Boolean);
  const overallScore = allScores.length ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length) : null;
  const overallTL = overallScore >= 7 ? "green" : overallScore >= 4 ? "amber" : "red";

  return (
    <div style={{ background: "#0f1f0f", borderRadius: 6, padding: "24px 28px", marginBottom: 24, color: "#fff" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 2, color: "#5a7a5a", marginBottom: 6 }}>Executive Summary</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#c8d8a0", fontFamily: "'Playfair Display', Georgia, serif" }}>Editorial Review Complete</div>
        </div>
        {overallScore && (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 42, fontWeight: 800, color: overallTL === "green" ? "#7dc87d" : overallTL === "amber" ? "#e0a040" : "#e06060", fontFamily: "'Courier New', monospace", lineHeight: 1 }}>{overallScore}</div>
            <div style={{ fontSize: 10, color: "#5a7a5a", textTransform: "uppercase", letterSpacing: 1.5 }}>Overall</div>
          </div>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8 }}>
        {MODULES.filter(m => results[m.id]).map(mod => {
          const r = results[mod.id];
          const tl = r.traffic_light;
          const score = r.score;
          return (
            <button key={mod.id} onClick={() => onSelectTab(mod.id)}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 4, cursor: "pointer", textAlign: "left", transition: "background 0.15s" }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.12)"}
              onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.06)"}
            >
              <TL status={tl} size={10} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#c8d8a0", textTransform: "uppercase", letterSpacing: 0.5 }}>{mod.label}</div>
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: tl === "green" ? "#7dc87d" : tl === "amber" ? "#e0a040" : "#e06060", fontFamily: "'Courier New', monospace" }}>{score}</span>
            </button>
          );
        })}
        {MODULES.filter(m => moduleStatus[m.id] === "running").map(mod => (
          <div key={mod.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#5a7a5a", animation: "pulse 1s infinite", flexShrink: 0 }} />
            <div style={{ fontSize: 11, fontWeight: 700, color: "#5a7a5a", textTransform: "uppercase", letterSpacing: 0.5 }}>{mod.label}</div>
          </div>
        ))}
      </div>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function DeskMVP() {
  const [authed, setAuthed] = useState(false);
  const [pwInput, setPwInput] = useState("");
  const [pwError, setPwError] = useState(false);
  const [view, setView] = useState("input"); // input | admin | running | results
  const [story, setStory] = useState("");
  const [format, setFormat] = useState("news_report");
  const [beat, setBeat] = useState("");
  const [sensitivity, setSensitivity] = useState("standard");
  const [selectedModules, setSelectedModules] = useState(
    Object.fromEntries(MODULES.map(m => [m.id, true]))
  );
  const [adminDocs, setAdminDocs] = useState("");
  const [adminConfig, setAdminConfig] = useState({ newsroom: "", styleGuide: "AP" });
  const [results, setResults] = useState({});
  const [moduleStatus, setModuleStatus] = useState({});
  const [activeTab, setActiveTab] = useState(null);
  const [annotationMode, setAnnotationMode] = useState(false);
  const [copied, setCopied] = useState(false);
  const abortRef = useRef(null);

  const handleLogin = () => {
    if (pwInput === PILOT_PASSWORD) { setAuthed(true); setPwError(false); }
    else { setPwError(true); }
  };

  const handleRun = useCallback(async () => {
    if (!story.trim()) return;
    const toRun = MODULES.filter(m => selectedModules[m.id]);
    setResults({});
    const init = {};
    toRun.forEach(m => { init[m.id] = "pending"; });
    setModuleStatus(init);
    setView("running");
    abortRef.current = new AbortController();

    // Run in batches of 3 to avoid rate limiting
    const BATCH_SIZE = 3;
    for (let i = 0; i < toRun.length; i += BATCH_SIZE) {
      const batch = toRun.slice(i, i + BATCH_SIZE);
      batch.forEach(mod => setModuleStatus(p => ({ ...p, [mod.id]: "running" })));
      await Promise.all(batch.map(async (mod) => {
        try {
          const r = await callModule(mod, story, format, beat, sensitivity, adminDocs, abortRef.current.signal);
          setResults(p => ({ ...p, [mod.id]: r }));
          setModuleStatus(p => ({ ...p, [mod.id]: "done" }));
        } catch (e) {
          setModuleStatus(p => ({ ...p, [mod.id]: "error" }));
          setResults(p => ({ ...p, [mod.id]: { error: e.message } }));
        }
      }));
      // Small pause between batches
      if (i + BATCH_SIZE < toRun.length) await new Promise(r => setTimeout(r, 1000));
    }

    setActiveTab(toRun[0].id);
    setView("results");
  }, [story, format, beat, sensitivity, selectedModules, adminDocs]);

  const handleCopy = useCallback(() => {
    const lines = Object.entries(results).map(([id, r]) => {
      const mod = MODULES.find(m => m.id === id);
      return `## ${mod?.label}\nScore: ${r.score}/10 | ${r.traffic_light?.toUpperCase()}\n${r.summary}\n${JSON.stringify(r, null, 2)}`;
    }).join("\n\n---\n\n");
    navigator.clipboard.writeText(lines);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [results]);

  const getAnnotated = () => {
    if (!story) return story;
    const flags = [
      ...(results.story_editor?.inline_flags || []).map(f => ({ ...f, color: "#1a3a5c" })),
      ...(results.copyedit?.issues || []).map(f => ({ quote: f.quote, issue: f.issue, suggestion: f.fix, color: "#1a4a2a" })),
    ];
    let html = story.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    flags.forEach(f => {
      if (!f.quote) return;
      const esc = f.quote.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      try {
        html = html.replace(new RegExp(esc, "i"), m =>
          `<mark style="background:${f.color}18;border-bottom:2px solid ${f.color};cursor:pointer;" title="${(f.issue || "").replace(/"/g, "'")}${f.suggestion ? " → " + f.suggestion.replace(/"/g, "'") : ""}">${m}</mark>`
        );
      } catch {}
    });
    return html;
  };

  const doneCount = Object.values(moduleStatus).filter(s => s === "done" || s === "error").length;
  const totalCount = Object.values(moduleStatus).length;

  // ── Login ──────────────────────────────────────────────────────────────────
  if (!authed) return (
    <div style={{ minHeight: "100vh", background: "#0f1f0f", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Playfair Display', Georgia, serif" }}>
      <div style={{ width: 340, padding: "48px 40px", background: "#162816", border: "1px solid #1e3a1e", borderRadius: 6 }}>
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{ fontSize: 32, fontWeight: 700, color: "#c8d8a0", letterSpacing: "-0.5px", marginBottom: 6 }}>Desk</div>
          <div style={{ fontSize: 11, color: "#5a7a5a", textTransform: "uppercase", letterSpacing: 2.5 }}>Editorial AI · Pilot</div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <input
            type="password" value={pwInput} placeholder="Pilot access code"
            onChange={e => setPwInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleLogin()}
            style={{ width: "100%", padding: "12px 14px", background: "#1e3a1e", border: `1px solid ${pwError ? "#b52020" : "#2a4a2a"}`, borderRadius: 3, color: "#c8d8a0", fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
          />
          {pwError && <div style={{ fontSize: 11, color: "#e06060", marginTop: 6 }}>Incorrect access code.</div>}
        </div>
        <button onClick={handleLogin} style={{ width: "100%", padding: "12px", background: "#c8d8a0", color: "#0f1f0f", border: "none", borderRadius: 3, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit", letterSpacing: 0.5, textTransform: "uppercase" }}>
          Enter
        </button>
        <div style={{ textAlign: "center", marginTop: 20, fontSize: 11, color: "#3a5a3a" }}>Local Newsroom Pilot v1.0</div>
      </div>
    </div>
  );

  // ── Header ─────────────────────────────────────────────────────────────────
  const Header = () => (
    <header style={{ background: "#0f1f0f", height: 52, padding: "0 28px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100, borderBottom: "1px solid #1e3a1e" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <span style={{ fontSize: 17, fontWeight: 700, color: "#c8d8a0", fontFamily: "'Playfair Display', Georgia, serif" }}>Desk</span>
        {adminConfig.newsroom && <span style={{ fontSize: 11, color: "#3a5a3a", letterSpacing: 1.5, textTransform: "uppercase" }}>{adminConfig.newsroom}</span>}
      </div>
      <nav style={{ display: "flex", gap: 2 }}>
        {[["input", "Review"], ...(Object.keys(results).length ? [["results", "Results"]] : []), ["admin", "Admin"]].map(([v, l]) => (
          <button key={v} onClick={() => { if (view !== "running") setView(v); }}
            style={{ padding: "5px 14px", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", background: view === v ? "#c8d8a0" : "transparent", color: view === v ? "#0f1f0f" : "#5a7a5a", borderRadius: 3, fontFamily: "inherit" }}>
            {l}
          </button>
        ))}
      </nav>
    </header>
  );

  const Main = ({ children }) => (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "32px 24px" }}>{children}</div>
  );

  // ── Input View ─────────────────────────────────────────────────────────────
  const InputView = () => (
    <Main>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "#111", fontFamily: "'Playfair Display', Georgia, serif", margin: "0 0 6px" }}>Editorial Review</h1>
        <p style={{ color: "#888", fontSize: 14, margin: 0 }}>Paste your story, choose type and sensitivity, then run the full pipeline.</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 20, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Format — required */}
          <div style={C.card}>
            <label style={C.label}>Format <span style={{ color: "#b52020", fontWeight: 700 }}>*</span></label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {FORMATS.map(f => (
                <button key={f.id} onClick={() => setFormat(f.id)}
                  style={{ padding: "8px 14px", border: `1px solid ${format === f.id ? "#0f1f0f" : "#e0ddd5"}`, borderRadius: 4, background: format === f.id ? "#0f1f0f" : "#faf9f6", color: format === f.id ? "#c8d8a0" : "#555", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6, transition: "all 0.12s" }}
                  title={f.desc}>
                  <span>{f.icon}</span>{f.label}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 11, color: "#aaa", marginTop: 8 }}>
              {FORMATS.find(f => f.id === format)?.desc}
            </div>
          </div>

          {/* Beat — optional */}
          <div style={C.card}>
            <label style={C.label}>Beat <span style={{ color: "#bbb", fontWeight: 400 }}>(optional — improves legal, ethics, and source diversity modules)</span></label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {BEATS.map(b => (
                <button key={b.id} onClick={() => setBeat(beat === b.id ? "" : b.id)}
                  style={{ padding: "6px 12px", border: `1px solid ${beat === b.id ? "#555" : "#e0ddd5"}`, borderRadius: 4, background: beat === b.id ? "#f0ede5" : "#faf9f6", color: beat === b.id ? "#111" : "#666", cursor: "pointer", fontSize: 11, fontWeight: beat === b.id ? 700 : 400, fontFamily: "inherit", transition: "all 0.12s" }}>
                  {b.label}
                </button>
              ))}
            </div>
            {beat && <div style={{ fontSize: 11, color: "#aaa", marginTop: 6 }}>Click again to deselect</div>}
          </div>

          {/* Story text */}
          <div style={C.card}>
            <label style={C.label}>Story Text</label>
            <textarea value={story} onChange={e => setStory(e.target.value)}
              placeholder="Paste your story here, or upload a file below..."
              style={{ width: "100%", padding: "12px 14px", fontSize: 14, fontFamily: "'Playfair Display', Georgia, serif", border: "1px solid #e0ddd5", borderRadius: 3, background: "#faf9f6", minHeight: 260, resize: "vertical", boxSizing: "border-box", color: "#222", lineHeight: 1.75, outline: "none" }} />
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10 }}>
              <label style={{ ...C.btnGhost, cursor: "pointer", fontSize: 11 }}>
                Upload File (.txt, .pdf, .docx)
                <input type="file" accept=".txt,.pdf,.docx" style={{ display: "none" }}
                  onChange={async e => { if (e.target.files[0]) setStory(await e.target.files[0].text()); }} />
              </label>
              {story && <span style={{ fontSize: 11, color: "#aaa" }}>{story.split(/\s+/).filter(Boolean).length} words</span>}
            </div>
          </div>

          {/* Metadata */}
          <div style={C.card}>
            <label style={C.label}>Story Metadata <span style={{ color: "#bbb", fontWeight: 400 }}>(optional)</span></label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {[["outlet", "Outlet"], ["beat", "Beat / Section"], ["platform", "Target Platform"], ["audience", "Audience"]].map(([k, lbl]) => (
                <div key={k}>
                  <div style={{ fontSize: 10, color: "#aaa", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>{lbl}</div>
                  <input placeholder={lbl} style={{ ...C.input, fontSize: 12 }} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right panel */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Sensitivity */}
          <div style={C.card}>
            <label style={C.label}>Story Sensitivity</label>
            {SENSITIVITY.map(s => (
              <label key={s.id} style={{ display: "flex", gap: 10, padding: "10px 12px", borderRadius: 4, border: `1px solid ${sensitivity === s.id ? s.color : "#e0ddd5"}`, background: sensitivity === s.id ? s.color + "0d" : "#faf9f6", marginBottom: 6, cursor: s.disabled ? "not-allowed" : "pointer", opacity: s.disabled ? 0.5 : 1 }}>
                <input type="radio" name="sensitivity" value={s.id} checked={sensitivity === s.id} disabled={s.disabled}
                  onChange={() => !s.disabled && setSensitivity(s.id)} style={{ marginTop: 2 }} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: s.disabled ? "#bbb" : "#222" }}>{s.label}{s.disabled && " ·  Coming Soon"}</div>
                  <div style={{ fontSize: 11, color: "#888", marginTop: 1 }}>{s.desc}</div>
                </div>
              </label>
            ))}
          </div>

          {/* Modules */}
          <div style={C.card}>
            <label style={C.label}>Modules</label>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10, color: "#bbb", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>Core — always run</div>
              {MODULES.filter(m => m.core).map(mod => (
                <div key={mod.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid #f5f2ec" }}>
                  <span style={{ fontSize: 13, color: mod.color }}>{mod.icon}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#333", flex: 1 }}>{mod.label}</span>
                  <span style={{ fontSize: 10, color: "#bbb" }}>Core</span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 10, color: "#bbb", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6, marginTop: 10 }}>Optional</div>
            {MODULES.filter(m => !m.core).map(mod => (
              <label key={mod.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid #f5f2ec", cursor: "pointer" }}>
                <input type="checkbox" checked={!!selectedModules[mod.id]}
                  onChange={e => setSelectedModules(p => ({ ...p, [mod.id]: e.target.checked }))} />
                <span style={{ fontSize: 13, color: mod.color }}>{mod.icon}</span>
                <span style={{ fontSize: 12, fontWeight: selectedModules[mod.id] ? 600 : 400, color: selectedModules[mod.id] ? "#333" : "#aaa", flex: 1 }}>{mod.label}</span>
              </label>
            ))}
            <button onClick={handleRun} disabled={!story.trim()}
              style={{ width: "100%", marginTop: 18, padding: "13px", background: story.trim() ? "#0f1f0f" : "#e0ddd5", color: story.trim() ? "#c8d8a0" : "#bbb", border: "none", borderRadius: 3, fontWeight: 700, fontSize: 12, cursor: story.trim() ? "pointer" : "not-allowed", fontFamily: "inherit", letterSpacing: 1, textTransform: "uppercase" }}>
              Run Review →
            </button>
          </div>
        </div>
      </div>
    </Main>
  );

  // ── Running View ───────────────────────────────────────────────────────────
  const RunningView = () => (
    <Main>
      <div style={{ maxWidth: 520, margin: "0 auto" }}>
        <div style={C.card}>
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <div style={{ fontSize: 36, marginBottom: 10, color: "#0f1f0f" }}>◎</div>
            <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "'Playfair Display', Georgia, serif", color: "#111", marginBottom: 4 }}>Review in Progress</div>
            <div style={{ fontSize: 13, color: "#888" }}>{totalCount} modules running in parallel</div>
          </div>
          <div style={{ height: 4, background: "#e8e4dc", borderRadius: 2, overflow: "hidden", marginBottom: 24 }}>
            <div style={{ height: "100%", background: "#0f1f0f", borderRadius: 2, width: `${totalCount ? (doneCount / totalCount) * 100 : 0}%`, transition: "width 0.4s" }} />
          </div>
          {MODULES.filter(m => moduleStatus[m.id]).map(mod => (
            <div key={mod.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderBottom: "1px solid #f5f2ec" }}>
              <span style={{ fontSize: 14, color: mod.color, width: 20, textAlign: "center" }}>{mod.icon}</span>
              <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: "#333" }}>{mod.label}</span>
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, color: moduleStatus[mod.id] === "done" ? "#2d6a2d" : moduleStatus[mod.id] === "running" ? "#0f1f0f" : moduleStatus[mod.id] === "error" ? "#b52020" : "#ccc" }}>
                {moduleStatus[mod.id] === "done" ? "✓ Done" : moduleStatus[mod.id] === "running" ? "Running…" : moduleStatus[mod.id] === "error" ? "Error" : "Waiting"}
              </span>
            </div>
          ))}
          {doneCount === totalCount && doneCount > 0 && (
            <button style={{ width: "100%", marginTop: 22, padding: "13px", background: "#0f1f0f", color: "#c8d8a0", border: "none", borderRadius: 3, fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit", letterSpacing: 1, textTransform: "uppercase" }}
              onClick={() => { setActiveTab(MODULES.find(m => results[m.id])?.id); setView("results"); }}>
              View Results →
            </button>
          )}
        </div>
      </div>
    </Main>
  );

  // ── Results View ───────────────────────────────────────────────────────────
  const ResultsView = () => {
    const activeMod = MODULES.find(m => m.id === activeTab);
    const Renderer = activeTab ? RENDERERS[activeTab] : null;

    return (
      <Main>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: "#111", fontFamily: "'Playfair Display', Georgia, serif", margin: "0 0 4px" }}>Editorial Report</h2>
            <div style={{ fontSize: 12, color: "#888" }}>
              {FORMATS.find(f => f.id === format)?.label}{beat ? ` · ${BEATS.find(b => b.id === beat)?.label}` : ""} · {sensitivity.charAt(0).toUpperCase() + sensitivity.slice(1)} ·{" "}
              {Object.values(moduleStatus).filter(s => s === "done").length}/{totalCount} modules
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={C.btnGhost} onClick={() => setAnnotationMode(!annotationMode)}>
              {annotationMode ? "Report View" : "Annotate Story"}
            </button>
            <button style={C.btnGhost} onClick={handleCopy}>{copied ? "Copied ✓" : "Copy Report"}</button>
            <button style={C.btnGhost} onClick={() => { setView("input"); setResults({}); setModuleStatus({}); }}>New Story</button>
          </div>
        </div>

        <ExecSummary results={results} moduleStatus={moduleStatus} onSelectTab={setActiveTab} />

        {annotationMode ? (
          <div style={C.card}>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, color: "#888", marginBottom: 10 }}>Annotated Story — hover highlights for details</div>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                {[{ label: "Story Editor", color: "#1a3a5c" }, { label: "Copyedit", color: "#1a4a2a" }].map(({ label, color }) => (
                  <div key={label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#666" }}>
                    <span style={{ width: 12, height: 12, background: color + "22", border: `2px solid ${color}`, borderRadius: 2, display: "inline-block" }} />{label}
                  </div>
                ))}
              </div>
            </div>
            <div style={{ fontSize: 15, lineHeight: 1.9, color: "#222", fontFamily: "'Playfair Display', Georgia, serif", whiteSpace: "pre-wrap" }}
              dangerouslySetInnerHTML={{ __html: getAnnotated() }} />
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #e0ddd5", overflowX: "auto", marginBottom: 0 }}>
              {MODULES.filter(m => moduleStatus[m.id]).map(mod => {
                const active = activeTab === mod.id;
                const tl = results[mod.id]?.traffic_light;
                return (
                  <button key={mod.id} onClick={() => setActiveTab(mod.id)}
                    style={{ padding: "9px 16px", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", background: active ? "#fff" : "transparent", color: active ? mod.color : "#888", borderBottom: active ? `2px solid ${mod.color}` : "2px solid transparent", borderRadius: "3px 3px 0 0", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 7, whiteSpace: "nowrap", flexShrink: 0 }}>
                    {tl && <TL status={tl} size={8} />}
                    {mod.icon} {mod.label}
                    {results[mod.id]?.score && <span style={{ fontFamily: "'Courier New', monospace", opacity: 0.7 }}>{results[mod.id].score}</span>}
                    {moduleStatus[mod.id] === "running" && <span style={{ width: 6, height: 6, borderRadius: "50%", background: mod.color, animation: "pulse 1s infinite", display: "inline-block" }} />}
                  </button>
                );
              })}
            </div>

            {activeTab && (
              <div style={{ ...C.card, borderRadius: "0 0 6px 6px", borderTop: "none", marginBottom: 0 }}>
                {moduleStatus[activeTab] === "running" && (
                  <div style={{ textAlign: "center", padding: "48px 20px", color: "#888" }}>
                    <div style={{ fontSize: 28, marginBottom: 12, color: activeMod?.color }}>{activeMod?.icon}</div>
                    <div style={{ fontSize: 13 }}>Analyzing…</div>
                  </div>
                )}
                {moduleStatus[activeTab] === "error" && (
                  <div style={{ padding: "20px", color: "#b52020", fontSize: 13 }}>
                    Error: {results[activeTab]?.error || "Unknown error. Check API key and try again."}
                  </div>
                )}
                {moduleStatus[activeTab] === "done" && results[activeTab] && activeMod && Renderer && (
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20, paddingBottom: 16, borderBottom: "1px solid #f0ede5" }}>
                      <Score score={results[activeTab].score} color={activeMod.color} size={52} />
                      <div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: "#111", fontFamily: "'Playfair Display', Georgia, serif", marginBottom: 4 }}>{activeMod.label}</div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <TL status={results[activeTab].traffic_light} size={10} />
                          <span style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: 0.8 }}>{results[activeTab].traffic_light}</span>
                          {activeMod.webSearch && <Pill label="Live Search" color="#2a1a4a" bg="#f0edf9" />}
                          {sensitivity === "sensitive" && <Pill label="Sensitive" color="#8b5e00" bg="#fff5e0" />}
                        </div>
                      </div>
                    </div>
                    <Renderer r={results[activeTab]} mod={activeMod} />
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </Main>
    );
  };

  // ── Admin View ─────────────────────────────────────────────────────────────
  const AdminView = () => (
    <Main>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: "#111", fontFamily: "'Playfair Display', Georgia, serif", margin: "0 0 6px" }}>Newsroom Configuration</h2>
      <p style={{ color: "#888", fontSize: 14, margin: "0 0 24px" }}>Set up your newsroom profile and reference documents. Applied to all team reviews.</p>

      <div style={C.card}>
        <label style={C.label}>Newsroom Name</label>
        <input style={{ ...C.input, marginBottom: 18 }} value={adminConfig.newsroom}
          onChange={e => setAdminConfig(p => ({ ...p, newsroom: e.target.value }))} placeholder="e.g. The Riverside Ledger" />

        <label style={C.label}>Default Style Guide</label>
        <select style={{ ...C.input, marginBottom: 22 }} value={adminConfig.styleGuide}
          onChange={e => setAdminConfig(p => ({ ...p, styleGuide: e.target.value }))}>
          <option value="AP">AP Style</option>
          <option value="Chicago">Chicago Manual</option>
          <option value="House">House Style (from uploaded doc)</option>
        </select>

        <label style={C.label}>Reference Documents</label>
        <p style={{ fontSize: 12, color: "#888", marginBottom: 10, marginTop: 0 }}>Upload style guide, legal policy, ethics policy. Accepts .txt files. PDF/Word support coming in Phase 2.</p>
        <input type="file" multiple accept=".txt"
          onChange={async e => {
            const texts = await Promise.all(Array.from(e.target.files).map(f => f.text()));
            setAdminDocs(p => (p + "\n\n" + texts.join("\n\n")).trim());
          }}
          style={{ marginBottom: 10, fontSize: 12 }} />
        {adminDocs && <div style={{ padding: "8px 12px", background: "#e8f5e8", borderRadius: 3, fontSize: 11, color: "#2d6a2d", marginBottom: 12 }}>✓ {adminDocs.length} characters of reference material loaded</div>}
        <textarea style={{ ...C.input, minHeight: 90, marginBottom: 4 }} placeholder="Or paste reference text directly…"
          value={adminDocs} onChange={e => setAdminDocs(e.target.value)} />
        <div style={{ fontSize: 11, color: "#bbb", marginBottom: 22 }}>First 1,500 characters are passed to each module as context.</div>

        <label style={C.label}>Data Handling</label>
        <div style={{ padding: "12px 14px", background: "#faf9f6", borderRadius: 4, border: "1px solid #e0ddd5", fontSize: 12, color: "#555", lineHeight: 1.6 }}>
          <strong>Standard mode:</strong> Stories processed via Anthropic API. Not used for training (commercial terms). Deleted after 30 days.<br />
          <strong>Sensitive mode:</strong> Reduced prompt context. Source names minimized in output. Same API terms apply.<br />
          <strong>Confidential mode:</strong> Self-hosted processing — coming in Phase 2. No data leaves your network.
        </div>

        <div style={{ marginTop: 22 }}>
          <button style={{ padding: "11px 28px", background: "#0f1f0f", color: "#c8d8a0", border: "none", borderRadius: 3, fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit", letterSpacing: 1, textTransform: "uppercase" }}
            onClick={() => setView("input")}>
            Save & Return
          </button>
        </div>
      </div>
    </Main>
  );

  // ── Card Styles ────────────────────────────────────────────────────────────
  const C = {
    card: { background: "#fff", borderRadius: 6, padding: "22px 24px", border: "1px solid #e8e4dc" },
    label: { fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, color: "#888", marginBottom: 10, display: "block" },
    input: { width: "100%", padding: "9px 12px", fontSize: 13, fontFamily: "inherit", border: "1px solid #e0ddd5", borderRadius: 3, background: "#faf9f6", boxSizing: "border-box", outline: "none", color: "#222" },
    btnGhost: { padding: "7px 16px", background: "transparent", border: "1px solid #e0ddd5", borderRadius: 3, cursor: "pointer", fontSize: 11, fontWeight: 600, color: "#555", fontFamily: "inherit", letterSpacing: 0.5, textTransform: "uppercase" },
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f4f1eb", fontFamily: "'Playfair Display', Georgia, serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&display=swap" rel="stylesheet" />
      <Header />
      {view === "input" && <InputView />}
      {view === "running" && <RunningView />}
      {view === "results" && <ResultsView />}
      {view === "admin" && <AdminView />}
    </div>
  );
}
