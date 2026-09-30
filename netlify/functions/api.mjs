import { getStore } from "@netlify/blobs";

const seed = () => ({
  currentRound: { id: "round_1", title: "قد التحدي لشهر سبتمبر 2026", startDate: new Date().toISOString().split("T")[0], endDate: "" },
  users: [
    { id: "u_admin", username: "admin", password: "admin123", fullName: "المدير العام", role: "admin" },
    { id: "u_user1", username: "user1", password: "123", fullName: "أحمد علي", role: "member" },
  ],
  programs: [
    { id: "p_1", name: "أداء الصلاة", frequency: "يومي", points: { onTime: 10, late: 5, notDone: -5 } },
    { id: "p_2", name: "قراءة القرآن", frequency: "يومي", points: { onTime: 10, late: 5, notDone: 0 } },
    { id: "p_3", name: "أداء الواجبات المدرسية", frequency: "يومي", points: { onTime: 15, late: 5, notDone: -10 } },
    { id: "p_4", name: "المراجعة اليومية", frequency: "يومي", points: { onTime: 10, late: 5, notDone: -5 } },
  ],
  evaluations: [],
  archives: [],
});

const dec = (v) => { try { return decodeURIComponent(v || ""); } catch { return ""; } };

async function handle(req) {
  const store = getStore({ name: "challenge", consistency: "strong" });
  const route = new URL(req.url).pathname.replace(/^\/api\/?/, "");
  const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });

  let state = await store.get("state", { type: "json" });
  if (!state) { state = { version: 1, data: seed() }; await store.setJSON("state", state); }

  let creds, body = null;
  if (req.method === "POST") body = await req.json().catch(() => ({}));
  if (route === "login") creds = body || {};
  else creds = { username: dec(req.headers.get("x-user")), password: dec(req.headers.get("x-pass")) };

  const user = state.data.users.find((u) => u.username === creds.username && u.password === creds.password);
  if (!user) return json({ error: "auth" }, 401);
  const { password, ...safeUser } = user;
  const view = () => ({
    version: state.version,
    data: user.role === "admin" ? state.data : { ...state.data, users: state.data.users.map(({ password, ...u }) => u) },
  });

  if (route === "login") return json({ user: safeUser, ...view() });

  if (route === "data" && req.method === "GET") {
    if (new URL(req.url).searchParams.get("v") === String(state.version)) return json({ unchanged: true });
    return json(view());
  }

  if (route === "save" && req.method === "POST") {
    if (user.role !== "admin") return json({ error: "forbidden" }, 403);
    if (body.baseVersion !== state.version) return json({ conflict: true, ...view() }, 409);
    const d = body.data;
    if (!d || !Array.isArray(d.users) || !d.users.some((u) => u.role === "admin")) return json({ error: "invalid" }, 400);
    state = { version: state.version + 1, data: d };
    await store.setJSON("state", state);
    return json({ version: state.version });
  }
  return json({ error: "not found" }, 404);
}

export default async (req) => {
  try { return await handle(req); }
  catch (e) {
    return new Response(JSON.stringify({ error: "server", message: String((e && e.message) || e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
};

export const config = { path: "/api/*" };
