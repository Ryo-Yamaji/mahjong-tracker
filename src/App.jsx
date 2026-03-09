import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// ============================================================
// ルール設定（3人麻雀）
// ============================================================
const RULES = { startPoints: 35000, returnPoints: 40000, uma: [15, 5, -20], oka: 15 };

function calcScore(rawPoints, rank) {
  const base = (rawPoints - RULES.returnPoints) / 1000;
  return Math.round((base + RULES.uma[rank - 1] + (rank === 1 ? RULES.oka : 0)) * 10) / 10;
}

const COLORS = ["#e85d5d","#4f9cf9","#34c988","#f7b731","#b05cf9","#f95ca8","#5cf9e8","#f9a05c"];
const RANK_COLORS = ["#f5c542","#aab8c2","#cd7f32"];
const RANK_LABELS = ["1位","2位","3位"];

const DEFAULT_MEMBERS = [
  { id: 1, name: "五十嵐", color: COLORS[0] },
  { id: 2, name: "小澤",   color: COLORS[1] },
  { id: 3, name: "鈴木",   color: COLORS[2] },
  { id: 4, name: "中井",   color: COLORS[3] },
  { id: 5, name: "山道",   color: COLORS[4] },
];

// ============================================================
// Storage（Supabase共有）
// ============================================================
async function loadData() {
  try {
    const { data } = await supabase
      .from('games')
      .select('data')
      .eq('id', 1)
      .single();
    return data?.data ?? null;
  } catch (_) { return null; }
}

async function saveData(payload) {
  try {
    await supabase
      .from('games')
      .update({ data: payload, updated_at: new Date().toISOString() })
      .eq('id', 1);
  } catch (_) {}
}

// ============================================================
// UI Primitives
// ============================================================
function Avatar({ name, color, size = 34 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", background: color,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontWeight: 800, fontSize: size * 0.38, color: "#fff", flexShrink: 0,
      boxShadow: `0 2px 8px ${color}55`,
    }}>{name.charAt(0)}</div>
  );
}

function ScoreBadge({ value, size = 15 }) {
  const color = value >= 0 ? "#34c988" : "#e85d5d";
  return (
    <span style={{ color, fontWeight: 800, fontSize: size }}>
      {value >= 0 ? "+" : ""}{typeof value === "number" ? value.toFixed(1) : value}
    </span>
  );
}

function SectionTitle({ children, style = {} }) {
  return (
    <div style={{ color: "#555", fontSize: 11, fontWeight: 700, letterSpacing: 2, marginBottom: 8, marginTop: 2, ...style }}>
      {children}
    </div>
  );
}

function Card({ children, style = {} }) {
  return (
    <div style={{ padding: "14px 16px", borderRadius: 14, background: "#0c0c1e", border: "1px solid #1c1c35", marginBottom: 10, ...style }}>
      {children}
    </div>
  );
}

function SubTabBar({ tabs, active, onChange }) {
  return (
    <div style={{ display: "flex", gap: 2, background: "#0c0c1e", padding: 4, borderRadius: 12, marginBottom: 20 }}>
      {tabs.map(t => (
        <button key={t.key} onClick={() => onChange(t.key)} style={{
          flex: 1, padding: "8px 4px", border: "none", borderRadius: 9,
          background: active === t.key ? "#1a1a3a" : "transparent",
          color: active === t.key ? "#fff" : "#666",
          fontWeight: active === t.key ? 700 : 400,
          fontSize: 12, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s",
        }}>{t.label}</button>
      ))}
    </div>
  );
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#0c0c1e", border: "1px solid #2a2a4a", borderRadius: 10, padding: "8px 12px", fontSize: 12 }}>
      <div style={{ color: "#888", marginBottom: 4 }}>第{label}局</div>
      {payload.map(p => (
        <div key={p.dataKey} style={{ color: p.color, fontWeight: 700 }}>
          {p.name}: {p.value >= 0 ? "+" : ""}{p.value.toFixed(1)}
        </div>
      ))}
    </div>
  );
}

// ============================================================
// チップ入力モーダル
// ============================================================
function ChipModal({ session, members, onConfirm, onSkip }) {
  const participantMembers = session.participantIds.map(id => members.find(m => m.id === id)).filter(Boolean);
  const [chips, setChips] = useState(Object.fromEntries(participantMembers.map(m => [m.id, ""])));

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1000, padding: "20px",
    }}>
      <div style={{
        background: "#0c0c1e", border: "1px solid #2a2a40",
        borderRadius: 18, padding: "24px 20px", width: "100%", maxWidth: 400,
      }}>
        <div style={{ fontSize: 22, textAlign: "center", marginBottom: 6 }}>🪙</div>
        <div style={{ fontWeight: 800, fontSize: 16, textAlign: "center", marginBottom: 4 }}>チップ入力</div>
        <div style={{ fontSize: 12, color: "#555", textAlign: "center", marginBottom: 20 }}>
          1枚につき +2点。マイナスも可。空欄は0扱い。
        </div>

        {participantMembers.map(m => (
          <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <Avatar name={m.name} color={m.color} size={28} />
            <span style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>{m.name}</span>
            <input
              type="number"
              value={chips[m.id]}
              onChange={e => setChips(prev => ({ ...prev, [m.id]: e.target.value }))}
              placeholder="0"
              style={{
                width: 80, padding: "8px 10px", borderRadius: 8,
                border: "1.5px solid #2a2a40", background: "#080816",
                color: "#fff", fontSize: 14, outline: "none",
                fontFamily: "inherit", textAlign: "right",
              }}
            />
            <span style={{ fontSize: 12, color: "#555", minWidth: 14 }}>枚</span>
            <span style={{
              minWidth: 44, textAlign: "right", fontSize: 13, fontWeight: 700,
              color: (Number(chips[m.id]) || 0) >= 0 ? "#34c988" : "#e85d5d",
            }}>
              {(Number(chips[m.id]) || 0) >= 0 ? "+" : ""}{(Number(chips[m.id]) || 0) * 2}
            </span>
          </div>
        ))}

        {(() => {
          const total = participantMembers.reduce((sum, m) => sum + (Number(chips[m.id]) || 0), 0);
          const isZero = total === 0;
          return (
            <>
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "10px 14px", borderRadius: 10,
                background: isZero ? "#0a1a0a" : "#1a0a0a",
                border: `1px solid ${isZero ? "#1a3a1a" : "#3a1a1a"}`,
                marginTop: 16, marginBottom: 4,
              }}>
                <span style={{ fontSize: 13, color: "#888" }}>合計枚数</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: isZero ? "#34c988" : "#e85d5d" }}>
                  {total > 0 ? "+" : ""}{total}枚　{isZero ? "✓ OK" : "※ 合計が0になるように入力してください"}
                </span>
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                <button onClick={onSkip} style={{
                  flex: 1, padding: "12px", borderRadius: 10, border: "1px solid #2a2a40",
                  background: "transparent", color: "#666", cursor: "pointer",
                  fontSize: 14, fontFamily: "inherit",
                }}>スキップ</button>
                <button
                  onClick={() => isZero && onConfirm(chips)}
                  disabled={!isZero}
                  style={{
                    flex: 2, padding: "12px", borderRadius: 10, border: "none",
                    background: isZero ? "linear-gradient(135deg,#e85d5d,#f7b731)" : "#1c1c35",
                    color: isZero ? "#fff" : "#444",
                    fontWeight: 700, cursor: isZero ? "pointer" : "not-allowed",
                    fontSize: 14, fontFamily: "inherit", transition: "all 0.2s",
                  }}>確定して終了</button>
              </div>
            </>
          );
        })()}
      </div>
    </div>
  );
}

// セッションバナー（アクティブなセッションを常に表示）
// ============================================================
function SessionBanner({ session, members, onEnd }) {
  if (!session) return null;
  const participantMembers = session.participantIds.map(id => members.find(m => m.id === id)).filter(Boolean);
  return (
    <div style={{
      background: "linear-gradient(135deg, #0f1a2e, #1a0f2e)",
      border: "1px solid #2a3a5a", borderRadius: 14, padding: "12px 16px",
      marginBottom: 16, display: "flex", alignItems: "center", gap: 12,
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#34c988", display: "inline-block", boxShadow: "0 0 6px #34c988" }} />
          <span style={{ fontSize: 12, color: "#34c988", fontWeight: 700 }}>対局進行中</span>
          <span style={{ fontSize: 11, color: "#555", marginLeft: 4 }}>{session.date}　{session.gameCount}局済</span>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {participantMembers.map(m => (
            <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <Avatar name={m.name} color={m.color} size={22} />
              <span style={{ fontSize: 12, color: "#ccc" }}>{m.name}</span>
            </div>
          ))}
        </div>
      </div>
      <button onClick={onEnd} style={{
        padding: "6px 12px", borderRadius: 8, border: "1px solid #3a2a4a",
        background: "transparent", color: "#888", cursor: "pointer", fontSize: 12, fontFamily: "inherit",
        whiteSpace: "nowrap",
      }}>終了</button>
    </div>
  );
}

// ============================================================
// Record Tab — セッション管理 + 対局記録
// ============================================================
function RecordTab({ members, session, setSession, games, setGames, onSave, rules, setRules }) {
  const todayISO = new Date().toISOString().slice(0, 10);

  // セッション開始用
  const [setupDate, setSetupDate] = useState(todayISO);
  const [setupParticipants, setSetupParticipants] = useState([]);
  const [setupError, setSetupError] = useState("");

  // 対局入力用
  const [selected, setSelected] = useState([null, null, null]);
  const [points, setPoints] = useState(["", "", ""]);
  // 飛び賞: { flownId: memberId, flyerId: memberId }[] (飛ばされた人 → 飛ばした人)
  const [tobiList, setTobiList] = useState([]);
  // 焼き鳥: 焼き鳥になったメンバーのidリスト
  const [yakitoriList, setYakitoriList] = useState([]);
  const [recordError, setRecordError] = useState("");
  const [saved, setSaved] = useState(false);
  // チップモーダル
  const [showChipModal, setShowChipModal] = useState(false);
  // 入力モード: null | "simple" | "detail"
  const [inputMode, setInputMode] = useState(null);
  // 簡単入力用
  const [simpleScores, setSimpleScores] = useState({});
  const [simpleError, setSimpleError] = useState("");
  const [simpleSaved, setSimpleSaved] = useState(false);

  useEffect(() => {
    if (session) {
      const ids = session.participantIds.slice(0, 3);
      setSelected([ids[0] ?? null, ids[1] ?? null, ids[2] ?? null]);
    }
  }, [session?.id]);

  const toggleSetupParticipant = (id) => {
    setSetupParticipants(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 5) return prev;
      return [...prev, id];
    });
  };

  const startSession = (mode) => {
    if (setupParticipants.length < 3) return setSetupError("3人以上を選択してください");
    setSetupError("");
    const newSession = {
      id: Date.now(),
      date: new Date(setupDate + "T00:00:00").toLocaleDateString("ja-JP"),
      participantIds: setupParticipants,
      gameCount: 0,
    };
    setSession(newSession);
    setInputMode(mode);
    const ids = setupParticipants.slice(0, 3);
    setSelected([ids[0] ?? null, ids[1] ?? null, ids[2] ?? null]);
    setPoints(["", "", ""]);
    setTobiList([]);
    setYakitoriList([]);
    setSimpleScores({});
    onSave(undefined, undefined, newSession);
  };

  const endSession = () => {
    setShowChipModal(true);
  };

  const finalizeSession = (chips) => {
    // チップスコアをgamesに反映
    const participantIds = session.participantIds;
    let updatedGames = [...games];
    participantIds.forEach(memberId => {
      const chipCount = Number(chips?.[memberId]) || 0;
      if (chipCount === 0) return;
      const chipScore = chipCount * 2;
      // そのセッションの最後の対局にチップを付加（新規チップゲームとして追加）
    });

    // チップを別レコードとして保存
    const chipEntries = participantIds
      .map(memberId => ({ memberId, chips: Number(chips?.[memberId]) || 0 }))
      .filter(e => e.chips !== 0);

    if (chipEntries.length > 0) {
      const chipGame = {
        id: Date.now(),
        date: session.date,
        sessionId: session.id,
        isChip: true,
        result: chipEntries.map(e => ({
          memberId: e.memberId,
          rawPoints: 0,
          rank: 0,
          score: e.chips * 2,
          chips: e.chips,
        })),
      };
      updatedGames = [...updatedGames, chipGame];
    }

    setGames(updatedGames);
    setSession(null);
    setSelected([null, null, null]);
    setPoints(["", "", ""]);
    setTobiList([]);
    setYakitoriList([]);
    setSetupParticipants([]);
    setShowChipModal(false);
    setInputMode(null);
    setSimpleScores({});
    onSave(undefined, updatedGames, null);
  };

  const toggleSelected = (id) => {
    setSelected(prev => {
      if (prev.includes(id)) return prev.map(x => x === id ? null : x);
      const emptyIdx = prev.indexOf(null);
      if (emptyIdx === -1) return prev;
      const next = [...prev];
      next[emptyIdx] = id;
      return next;
    });
  };

  // 飛び賞トグル: 飛ばされた人(flownId)を選択してから飛ばした人(flyerId)を選ぶ
  const [tobiStep, setTobiStep] = useState(null); // null | { flownId }
  const handleTobiSelect = (id) => {
    if (!tobiStep) {
      // 1クリック目: 飛ばされた人を選択
      setTobiStep({ flownId: id });
    } else {
      if (tobiStep.flownId === id) { setTobiStep(null); return; }
      // 2クリック目: 飛ばした人を選択 → ペア追加（重複防止）
      const exists = tobiList.some(t => t.flownId === tobiStep.flownId && t.flyerId === id);
      if (!exists) setTobiList(prev => [...prev, { flownId: tobiStep.flownId, flyerId: id }]);
      setTobiStep(null);
    }
  };
  const removeTobi = (idx) => setTobiList(prev => prev.filter((_, i) => i !== idx));

  const toggleYakitori = (id) => {
    setYakitoriList(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  // スコア計算（飛び賞・焼き鳥込み）
  const calcFinalScore = (baseScore, memberId, tobiList, yakitoriList, selectedIds) => {
    let bonus = 0;
    if (rules.tobi) {
      tobiList.forEach(t => {
        if (t.flyerId === memberId) bonus += 10;   // 飛ばした人 +10
        if (t.flownId === memberId) bonus -= 10;   // 飛ばされた人 -10
      });
    }
    if (rules.yakitori) {
      const isYakitori = yakitoriList.includes(memberId);
      const othersYakitori = selectedIds.filter(id => id !== memberId && yakitoriList.includes(id));
      if (isYakitori) bonus -= 5 * (selectedIds.length - 1 - othersYakitori.length); // 焼き鳥の人が非焼き鳥の人数分-5
      else bonus += 5 * yakitoriList.filter(id => selectedIds.includes(id)).length; // 非焼き鳥は焼き鳥の人数分+5
    }
    return Math.round((baseScore + bonus) * 10) / 10;
  };

  const submit = () => {
    setRecordError("");
    if (selected.some(s => !s)) return setRecordError("3人を選択してください");
    const pts = points.map(Number);
    if (pts.some(isNaN) || points.some(p => p === "")) return setRecordError("点数をすべて入力してください");
    const total = pts.reduce((a, b) => a + b, 0);
    if (total !== RULES.startPoints * 3) return setRecordError(`合計が${(RULES.startPoints * 3).toLocaleString()}点になっていません（現在 ${total.toLocaleString()}点）`);

    // 同点は選択順（seat index）で順位決定
    const ranked = [0,1,2]
      .map(i => ({ i, pt: pts[i] }))
      .sort((a, b) => b.pt !== a.pt ? b.pt - a.pt : a.i - b.i);

    const selectedIds = selected.filter(Boolean);
    const result = selected.map((memberId, si) => {
      const rank = ranked.findIndex(r => r.i === si) + 1;
      const base = calcScore(pts[si], rank);
      const final = calcFinalScore(base, memberId, tobiList, yakitoriList, selectedIds);
      return {
        memberId, rawPoints: pts[si], rank, score: final,
        tobi: tobiList.filter(t => t.flownId === memberId || t.flyerId === memberId),
        yakitori: yakitoriList.includes(memberId),
      };
    });

    const updatedSession = { ...session, gameCount: session.gameCount + 1 };
    const newGame = {
      id: Date.now(), date: session.date, sessionId: session.id,
      result, tobiList: rules.tobi ? tobiList : [], yakitoriList: rules.yakitori ? yakitoriList : [],
    };
    const nextGames = [...games, newGame];

    setGames(nextGames);
    setSession(updatedSession);
    setSaved(true);
    setPoints(["", "", ""]);
    setTobiList([]);
    setYakitoriList([]);
    setTobiStep(null);
    onSave(undefined, nextGames, updatedSession);
    setTimeout(() => setSaved(false), 1500);
  };

  const total = points.map(p => Number(p) || 0).reduce((a, b) => a + b, 0);
  const expected = RULES.startPoints * 3;
  const participantMembers = session ? session.participantIds.map(id => members.find(m => m.id === id)).filter(Boolean) : [];
  const selectedMembers = selected.map(id => id ? members.find(m => m.id === id) : null);

  // ── 対局未開始 ──
  if (!session) return (
    <div>
      <div style={{
        padding: "16px", borderRadius: 14, background: "#0a0a1a",
        border: "1px dashed #2a2a4a", marginBottom: 20, textAlign: "center",
      }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>🀄</div>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>対局を開始する</div>
        <div style={{ fontSize: 12, color: "#555" }}>日付とメンバーを設定すれば、あとは何局でも続けて記録できます</div>
      </div>

      <SectionTitle>① 対局日</SectionTitle>
      <Card style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <span style={{ fontSize: 18 }}>📅</span>
        <input
          type="date" value={setupDate} onChange={e => setSetupDate(e.target.value)}
          style={{
            flex: 1, padding: "8px 10px", borderRadius: 8,
            border: "1.5px solid #2a2a40", background: "#080816",
            color: "#e0e0e0", fontSize: 15, fontFamily: "inherit", outline: "none",
          }}
        />
      </Card>

      <SectionTitle>② 参加メンバー（3〜5人）</SectionTitle>
      <Card>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {members.map(m => {
            const sel = setupParticipants.includes(m.id);
            const idx = setupParticipants.indexOf(m.id);
            const disabled = !sel && setupParticipants.length >= 5;
            return (
              <button key={m.id} onClick={() => !disabled && toggleSetupParticipant(m.id)} style={{
                display: "flex", alignItems: "center", gap: 7,
                padding: "8px 14px", borderRadius: 24,
                border: `2px solid ${sel ? m.color : "#2a2a40"}`,
                background: sel ? m.color + "22" : "transparent",
                color: sel ? m.color : disabled ? "#333" : "#888",
                fontFamily: "inherit", fontSize: 13, fontWeight: sel ? 700 : 400,
                cursor: disabled ? "not-allowed" : "pointer",
                transition: "all 0.15s", position: "relative",
              }}>
                <Avatar name={m.name} color={sel ? m.color : "#555"} size={22} />
                {m.name}
                {sel && (
                  <span style={{
                    position: "absolute", top: -6, right: -6,
                    width: 16, height: 16, borderRadius: "50%",
                    background: m.color, color: "#fff",
                    fontSize: 10, fontWeight: 800,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>{idx + 1}</span>
                )}
              </button>
            );
          })}
        </div>
        <div style={{ marginTop: 10, fontSize: 12, color: "#555" }}>{setupParticipants.length}/5人まで選択可</div>
      </Card>

      {/* ルール設定 */}
      <SectionTitle>③ ルール設定</SectionTitle>
      <Card>
        {[
          { key: "tobi", label: "飛び賞", desc: "持ち点マイナスにした人が +10" },
          { key: "yakitori", label: "焼き鳥", desc: "ツモ・ロンなしの人が他2人に −5" },
        ].map(r => (
          <div key={r.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div>
              <span style={{ fontWeight: 600, fontSize: 13, color: "#ccc" }}>{r.label}</span>
              <span style={{ fontSize: 11, color: "#555", marginLeft: 8 }}>{r.desc}</span>
            </div>
            <button onClick={() => setRules(prev => ({ ...prev, [r.key]: !prev[r.key] }))} style={{
              width: 44, height: 24, borderRadius: 12, border: "none",
              background: rules[r.key] ? "#34c988" : "#2a2a40",
              cursor: "pointer", position: "relative", transition: "background 0.2s", flexShrink: 0,
            }}>
              <span style={{
                position: "absolute", top: 3, left: rules[r.key] ? 22 : 3,
                width: 18, height: 18, borderRadius: "50%", background: "#fff",
                transition: "left 0.2s", display: "block",
              }} />
            </button>
          </div>
        ))}
      </Card>

      {setupError && <p style={{ color: "#e85d5d", fontSize: 13, marginBottom: 10 }}>{setupError}</p>}

      <SectionTitle>④ 入力モードを選択</SectionTitle>
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={() => startSession("simple")} disabled={setupParticipants.length < 3} style={{
          flex: 1, padding: "16px 10px", borderRadius: 12, border: "none",
          background: setupParticipants.length >= 3 ? "linear-gradient(135deg,#4f9cf9,#34c988)" : "#1c1c35",
          color: setupParticipants.length >= 3 ? "#fff" : "#555",
          fontWeight: 700, fontSize: 14, cursor: setupParticipants.length >= 3 ? "pointer" : "not-allowed",
          fontFamily: "inherit", transition: "all 0.2s", textAlign: "center",
          boxShadow: setupParticipants.length >= 3 ? "0 4px 20px #4f9cf933" : "none",
        }}>
          <div style={{ fontSize: 22, marginBottom: 6 }}>⚡</div>
          <div>簡単入力</div>
          <div style={{ fontSize: 11, color: setupParticipants.length >= 3 ? "#ffffffaa" : "#333", fontWeight: 400, marginTop: 4 }}>成績の±だけ入力</div>
        </button>
        <button onClick={() => startSession("detail")} disabled={setupParticipants.length < 3} style={{
          flex: 1, padding: "16px 10px", borderRadius: 12, border: "none",
          background: setupParticipants.length >= 3 ? "linear-gradient(135deg,#e85d5d,#f7b731)" : "#1c1c35",
          color: setupParticipants.length >= 3 ? "#fff" : "#555",
          fontWeight: 700, fontSize: 14, cursor: setupParticipants.length >= 3 ? "pointer" : "not-allowed",
          fontFamily: "inherit", transition: "all 0.2s", textAlign: "center",
          boxShadow: setupParticipants.length >= 3 ? "0 4px 20px #e85d5d33" : "none",
        }}>
          <div style={{ fontSize: 22, marginBottom: 6 }}>🀄</div>
          <div>詳細入力</div>
          <div style={{ fontSize: 11, color: setupParticipants.length >= 3 ? "#ffffff99" : "#333", fontWeight: 400, marginTop: 4 }}>点数から計算</div>
        </button>
      </div>
    </div>
  );

  // 簡単入力：記録
  const submitSimple = () => {
    setSimpleError("");
    const participantIds = session.participantIds;
    const scores = participantIds.map(id => Number(simpleScores[id]) || 0);
    const total = scores.reduce((a, b) => a + b, 0);
    if (total !== 0) return setSimpleError(`合計が ${total > 0 ? "+" : ""}${total} です。合計が±0になるように入力してください`);

    // スコア順に順位を自動判定（同点は入力順）
    const ranked = participantIds
      .map((id, i) => ({ id, score: Number(simpleScores[id]) || 0, i }))
      .sort((a, b) => b.score !== a.score ? b.score - a.score : a.i - b.i);

    const result = participantIds.map(id => {
      const rank = ranked.findIndex(r => r.id === id) + 1;
      return { memberId: id, rawPoints: 0, rank, score: Number(simpleScores[id]) || 0 };
    });

    const updatedSession = { ...session, gameCount: session.gameCount + 1 };
    const newGame = { id: Date.now(), date: session.date, sessionId: session.id, isSimple: true, result };
    const nextGames = [...games, newGame];

    setGames(nextGames);
    setSession(updatedSession);
    setSimpleSaved(true);
    setSimpleScores({});
    onSave(undefined, nextGames, updatedSession);
    setTimeout(() => setSimpleSaved(false), 1500);
  };

  // ── 対局進行中 ──

  // 簡単入力モード
  if (session && inputMode === "simple") return (
    <div>
      <SessionBanner session={session} members={members} onEnd={endSession} />
      {showChipModal && (
        <ChipModal
          session={session}
          members={members}
          onConfirm={finalizeSession}
          onSkip={() => finalizeSession({})}
        />
      )}

      <SectionTitle>成績を入力（{session.gameCount + 1}局目）</SectionTitle>
      <div style={{ fontSize: 12, color: "#666", marginBottom: 12 }}>各プレイヤーの成績を±で入力してください（合計±0）</div>

      {session.participantIds.map(id => {
        const m = members.find(x => x.id === id);
        if (!m) return null;
        const val = simpleScores[id] ?? "";
        const num = Number(val);
        return (
          <Card key={id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Avatar name={m.name} color={m.color} size={30} />
            <span style={{ flex: 1, fontWeight: 700, fontSize: 14 }}>{m.name}</span>
            <input
              type="number" value={val}
              onChange={e => setSimpleScores(prev => ({ ...prev, [id]: e.target.value }))}
              placeholder="0"
              style={{
                width: 90, padding: "9px 12px", borderRadius: 8, textAlign: "right",
                border: "1.5px solid #1c1c35", background: "#080816",
                color: "#fff", fontSize: 16, outline: "none", fontFamily: "inherit",
              }}
            />
            {val !== "" && (
              <span style={{ minWidth: 40, fontSize: 13, fontWeight: 700, color: num >= 0 ? "#34c988" : "#e85d5d" }}>
                {num > 0 ? "+" : ""}{num}
              </span>
            )}
          </Card>
        );
      })}

      {/* 合計表示 */}
      {(() => {
        const total = session.participantIds.reduce((s, id) => s + (Number(simpleScores[id]) || 0), 0);
        const allFilled = session.participantIds.every(id => simpleScores[id] !== undefined && simpleScores[id] !== "");
        if (!allFilled) return null;
        return (
          <Card style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "#666" }}>合計</span>
            <span style={{ fontWeight: 700, color: total === 0 ? "#34c988" : "#e85d5d" }}>
              {total > 0 ? "+" : ""}{total}　{total === 0 ? "✓ OK" : "※ 合計が0になるように入力"}
            </span>
          </Card>
        );
      })()}

      {simpleError && <p style={{ color: "#e85d5d", fontSize: 13, marginBottom: 10 }}>{simpleError}</p>}

      <button onClick={submitSimple} style={{
        width: "100%", padding: 14, borderRadius: 12, border: "none",
        background: simpleSaved ? "#34c988" : "linear-gradient(135deg,#e85d5d,#f7b731)",
        color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer",
        fontFamily: "inherit", transition: "background 0.3s",
        boxShadow: "0 4px 20px #e85d5d33",
      }}>
        {simpleSaved ? `✓ 記録！（計${session.gameCount}局）` : `この対局を記録する（${session.gameCount + 1}局目）`}
      </button>

      {/* セッション内の対局履歴 */}
      {games.filter(g => g.sessionId === session.id).length > 0 && (
        <>
          <div style={{ height: 1, background: "#1c1c35", margin: "20px 0" }} />
          <SectionTitle>この対局の記録</SectionTitle>
          {[...games.filter(g => g.sessionId === session.id)].reverse().map((g, i, arr) => (
            <Card key={g.id} style={{ borderColor: g.isChip ? "#2a2a10" : "#1e2a1e" }}>
              <div style={{ fontSize: 11, color: g.isChip ? "#f7b731" : "#555", marginBottom: 6 }}>
                {g.isChip ? "🪙 チップ" : `第${arr.filter(x => !x.isChip).length - arr.filter(x => !x.isChip).indexOf(g)}局`}
              </div>
              {[...g.result].sort((a, b) => a.rank - b.rank).map(r => {
                const m = members.find(x => x.id === r.memberId);
                if (!m) return null;
                return (
                  <div key={r.memberId} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 10, color: RANK_COLORS[Math.min(r.rank-1,2)], minWidth: 22, fontWeight: 700 }}>
                      {g.isChip ? "" : RANK_LABELS[r.rank-1]}
                    </span>
                    <Avatar name={m.name} color={m.color} size={20} />
                    <span style={{ flex: 1, fontSize: 12, color: "#ccc" }}>{m.name}</span>
                    {g.isChip && <span style={{ fontSize: 11, color: "#f7b731" }}>{r.chips > 0 ? "+" : ""}{r.chips}枚</span>}
                    <ScoreBadge value={r.score} size={12} />
                  </div>
                );
              })}
            </Card>
          ))}
        </>
      )}
    </div>
  );

  return (
    <div>
      <SessionBanner session={session} members={members} onEnd={endSession} />
      {showChipModal && (
        <ChipModal
          session={session}
          members={members}
          onConfirm={finalizeSession}
          onSkip={() => finalizeSession({})}
        />
      )}

      {/* 今局のメンバー選択 */}
      <SectionTitle>今局の3人を選択</SectionTitle>
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {participantMembers.map(m => {
            const seatIdx = selected.indexOf(m.id);
            const isSel = seatIdx !== -1;
            const full = selected.filter(Boolean).length >= 3 && !isSel;
            return (
              <button key={m.id} onClick={() => !full && toggleSelected(m.id)} style={{
                display: "flex", alignItems: "center", gap: 7,
                padding: "8px 14px", borderRadius: 24,
                border: `2px solid ${isSel ? m.color : "#2a2a40"}`,
                background: isSel ? m.color + "22" : "transparent",
                color: isSel ? m.color : full ? "#333" : "#888",
                fontFamily: "inherit", fontSize: 13, fontWeight: isSel ? 700 : 400,
                cursor: full ? "not-allowed" : "pointer",
                transition: "all 0.15s", position: "relative",
              }}>
                <Avatar name={m.name} color={isSel ? m.color : "#555"} size={22} />
                {m.name}
                {isSel && (
                  <span style={{
                    position: "absolute", top: -6, right: -6,
                    width: 16, height: 16, borderRadius: "50%",
                    background: m.color, color: "#fff",
                    fontSize: 10, fontWeight: 800,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>{seatIdx + 1}</span>
                )}
              </button>
            );
          })}
        </div>
      </Card>

      {/* 点数入力 */}
      <SectionTitle>点数を入力</SectionTitle>
      {selected.map((memberId, si) => {
        const m = memberId ? members.find(x => x.id === memberId) : null;
        return (
          <Card key={si} style={{ opacity: m ? 1 : 0.4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              {m
                ? <><Avatar name={m.name} color={m.color} size={28} /><span style={{ fontWeight: 700, color: m.color }}>{m.name}</span></>
                : <span style={{ color: "#444", fontSize: 13 }}>（未選択）</span>
              }
              <span style={{ marginLeft: "auto", fontSize: 11, color: "#444" }}>席 {si + 1}</span>
            </div>
            <input
              type="number" value={points[si]}
              onChange={e => setPoints(prev => { const n = [...prev]; n[si] = e.target.value; return n; })}
              placeholder="終了点数 (例: 45600)"
              disabled={!m}
              style={{
                width: "100%", padding: "9px 12px", borderRadius: 8,
                border: "1.5px solid #1c1c35", background: m ? "#080816" : "#060610",
                color: "#fff", fontSize: 14, outline: "none",
                fontFamily: "inherit", boxSizing: "border-box",
              }}
            />
          </Card>
        );
      })}

      {/* 合計 */}
      <Card style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 12, color: "#666" }}>合計点数</span>
        <span style={{ fontWeight: 700, color: total === expected ? "#34c988" : total > 0 ? "#f7b731" : "#666" }}>
          {total.toLocaleString()} / {expected.toLocaleString()}
        </span>
      </Card>

      {/* 飛び賞 */}
      {rules.tobi && (
        <>
          <SectionTitle style={{ marginTop: 16 }}>飛び賞</SectionTitle>
          <Card>
            <div style={{ fontSize: 12, color: "#666", marginBottom: 10 }}>
              {tobiStep
                ? <span style={{ color: "#f7b731" }}>次に「飛ばした人」をタップ</span>
                : "「飛ばされた人」→「飛ばした人」の順にタップ"
              }
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: tobiList.length > 0 ? 10 : 0 }}>
              {selectedMembers.filter(Boolean).map(m => {
                const isFlown = tobiStep?.flownId === m.id;
                return (
                  <button key={m.id} onClick={() => handleTobiSelect(m.id)} style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "6px 12px", borderRadius: 20,
                    border: `2px solid ${isFlown ? "#f7b731" : "#2a2a40"}`,
                    background: isFlown ? "#f7b73122" : "transparent",
                    color: isFlown ? "#f7b731" : "#888",
                    fontFamily: "inherit", fontSize: 13, cursor: "pointer", transition: "all 0.15s",
                  }}>
                    <Avatar name={m.name} color={m.color} size={20} />
                    {m.name}
                  </button>
                );
              })}
            </div>
            {tobiList.map((t, i) => {
              const flown = members.find(m => m.id === t.flownId);
              const flyer = members.find(m => m.id === t.flyerId);
              return (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "5px 10px", borderRadius: 8,
                  background: "#0a1a0a", border: "1px solid #1a3a1a",
                  marginBottom: 4, fontSize: 12,
                }}>
                  <Avatar name={flown?.name || "?"} color={flown?.color || "#555"} size={18} />
                  <span style={{ color: "#e85d5d" }}>{flown?.name}</span>
                  <span style={{ color: "#555" }}>が飛ばされた →</span>
                  <Avatar name={flyer?.name || "?"} color={flyer?.color || "#555"} size={18} />
                  <span style={{ color: "#34c988" }}>{flyer?.name} +10</span>
                  <button onClick={() => removeTobi(i)} style={{
                    marginLeft: "auto", padding: "1px 7px", borderRadius: 4,
                    border: "1px solid #2a3a2a", background: "transparent",
                    color: "#555", cursor: "pointer", fontSize: 10,
                  }}>×</button>
                </div>
              );
            })}
          </Card>
        </>
      )}

      {/* 焼き鳥 */}
      {rules.yakitori && (
        <>
          <SectionTitle style={{ marginTop: 4 }}>焼き鳥</SectionTitle>
          <Card>
            <div style={{ fontSize: 12, color: "#666", marginBottom: 10 }}>焼き鳥になった人を選択（他2人に−5ずつ）</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {selectedMembers.filter(Boolean).map(m => {
                const isYaki = yakitoriList.includes(m.id);
                return (
                  <button key={m.id} onClick={() => toggleYakitori(m.id)} style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "6px 12px", borderRadius: 20,
                    border: `2px solid ${isYaki ? "#f95ca8" : "#2a2a40"}`,
                    background: isYaki ? "#f95ca822" : "transparent",
                    color: isYaki ? "#f95ca8" : "#888",
                    fontFamily: "inherit", fontSize: 13, cursor: "pointer", transition: "all 0.15s",
                  }}>
                    <Avatar name={m.name} color={m.color} size={20} />
                    {m.name}
                    {isYaki && <span style={{ fontSize: 11 }}>🔥</span>}
                  </button>
                );
              })}
            </div>
          </Card>
        </>
      )}

      {recordError && <p style={{ color: "#e85d5d", fontSize: 13, marginBottom: 10 }}>{recordError}</p>}

      <button onClick={submit} style={{
        width: "100%", padding: 14, borderRadius: 12, border: "none",
        background: saved ? "#34c988" : "linear-gradient(135deg,#e85d5d,#f7b731)",
        color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer",
        fontFamily: "inherit", transition: "background 0.3s",
        boxShadow: "0 4px 20px #e85d5d33",
      }}>
        {saved ? `✓ 記録！（計${session.gameCount}局）` : `この対局を記録する（${session.gameCount + 1}局目）`}
      </button>

      {/* 対局履歴 */}
      {games.filter(g => g.sessionId === session.id).length > 0 && (
        <>
          <div style={{ height: 1, background: "#1c1c35", margin: "20px 0" }} />
          <SectionTitle>この対局の記録</SectionTitle>
          {[...games.filter(g => g.sessionId === session.id)].reverse().map((g, i, arr) => (
            <Card key={g.id} style={{ borderColor: g.isChip ? "#2a2a10" : "#1e2a1e" }}>
              <div style={{ fontSize: 11, color: g.isChip ? "#f7b731" : "#555", marginBottom: 6 }}>
                {g.isChip ? "🪙 チップ" : `第${arr.filter(x => !x.isChip).length - arr.filter(x => !x.isChip).indexOf(g)}局`}
              </div>
              {[...g.result].sort((a,b) => b.score - a.score).map(r => {
                const m = members.find(x => x.id === r.memberId);
                if (!m) return null;
                return (
                  <div key={r.memberId} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    {!g.isChip && <span style={{ fontSize: 10, color: RANK_COLORS[r.rank-1], minWidth: 22, fontWeight: 700 }}>{RANK_LABELS[r.rank-1]}</span>}
                    {g.isChip && <span style={{ fontSize: 10, color: "#555", minWidth: 22 }}></span>}
                    <Avatar name={m.name} color={m.color} size={20} />
                    <span style={{ flex: 1, fontSize: 12, color: "#ccc" }}>{m.name}</span>
                    {g.isChip
                      ? <span style={{ fontSize: 11, color: "#f7b731" }}>{r.chips > 0 ? "+" : ""}{r.chips}枚</span>
                      : <span style={{ fontSize: 11, color: "#555" }}>{r.rawPoints.toLocaleString()}</span>
                    }
                    {r.yakitori && <span style={{ fontSize: 10 }}>🔥</span>}
                    {r.tobi && r.tobi.length > 0 && <span style={{ fontSize: 10, color: r.tobi.some(t => t.flyerId === r.memberId) ? "#34c988" : "#e85d5d" }}>✈</span>}
                    <ScoreBadge value={r.score} size={12} />
                  </div>
                );
              })}
            </Card>
          ))}
        </>
      )}
    </div>
  );
}

// ============================================================
// Members Tab
// ============================================================
function MembersTab({ members, setMembers, onSave }) {
  const [name, setName] = useState("");

  const add = () => {
    const t = name.trim();
    if (!t || members.find(m => m.name === t)) return;
    const next = [...members, { id: Date.now(), name: t, color: COLORS[members.length % COLORS.length] }];
    setMembers(next);
    onSave(next, undefined, undefined);
    setName("");
  };

  const remove = (id) => {
    const next = members.filter(m => m.id !== id);
    setMembers(next);
    onSave(next, undefined, undefined);
  };

  return (
    <div>
      <p style={{ color: "#666", fontSize: 13, marginBottom: 16 }}>メンバーを追加・削除できます</p>
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <input
          value={name} onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === "Enter" && add()}
          placeholder="名前を入力して追加"
          style={{
            flex: 1, padding: "10px 14px", borderRadius: 10,
            border: "1.5px solid #1c1c35", background: "#080816",
            color: "#fff", fontSize: 14, outline: "none", fontFamily: "inherit",
          }}
        />
        <button onClick={add} style={{
          padding: "10px 18px", borderRadius: 10, border: "none",
          background: "linear-gradient(135deg,#e85d5d,#f7b731)",
          color: "#fff", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", fontSize: 14,
        }}>追加</button>
      </div>
      {members.map((m, i) => (
        <Card key={m.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Avatar name={m.name} color={m.color} />
          <span style={{ flex: 1, fontWeight: 600 }}>{m.name}</span>
          {i < DEFAULT_MEMBERS.length
            ? <span style={{ fontSize: 10, color: "#444", padding: "3px 8px" }}>デフォルト</span>
            : <button onClick={() => remove(m.id)} style={{
                padding: "4px 12px", borderRadius: 6, border: "1px solid #2a2a40",
                background: "transparent", color: "#666", cursor: "pointer", fontSize: 12,
              }}>削除</button>
          }
        </Card>
      ))}
      {members.length === 0 && <p style={{ color: "#444", textAlign: "center", padding: "30px 0" }}>まだメンバーがいません</p>}
    </div>
  );
}

// ============================================================
// 編集モーダル
// ============================================================
function EditModal({ game, members, allMembers, onSave, onClose }) {
  const isChip = game.isChip;
  const isSimple = game.isSimple;

  // 日付
  const dateToISO = (jaDate) => {
    // "YYYY/M/D" → "YYYY-MM-DD"
    const [y, m, d] = jaDate.replace(/\//g, "-").split("-");
    return `${y}-${m.padStart(2,"0")}-${d.padStart(2,"0")}`;
  };
  const [editDate, setEditDate] = useState(dateToISO(game.date));

  // 参加者（チップ・通常共通）
  const currentParticipantIds = [...new Set(game.result.map(r => r.memberId))];
  const [participantIds, setParticipantIds] = useState(currentParticipantIds);
  const toggleParticipant = (id) => {
    setParticipantIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  // チップ編集
  const [chips, setChips] = useState(
    Object.fromEntries(game.result.map(r => [r.memberId, r.chips ?? 0]))
  );

  // 通常対局 / 簡単入力 編集
  const [scores, setScores] = useState(
    Object.fromEntries(game.result.map(r => [r.memberId, isSimple ? r.score : r.rawPoints]))
  );

  const [error, setError] = useState("");

  const handleSave = () => {
    setError("");
    const newDate = new Date(editDate + "T00:00:00").toLocaleDateString("ja-JP");

    if (isChip) {
      // チップ合計チェック
      const total = participantIds.reduce((s, id) => s + (Number(chips[id]) || 0), 0);
      if (total !== 0) return setError(`チップ合計が ${total > 0 ? "+" : ""}${total} です。±0になるように入力してください`);
      const newResult = participantIds.map(id => ({
        memberId: id, rawPoints: 0, rank: 0,
        score: (Number(chips[id]) || 0) * 2,
        chips: Number(chips[id]) || 0,
      })).filter(r => r.chips !== 0);
      onSave({ ...game, date: newDate, result: newResult });
      return;
    }

    if (isSimple) {
      // 簡単入力: スコア合計チェック
      const total = participantIds.reduce((s, id) => s + (Number(scores[id]) || 0), 0);
      if (total !== 0) return setError(`合計が ${total > 0 ? "+" : ""}${total} です。±0になるように入力してください`);
      const ranked = participantIds
        .map((id, i) => ({ id, score: Number(scores[id]) || 0, i }))
        .sort((a, b) => b.score !== a.score ? b.score - a.score : a.i - b.i);
      const newResult = participantIds.map(id => ({
        memberId: id, rawPoints: 0,
        rank: ranked.findIndex(r => r.id === id) + 1,
        score: Number(scores[id]) || 0,
      }));
      onSave({ ...game, date: newDate, result: newResult });
      return;
    }

    // 詳細入力: 点数から再計算
    const pts = participantIds.map(id => Number(scores[id]) || 0);
    const ptTotal = pts.reduce((a, b) => a + b, 0);
    if (ptTotal !== RULES.startPoints * participantIds.length) {
      return setError(`合計が${ptTotal.toLocaleString()}点です。${(RULES.startPoints * participantIds.length).toLocaleString()}点になるように入力してください`);
    }
    const ranked = participantIds
      .map((id, i) => ({ id, pt: Number(scores[id]) || 0, i }))
      .sort((a, b) => b.pt !== a.pt ? b.pt - a.pt : a.i - b.i);
    const newResult = participantIds.map(id => {
      const rank = ranked.findIndex(r => r.id === id) + 1;
      return { memberId: id, rawPoints: Number(scores[id]) || 0, rank, score: calcScore(Number(scores[id]) || 0, rank) };
    });
    onSave({ ...game, date: newDate, result: newResult });
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)",
      display: "flex", alignItems: "flex-start", justifyContent: "center",
      zIndex: 1000, padding: "20px", overflowY: "auto",
    }}>
      <div style={{
        background: "#0c0c1e", border: "1px solid #2a2a40",
        borderRadius: 18, padding: "24px 20px", width: "100%", maxWidth: 440,
        marginTop: 20,
      }}>
        <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 20 }}>
          {isChip ? "🪙 チップを編集" : "✏️ 対局を編集"}
        </div>

        {/* 日付 */}
        <SectionTitle>日付</SectionTitle>
        <Card style={{ marginBottom: 16 }}>
          <input
            type="date" value={editDate} onChange={e => setEditDate(e.target.value)}
            style={{
              width: "100%", padding: "8px 10px", borderRadius: 8,
              border: "1.5px solid #2a2a40", background: "#080816",
              color: "#e0e0e0", fontSize: 15, fontFamily: "inherit", outline: "none",
              boxSizing: "border-box",
            }}
          />
        </Card>

        {/* 参加者 */}
        <SectionTitle>参加者</SectionTitle>
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {allMembers.map(m => {
              const sel = participantIds.includes(m.id);
              return (
                <button key={m.id} onClick={() => toggleParticipant(m.id)} style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "6px 12px", borderRadius: 20,
                  border: `2px solid ${sel ? m.color : "#2a2a40"}`,
                  background: sel ? m.color + "22" : "transparent",
                  color: sel ? m.color : "#888",
                  fontFamily: "inherit", fontSize: 13, fontWeight: sel ? 700 : 400,
                  cursor: "pointer", transition: "all 0.15s",
                }}>
                  <Avatar name={m.name} color={sel ? m.color : "#555"} size={20} />
                  {m.name}
                </button>
              );
            })}
          </div>
        </Card>

        {/* チップ入力 */}
        {isChip && (
          <>
            <SectionTitle>チップ枚数</SectionTitle>
            {participantIds.map(id => {
              const m = allMembers.find(x => x.id === id);
              if (!m) return null;
              const val = chips[id] ?? 0;
              return (
                <Card key={id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Avatar name={m.name} color={m.color} size={26} />
                  <span style={{ flex: 1, fontWeight: 600 }}>{m.name}</span>
                  <input
                    type="number" value={val}
                    onChange={e => setChips(prev => ({ ...prev, [id]: e.target.value }))}
                    style={{
                      width: 80, padding: "8px 10px", borderRadius: 8, textAlign: "right",
                      border: "1.5px solid #2a2a40", background: "#080816",
                      color: "#fff", fontSize: 14, outline: "none", fontFamily: "inherit",
                    }}
                  />
                  <span style={{ fontSize: 12, color: "#555" }}>枚</span>
                  <span style={{ minWidth: 40, textAlign: "right", fontSize: 13, fontWeight: 700,
                    color: (Number(val)||0) >= 0 ? "#34c988" : "#e85d5d" }}>
                    {(Number(val)||0) >= 0 ? "+" : ""}{(Number(val)||0) * 2}
                  </span>
                </Card>
              );
            })}
          </>
        )}

        {/* スコア入力（通常 or 簡単） */}
        {!isChip && (
          <>
            <SectionTitle>{isSimple ? "成績（±）" : "終了点数"}</SectionTitle>
            {participantIds.map(id => {
              const m = allMembers.find(x => x.id === id);
              if (!m) return null;
              return (
                <Card key={id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Avatar name={m.name} color={m.color} size={26} />
                  <span style={{ flex: 1, fontWeight: 600 }}>{m.name}</span>
                  <input
                    type="number" value={scores[id] ?? ""}
                    onChange={e => setScores(prev => ({ ...prev, [id]: e.target.value }))}
                    placeholder={isSimple ? "0" : "35000"}
                    style={{
                      width: 100, padding: "8px 10px", borderRadius: 8, textAlign: "right",
                      border: "1.5px solid #2a2a40", background: "#080816",
                      color: "#fff", fontSize: 14, outline: "none", fontFamily: "inherit",
                    }}
                  />
                  {isSimple && scores[id] !== "" && scores[id] !== undefined && (
                    <span style={{ minWidth: 36, textAlign: "right", fontSize: 13, fontWeight: 700,
                      color: (Number(scores[id])||0) >= 0 ? "#34c988" : "#e85d5d" }}>
                      {(Number(scores[id])||0) > 0 ? "+" : ""}{Number(scores[id])||0}
                    </span>
                  )}
                </Card>
              );
            })}
          </>
        )}

        {error && <p style={{ color: "#e85d5d", fontSize: 13, margin: "8px 0" }}>{error}</p>}

        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: "12px", borderRadius: 10, border: "1px solid #2a2a40",
            background: "transparent", color: "#666", cursor: "pointer",
            fontSize: 14, fontFamily: "inherit",
          }}>キャンセル</button>
          <button onClick={handleSave} style={{
            flex: 2, padding: "12px", borderRadius: 10, border: "none",
            background: "linear-gradient(135deg,#4f9cf9,#34c988)",
            color: "#fff", fontWeight: 700, cursor: "pointer",
            fontSize: 14, fontFamily: "inherit",
          }}>保存</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 日別詳細ページ
// ============================================================
function DayDetailPage({ date, dayGames, members, allMembers, onBack, onDeleteGame, onDeleteAll, onEditGame }) {
  const [editingGame, setEditingGame] = useState(null);

  const dayTotal = {};
  members.forEach(m => { dayTotal[m.id] = 0; });
  dayGames.forEach(g => g.result.forEach(r => {
    if (dayTotal[r.memberId] !== undefined) dayTotal[r.memberId] += r.score;
  }));
  const dayParticipants = members
    .filter(m => dayGames.some(g => g.result.find(r => r.memberId === m.id)))
    .sort((a, b) => dayTotal[b.id] - dayTotal[a.id]);

  return (
    <div>
      {editingGame && (
        <EditModal
          game={editingGame}
          members={members}
          allMembers={allMembers}
          onSave={(updated) => { onEditGame(updated); setEditingGame(null); }}
          onClose={() => setEditingGame(null)}
        />
      )}
      {/* 戻るボタン + 日付 */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={onBack} style={{
          padding: "7px 14px", borderRadius: 9, border: "1px solid #2a2a40",
          background: "transparent", color: "#aaa", cursor: "pointer",
          fontSize: 13, fontFamily: "inherit",
        }}>← 戻る</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 17 }}>{date}</div>
          <div style={{ fontSize: 11, color: "#555" }}>{dayGames.length}対局</div>
        </div>
        <button onClick={() => { if (window.confirm(`${date}の対局データをすべて削除しますか？`)) onDeleteAll(); }} style={{
          padding: "7px 12px", borderRadius: 9, border: "1px solid #3a2a2a",
          background: "transparent", color: "#e85d5d", cursor: "pointer",
          fontSize: 12, fontFamily: "inherit",
        }}>この日を全削除</button>
      </div>

      {/* 日計サマリー */}
      <SectionTitle>日計</SectionTitle>
      <Card style={{ marginBottom: 20 }}>
        {dayParticipants.map((m, i) => (
          <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: i < dayParticipants.length - 1 ? 10 : 0 }}>
            <span style={{ fontSize: 16, minWidth: 24, color: i < 3 ? RANK_COLORS[i] : "#444", fontWeight: 800 }}>{i + 1}</span>
            <Avatar name={m.name} color={m.color} size={30} />
            <span style={{ flex: 1, fontWeight: 700 }}>{m.name}</span>
            <ScoreBadge value={dayTotal[m.id]} size={16} />
          </div>
        ))}
      </Card>

      {/* 対局一覧 */}
      <SectionTitle>対局一覧</SectionTitle>
      {dayGames.map((g, gi) => {
        const normalGames = dayGames.filter(x => !x.isChip);
        const normalIdx = normalGames.indexOf(g);
        return (
          <Card key={g.id} style={{ borderColor: g.isChip ? "#2a2a10" : undefined }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ fontSize: 12, color: g.isChip ? "#f7b731" : "#888", fontWeight: 700 }}>
                {g.isChip ? "🪙 チップ" : `第${normalIdx + 1}局`}
              </span>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => setEditingGame(g)} style={{
                  padding: "3px 10px", borderRadius: 6, border: "1px solid #2a3a4a",
                  background: "transparent", color: "#4f9cf9", cursor: "pointer", fontSize: 11,
                }}>編集</button>
                <button onClick={() => onDeleteGame(g.id)} style={{
                  padding: "3px 10px", borderRadius: 6, border: "1px solid #2a2a40",
                  background: "transparent", color: "#555", cursor: "pointer", fontSize: 11,
                }}>削除</button>
              </div>
            </div>
            {[...g.result].sort((a, b) => g.isChip ? b.score - a.score : a.rank - b.rank).map(r => {
              const m = members.find(x => x.id === r.memberId);
              if (!m) return null;
              return (
                <div key={r.memberId} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  {!g.isChip && <span style={{ fontSize: 11, color: RANK_COLORS[r.rank-1], minWidth: 22, fontWeight: 700 }}>{RANK_LABELS[r.rank-1]}</span>}
                  {g.isChip && <span style={{ minWidth: 22 }} />}
                  <Avatar name={m.name} color={m.color} size={24} />
                  <span style={{ flex: 1, fontSize: 13, color: "#ccc" }}>{m.name}</span>
                  {g.isChip
                    ? <span style={{ fontSize: 12, color: "#f7b731" }}>{r.chips > 0 ? "+" : ""}{r.chips}枚</span>
                    : <span style={{ fontSize: 12, color: "#555" }}>{r.rawPoints.toLocaleString()}点</span>
                  }
                  <ScoreBadge value={r.score} size={14} />
                </div>
              );
            })}
          </Card>
        );
      })}
    </div>
  );
}

// ============================================================
// Stats Tab
// ============================================================
function StatsTab({ members, games, setGames, onSave }) {
  const [subTab, setSubTab] = useState("ranking");
  const [focusMember, setFocusMember] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [rankingMode, setRankingMode] = useState("total"); // "total" | "chip"
  const [graphMode, setGraphMode] = useState("total");     // "total" | "chip"
  const [graphPeriodType, setGraphPeriodType] = useState("all"); // "all" | "day" | "month" | "year"
  const [graphPeriodValue, setGraphPeriodValue] = useState(""); 

  const toDate = s => new Date(s.replace(/\//g, "-").replace(/(\d+)-(\d+)-(\d+)/, (_, y, mo, d) => `${y}-${mo.padStart(2,"0")}-${d.padStart(2,"0")}`));

  const buildStats = (targetGames) => {
    const map = {};
    members.forEach(m => { map[m.id] = { ...m, games: 0, total: 0, ranks: [0,0,0] }; });
    targetGames.forEach(g => g.result.forEach(r => {
      if (!map[r.memberId]) return;
      map[r.memberId].games++;
      map[r.memberId].total += r.score;
      if (r.rank >= 1 && r.rank <= 3) map[r.memberId].ranks[r.rank - 1]++;
    }));
    return Object.values(map).sort((a,b) => b.total - a.total);
  };

  const buildChartData = (targetGames) => {
    const sorted = [...targetGames].sort((a, b) => toDate(a.date) - toDate(b.date));
    const cum = {};
    members.forEach(m => { cum[m.id] = 0; });
    return sorted.map((g, i) => {
      g.result.forEach(r => { if (cum[r.memberId] !== undefined) cum[r.memberId] += r.score; });
      return { game: i + 1, ...Object.fromEntries(members.map(m => [m.id, Math.round(cum[m.id] * 10) / 10])) };
    });
  };

  // 総合（通常+チップ合算）
  const stats = useMemo(() => buildStats(games), [members, games]);
  // チップのみ
  const chipStats = useMemo(() => buildStats(games.filter(g => g.isChip)), [members, games]);

  const activeMembers = useMemo(() => members.filter(m =>
    games.some(g => g.result.find(r => r.memberId === m.id))
  ), [members, games]);
  const chipActiveMembers = useMemo(() => members.filter(m =>
    games.filter(g => g.isChip).some(g => g.result.find(r => r.memberId === m.id))
  ), [members, games]);

  // 総合グラフ（通常+チップ合算）
  const chartData = useMemo(() => buildChartData(games), [members, games]);
  // チップのみグラフ
  const chipChartData = useMemo(() => buildChartData(games.filter(g => g.isChip)), [members, games]);

  const h2hData = useMemo(() => {
    if (!focusMember) return null;
    const result = {};
    members.forEach(m => {
      if (m.id === focusMember) return;
      result[m.id] = { ...m, togetherGames: 0, wins: 0, totalScore: 0, vsScore: 0 };
    });
    games.forEach(g => {
      const me = g.result.find(r => r.memberId === focusMember);
      if (!me) return;
      g.result.forEach(r => {
        if (r.memberId === focusMember || !result[r.memberId]) return;
        result[r.memberId].togetherGames++;
        result[r.memberId].totalScore += me.score;
        result[r.memberId].vsScore += (me.score - r.score);
        if (me.rank < r.rank) result[r.memberId].wins++;
      });
    });
    return Object.values(result);
  }, [focusMember, members, games]);

  const deleteGame = (id) => {
    const next = games.filter(g => g.id !== id);
    setGames(next);
    onSave(undefined, next, undefined);
  };

  const deleteDayGames = (date) => {
    const next = games.filter(g => g.date !== date);
    setGames(next);
    onSave(undefined, next, undefined);
  };

  const editGame = (updated) => {
    const next = games.map(g => g.id === updated.id ? updated : g);
    setGames(next);
    onSave(undefined, next, undefined);
    // 日付が変わった場合はselectedDateも更新
    if (selectedDate && updated.date !== selectedDate) {
      setSelectedDate(updated.date);
    }
  };

  return (
    <div>
      <SubTabBar
        tabs={[
          { key: "ranking", label: "🏆 順位表" },
          { key: "graph",   label: "📈 グラフ" },
          { key: "h2h",     label: "⚔️ 相手別" },
        ]}
        active={subTab} onChange={setSubTab}
      />

      {/* ── 順位表 ── */}
      {subTab === "ranking" && !selectedDate && (
        <div>
          {/* トグル */}
          <div style={{ display: "flex", gap: 0, marginBottom: 16, borderRadius: 10, overflow: "hidden", border: "1px solid #2a2a40", width: "fit-content" }}>
            {[["total","💯 総合"],["chip","🪙 チップ"]].map(([key, label]) => (
              <button key={key} onClick={() => setRankingMode(key)} style={{
                padding: "7px 18px", border: "none", fontFamily: "inherit", fontSize: 13,
                fontWeight: rankingMode === key ? 700 : 400,
                background: rankingMode === key ? "#2a2a50" : "transparent",
                color: rankingMode === key ? "#fff" : "#555",
                cursor: "pointer", transition: "all 0.15s",
              }}>{label}</button>
            ))}
          </div>

          {(() => {
            const currentStats = rankingMode === "chip" ? chipStats : stats;
            return currentStats.filter(s => s.games > 0).length === 0
              ? <p style={{ color: "#444", textAlign: "center", padding: "40px 0" }}>
                  {rankingMode === "chip" ? "チップが記録されていません" : "対局を記録しましょう"}
                </p>
              : currentStats.filter(s => s.games > 0).map((m, i) => (
                <Card key={m.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontSize: 20, minWidth: 28, color: i < 3 ? RANK_COLORS[i] : "#444", fontWeight: 800 }}>{i + 1}</span>
                  <Avatar name={m.name} color={m.color} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, marginBottom: 2 }}>{m.name}</div>
                    <div style={{ fontSize: 11, color: "#555" }}>
                      {rankingMode === "chip"
                        ? <>{m.games}回参加</>
                        : <>{m.games}戦　<span style={{ color: RANK_COLORS[0] }}>1位:{m.ranks[0]}</span>　<span style={{ color: RANK_COLORS[1] }}>2位:{m.ranks[1]}</span>　<span style={{ color: RANK_COLORS[2] }}>3位:{m.ranks[2]}</span>　1位率:{m.games > 0 ? Math.round(m.ranks[0]/m.games*100) : 0}%</>
                      }
                    </div>
                  </div>
                  <ScoreBadge value={m.total} size={18} />
                </Card>
              ));
          })()}

          {games.length > 0 && (() => {
            const byDate = {};
            [...games].forEach(g => {
              if (!byDate[g.date]) byDate[g.date] = [];
              byDate[g.date].push(g);
            });
            const toDate = s => new Date(s.replace(/\//g, "-").replace(/(\d+)-(\d+)-(\d+)/, (_, y, mo, d) => `${y}-${mo.padStart(2,"0")}-${d.padStart(2,"0")}`));
            const sortedDates = Object.keys(byDate).sort((a, b) => toDate(b) - toDate(a));

            return (
              <>
                <div style={{ height: 1, background: "#1c1c35", margin: "20px 0" }} />
                <SectionTitle>日別対局履歴</SectionTitle>
                {sortedDates.map(date => {
                  const dayGames = byDate[date];
                  const dayTotal = {};
                  members.forEach(m => { dayTotal[m.id] = 0; });
                  dayGames.forEach(g => g.result.forEach(r => {
                    if (dayTotal[r.memberId] !== undefined) dayTotal[r.memberId] += r.score;
                  }));
                  const dayParticipants = members
                    .filter(m => dayGames.some(g => g.result.find(r => r.memberId === m.id)))
                    .sort((a, b) => dayTotal[b.id] - dayTotal[a.id]);

                  return (
                    <button key={date} onClick={() => setSelectedDate(date)} style={{
                      width: "100%", textAlign: "left", cursor: "pointer",
                      padding: "14px 16px", borderRadius: 14,
                      background: "#0c0c1e", border: "1px solid #1c1c35",
                      marginBottom: 10, fontFamily: "inherit",
                      transition: "border-color 0.15s",
                    }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = "#3a3a5a"}
                    onMouseLeave={e => e.currentTarget.style.borderColor = "#1c1c35"}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                        <span style={{ fontWeight: 700, fontSize: 15, color: "#e0e0e0" }}>{date}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 12, color: "#555" }}>{dayGames.length}対局</span>
                          <span
                            onClick={e => { e.stopPropagation(); if (window.confirm(`${date}の対局データをすべて削除しますか？`)) deleteDayGames(date); }}
                            style={{ fontSize: 11, color: "#555", padding: "3px 8px", borderRadius: 5, border: "1px solid #2a2a40", cursor: "pointer" }}
                          >削除</span>
                          <span style={{ fontSize: 14, color: "#444" }}>›</span>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        {dayParticipants.map((m, ri) => (
                          <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                            <span style={{ fontSize: 11, color: RANK_COLORS[Math.min(ri, 2)], fontWeight: 700 }}>{ri + 1}.</span>
                            <Avatar name={m.name} color={m.color} size={20} />
                            <span style={{ fontSize: 12, color: "#bbb" }}>{m.name}</span>
                            <ScoreBadge value={dayTotal[m.id]} size={12} />
                          </div>
                        ))}
                      </div>
                    </button>
                  );
                })}
              </>
            );
          })()}
        </div>
      )}

      {/* ── 日別詳細ページ ── */}
      {subTab === "ranking" && selectedDate && (() => {
        const dayGames = games.filter(g => g.date === selectedDate);
        return (
          <DayDetailPage
            date={selectedDate}
            dayGames={dayGames}
            members={members}
            allMembers={members}
            onBack={() => setSelectedDate(null)}
            onDeleteGame={(id) => {
              deleteGame(id);
              if (games.filter(g => g.date === selectedDate).length <= 1) setSelectedDate(null);
            }}
            onDeleteAll={() => {
              deleteDayGames(selectedDate);
              setSelectedDate(null);
            }}
            onEditGame={editGame}
          />
        );
      })()}

      {/* ── グラフ ── */}
      {subTab === "graph" && (
        <div>
          {/* 総合/チップ トグル */}
          <div style={{ display: "flex", gap: 0, marginBottom: 10, borderRadius: 10, overflow: "hidden", border: "1px solid #2a2a40", width: "fit-content" }}>
            {[["total","💯 総合"],["chip","🪙 チップ"]].map(([key, label]) => (
              <button key={key} onClick={() => setGraphMode(key)} style={{
                padding: "7px 18px", border: "none", fontFamily: "inherit", fontSize: 13,
                fontWeight: graphMode === key ? 700 : 400,
                background: graphMode === key ? "#2a2a50" : "transparent",
                color: graphMode === key ? "#fff" : "#555",
                cursor: "pointer", transition: "all 0.15s",
              }}>{label}</button>
            ))}
          </div>

          {/* 期間種別トグル */}
          <div style={{ display: "flex", gap: 0, marginBottom: 14, borderRadius: 10, overflow: "hidden", border: "1px solid #2a2a40", width: "fit-content" }}>
            {[["all","総合"],["day","日別"],["month","月別"],["year","年別"]].map(([key, label]) => (
              <button key={key} onClick={() => { setGraphPeriodType(key); setGraphPeriodValue(""); }} style={{
                padding: "6px 13px", border: "none", fontFamily: "inherit", fontSize: 12,
                fontWeight: graphPeriodType === key ? 700 : 400,
                background: graphPeriodType === key ? "#1a3a5a" : "transparent",
                color: graphPeriodType === key ? "#4f9cf9" : "#555",
                cursor: "pointer", transition: "all 0.15s",
              }}>{label}</button>
            ))}
          </div>

          {(() => {
            const baseGames = graphMode === "chip" ? games.filter(g => g.isChip) : games;
            const currentMembers = graphMode === "chip" ? chipActiveMembers : activeMembers;

            // 日・月・年の選択肢を生成
            const allDays   = [...new Set(baseGames.map(g => g.date.replace(/-/g,"/")))].sort();
            const allMonths = [...new Set(baseGames.map(g => { const d = toDate(g.date); return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,"0")}`; }))].sort();
            const allYears  = [...new Set(baseGames.map(g => String(toDate(g.date).getFullYear())))].sort();

            // 期間でフィルタ
            let filteredGames = baseGames;
            if (graphPeriodType === "day" && graphPeriodValue) {
              filteredGames = baseGames.filter(g => g.date.replace(/-/g,"/") === graphPeriodValue);
            } else if (graphPeriodType === "month" && graphPeriodValue) {
              filteredGames = baseGames.filter(g => {
                const d = toDate(g.date);
                return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,"0")}` === graphPeriodValue;
              });
            } else if (graphPeriodType === "year" && graphPeriodValue) {
              filteredGames = baseGames.filter(g => String(toDate(g.date).getFullYear()) === graphPeriodValue);
            }

            // グラフデータ生成（フィルタ後のゲームで累計）
            const sorted = [...filteredGames].sort((a, b) => toDate(a.date) - toDate(b.date));
            const cum = {};
            members.forEach(m => { cum[m.id] = 0; });
            const currentChartData = sorted.map((g, i) => {
              g.result.forEach(r => { if (cum[r.memberId] !== undefined) cum[r.memberId] += r.score; });
              return { game: i + 1, ...Object.fromEntries(members.map(m => [m.id, Math.round(cum[m.id] * 10) / 10])) };
            });

            const needsSelect = graphPeriodType !== "all";
            const options = graphPeriodType === "day" ? allDays : graphPeriodType === "month" ? allMonths : allYears;
            const dropdownLabel = { day: "日付を選択", month: "月を選択", year: "年を選択" }[graphPeriodType];

            return (
              <>
                {/* ドロップダウン */}
                {needsSelect && (
                  <div style={{ marginBottom: 16 }}>
                    <select
                      value={graphPeriodValue}
                      onChange={e => setGraphPeriodValue(e.target.value)}
                      style={{
                        padding: "8px 12px", borderRadius: 8, border: "1.5px solid #2a2a40",
                        background: "#080816", color: graphPeriodValue ? "#e0e0e0" : "#555",
                        fontSize: 13, fontFamily: "inherit", outline: "none", width: "100%",
                      }}
                    >
                      <option value="">{dropdownLabel}</option>
                      {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>
                )}

                {(needsSelect && !graphPeriodValue)
                  ? <p style={{ color: "#444", textAlign: "center", padding: "30px 0" }}>{dropdownLabel}</p>
                  : currentChartData.length < 2
                    ? <p style={{ color: "#444", textAlign: "center", padding: "30px 0" }}>この期間のデータが少なすぎます</p>
                    : <>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
                          {currentMembers.map(m => (
                            <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                              <div style={{ width: 10, height: 10, borderRadius: "50%", background: m.color }} />
                              <span style={{ fontSize: 12, color: "#aaa" }}>{m.name}</span>
                            </div>
                          ))}
                        </div>
                        <Card style={{ padding: "16px 8px" }}>
                          <ResponsiveContainer width="100%" height={240}>
                            <LineChart data={currentChartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                              <XAxis dataKey="game" tick={{ fill: "#555", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "#1c1c35" }} />
                              <YAxis tick={{ fill: "#555", fontSize: 11 }} tickLine={false} axisLine={false} />
                              <Tooltip content={<CustomTooltip />} />
                              <ReferenceLine y={0} stroke="#2a2a4a" strokeDasharray="4 4" />
                              {currentMembers.map(m => (
                                <Line key={m.id} type="monotone" dataKey={m.id} name={m.name}
                                  stroke={m.color} strokeWidth={2}
                                  dot={{ fill: m.color, r: 3 }} activeDot={{ r: 5 }} />
                              ))}
                            </LineChart>
                          </ResponsiveContainer>
                        </Card>

                        <SectionTitle>対局スコア</SectionTitle>
                        {Object.entries(
                          filteredGames.reduce((acc, g) => { if (!acc[g.date]) acc[g.date] = []; acc[g.date].push(g); return acc; }, {})
                        ).sort(([a],[b]) => toDate(b) - toDate(a)).map(([date, dayGames]) => {
                          const ds = {};
                          members.forEach(m => { ds[m.id] = 0; });
                          dayGames.forEach(g => g.result.forEach(r => { if (ds[r.memberId] !== undefined) ds[r.memberId] += r.score; }));
                          const active = members.filter(m => dayGames.some(g => g.result.find(r => r.memberId === m.id)));
                          return (
                            <Card key={date}>
                              <div style={{ fontSize: 11, color: "#666", marginBottom: 8 }}>{date}（{dayGames.length}件）</div>
                              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                                {active.sort((a,b) => ds[b.id] - ds[a.id]).map(m => (
                                  <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                    <Avatar name={m.name} color={m.color} size={22} />
                                    <ScoreBadge value={ds[m.id]} size={13} />
                                  </div>
                                ))}
                              </div>
                            </Card>
                          );
                        })}
                      </>
                }
              </>
            );
          })()}
        </div>
      )}

            {/* ── 相手別 ── */}
      {subTab === "h2h" && (
        <div>
          <SectionTitle>プレイヤーを選択</SectionTitle>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
            {activeMembers.map(m => (
              <button key={m.id} onClick={() => setFocusMember(m.id)} style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "8px 14px", borderRadius: 24,
                border: `2px solid ${focusMember === m.id ? m.color : "#1c1c35"}`,
                background: focusMember === m.id ? m.color + "22" : "transparent",
                color: focusMember === m.id ? m.color : "#888",
                cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600,
                transition: "all 0.15s",
              }}>
                <Avatar name={m.name} color={m.color} size={24} />
                {m.name}
              </button>
            ))}
          </div>

          {focusMember && h2hData && (() => {
            const me = members.find(m => m.id === focusMember);
            const meStats = stats.find(s => s.id === focusMember);
            return (
              <>
                <Card style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, borderColor: me?.color + "44" }}>
                  <Avatar name={me?.name || ""} color={me?.color || "#888"} size={42} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: 16 }}>{me?.name}</div>
                    <div style={{ fontSize: 12, color: "#666" }}>
                      {meStats?.games || 0}戦　1位率:{meStats?.games ? Math.round((meStats.ranks[0]||0)/meStats.games*100) : 0}%
                    </div>
                  </div>
                  <ScoreBadge value={meStats?.total || 0} size={20} />
                </Card>
                <SectionTitle>同卓時の成績</SectionTitle>
                {h2hData.filter(o => o.togetherGames > 0).length === 0
                  ? <p style={{ color: "#444", textAlign: "center", padding: "20px 0" }}>同卓データがありません</p>
                  : h2hData.filter(o => o.togetherGames > 0).map(opp => {
                    const winRate = Math.round(opp.wins / opp.togetherGames * 100);
                    return (
                      <Card key={opp.id}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <Avatar name={opp.name} color={opp.color} />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700, marginBottom: 2 }}>{opp.name}</div>
                            <div style={{ fontSize: 11, color: "#555" }}>同卓: {opp.togetherGames}回</div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 10, color: "#555", marginBottom: 2 }}>同卓時スコア</div>
                            <ScoreBadge value={opp.totalScore} size={15} />
                          </div>
                        </div>
                        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #1c1c35", display: "flex", gap: 20 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 10, color: "#555", marginBottom: 4 }}>上位率（vs {opp.name}）</div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div style={{ flex: 1, height: 6, borderRadius: 3, background: "#1c1c35", overflow: "hidden" }}>
                                <div style={{ width: `${winRate}%`, height: "100%", borderRadius: 3, transition: "width 0.5s", background: winRate >= 50 ? "#34c988" : "#e85d5d" }} />
                              </div>
                              <span style={{ fontSize: 12, fontWeight: 700, color: winRate >= 50 ? "#34c988" : "#e85d5d" }}>{winRate}%</span>
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: 10, color: "#555", marginBottom: 4 }}>スコア差（自分−相手）</div>
                            <ScoreBadge value={Math.round(opp.vsScore * 10) / 10} size={14} />
                          </div>
                        </div>
                      </Card>
                    );
                  })
                }
              </>
            );
          })()}
          {!focusMember && <p style={{ color: "#444", textAlign: "center", padding: "40px 0" }}>プレイヤーを選んでください</p>}
        </div>
      )}
    </div>
  );
}

// ============================================================
// App Root
// ============================================================
export default function App() {
  const [tab, setTab] = useState("record");
  const [members, setMembers] = useState(DEFAULT_MEMBERS);
  const [games, setGames] = useState([]);
  const [session, setSession] = useState(null);
  const [rules, setRules] = useState({ tobi: true, yakitori: true });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    (async () => {
      const data = await loadData();
      if (data) {
        if (data.members?.length) setMembers(data.members);
        if (data.games) setGames(data.games);
        if (data.session) setSession(data.session);
      }
      setLoading(false);
    })();
  }, []);

  const membersRef = useRef(members);
  const gamesRef = useRef(games);
  const sessionRef = useRef(session);
  useEffect(() => { membersRef.current = members; }, [members]);
  useEffect(() => { gamesRef.current = games; }, [games]);
  useEffect(() => { sessionRef.current = session; }, [session]);

  const handleSave = useCallback(async (newMembers, newGames, newSession) => {
    setSyncing(true);
    await saveData({
      members: newMembers ?? membersRef.current,
      games: newGames ?? gamesRef.current,
      session: newSession !== undefined ? newSession : sessionRef.current,
    });
    setSyncing(false);
  }, []);

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#070712", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: "#555", fontSize: 14 }}>読み込み中…</div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#070712", fontFamily: "'Zen Kaku Gothic New','Noto Sans JP',sans-serif", color: "#e0e0e0" }}>
      <link href="https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@400;700;900&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ padding: "18px 20px 12px", borderBottom: "1px solid #141428", background: "#080816" }}>
        <div style={{ maxWidth: 480, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 22 }}>🀄</span>
              <h1 style={{ margin: 0, fontSize: 18, fontWeight: 900, letterSpacing: 2 }}>麻雀スコア帳</h1>
            </div>
            <p style={{ margin: "3px 0 0", fontSize: 10, color: "#444" }}>
              3人麻雀 ｜ 35000持ち・40000返し ｜ ウマ15-5-20 ｜ オカあり
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {session && (
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#34c988", display: "inline-block", boxShadow: "0 0 5px #34c988" }} />
                <span style={{ fontSize: 11, color: "#34c988" }}>{session.gameCount}局</span>
              </div>
            )}
            {syncing && <span style={{ fontSize: 11, color: "#555" }}>保存中…</span>}
          </div>
        </div>
      </div>

      {/* Nav */}
      <div style={{ borderBottom: "1px solid #141428", background: "#080816" }}>
        <div style={{ maxWidth: 480, margin: "0 auto", display: "flex", padding: "0 16px" }}>
          {[
            { key: "record",  label: session ? "📝 記録中" : "📝 記録" },
            { key: "stats",   label: "📊 成績" },
            { key: "members", label: "👥 メンバー" },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              flex: 1, padding: "12px 4px", border: "none",
              borderBottom: `2px solid ${tab === t.key ? "#e85d5d" : "transparent"}`,
              background: "transparent",
              color: tab === t.key ? "#fff" : "#555",
              fontWeight: tab === t.key ? 700 : 400,
              fontSize: 13, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s",
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "20px 16px 80px" }}>
        {tab === "members" && <MembersTab members={members} setMembers={setMembers} onSave={handleSave} />}
        {tab === "record"  && (
          <RecordTab
            members={members}
            session={session} setSession={setSession}
            games={games} setGames={setGames}
            onSave={handleSave}
            rules={rules} setRules={setRules}
          />
        )}
        {tab === "stats"   && <StatsTab members={members} games={games} setGames={setGames} onSave={handleSave} />}
      </div>
    </div>
  );
}
